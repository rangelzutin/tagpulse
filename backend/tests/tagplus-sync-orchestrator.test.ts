import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { TagPlusSyncMode, TagPlusSyncStage, TagPlusSyncStatus } from "@prisma/client";
import { createTagPlusOAuthTokenStore } from "../src/integrations/tagplus/oauth-token-store.js";
import {
  createTagPlusSyncOrchestrator,
  TagPlusIncrementalBaselineRequiredError,
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
  hasFullBaseline?: boolean;
  hasIncrementalRun?: boolean;
  lastCompletedFullDate?: Date;
  lastCompletedIncrementalWindowUntil?: Date;
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
    mode: TagPlusSyncMode.INCREMENTAL,
    windowSince: new Date("2026-09-11T20:00:00Z"),
    windowUntil: new Date("2026-09-11T21:00:00Z"),
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

  const hasFull = options?.hasFullBaseline !== false;
  const mockFullRun = hasFull
    ? {
        id: "full-run-1",
        connectionId: TEST_CONNECTION_ID,
        mode: TagPlusSyncMode.FULL,
        status: TagPlusSyncStatus.COMPLETED,
        startedAt: options?.lastCompletedFullDate ?? new Date("2026-09-11T20:00:00.123Z"),
        completedAt: new Date("2026-09-11T20:30:00Z"),
        windowSince: null,
        windowUntil: null,
        currentStage: TagPlusSyncStage.COMPLETED,
        errorStage: null,
        errorMessage: null,
        errorCategory: null,
        summary: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    : null;

  const mockIncrementalRun = options?.hasIncrementalRun
    ? {
        id: "inc-run-0",
        connectionId: TEST_CONNECTION_ID,
        mode: TagPlusSyncMode.INCREMENTAL,
        status: TagPlusSyncStatus.COMPLETED,
        startedAt: new Date("2026-09-12T01:00:00Z"),
        completedAt: new Date("2026-09-12T01:05:00Z"),
        windowSince: new Date("2026-09-11T20:00:00Z"),
        windowUntil:
          options?.lastCompletedIncrementalWindowUntil ??
          new Date("2026-09-12T01:00:00Z"),
        currentStage: TagPlusSyncStage.COMPLETED,
        errorStage: null,
        errorMessage: null,
        errorCategory: null,
        summary: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    : null;

  const syncRepository: TagPlusSyncRepository = {
    recoverStaleRuns: vi.fn().mockResolvedValue({ tagplus: 0, customers: 0, products: 0 }),
    findRunning: vi.fn().mockResolvedValue(options?.activeRunInDb ? mockSyncRun : null),
    findActiveRun: vi.fn().mockResolvedValue(options?.activeRunInDb ? mockSyncRun : null),
    findLastCompleted: vi.fn().mockResolvedValue(null),
    findLastCompletedIncremental: vi.fn().mockResolvedValue(mockIncrementalRun),
    findLastCompletedFull: vi.fn().mockResolvedValue(mockFullRun),
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

  const fixedNow = new Date("2026-09-12T14:30:45.678Z");

  const orchestrator = createTagPlusSyncOrchestrator({
    prisma,
    syncRepository,
    tokenStore,
    customerRunner,
    productRunner,
    salesRunner,
    targetConnectionId: TEST_CONNECTION_ID,
    now: () => fixedNow,
  });

  return {
    orchestrator,
    callOrder,
    customerRunner,
    productRunner,
    salesRunner,
    syncRepository,
    tokenStore,
    fixedNow,
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

  it("rejects INCREMENTAL startSync with TagPlusIncrementalBaselineRequiredError if no completed Full or Incremental run exists", async () => {
    const h = createHarness({ hasFullBaseline: false, hasIncrementalRun: false });
    await expect(h.orchestrator.startSync({ mode: TagPlusSyncMode.INCREMENTAL })).rejects.toThrow(
      TagPlusIncrementalBaselineRequiredError,
    );
    expect(h.syncRepository.createRun).not.toHaveBeenCalled();
  });

  it("calculates windowSince from last Completed Full run startedAt (truncated to seconds) for first incremental run", async () => {
    const fullStartedAt = new Date("2026-09-12T02:25:23.057Z");
    const h = createHarness({
      hasFullBaseline: true,
      hasIncrementalRun: false,
      lastCompletedFullDate: fullStartedAt,
    });

    await h.orchestrator.startSync({ mode: TagPlusSyncMode.INCREMENTAL });

    // Verify repository was queried explicitly with connectionId
    expect(h.syncRepository.findLastCompletedIncremental).toHaveBeenCalledWith(TEST_CONNECTION_ID);
    expect(h.syncRepository.findLastCompletedFull).toHaveBeenCalledWith(TEST_CONNECTION_ID);

    // Expected windowSince is fullStartedAt truncated to seconds (zero ms): 2026-09-12T02:25:23.000Z
    const expectedSince = new Date("2026-09-12T02:25:23.000Z");
    const expectedUntil = new Date("2026-09-12T14:30:45.000Z"); // fixedNow truncated

    expect(h.syncRepository.createRun).toHaveBeenCalledWith(
      TEST_CONNECTION_ID,
      h.fixedNow,
      TagPlusSyncMode.INCREMENTAL,
      { since: expectedSince, until: expectedUntil },
    );

    // Wait for pipeline execution to verify runner options
    await vi.waitFor(() => {
      expect(h.syncRepository.completeRun).toHaveBeenCalled();
    });

    // Runners must receive America/Sao_Paulo formatted dates and mode INCREMENTAL
    expect(h.customerRunner.run).toHaveBeenCalledWith(
      TEST_CONNECTION_ID,
      expect.objectContaining({
        mode: TagPlusSyncMode.INCREMENTAL,
        window: {
          since: expect.any(String),
          until: expect.any(String),
        },
      }),
    );
  });

  it("calculates windowSince from last Completed Incremental run windowUntil for subsequent incremental runs", async () => {
    const lastIncrementalWindowUntil = new Date("2026-09-12T12:00:00.000Z");
    const h = createHarness({
      hasFullBaseline: true,
      hasIncrementalRun: true,
      lastCompletedIncrementalWindowUntil: lastIncrementalWindowUntil,
    });

    await h.orchestrator.startSync({ mode: TagPlusSyncMode.INCREMENTAL });

    const expectedSince = lastIncrementalWindowUntil;
    const expectedUntil = new Date("2026-09-12T14:30:45.000Z");

    expect(h.syncRepository.createRun).toHaveBeenCalledWith(
      TEST_CONNECTION_ID,
      h.fixedNow,
      TagPlusSyncMode.INCREMENTAL,
      { since: expectedSince, until: expectedUntil },
    );
  });

  it("executes FULL sync without requiring baseline or window parameters", async () => {
    const h = createHarness({ hasFullBaseline: false, hasIncrementalRun: false });
    await h.orchestrator.startSync({ mode: TagPlusSyncMode.FULL });

    expect(h.syncRepository.createRun).toHaveBeenCalledWith(
      TEST_CONNECTION_ID,
      h.fixedNow,
      TagPlusSyncMode.FULL,
      undefined,
    );

    await vi.waitFor(() => {
      expect(h.syncRepository.completeRun).toHaveBeenCalled();
    });

    expect(h.customerRunner.run).toHaveBeenCalledWith(
      TEST_CONNECTION_ID,
      { mode: TagPlusSyncMode.FULL },
    );
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

    await expect(h.orchestrator.startSync({ mode: TagPlusSyncMode.FULL })).rejects.toThrow(
      TagPlusSyncAlreadyRunningError,
    );
  });

  it("getStatus returns live progress and incremental/full lastCompleted dates", async () => {
    const h = createHarness();
    vi.mocked(h.syncRepository.findLastCompleted).mockResolvedValue({
      id: "run-old",
      connectionId: TEST_CONNECTION_ID,
      mode: TagPlusSyncMode.FULL,
      status: TagPlusSyncStatus.COMPLETED,
      currentStage: TagPlusSyncStage.COMPLETED,
      startedAt: new Date("2026-09-10T12:00:00Z"),
      completedAt: new Date("2026-09-10T12:05:00Z"),
      windowSince: null,
      windowUntil: null,
      errorStage: null,
      errorMessage: null,
      errorCategory: null,
      summary: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

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
    let resolveFirstPreflight: () => void = () => {};
    vi.mocked(h.customerRunner.preflight).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirstPreflight = resolve;
        }),
    );

    const promise1 = h.orchestrator.startSync();
    const promise2 = h.orchestrator.startSync({ mode: TagPlusSyncMode.FULL });

    await expect(promise2).rejects.toThrow(TagPlusSyncAlreadyRunningError);

    resolveFirstPreflight();
    const result1 = await promise1;
    expect(result1.status).toBe(TagPlusSyncStatus.RUNNING);
    expect(h.syncRepository.createRun).toHaveBeenCalledTimes(1);
  });

  it("serializes summary with JSON-safe values including mode, windowSince, and windowUntil", async () => {
    const h = createHarness();
    await h.orchestrator.startSync();

    await vi.waitFor(() => {
      expect(h.syncRepository.completeRun).toHaveBeenCalled();
    });

    const completeCall = vi.mocked(h.syncRepository.completeRun).mock.calls[0];
    const summary = completeCall[2] as Record<string, unknown>;

    expect(typeof summary.startedAt).toBe("string");
    expect(typeof summary.completedAt).toBe("string");
    expect(summary.mode).toBe("INCREMENTAL");
    expect(summary.customers).toBeDefined();
    expect(summary.products).toBeDefined();
    expect(summary.sales).toBeDefined();

    const reSerialized = JSON.stringify(summary);
    expect(JSON.parse(reSerialized)).toEqual(summary);
  });
});

