import type { PrismaClient, TagPlusSyncMode } from "@prisma/client";
import type { TagPlusOAuthTokenStore } from "../../integrations/tagplus/oauth-token-store.js";
import {
  createTagPlusClient,
  type TagPlusClient,
} from "../../integrations/tagplus/tagplus-client.js";
import { refreshAccessToken } from "../../integrations/tagplus/oauth.js";
import {
  createFinancialRecordRepository,
  type FinancialRecordRepository,
} from "./financial-record-repository.js";
import {
  createFinancialRecordWorker,
  type FinancialRecordWorker,
} from "./financial-record-worker.js";
import {
  runIncrementalSync,
  type RunIncrementalSyncOptions,
} from "./financial-incremental-sync.js";
import {
  createStockAdjustmentSyncRunner,
  type StockAdjustmentSyncRunner,
} from "../stock-adjustments/stock-adjustment-sync-runner.js";

/**
 * CONTRATO DA SINCRONIZAÇÃO NORMAL VS RECONCILIAÇÃO HISTÓRICA:
 *
 * NORMAL_SYNC (produção diária):
 * - Financeiro: janela incremental (30 dias padrão) + títulos abertos + confirmados sem data.
 * - Stock Adjustments: scan leve (~7 páginas) de presença + detalhe apenas de IDs novos,
 *   ajustes com data recente (30 dias) e ajustes sinalizados por movimentos AE do financeiro.
 * - Auto-resolução JIT: se um ajuste referenciar um FinancialRecord histórico não conhecido,
 *   o registro é buscado e persistido pontualmente (GET /financeiros/{id}) sem full scan.
 * - Limite conhecido: NÃO descobre alterações históricas invisíveis à listagem cuja data
 *   financeira original e movimento não façam parte da janela incremental.
 *
 * HISTORICAL_RECONCILIATION (manutenção / auditoria):
 * - Execução sob demanda isolada (Full Financial Catalog de 10.000+ registros + Full Detail de 678+ ajustes).
 * - Fora do fluxo normal do botão "Sincronizar Dados".
 */

export interface FinancialIncrementalSummary {
  sinceDate: string;
  lookbackDays?: number | undefined;
  candidates: {
    recentCount: number;
    openCount: number;
    undatedCount: number;
    uniqueCount: number;
    overlapDeduplicated: number;
  };
  processed: number;
  completed: number;
  failed: number;
  inserted: number;
  updated: number;
  unchanged: number;
  aeMovementNumbersFound: string[];
}

export interface StockAdjustmentsSummary {
  catalogDiscovered: number;
  newlyDiscoveredCount: number;
  recentEligibleCount: number;
  aeMovementMatchedCount: number;
  candidateCount: number;
  processed: number;
  completed: number;
  failed: number;
  inserted: number;
  updated: number;
  unchanged: number;
  jitResolvedCount: number;
}

export interface FinancialStageResult {
  incremental: FinancialIncrementalSummary;
  stockAdjustments: StockAdjustmentsSummary;
  elapsedMs: number;
}

export interface FinancialRunnerProgress {
  current: number;
  total: number;
  substep: string;
  label: string;
  summary?: Record<string, unknown>;
}

export interface FinancialRunnerLike {
  run(
    connectionId: string,
    options?: {
      mode?: TagPlusSyncMode | undefined;
      window?: { since: string; until: string } | undefined;
      lookbackDays?: number | undefined;
      since?: string | undefined;
      onProgress?: ((progress: FinancialRunnerProgress) => void) | undefined;
    },
  ): Promise<FinancialStageResult>;
}

/**
 * Normaliza uma data explícita para o formato 'YYYY-MM-DD' respeitando o fuso 'America/Sao_Paulo'.
 * - Se já estiver em 'YYYY-MM-DD', preserva a data civil.
 * - Se contiver hora no formato local 'YYYY-MM-DD HH:mm:ss', extrai 'YYYY-MM-DD'.
 * - Se for ISO string ou com timezone, formata a data civil correspondente em 'America/Sao_Paulo'.
 * - Se for string arbitrária inválida, mantém a string original para que a validação estrita
 *   de 'resolveSinceDate' dispare a rejeição esperada.
 */
export function normalizeExplicitSinceDate(since?: string): string | undefined {
  if (!since) return undefined;
  const trimmed = since.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const localMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}:\d{2}$/);
  if (localMatch) {
    return localMatch[1];
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(parsed);
  }
  return trimmed;
}

export interface ProductionFinancialSyncRunnerDependencies {
  prisma: PrismaClient;
  tokenStore?: TagPlusOAuthTokenStore | undefined;
  financialRepository?: FinancialRecordRepository | undefined;
  financialWorker?: FinancialRecordWorker | undefined;
  stockAdjustmentRunner?: StockAdjustmentSyncRunner | undefined;
  getClient?: (() => TagPlusClient) | undefined;
  updateClientToken?: ((newToken: string) => void) | undefined;
  refreshToken?: (() => Promise<string | null>) | undefined;
  runIncrementalSyncFn?: ((options: RunIncrementalSyncOptions) => ReturnType<typeof runIncrementalSync>) | undefined;
  env?: {
    baseUrl?: string | undefined;
    clientId?: string | undefined;
    clientSecret?: string | undefined;
    accessToken?: string | undefined;
  } | undefined;
}

export function createProductionFinancialSyncRunner(
  deps: ProductionFinancialSyncRunnerDependencies,
): FinancialRunnerLike {
  const financialRepo =
    deps.financialRepository ?? createFinancialRecordRepository(deps.prisma);

  return {
    async run(connectionId: string, options = {}): Promise<FinancialStageResult> {
      const startTime = performance.now();

      // 1. Resolver conexão
      const connection = await deps.prisma.tagPlusConnection.findUnique({
        where: { id: connectionId },
        select: { id: true, apiVersion: true },
      });
      if (!connection) {
        throw new Error(`TAGPLUS_CONNECTION_NOT_FOUND: ${connectionId}`);
      }

      // 2. Resolver cliente HTTP TagPlus
      const tokenStore = deps.tokenStore;
      const env = deps.env ?? {};
      let accessToken =
        tokenStore?.get()?.accessToken || env.accessToken || process.env.TAGPLUS_ACCESS_TOKEN;

      let client =
        deps.getClient?.() ??
        createTagPlusClient({
          baseUrl: env.baseUrl ?? process.env.TAGPLUS_BASE_URL ?? "https://api.tagplus.com.br",
          apiVersion: connection.apiVersion,
          accessToken: accessToken ?? "",
        });

      const getClient = () => (deps.getClient ? deps.getClient() : client);

      const updateClientToken = (newToken: string) => {
        if (deps.updateClientToken) {
          deps.updateClientToken(newToken);
        } else {
          accessToken = newToken;
          client = createTagPlusClient({
            baseUrl: env.baseUrl ?? process.env.TAGPLUS_BASE_URL ?? "https://api.tagplus.com.br",
            apiVersion: connection.apiVersion,
            accessToken: newToken,
          });
        }
      };

      const refreshTokenHandler =
        deps.refreshToken ??
        (async (): Promise<string | null> => {
          if (!tokenStore) return null;
          const tokens = tokenStore.get();
          if (!tokens?.refreshToken) return null;
          try {
            const refreshed = await refreshAccessToken(
              {
                baseUrl: env.baseUrl ?? process.env.TAGPLUS_BASE_URL ?? "https://api.tagplus.com.br",
                clientId: env.clientId ?? process.env.TAGPLUS_CLIENT_ID ?? "",
                clientSecret: env.clientSecret ?? process.env.TAGPLUS_CLIENT_SECRET ?? "",
              },
              tokens.refreshToken,
            );
            tokenStore.set(refreshed);
            return refreshed.accessToken;
          } catch {
            return null;
          }
        });

      // 3. Resolver workers e runners
      const financialWorker =
        deps.financialWorker ??
        createFinancialRecordWorker({
          prisma: deps.prisma,
          repository: financialRepo,
          getClient,
          updateClientToken,
          refreshToken: refreshTokenHandler,
        });

      const stockRunner =
        deps.stockAdjustmentRunner ??
        createStockAdjustmentSyncRunner({
          prisma: deps.prisma,
          financialRecordRepository: financialRepo,
          getClient,
          updateClientToken,
          refreshToken: refreshTokenHandler,
        });

      // ==============================================================
      // SUBPASSO A: FINANCEIRO INCREMENTAL
      // ==============================================================
      // A regra de negócio aprovada para o Financeiro Incremental é:
      // janela recente de 30 dias (lookbackDays) + títulos em aberto + confirmados sem data definida.
      // O Financeiro NÃO deve herdar indevidamente a janela comercial reduzida do orquestrador global (options.window).
      // Reutiliza o cálculo padrão do sincronizador financeiro (lookbackDays: 30 em America/Sao_Paulo).
      // Se options.since for fornecido explicitamente para o financeiro, este é respeitado
      // (normalizado para YYYY-MM-DD em America/Sao_Paulo).
      const resolvedSince = options.since
        ? normalizeExplicitSinceDate(options.since)
        : undefined;

      let discoveredCandidateIds: string[] = [];
      let incrementalInserted = 0;
      let incrementalUpdated = 0;
      let incrementalUnchanged = 0;

      const runSync = deps.runIncrementalSyncFn ?? runIncrementalSync;
      const incrementalReport = await runSync({
        prisma: deps.prisma,
        repository: financialRepo,
        worker: financialWorker,
        getClient,
        connectionId: connection.id,
        lookbackDays: options.lookbackDays ?? 30,
        since: resolvedSince,
        refreshToken: refreshTokenHandler,
        updateClientToken,
        onCandidatesDiscovered: (c) => {
          discoveredCandidateIds = c.uniqueCandidates;
          options.onProgress?.({
            current: 0,
            total: discoveredCandidateIds.length,
            substep: "Atualizando financeiro",
            label: "Atualizando financeiro",
            summary: {
              incremental: {
                processed: 0,
                completed: 0,
                failed: 0,
                inserted: 0,
                updated: 0,
                unchanged: 0,
                candidates: {
                  uniqueCount: discoveredCandidateIds.length,
                },
              },
            },
          });
        },
        onProgress: (wp) => {
          if (wp.recordAction === "inserted") incrementalInserted++;
          else if (wp.recordAction === "updated") incrementalUpdated++;
          else if (wp.recordAction === "unchanged") incrementalUnchanged++;

          const total =
            discoveredCandidateIds.length > 0
              ? discoveredCandidateIds.length
              : wp.processed;

          options.onProgress?.({
            current: wp.processed,
            total,
            substep: "Atualizando financeiro",
            label: "Atualizando financeiro",
            summary: {
              incremental: {
                processed: wp.processed,
                completed: wp.completed,
                failed: wp.failed,
                inserted: incrementalInserted,
                updated: incrementalUpdated,
                unchanged: incrementalUnchanged,
                candidates: {
                  uniqueCount: total,
                },
              },
            },
          });
        },
      });

      if (incrementalReport.workerSummary && incrementalReport.workerSummary.failed > 0) {
        throw new Error(
          `FINANCIAL_INCREMENTAL_FAILED: ${incrementalReport.workerSummary.failed} registro(s) falharam na sincronização financeira incremental`,
        );
      }

      // Identificar movimentos do tipo "AE" EXCLUSIVAMENTE entre os candidatos processados nesta rodada
      const candidateSourceIds =
        incrementalReport.candidateSourceIds ?? discoveredCandidateIds;

      const aeMovementNumbers: string[] = [];

      if (candidateSourceIds.length > 0 && incrementalReport.workerSummary) {
        const candidateRecords = await deps.prisma.financialRecord.findMany({
          where: {
            connectionId: connection.id,
            sourceId: { in: candidateSourceIds },
            linkedMovementNumber: { startsWith: "AE" },
          },
          select: { linkedMovementNumber: true },
        });

        const uniqueAeNumbers = new Set<string>();
        for (const r of candidateRecords) {
          if (r.linkedMovementNumber) {
            uniqueAeNumbers.add(r.linkedMovementNumber);
          }
        }
        aeMovementNumbers.push(...uniqueAeNumbers);
      }

      // ==============================================================
      // SUBPASSO B: STOCK ADJUSTMENTS LIGHTWEIGHT RECONCILIATION + JIT
      // ==============================================================
      options.onProgress?.({
        current: 0,
        total: 0,
        substep: "Reconciliando ajustes",
        label: "Reconciliando ajustes",
      });

      let adjustmentTotal = 0;
      const stockResult = await stockRunner.runLightweightSync(connection.id, {
        recentDays: options.lookbackDays ?? 30,
        aeMovementNumbers,
        onCandidatesDiscovered: (ids) => {
          adjustmentTotal = ids.length;
          options.onProgress?.({
            current: 0,
            total: adjustmentTotal,
            substep: "Reconciliando ajustes",
            label: "Reconciliando ajustes",
          });
        },
        onProgress: (p, total) => {
          options.onProgress?.({
            current: p.processed,
            total,
            substep: "Reconciliando ajustes",
            label: "Reconciliando ajustes",
          });
        },
      });

      if (stockResult.workerSummary.failed > 0) {
        throw new Error(
          `STOCK_ADJUSTMENT_SUBSTEP_FAILED: ${stockResult.workerSummary.failed} ajuste(s) falharam na reconciliação de estoque`,
        );
      }

      const totalElapsedMs = Math.round(performance.now() - startTime);

      return {
        incremental: {
          sinceDate: incrementalReport.sinceDate,
          lookbackDays: incrementalReport.lookbackDays,
          candidates: incrementalReport.candidates,
          processed: incrementalReport.workerSummary?.processed ?? 0,
          completed: incrementalReport.workerSummary?.completed ?? 0,
          failed: incrementalReport.workerSummary?.failed ?? 0,
          inserted: incrementalReport.workerSummary?.inserted ?? 0,
          updated: incrementalReport.workerSummary?.updated ?? 0,
          unchanged: incrementalReport.workerSummary?.unchanged ?? 0,
          aeMovementNumbersFound: aeMovementNumbers,
        },
        stockAdjustments: {
          catalogDiscovered: stockResult.catalogDiscovered,
          newlyDiscoveredCount: stockResult.newlyDiscoveredCount,
          recentEligibleCount: stockResult.recentEligibleCount,
          aeMovementMatchedCount: stockResult.aeMovementMatchedCount,
          candidateCount: stockResult.candidateIds.length,
          processed: stockResult.workerSummary.processed,
          completed: stockResult.workerSummary.completed,
          failed: stockResult.workerSummary.failed,
          inserted: stockResult.workerSummary.inserted,
          updated: stockResult.workerSummary.updated,
          unchanged: stockResult.workerSummary.unchanged,
          jitResolvedCount: stockResult.workerSummary.jitResolvedCount,
        },
        elapsedMs: totalElapsedMs,
      };
    },
  };
}
