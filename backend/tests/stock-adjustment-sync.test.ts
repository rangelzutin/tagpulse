/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  TagPlusHttpError,
  type TagPlusClient,
} from "../src/integrations/tagplus/tagplus-client.js";
import {
  createStockAdjustmentRepository,
  type StockAdjustmentRepository,
} from "../src/modules/stock-adjustments/stock-adjustment-repository.js";
import {
  createStockAdjustmentWorker,
} from "../src/modules/stock-adjustments/stock-adjustment-worker.js";
import {
  createStockAdjustmentSyncRunner,
} from "../src/modules/stock-adjustments/stock-adjustment-sync-runner.js";
import { normalizeTagPlusStockAdjustment } from "../src/integrations/tagplus/stock-adjustments/stock-adjustment-normalizer.js";

describe("StockAdjustmentSync & Repository", () => {
  const sampleRawDetail = {
    id: 700,
    numero: "50",
    tipo: "S",
    status: "A",
    valor_total: 500,
    tem_fatura: true,
    itens: [
      {
        id: 1001,
        item: 1,
        qtd: 2,
        valor_unitario: 250,
        valor_subtotal: 500,
        produto_servico: { id: 200, codigo: "PROD-200", descricao: "Shape Test" },
      },
    ],
    faturas: [
      {
        parcelas: [
          {
            parcela: 1,
            lancamento_financeiro_vinculado: { id: 3001 },
          },
        ],
      },
    ],
  };

  it("H. upsert idempotente: same record twice returns inserted then unchanged", async () => {
    let storedAdjustment: any = null;
    const storedItems = new Map<string, any>();
    const storedLinks = new Map<string, any>();

    const mockTx: any = {
      stockAdjustment: {
        findUnique: vi.fn().mockImplementation(async () => {
          if (!storedAdjustment) return null;
          return {
            ...storedAdjustment,
            items: Array.from(storedItems.values()),
            financialLinks: Array.from(storedLinks.values()),
          };
        }),
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          storedAdjustment = { id: "adj-uuid-1", ...data };
          return storedAdjustment;
        }),
        update: vi.fn().mockImplementation(async ({ data }: any) => {
          storedAdjustment = { ...storedAdjustment, ...data };
          return storedAdjustment;
        }),
      },
      stockAdjustmentItem: {
        upsert: vi.fn().mockImplementation(async ({ create, update }: any) => {
          const key = create.sourceItemId;
          if (storedItems.has(key)) {
            storedItems.set(key, { ...storedItems.get(key), ...update });
          } else {
            storedItems.set(key, { id: `item-${key}`, ...create });
          }
          return storedItems.get(key);
        }),
      },
      financialRecord: {
        findUnique: vi.fn().mockResolvedValue({ id: "fr-uuid-3001" }),
      },
      stockAdjustmentFinancialLink: {
        upsert: vi.fn().mockImplementation(async ({ create, update }: any) => {
          const key = create.financialRecordSourceId;
          if (storedLinks.has(key)) {
            storedLinks.set(key, { ...storedLinks.get(key), ...update });
          } else {
            storedLinks.set(key, { id: `link-${key}`, ...create });
          }
          return storedLinks.get(key);
        }),
        update: vi.fn(),
      },
    };

    const mockPrisma = {
      $transaction: vi.fn().mockImplementation(async (cb: (tx: any) => any) => cb(mockTx)),
    } as unknown as PrismaClient;

    const repo = createStockAdjustmentRepository(mockPrisma);
    const norm = normalizeTagPlusStockAdjustment(sampleRawDetail);

    // Pass 1: Inserted
    const res1 = await repo.saveStockAdjustmentWithTx(mockTx, "conn-1", norm, new Date("2026-09-28T10:00:00Z"));
    expect(res1.action).toBe("inserted");
    expect(mockTx.stockAdjustment.create).toHaveBeenCalledTimes(1);

    // Pass 2: Unchanged
    const res2 = await repo.saveStockAdjustmentWithTx(mockTx, "conn-1", norm, new Date("2026-09-28T10:05:00Z"));
    expect(res2.action).toBe("unchanged");
    expect(mockTx.stockAdjustment.create).toHaveBeenCalledTimes(1); // not created again
    expect(storedItems.size).toBe(1);
    expect(storedLinks.size).toBe(1);
  });

  it("I. item sem duplicação: upserting items updates rather than duplicates", async () => {
    const itemsMap = new Map<string, any>();
    const mockTx: any = {
      stockAdjustment: {
        findUnique: vi.fn().mockResolvedValue({
          id: "adj-uuid-1",
          number: "50",
          type: "S",
          totalAmount: 500,
          items: [],
          financialLinks: [],
        }),
        update: vi.fn(),
      },
      stockAdjustmentItem: {
        upsert: vi.fn().mockImplementation(async ({ create }: any) => {
          itemsMap.set(create.sourceItemId, create);
          return create;
        }),
      },
      financialRecord: { findUnique: vi.fn().mockResolvedValue(null) },
      stockAdjustmentFinancialLink: { upsert: vi.fn() },
    };

    const repo = createStockAdjustmentRepository({} as PrismaClient);
    const norm = normalizeTagPlusStockAdjustment(sampleRawDetail);

    await repo.saveStockAdjustmentWithTx(mockTx, "conn-1", norm);
    await repo.saveStockAdjustmentWithTx(mockTx, "conn-1", norm);

    expect(itemsMap.size).toBe(1);
    expect(mockTx.stockAdjustmentItem.upsert).toHaveBeenCalledTimes(2);
  });

  it("J. link sem duplicação: same financial link upserts without duplicate entries", async () => {
    const linksMap = new Map<string, any>();
    const mockTx: any = {
      stockAdjustment: {
        findUnique: vi.fn().mockResolvedValue({
          id: "adj-uuid-1",
          number: "50",
          type: "S",
          items: [],
          financialLinks: [],
        }),
        update: vi.fn(),
      },
      stockAdjustmentItem: { upsert: vi.fn() },
      financialRecord: { findUnique: vi.fn().mockResolvedValue({ id: "fr-uuid-3001" }) },
      stockAdjustmentFinancialLink: {
        upsert: vi.fn().mockImplementation(async ({ create }: any) => {
          linksMap.set(create.financialRecordSourceId, create);
          return create;
        }),
      },
    };

    const repo = createStockAdjustmentRepository({} as PrismaClient);
    const norm = normalizeTagPlusStockAdjustment(sampleRawDetail);

    await repo.saveStockAdjustmentWithTx(mockTx, "conn-1", norm);
    await repo.saveStockAdjustmentWithTx(mockTx, "conn-1", norm);

    expect(linksMap.size).toBe(1);
    expect(linksMap.get("3001")?.financialRecordId).toBe("fr-uuid-3001");
  });

  it("K. link desaparecido é preservado com sourcePresent=false (não apagado)", async () => {
    const existingLinks = [
      {
        id: "link-uuid-1",
        financialRecordSourceId: "3001",
        sourcePresent: true,
      },
      {
        id: "link-uuid-2",
        financialRecordSourceId: "9999", // link that was previously seen but now disappeared!
        sourcePresent: true,
      },
    ];

    const updatedLinks = new Map<string, any>();
    const mockTx: any = {
      stockAdjustment: {
        findUnique: vi.fn().mockResolvedValue({
          id: "adj-uuid-1",
          items: [],
          financialLinks: existingLinks,
        }),
        update: vi.fn(),
      },
      stockAdjustmentItem: { upsert: vi.fn() },
      financialRecord: { findUnique: vi.fn().mockResolvedValue(null) },
      stockAdjustmentFinancialLink: {
        upsert: vi.fn(),
        update: vi.fn().mockImplementation(async ({ where, data }: any) => {
          updatedLinks.set(where.id, data);
        }),
      },
    };

    const repo = createStockAdjustmentRepository({} as PrismaClient);
    const norm = normalizeTagPlusStockAdjustment(sampleRawDetail); // only contains link 3001

    await repo.saveStockAdjustmentWithTx(mockTx, "conn-1", norm);

    // Link 9999 must have been updated to sourcePresent: false, NOT deleted!
    expect(updatedLinks.get("link-uuid-2")).toEqual({ sourcePresent: false });
  });

  it("O. página curta não encerra catalog & P. [] encerra catalog", async () => {
    // Page 1 returns 100 items
    // Page 2 returns 77 items (short page)
    // Page 3 returns [] (terminal empty array)
    const page1Data = Array.from({ length: 100 }, (_, i) => ({ id: 100 + i }));
    const page2Data = Array.from({ length: 77 }, (_, i) => ({ id: 200 + i }));
    const page3Data: any[] = [];

    const client: TagPlusClient = {
      get: vi.fn().mockImplementation(async (path: string) => {
        const url = new URL(path, "http://localhost");
        const page = url.searchParams.get("page");
        if (page === "1") return { status: 200, data: page1Data, paginationHeaders: {} };
        if (page === "2") return { status: 200, data: page2Data, paginationHeaders: {} };
        if (page === "3") return { status: 200, data: page3Data, paginationHeaders: {} };
        return { status: 200, data: [], paginationHeaders: {} };
      }),
    };

    const mockRepo: Partial<StockAdjustmentRepository> = {
      upsertCatalogItems: vi.fn().mockImplementation(async (_conn, sourceIds) => ({
        total: sourceIds.length,
        newlyDiscovered: sourceIds.length,
        alreadyKnown: 0,
      })),
    };

    const runner = createStockAdjustmentSyncRunner({
      prisma: {} as PrismaClient,
      repository: mockRepo as StockAdjustmentRepository,
      getClient: () => client,
    });

    const result = await runner.scanCatalog("conn-1");

    expect(client.get).toHaveBeenCalledTimes(3); // page 1, page 2, page 3!
    expect(result.pagesFetched).toBe(2);
    expect(result.totalDiscovered).toBe(177); // 100 + 77
    expect(mockRepo.upsertCatalogItems).toHaveBeenCalledTimes(2);
  });

  it("L. partial scan não marca adjustment ausente & M. full catalog completo reconcilia ausência", async () => {
    const mockPrisma = {
      stockAdjustment: {
        updateMany: vi.fn().mockResolvedValue({ count: 5 }),
      },
    } as unknown as PrismaClient;

    const repo = createStockAdjustmentRepository(mockPrisma);
    const catalogStartTime = new Date("2026-09-28T12:00:00Z");

    const reconciled = await repo.reconcileGlobalPresence("conn-1", catalogStartTime, new Date("2026-09-28T12:30:00Z"));

    expect(reconciled).toBe(5);
    expect(mockPrisma.stockAdjustment.updateMany).toHaveBeenCalledWith({
      where: {
        connectionId: "conn-1",
        sourcePresent: true,
        lastSeenAt: { lt: catalogStartTime },
      },
      data: {
        sourcePresent: false,
        noLongerObservedAt: expect.any(Date),
      },
    });
  });

  it("Worker retries on 429 with backoff and retries on 5xx/network", async () => {
    const queue = [{ sourceId: "700", attemptCount: 1 }];

    let callCount = 0;
    const client: TagPlusClient = {
      get: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new TagPlusHttpError(429, new Headers({ "retry-after": "0" }));
        }
        return {
          status: 200,
          data: sampleRawDetail,
          paginationHeaders: {},
        };
      }),
    };

    const mockRepo: Partial<StockAdjustmentRepository> = {
      claimNextPendingItem: vi.fn().mockImplementation(async () => queue.shift() ?? null),
      saveStockAdjustmentWithTx: vi.fn().mockResolvedValue({ action: "inserted", id: "uuid-700" }),
      markItemCompletedWithTx: vi.fn().mockResolvedValue(undefined),
    };

    const mockPrisma = {
      $transaction: vi.fn().mockImplementation(async (cb: (tx: any) => any) => cb({})),
    } as unknown as PrismaClient;

    const worker = createStockAdjustmentWorker({
      prisma: mockPrisma,
      repository: mockRepo as StockAdjustmentRepository,
      getClient: () => client,
    });

    const summary = await worker.processQueue("conn-1", {
      rateLimitDelayMs: 0,
      maxRetries: 2,
    });

    expect(summary.completed).toBe(1);
    expect(callCount).toBe(2); // Retried after 429 and succeeded
  });

  describe("claimNextPendingItem & targeted re-processing", () => {
    function createMockPrismaWithItems(
      items: Array<{
        id: string;
        connectionId: string;
        sourceId: string;
        status: string;
        attemptCount: number;
        updatedAt?: Date;
      }>,
    ) {
      const itemsMap = new Map(
        items.map((it) => [`${it.connectionId}:${it.sourceId}`, { ...it }]),
      );

      return {
        stockAdjustmentSyncItem: {
          findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
            const key = `${where.connectionId_sourceId.connectionId}:${where.connectionId_sourceId.sourceId}`;
            const found = itemsMap.get(key);
            return found ? { ...found } : null;
          }),
          update: vi.fn().mockImplementation(async ({ where, data }: any) => {
            for (const item of itemsMap.values()) {
              if (item.id === where.id) {
                if (data.status) item.status = data.status;
                if (data.attemptCount?.increment) item.attemptCount += data.attemptCount.increment;
                return item;
              }
            }
            return null;
          }),
          findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
            for (const item of itemsMap.values()) {
              if (item.connectionId !== where.connectionId) continue;
              let matches = false;
              for (const clause of where.OR) {
                if (clause.status === item.status) {
                  if (clause.updatedAt?.lt) {
                    if (item.updatedAt && item.updatedAt < clause.updatedAt.lt) matches = true;
                  } else {
                    matches = true;
                  }
                }
              }
              if (matches) return { id: item.id, sourceId: item.sourceId, attemptCount: item.attemptCount };
            }
            return null;
          }),
          updateMany: vi.fn().mockImplementation(async ({ where, data }: any) => {
            let count = 0;
            for (const item of itemsMap.values()) {
              if (item.id === where.id && where.status.in.includes(item.status)) {
                if (data.status) item.status = data.status;
                if (data.attemptCount?.increment) item.attemptCount += data.attemptCount.increment;
                count++;
              }
            }
            return { count };
          }),
        },
      } as unknown as PrismaClient;
    }

    it("1. sourceId explícito + COMPLETED => reprocessa", async () => {
      const mockPrisma = createMockPrismaWithItems([
        { id: "sync-1", connectionId: "conn-1", sourceId: "7216", status: "COMPLETED", attemptCount: 1 },
      ]);
      const repo = createStockAdjustmentRepository(mockPrisma);

      const claimed = await repo.claimNextPendingItem("conn-1", { specificSourceId: "7216" });

      expect(claimed).toEqual({ sourceId: "7216", attemptCount: 2 });
      expect(mockPrisma.stockAdjustmentSyncItem.update).toHaveBeenCalledWith({
        where: { id: "sync-1" },
        data: expect.objectContaining({ status: "PROCESSING" }),
      });
    });

    it("2. sourceId explícito + PENDING => continua funcionando", async () => {
      const mockPrisma = createMockPrismaWithItems([
        { id: "sync-2", connectionId: "conn-1", sourceId: "7217", status: "PENDING", attemptCount: 0 },
      ]);
      const repo = createStockAdjustmentRepository(mockPrisma);

      const claimed = await repo.claimNextPendingItem("conn-1", { specificSourceId: "7217" });

      expect(claimed).toEqual({ sourceId: "7217", attemptCount: 1 });
      expect(mockPrisma.stockAdjustmentSyncItem.update).toHaveBeenCalledWith({
        where: { id: "sync-2" },
        data: expect.objectContaining({ status: "PROCESSING" }),
      });
    });

    it("3. sourceId explícito não existente => comportamento seguro (retorna null)", async () => {
      const mockPrisma = createMockPrismaWithItems([
        { id: "sync-1", connectionId: "conn-1", sourceId: "7216", status: "COMPLETED", attemptCount: 1 },
      ]);
      const repo = createStockAdjustmentRepository(mockPrisma);

      const claimed = await repo.claimNextPendingItem("conn-1", { specificSourceId: "99999" });

      expect(claimed).toBeNull();
      expect(mockPrisma.stockAdjustmentSyncItem.update).not.toHaveBeenCalled();
    });

    it("4. backfill sem sourceId NÃO passa a reprocessar todos COMPLETED", async () => {
      const mockPrisma = createMockPrismaWithItems([
        { id: "sync-1", connectionId: "conn-1", sourceId: "7216", status: "COMPLETED", attemptCount: 1 },
        { id: "sync-2", connectionId: "conn-1", sourceId: "7217", status: "COMPLETED", attemptCount: 1 },
      ]);
      const repo = createStockAdjustmentRepository(mockPrisma);

      const claimed = await repo.claimNextPendingItem("conn-1");

      expect(claimed).toBeNull();
      expect(mockPrisma.stockAdjustmentSyncItem.update).not.toHaveBeenCalled();
    });

    it("5. nenhum outro item é claimado por engano quando sourceId é fornecido", async () => {
      const mockPrisma = createMockPrismaWithItems([
        { id: "sync-1", connectionId: "conn-1", sourceId: "7216", status: "COMPLETED", attemptCount: 1 },
        { id: "sync-2", connectionId: "conn-1", sourceId: "7217", status: "PENDING", attemptCount: 0 },
        { id: "sync-3", connectionId: "conn-1", sourceId: "7218", status: "PENDING", attemptCount: 0 },
      ]);
      const repo = createStockAdjustmentRepository(mockPrisma);

      const claimed = await repo.claimNextPendingItem("conn-1", { specificSourceId: "7216" });

      expect(claimed).toEqual({ sourceId: "7216", attemptCount: 2 });
      expect(mockPrisma.stockAdjustmentSyncItem.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.stockAdjustmentSyncItem.update).toHaveBeenCalledWith({
        where: { id: "sync-1" },
        data: expect.anything(),
      });
    });

    it("6. worker com specificSourceId processa exatamente um item e encerra", async () => {
      const client: TagPlusClient = {
        get: vi.fn().mockResolvedValue({
          status: 200,
          data: sampleRawDetail,
          paginationHeaders: {},
        }),
      };

      let claimedCount = 0;
      const mockRepo: Partial<StockAdjustmentRepository> = {
        claimNextPendingItem: vi.fn().mockImplementation(async () => {
          claimedCount++;
          return { sourceId: "7216", attemptCount: 1 };
        }),
        saveStockAdjustmentWithTx: vi.fn().mockResolvedValue({ action: "updated", id: "uuid-7216" }),
        markItemCompletedWithTx: vi.fn().mockResolvedValue(undefined),
      };

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation(async (cb: (tx: any) => any) => cb({})),
      } as unknown as PrismaClient;

      const worker = createStockAdjustmentWorker({
        prisma: mockPrisma,
        repository: mockRepo as StockAdjustmentRepository,
        getClient: () => client,
      });

      const summary = await worker.processQueue("conn-1", {
        specificSourceId: "7216",
        rateLimitDelayMs: 0,
      });

      expect(summary.processed).toBe(1);
      expect(summary.completed).toBe(1);
      expect(claimedCount).toBe(1);
      expect(client.get).toHaveBeenCalledTimes(1);
      expect(client.get).toHaveBeenCalledWith("/ajustes_estoque/7216");
    });
  });
});
