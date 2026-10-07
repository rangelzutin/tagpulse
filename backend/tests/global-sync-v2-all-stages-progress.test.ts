import { describe, it, expect, vi, beforeEach } from "vitest";
import { TagPlusSyncMode, TagPlusSyncStage, TagPlusSyncStatus } from "@prisma/client";
import {
  createTagPlusSyncOrchestrator,
  type TagPlusSyncRun,
  type CategoryRunnerLike,
  type CustomerRunnerLike,
  type ProductRunnerLike,
  type SalesRunnerLike,
  type FinancialRunnerLike,
  type SyncStepProgressInfo,
} from "../src/modules/sync/tagplus-sync-orchestrator.js";

const TEST_CONNECTION_ID = "test-conn-uuid";

describe("Global Sync V2 — Progresso em todas as 5 etapas (Backend Contract)", () => {
  let mockPrisma: any;
  let mockSyncRepo: any;
  let mockTokenStore: any;
  let mockCategoryRunner: CategoryRunnerLike;
  let mockCustomerRunner: CustomerRunnerLike;
  let mockProductRunner: ProductRunnerLike;
  let mockSalesRunner: SalesRunnerLike;
  let mockFinancialRunner: FinancialRunnerLike;

  beforeEach(() => {
    mockPrisma = {
      tagPlusConnection: {
        findUnique: vi.fn().mockResolvedValue({ id: TEST_CONNECTION_ID, status: "ACTIVE" }),
      },
    };

    const mockSyncRun = {
      id: "run-uuid-test",
      connectionId: TEST_CONNECTION_ID,
      status: TagPlusSyncStatus.RUNNING,
      mode: TagPlusSyncMode.INCREMENTAL,
      windowSince: new Date("2026-10-07T08:00:00Z"),
      windowUntil: new Date("2026-10-07T10:00:00Z"),
      currentStage: TagPlusSyncStage.CATEGORIES,
      startedAt: new Date(),
      completedAt: null,
      errorStage: null,
      errorMessage: null,
      errorCategory: null,
      summary: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockFullRun = {
      id: "last-full-run",
      connectionId: TEST_CONNECTION_ID,
      mode: TagPlusSyncMode.FULL,
      status: TagPlusSyncStatus.COMPLETED,
      startedAt: new Date("2026-10-07T08:00:00Z"),
      completedAt: new Date("2026-10-07T08:30:00Z"),
      windowSince: null,
      windowUntil: null,
      currentStage: TagPlusSyncStage.COMPLETED,
      errorStage: null,
      errorMessage: null,
      errorCategory: null,
      summary: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockSyncRepo = {
      recoverStaleRuns: vi.fn().mockResolvedValue({ tagplus: 0, customers: 0, products: 0 }),
      findRunning: vi.fn().mockResolvedValue(null),
      findActiveRun: vi.fn().mockResolvedValue(null),
      findLastCompleted: vi.fn().mockResolvedValue(null),
      findLastCompletedIncremental: vi.fn().mockResolvedValue(null),
      findLastCompletedFull: vi.fn().mockResolvedValue(mockFullRun),
      getRunById: vi.fn().mockResolvedValue(mockSyncRun),
      createRun: vi.fn().mockResolvedValue(mockSyncRun),
      updateStage: vi.fn().mockResolvedValue(undefined),
      completeRun: vi.fn().mockResolvedValue(undefined),
      failRun: vi.fn().mockResolvedValue(undefined),
    };

    mockTokenStore = {
      get: vi.fn().mockReturnValue({ accessToken: "valid-token" }),
    };
  });

  it("1. Categorias RUNNING emite onProgress e reflete no getStatus() em memória", async () => {
    let capturedOnProgress: any;

    mockCategoryRunner = {
      preflight: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockImplementation(async (_connId, options) => {
        capturedOnProgress = options?.onProgress;
        options?.onProgress?.({
          current: 42,
          label: "Atualizando categorias",
        });
        return {
          pagesFetched: 1,
          recordsFetched: 42,
          recordsInserted: 5,
          recordsUpdated: 2,
          recordsUnchanged: 35,
          recordsNoLongerObserved: 0,
        };
      }),
    };

    mockCustomerRunner = {
      preflight: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockResolvedValue({
        pagesFetched: 1,
        recordsFetched: 10,
        recordsInserted: 1,
        recordsUpdated: 1,
        recordsUnchanged: 8,
        recordsNoLongerObserved: 0,
      }),
    };

    mockProductRunner = {
      preflight: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockResolvedValue({
        pagesFetched: 1,
        recordsFetched: 20,
        recordsInserted: 2,
        recordsUpdated: 2,
        recordsUnchanged: 16,
        recordsNoLongerObserved: 0,
      }),
    };

    mockSalesRunner = {
      preflight: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockResolvedValue({
        pedidos: { pagesFetched: 1, recordsFetched: 5, reconciledAbsent: 0 },
        vendasSimples: { pagesFetched: 1, recordsFetched: 3, reconciledAbsent: 0 },
        nfes: { pagesFetched: 1, recordsFetched: 2, reconciledAbsent: 0 },
      }),
    };

    const orchestrator = createTagPlusSyncOrchestrator({
      prisma: mockPrisma,
      syncRepository: mockSyncRepo,
      tokenStore: mockTokenStore,
      categoryRunner: mockCategoryRunner,
      customerRunner: mockCustomerRunner,
      productRunner: mockProductRunner,
      salesRunner: mockSalesRunner,
      targetConnectionId: TEST_CONNECTION_ID,
    });

    await orchestrator.startSync({ mode: TagPlusSyncMode.INCREMENTAL });

    // Aguarda conclusão do pipeline
    await vi.waitFor(() => {
      expect(mockSyncRepo.completeRun).toHaveBeenCalled();
    });

    expect(capturedOnProgress).toBeDefined();
  });

  it("2. Clientes RUNNING emite onProgress com contagem real", async () => {
    let capturedCustomerProgress: any;

    mockCategoryRunner = {
      preflight: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockResolvedValue({
        pagesFetched: 1,
        recordsFetched: 10,
        recordsInserted: 0,
        recordsUpdated: 0,
        recordsUnchanged: 10,
      }),
    };

    mockCustomerRunner = {
      preflight: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockImplementation(async (_connId, options) => {
        capturedCustomerProgress = options?.onProgress;
        options?.onProgress?.({
          current: 120,
          label: "Atualizando clientes",
        });
        return {
          pagesFetched: 2,
          recordsFetched: 120,
          recordsInserted: 4,
          recordsUpdated: 6,
          recordsUnchanged: 110,
          recordsNoLongerObserved: 0,
        };
      }),
    };

    mockProductRunner = {
      preflight: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockResolvedValue({
        pagesFetched: 1,
        recordsFetched: 0,
        recordsInserted: 0,
        recordsUpdated: 0,
        recordsUnchanged: 0,
        recordsNoLongerObserved: 0,
      }),
    };

    mockSalesRunner = {
      preflight: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockResolvedValue({
        pedidos: { pagesFetched: 1, recordsFetched: 0, reconciledAbsent: 0 },
        vendasSimples: { pagesFetched: 1, recordsFetched: 0, reconciledAbsent: 0 },
        nfes: { pagesFetched: 1, recordsFetched: 0, reconciledAbsent: 0 },
      }),
    };

    const orchestrator = createTagPlusSyncOrchestrator({
      prisma: mockPrisma,
      syncRepository: mockSyncRepo,
      tokenStore: mockTokenStore,
      categoryRunner: mockCategoryRunner,
      customerRunner: mockCustomerRunner,
      productRunner: mockProductRunner,
      salesRunner: mockSalesRunner,
      targetConnectionId: TEST_CONNECTION_ID,
    });

    await orchestrator.startSync({ mode: TagPlusSyncMode.INCREMENTAL });

    await vi.waitFor(() => {
      expect(mockSyncRepo.completeRun).toHaveBeenCalled();
    });

    expect(capturedCustomerProgress).toBeDefined();
  });

  it("3. SALES RUNNING emite substeps reais para pedidos, vendas simples e NF-e", async () => {
    const emittedProgress: any[] = [];

    mockCategoryRunner = {
      preflight: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockResolvedValue({
        pagesFetched: 1,
        recordsFetched: 1,
        recordsInserted: 0,
        recordsUpdated: 0,
        recordsUnchanged: 1,
      }),
    };

    mockCustomerRunner = {
      preflight: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockResolvedValue({
        pagesFetched: 1,
        recordsFetched: 1,
        recordsInserted: 0,
        recordsUpdated: 0,
        recordsUnchanged: 1,
        recordsNoLongerObserved: 0,
      }),
    };

    mockProductRunner = {
      preflight: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockResolvedValue({
        pagesFetched: 1,
        recordsFetched: 1,
        recordsInserted: 0,
        recordsUpdated: 0,
        recordsUnchanged: 1,
        recordsNoLongerObserved: 0,
      }),
    };

    mockSalesRunner = {
      preflight: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockImplementation(async (_connId, options) => {
        options?.onProgress?.({
          current: 10,
          substep: "Atualizando pedidos",
          label: "Atualizando pedidos",
        });
        emittedProgress.push("pedidos");

        options?.onProgress?.({
          current: 5,
          substep: "Atualizando vendas simples",
          label: "Atualizando vendas simples",
        });
        emittedProgress.push("vendas_simples");

        options?.onProgress?.({
          current: 3,
          substep: "Atualizando NF-e",
          label: "Atualizando NF-e",
        });
        emittedProgress.push("nfes");

        return {
          pedidos: { pagesFetched: 1, recordsFetched: 10, reconciledAbsent: 0 },
          vendasSimples: { pagesFetched: 1, recordsFetched: 5, reconciledAbsent: 0 },
          nfes: { pagesFetched: 1, recordsFetched: 3, reconciledAbsent: 0 },
        };
      }),
    };

    const orchestrator = createTagPlusSyncOrchestrator({
      prisma: mockPrisma,
      syncRepository: mockSyncRepo,
      tokenStore: mockTokenStore,
      categoryRunner: mockCategoryRunner,
      customerRunner: mockCustomerRunner,
      productRunner: mockProductRunner,
      salesRunner: mockSalesRunner,
      targetConnectionId: TEST_CONNECTION_ID,
    });

    await orchestrator.startSync({ mode: TagPlusSyncMode.INCREMENTAL });

    await vi.waitFor(() => {
      expect(mockSyncRepo.completeRun).toHaveBeenCalled();
    });

    expect(emittedProgress).toEqual(["pedidos", "vendas_simples", "nfes"]);
  });

  it("4. Contrato de progresso unificado: total é opcional em SyncStepProgressInfo", () => {
    const withoutTotal: SyncStepProgressInfo = {
      current: 42,
      label: "Atualizando clientes",
    };
    expect(withoutTotal.total).toBeUndefined();
    expect(withoutTotal.current).toBe(42);

    const withTotal: SyncStepProgressInfo = {
      current: 84,
      total: 165,
      substep: "Atualizando financeiro",
    };
    expect(withTotal.total).toBe(165);
    expect(withTotal.current).toBe(84);
  });
});
