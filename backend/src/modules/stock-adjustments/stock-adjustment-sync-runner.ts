import type { PrismaClient } from "@prisma/client";
import type { TagPlusClient } from "../../integrations/tagplus/tagplus-client.js";
import {
  createStockAdjustmentRepository,
  type StockAdjustmentRepository,
} from "./stock-adjustment-repository.js";
import {
  createStockAdjustmentWorker,
  type StockAdjustmentWorkerOptions,
  type StockAdjustmentWorkerSummary,
} from "./stock-adjustment-worker.js";

export interface CatalogScanResult {
  totalDiscovered: number;
  newlyDiscovered: number;
  alreadyKnown: number;
  pagesFetched: number;
  sourceIds: string[];
  elapsedMs: number;
}

export interface FullSyncResult {
  catalog: CatalogScanResult;
  backfill: StockAdjustmentWorkerSummary;
  unobservedReconciled: number;
  elapsedMs: number;
}

export interface StockAdjustmentSyncRunnerDeps {
  prisma: PrismaClient;
  repository?: StockAdjustmentRepository | undefined;
  getClient: () => TagPlusClient;
  updateClientToken?: ((newToken: string) => void) | undefined;
  refreshToken?: (() => Promise<string | null>) | undefined;
}

export interface StockAdjustmentSyncRunner {
  scanCatalog(
    connectionId: string,
    options?: {
      onPageFetched?: ((page: number, count: number, totalSoFar: number) => void) | undefined;
    } | undefined,
  ): Promise<CatalogScanResult>;

  runBackfill(
    connectionId: string,
    options?: StockAdjustmentWorkerOptions | undefined,
  ): Promise<StockAdjustmentWorkerSummary>;

  runFullSync(
    connectionId: string,
    options?: {
      workerOptions?: StockAdjustmentWorkerOptions | undefined;
      onPageFetched?: ((page: number, count: number, totalSoFar: number) => void) | undefined;
    } | undefined,
  ): Promise<FullSyncResult>;
}

export function createStockAdjustmentSyncRunner(
  deps: StockAdjustmentSyncRunnerDeps,
): StockAdjustmentSyncRunner {
  const repository = deps.repository ?? createStockAdjustmentRepository(deps.prisma);
  const worker = createStockAdjustmentWorker({
    prisma: deps.prisma,
    repository,
    getClient: deps.getClient,
    updateClientToken: deps.updateClientToken,
    refreshToken: deps.refreshToken,
  });

  return {
    async scanCatalog(
      connectionId: string,
      options = {},
    ): Promise<CatalogScanResult> {
      const startTime = performance.now();
      const client = deps.getClient();

      let page = 1;
      let totalDiscovered = 0;
      let newlyDiscovered = 0;
      let alreadyKnown = 0;
      const allSourceIds: string[] = [];
      const catalogSeenAt = new Date();

      while (true) {
        const response = await client.get<Array<{ id?: number | string | undefined }>>(`/ajustes_estoque?page=${page}&per_page=100`);
        const items = response.data;

        // Terminal condition: strictly empty array []
        if (!Array.isArray(items) || items.length === 0) {
          break;
        }

        const pageSourceIds = items
          .filter((it) => it && it.id != null)
          .map((it) => String(it.id));

        if (pageSourceIds.length > 0) {
          allSourceIds.push(...pageSourceIds);
          totalDiscovered += pageSourceIds.length;

          const upsertRes = await repository.upsertCatalogItems(
            connectionId,
            pageSourceIds,
            catalogSeenAt,
          );

          newlyDiscovered += upsertRes.newlyDiscovered;
          alreadyKnown += upsertRes.alreadyKnown;

          if (options.onPageFetched) {
            options.onPageFetched(page, pageSourceIds.length, totalDiscovered);
          }
        }

        // Even if page returned < 100, do not terminate early! Advance page until []
        page++;
      }

      return {
        totalDiscovered,
        newlyDiscovered,
        alreadyKnown,
        pagesFetched: page - 1,
        sourceIds: allSourceIds,
        elapsedMs: Math.round(performance.now() - startTime),
      };
    },

    async runBackfill(
      connectionId: string,
      options?: StockAdjustmentWorkerOptions,
    ): Promise<StockAdjustmentWorkerSummary> {
      return worker.processQueue(connectionId, options);
    },

    async runFullSync(
      connectionId: string,
      options = {},
    ): Promise<FullSyncResult> {
      const startTime = performance.now();
      const catalogStartTime = new Date();

      // Step 1: Full catalog scan
      const catalog = await this.scanCatalog(connectionId, {
        onPageFetched: options.onPageFetched,
      });

      // Step 2: Detail backfill
      const backfill = await this.runBackfill(connectionId, options.workerOptions);

      // Step 3: Global presence reconciliation
      // Only unobserve if full catalog ran and backfill completed with 0 critical failures
      let unobservedReconciled = 0;
      if (catalog.pagesFetched > 0 && backfill.failed === 0) {
        unobservedReconciled = await repository.reconcileGlobalPresence(
          connectionId,
          catalogStartTime,
        );
      }

      return {
        catalog,
        backfill,
        unobservedReconciled,
        elapsedMs: Math.round(performance.now() - startTime),
      };
    },
  };
}
