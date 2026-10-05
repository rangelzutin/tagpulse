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

import { parseTagPlusCivilDate } from "../../integrations/tagplus/stock-adjustments/stock-adjustment-normalizer.js";
import type { FinancialRecordRepository } from "../financial/financial-record-repository.js";

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

export interface LightweightSyncOptions {
  recentDays?: number | undefined; // default 30 days
  aeMovementNumbers?: string[] | undefined; // e.g. ["AE - 684", "AE 684"]
  rateLimitDelayMs?: number | undefined;
  now?: Date | undefined;
  onPageFetched?: ((page: number, count: number, totalSoFar: number) => void) | undefined;
}

export interface LightweightSyncResult {
  catalogDiscovered: number;
  newlyDiscoveredCount: number;
  recentEligibleCount: number;
  aeMovementMatchedCount: number;
  candidateIds: string[];
  workerSummary: StockAdjustmentWorkerSummary;
  elapsedMs: number;
}

export function extractAeNumber(raw: string): string | null {
  if (!raw) return null;
  const match = /\bAE\s*[-–—]?\s*(\d+)\b/i.exec(raw.trim());
  return match?.[1] ?? null;
}

export interface StockAdjustmentSyncRunnerDeps {
  prisma: PrismaClient;
  repository?: StockAdjustmentRepository | undefined;
  financialRecordRepository?: FinancialRecordRepository | undefined;
  worker?: ReturnType<typeof createStockAdjustmentWorker> | undefined;
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

  runLightweightSync(
    connectionId: string,
    options?: LightweightSyncOptions | undefined,
  ): Promise<LightweightSyncResult>;
}

export function createStockAdjustmentSyncRunner(
  deps: StockAdjustmentSyncRunnerDeps,
): StockAdjustmentSyncRunner {
  const repository = deps.repository ?? createStockAdjustmentRepository(deps.prisma);
  const worker =
    deps.worker ??
    createStockAdjustmentWorker({
      prisma: deps.prisma,
      repository,
      getClient: deps.getClient,
      updateClientToken: deps.updateClientToken,
      refreshToken: deps.refreshToken,
      financialRecordRepository: deps.financialRecordRepository,
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

    async runLightweightSync(
      connectionId: string,
      options: LightweightSyncOptions = {},
    ): Promise<LightweightSyncResult> {
      const startTime = performance.now();
      const now = options.now ?? new Date();
      const recentDays = options.recentDays ?? 30;
      const recentThreshold = new Date(now.getTime() - recentDays * 24 * 60 * 60 * 1000);
      const rateLimitDelayMs = options.rateLimitDelayMs ?? 1200;

      // Extrair números de ajustes sinalizados por movimentos AE do financeiro
      const aeNumbers = new Set<string>();
      if (options.aeMovementNumbers) {
        for (const mov of options.aeMovementNumbers) {
          const num = extractAeNumber(mov);
          if (num) aeNumbers.add(num);
        }
      }

      const client = deps.getClient();
      let page = 1;
      let totalDiscovered = 0;
      let newlyDiscovered = 0;
      let recentEligibleCount = 0;
      let aeMovementMatchedCount = 0;
      const candidateIds = new Set<string>();
      const catalogSeenAt = new Date();

      while (true) {
        const response = await client.get<
          Array<{
            id?: number | string | undefined;
            numero?: number | string | undefined;
            data_criacao?: unknown;
            data_confirmacao?: unknown;
          }>
        >(`/ajustes_estoque?page=${page}&per_page=100`);
        const items = response.data;

        if (!Array.isArray(items) || items.length === 0) {
          break;
        }

        const pageSourceIds: string[] = [];

        for (const raw of items) {
          if (!raw || raw.id == null) continue;
          const sourceId = String(raw.id);
          pageSourceIds.push(sourceId);

          const rawNumber = raw.numero != null ? String(raw.numero).trim() : null;
          const dataCriacao = parseTagPlusCivilDate(raw.data_criacao);
          const dataConfirmacao = parseTagPlusCivilDate(raw.data_confirmacao);

          // 1. Elegibilidade por data recente (data_criacao ou data_confirmacao nos últimos N dias)
          const isRecent =
            (dataCriacao !== null && dataCriacao >= recentThreshold) ||
            (dataConfirmacao !== null && dataConfirmacao >= recentThreshold);
          if (isRecent) {
            candidateIds.add(sourceId);
            recentEligibleCount++;
          }

          // 2. Elegibilidade por número sinalizado por movimento AE
          if (rawNumber && aeNumbers.has(rawNumber)) {
            candidateIds.add(sourceId);
            aeMovementMatchedCount++;
          }
        }

        if (pageSourceIds.length > 0) {
          totalDiscovered += pageSourceIds.length;
          const upsertRes = await repository.upsertCatalogItems(
            connectionId,
            pageSourceIds,
            catalogSeenAt,
          );
          newlyDiscovered += upsertRes.newlyDiscovered;

          if (options.onPageFetched) {
            options.onPageFetched(page, pageSourceIds.length, totalDiscovered);
          }
        }

        page++;
      }

      // 3. Buscar no banco local quaisquer ajustes já conhecidos com número sinalizado por movimento AE
      if (aeNumbers.size > 0 && deps.prisma?.stockAdjustment) {
        const localMatches = await deps.prisma.stockAdjustment.findMany({
          where: {
            connectionId,
            number: { in: Array.from(aeNumbers) },
          },
          select: { sourceId: true },
        });
        for (const m of localMatches) {
          if (m.sourceId) {
            candidateIds.add(m.sourceId);
            aeMovementMatchedCount++;
          }
        }
      }

      // 4. Adicionar também quaisquer itens que já estejam com status PENDING no banco
      const pendingSyncItems = await deps.prisma.stockAdjustmentSyncItem?.findMany({
        where: { connectionId, status: "PENDING" },
        select: { sourceId: true },
      }) ?? [];
      for (const p of pendingSyncItems) {
        candidateIds.add(p.sourceId);
      }

      const candidateIdList = Array.from(candidateIds);

      // Processar candidatos (apenas a fração identificada, mantendo o scan leve)
      let workerSummary: StockAdjustmentWorkerSummary;
      if (candidateIdList.length > 0) {
        workerSummary = await worker.processQueue(connectionId, {
          candidateSourceIds: candidateIdList,
          rateLimitDelayMs,
        });

        if (workerSummary.failed > 0) {
          throw new Error(
            `STOCK_ADJUSTMENT_SUBSTEP_FAILED: ${workerSummary.failed} ajuste(s) falharam na reconciliação/vínculo financeiro`,
          );
        }
      } else {
        workerSummary = {
          processed: 0,
          completed: 0,
          failed: 0,
          notFound: 0,
          elapsedMs: 0,
          inserted: 0,
          updated: 0,
          unchanged: 0,
          jitResolvedCount: 0,
        };
      }

      return {
        catalogDiscovered: totalDiscovered,
        newlyDiscoveredCount: newlyDiscovered,
        recentEligibleCount,
        aeMovementMatchedCount,
        candidateIds: candidateIdList,
        workerSummary,
        elapsedMs: Math.round(performance.now() - startTime),
      };
    },
  };
}
