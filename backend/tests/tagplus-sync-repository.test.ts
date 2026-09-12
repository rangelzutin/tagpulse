import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { TagPlusSyncStage, TagPlusSyncStatus } from "@prisma/client";
import { createTagPlusSyncRepository } from "../src/modules/sync/tagplus-sync-repository.js";

describe("TagPlusSyncRepository", () => {
  it("recovers stale RUNNING runs on startup (single instance recovery)", async () => {
    const updateManyTagPlus = vi.fn().mockResolvedValue({ count: 2 });
    const updateManyCustomers = vi.fn().mockResolvedValue({ count: 1 });
    const updateManyProducts = vi.fn().mockResolvedValue({ count: 3 });

    const prisma = {
      tagPlusSyncRun: { updateMany: updateManyTagPlus },
      customerSyncRun: { updateMany: updateManyCustomers },
      productSyncRun: { updateMany: updateManyProducts },
    } as unknown as PrismaClient;

    const repository = createTagPlusSyncRepository(prisma);
    const result = await repository.recoverStaleRuns();

    expect(result).toEqual({ tagplus: 2, customers: 1, products: 3 });

    expect(updateManyTagPlus).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: TagPlusSyncStatus.RUNNING },
        data: expect.objectContaining({
          status: TagPlusSyncStatus.FAILED,
          errorCategory: "STALE_ABORTED_ON_RESTART",
        }),
      }),
    );

    expect(updateManyCustomers).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "RUNNING" },
        data: expect.objectContaining({
          status: "FAILED",
          errorCategory: "STALE_ABORTED_ON_RESTART",
        }),
      }),
    );

    expect(updateManyProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "RUNNING" },
        data: expect.objectContaining({
          status: "FAILED",
          errorCategory: "STALE_ABORTED_ON_RESTART",
        }),
      }),
    );
  });

  it("findLastCompleted filters only COMPLETED runs ordered by completedAt desc", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "run-1",
      status: TagPlusSyncStatus.COMPLETED,
      completedAt: new Date("2026-09-11T20:00:00Z"),
    });

    const prisma = {
      tagPlusSyncRun: { findFirst },
    } as unknown as PrismaClient;

    const repository = createTagPlusSyncRepository(prisma);
    const result = await repository.findLastCompleted();

    expect(findFirst).toHaveBeenCalledWith({
      where: { status: TagPlusSyncStatus.COMPLETED },
      orderBy: { completedAt: "desc" },
    });
    expect(result?.id).toBe("run-1");
  });

  it("creates, updates stage, completes and fails runs", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "run-new",
      status: TagPlusSyncStatus.RUNNING,
      currentStage: TagPlusSyncStage.CUSTOMERS,
    });
    const update = vi.fn().mockResolvedValue({});

    const prisma = {
      tagPlusSyncRun: { create, update },
    } as unknown as PrismaClient;

    const repository = createTagPlusSyncRepository(prisma);

    const run = await repository.createRun("conn-123");
    expect(run.id).toBe("run-new");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          connectionId: "conn-123",
          status: TagPlusSyncStatus.RUNNING,
          currentStage: TagPlusSyncStage.CUSTOMERS,
        }),
      }),
    );

    await repository.updateStage("run-new", TagPlusSyncStage.PRODUCTS);
    expect(update).toHaveBeenCalledWith({
      where: { id: "run-new" },
      data: { currentStage: TagPlusSyncStage.PRODUCTS },
    });

    const completedAt = new Date();
    await repository.completeRun("run-new", completedAt, { total: 100 });
    expect(update).toHaveBeenCalledWith({
      where: { id: "run-new" },
      data: expect.objectContaining({
        status: TagPlusSyncStatus.COMPLETED,
        currentStage: TagPlusSyncStage.COMPLETED,
        completedAt,
        summary: { total: 100 },
      }),
    });

    const failedAt = new Date();
    await repository.failRun(
      "run-new",
      failedAt,
      TagPlusSyncStage.SALES,
      "TAGPLUS_HTTP_ERROR",
      "TagPlus request failed with HTTP 500",
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: "run-new" },
      data: expect.objectContaining({
        status: TagPlusSyncStatus.FAILED,
        currentStage: TagPlusSyncStage.FAILED,
        errorStage: TagPlusSyncStage.SALES,
        completedAt: failedAt,
        errorCategory: "TAGPLUS_HTTP_ERROR",
      }),
    });
  });
});
