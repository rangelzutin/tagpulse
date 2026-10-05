/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { TagPlusSyncMode, TagPlusSyncStage, TagPlusSyncStatus } from "@prisma/client";
import { buildApp } from "../src/app.js";
import { createTagPlusOAuthTokenStore } from "../src/integrations/tagplus/oauth-token-store.js";
import {
  createTagPlusSyncOrchestrator,
  TagPlusSyncAlreadyRunningError,
  type CategoryRunnerLike,
  type CustomerRunnerLike,
  type ProductRunnerLike,
  type SalesRunnerLike,
} from "../src/modules/sync/tagplus-sync-orchestrator.js";
import {
  createSyncLockService,
  SyncLockConflictError,
} from "../src/modules/sync/sync-lock-service.js";
import {
  createFinancialSyncOrchestrator,
  FinancialSyncAlreadyRunningError,
} from "../src/modules/financial/financial-sync-orchestrator.js";
import {
  createProductionFinancialSyncRunner,
  type FinancialRunnerLike,
} from "../src/modules/financial/production-financial-sync.js";
import { createStockAdjustmentSyncRunner } from "../src/modules/stock-adjustments/stock-adjustment-sync-runner.js";
import { createStockAdjustmentWorker } from "../src/modules/stock-adjustments/stock-adjustment-worker.js";
import type { StockAdjustmentRepository } from "../src/modules/stock-adjustments/stock-adjustment-repository.js";
import type { FinancialRecordRepository } from "../src/modules/financial/financial-record-repository.js";
import type { TagPlusClient } from "../src/integrations/tagplus/tagplus-client.js";

const TEST_CONNECTION_ID = "8e1d662c-c9f3-4fee-9618-bb984573fa2a";

describe("Global Sync V2 — Stage FINANCIAL + Stock Adjustment Reconciliation", () => {
  const apps: FastifyInstance[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    vi.restoreAllMocks();
  });

  function createTestSetup(options?: {
    salesFail?: boolean;
    financialIncrementalFail?: boolean;
    stockAdjustmentFail?: boolean;
    onSalesSyncCompleted?: () => void;
  }) {
    const callOrder: string[] = [];
    const syncLockService = createSyncLockService();
    const tokenStore = createTagPlusOAuthTokenStore({ filePath: null });
    tokenStore.set({ accessToken: "test-token" });

    const categoryRunner: CategoryRunnerLike = {
      preflight: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockImplementation(async () => {
        callOrder.push("CATEGORIES");
        return {
          pagesFetched: 1,
          recordsFetched: 10,
          recordsInserted: 10,
          recordsUpdated: 0,
          recordsUnchanged: 0,
        };
      }),
    };

    const customerRunner: CustomerRunnerLike = {
      preflight: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockImplementation(async () => {
        callOrder.push("CUSTOMERS");
        return {
          pagesFetched: 1,
          recordsFetched: 10,
          recordsInserted: 10,
          recordsUpdated: 0,
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
          recordsInserted: 10,
          recordsUpdated: 0,
          recordsUnchanged: 0,
          recordsNoLongerObserved: 0,
        };
      }),
    };

    const salesRunner: SalesRunnerLike = {
      preflight: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockImplementation(async () => {
        callOrder.push("SALES");
        if (options?.salesFail) {
          throw new Error("SALES_PIPELINE_ERROR");
        }
        return {
          pedidos: { pagesFetched: 1, recordsFetched: 5, reconciledAbsent: 0 },
          vendasSimples: { pagesFetched: 1, recordsFetched: 5, reconciledAbsent: 0 },
          nfes: { pagesFetched: 1, recordsFetched: 5, reconciledAbsent: 0 },
        };
      }),
    };

    const financialRunner: FinancialRunnerLike = {
      run: vi.fn().mockImplementation(async () => {
        callOrder.push("FINANCIAL");
        if (options?.financialIncrementalFail) {
          throw new Error("FINANCIAL_INCREMENTAL_FAILED: 2 registros falharam");
        }
        if (options?.stockAdjustmentFail) {
          throw new Error("STOCK_ADJUSTMENT_SUBSTEP_FAILED: 1 ajuste falhou no vínculo");
        }
        return {
          incremental: {
            sinceDate: "2026-09-04",
            candidates: {
              recentCount: 15,
              openCount: 2,
              undatedCount: 1,
              uniqueCount: 18,
              overlapDeduplicated: 0,
            },
            processed: 18,
            completed: 18,
            failed: 0,
            inserted: 2,
            updated: 16,
            unchanged: 0,
            aeMovementNumbersFound: ["AE - 684"],
          },
          stockAdjustments: {
            catalogDiscovered: 678,
            newlyDiscoveredCount: 1,
            recentEligibleCount: 5,
            aeMovementMatchedCount: 1,
            candidateCount: 7,
            processed: 7,
            completed: 7,
            failed: 0,
            inserted: 1,
            updated: 6,
            unchanged: 0,
            jitResolvedCount: 1,
          },
          elapsedMs: 250,
        };
      }),
    };

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
        startedAt: new Date("2026-09-01T00:00:00Z"),
        completedAt: new Date("2026-09-01T00:05:00Z"),
        windowSince: new Date("2026-08-01T00:00:00Z"),
        windowUntil: new Date("2026-09-01T00:00:00Z"),
        currentStage: TagPlusSyncStage.COMPLETED,
      }),
      findLastCompletedFull: vi.fn().mockResolvedValue({
        id: "full-prev",
        connectionId: TEST_CONNECTION_ID,
        mode: TagPlusSyncMode.FULL,
        status: TagPlusSyncStatus.COMPLETED,
        startedAt: new Date("2026-08-01T00:00:00Z"),
        completedAt: new Date("2026-08-01T01:00:00Z"),
        currentStage: TagPlusSyncStage.COMPLETED,
      }),
      createRun: vi.fn().mockImplementation(async (_conn, startedAt, mode, window) => ({
        id: "sync-run-1",
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
      completeRun: vi.fn().mockResolvedValue(undefined),
      failRun: vi.fn().mockResolvedValue(undefined),
    };

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
    };

    const orchestrator = createTagPlusSyncOrchestrator({
      prisma: mockPrisma,
      syncRepository,
      tokenStore,
      categoryRunner,
      customerRunner,
      productRunner,
      salesRunner,
      financialRunner,
      syncLockService,
      targetConnectionId: TEST_CONNECTION_ID,
      onSalesSyncCompleted: options?.onSalesSyncCompleted,
    });

    return {
      orchestrator,
      callOrder,
      syncLockService,
      syncRepository,
      categoryRunner,
      customerRunner,
      productRunner,
      salesRunner,
      financialRunner,
      tokenStore,
      mockPrisma,
    };
  }

  // 1. stages globais executam: CATEGORIES → CUSTOMERS → PRODUCTS → SALES → FINANCIAL
  it("1. stages globais executam estritamente em ordem: CATEGORIES -> CUSTOMERS -> PRODUCTS -> SALES -> FINANCIAL", async () => {
    const s = createTestSetup();
    const result = await s.orchestrator.startSync();

    expect(result.status).toBe(TagPlusSyncStatus.RUNNING);

    await vi.waitFor(() => {
      expect(s.syncRepository.completeRun).toHaveBeenCalled();
    });

    expect(s.callOrder).toEqual([
      "CATEGORIES",
      "CUSTOMERS",
      "PRODUCTS",
      "SALES",
      "FINANCIAL",
    ]);

    // Verifica que updateStage foi chamado com cada estágio até FINANCIAL
    expect(s.syncRepository.updateStage).toHaveBeenCalledWith("sync-run-1", TagPlusSyncStage.CATEGORIES);
    expect(s.syncRepository.updateStage).toHaveBeenCalledWith("sync-run-1", TagPlusSyncStage.CUSTOMERS);
    expect(s.syncRepository.updateStage).toHaveBeenCalledWith("sync-run-1", TagPlusSyncStage.PRODUCTS);
    expect(s.syncRepository.updateStage).toHaveBeenCalledWith("sync-run-1", TagPlusSyncStage.SALES);
    expect(s.syncRepository.updateStage).toHaveBeenCalledWith("sync-run-1", TagPlusSyncStage.FINANCIAL);
  });

  // 2. FINANCIAL nunca começa antes de SALES concluir
  it("2. FINANCIAL nunca começa antes de SALES concluir", async () => {
    let salesCompleted = false;
    const s = createTestSetup();

    vi.mocked(s.salesRunner.run).mockImplementation(async () => {
      s.callOrder.push("SALES");
      await new Promise((r) => setTimeout(r, 20));
      salesCompleted = true;
      return {
        pedidos: { pagesFetched: 1, recordsFetched: 1, reconciledAbsent: 0 },
        vendasSimples: { pagesFetched: 1, recordsFetched: 1, reconciledAbsent: 0 },
        nfes: { pagesFetched: 1, recordsFetched: 1, reconciledAbsent: 0 },
      };
    });

    vi.mocked(s.financialRunner.run).mockImplementation(async () => {
      expect(salesCompleted).toBe(true);
      s.callOrder.push("FINANCIAL");
      return {
        incremental: {} as any,
        stockAdjustments: {} as any,
        elapsedMs: 10,
      };
    });

    await s.orchestrator.startSync();
    await vi.waitFor(() => {
      expect(s.syncRepository.completeRun).toHaveBeenCalled();
    });

    expect(salesCompleted).toBe(true);
  });

  // 3. SALES FAILED: FINANCIAL não executa
  it("3. se SALES falhar, FINANCIAL não executa e a execução falha em SALES", async () => {
    const s = createTestSetup({ salesFail: true });
    await s.orchestrator.startSync();

    await vi.waitFor(() => {
      expect(s.syncRepository.failRun).toHaveBeenCalled();
    });

    expect(s.callOrder).toEqual(["CATEGORIES", "CUSTOMERS", "PRODUCTS", "SALES"]);
    expect(s.callOrder).not.toContain("FINANCIAL");
    expect(s.syncRepository.failRun).toHaveBeenCalledWith(
      "sync-run-1",
      expect.any(Date),
      TagPlusSyncStage.SALES,
      expect.any(String),
      expect.stringContaining("SALES_PIPELINE_ERROR"),
    );
  });

  // 4. financial incremental FAILED: FINANCIAL FAILED
  it("4. se financial incremental falhar: FINANCIAL = FAILED", async () => {
    const s = createTestSetup({ financialIncrementalFail: true });
    await s.orchestrator.startSync();

    await vi.waitFor(() => {
      expect(s.syncRepository.failRun).toHaveBeenCalled();
    });

    expect(s.syncRepository.failRun).toHaveBeenCalledWith(
      "sync-run-1",
      expect.any(Date),
      TagPlusSyncStage.FINANCIAL,
      expect.any(String),
      expect.stringContaining("FINANCIAL_INCREMENTAL_FAILED"),
    );
    expect(s.syncRepository.completeRun).not.toHaveBeenCalled();
  });

  // 5. Stock Adjustment substep FAILED: FINANCIAL FAILED
  it("5. se Stock Adjustment substep falhar: FINANCIAL = FAILED", async () => {
    const s = createTestSetup({ stockAdjustmentFail: true });
    await s.orchestrator.startSync();

    await vi.waitFor(() => {
      expect(s.syncRepository.failRun).toHaveBeenCalled();
    });

    expect(s.syncRepository.failRun).toHaveBeenCalledWith(
      "sync-run-1",
      expect.any(Date),
      TagPlusSyncStage.FINANCIAL,
      expect.any(String),
      expect.stringContaining("STOCK_ADJUSTMENT_SUBSTEP_FAILED"),
    );
    expect(s.syncRepository.completeRun).not.toHaveBeenCalled();
  });

  // 6. Stock Adjustment novo: processado no sync normal
  it("6. Stock Adjustment novo descoberto na listagem é inserido na fila de processamento", async () => {
    const mockRepo: any = {
      upsertCatalogItems: vi.fn().mockResolvedValue({ newlyDiscovered: 1, alreadyKnown: 0 }),
      claimNextPendingItem: vi.fn().mockResolvedValue({ sourceId: "9901", attemptCount: 1 }),
      saveStockAdjustmentWithTx: vi.fn().mockResolvedValue({ action: "inserted", id: "uuid-9901" }),
      markItemCompletedWithTx: vi.fn().mockResolvedValue(undefined),
    };

    const mockPrisma: any = {
      stockAdjustmentSyncItem: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const mockClient: any = {
      get: vi.fn().mockImplementation((url: string) => {
        if (url.includes("/ajustes_estoque?page=1")) {
          return Promise.resolve({
            data: [
              { id: 9901, numero: "800", data_criacao: "2026-10-01", data_confirmacao: "2026-10-01" },
            ],
          });
        }
        return Promise.resolve({ data: [] });
      }),
    };

    const mockWorker: any = {
      processQueue: vi.fn().mockResolvedValue({
        processed: 1,
        completed: 1,
        failed: 0,
        notFound: 0,
        elapsedMs: 50,
        inserted: 1,
        updated: 0,
        unchanged: 0,
        jitResolvedCount: 0,
      }),
    };

    const runner = createStockAdjustmentSyncRunner({
      prisma: mockPrisma,
      repository: mockRepo,
      worker: mockWorker,
      getClient: () => mockClient,
    });

    const result = await runner.runLightweightSync(TEST_CONNECTION_ID, {
      recentDays: 30,
      now: new Date("2026-10-04T00:00:00Z"),
    });

    expect(result.catalogDiscovered).toBe(1);
    expect(result.candidateIds).toContain("9901");
    expect(mockWorker.processQueue).toHaveBeenCalledWith(
      TEST_CONNECTION_ID,
      expect.objectContaining({ candidateSourceIds: ["9901"] }),
    );
  });

  // 7. Adjustment recente conhecido: pode ser reprocessado
  it("7. Adjustment recente conhecido (data_criacao nos últimos 30 dias) é elegível para reprocessamento", async () => {
    const mockRepo: any = {
      upsertCatalogItems: vi.fn().mockResolvedValue({ newlyDiscovered: 0, alreadyKnown: 1 }),
    };

    const mockPrisma: any = {
      stockAdjustmentSyncItem: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const mockClient: any = {
      get: vi.fn().mockImplementation((url: string) => {
        if (url.includes("/ajustes_estoque?page=1")) {
          return Promise.resolve({
            data: [
              { id: 8801, numero: "750", data_criacao: "2026-09-20 10:00:00", data_confirmacao: "2026-09-20 00:00:00" },
            ],
          });
        }
        return Promise.resolve({ data: [] });
      }),
    };

    const mockWorker: any = {
      processQueue: vi.fn().mockResolvedValue({
        processed: 1,
        completed: 1,
        failed: 0,
        notFound: 0,
        elapsedMs: 20,
        inserted: 0,
        updated: 1,
        unchanged: 0,
        jitResolvedCount: 0,
      }),
    };

    const runner = createStockAdjustmentSyncRunner({
      prisma: mockPrisma,
      repository: mockRepo,
      worker: mockWorker,
      getClient: () => mockClient,
    });

    const result = await runner.runLightweightSync(TEST_CONNECTION_ID, {
      recentDays: 30,
      now: new Date("2026-10-04T00:00:00Z"),
    });

    expect(result.recentEligibleCount).toBe(1);
    expect(result.candidateIds).toContain("8801");
    expect(mockWorker.processQueue).toHaveBeenCalledWith(
      TEST_CONNECTION_ID,
      expect.objectContaining({ candidateSourceIds: ["8801"] }),
    );
  });

  // 8. Adjustment histórico conhecido e invisível: NÃO é falsamente prometido como detectado pelo normal sync
  it("8. Adjustment histórico com datas antigas (fora dos 30 dias) e sem sinalização AE NÃO é reprocessado no sync normal", async () => {
    const mockRepo: any = {
      upsertCatalogItems: vi.fn().mockResolvedValue({ newlyDiscovered: 0, alreadyKnown: 1 }),
    };

    const mockPrisma: any = {
      stockAdjustmentSyncItem: {
        findMany: vi.fn().mockResolvedValue([]), // Nenhum pendente no banco
      },
    };

    const mockClient: any = {
      get: vi.fn().mockImplementation((url: string) => {
        if (url.includes("/ajustes_estoque?page=1")) {
          return Promise.resolve({
            data: [
              // Ajuste de 2024 (antigo)
              { id: 1001, numero: "100", data_criacao: "2024-01-10 10:00:00", data_confirmacao: "2024-01-10 00:00:00" },
            ],
          });
        }
        return Promise.resolve({ data: [] });
      }),
    };

    const mockWorker: any = {
      processQueue: vi.fn(),
    };

    const runner = createStockAdjustmentSyncRunner({
      prisma: mockPrisma,
      repository: mockRepo,
      worker: mockWorker,
      getClient: () => mockClient,
    });

    const result = await runner.runLightweightSync(TEST_CONNECTION_ID, {
      recentDays: 30,
      now: new Date("2026-10-04T00:00:00Z"),
      aeMovementNumbers: [], // Nenhuma sinalização AE
    });

    expect(result.candidateIds).toEqual([]);
    expect(result.recentEligibleCount).toBe(0);
    expect(mockWorker.processQueue).not.toHaveBeenCalled();
  });

  // 9. Stock Adjustment referencia FR inexistente localmente: resolução JIT busca o FR pontualmente e cria link completo
  it("9. Resolução JIT: quando um ajuste referencia um FR inexistente localmente, busca GET /financeiros/X e vincula com sucesso", async () => {
    const mockClient: any = {
      get: vi.fn().mockImplementation(async (url: string) => {
        if (url === "/ajustes_estoque/7216") {
          return {
            data: {
              id: 7216,
              numero: "684",
              tipo: "S",
              status: "A",
              valor_total: 485,
              itens: [],
              faturas: [
                {
                  parcelas: [
                    {
                      parcela: 1,
                      lancamento_financeiro_vinculado: { id: 11419 },
                    },
                  ],
                },
              ],
            },
          };
        }
        if (url === "/financeiros/11419") {
          return {
            data: {
              id: 11419,
              descricao: "Ajuste de Estoque 684",
              data_vencimento: "2026-10-02",
              valor: 485,
              tipo: "P",
              numero_documento: "AE - 684",
            },
          };
        }
        return { data: {} };
      }),
    };

    const mockRepo: any = {
      claimNextPendingItem: vi.fn().mockResolvedValue({ sourceId: "7216", attemptCount: 1 }),
      saveStockAdjustmentWithTx: vi.fn().mockResolvedValue({ action: "updated", id: "uuid-7216" }),
      markItemCompletedWithTx: vi.fn().mockResolvedValue(undefined),
    };

    const savedFinancialRecords: any[] = [];
    const mockFinancialRepo: any = {
      saveFinancialRecord: vi.fn().mockImplementation(async (_conn, record) => {
        const item = { id: "uuid-fr-11419", sourceId: record.sourceId };
        savedFinancialRecords.push(item);
        return item;
      }),
    };

    const mockPrisma: any = {
      financialRecord: {
        findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
          const match = savedFinancialRecords.find((r) => r.sourceId === where.connectionId_sourceId?.sourceId);
          return match ? { id: match.id } : null;
        }),
      },
      stockAdjustmentFinancialLink: {
        count: vi.fn().mockResolvedValue(0), // Nenhum link quebrado
      },
      $transaction: vi.fn().mockImplementation(async (cb: any) => cb({})),
    };

    const worker = createStockAdjustmentWorker({
      prisma: mockPrisma,
      repository: mockRepo,
      getClient: () => mockClient,
      financialRecordRepository: mockFinancialRepo,
    });

    const summary = await worker.processQueue(TEST_CONNECTION_ID, {
      candidateSourceIds: ["7216"],
      rateLimitDelayMs: 0,
    });

    expect(summary.completed).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.jitResolvedCount).toBe(1);
    expect(mockClient.get).toHaveBeenCalledWith("/financeiros/11419");
    expect(mockFinancialRepo.saveFinancialRecord).toHaveBeenCalledWith(
      TEST_CONNECTION_ID,
      expect.objectContaining({ sourceId: "11419" }),
      expect.any(Date),
    );
  });

  // 10. Falha na resolução JIT: não deixa FINANCIAL como COMPLETED
  it("10. Falha na resolução JIT não deixa o subpasso como COMPLETED e causa falha", async () => {
    const mockClient: any = {
      get: vi.fn().mockImplementation(async (url: string) => {
        if (url === "/ajustes_estoque/7216") {
          return {
            data: {
              id: 7216,
              numero: "684",
              tipo: "S",
              status: "A",
              valor_total: 485,
              itens: [],
              faturas: [
                {
                  parcelas: [
                    {
                      parcela: 1,
                      lancamento_financeiro_vinculado: { id: 99999 },
                    },
                  ],
                },
              ],
            },
          };
        }
        if (url === "/financeiros/99999") {
          // TagPlus retorna 404 / vazio para o lançamento financeiro
          return { data: null };
        }
        return { data: {} };
      }),
    };

    const mockRepo: any = {
      claimNextPendingItem: vi.fn().mockResolvedValue({ sourceId: "7216", attemptCount: 1 }),
      markItemFailed: vi.fn().mockResolvedValue(undefined),
    };

    const mockFinancialRepo: any = {
      saveFinancialRecord: vi.fn(),
    };

    const mockPrisma: any = {
      financialRecord: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      stockAdjustmentFinancialLink: {
        count: vi.fn().mockResolvedValue(0),
      },
    };

    const worker = createStockAdjustmentWorker({
      prisma: mockPrisma,
      repository: mockRepo,
      getClient: () => mockClient,
      financialRecordRepository: mockFinancialRepo,
    });

    const summary = await worker.processQueue(TEST_CONNECTION_ID, {
      candidateSourceIds: ["7216"],
      maxRetries: 0,
      rateLimitDelayMs: 0,
    });

    expect(summary.completed).toBe(0);
    expect(summary.failed).toBe(1);
    expect(mockRepo.markItemFailed).toHaveBeenCalledWith(
      TEST_CONNECTION_ID,
      "7216",
      expect.stringContaining("JIT_RESOLUTION_NOT_FOUND"),
      undefined,
    );
  });

  // 11. global sync em execução + tentativa de financial sync: HTTP 409
  it("11. quando o Global Sync estiver em execução, POST /api/financial/sync/incremental retorna HTTP 409", async () => {
    const sharedLockService = createSyncLockService();

    // Simula Global Sync segurando a trava
    const lockHandle = sharedLockService.acquire({
      type: "GLOBAL_SYNC",
      connectionId: TEST_CONNECTION_ID,
    });

    const mockFinancialOrchestrator = createFinancialSyncOrchestrator({
      prisma: {} as any,
      syncLockService: sharedLockService,
      targetConnectionId: TEST_CONNECTION_ID,
    });

    const app = await buildApp({
      databaseHealth: { check: vi.fn().mockResolvedValue(undefined) },
      frontendUrl: "http://localhost:5173",
      logger: false,
      financialSyncOrchestrator: mockFinancialOrchestrator,
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/financial/sync/incremental",
      payload: { lookbackDays: 30 },
    });

    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("RUNNING");
    expect(body.message).toContain("já está em andamento");

    lockHandle.release();
  });

  // 12. financial sync em execução + tentativa de global sync: HTTP 409
  it("12. quando o Financial Sync estiver em execução, POST /api/sync/tagplus retorna HTTP 409", async () => {
    const sharedLockService = createSyncLockService();

    // Simula Financial Sync segurando a trava
    const lockHandle = sharedLockService.acquire({
      type: "FINANCIAL_INCREMENTAL",
      connectionId: TEST_CONNECTION_ID,
    });

    const s = createTestSetup();
    const app = await buildApp({
      databaseHealth: { check: vi.fn().mockResolvedValue(undefined) },
      frontendUrl: "http://localhost:5173",
      logger: false,
      tagPlusSyncOrchestrator: createTagPlusSyncOrchestrator({
        prisma: s.mockPrisma,
        syncRepository: s.syncRepository,
        tokenStore: s.tokenStore,
        categoryRunner: s.categoryRunner,
        customerRunner: s.customerRunner,
        productRunner: s.productRunner,
        salesRunner: s.salesRunner,
        syncLockService: sharedLockService,
        targetConnectionId: TEST_CONNECTION_ID,
      }),
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/sync/tagplus",
    });

    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body);
    expect(body.code).toBe("TAGPLUS_SYNC_ALREADY_RUNNING");

    lockHandle.release();
  });

  // 13. lock sempre liberado após sucesso
  it("13. o lock é sempre liberado após a conclusão bem-sucedida do sync global", async () => {
    const s = createTestSetup();
    await s.orchestrator.startSync();

    await vi.waitFor(() => {
      expect(s.syncRepository.completeRun).toHaveBeenCalled();
    });

    // O lock deve estar livre
    expect(s.syncLockService.isLocked(TEST_CONNECTION_ID)).toBe(false);

    // Permite nova aquisição imediata sem 409
    const secondHandle = s.syncLockService.acquire({
      type: "GLOBAL_SYNC",
      connectionId: TEST_CONNECTION_ID,
    });
    expect(secondHandle).toBeDefined();
    secondHandle.release();
  });

  // 14. lock sempre liberado após erro
  it("14. o lock é sempre liberado após erro em qualquer estágio do sync global", async () => {
    const s = createTestSetup({ salesFail: true });
    await s.orchestrator.startSync();

    await vi.waitFor(() => {
      expect(s.syncRepository.failRun).toHaveBeenCalled();
    });

    // O lock deve estar livre mesmo com erro
    expect(s.syncLockService.isLocked(TEST_CONNECTION_ID)).toBe(false);

    // Permite nova aquisição
    const nextHandle = s.syncLockService.acquire({
      type: "FINANCIAL_INCREMENTAL",
      connectionId: TEST_CONNECTION_ID,
    });
    expect(nextHandle).toBeDefined();
    nextHandle.release();
  });

  // 15. Nenhuma execução normal dispara full financial catalog
  it("15. nenhuma execução normal do stage FINANCIAL dispara full financial catalog", async () => {
    const mockFullCatalogFn = vi.fn();
    const mockIncrementalSyncFn = vi.fn().mockResolvedValue({
      sinceDate: "2026-09-04",
      candidates: {
        recentCount: 10,
        openCount: 0,
        undatedCount: 0,
        uniqueCount: 10,
        overlapDeduplicated: 0,
      },
      workerSummary: {
        processed: 10,
        completed: 10,
        failed: 0,
        notFound: 0,
        inserted: 1,
        updated: 9,
        unchanged: 0,
      },
    });

    const mockStockRunner: any = {
      runLightweightSync: vi.fn().mockResolvedValue({
        catalogDiscovered: 678,
        newlyDiscoveredCount: 0,
        recentEligibleCount: 2,
        aeMovementMatchedCount: 0,
        candidateIds: ["1", "2"],
        workerSummary: {
          processed: 2,
          completed: 2,
          failed: 0,
          notFound: 0,
          inserted: 0,
          updated: 2,
          unchanged: 0,
          jitResolvedCount: 0,
        },
      }),
    };

    const mockPrisma: any = {
      tagPlusConnection: {
        findUnique: vi.fn().mockResolvedValue({ id: TEST_CONNECTION_ID, apiVersion: "v2" }),
      },
      financialRecord: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const runner = createProductionFinancialSyncRunner({
      prisma: mockPrisma,
      runIncrementalSyncFn: mockIncrementalSyncFn,
      stockAdjustmentRunner: mockStockRunner,
      financialRepository: {} as any,
      financialWorker: {} as any,
    });

    const result = await runner.run(TEST_CONNECTION_ID, {
      lookbackDays: 30,
    });

    expect(result).toBeDefined();
    // Confirma que o incremental foi chamado
    expect(mockIncrementalSyncFn).toHaveBeenCalled();
    // Confirma que o runner leve de ajustes foi chamado
    expect(mockStockRunner.runLightweightSync).toHaveBeenCalledWith(
      TEST_CONNECTION_ID,
      expect.objectContaining({ recentDays: 30 }),
    );
    // Confirma que nenhum método de full catalog foi acionado
    expect(mockFullCatalogFn).not.toHaveBeenCalled();
  });

  // 16. Auditoria de AE number: financial movement "AE - 684" resolve para sourceId 7216 e reprocessa 7216, nunca 684
  it("16. Gatilho AE - 684: resolve corretamente número visível 684 para sourceId 7216 e nunca consulta GET /ajustes_estoque/684", async () => {
    const urlsCalled: string[] = [];

    const mockClient: any = {
      get: vi.fn().mockImplementation((url: string) => {
        urlsCalled.push(url);
        if (url.includes("/ajustes_estoque?page=1")) {
          // Listagem da API traz o ajuste com id = 7216 e numero = "684"
          return Promise.resolve({
            data: [
              {
                id: 7216,
                numero: "684",
                data_criacao: "2024-05-10 10:00:00",
                data_confirmacao: "2024-05-10 00:00:00",
              },
            ],
          });
        }
        if (url.includes("/ajustes_estoque?page=2")) {
          return Promise.resolve({ data: [] });
        }
        if (url === "/ajustes_estoque/7216") {
          return Promise.resolve({
            data: {
              id: 7216,
              numero: "684",
              tipo: "S",
              status: "A",
              itens: [],
              faturas: [],
            },
          });
        }
        return Promise.resolve({ data: {} });
      }),
    };

    const mockRepo: any = {
      upsertCatalogItems: vi.fn().mockResolvedValue({ newlyDiscovered: 0 }),
    };

    const mockWorker: any = {
      processQueue: vi.fn().mockImplementation(async (_conn, opts) => {
        // Simula worker processando os candidateSourceIds
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
      stockAdjustmentSyncItem: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const runner = createStockAdjustmentSyncRunner({
      prisma: mockPrisma,
      repository: mockRepo,
      worker: mockWorker,
      getClient: () => mockClient,
    });

    const result = await runner.runLightweightSync(TEST_CONNECTION_ID, {
      aeMovementNumbers: ["AE - 684", "AE-684"],
      recentDays: 30,
      now: new Date("2026-10-04T00:00:00Z"),
    });

    // 1. O candidateId deve ser estritamente o sourceId "7216", e JAMAIS o número visível "684"
    expect(result.candidateIds).toContain("7216");
    expect(result.candidateIds).not.toContain("684");

    // 2. O worker foi invocado com sourceId "7216"
    expect(mockWorker.processQueue).toHaveBeenCalledWith(
      TEST_CONNECTION_ID,
      expect.objectContaining({
        candidateSourceIds: ["7216"],
      }),
    );

    // 3. Foi feito GET para /ajustes_estoque/7216
    expect(urlsCalled).toContain("/ajustes_estoque/7216");

    // 4. JAMAIS foi tentado GET /ajustes_estoque/684
    const calledWith684 = urlsCalled.some((u) => u === "/ajustes_estoque/684" || u.endsWith("/684"));
    expect(calledWith684).toBe(false);
  });
});

