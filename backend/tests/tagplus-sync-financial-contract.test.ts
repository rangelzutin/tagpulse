/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { TagPlusSyncMode, TagPlusSyncStage, TagPlusSyncStatus } from "@prisma/client";
import {
  createTagPlusSyncOrchestrator,
  type CategoryRunnerLike,
  type CustomerRunnerLike,
  type ProductRunnerLike,
  type SalesRunnerLike,
} from "../src/modules/sync/tagplus-sync-orchestrator.js";
import { createSyncLockService } from "../src/modules/sync/sync-lock-service.js";
import { createTagPlusOAuthTokenStore } from "../src/integrations/tagplus/oauth-token-store.js";
import {
  createProductionFinancialSyncRunner,
  normalizeExplicitSinceDate,
} from "../src/modules/financial/production-financial-sync.js";
import {
  resolveSinceDate,
  runIncrementalSync,
} from "../src/modules/financial/financial-incremental-sync.js";

const TEST_CONNECTION_ID = "8e1d662c-c9f3-4fee-9618-bb984573fa2a";

describe("TagPlus Sync V2 — Contrato entre Orquestrador Global, Runner Financeiro e Sync Incremental", () => {
  function setupIntegratedPipeline(options?: {
    lastWatermarkUtc?: Date;
    apiFails?: boolean;
    workerFails?: boolean;
  }) {
    const callOrder: string[] = [];
    let salesCapturedOptions: any = null;

    const syncLockService = createSyncLockService();
    const tokenStore = createTagPlusOAuthTokenStore({ filePath: null });
    tokenStore.set({ accessToken: "test-token" });

    const categoryRunner: CategoryRunnerLike = {
      preflight: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockImplementation(async () => {
        callOrder.push("CATEGORIES");
        return {
          pagesFetched: 1,
          recordsFetched: 2,
          recordsInserted: 0,
          recordsUpdated: 2,
          recordsUnchanged: 0,
          recordsNoLongerObserved: 0,
        };
      }),
    };

    const customerRunner: CustomerRunnerLike = {
      preflight: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockImplementation(async () => {
        callOrder.push("CUSTOMERS");
        return {
          pagesFetched: 1,
          recordsFetched: 5,
          recordsInserted: 0,
          recordsUpdated: 5,
          recordsUnchanged: 0,
          recordsNoLongerObserved: 0,
        };
      }),
    };

    const productRunner: ProductRunnerLike = {
      preflight: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockImplementation(async () => {
        callOrder.push("PRODUCTS");
        return {
          pagesFetched: 1,
          recordsFetched: 10,
          recordsInserted: 0,
          recordsUpdated: 10,
          recordsUnchanged: 0,
          recordsNoLongerObserved: 0,
        };
      }),
    };

    const salesRunner: SalesRunnerLike = {
      preflight: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockImplementation(async (_conn, opts) => {
        callOrder.push("SALES");
        salesCapturedOptions = opts;
        return {
          pedidos: { pagesFetched: 1, recordsFetched: 3, reconciledAbsent: 0 },
          vendasSimples: { pagesFetched: 1, recordsFetched: 1, reconciledAbsent: 0 },
          nfes: { pagesFetched: 1, recordsFetched: 2, reconciledAbsent: 0 },
        };
      }),
    };

    // Mock Prisma com suporte completo para o pipeline e para o financeiro
    const mockPrisma: any = {
      tagPlusConnection: {
        findUnique: vi.fn().mockResolvedValue({
          id: TEST_CONNECTION_ID,
          status: "ACTIVE",
          apiVersion: "v2",
        }),
        findFirst: vi.fn().mockResolvedValue({
          id: TEST_CONNECTION_ID,
          status: "ACTIVE",
          apiVersion: "v2",
        }),
      },
      tagPlusSyncRun: {
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      financialRecord: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    // Mock client HTTP TagPlus (retorna listas vazias para interromper paginação suavemente)
    const mockClient: any = {
      get: vi.fn().mockImplementation(async (url: string) => {
        if (options?.apiFails) {
          throw new Error("HTTP 500: TagPlus API timeout");
        }
        return { data: [] };
      }),
    };

    const mockFinancialRepo: any = {
      findOpenPayableSourceIds: vi.fn().mockResolvedValue([]),
      findOpenReceivableSourceIds: vi.fn().mockResolvedValue([]),
      prepareIncrementalCandidates: vi.fn().mockResolvedValue({
        candidateCount: 0,
        insertedCount: 0,
        reopenedCount: 0,
        unmodifiedCount: 0,
      }),
    };

    const mockStockRunner: any = {
      runLightweightSync: vi.fn().mockResolvedValue({
        candidateIds: [],
        catalogDiscovered: 0,
        newlyDiscoveredCount: 0,
        recentEligibleCount: 0,
        aeMovementMatchedCount: 0,
        workerSummary: {
          processed: 0,
          completed: 0,
          failed: 0,
          inserted: 0,
          updated: 0,
          unchanged: 0,
          jitResolvedCount: 0,
        },
      }),
    };

    const mockWorker: any = {
      processQueue: vi.fn().mockImplementation(async () => {
        if (options?.workerFails) {
          return { processed: 1, completed: 0, failed: 1, inserted: 0, updated: 0, unchanged: 0, elapsedMs: 10 };
        }
        return { processed: 0, completed: 0, failed: 0, inserted: 0, updated: 0, unchanged: 0, elapsedMs: 10 };
      }),
    };

    // RUNNER FINANCEIRO DE PRODUÇÃO REAL — usa runIncrementalSync real (SEM MOCK DA FUNÇÃO DE SYNC)
    const productionFinancialRunner = createProductionFinancialSyncRunner({
      prisma: mockPrisma,
      tokenStore,
      financialRepository: mockFinancialRepo,
      financialWorker: mockWorker,
      stockAdjustmentRunner: mockStockRunner,
      getClient: () => mockClient,
    });

    // Envolve o runner real para registrar a ordem de execução
    const trackedFinancialRunner = {
      run: vi.fn().mockImplementation(async (connId: string, opts: any) => {
        callOrder.push("FINANCIAL");
        return productionFinancialRunner.run(connId, opts);
      }),
    };

    let completedSummary: any = null;
    let failedInfo: any = null;

    // Watermark anterior: 2026-10-03T15:22:47.000Z que vira "2026-10-03 12:22:47" em America/Sao_Paulo
    const previousWatermark =
      options?.lastWatermarkUtc ?? new Date("2026-10-03T15:22:47.000Z");

    const syncRepository: any = {
      recoverStaleRuns: vi.fn().mockResolvedValue({ tagplus: 0, customers: 0, products: 0 }),
      findRunning: vi.fn().mockResolvedValue(null),
      findActiveRun: vi.fn().mockResolvedValue(null),
      findLastCompleted: vi.fn().mockResolvedValue(null),
      findLastCompletedIncremental: vi.fn().mockResolvedValue({
        id: "inc-prev",
        connectionId: TEST_CONNECTION_ID,
        mode: TagPlusSyncMode.INCREMENTAL,
        status: TagPlusSyncStatus.COMPLETED,
        startedAt: previousWatermark,
        completedAt: new Date(previousWatermark.getTime() + 60000),
        windowSince: new Date(previousWatermark.getTime() - 86400000),
        windowUntil: previousWatermark,
        currentStage: TagPlusSyncStage.COMPLETED,
      }),
      findLastCompletedFull: vi.fn().mockResolvedValue({
        id: "full-prev",
        connectionId: TEST_CONNECTION_ID,
        mode: TagPlusSyncMode.FULL,
        status: TagPlusSyncStatus.COMPLETED,
        startedAt: new Date("2026-09-01T00:00:00Z"),
        completedAt: new Date("2026-09-01T01:00:00Z"),
        currentStage: TagPlusSyncStage.COMPLETED,
      }),
      createRun: vi.fn().mockImplementation(async (_conn, startedAt, mode, window) => ({
        id: "sync-run-contract",
        connectionId: TEST_CONNECTION_ID,
        status: TagPlusSyncStatus.RUNNING,
        currentStage: TagPlusSyncStage.CATEGORIES,
        mode: mode ?? TagPlusSyncMode.INCREMENTAL,
        startedAt: startedAt ?? new Date(),
        completedAt: null,
        windowSince: window?.since ?? null,
        windowUntil: window?.until ?? null,
        summary: null,
      })),
      updateStage: vi.fn().mockResolvedValue(undefined),
      completeRun: vi.fn().mockImplementation(async (_runId, _completedAt, summary) => {
        completedSummary = summary;
      }),
      failRun: vi.fn().mockImplementation(async (_runId, _failedAt, stage, category, message) => {
        failedInfo = { stage, category, message };
      }),
    };

    const orchestrator = createTagPlusSyncOrchestrator({
      prisma: mockPrisma,
      syncRepository,
      tokenStore,
      categoryRunner,
      customerRunner,
      productRunner,
      salesRunner,
      financialRunner: trackedFinancialRunner,
      syncLockService,
      targetConnectionId: TEST_CONNECTION_ID,
    });

    return {
      orchestrator,
      callOrder,
      syncRepository,
      getSalesCapturedOptions: () => salesCapturedOptions,
      getCompletedSummary: () => completedSummary,
      getFailedInfo: () => failedInfo,
      mockClient,
      mockStockRunner,
    };
  }

  // 1 & 4 & 5. Regressão específica para "2026-10-03 12:22:47":
  // O orquestrador gera a data com hora para Vendas, Vendas usa sua janela original,
  // e o Financeiro executa após Vendas sem falhar por causa da hora.
  it("1. Regressão '2026-10-03 12:22:47': data global com hora não causa erro no Financeiro e SALES mantém janela original", async () => {
    const s = setupIntegratedPipeline({
      lastWatermarkUtc: new Date("2026-10-03T15:22:47.000Z"),
    });

    const result = await s.orchestrator.startSync({ mode: TagPlusSyncMode.INCREMENTAL });
    expect(result.status).toBe(TagPlusSyncStatus.RUNNING);

    await vi.waitFor(() => {
      expect(s.syncRepository.completeRun).toHaveBeenCalled();
    });

    // 4. SALES continua usando a janela original com hora formatada em America/Sao_Paulo
    const salesOpts = s.getSalesCapturedOptions();
    expect(salesOpts?.window?.since).toBe("2026-10-03 12:22:47");

    // 5. FINANCIAL executa estritamente após SALES
    expect(s.callOrder).toEqual([
      "CATEGORIES",
      "CUSTOMERS",
      "PRODUCTS",
      "SALES",
      "FINANCIAL",
    ]);

    // O run foi concluído com sucesso total (sem falhar em FINANCIAL)
    expect(s.getFailedInfo()).toBeNull();
    const summary = s.getCompletedSummary();
    expect(summary).toBeDefined();
    expect(summary.financial).toBeDefined();
  });

  // 2. Janela financeira mantém sua cobertura correta de 30 dias (lookbackDays)
  // e NÃO herda indevidamente a janela comercial menor (2 dias) de Vendas.
  it("2. Janela financeira mantém cobertura de 30 dias e não herda os 2 dias de Vendas", async () => {
    const s = setupIntegratedPipeline({
      // Watermark de apenas 2 dias atrás:
      lastWatermarkUtc: new Date("2026-10-03T15:22:47.000Z"),
    });

    await s.orchestrator.startSync({ mode: TagPlusSyncMode.INCREMENTAL });

    await vi.waitFor(() => {
      expect(s.syncRepository.completeRun).toHaveBeenCalled();
    });

    const summary = s.getCompletedSummary();
    const finInc = summary.financial.incremental;

    // Lookback deve ser 30 dias, e não os 2 dias da janela de Vendas
    expect(finInc.lookbackDays).toBe(30);

    // sinceDate do financeiro deve ser 30 dias atrás (formato YYYY-MM-DD), nunca a data de 2 dias atrás ("2026-10-03")
    expect(finInc.sinceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(finInc.sinceDate).not.toBe("2026-10-03");
  });

  // 3. Preservação do dia civil de São Paulo (America/Sao_Paulo)
  it("3. Data civil de São Paulo é preservada na normalização de datas explícitas", () => {
    // String já no formato YYYY-MM-DD
    expect(normalizeExplicitSinceDate("2026-10-03")).toBe("2026-10-03");

    // String no formato YYYY-MM-DD HH:mm:ss (horário civil de São Paulo)
    expect(normalizeExplicitSinceDate("2026-10-03 12:22:47")).toBe("2026-10-03");

    // ISO string próxima à meia-noite UTC (01:00 UTC em 06/10 é 22:00 em 05/10 em São Paulo)
    // O dia civil de São Paulo DEVE ser 2026-10-05, e não 2026-10-06!
    const nearMidnightUtc = "2026-10-06T01:00:00.000Z";
    expect(normalizeExplicitSinceDate(nearMidnightUtc)).toBe("2026-10-05");

    // Formato inválido é preservado para que a validação estrita lance erro
    expect(normalizeExplicitSinceDate("invalid")).toBe("invalid");
  });

  // 6. Falha real do Financeiro continua propagando FAILED
  it("6. Falha real na execução do Financeiro propaga FAILED com errorStage = FINANCIAL", async () => {
    const s = setupIntegratedPipeline({
      workerFails: true, // Força falha no worker financeiro
    });

    await s.orchestrator.startSync({ mode: TagPlusSyncMode.INCREMENTAL });

    await vi.waitFor(() => {
      expect(s.syncRepository.failRun).toHaveBeenCalled();
    });

    const failed = s.getFailedInfo();
    expect(failed).toBeDefined();
    expect(failed.stage).toBe(TagPlusSyncStage.FINANCIAL);
    expect(failed.message).toContain("FINANCIAL_INCREMENTAL_FAILED");
    expect(s.getCompletedSummary()).toBeNull();
  });

  // 7. A rotina financeira isolada não sofre regressão
  it("7. Rotina financeira isolada (resolveSinceDate) mantém validação estrita e suporte padrão", () => {
    // Padrão sem parâmetros: 30 dias em America/Sao_Paulo
    const defaultRes = resolveSinceDate();
    expect(defaultRes.lookbackDays).toBe(30);
    expect(defaultRes.sinceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Parâmetro explícito válido YYYY-MM-DD aceito
    const explicitRes = resolveSinceDate({ since: "2026-08-01" });
    expect(explicitRes.sinceDate).toBe("2026-08-01");

    // Formato com hora continua estritamente rejeitado se passado diretamente para a rotina isolada
    expect(() => resolveSinceDate({ since: "2026-10-03 12:22:47" })).toThrow(
      /Invalid --since date format/,
    );
    expect(() => resolveSinceDate({ since: "01-08-2026" })).toThrow(
      /Invalid --since date format/,
    );
  });

  // 8. Nenhum full financial catalog é executado
  it("8. Nenhum full financial catalog é executado na sincronização incremental", async () => {
    const s = setupIntegratedPipeline();

    await s.orchestrator.startSync({ mode: TagPlusSyncMode.INCREMENTAL });

    await vi.waitFor(() => {
      expect(s.syncRepository.completeRun).toHaveBeenCalled();
    });

    // Confirma que apenas o runner leve de ajustes de estoque foi chamado (reconciliação leve)
    expect(s.mockStockRunner.runLightweightSync).toHaveBeenCalledWith(
      TEST_CONNECTION_ID,
      expect.objectContaining({ recentDays: 30 }),
    );

    // Confirma que nenhuma rota de catálogo completo foi chamada no client TagPlus
    const calls = s.mockClient.get.mock.calls as [string][];
    for (const [url] of calls) {
      expect(url).not.toContain("/produtos");
      expect(url).not.toContain("/full");
    }
  });
});
