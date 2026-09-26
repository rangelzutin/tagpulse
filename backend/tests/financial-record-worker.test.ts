import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { TagPlusHttpError, type TagPlusClient } from "../src/integrations/tagplus/tagplus-client.js";
import type { FinancialRecordRepository } from "../src/modules/financial/financial-record-repository.js";
import { createFinancialRecordWorker } from "../src/modules/financial/financial-record-worker.js";

describe("financial-record-worker", () => {
  const dummyPayload = {
    id: 100,
    tipo: "E",
    confirmado: true,
    data_vencimento: "2026-05-10",
    valor_original: 500,
  };

  it("processes pending item successfully: PENDING -> PROCESSING -> COMPLETED", async () => {
    const queue = [{ sourceId: "100", attemptCount: 1 }];
    const client: TagPlusClient = {
      get: vi.fn().mockResolvedValue({
        status: 200,
        data: dummyPayload,
        paginationHeaders: {},
      }),
    };

    const mockRepo: Partial<FinancialRecordRepository> = {
      claimNextPendingItem: vi.fn().mockImplementation(async () => queue.shift() ?? null),
      saveFinancialRecordWithTx: vi.fn().mockResolvedValue({ action: "inserted", id: "uuid-1" }),
      markItemCompletedWithTx: vi.fn().mockResolvedValue(undefined),
    };

    const mockPrisma = {
      $transaction: vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({})),
    } as unknown as PrismaClient;

    const worker = createFinancialRecordWorker({
      prisma: mockPrisma,
      repository: mockRepo as FinancialRecordRepository,
      getClient: () => client,
    });

    const summary = await worker.processQueue("conn-123", {
      rateLimitDelayMs: 0,
    });

    expect(summary.processed).toBe(1);
    expect(summary.completed).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.notFound).toBe(0);
    expect(mockRepo.saveFinancialRecordWithTx).toHaveBeenCalledTimes(1);
    expect(mockRepo.markItemCompletedWithTx).toHaveBeenCalledWith(
      expect.anything(),
      "conn-123",
      "100",
      expect.any(Date),
    );
  });

  it("respects limit option and stops after limit is reached", async () => {
    const queue = [
      { sourceId: "101", attemptCount: 1 },
      { sourceId: "102", attemptCount: 1 },
      { sourceId: "103", attemptCount: 1 },
    ];
    const client: TagPlusClient = {
      get: vi.fn().mockImplementation(async (path: string) => {
        const id = path.split("/").pop();
        return {
          status: 200,
          data: { ...dummyPayload, id: Number(id) },
          paginationHeaders: {},
        };
      }),
    };

    const mockRepo: Partial<FinancialRecordRepository> = {
      claimNextPendingItem: vi.fn().mockImplementation(async () => queue.shift() ?? null),
      saveFinancialRecordWithTx: vi.fn().mockResolvedValue({ action: "inserted", id: "uuid-1" }),
      markItemCompletedWithTx: vi.fn().mockResolvedValue(undefined),
    };

    const mockPrisma = {
      $transaction: vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({})),
    } as unknown as PrismaClient;

    const worker = createFinancialRecordWorker({
      prisma: mockPrisma,
      repository: mockRepo as FinancialRecordRepository,
      getClient: () => client,
    });

    const summary = await worker.processQueue("conn-123", {
      limit: 2,
      rateLimitDelayMs: 0,
    });

    expect(summary.processed).toBe(2);
    expect(summary.completed).toBe(2);
    // Queue should have 1 item remaining
    expect(queue).toHaveLength(1);
    expect(queue[0].sourceId).toBe("103");
  });

  it("marks item NOT_FOUND when API returns 404", async () => {
    const queue = [{ sourceId: "999", attemptCount: 1 }];
    const client: TagPlusClient = {
      get: vi.fn().mockRejectedValue(new TagPlusHttpError(404)),
    };

    const mockRepo: Partial<FinancialRecordRepository> = {
      claimNextPendingItem: vi.fn().mockImplementation(async () => queue.shift() ?? null),
      markItemNotFound: vi.fn().mockResolvedValue(undefined),
    };

    const mockPrisma = {
      $transaction: vi.fn(),
    } as unknown as PrismaClient;

    const worker = createFinancialRecordWorker({
      prisma: mockPrisma,
      repository: mockRepo as FinancialRecordRepository,
      getClient: () => client,
    });

    const summary = await worker.processQueue("conn-123", {
      rateLimitDelayMs: 0,
    });

    expect(summary.processed).toBe(1);
    expect(summary.notFound).toBe(1);
    expect(mockRepo.markItemNotFound).toHaveBeenCalledWith("conn-123", "999", 404);
  });

  it("retries on 5xx/network error and marks FAILED when retries are exhausted", async () => {
    const queue = [{ sourceId: "500", attemptCount: 1 }];
    const client: TagPlusClient = {
      get: vi.fn().mockRejectedValue(new TagPlusHttpError(500)),
    };

    const mockRepo: Partial<FinancialRecordRepository> = {
      claimNextPendingItem: vi.fn().mockImplementation(async () => queue.shift() ?? null),
      markItemFailed: vi.fn().mockResolvedValue(undefined),
    };

    const mockPrisma = {
      $transaction: vi.fn(),
    } as unknown as PrismaClient;

    const worker = createFinancialRecordWorker({
      prisma: mockPrisma,
      repository: mockRepo as FinancialRecordRepository,
      getClient: () => client,
    });

    const summary = await worker.processQueue("conn-123", {
      maxRetries: 2,
      rateLimitDelayMs: 0,
    });

    expect(summary.processed).toBe(1);
    expect(summary.failed).toBe(1);
    expect(client.get).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    expect(mockRepo.markItemFailed).toHaveBeenCalledWith(
      "conn-123",
      "500",
      expect.stringContaining("500"),
      500,
    );
  });

  it("refreshes token and retries request on HTTP 401 without failing the queue", async () => {
    const queue = [{ sourceId: "200", attemptCount: 1 }];
    let token = "old-expired-token";

    const client: TagPlusClient = {
      get: vi.fn().mockImplementation(async () => {
        if (token === "old-expired-token") {
          throw new TagPlusHttpError(401);
        }
        return {
          status: 200,
          data: dummyPayload,
          paginationHeaders: {},
        };
      }),
    };

    const mockRepo: Partial<FinancialRecordRepository> = {
      claimNextPendingItem: vi.fn().mockImplementation(async () => queue.shift() ?? null),
      saveFinancialRecordWithTx: vi.fn().mockResolvedValue({ action: "inserted", id: "uuid-1" }),
      markItemCompletedWithTx: vi.fn().mockResolvedValue(undefined),
    };

    const mockPrisma = {
      $transaction: vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({})),
    } as unknown as PrismaClient;

    const refreshTokenMock = vi.fn().mockImplementation(async () => {
      token = "new-fresh-token";
      return "new-fresh-token";
    });

    const updateTokenMock = vi.fn();

    const worker = createFinancialRecordWorker({
      prisma: mockPrisma,
      repository: mockRepo as FinancialRecordRepository,
      getClient: () => client,
      refreshToken: refreshTokenMock,
      updateClientToken: updateTokenMock,
    });

    const summary = await worker.processQueue("conn-123", {
      rateLimitDelayMs: 0,
    });

    expect(refreshTokenMock).toHaveBeenCalledTimes(1);
    expect(updateTokenMock).toHaveBeenCalledWith("new-fresh-token");
    expect(summary.completed).toBe(1);
    expect(summary.failed).toBe(0);
  });
});
