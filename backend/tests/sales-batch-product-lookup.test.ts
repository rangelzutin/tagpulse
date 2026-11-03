import type { PrismaClient } from "@prisma/client";
import { SaleAnchorType } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { NormalizedSale } from "../src/integrations/tagplus/sales/sales-normalizers.js";
import { createSalesRepository } from "../src/modules/sales/sales-repository.js";

describe("sales repository - batch product lookup (P1.1)", () => {
  it("batches product lookups with a single findMany call instead of N findUnique calls", async () => {
    const createdItems: any[] = [];
    const findManyMock = vi.fn().mockResolvedValue([
      { id: "prod-db-1", sourceId: "p1" },
      { id: "prod-db-2", sourceId: "p2" },
    ]);
    const findUniqueMock = vi.fn();

    const mockPrisma = {
      $transaction: vi.fn(async (cb: any) => {
        const tx = {
          customer: {
            findUnique: vi.fn().mockResolvedValue({ id: "cust-1" }),
          },
          sale: {
            findUnique: vi.fn().mockResolvedValue(null),
            upsert: vi.fn().mockResolvedValue({ id: "sale-1" }),
          },
          saleItem: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            createMany: vi.fn().mockImplementation(({ data }) => {
              createdItems.push(...data);
              return Promise.resolve({ count: data.length });
            }),
          },
          saleSourceDocument: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: "doc-1" }),
            upsert: vi.fn().mockResolvedValue({ id: "doc-1" }),
          },
          saleSourceDocumentItem: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          product: {
            findMany: findManyMock,
            findUnique: findUniqueMock,
          },
        };
        return cb(tx);
      }),
    } as unknown as PrismaClient;

    const repo = createSalesRepository(mockPrisma);

    const pedido: NormalizedSale = {
      sourceId: "pedido-100",
      sourceNumero: "100",
      anchorType: SaleAnchorType.PEDIDO,
      status: "ABERTO",
      netAmount: "300.00",
      customerSourceId: "c1",
      customerName: "Cliente 1",
      customerDoc: "12345678900",
      sourceCreatedAt: new Date("2026-10-01"),
      sourceConfirmedAt: null,
      sourceEmissaoAt: null,
      items: [
        {
          sourceItemId: "item-1",
          lineNumber: 1,
          sourceProductId: "p1",
          quantity: "2",
          unitPrice: "50.00",
          discountAmount: null,
          subtotal: "100.00",
        },
        {
          sourceItemId: "item-2",
          lineNumber: 2,
          sourceProductId: "p2",
          quantity: "1",
          unitPrice: "100.00",
          discountAmount: null,
          subtotal: "100.00",
        },
        {
          sourceItemId: "item-3",
          lineNumber: 3,
          sourceProductId: "p1", // duplicate product to verify deduplication
          quantity: "2",
          unitPrice: "50.00",
          discountAmount: null,
          subtotal: "100.00",
        },
        {
          sourceItemId: "item-4",
          lineNumber: 4,
          sourceProductId: null, // item without sourceProductId
          quantity: "1",
          unitPrice: "0.00",
          discountAmount: null,
          subtotal: "0.00",
        },
      ],
    };

    await repo.persistPedido("conn-1", pedido, new Date("2026-10-01"));

    // Batch assertion: findMany called with unique product sourceIds
    expect(findManyMock).toHaveBeenCalled();
    expect(findManyMock).toHaveBeenCalledWith({
      where: {
        connectionId: "conn-1",
        sourceId: { in: ["p1", "p2"] },
      },
      select: {
        id: true,
        sourceId: true,
      },
    });

    // Zero N+1 findUnique calls
    expect(findUniqueMock).not.toHaveBeenCalled();

    // Line items correctly mapped
    expect(createdItems).toHaveLength(4);
    expect(createdItems[0].productId).toBe("prod-db-1");
    expect(createdItems[1].productId).toBe("prod-db-2");
    expect(createdItems[2].productId).toBe("prod-db-1");
    expect(createdItems[3].productId).toBeNull();
  });

  it("handles empty items without calling product.findMany or product.findUnique", async () => {
    const findManyMock = vi.fn();
    const findUniqueMock = vi.fn();

    const mockPrisma = {
      $transaction: vi.fn(async (cb: any) => {
        const tx = {
          customer: {
            findUnique: vi.fn().mockResolvedValue({ id: "cust-1" }),
          },
          sale: {
            findUnique: vi.fn().mockResolvedValue(null),
            upsert: vi.fn().mockResolvedValue({ id: "sale-empty" }),
          },
          saleItem: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          saleSourceDocument: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: "doc-empty" }),
            upsert: vi.fn().mockResolvedValue({ id: "doc-empty" }),
          },
          saleSourceDocumentItem: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          product: {
            findMany: findManyMock,
            findUnique: findUniqueMock,
          },
        };
        return cb(tx);
      }),
    } as unknown as PrismaClient;

    const repo = createSalesRepository(mockPrisma);

    const pedido: NormalizedSale = {
      sourceId: "pedido-empty",
      sourceNumero: "101",
      anchorType: SaleAnchorType.PEDIDO,
      status: "ABERTO",
      netAmount: "0.00",
      customerSourceId: null,
      customerName: null,
      customerDoc: null,
      sourceCreatedAt: new Date("2026-10-01"),
      sourceConfirmedAt: null,
      sourceEmissaoAt: null,
      items: [],
    };

    await repo.persistPedido("conn-1", pedido, new Date("2026-10-01"));

    expect(findManyMock).not.toHaveBeenCalled();
    expect(findUniqueMock).not.toHaveBeenCalled();
  });
});
