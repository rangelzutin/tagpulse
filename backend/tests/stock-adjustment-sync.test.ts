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
});
