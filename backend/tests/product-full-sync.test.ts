import { describe, expect, it, vi } from "vitest";
import {
  createProductFullSync,
  ProductSyncError,
} from "../src/modules/products/product-full-sync.js";

const connectionId = "00000000-0000-4000-8000-000000000001";

function harness(overrides: {
  pages?: Record<number, unknown[]>;
  existingRunning?: boolean;
}) {
  const pages = overrides.pages ?? {
    1: [{ id: 1, descricao: "Product 1" }],
    2: [],
  };
  const pageFetcher = vi.fn(async ({ page }: { page: number }) => {
    return pages[page] ?? [];
  });
  const upsertProduct = vi.fn().mockResolvedValue({ outcome: "INSERTED" });
  const productRepository = { upsertProduct };

  const syncRepository = {
    findRunning: vi
      .fn()
      .mockResolvedValue(
        overrides.existingRunning ? { id: "running-id" } : null,
      ),
    createRun: vi.fn().mockResolvedValue({ id: "run-uuid" }),
    updateProgress: vi.fn().mockResolvedValue(undefined),
    reconcileMissing: vi.fn().mockResolvedValue(3),
    completeRun: vi.fn().mockResolvedValue(undefined),
    failRun: vi.fn().mockResolvedValue(undefined),
  };

  const sync = createProductFullSync({
    pageFetcher,
    productRepository,
    syncRepository,
    now: () => new Date("2026-09-04T12:00:00Z"),
  });

  return {
    sync,
    pageFetcher,
    productRepository,
    syncRepository,
  };
}

describe("product full sync engine", () => {
  it("rejects starting a sync when a RUNNING run exists", async () => {
    const { sync } = harness({ existingRunning: true });
    await expect(sync(connectionId)).rejects.toThrow(ProductSyncError);
    await expect(sync(connectionId)).rejects.toMatchObject({
      category: "PRODUCT_SYNC_ALREADY_RUNNING",
    });
  });

  it("completes full sync across multiple pages and terminates only on empty page", async () => {
    // Page 1 has 1 item, which is a short page (< 100 items).
    // It should NOT terminate on page 1, but request page 2, which returns [] and terminates!
    const { sync, pageFetcher, productRepository, syncRepository } = harness({
      pages: {
        1: [{ id: 101, descricao: "Item 1" }],
        2: [{ id: 102, descricao: "Item 2" }],
        3: [],
      },
    });

    const result = await sync(connectionId);
    expect(result.status).toBe("COMPLETED");
    expect(result.pagesFetched).toBe(3);
    expect(result.lastCompletedPage).toBe(2);
    expect(result.terminalEmptyPage).toBe(3);
    expect(result.recordsFetched).toBe(2);
    expect(result.recordsInserted).toBe(2);
    expect(result.recordsNoLongerObserved).toBe(3);

    expect(pageFetcher).toHaveBeenCalledTimes(3);
    expect(productRepository.upsertProduct).toHaveBeenCalledTimes(2);
    expect(syncRepository.reconcileMissing).toHaveBeenCalledWith(
      connectionId,
      "run-uuid",
    );
    expect(syncRepository.completeRun).toHaveBeenCalledWith(
      "run-uuid",
      expect.any(Date),
      3,
    );
  });

  it("does not reconcile missing products if fetch fails mid-sync", async () => {
    const pageFetcher = vi.fn().mockRejectedValue(new Error("Network error"));
    const syncRepository = {
      findRunning: vi.fn().mockResolvedValue(null),
      createRun: vi.fn().mockResolvedValue({ id: "run-uuid" }),
      updateProgress: vi.fn().mockResolvedValue(undefined),
      reconcileMissing: vi.fn().mockResolvedValue(0),
      completeRun: vi.fn().mockResolvedValue(undefined),
      failRun: vi.fn().mockResolvedValue(undefined),
    };

    const sync = createProductFullSync({
      pageFetcher,
      productRepository: { upsertProduct: vi.fn() },
      syncRepository,
    });

    await expect(sync(connectionId)).rejects.toMatchObject({
      category: "PRODUCT_SYNC_FETCH_ERROR",
    });
    expect(syncRepository.reconcileMissing).not.toHaveBeenCalled();
    expect(syncRepository.failRun).toHaveBeenCalledWith(
      "run-uuid",
      expect.any(Date),
      "PRODUCT_SYNC_FETCH_ERROR",
    );
  });

  it("records failure when page is not an array", async () => {
    const pageFetcher = vi.fn().mockResolvedValue({ error: "bad payload" });
    const syncRepository = {
      findRunning: vi.fn().mockResolvedValue(null),
      createRun: vi.fn().mockResolvedValue({ id: "run-uuid" }),
      updateProgress: vi.fn().mockResolvedValue(undefined),
      reconcileMissing: vi.fn().mockResolvedValue(0),
      completeRun: vi.fn().mockResolvedValue(undefined),
      failRun: vi.fn().mockResolvedValue(undefined),
    };

    const sync = createProductFullSync({
      pageFetcher,
      productRepository: { upsertProduct: vi.fn() },
      syncRepository,
    });

    await expect(sync(connectionId)).rejects.toMatchObject({
      category: "PRODUCT_SYNC_INVALID_PAGE",
    });
    expect(syncRepository.failRun).toHaveBeenCalledWith(
      "run-uuid",
      expect.any(Date),
      "PRODUCT_SYNC_INVALID_PAGE",
    );
  });
});
