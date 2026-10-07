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
import { createStockAdjustmentSyncRunner } from "../src/modules/stock-adjustments/stock-adjustment-sync-runner.js";

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

describe("TagPlus Sync V2 — Hotfix de Performance — Escopo de Movimentos AE dos Candidatos (Regressões A-J)", () => {
  // A. Uma rodada com 164 candidatos NÃO consulta todos os financeiros históricos da empresa
  it("A. Uma rodada com 164 candidatos NÃO consulta todos os financeiros históricos da empresa", async () => {
    const candidateIds164 = Array.from({ length: 164 }, (_, i) => `src-${i + 1}`);
    const findManySpy = vi.fn().mockResolvedValue([
      { linkedMovementNumber: "AE - 677" },
      { linkedMovementNumber: "AE - 701" },
      { linkedMovementNumber: "AE - 694" },
    ]);

    const mockPrisma: any = {
      tagPlusConnection: {
        findUnique: vi.fn().mockResolvedValue({ id: TEST_CONNECTION_ID, apiVersion: "v2" }),
      },
      financialRecord: {
        findMany: findManySpy,
      },
    };

    const mockStockRunner: any = {
      runLightweightSync: vi.fn().mockResolvedValue({
        candidateIds: ["7001", "7002", "7003"],
        catalogDiscovered: 678,
        newlyDiscoveredCount: 0,
        recentEligibleCount: 0,
        aeMovementMatchedCount: 3,
        workerSummary: {
          processed: 3,
          completed: 3,
          failed: 0,
          inserted: 0,
          updated: 3,
          unchanged: 0,
          jitResolvedCount: 0,
        },
      }),
    };

    const mockIncrementalSyncFn = vi.fn().mockResolvedValue({
      sinceDate: "2026-09-06",
      lookbackDays: 30,
      candidates: {
        recentCount: 147,
        openCount: 14,
        undatedCount: 3,
        uniqueCount: 164,
        overlapDeduplicated: 0,
      },
      candidateSourceIds: candidateIds164,
      workerSummary: {
        processed: 164,
        completed: 164,
        failed: 0,
        inserted: 14,
        updated: 3,
        unchanged: 147,
        elapsedMs: 500,
      },
      elapsedMs: 600,
    });

    const runner = createProductionFinancialSyncRunner({
      prisma: mockPrisma,
      runIncrementalSyncFn: mockIncrementalSyncFn,
      stockAdjustmentRunner: mockStockRunner,
      financialRepository: {} as any,
      financialWorker: {} as any,
    });

    await runner.run(TEST_CONNECTION_ID, { lookbackDays: 30 });

    // Confirma que a consulta Prisma usou estritamente o filtro de sourceId com os 164 candidatos
    expect(findManySpy).toHaveBeenCalledTimes(1);
    expect(findManySpy).toHaveBeenCalledWith({
      where: {
        connectionId: TEST_CONNECTION_ID,
        sourceId: { in: candidateIds164 },
        linkedMovementNumber: { startsWith: "AE" },
      },
      select: { linkedMovementNumber: true },
    });

    // Confirma que NUNCA foi feito findMany sem o filtro sourceId: { in: ... }
    const callArgs = findManySpy.mock.calls[0][0];
    expect(callArgs.where.sourceId).toBeDefined();
    expect(callArgs.where.sourceId.in).toHaveLength(164);
    expect(callArgs.where.connectionId).toBe(TEST_CONNECTION_ID);
  });

  // B. Apenas os movimentos AE dos candidatos da rodada sinalizam ajustes para reprocessamento
  it("B. Apenas os movimentos AE dos candidatos da rodada sinalizam ajustes para reprocessamento", async () => {
    const candidateIds = ["src-1", "src-2", "src-3"];
    const mockPrisma: any = {
      tagPlusConnection: {
        findUnique: vi.fn().mockResolvedValue({ id: TEST_CONNECTION_ID, apiVersion: "v2" }),
      },
      financialRecord: {
        findMany: vi.fn().mockResolvedValue([
          { linkedMovementNumber: "AE - 677" },
          { linkedMovementNumber: "AE - 701" },
        ]),
      },
    };

    const mockStockRunner: any = {
      runLightweightSync: vi.fn().mockResolvedValue({
        candidateIds: ["101", "102"],
        catalogDiscovered: 100,
        newlyDiscoveredCount: 0,
        recentEligibleCount: 0,
        aeMovementMatchedCount: 2,
        workerSummary: {
          processed: 2,
          completed: 2,
          failed: 0,
          inserted: 0,
          updated: 2,
          unchanged: 0,
          jitResolvedCount: 0,
        },
      }),
    };

    const mockIncrementalSyncFn = vi.fn().mockResolvedValue({
      sinceDate: "2026-09-06",
      lookbackDays: 30,
      candidates: {
        recentCount: 3,
        openCount: 0,
        undatedCount: 0,
        uniqueCount: 3,
        overlapDeduplicated: 0,
      },
      candidateSourceIds: candidateIds,
      workerSummary: {
        processed: 3,
        completed: 3,
        failed: 0,
        inserted: 0,
        updated: 3,
        unchanged: 0,
        elapsedMs: 50,
      },
      elapsedMs: 60,
    });

    const runner = createProductionFinancialSyncRunner({
      prisma: mockPrisma,
      runIncrementalSyncFn: mockIncrementalSyncFn,
      stockAdjustmentRunner: mockStockRunner,
      financialRepository: {} as any,
      financialWorker: {} as any,
    });

    const res = await runner.run(TEST_CONNECTION_ID);

    expect(mockStockRunner.runLightweightSync).toHaveBeenCalledWith(
      TEST_CONNECTION_ID,
      expect.objectContaining({
        aeMovementNumbers: ["AE - 677", "AE - 701"],
      }),
    );
    expect(res.incremental.aeMovementNumbersFound).toEqual(["AE - 677", "AE - 701"]);
  });

  // C. Movimentos AE históricos fora dos candidatos não acionam reprocessamento desnecessário
  it("C. Movimentos AE históricos fora dos candidatos não acionam reprocessamento desnecessário", async () => {
    // Simula banco com centenas de registros históricos. Apenas os que batem no sourceId IN candidates retornam.
    const roundCandidates = ["cand-A", "cand-B"];
    const allDbRecords = [
      { sourceId: "old-1", linkedMovementNumber: "AE - 100" },
      { sourceId: "old-2", linkedMovementNumber: "AE - 200" },
      { sourceId: "cand-A", linkedMovementNumber: "AE - 694" },
    ];

    const mockPrisma: any = {
      tagPlusConnection: {
        findUnique: vi.fn().mockResolvedValue({ id: TEST_CONNECTION_ID, apiVersion: "v2" }),
      },
      financialRecord: {
        findMany: vi.fn().mockImplementation(async ({ where }: any) => {
          const filterIds: string[] = where.sourceId?.in ?? [];
          return allDbRecords
            .filter((r) => filterIds.includes(r.sourceId) && r.linkedMovementNumber.startsWith("AE"))
            .map((r) => ({ linkedMovementNumber: r.linkedMovementNumber }));
        }),
      },
    };

    const mockStockRunner: any = {
      runLightweightSync: vi.fn().mockResolvedValue({
        candidateIds: ["7001"],
        catalogDiscovered: 100,
        newlyDiscoveredCount: 0,
        recentEligibleCount: 0,
        aeMovementMatchedCount: 1,
        workerSummary: {
          processed: 1,
          completed: 1,
          failed: 0,
          inserted: 0,
          updated: 1,
          unchanged: 0,
          jitResolvedCount: 0,
        },
      }),
    };

    const runner = createProductionFinancialSyncRunner({
      prisma: mockPrisma,
      runIncrementalSyncFn: vi.fn().mockResolvedValue({
        sinceDate: "2026-09-06",
        lookbackDays: 30,
        candidates: { recentCount: 2, openCount: 0, undatedCount: 0, uniqueCount: 2, overlapDeduplicated: 0 },
        candidateSourceIds: roundCandidates,
        workerSummary: { processed: 2, completed: 2, failed: 0, inserted: 0, updated: 2, unchanged: 0, elapsedMs: 10 },
        elapsedMs: 20,
      }),
      stockAdjustmentRunner: mockStockRunner,
      financialRepository: {} as any,
      financialWorker: {} as any,
    });

    const res = await runner.run(TEST_CONNECTION_ID);

    // Somente "AE - 694" foi sinalizado, nunca "AE - 100" ou "AE - 200"
    expect(res.incremental.aeMovementNumbersFound).toEqual(["AE - 694"]);
    expect(mockStockRunner.runLightweightSync).toHaveBeenCalledWith(
      TEST_CONNECTION_ID,
      expect.objectContaining({
        aeMovementNumbers: ["AE - 694"],
      }),
    );
  });

  // D. Um movimento "AE - 684" é resolvido por número para o sourceId correto "7216", quando esse ajuste estiver entre os candidatos sinalizados
  it("D. Um movimento 'AE - 684' é resolvido por número para o sourceId correto '7216'", async () => {
    const urlsCalled: string[] = [];
    const mockClient: any = {
      get: vi.fn().mockImplementation((url: string) => {
        urlsCalled.push(url);
        if (url.includes("/ajustes_estoque?page=1")) {
          return Promise.resolve({
            data: [{ id: 7216, numero: "684", data_criacao: "2024-05-10 10:00:00", data_confirmacao: "2024-05-10 00:00:00" }],
          });
        }
        if (url.includes("/ajustes_estoque?page=2")) return Promise.resolve({ data: [] });
        if (url === "/ajustes_estoque/7216") {
          return Promise.resolve({ data: { id: 7216, numero: "684", tipo: "S", status: "A", itens: [], faturas: [] } });
        }
        return Promise.resolve({ data: {} });
      }),
    };

    const mockRepo: any = { upsertCatalogItems: vi.fn().mockResolvedValue({ newlyDiscovered: 0 }) };
    const mockWorker: any = {
      processQueue: vi.fn().mockImplementation(async (_conn, opts) => {
        for (const id of opts.candidateSourceIds) {
          await mockClient.get(`/ajustes_estoque/${id}`);
        }
        return {
          processed: opts.candidateSourceIds.length,
          completed: opts.candidateSourceIds.length,
          failed: 0,
          notFound: 0,
          inserted: 0,
          updated: opts.candidateSourceIds.length,
          unchanged: 0,
          jitResolvedCount: 0,
        };
      }),
    };

    const mockPrisma: any = {
      stockAdjustment: {
        findMany: vi.fn().mockResolvedValue([{ sourceId: "7216", number: "684" }]),
      },
      stockAdjustmentSyncItem: { findMany: vi.fn().mockResolvedValue([]) },
    };

    const stockRunner = createStockAdjustmentSyncRunner({
      prisma: mockPrisma,
      repository: mockRepo,
      worker: mockWorker,
      getClient: () => mockClient,
    });

    const result = await stockRunner.runLightweightSync(TEST_CONNECTION_ID, {
      aeMovementNumbers: ["AE - 684"],
      recentDays: 30,
      now: new Date("2026-10-04T00:00:00Z"),
    });

    expect(result.candidateIds).toEqual(["7216"]);
    expect(mockWorker.processQueue).toHaveBeenCalledWith(
      TEST_CONNECTION_ID,
      expect.objectContaining({ candidateSourceIds: ["7216"] }),
    );
    expect(urlsCalled).toContain("/ajustes_estoque/7216");
    expect(urlsCalled.some((u) => u === "/ajustes_estoque/684" || u.endsWith("/684"))).toBe(false);
  });

  // E. Sem movimentos AE candidatos, a consulta não deve cair em um full scan
  it("E. Sem movimentos AE candidatos, a consulta não deve cair em um full scan", async () => {
    const findManySpy = vi.fn().mockResolvedValue([]);
    const mockPrisma: any = {
      tagPlusConnection: { findUnique: vi.fn().mockResolvedValue({ id: TEST_CONNECTION_ID, apiVersion: "v2" }) },
      financialRecord: { findMany: findManySpy },
    };

    const mockStockRunner: any = {
      runLightweightSync: vi.fn().mockResolvedValue({
        candidateIds: [],
        catalogDiscovered: 10,
        newlyDiscoveredCount: 0,
        recentEligibleCount: 0,
        aeMovementMatchedCount: 0,
        workerSummary: { processed: 0, completed: 0, failed: 0, inserted: 0, updated: 0, unchanged: 0, jitResolvedCount: 0 },
      }),
    };

    const runner = createProductionFinancialSyncRunner({
      prisma: mockPrisma,
      runIncrementalSyncFn: vi.fn().mockResolvedValue({
        sinceDate: "2026-09-06",
        lookbackDays: 30,
        candidates: { recentCount: 0, openCount: 0, undatedCount: 0, uniqueCount: 0, overlapDeduplicated: 0 },
        candidateSourceIds: [],
        workerSummary: { processed: 0, completed: 0, failed: 0, inserted: 0, updated: 0, unchanged: 0, elapsedMs: 5 },
        elapsedMs: 10,
      }),
      stockAdjustmentRunner: mockStockRunner,
      financialRepository: {} as any,
      financialWorker: {} as any,
    });

    const res = await runner.run(TEST_CONNECTION_ID);

    // findMany NÃO deve ser chamado pois candidateSourceIds está vazio
    expect(findManySpy).not.toHaveBeenCalled();
    expect(res.incremental.aeMovementNumbersFound).toEqual([]);
    expect(mockStockRunner.runLightweightSync).toHaveBeenCalledWith(
      TEST_CONNECTION_ID,
      expect.objectContaining({ aeMovementNumbers: [] }),
    );
  });

  // F. Ajustes novos e recentes continuam sendo processados independentemente de sinais AE
  it("F. Ajustes novos e recentes continuam sendo processados independentemente de sinais AE", async () => {
    const mockStockRunner: any = {
      runLightweightSync: vi.fn().mockResolvedValue({
        candidateIds: ["recent-1", "recent-2"],
        catalogDiscovered: 50,
        newlyDiscoveredCount: 1,
        recentEligibleCount: 2,
        aeMovementMatchedCount: 0,
        workerSummary: { processed: 2, completed: 2, failed: 0, inserted: 1, updated: 1, unchanged: 0, jitResolvedCount: 0 },
      }),
    };

    const runner = createProductionFinancialSyncRunner({
      prisma: {
        tagPlusConnection: { findUnique: vi.fn().mockResolvedValue({ id: TEST_CONNECTION_ID, apiVersion: "v2" }) },
        financialRecord: { findMany: vi.fn().mockResolvedValue([]) },
      } as any,
      runIncrementalSyncFn: vi.fn().mockResolvedValue({
        sinceDate: "2026-09-06",
        lookbackDays: 30,
        candidates: { recentCount: 5, openCount: 0, undatedCount: 0, uniqueCount: 5, overlapDeduplicated: 0 },
        candidateSourceIds: ["s1", "s2", "s3", "s4", "s5"],
        workerSummary: { processed: 5, completed: 5, failed: 0, inserted: 0, updated: 5, unchanged: 0, elapsedMs: 10 },
        elapsedMs: 20,
      }),
      stockAdjustmentRunner: mockStockRunner,
      financialRepository: {} as any,
      financialWorker: {} as any,
    });

    const res = await runner.run(TEST_CONNECTION_ID, { lookbackDays: 30 });

    // Sem nenhum AE encontrado nos candidatos, o Stock Adjustment runner ainda roda com recentDays: 30
    expect(mockStockRunner.runLightweightSync).toHaveBeenCalledWith(
      TEST_CONNECTION_ID,
      expect.objectContaining({
        recentDays: 30,
        aeMovementNumbers: [],
      }),
    );
    expect(res.stockAdjustments.recentEligibleCount).toBe(2);
    expect(res.stockAdjustments.candidateCount).toBe(2);
  });

  // G. Falha de vínculo/JIT continua fazendo FINANCIAL falhar
  it("G. Falha de vínculo/JIT continua fazendo FINANCIAL falhar", async () => {
    const mockStockRunner: any = {
      runLightweightSync: vi.fn().mockResolvedValue({
        candidateIds: ["7216"],
        catalogDiscovered: 10,
        newlyDiscoveredCount: 0,
        recentEligibleCount: 0,
        aeMovementMatchedCount: 1,
        workerSummary: { processed: 1, completed: 0, failed: 1, inserted: 0, updated: 0, unchanged: 0, jitResolvedCount: 0 },
      }),
    };

    const runner = createProductionFinancialSyncRunner({
      prisma: {
        tagPlusConnection: { findUnique: vi.fn().mockResolvedValue({ id: TEST_CONNECTION_ID, apiVersion: "v2" }) },
        financialRecord: { findMany: vi.fn().mockResolvedValue([{ linkedMovementNumber: "AE - 684" }]) },
      } as any,
      runIncrementalSyncFn: vi.fn().mockResolvedValue({
        sinceDate: "2026-09-06",
        lookbackDays: 30,
        candidates: { recentCount: 1, openCount: 0, undatedCount: 0, uniqueCount: 1, overlapDeduplicated: 0 },
        candidateSourceIds: ["fin-1"],
        workerSummary: { processed: 1, completed: 1, failed: 0, inserted: 0, updated: 1, unchanged: 0, elapsedMs: 10 },
        elapsedMs: 20,
      }),
      stockAdjustmentRunner: mockStockRunner,
      financialRepository: {} as any,
      financialWorker: {} as any,
    });

    await expect(runner.run(TEST_CONNECTION_ID)).rejects.toThrow(
      /STOCK_ADJUSTMENT_SUBSTEP_FAILED: 1 ajuste\(s\) falharam na reconciliação de estoque/,
    );
  });

  // H. Financeiro mantém os 30 dias + abertos + confirmados sem data
  it("H. Financeiro mantém os 30 dias + abertos + confirmados sem data", async () => {
    const defaultWindow = resolveSinceDate();
    expect(defaultWindow.lookbackDays).toBe(30);

    const mockRepo: any = {
      findOpenPayableSourceIds: vi.fn().mockResolvedValue(["open-pay-1"]),
      findOpenReceivableSourceIds: vi.fn().mockResolvedValue(["open-rec-1"]),
      prepareIncrementalCandidates: vi.fn().mockResolvedValue({
        candidateCount: 4,
        insertedCount: 4,
        reopenedCount: 0,
        unmodifiedCount: 0,
      }),
    };

    const mockClient: any = {
      get: vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/financeiros") && url.includes("page=1&")) {
          return { data: [{ id: 9001 }] };
        }
        return { data: [] };
      }),
    };

    const report = await runIncrementalSync({
      prisma: {
        financialRecord: {
          findMany: vi.fn().mockImplementation(async ({ where }: any) => {
            if (where?.isConfirmed === false) {
              return [{ sourceId: "open-1" }, { sourceId: "open-2" }];
            }
            if (where?.isConfirmed === true) {
              return [{ sourceId: "undated-1" }];
            }
            return [];
          }),
        },
      } as any,
      repository: mockRepo,
      worker: { processQueue: vi.fn().mockResolvedValue({ processed: 4, completed: 4, failed: 0, inserted: 0, updated: 4, unchanged: 0, elapsedMs: 10 }) } as any,
      getClient: () => mockClient,
      connectionId: TEST_CONNECTION_ID,
      lookbackDays: 30,
      pageDelayMs: 0,
    });

    expect(report.candidates.recentCount).toBe(1);
    expect(report.candidates.openCount).toBe(2);
    expect(report.candidates.undatedCount).toBe(1);
    expect(report.candidates.uniqueCount).toBe(4);
    expect(report.candidateSourceIds).toBeDefined();
    expect(report.candidateSourceIds).toEqual(["9001", "open-1", "open-2", "undated-1"]);
  });

  // I. Nenhum catálogo financeiro completo é executado
  it("I. Nenhum catálogo financeiro completo é executado", async () => {
    const endpointsCalled: string[] = [];
    const mockClient: any = {
      get: vi.fn().mockImplementation(async (url: string) => {
        endpointsCalled.push(url);
        return { data: [] };
      }),
    };

    const runner = createProductionFinancialSyncRunner({
      prisma: {
        tagPlusConnection: { findUnique: vi.fn().mockResolvedValue({ id: TEST_CONNECTION_ID, apiVersion: "v2" }) },
        financialRecord: { findMany: vi.fn().mockResolvedValue([]) },
      } as any,
      getClient: () => mockClient,
      financialRepository: {
        findOpenPayableSourceIds: vi.fn().mockResolvedValue([]),
        findOpenReceivableSourceIds: vi.fn().mockResolvedValue([]),
        prepareIncrementalCandidates: vi.fn().mockResolvedValue({ candidateCount: 0, insertedCount: 0, reopenedCount: 0, unmodifiedCount: 0 }),
      } as any,
      financialWorker: { processQueue: vi.fn().mockResolvedValue({ processed: 0, completed: 0, failed: 0, inserted: 0, updated: 0, unchanged: 0, elapsedMs: 1 }) } as any,
      stockAdjustmentRunner: {
        runLightweightSync: vi.fn().mockResolvedValue({
          candidateIds: [],
          catalogDiscovered: 0,
          newlyDiscoveredCount: 0,
          recentEligibleCount: 0,
          aeMovementMatchedCount: 0,
          workerSummary: { processed: 0, completed: 0, failed: 0, inserted: 0, updated: 0, unchanged: 0, jitResolvedCount: 0 },
        }),
      } as any,
    });

    await runner.run(TEST_CONNECTION_ID);

    // Verifica que nenhum endpoint de catalog completo (/full, etc.) foi chamado
    expect(endpointsCalled.some((e) => e.includes("/full"))).toBe(false);
  });

  // J. O resumo financeiro mantém métricas corretas e não persiste listas enormes de IDs técnicos
  it("J. O resumo financeiro mantém métricas corretas e não persiste listas enormes de IDs técnicos", async () => {
    const candidateIds164 = Array.from({ length: 164 }, (_, i) => `src-${i + 1}`);
    const runner = createProductionFinancialSyncRunner({
      prisma: {
        tagPlusConnection: { findUnique: vi.fn().mockResolvedValue({ id: TEST_CONNECTION_ID, apiVersion: "v2" }) },
        financialRecord: {
          findMany: vi.fn().mockResolvedValue([
            { linkedMovementNumber: "AE - 677" },
            { linkedMovementNumber: "AE - 694" },
            { linkedMovementNumber: "AE - 701" },
          ]),
        },
      } as any,
      runIncrementalSyncFn: vi.fn().mockResolvedValue({
        sinceDate: "2026-09-06",
        lookbackDays: 30,
        candidates: {
          recentCount: 147,
          openCount: 14,
          undatedCount: 3,
          uniqueCount: 164,
          overlapDeduplicated: 0,
        },
        candidateSourceIds: candidateIds164,
        workerSummary: {
          processed: 164,
          completed: 164,
          failed: 0,
          inserted: 14,
          updated: 3,
          unchanged: 147,
          elapsedMs: 250,
        },
        elapsedMs: 300,
      }),
      stockAdjustmentRunner: {
        runLightweightSync: vi.fn().mockResolvedValue({
          candidateIds: ["7001", "7002", "7003"],
          catalogDiscovered: 678,
          newlyDiscoveredCount: 0,
          recentEligibleCount: 0,
          aeMovementMatchedCount: 3,
          workerSummary: {
            processed: 3,
            completed: 3,
            failed: 0,
            inserted: 0,
            updated: 3,
            unchanged: 0,
            jitResolvedCount: 0,
          },
        }),
      } as any,
      financialRepository: {} as any,
      financialWorker: {} as any,
    });

    const res = await runner.run(TEST_CONNECTION_ID);

    // Contadores corretos
    expect(res.incremental.candidates.uniqueCount).toBe(164);
    expect(res.incremental.processed).toBe(164);
    expect(res.incremental.inserted).toBe(14);
    expect(res.incremental.updated).toBe(3);
    expect(res.incremental.unchanged).toBe(147);

    // Não deve haver listas imensas de IDs em candidates
    expect((res.incremental.candidates as any).candidateSourceIds).toBeUndefined();
    expect((res.incremental.candidates as any).uniqueCandidates).toBeUndefined();

    // aeMovementNumbersFound tem apenas os movimentos encontrados (3)
    expect(res.incremental.aeMovementNumbersFound).toEqual(["AE - 677", "AE - 694", "AE - 701"]);
    expect(res.stockAdjustments.candidateCount).toBe(3);
    expect(res.stockAdjustments.processed).toBe(3);
  });

  it("17. ProductionFinancialSyncRunner emite progresso intermediário via onProgress para Subpasso A e Subpasso B", async () => {
    const progressEvents: any[] = [];
    const mockIncrementalFn = vi.fn().mockImplementation(async (opts: any) => {
      opts.onCandidatesDiscovered?.({ uniqueCandidates: ["101", "102", "103"] });
      opts.onProgress?.({ processed: 1, completed: 1, failed: 0, notFound: 0, lastSourceId: "101", action: "COMPLETED", recordAction: "updated" });
      opts.onProgress?.({ processed: 2, completed: 2, failed: 0, notFound: 0, lastSourceId: "102", action: "COMPLETED", recordAction: "inserted" });
      opts.onProgress?.({ processed: 3, completed: 3, failed: 0, notFound: 0, lastSourceId: "103", action: "COMPLETED", recordAction: "unchanged" });
      return {
        sinceDate: "2026-09-07",
        lookbackDays: 30,
        candidates: { recentCount: 3, openCount: 0, undatedCount: 0, uniqueCount: 3, overlapDeduplicated: 0 },
        candidateSourceIds: ["101", "102", "103"],
        workerSummary: { processed: 3, completed: 3, failed: 0, notFound: 0, inserted: 1, updated: 1, unchanged: 1, elapsedMs: 100 },
        elapsedMs: 150,
      };
    });

    const mockStockRunner = {
      runLightweightSync: vi.fn().mockImplementation(async (_connId: string, opts?: any) => {
        opts?.onCandidatesDiscovered?.(["7001", "7002"]);
        opts?.onProgress?.({ processed: 1, completed: 1, failed: 0, notFound: 0, inserted: 0, updated: 1, unchanged: 0, jitResolvedCount: 0, elapsedMs: 10 }, 2);
        opts?.onProgress?.({ processed: 2, completed: 2, failed: 0, notFound: 0, inserted: 0, updated: 2, unchanged: 0, jitResolvedCount: 0, elapsedMs: 20 }, 2);
        return {
          candidateIds: ["7001", "7002"],
          catalogDiscovered: 678,
          newlyDiscoveredCount: 0,
          recentEligibleCount: 0,
          aeMovementMatchedCount: 2,
          workerSummary: { processed: 2, completed: 2, failed: 0, notFound: 0, inserted: 0, updated: 2, unchanged: 0, jitResolvedCount: 0, elapsedMs: 50 },
        };
      }),
    };

    const runner = createProductionFinancialSyncRunner({
      prisma: {
        tagPlusConnection: { findUnique: vi.fn().mockResolvedValue({ id: TEST_CONNECTION_ID, apiVersion: "v2" }) },
        financialRecord: { findMany: vi.fn().mockResolvedValue([]) },
      } as any,
      runIncrementalSyncFn: mockIncrementalFn,
      stockAdjustmentRunner: mockStockRunner as any,
      financialRepository: {} as any,
      financialWorker: {} as any,
    });

    await runner.run(TEST_CONNECTION_ID, {
      onProgress: (p) => {
        progressEvents.push(p);
      },
    });

    // Eventos foram gerados
    expect(progressEvents.length).toBeGreaterThan(0);

    // Subpasso A presente
    const subAEvents = progressEvents.filter((e) => e.substep === "Atualizando financeiro");
    expect(subAEvents.length).toBeGreaterThanOrEqual(3);
    expect(subAEvents[0].label).toBe("Atualizando financeiro");
    expect(subAEvents[subAEvents.length - 1].current).toBe(3);
    expect(subAEvents[subAEvents.length - 1].total).toBe(3);

    // Subpasso B presente
    const subBEvents = progressEvents.filter((e) => e.substep === "Reconciliando ajustes");
    expect(subBEvents.length).toBeGreaterThanOrEqual(2);
    expect(subBEvents[0].label).toBe("Reconciliando ajustes");
    expect(subBEvents[subBEvents.length - 1].current).toBe(2);
    expect(subBEvents[subBEvents.length - 1].total).toBe(2);

    // Sem termos técnicos expostos nos rótulos de progresso
    for (const ev of progressEvents) {
      expect(ev.substep).not.toContain("JIT");
      expect(ev.substep).not.toContain("StockAdjustmentFinancialLink");
      expect(ev.substep).not.toContain("NON_CASH_STOCK_ADJUSTMENT_OUTFLOW");
      expect(ev.label).not.toContain("JIT");
      expect(ev.label).not.toContain("StockAdjustmentFinancialLink");
    }
  });
});
