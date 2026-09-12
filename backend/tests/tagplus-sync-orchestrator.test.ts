import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { TagPlusSyncStage, TagPlusSyncStatus } from "@prisma/client";
import { createTagPlusOAuthTokenStore } from "../src/integrations/tagplus/oauth-token-store.js";
import {
  createTagPlusSyncOrchestrator,
  TagPlusOAuthRequiredError,
  TagPlusSyncAlreadyRunningError,
  type CustomerRunnerLike,
  type ProductRunnerLike,
  type SalesRunnerLike,
} from "../src/modules/sync/tagplus-sync-orchestrator.js";
import type { TagPlusSyncRepository } from "../src/modules/sync/tagplus-sync-repository.js";

const TEST_CONNECTION_ID = "8e1d662c-c9f3-4fee-9618-bb984573fa2a";

function createHarness(options?: {
  tokenAvailable?: boolean;
  activeRunInDb?: boolean;
  customerFail?: boolean;
  productFail?: boolean;
  salesFail?: boolean;
}) {
  const tokenStore = createTagPlusOAuthTokenStore();
  if (options?.tokenAvailable !== false) {
    tokenStore.set({ accessToken: "test-valid-access-token" });
  }

  const callOrder: string[] = [];

  const customerRunner: CustomerRunnerLike = {
    preflight: vi.fn().mockImplementation(async () => {
      callOrder.push("customer:preflight");
    }),
    run: vi.fn().mockImplementation(async () => {
      callOrder.push("customer:run");
      if (options?.customerFail) {
        throw new Error("Customer sync failed on page 2");
      }
      return {
        pagesFetched: 2,
        recordsFetched: 150,
        recordsInserted: 10,
        recordsUpdated: 5,
        recordsUnchanged: 135,
        recordsNoLongerObserved: 0,
      };
    }),
  };

  const productRunner: ProductRunnerLike = {
    preflight: vi.fn().mockImplementation(async () => {
      callOrder.push("product:preflight");
    }),
    run: vi.fn().mockImplementation(async () => {
      callOrder.push("product:run");
      if (options?.productFail) {
        throw new Error("Product sync failed");
      }
      return {
        pagesFetched: 1,
        recordsFetched: 50,
        recordsInserted: 50,
        recordsUpdated: 0,
        recordsUnchanged: 0,
        recordsNoLongerObserved: 0,
      };
    }),
  };

  const salesRunner: SalesRunnerLike = {
    preflight: vi.fn().mockImplementation(async () => {
      callOrder.push("sales:preflight");
    }),
    run: vi.fn().mockImplementation(async () => {
      callOrder.push("sales:run");
      if (options?.salesFail) {
        throw new Error("Sales sync failed on nfes (HTTP 401 with Bearer secret-leaked-token)");
      }
      return {
        pedidos: { pagesFetched: 1, recordsFetched: 20, reconciledAbsent: 0 },
        vendasSimples: { pagesFetched: 1, recordsFetched: 5, reconciledAbsent: 0 },
        nfes: { pagesFetched: 1, recordsFetched: 10, reconciledAbsent: 0 },
      };
    }),
  };

  const mockSyncRun = {
    id: "run-uuid-1",
    connectionId: TEST_CONNECTION_ID,
    status: TagPlusSyncStatus.RUNNING,
    currentStage: TagPlusSyncStage.CUSTOMERS,
    startedAt: new Date("2026-09-11T21:00:00Z"),
    completedAt: null,
    errorStage: null,
    errorMessage: null,
    errorCategory: null,
    summary: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const syncRepository: TagPlusSyncRepository = {
    recoverStaleRuns: vi.fn().mockResolvedValue({ tagplus: 0, customers: 0, products: 0 }),
    findRunning: vi.fn().mockResolvedValue(options?.activeRunInDb ? mockSyncRun : null),
    findActiveRun: vi.fn().mockResolvedValue(options?.activeRunInDb ? mockSyncRun : null),
    findLastCompleted: vi.fn().mockResolvedValue(null),
    getRunById: vi.fn().mockResolvedValue(mockSyncRun),
    createRun: vi.fn().mockResolvedValue(mockSyncRun),
    updateStage: vi.fn().mockResolvedValue(undefined),
    completeRun: vi.fn().mockResolvedValue(undefined),
    failRun: vi.fn().mockResolvedValue(undefined),
  };

  const prisma = {
    tagPlusConnection: {
      findUnique: vi.fn().mockResolvedValue({ id: TEST_CONNECTION_ID, status: "ACTIVE" }),
      findFirst: vi.fn().mockResolvedValue({ id: TEST_CONNECTION_ID, status: "ACTIVE" }),
    },
    tagPlusSyncRun: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  } as unknown as PrismaClient;

  const orchestrator = createTagPlusSyncOrchestrator({
    prisma,
    syncRepository,
    tokenStore,
    customerRunner,
    productRunner,
    salesRunner,
    targetConnectionId: TEST_CONNECTION_ID,
  });

  return {
    orchestrator,
    callOrder,
    customerRunner,
    productRunner,
    salesRunner,
    syncRepository,
    tokenStore,
  };
}

describe("TagPlusSyncOrchestrator", () => {
  it("rejects startSync if OAuth token is missing with TagPlusOAuthRequiredError", async () => {
    const h = createHarness({ tokenAvailable: false });
    await expect(h.orchestrator.startSync()).rejects.toThrow(TagPlusOAuthRequiredError);
    expect(h.syncRepository.createRun).not.toHaveBeenCalled();
  });

  it("rejects startSync if another sync is already running in database", async () => {
    const h = createHarness({ activeRunInDb: true });
    await expect(h.orchestrator.startSync()).rejects.toThrow(TagPlusSyncAlreadyRunningError);
  });

  it("executes strictly in order: Customers -> Products -> Sales and marks COMPLETED on success", async () => {
    const h = createHarness();
    const startResult = await h.orchestrator.startSync();

    expect(startResult).toEqual(
      expect.objectContaining({
        runId: "run-uuid-1",
        status: TagPlusSyncStatus.RUNNING,
        currentStage: TagPlusSyncStage.CUSTOMERS,
      }),
    );

    // Wait for async pipeline execution
    await vi.waitFor(() => {
      expect(h.syncRepository.completeRun).toHaveBeenCalled();
    });

    expect(h.callOrder).toEqual([
      "customer:preflight",
      "product:preflight",
      "sales:preflight",
      "customer:run",
      "product:run",
      "sales:run",
    ]);

    expect(h.syncRepository.updateStage).toHaveBeenCalledWith("run-uuid-1", TagPlusSyncStage.CUSTOMERS);
    expect(h.syncRepository.updateStage).toHaveBeenCalledWith("run-uuid-1", TagPlusSyncStage.PRODUCTS);
    expect(h.syncRepository.updateStage).toHaveBeenCalledWith("run-uuid-1", TagPlusSyncStage.SALES);

    expect(h.syncRepository.completeRun).toHaveBeenCalledWith(
      "run-uuid-1",
      expect.any(Date),
      expect.objectContaining({
        customers: expect.objectContaining({ recordsFetched: 150 }),
        products: expect.objectContaining({ recordsFetched: 50 }),
        sales: expect.objectContaining({
          pedidos: expect.objectContaining({ recordsFetched: 20 }),
          vendasSimples: expect.objectContaining({ recordsFetched: 5 }),
          nfes: expect.objectContaining({ recordsFetched: 10 }),
        }),
      }),
    );
  });

  it("does NOT run Products or Sales if Customers fails", async () => {
    const h = createHarness({ customerFail: true });
    await h.orchestrator.startSync();

    await vi.waitFor(() => {
      expect(h.syncRepository.failRun).toHaveBeenCalled();
    });

    expect(h.callOrder).toContain("customer:run");
    expect(h.callOrder).not.toContain("product:run");
    expect(h.callOrder).not.toContain("sales:run");

    expect(h.syncRepository.failRun).toHaveBeenCalledWith(
      "run-uuid-1",
      expect.any(Date),
      TagPlusSyncStage.CUSTOMERS,
      expect.any(String),
      "Customer sync failed on page 2",
    );
    expect(h.syncRepository.completeRun).not.toHaveBeenCalled();
  });

  it("does NOT run Sales if Products fails", async () => {
    const h = createHarness({ productFail: true });
    await h.orchestrator.startSync();

    await vi.waitFor(() => {
      expect(h.syncRepository.failRun).toHaveBeenCalled();
    });

    expect(h.callOrder).toContain("customer:run");
    expect(h.callOrder).toContain("product:run");
    expect(h.callOrder).not.toContain("sales:run");

    expect(h.syncRepository.failRun).toHaveBeenCalledWith(
      "run-uuid-1",
      expect.any(Date),
      TagPlusSyncStage.PRODUCTS,
      expect.any(String),
      "Product sync failed",
    );
  });

  it("sanitizes error messages and redacts tokens/credentials", async () => {
    const h = createHarness({ salesFail: true });
    await h.orchestrator.startSync();

    await vi.waitFor(() => {
      expect(h.syncRepository.failRun).toHaveBeenCalled();
    });

    const failCall = vi.mocked(h.syncRepository.failRun).mock.calls[0];
    const errorMessage = failCall[4];
    expect(errorMessage).not.toContain("secret-leaked-token");
    expect(errorMessage).toContain("[REDACTED_TOKEN]");
  });

  it("rejects concurrent execution while in-memory pipeline is running", async () => {
    const h = createHarness();
    // Simulate long customer run
    vi.mocked(h.customerRunner.run).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return {
        pagesFetched: 1,
        recordsFetched: 1,
        recordsInserted: 1,
        recordsUpdated: 0,
        recordsUnchanged: 0,
        recordsNoLongerObserved: 0,
      };
    });

    await h.orchestrator.startSync();

    // Immediate second call while first is still running
    await expect(h.orchestrator.startSync()).rejects.toThrow(TagPlusSyncAlreadyRunningError);
  });

  it("getStatus returns live progress during run and lastCompletedSync", async () => {
    const h = createHarness();
    vi.mocked(h.syncRepository.findLastCompleted).mockResolvedValue({
      id: "run-old",
      connectionId: TEST_CONNECTION_ID,
      status: TagPlusSyncStatus.COMPLETED,
      currentStage: TagPlusSyncStage.COMPLETED,
      startedAt: new Date("2026-09-10T12:00:00Z"),
      completedAt: new Date("2026-09-10T12:05:00Z"),
      errorStage: null,
      errorMessage: null,
      errorCategory: null,
      summary: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Make customer run wait briefly
    let finishCustomerRun: () => void = () => {};
    vi.mocked(h.customerRunner.run).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishCustomerRun = () =>
            resolve({
              pagesFetched: 1,
              recordsFetched: 10,
              recordsInserted: 10,
              recordsUpdated: 0,
              recordsUnchanged: 0,
              recordsNoLongerObserved: 0,
            });
        }),
    );

    await h.orchestrator.startSync();

    const runningStatus = await h.orchestrator.getStatus();
    expect(runningStatus.isRunning).toBe(true);
    expect(runningStatus.activeRun?.status).toBe("RUNNING");
    expect(runningStatus.activeRun?.currentStage).toBe("CUSTOMERS");
    expect(runningStatus.stages.customers.status).toBe("RUNNING");
    expect(runningStatus.lastCompletedSync).toEqual(new Date("2026-09-10T12:05:00Z"));

    finishCustomerRun();
    await vi.waitFor(() => {
      expect(h.syncRepository.completeRun).toHaveBeenCalled();
    });
  });

  it("prevents race condition when two requests call startSync simultaneously", async () => {
    const h = createHarness();
    // Simulate some async delay in preflight or resolve
    let resolveFirstPreflight: () => void = () => {};
    vi.mocked(h.customerRunner.preflight).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirstPreflight = resolve;
        }),
    );

    // Call startSync twice concurrently
    const promise1 = h.orchestrator.startSync();
    const promise2 = h.orchestrator.startSync();

    // The second call MUST reject synchronously with TagPlusSyncAlreadyRunningError
    await expect(promise2).rejects.toThrow(TagPlusSyncAlreadyRunningError);

    // Release the first preflight
    resolveFirstPreflight();
    const result1 = await promise1;
    expect(result1.status).toBe(TagPlusSyncStatus.RUNNING);

    // Confirm that createRun was called exactly ONCE
    expect(h.syncRepository.createRun).toHaveBeenCalledTimes(1);
  });

  it("serializes summary with JSON-safe values including startedAt and completedAt ISO strings", async () => {
    const h = createHarness();
    await h.orchestrator.startSync();

    await vi.waitFor(() => {
      expect(h.syncRepository.completeRun).toHaveBeenCalled();
    });

    const completeCall = vi.mocked(h.syncRepository.completeRun).mock.calls[0];
    const summary = completeCall[2] as Record<string, unknown>;

    expect(typeof summary.startedAt).toBe("string");
    expect(typeof summary.completedAt).toBe("string");
    expect(new Date(summary.startedAt as string).toISOString()).toBe(summary.startedAt);
    expect(new Date(summary.completedAt as string).toISOString()).toBe(summary.completedAt);
    expect(summary.customers).toBeDefined();
    expect(summary.products).toBeDefined();
    expect(summary.sales).toBeDefined();

    // Ensure completely JSON-safe: re-parsing produces identical structure without undefined or non-JSON types
    const reSerialized = JSON.stringify(summary);
    expect(JSON.parse(reSerialized)).toEqual(summary);
  });
});

