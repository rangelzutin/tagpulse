import type { PrismaClient } from "@prisma/client";
import { Prisma, SaleAnchorType } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { NormalizedSale } from "../src/integrations/tagplus/sales/sales-normalizers.js";
import { createSalesRepository } from "../src/modules/sales/sales-repository.js";

function createMockTx() {
  return {
    customer: {
      findUnique: vi.fn().mockResolvedValue({ id: "cust-db-1" }),
    },
    sale: {
      upsert: vi.fn().mockResolvedValue({ id: "sale-db-1" }),
      findUnique: vi.fn().mockResolvedValue({ id: "parent-sale-ped-1" }),
      delete: vi.fn().mockResolvedValue({ id: "old-sale-1" }),
    },
    saleItem: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    product: {
      findUnique: vi.fn().mockResolvedValue({ id: "prod-db-1" }),
    },
    saleSourceDocument: {
      upsert: vi.fn().mockResolvedValue({ id: "doc-db-1" }),
      findUnique: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: "doc-db-1" }),
      update: vi.fn().mockResolvedValue({ id: "doc-db-1" }),
      count: vi.fn().mockResolvedValue(0),
    },
    saleSourceDocumentItem: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe("SalesSourceDocument persistence metadata enrichment", () => {
  const connectionId = "conn-test-1";
  const observedAt = new Date("2026-09-09T22:00:00.000Z");

  it("persistPedido preserves metadata and enforces realizedDate = null", async () => {
    const mockTx = createMockTx();
    const transactionSpy = vi.fn(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx),
    );

    const mockPrisma = {
      $transaction: transactionSpy,
    } as unknown as PrismaClient;

    const repo = createSalesRepository(mockPrisma);

    const dCreated = new Date("2026-01-10T08:00:00.000Z");
    const dConfirmed = new Date("2026-01-10T09:30:00.000Z");

    const samplePedido: NormalizedSale = {
      sourceId: "ped-100",
      anchorType: SaleAnchorType.PEDIDO,
      status: "B",
      netAmount: "6786.60",
      customerSourceId: "cust-tagplus-1",
      sourceCreatedAt: dCreated,
      sourceConfirmedAt: dConfirmed,
      sourceEmissaoAt: null,
      parentPedidoSourceId: null,
      items: [],
    };

    await repo.persistPedido(connectionId, samplePedido, observedAt);

    expect(mockTx.saleSourceDocument.upsert).toHaveBeenCalledWith({
      where: {
        connectionId_docType_sourceId: {
          connectionId,
          docType: SaleAnchorType.PEDIDO,
          sourceId: "ped-100",
        },
      },
      create: {
        saleId: "sale-db-1",
        connectionId,
        docType: SaleAnchorType.PEDIDO,
        sourceId: "ped-100",
        netAmount: new Prisma.Decimal("6786.60"),
        status: "B",
        sourceCreatedAt: dCreated,
        sourceConfirmedAt: dConfirmed,
        sourceEmissaoAt: null,
        realizedDate: null,
        sourcePresent: true,
        lastSeenAt: observedAt,
      },
      update: {
        saleId: "sale-db-1",
        netAmount: new Prisma.Decimal("6786.60"),
        status: "B",
        sourceCreatedAt: dCreated,
        sourceConfirmedAt: dConfirmed,
        sourceEmissaoAt: null,
        realizedDate: null,
        sourcePresent: true,
        lastSeenAt: observedAt,
      },
    });
  });

  it("persistChildSale: Case A (criação direta sob parent PEDIDO)", async () => {
    const mockTx = createMockTx();
    // Parent PEDIDO exists in DB
    mockTx.sale.findUnique.mockResolvedValue({ id: "parent-sale-ped-1" });
    // No document exists yet for this child
    mockTx.saleSourceDocument.findUnique.mockResolvedValue(null);

    const transactionSpy = vi.fn(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx),
    );
    const mockPrisma = {
      $transaction: transactionSpy,
    } as unknown as PrismaClient;

    const repo = createSalesRepository(mockPrisma);

    const dCreated = new Date("2026-01-15T10:00:00.000Z");
    const dConfirmed = new Date("2026-02-05T14:30:00.000Z");

    const sampleVS: NormalizedSale = {
      sourceId: "vs-7091",
      anchorType: SaleAnchorType.VENDA_SIMPLES,
      status: "A",
      netAmount: "3996.60",
      customerSourceId: "cust-tagplus-1",
      sourceCreatedAt: dCreated,
      sourceConfirmedAt: dConfirmed,
      sourceEmissaoAt: null,
      parentPedidoSourceId: "ped-1318",
      items: [],
    };

    await repo.persistChildSale(connectionId, sampleVS, observedAt);

    expect(mockTx.saleSourceDocument.create).toHaveBeenCalledWith({
      data: {
        saleId: "parent-sale-ped-1",
        connectionId,
        docType: SaleAnchorType.VENDA_SIMPLES,
        sourceId: "vs-7091",
        netAmount: new Prisma.Decimal("3996.60"),
        status: "A",
        sourceCreatedAt: dCreated,
        sourceConfirmedAt: dConfirmed,
        sourceEmissaoAt: null,
        realizedDate: dConfirmed, // VENDA_SIMPLES status A uses sourceConfirmedAt
        sourcePresent: true,
        lastSeenAt: observedAt,
      },
    });
  });

  it("persistChildSale: Case B (update idempotente sob parent PEDIDO)", async () => {
    const mockTx = createMockTx();
    mockTx.sale.findUnique.mockResolvedValue({ id: "parent-sale-ped-1" });
    // Document already linked to parent-sale-ped-1
    mockTx.saleSourceDocument.findUnique.mockResolvedValue({
      id: "doc-vs-existing-1",
      saleId: "parent-sale-ped-1",
    });

    const transactionSpy = vi.fn(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx),
    );
    const mockPrisma = {
      $transaction: transactionSpy,
    } as unknown as PrismaClient;

    const repo = createSalesRepository(mockPrisma);

    const dEmissao = new Date("2026-01-20T11:00:00.000Z");

    const sampleNfe: NormalizedSale = {
      sourceId: "nfe-2858",
      anchorType: SaleAnchorType.NFE,
      status: "A",
      netAmount: "2790.00",
      customerSourceId: "cust-tagplus-1",
      sourceCreatedAt: null,
      sourceConfirmedAt: null,
      sourceEmissaoAt: dEmissao,
      parentPedidoSourceId: "ped-1318",
      items: [],
    };

    await repo.persistChildSale(connectionId, sampleNfe, observedAt);

    expect(mockTx.saleSourceDocument.update).toHaveBeenCalledWith({
      where: { id: "doc-vs-existing-1" },
      data: {
        netAmount: new Prisma.Decimal("2790.00"),
        status: "A",
        sourceCreatedAt: null,
        sourceConfirmedAt: null,
        sourceEmissaoAt: dEmissao,
        realizedDate: dEmissao, // NFE status A uses sourceEmissaoAt
        sourcePresent: true,
        lastSeenAt: observedAt,
      },
    });
  });

  it("persistChildSale: Case C (movimentação de oldSale para parent PEDIDO)", async () => {
    const mockTx = createMockTx();
    mockTx.sale.findUnique.mockResolvedValue({ id: "parent-sale-ped-1" });
    // Document was previously attached to a standalone old-sale-s1
    mockTx.saleSourceDocument.findUnique.mockResolvedValue({
      id: "doc-moved-1",
      saleId: "old-sale-s1",
    });
    // old sale has no remaining docs
    mockTx.saleSourceDocument.count.mockResolvedValue(0);

    const transactionSpy = vi.fn(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx),
    );
    const mockPrisma = {
      $transaction: transactionSpy,
    } as unknown as PrismaClient;

    const repo = createSalesRepository(mockPrisma);

    const dEmissao = new Date("2026-01-20T11:00:00.000Z");

    const sampleNfe: NormalizedSale = {
      sourceId: "nfe-2858",
      anchorType: SaleAnchorType.NFE,
      status: "A",
      netAmount: "2790.00",
      customerSourceId: "cust-tagplus-1",
      sourceCreatedAt: null,
      sourceConfirmedAt: null,
      sourceEmissaoAt: dEmissao,
      parentPedidoSourceId: "ped-1318",
      items: [],
    };

    await repo.persistChildSale(connectionId, sampleNfe, observedAt);

    // Expect update with saleId reassignment and metadata enrichment
    expect(mockTx.saleSourceDocument.update).toHaveBeenCalledWith({
      where: { id: "doc-moved-1" },
      data: {
        saleId: "parent-sale-ped-1",
        netAmount: new Prisma.Decimal("2790.00"),
        status: "A",
        sourceCreatedAt: null,
        sourceConfirmedAt: null,
        sourceEmissaoAt: dEmissao,
        realizedDate: dEmissao,
        sourcePresent: true,
        lastSeenAt: observedAt,
      },
    });

    // Expect oldSale to be cleaned up
    expect(mockTx.sale.delete).toHaveBeenCalledWith({
      where: { id: "old-sale-s1" },
    });
  });

  it("persistChildSale: standalone child sale (without parent PEDIDO)", async () => {
    const mockTx = createMockTx();
    mockTx.sale.findUnique.mockResolvedValue(null); // No parent PEDIDO
    mockTx.sale.upsert.mockResolvedValue({ id: "direct-sale-vs-1" });

    const transactionSpy = vi.fn(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx),
    );
    const mockPrisma = {
      $transaction: transactionSpy,
    } as unknown as PrismaClient;

    const repo = createSalesRepository(mockPrisma);

    const dConf = new Date("2026-03-10T12:00:00.000Z");

    const sampleVS: NormalizedSale = {
      sourceId: "vs-standalone-1",
      anchorType: SaleAnchorType.VENDA_SIMPLES,
      status: "A",
      netAmount: "850.50",
      customerSourceId: "cust-tagplus-1",
      sourceCreatedAt: dConf,
      sourceConfirmedAt: dConf,
      sourceEmissaoAt: null,
      parentPedidoSourceId: null,
      items: [],
    };

    await repo.persistChildSale(connectionId, sampleVS, observedAt);

    expect(mockTx.saleSourceDocument.upsert).toHaveBeenCalledWith({
      where: {
        connectionId_docType_sourceId: {
          connectionId,
          docType: SaleAnchorType.VENDA_SIMPLES,
          sourceId: "vs-standalone-1",
        },
      },
      create: {
        saleId: "direct-sale-vs-1",
        connectionId,
        docType: SaleAnchorType.VENDA_SIMPLES,
        sourceId: "vs-standalone-1",
        netAmount: new Prisma.Decimal("850.50"),
        status: "A",
        sourceCreatedAt: dConf,
        sourceConfirmedAt: dConf,
        sourceEmissaoAt: null,
        realizedDate: dConf,
        sourcePresent: true,
        lastSeenAt: observedAt,
      },
      update: {
        saleId: "direct-sale-vs-1",
        netAmount: new Prisma.Decimal("850.50"),
        status: "A",
        sourceCreatedAt: dConf,
        sourceConfirmedAt: dConf,
        sourceEmissaoAt: null,
        realizedDate: dConf,
        sourcePresent: true,
        lastSeenAt: observedAt,
      },
    });
  });
});
