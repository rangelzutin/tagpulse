import { TagPlusHttpError, type TagPlusClient } from "../../integrations/tagplus/tagplus-client.js";
import type { FinancialRecordRepository } from "./financial-record-repository.js";

export interface CatalogScanResult {
  pages: number;
  idsFetched: number;
  uniqueIds: number;
  duplicateIds: number;
  newlyDiscovered: number;
  alreadyKnown: number;
  unobservedMarked: number;
  firstSourceId: string | null;
  lastSourceId: string | null;
  elapsedMs: number;
  completed: boolean;
}

export interface FinancialCatalogServiceOptions {
  perPage?: number;
  pageDelayMs?: number;
  onPageProgress?: (progress: {
    page: number;
    pageCount: number;
    totalIdsSoFar: number;
    uniqueIdsSoFar: number;
  }) => void;
}

export interface FinancialCatalogService {
  scanCatalog(
    connectionId: string,
    client: TagPlusClient,
    options?: FinancialCatalogServiceOptions,
  ): Promise<CatalogScanResult>;
}

export function createFinancialCatalogService(
  repository: FinancialRecordRepository,
): FinancialCatalogService {
  return {
    async scanCatalog(
      connectionId: string,
      client: TagPlusClient,
      options: FinancialCatalogServiceOptions = {},
    ): Promise<CatalogScanResult> {
      const startTime = performance.now();
      const perPage = options.perPage ?? 100;
      const pageDelayMs = options.pageDelayMs ?? 2150; // conservative ~28 req/min

      let page = 1;
      let idsFetched = 0;
      let newlyDiscoveredTotal = 0;
      let alreadyKnownTotal = 0;
      let firstSourceId: string | null = null;
      let lastSourceId: string | null = null;

      const observedIds = new Set<string>();
      let duplicateIdsCount = 0;
      const catalogTimestamp = new Date();

      while (true) {
        const path = `/financeiros?page=${page}&per_page=${perPage}`;
        let items: Array<{ id: number | string }> = [];
        let fetchedPage = false;
        let attempt429 = 0;
        const max429 = 5;

        while (!fetchedPage) {
          try {
            const response = await client.get<Array<{ id: number | string }>>(path);
            items = Array.isArray(response.data) ? response.data : [];
            fetchedPage = true;
          } catch (err: unknown) {
            if (err instanceof TagPlusHttpError && err.status === 429) {
              attempt429++;
              if (attempt429 <= max429) {
                let waitMs = 30_000 * Math.pow(2, attempt429 - 1);
                const retryAfterHeader = err.headers?.get("retry-after");
                if (retryAfterHeader) {
                  const s = Number.parseInt(retryAfterHeader, 10);
                  if (!Number.isNaN(s) && s > 0) waitMs = s * 1000;
                }
                console.log(`\n  [CATALOG 429] Rate limited on page ${page}. Waiting ${(waitMs / 1000).toFixed(0)}s (attempt ${attempt429}/${max429})...`);
                await new Promise((resolve) => setTimeout(resolve, waitMs));
                continue;
              }
            }
            throw err;
          }
        }

        // Critical TagPlus rule: ONLY stop when explicitly empty []
        if (items.length === 0) {
          break;
        }

        const pageIds: string[] = [];
        for (const item of items) {
          if (item && item.id != null) {
            const strId = String(item.id).trim();
            pageIds.push(strId);
            if (firstSourceId === null) {
              firstSourceId = strId;
            }
            lastSourceId = strId;

            if (observedIds.has(strId)) {
              duplicateIdsCount++;
            } else {
              observedIds.add(strId);
            }
          }
        }

        idsFetched += pageIds.length;

        // Upsert this page of IDs into sync items
        const upsertRes = await repository.upsertCatalogItems(
          connectionId,
          pageIds,
          catalogTimestamp,
        );
        newlyDiscoveredTotal += upsertRes.newlyDiscovered;
        alreadyKnownTotal += upsertRes.alreadyKnown;

        if (options.onPageProgress) {
          options.onPageProgress({
            page,
            pageCount: pageIds.length,
            totalIdsSoFar: idsFetched,
            uniqueIdsSoFar: observedIds.size,
          });
        }

        if (pageDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, pageDelayMs));
        }

        page++;
      }

      // Reconcile unobserved records ONLY after full completed scan
      const unobservedMarked = await repository.markUnobservedFinancialRecords(
        connectionId,
        observedIds,
        catalogTimestamp,
      );

      const elapsedMs = Math.round(performance.now() - startTime);

      return {
        pages: page - 1,
        idsFetched,
        uniqueIds: observedIds.size,
        duplicateIds: duplicateIdsCount,
        newlyDiscovered: newlyDiscoveredTotal,
        alreadyKnown: alreadyKnownTotal,
        unobservedMarked,
        firstSourceId,
        lastSourceId,
        elapsedMs,
        completed: true,
      };
    },
  };
}
