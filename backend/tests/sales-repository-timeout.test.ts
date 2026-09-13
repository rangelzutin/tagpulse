import type { PrismaClient } from "@prisma/client";
import { SaleAnchorType } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { NormalizedSale } from "../src/integrations/tagplus/sales/sales-normalizers.js";
import {
  createSalesRepository,
  SALES_TRANSACTION_TIMEOUT_MS,
} from "../src/modules/sales/sales-repository.js";

function createMockTx() {
  return {
    customer: {
      findUnique: vi.fn().mockResolvedValue({ id: "cust-1" }),
    },
    sale: {
      upsert: vi.fn().mockResolvedValue({ id: "sale-1" }),
      findUnique: vi.fn().mockResolvedValue({ id: "parent-sale-1" }),
      delete: vi.fn().mockResolvedValue({ id: "old-sale-1" }),
    },
    saleItem: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    product: {
      findUnique: vi.fn().mockResolvedValue({ id: "prod-1" }),
    },
    saleSourceDocument: {
      upsert: vi.fn().mockResolvedValue({ id: "doc-1" }),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "doc-1" }),
      update: vi.fn().mockResolvedValue({ id: "doc-1" }),
      count: vi.fn().mockResolvedValue(0),
    },
    saleSourceDocumentItem: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe("sales repository transaction timeout configuration", () => {
  it("enforces 30000ms bounded timeout constant", () => {
    expect(SALES_TRANSACTION_TIMEOUT_MS).toBe(30000);
  });

  it("passes explicit 30s timeout option to prisma.$transaction in persistPedido", async () => {
    const mockTx = createMockTx();
    const transactionSpy = vi.fn(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx),
    );

    const mockPrisma = {
      $transaction: transactionSpy,
    } as unknown as PrismaClient;

    const repo = createSalesRepository(mockPrisma);

    const samplePedido: NormalizedSale = {
      sourceId: "ped-100",
      anchorType: SaleAnchorType.PEDIDO,
      netAmount: "150.00",
      customerSourceId: "cust-src-1",
      sourceCreatedAt: new Date("2026-08-01T10:00:00Z"),
      sourceConfirmedAt: new Date("2026-08-01T10:30:00Z"),
      sourceEmissaoAt: null,
      items: [
        {
          sourceItemId: "item-1",
          lineNumber: 1,
          sourceProductId: "prod-src-1",
          quantity: "2",
          unitPrice: "75.00",
          discountAmount: null,
          subtotal: "150.00",
        },
      ],
    };

    await repo.persistPedido("conn-1", samplePedido, new Date("2026-08-01T11:00:00Z"));

    expect(transactionSpy).toHaveBeenCalledTimes(1);
    expect(transactionSpy).toHaveBeenCalledWith(
      expect.any(Function),
      { timeout: 30000 },
    );
  });

  it("passes explicit 30s timeout option to prisma.$transaction in persistChildSale (linked child)", async () => {
    const mockTx = createMockTx();
    const transactionSpy = vi.fn(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx),
    );

    const mockPrisma = {
      $transaction: transactionSpy,
    } as unknown as PrismaClient;

    const repo = createSalesRepository(mockPrisma);

    const linkedVenda: NormalizedSale = {
      sourceId: "vs-200",
      anchorType: SaleAnchorType.VENDA_SIMPLES,
      parentPedidoSourceId: "ped-100",
      netAmount: "150.00",
      customerSourceId: "cust-src-1",
      sourceCreatedAt: new Date("2026-08-01T10:00:00Z"),
      sourceConfirmedAt: new Date("2026-08-01T10:30:00Z"),
      sourceEmissaoAt: null,
      items: [],
    };

    await repo.persistChildSale("conn-1", linkedVenda, new Date("2026-08-01T11:00:00Z"));

    expect(transactionSpy).toHaveBeenCalledTimes(1);
    expect(transactionSpy).toHaveBeenCalledWith(
      expect.any(Function),
      { timeout: 30000 },
    );
  });

  it("passes explicit 30s timeout option to prisma.$transaction in persistChildSale (direct child)", async () => {
    const mockTx = createMockTx();
    const transactionSpy = vi.fn(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx),
    );

    const mockPrisma = {
      $transaction: transactionSpy,
    } as unknown as PrismaClient;

    const repo = createSalesRepository(mockPrisma);

    const directVenda: NormalizedSale = {
      sourceId: "vs-300",
      anchorType: SaleAnchorType.VENDA_SIMPLES,
      parentPedidoSourceId: null,
      netAmount: "200.00",
      customerSourceId: "cust-src-2",
      sourceCreatedAt: new Date("2026-08-02T10:00:00Z"),
      sourceConfirmedAt: new Date("2026-08-02T10:30:00Z"),
      sourceEmissaoAt: null,
      items: [
        {
          sourceItemId: "item-2",
          lineNumber: 1,
          sourceProductId: "prod-src-2",
          quantity: "1",
          unitPrice: "200.00",
          discountAmount: null,
          subtotal: "200.00",
        },
      ],
    };

    await repo.persistChildSale("conn-1", directVenda, new Date("2026-08-02T11:00:00Z"));

    expect(transactionSpy).toHaveBeenCalledTimes(1);
    expect(transactionSpy).toHaveBeenCalledWith(
      expect.any(Function),
      { timeout: 30000 },
    );
  });
});
