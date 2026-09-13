import type { PrismaClient } from "@prisma/client";
import { Prisma, SaleAnchorType } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { NormalizedSale } from "../src/integrations/tagplus/sales/sales-normalizers.js";
import { createSalesRepository } from "../src/modules/sales/sales-repository.js";

function createMockTx() {
  const state = {
    sales: new Map<string, any>(),
    saleItems: [] as any[],
    saleSourceDocs: new Map<string, any>(),
    docItems: [] as any[],
  };

  return {
    state,
    tx: {
      customer: {
        findUnique: vi.fn().mockResolvedValue({ id: "cust-db-1" }),
      },
      sale: {
        findUnique: vi.fn(({ where }: any) => {
          const key = `${where.connectionId_anchorType_anchorSourceId.connectionId}_${where.connectionId_anchorType_anchorSourceId.anchorType}_${where.connectionId_anchorType_anchorSourceId.anchorSourceId}`;
          return Promise.resolve(state.sales.get(key) ?? null);
        }),
        upsert: vi.fn(({ where, create, update }: any) => {
          const key = `${where.connectionId_anchorType_anchorSourceId.connectionId}_${where.connectionId_anchorType_anchorSourceId.anchorType}_${where.connectionId_anchorType_anchorSourceId.anchorSourceId}`;
          const existing = state.sales.get(key);
          const record = existing ? { ...existing, ...update } : { id: `sale-${key}`, ...create };
          state.sales.set(key, record);
          return Promise.resolve(record);
        }),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
      saleItem: {
        deleteMany: vi.fn(),
        createMany: vi.fn(({ data }: any) => {
          state.saleItems.push(...data);
          return Promise.resolve({ count: data.length });
        }),
      },
      product: {
        findUnique: vi.fn(({ where }: any) => {
          const sourceId = where.connectionId_sourceId.sourceId;
          if (sourceId === "unknown-prod") {
            return Promise.resolve(null);
          }
          return Promise.resolve({ id: `uuid-for-${sourceId}` });
        }),
      },
      saleSourceDocument: {
        findUnique: vi.fn(({ where }: any) => {
          const key = `${where.connectionId_docType_sourceId.connectionId}_${where.connectionId_docType_sourceId.docType}_${where.connectionId_docType_sourceId.sourceId}`;
          return Promise.resolve(state.saleSourceDocs.get(key) ?? null);
        }),
        create: vi.fn(({ data }: any) => {
          const doc = { id: `doc-uuid-${data.docType}-${data.sourceId}`, ...data };
          const key = `${data.connectionId}_${data.docType}_${data.sourceId}`;
          state.saleSourceDocs.set(key, doc);
          return Promise.resolve(doc);
        }),
        update: vi.fn(({ where, data }: any) => {
          const docId = where.id;
          for (const [key, doc] of state.saleSourceDocs.entries()) {
            if (doc.id === docId) {
              const updated = { ...doc, ...data };
              state.saleSourceDocs.set(key, updated);
              return Promise.resolve(updated);
            }
          }
          return Promise.resolve({ id: docId, ...data });
        }),
        upsert: vi.fn(({ where, create, update }: any) => {
          const key = `${where.connectionId_docType_sourceId.connectionId}_${where.connectionId_docType_sourceId.docType}_${where.connectionId_docType_sourceId.sourceId}`;
          const existing = state.saleSourceDocs.get(key);
          const record = existing
            ? { ...existing, ...update }
            : { id: `doc-uuid-${where.connectionId_docType_sourceId.docType}-${where.connectionId_docType_sourceId.sourceId}`, ...create };
          state.saleSourceDocs.set(key, record);
          return Promise.resolve(record);
        }),
        count: vi.fn().mockResolvedValue(1),
      },
      saleSourceDocumentItem: {
        deleteMany: vi.fn(({ where }: any) => {
          const beforeCount = state.docItems.length;
          state.docItems = state.docItems.filter(
            (it) => it.saleSourceDocumentId !== where.saleSourceDocumentId,
          );
          return Promise.resolve({ count: beforeCount - state.docItems.length });
        }),
        createMany: vi.fn(({ data }: any) => {
          state.docItems.push(...data);
          return Promise.resolve({ count: data.length });
        }),
      },
    },
  };
}

describe("SaleSourceDocumentItem persistence", () => {
  const connectionId = "conn-123";

  it("1. NF-e direta: persiste documento e seus itens discriminados", async () => {
    const { tx, state } = createMockTx();
    const repo = createSalesRepository({
      $transaction: (fn: any) => fn(tx),
    } as unknown as PrismaClient);

    const nfe: NormalizedSale = {
      sourceId: "2001",
      anchorType: SaleAnchorType.NFE,
      parentPedidoSourceId: null,
      netAmount: "350.00",
      customerSourceId: "cust-1",
      status: "A",
      sourceCreatedAt: new Date("2026-08-10T12:00:00Z"),
      sourceConfirmedAt: null,
      sourceEmissaoAt: new Date("2026-08-10T12:00:00Z"),
      items: [
        {
          sourceItemId: "nfe-it-1",
          lineNumber: 1,
          sourceProductId: "prod-10",
          quantity: "2",
          unitPrice: "100.00",
          discountAmount: null,
          subtotal: "200.00",
        },
        {
          sourceItemId: "nfe-it-2",
          lineNumber: 2,
          sourceProductId: "prod-20",
          quantity: "1",
          unitPrice: "150.00",
          discountAmount: null,
          subtotal: "150.00",
        },
      ],
    };

    await repo.persistChildSale(connectionId, nfe, new Date());

    expect(state.docItems).toHaveLength(2);
    expect(state.docItems[0]).toMatchObject({
      sourceItemId: "nfe-it-1",
      lineNumber: 1,
      sourceProductId: "prod-10",
      productId: "uuid-for-prod-10",
      quantity: new Prisma.Decimal("2"),
      subtotal: new Prisma.Decimal("200.00"),
    });
    expect(state.docItems[1]).toMatchObject({
      sourceItemId: "nfe-it-2",
      lineNumber: 2,
      sourceProductId: "prod-20",
      productId: "uuid-for-prod-20",
      quantity: new Prisma.Decimal("1"),
      subtotal: new Prisma.Decimal("150.00"),
    });
  });

  it("2. Venda Simples direta: persiste documento e seus itens discriminados", async () => {
    const { tx, state } = createMockTx();
    const repo = createSalesRepository({
      $transaction: (fn: any) => fn(tx),
    } as unknown as PrismaClient);

    const vs: NormalizedSale = {
      sourceId: "5001",
      anchorType: SaleAnchorType.VENDA_SIMPLES,
      parentPedidoSourceId: null,
      netAmount: "80.00",
      customerSourceId: "cust-1",
      status: "A",
      sourceCreatedAt: new Date("2026-08-11T14:00:00Z"),
      sourceConfirmedAt: new Date("2026-08-11T14:05:00Z"),
      sourceEmissaoAt: null,
      items: [
        {
          sourceItemId: "vs-it-1",
          lineNumber: 1,
          sourceProductId: "prod-55",
          quantity: "1",
          unitPrice: "80.00",
          discountAmount: null,
          subtotal: "80.00",
        },
      ],
    };

    await repo.persistChildSale(connectionId, vs, new Date());

    expect(state.docItems).toHaveLength(1);
    expect(state.docItems[0]).toMatchObject({
      sourceItemId: "vs-it-1",
      productId: "uuid-for-prod-55",
      subtotal: new Prisma.Decimal("80.00"),
    });
  });

  it("3. Pedido + NF-e: preserva itens negociados em SaleItem e persiste itens da NF-e em SaleSourceDocumentItem", async () => {
    const { tx, state } = createMockTx();
    const repo = createSalesRepository({
      $transaction: (fn: any) => fn(tx),
    } as unknown as PrismaClient);

    // Primeiro persistimos o Pedido
    const pedido: NormalizedSale = {
      sourceId: "ped-100",
      anchorType: SaleAnchorType.PEDIDO,
      netAmount: "1000.00",
      customerSourceId: "cust-1",
      sourceCreatedAt: new Date("2026-08-01T10:00:00Z"),
      sourceConfirmedAt: new Date("2026-08-01T10:30:00Z"),
      sourceEmissaoAt: null,
      items: [
        {
          sourceItemId: "ped-it-1",
          lineNumber: 1,
          sourceProductId: "prod-A",
          quantity: "5",
          unitPrice: "100.00",
          discountAmount: null,
          subtotal: "500.00",
        },
        {
          sourceItemId: "ped-it-2",
          lineNumber: 2,
          sourceProductId: "prod-B",
          quantity: "5",
          unitPrice: "100.00",
          discountAmount: null,
          subtotal: "500.00",
        },
      ],
    };
    await repo.persistPedido(connectionId, pedido, new Date());

    // Depois persistimos a NF-e vinculada faturando apenas prod-A
    const nfeVinculada: NormalizedSale = {
      sourceId: "nfe-900",
      anchorType: SaleAnchorType.NFE,
      parentPedidoSourceId: "ped-100",
      netAmount: "500.00",
      customerSourceId: "cust-1",
      status: "A",
      sourceCreatedAt: new Date("2026-08-05T12:00:00Z"),
      sourceConfirmedAt: null,
      sourceEmissaoAt: new Date("2026-08-05T12:00:00Z"),
      items: [
        {
          sourceItemId: "nfe-it-1",
          lineNumber: 1,
          sourceProductId: "prod-A",
          quantity: "5",
          unitPrice: "100.00",
          discountAmount: null,
          subtotal: "500.00",
        },
      ],
    };
    await repo.persistChildSale(connectionId, nfeVinculada, new Date());

    // Verificação:
    // Itens da negociação permanecem com os 2 itens do Pedido original
    expect(state.saleItems).toHaveLength(2);

    // Itens fiscais gravados no documento possuem apenas o item faturado na NF-e
    expect(state.docItems).toHaveLength(1);
    expect(state.docItems[0].sourceProductId).toBe("prod-A");
    expect(state.docItems[0].quantity).toEqual(new Prisma.Decimal("5"));
  });

  it("4. Pedido + NF-e + Venda Simples: documentos isolados com seus respectivos itens", async () => {
    const { tx, state } = createMockTx();
    const repo = createSalesRepository({
      $transaction: (fn: any) => fn(tx),
    } as unknown as PrismaClient);

    // Pedido
    await repo.persistPedido(
      connectionId,
      {
        sourceId: "ped-200",
        anchorType: SaleAnchorType.PEDIDO,
        netAmount: "800.00",
        customerSourceId: "cust-1",
        sourceCreatedAt: new Date(),
        sourceConfirmedAt: new Date(),
        sourceEmissaoAt: null,
        items: [],
      },
      new Date(),
    );

    // Doc 1: NF-e com prod-1
    await repo.persistChildSale(
      connectionId,
      {
        sourceId: "nfe-doc-1",
        anchorType: SaleAnchorType.NFE,
        parentPedidoSourceId: "ped-200",
        netAmount: "500.00",
        customerSourceId: "cust-1",
        status: "A",
        sourceCreatedAt: new Date(),
        sourceConfirmedAt: null,
        sourceEmissaoAt: new Date(),
        items: [
          {
            sourceItemId: "doc1-it-1",
            lineNumber: 1,
            sourceProductId: "prod-1",
            quantity: "5",
            unitPrice: "100.00",
            discountAmount: null,
            subtotal: "500.00",
          },
        ],
      },
      new Date(),
    );

    // Doc 2: Venda Simples com prod-2
    await repo.persistChildSale(
      connectionId,
      {
        sourceId: "vs-doc-2",
        anchorType: SaleAnchorType.VENDA_SIMPLES,
        parentPedidoSourceId: "ped-200",
        netAmount: "300.00",
        customerSourceId: "cust-1",
        status: "A",
        sourceCreatedAt: new Date(),
        sourceConfirmedAt: new Date(),
        sourceEmissaoAt: null,
        items: [
          {
            sourceItemId: "doc2-it-1",
            lineNumber: 1,
            sourceProductId: "prod-2",
            quantity: "3",
            unitPrice: "100.00",
            discountAmount: null,
            subtotal: "300.00",
          },
        ],
      },
      new Date(),
    );

    // Verificação:
    // Dois itens fiscais persistidos, pertencentes aos dois documentos distintos
    expect(state.docItems).toHaveLength(2);
    expect(state.docItems[0].saleSourceDocumentId).toBe("doc-uuid-NFE-nfe-doc-1");
    expect(state.docItems[1].saleSourceDocumentId).toBe("doc-uuid-VENDA_SIMPLES-vs-doc-2");
  });

  it("5. Idempotência / Reprocessamento: reprocessar o mesmo documento substitui itens sem duplicar", async () => {
    const { tx, state } = createMockTx();
    const repo = createSalesRepository({
      $transaction: (fn: any) => fn(tx),
    } as unknown as PrismaClient);

    const doc: NormalizedSale = {
      sourceId: "nfe-idemp",
      anchorType: SaleAnchorType.NFE,
      parentPedidoSourceId: null,
      netAmount: "200.00",
      customerSourceId: "cust-1",
      status: "A",
      sourceCreatedAt: new Date(),
      sourceConfirmedAt: null,
      sourceEmissaoAt: new Date(),
      items: [
        {
          sourceItemId: "it-1",
          lineNumber: 1,
          sourceProductId: "prod-1",
          quantity: "2",
          unitPrice: "100.00",
          discountAmount: null,
          subtotal: "200.00",
        },
      ],
    };

    // Primeira execução
    await repo.persistChildSale(connectionId, doc, new Date());
    expect(state.docItems).toHaveLength(1);

    // Segunda execução (idêntica)
    await repo.persistChildSale(connectionId, doc, new Date());
    expect(state.docItems).toHaveLength(1);
    expect(state.docItems[0].sourceItemId).toBe("it-1");
  });

  it("6. Item com produto histórico órfão: persiste com productId = null e preserva sourceProductId", async () => {
    const { tx, state } = createMockTx();
    const repo = createSalesRepository({
      $transaction: (fn: any) => fn(tx),
    } as unknown as PrismaClient);

    const doc: NormalizedSale = {
      sourceId: "nfe-orphan",
      anchorType: SaleAnchorType.NFE,
      parentPedidoSourceId: null,
      netAmount: "50.00",
      customerSourceId: "cust-1",
      status: "A",
      sourceCreatedAt: new Date(),
      sourceConfirmedAt: null,
      sourceEmissaoAt: new Date(),
      items: [
        {
          sourceItemId: "orphan-it-1",
          lineNumber: 1,
          sourceProductId: "unknown-prod", // Simula produto que não está mais no catálogo
          quantity: "1",
          unitPrice: "50.00",
          discountAmount: null,
          subtotal: "50.00",
        },
      ],
    };

    await repo.persistChildSale(connectionId, doc, new Date());

    expect(state.docItems).toHaveLength(1);
    expect(state.docItems[0].productId).toBeNull();
    expect(state.docItems[0].sourceProductId).toBe("unknown-prod");
  });

  it("7. Documento cancelado: persiste seus itens no documento sem erro", async () => {
    const { tx, state } = createMockTx();
    const repo = createSalesRepository({
      $transaction: (fn: any) => fn(tx),
    } as unknown as PrismaClient);

    const canceledNfe: NormalizedSale = {
      sourceId: "nfe-canceled",
      anchorType: SaleAnchorType.NFE,
      parentPedidoSourceId: null,
      netAmount: "300.00",
      customerSourceId: "cust-1",
      status: "S", // Cancelada/Substituída
      sourceCreatedAt: new Date(),
      sourceConfirmedAt: null,
      sourceEmissaoAt: new Date(),
      items: [
        {
          sourceItemId: "canc-it-1",
          lineNumber: 1,
          sourceProductId: "prod-9",
          quantity: "1",
          unitPrice: "300.00",
          discountAmount: null,
          subtotal: "300.00",
        },
      ],
    };

    await repo.persistChildSale(connectionId, canceledNfe, new Date());

    expect(state.docItems).toHaveLength(1);
    expect(state.saleSourceDocs.get(`${connectionId}_NFE_nfe-canceled`).status).toBe("S");
    expect(state.saleSourceDocs.get(`${connectionId}_NFE_nfe-canceled`).realizedDate).toBeNull();
  });

  it("8. Proteção contra payload resumido: se items vier vazio, não apaga itens já salvos", async () => {
    const { tx, state } = createMockTx();
    const repo = createSalesRepository({
      $transaction: (fn: any) => fn(tx),
    } as unknown as PrismaClient);

    // Primeiro sync: payload completo com itens
    await repo.persistChildSale(
      connectionId,
      {
        sourceId: "doc-protect",
        anchorType: SaleAnchorType.NFE,
        parentPedidoSourceId: null,
        netAmount: "100.00",
        customerSourceId: "cust-1",
        status: "A",
        sourceCreatedAt: new Date(),
        sourceConfirmedAt: null,
        sourceEmissaoAt: new Date(),
        items: [
          {
            sourceItemId: "it-complete",
            lineNumber: 1,
            sourceProductId: "prod-1",
            quantity: "1",
            unitPrice: "100.00",
            discountAmount: null,
            subtotal: "100.00",
          },
        ],
      },
      new Date(),
    );
    expect(state.docItems).toHaveLength(1);

    // Segundo sync: payload resumido sem itens
    await repo.persistChildSale(
      connectionId,
      {
        sourceId: "doc-protect",
        anchorType: SaleAnchorType.NFE,
        parentPedidoSourceId: null,
        netAmount: "100.00",
        customerSourceId: "cust-1",
        status: "A",
        sourceCreatedAt: new Date(),
        sourceConfirmedAt: null,
        sourceEmissaoAt: new Date(),
        items: [], // Vazio!
      },
      new Date(),
    );

    // O item gravado anteriormente foi preservado e não foi apagado
    expect(state.docItems).toHaveLength(1);
    expect(state.docItems[0].sourceItemId).toBe("it-complete");
  });
});
