import type { CustomerSyncRun } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  createCustomerFullSync,
  CustomerSyncError,
} from "../src/modules/customers/customer-full-sync.js";
import type { CustomerSyncRepository } from "../src/modules/customers/customer-sync-repository.js";
import { CustomerPersistenceError } from "../src/modules/customers/customer-repository.js";

const customer = (id: number) => ({ id, razao_social: `Synthetic ${id}` });

function harness(
  pages: unknown[],
  now = () => new Date("2026-08-29T12:00:00Z"),
) {
  const run = { id: "00000000-0000-0000-0000-000000000001" } as CustomerSyncRun;
  const state = {
    run,
    progress: {} as Record<string, number>,
    status: "RUNNING",
    errorCategory: null as string | null,
    reconciliations: 0,
  };
  const syncRepository: CustomerSyncRepository = {
    findRunning: vi.fn().mockResolvedValue(null),
    createRun: vi.fn().mockResolvedValue(run),
    updateProgress: vi.fn(async (_id, progress) =>
      Object.assign(state.progress, progress),
    ),
    reconcileMissing: vi.fn(async () => {
      state.reconciliations += 1;
      return 2;
    }),
    completeRun: vi.fn(async () => {
      state.status = "COMPLETED";
    }),
    failRun: vi.fn(async (_id, _at, category) => {
      state.status = "FAILED";
      state.errorCategory = category;
    }),
  };
  const pageFetcher = vi.fn(
    async ({ page }: { page: number }) => pages[page - 1],
  );
  const customerRepository = {
    upsertCustomer: vi.fn().mockResolvedValue({ outcome: "UNCHANGED" }),
  };
  const sync = createCustomerFullSync({
    pageFetcher,
    customerRepository,
    syncRepository,
    now,
  });
  return { sync, state, pageFetcher, customerRepository, syncRepository };
}

describe("customer full sync orchestration", () => {
  it("continues after a short page and stops only at the empty page", async () => {
    const h = harness([
      Array.from({ length: 100 }, (_, i) => customer(i + 1)),
      Array.from({ length: 100 }, (_, i) => customer(i + 101)),
      Array.from({ length: 44 }, (_, i) => customer(i + 201)),
      [],
    ]);
    const result = await h.sync("connection");
    expect(h.pageFetcher).toHaveBeenCalledTimes(4);
    expect(h.pageFetcher).toHaveBeenNthCalledWith(4, { page: 4, perPage: 100 });
    expect(result).toMatchObject({
      pagesFetched: 4,
      recordsFetched: 244,
      lastCompletedPage: 3,
      terminalEmptyPage: 4,
    });
  });

  it("completes an immediately empty source", async () => {
    const h = harness([[]]);
    const result = await h.sync("connection");
    expect(result).toMatchObject({
      pagesFetched: 1,
      recordsFetched: 0,
      lastCompletedPage: 0,
      terminalEmptyPage: 1,
    });
    expect(h.state.reconciliations).toBe(1);
  });

  it.each([{}, null, "invalid"])(
    "fails invalid page root %#",
    async (payload) => {
      const h = harness([payload]);
      await expect(h.sync("connection")).rejects.toMatchObject({
        category: "CUSTOMER_SYNC_INVALID_PAGE",
      });
      expect(h.state.status).toBe("FAILED");
      expect(h.state.reconciliations).toBe(0);
    },
  );

  it("classifies fetch errors and does not reconcile", async () => {
    const h = harness([]);
    h.pageFetcher.mockRejectedValueOnce(new Error("external detail"));
    await expect(h.sync("connection")).rejects.toMatchObject({
      category: "CUSTOMER_SYNC_FETCH_ERROR",
    });
    expect(h.state.errorCategory).toBe("CUSTOMER_SYNC_FETCH_ERROR");
    expect(h.state.reconciliations).toBe(0);
  });

  it("classifies findRunning and createRun failures as safe run-state errors", async () => {
    const canary =
      "customer-name-CANARY email-canary@example.com 123456789 secret-value-CANARY";
    const findHarness = harness([[]]);
    vi.mocked(findHarness.syncRepository.findRunning).mockRejectedValueOnce(
      new Error(canary),
    );
    const findError = await findHarness
      .sync("connection")
      .catch((caught: unknown) => caught);
    expect(findError).toMatchObject({
      category: "CUSTOMER_SYNC_ERROR",
      syncDiagnostics: {
        syncFailureStage: "RUN_STATE",
        syncErrorClass: "DATABASE",
      },
    });
    expect(JSON.stringify(findError)).not.toContain(canary);

    const createHarness = harness([[]]);
    vi.mocked(createHarness.syncRepository.createRun).mockRejectedValueOnce(
      new Error(canary),
    );
    const createError = await createHarness
      .sync("connection")
      .catch((caught: unknown) => caught);
    expect(createError).toMatchObject({
      category: "CUSTOMER_SYNC_ERROR",
      syncDiagnostics: {
        syncFailureStage: "RUN_STATE",
        syncErrorClass: "DATABASE",
      },
    });
    expect(JSON.stringify(createError)).not.toContain(canary);
  });

  it("classifies an unexpected pre-run orchestration failure safely", async () => {
    const canary =
      "customer-name-CANARY email-canary@example.com 123456789 secret-value-CANARY";
    const h = harness([[]], () => {
      throw new Error(canary);
    });
    const error = await h.sync("connection").catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      category: "CUSTOMER_SYNC_ERROR",
      syncDiagnostics: {
        syncFailureStage: "UNEXPECTED",
        syncErrorClass: "UNEXPECTED",
      },
    });
    expect(JSON.stringify(error)).not.toContain(canary);
    expect(h.syncRepository.createRun).not.toHaveBeenCalled();
  });

  it("classifies normalization errors and does not reconcile", async () => {
    const h = harness([[{ razao_social: "missing id" }]]);
    await expect(h.sync("connection")).rejects.toMatchObject({
      category: "CUSTOMER_SYNC_NORMALIZATION_ERROR",
    });
    expect(h.state.errorCategory).toBe("CUSTOMER_INVALID_SOURCE_ID");
    expect(h.state.progress.lastCompletedPage).toBeUndefined();
    expect(h.state.reconciliations).toBe(0);
  });

  it("persists only a safe normalization subcategory", async () => {
    const unsafeValue = "synthetic-secret-value";
    const h = harness([[{ id: 1, ativo: unsafeValue }]]);
    const error = await h.sync("connection").catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      category: "CUSTOMER_SYNC_NORMALIZATION_ERROR",
    });
    expect(h.state.errorCategory).toBe("CUSTOMER_INVALID_TYPE");
    expect(error).toMatchObject({
      normalizationCategory: "CUSTOMER_INVALID_TYPE",
      diagnostics: {
        path: "$.ativo",
        observedType: "string",
        expectedTypeOrFormat: "boolean",
      },
    });
    expect(JSON.stringify(error)).not.toContain(unsafeValue);
    expect(JSON.stringify(h.state)).not.toContain(unsafeValue);
  });

  it("propagates safe date diagnostics without persisting the raw value", async () => {
    const unsafeValue = "2099/07/31 23:58:41";
    const h = harness([[{ id: 1, data_alteracao: unsafeValue }]]);
    const error = await h.sync("connection").catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      category: "CUSTOMER_SYNC_NORMALIZATION_ERROR",
      normalizationCategory: "CUSTOMER_INVALID_DATE",
      diagnostics: {
        path: "$.data_alteracao",
        observedType: "string",
        expectedFormat: "timezone-qualified-datetime",
        dateFormatClass: "INVALID_OR_UNCLASSIFIED",
        dateStructuralPattern: "####/##/## ##:##:##",
      },
    });
    expect(h.state.errorCategory).toBe("CUSTOMER_INVALID_DATE");
    expect(JSON.stringify(error)).not.toContain(unsafeValue);
    expect(JSON.stringify(h.state)).not.toContain(unsafeValue);
    for (const fragment of ["2099", "07", "31", "23", "58", "41"]) {
      expect(JSON.stringify(error)).not.toContain(fragment);
      expect(JSON.stringify(h.state)).not.toContain(fragment);
    }
  });

  it("keeps partial counters without completing a partially failed page", async () => {
    const h = harness([[customer(1), customer(2), customer(3)]]);
    h.customerRepository.upsertCustomer
      .mockResolvedValueOnce({ outcome: "INSERTED" })
      .mockResolvedValueOnce({ outcome: "UPDATED" })
      .mockRejectedValueOnce(new Error("database detail"));
    await expect(h.sync("connection")).rejects.toMatchObject({
      category: "CUSTOMER_SYNC_PERSISTENCE_ERROR",
    });
    expect(h.state.progress).toMatchObject({
      recordsFetched: 2,
      recordsInserted: 1,
      recordsUpdated: 1,
      recordsUnchanged: 0,
    });
    expect(h.state.progress.lastCompletedPage).toBeUndefined();
    expect(h.state.reconciliations).toBe(0);
  });

  it("classifies an unexpected exception during normalization without leaking it", async () => {
    const canary =
      "PRIVATE_NAME private-id private@example.invalid 5511999999999 PRIVATE_BAD_VALUE";
    const source = new Proxy(
      {},
      {
        get() {
          throw new Error(canary);
        },
      },
    );
    const h = harness([[source]]);
    const error = await h.sync("connection").catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      category: "CUSTOMER_SYNC_NORMALIZATION_ERROR",
      normalizationCategory: "CUSTOMER_NORMALIZATION_UNEXPECTED",
    });
    expect(error.diagnostics).toBeUndefined();
    expect(h.state.errorCategory).toBe("CUSTOMER_NORMALIZATION_UNEXPECTED");
    expect(JSON.stringify(error)).not.toContain(canary);
    expect(JSON.stringify(h.state)).not.toContain(canary);
  });

  it("reports a failRun failure without retaining the original error", async () => {
    const canary =
      "customer-name-CANARY email-canary@example.com 123456789 secret-value-CANARY";
    const h = harness([[{ id: 1, ativo: canary }]]);
    vi.mocked(h.syncRepository.failRun).mockRejectedValueOnce(
      new Error(canary),
    );
    const error = await h.sync("connection").catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      category: "CUSTOMER_SYNC_ERROR",
      syncDiagnostics: {
        syncFailureStage: "RUN_STATE",
        syncErrorClass: "DATABASE",
        page: 1,
      },
    });
    expect(error.message).toBe("CUSTOMER_SYNC_ERROR");
    expect(error).not.toHaveProperty("cause");
    expect(JSON.stringify(error)).not.toContain(canary);
    expect(h.state.errorCategory).toBeNull();
  });

  it("classifies a future generic orchestration error as unexpected", async () => {
    const canary =
      "customer-name-CANARY email-canary@example.com 123456789 secret-value-CANARY";
    const original = new CustomerSyncError("CUSTOMER_SYNC_ERROR");
    Object.assign(original, {
      rawMessage: canary,
      cause: canary,
      payload: canary,
    });
    const h = harness([]);
    h.pageFetcher.mockRejectedValueOnce(original);
    const error = await h.sync("connection").catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      category: "CUSTOMER_SYNC_ERROR",
      syncDiagnostics: {
        syncFailureStage: "UNEXPECTED",
        syncErrorClass: "UNEXPECTED",
        page: 1,
      },
    });
    expect(JSON.stringify(error)).not.toContain(canary);
    expect(h.state.errorCategory).toBe("CUSTOMER_SYNC_ERROR");
  });

  it("propagates only safe persistence diagnostics and persists only the category", async () => {
    const canary = "RAW_DB_CANARY customer@example.invalid source-123";
    const h = harness([[customer(1)]]);
    const repositoryError = new CustomerPersistenceError({
      persistenceStage: "CONTACTS",
      persistenceOperation: "UPSERT",
      persistenceErrorClass: "VALUE_TOO_LONG",
    });
    Object.assign(repositoryError, { rawMessage: canary, payload: canary });
    h.customerRepository.upsertCustomer.mockRejectedValueOnce(repositoryError);

    const error = await h.sync("connection").catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      category: "CUSTOMER_SYNC_PERSISTENCE_ERROR",
      persistenceDiagnostics: {
        persistenceStage: "CONTACTS",
        persistenceOperation: "UPSERT",
        persistenceErrorClass: "VALUE_TOO_LONG",
      },
    });
    expect(h.state.errorCategory).toBe("CUSTOMER_SYNC_PERSISTENCE_ERROR");
    expect(JSON.stringify(error)).not.toContain(canary);
    expect(JSON.stringify(h.state)).not.toContain(canary);
  });

  it("propagates a safe transaction reason without retaining raw Prisma details", async () => {
    const canary = "5000 SELECT * email-canary@example.com secret-value-CANARY";
    const h = harness([[customer(1)]]);
    const repositoryError = new CustomerPersistenceError({
      persistenceStage: "CUSTOMER",
      persistenceOperation: "UPSERT",
      persistenceErrorClass: "TRANSACTION_ERROR",
      transactionReason: "TRANSACTION_EXPIRED",
    });
    Object.assign(repositoryError, {
      rawMessage: canary,
      meta: { error: canary },
    });
    h.customerRepository.upsertCustomer.mockRejectedValueOnce(repositoryError);

    const error = await h.sync("connection").catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      category: "CUSTOMER_SYNC_PERSISTENCE_ERROR",
      persistenceDiagnostics: {
        persistenceStage: "CUSTOMER",
        persistenceOperation: "UPSERT",
        persistenceErrorClass: "TRANSACTION_ERROR",
        transactionReason: "TRANSACTION_EXPIRED",
      },
    });
    expect(JSON.stringify(error)).not.toContain(canary);
    expect(h.state.errorCategory).toBe("CUSTOMER_SYNC_PERSISTENCE_ERROR");
  });

  it("counts every repository outcome", async () => {
    const h = harness([[customer(1), customer(2), customer(3)], []]);
    h.customerRepository.upsertCustomer
      .mockResolvedValueOnce({ outcome: "INSERTED" })
      .mockResolvedValueOnce({ outcome: "UPDATED" })
      .mockResolvedValueOnce({ outcome: "UNCHANGED" });
    const result = await h.sync("connection");
    expect(result).toMatchObject({
      recordsFetched: 3,
      recordsInserted: 1,
      recordsUpdated: 1,
      recordsUnchanged: 1,
    });
  });

  it("classifies reconciliation failures after the terminal page", async () => {
    const h = harness([[]]);
    vi.mocked(h.syncRepository.reconcileMissing).mockRejectedValueOnce(
      new Error("database detail"),
    );
    await expect(h.sync("connection")).rejects.toMatchObject({
      category: "CUSTOMER_SYNC_RECONCILIATION_ERROR",
    });
    expect(h.state.status).toBe("FAILED");
    expect(h.state.progress.terminalEmptyPage).toBe(1);
  });

  it("rejects an existing RUNNING sync without creating another run", async () => {
    const h = harness([[]]);
    vi.mocked(h.syncRepository.findRunning).mockResolvedValueOnce({
      id: "existing",
    });
    await expect(h.sync("connection")).rejects.toBeInstanceOf(
      CustomerSyncError,
    );
    await expect(h.sync("connection")).resolves.toMatchObject({
      status: "COMPLETED",
    });
    expect(h.syncRepository.createRun).toHaveBeenCalledTimes(1);
  });
});
