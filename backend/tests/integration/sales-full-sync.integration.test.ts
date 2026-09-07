import "dotenv/config";
import type { PrismaClient } from "@prisma/client";
import { Prisma, SaleAnchorType } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createSalesFullSync,
  type SalesFullSyncDependencies,
} from "../../src/modules/sales/sales-full-sync.js";
import {
  createSalesRepository,
  type SalesRepository,
} from "../../src/modules/sales/sales-repository.js";
import { createTestPrismaClient } from "../helpers/test-prisma.js";

describe.sequential("sales full sync and convergence on isolated PostgreSQL", () => {
  let prisma: PrismaClient;
  let repository: SalesRepository;
  let companyId: string;
  let connectionA: string;
  let connectionB: string;
  let testCustomer: { id: string; sourceId: string };
  let testProduct1: { id: string; sourceId: string };
  let testProduct2: { id: string; sourceId: string };
  const slug = `sales-sync-test-${process.pid}-${Date.now()}`;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    repository = createSalesRepository(prisma);

    const company = await prisma.company.create({
      data: { name: "Sales Sync Test Company", slug },
    });
    companyId = company.id;

    const [a, b] = await Promise.all([
      prisma.tagPlusConnection.create({
        data: {
          companyId,
          name: "Sales Connection A",
          status: "ACTIVE",
          apiVersion: "2.0",
        },
      }),
      prisma.tagPlusConnection.create({
        data: {
          companyId,
          name: "Sales Connection B",
          status: "ACTIVE",
          apiVersion: "2.0",
        },
      }),
    ]);
    connectionA = a.id;
    connectionB = b.id;

    testCustomer = await prisma.customer.create({
      data: {
        connectionId: connectionA,
        sourceId: "507",
        legalName: "Empresa Confidencial Ltda",
        sourcePresent: true,
        lastSeenAt: new Date(),
        lastSyncedAt: new Date(),
      },
    });

    [testProduct1, testProduct2] = await Promise.all([
      prisma.product.create({
        data: {
          connectionId: connectionA,
          sourceId: "2152",
          description: "Shape Nineclouds Pro",
          sourcePresent: true,
          lastSeenAt: new Date(),
          lastSyncedAt: new Date(),
        },
      }),
      prisma.product.create({
        data: {
          connectionId: connectionA,
          sourceId: "2153",
          description: "Grip Tape Nineclouds",
          sourcePresent: true,
          lastSeenAt: new Date(),
          lastSyncedAt: new Date(),
        },
      }),
    ]);
  });

  beforeEach(async () => {
    await prisma.saleSourceDocument.deleteMany({
      where: { connectionId: { in: [connectionA, connectionB] } },
    });
    await prisma.saleItem.deleteMany({
      where: { sale: { connectionId: { in: [connectionA, connectionB] } } },
    });
    await prisma.sale.deleteMany({
      where: { connectionId: { in: [connectionA, connectionB] } },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.saleSourceDocument.deleteMany({
        where: { connectionId: { in: [connectionA, connectionB] } },
      });
      await prisma.saleItem.deleteMany({
        where: { sale: { connectionId: { in: [connectionA, connectionB] } } },
      });
      await prisma.sale.deleteMany({
        where: { connectionId: { in: [connectionA, connectionB] } },
      });
      await prisma.product.deleteMany({
        where: { connectionId: { in: [connectionA, connectionB] } },
      });
      await prisma.customer.deleteMany({
        where: { connectionId: { in: [connectionA, connectionB] } },
      });
      await prisma.tagPlusConnection.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } });
      await prisma.$disconnect();
    }
  });

  function createMockSync(
    overrides: Partial<SalesFullSyncDependencies> = {},
  ) {
    const defaultDeps: SalesFullSyncDependencies = {
      pedidosFetcher: async () => [],
      vendasSimplesFetcher: async () => [],
      nfesFetcher: async () => [],
      salesRepository: repository,
      perPage: 100,
    };
    return createSalesFullSync({ ...defaultDeps, ...overrides });
  }

  it("1. Pedido creates one PEDIDO Sale with Pedido items and amount", async () => {
    const rawPedido = {
      id: 1282,
      numero: 1239,
      cliente: { id: 507 },
      data_criacao: "2025-10-31 09:00:00",
      data_confirmacao: "2025-10-31 10:00:00",
      valor_total: 14242.5,
      itens: [
        {
          id: 98226,
          produto_servico: { id: 2152 },
          qtd: 4,
          valor_unitario: 189.9,
          valor_desconto: 0,
          valor_subtotal: 759.6,
        },
      ],
    };

    const sync = createMockSync({
      pedidosFetcher: async ({ page }) => (page === 1 ? [rawPedido] : []),
    });

    const result = await sync(connectionA);
    expect(result.status).toBe("COMPLETED");
    expect(result.pedidos.recordsFetched).toBe(1);

    const sales = await prisma.sale.findMany({
      where: { connectionId: connectionA },
      include: { items: true, sourceDocs: true },
    });

    expect(sales).toHaveLength(1);
    const sale = sales[0];
    expect(sale.anchorType).toBe(SaleAnchorType.PEDIDO);
    expect(sale.anchorSourceId).toBe("1282");
    expect(sale.netAmount.toFixed(4)).toBe("14242.5000");
    expect(sale.customerId).toBe(testCustomer.id);
    expect(sale.items).toHaveLength(1);
    expect(sale.items[0].sourceItemId).toBe("98226");
    expect(sale.items[0].productId).toBe(testProduct1.id);
    expect(sale.items[0].subtotal.toFixed(4)).toBe("759.6000");
    expect(sale.sourceDocs).toHaveLength(1);
    expect(sale.sourceDocs[0].docType).toBe(SaleAnchorType.PEDIDO);
    expect(sale.sourceDocs[0].sourceId).toBe("1282");
  });

  it("2. Direct Venda without Pedido creates one VENDA_SIMPLES Sale", async () => {
    const rawVenda = {
      id: 7030,
      numero: "630",
      cliente: { id: 507 },
      valor_total: 500.0,
      itens: [
        {
          id: 51200,
          produto_servico: { id: 2152 },
          qtd: 2,
          valor_unitario: 250.0,
          valor_subtotal: 500.0,
        },
      ],
    };

    const sync = createMockSync({
      vendasSimplesFetcher: async ({ page }) =>
        page === 1 ? [rawVenda] : [],
    });

    await sync(connectionA);

    const sales = await prisma.sale.findMany({
      where: { connectionId: connectionA },
      include: { items: true, sourceDocs: true },
    });

    expect(sales).toHaveLength(1);
    expect(sales[0].anchorType).toBe(SaleAnchorType.VENDA_SIMPLES);
    expect(sales[0].anchorSourceId).toBe("7030");
    expect(sales[0].netAmount.toFixed(4)).toBe("500.0000");
    expect(sales[0].items[0].sourceItemId).toBe("51200");
    expect(sales[0].sourceDocs[0].docType).toBe(SaleAnchorType.VENDA_SIMPLES);
  });

  it("3. Direct NFe without Pedido creates one NFE Sale", async () => {
    const rawNfe = {
      id: 54300,
      numero: 2700,
      cliente: { id: 507 },
      valor_nota: 350.0,
      itens: [
        {
          id: 61100,
          produto_servico: { id: 2153 },
          qtd: 5,
          valor_unitario: 70.0,
          valor_subtotal: 350.0,
        },
      ],
    };

    const sync = createMockSync({
      nfesFetcher: async ({ page }) => (page === 1 ? [rawNfe] : []),
    });

    await sync(connectionA);

    const sales = await prisma.sale.findMany({
      where: { connectionId: connectionA },
      include: { items: true, sourceDocs: true },
    });

    expect(sales).toHaveLength(1);
    expect(sales[0].anchorType).toBe(SaleAnchorType.NFE);
    expect(sales[0].anchorSourceId).toBe("54300");
    expect(sales[0].netAmount.toFixed(4)).toBe("350.0000");
    expect(sales[0].items[0].sourceItemId).toBe("61100");
    expect(sales[0].items[0].productId).toBe(testProduct2.id);
    expect(sales[0].sourceDocs[0].docType).toBe(SaleAnchorType.NFE);
  });

  it("4. Venda referencing existing Pedido attaches doc to Pedido Sale without altering amount/items", async () => {
    const rawPedido = {
      id: 1282,
      valor_total: 14242.5,
      itens: [
        {
          id: 98226,
          produto_servico: { id: 2152 },
          qtd: 4,
          valor_unitario: 189.9,
          valor_subtotal: 759.6,
        },
      ],
    };

    const rawVenda = {
      id: 7022,
      pedido_os_vinculada: { id: 1282 },
      valor_total: 7120.97,
      itens: [
        {
          id: 51134,
          produto_servico: { id: 2152 },
          qtd: 4,
          valor_unitario: 94.95,
          valor_subtotal: 379.8,
        },
      ],
    };

    const sync = createMockSync({
      pedidosFetcher: async ({ page }) => (page === 1 ? [rawPedido] : []),
      vendasSimplesFetcher: async ({ page }) =>
        page === 1 ? [rawVenda] : [],
    });

    await sync(connectionA);

    const sales = await prisma.sale.findMany({
      where: { connectionId: connectionA },
      include: { items: true, sourceDocs: true },
    });

    expect(sales).toHaveLength(1);
    const sale = sales[0];
    expect(sale.anchorType).toBe(SaleAnchorType.PEDIDO);
    expect(sale.anchorSourceId).toBe("1282");
    expect(sale.netAmount.toFixed(4)).toBe("14242.5000"); // Remains Pedido amount!
    expect(sale.items).toHaveLength(1);
    expect(sale.items[0].sourceItemId).toBe("98226"); // Canonical items are Pedido items only!

    expect(sale.sourceDocs).toHaveLength(2);
    const docTypes = sale.sourceDocs.map((d) => d.docType).sort();
    expect(docTypes).toEqual(["PEDIDO", "VENDA_SIMPLES"]);
  });

  it("5. NFe referencing existing Pedido attaches doc to Pedido Sale without altering amount/items", async () => {
    const rawPedido = {
      id: 1282,
      valor_total: 1000.0,
      itens: [
        {
          id: 101,
          produto_servico: { id: 2152 },
          qtd: 1,
          valor_unitario: 1000.0,
          valor_subtotal: 1000.0,
        },
      ],
    };

    const rawNfe = {
      id: 2816,
      pedido_os_vinculada: { id: 1282 },
      valor_nota: 500.0,
      itens: [
        {
          id: 201,
          produto_servico: { id: 2152 },
          qtd: 1,
          valor_unitario: 500.0,
          valor_subtotal: 500.0,
        },
      ],
    };

    const sync = createMockSync({
      pedidosFetcher: async ({ page }) => (page === 1 ? [rawPedido] : []),
      nfesFetcher: async ({ page }) => (page === 1 ? [rawNfe] : []),
    });

    await sync(connectionA);

    const sales = await prisma.sale.findMany({
      where: { connectionId: connectionA },
      include: { items: true, sourceDocs: true },
    });

    expect(sales).toHaveLength(1);
    expect(sales[0].anchorType).toBe(SaleAnchorType.PEDIDO);
    expect(sales[0].netAmount.toFixed(4)).toBe("1000.0000");
    expect(sales[0].items[0].sourceItemId).toBe("101");
    expect(sales[0].sourceDocs).toHaveLength(2);
    expect(sales[0].sourceDocs.map((d) => d.docType).sort()).toEqual([
      "NFE",
      "PEDIDO",
    ]);
  });

  it("6. Control-case topology (Pedido 1282, Venda 7022, NFe 2816) converges into 1 Sale", async () => {
    const rawPedido = {
      id: 1282,
      numero: 1239,
      cliente: { id: 507 },
      valor_total: 14242.5,
      itens: [
        {
          id: 98226,
          produto_servico: { id: 2152 },
          qtd: 4,
          valor_unitario: 189.9,
          valor_subtotal: 759.6,
        },
        {
          id: 98227,
          produto_servico: { id: 2153 },
          qtd: 10,
          valor_unitario: 1348.29,
          valor_subtotal: 13482.9,
        },
      ],
    };

    const rawVenda = {
      id: 7022,
      numero: 626,
      cliente: { id: 507 },
      pedido_os_vinculada: { id: 1282, numero: 1239 },
      valor_total: 7120.97,
      itens: [
        {
          id: 51134,
          produto_servico: { id: 2152 },
          qtd: 4,
          valor_unitario: 94.95,
          valor_subtotal: 379.8,
        },
        {
          id: 51135,
          produto_servico: { id: 2153 },
          qtd: 5,
          valor_unitario: 1348.234,
          valor_subtotal: 6741.17,
        },
      ],
    };

    const rawNfe = {
      id: 2816,
      numero: 2713,
      cliente: { id: 507 },
      pedido_os_vinculada: { id: 1282, numero: 1239 },
      valor_nota: 7121.25,
      itens: [
        {
          id: 61001,
          produto_servico: { id: 2152 },
          qtd: 4,
          valor_unitario: 94.95,
          valor_subtotal: 379.8,
        },
        {
          id: 61002,
          produto_servico: { id: 2153 },
          qtd: 5,
          valor_unitario: 1348.29,
          valor_subtotal: 6741.45,
        },
      ],
    };

    const sync = createMockSync({
      pedidosFetcher: async ({ page }) => (page === 1 ? [rawPedido] : []),
      vendasSimplesFetcher: async ({ page }) =>
        page === 1 ? [rawVenda] : [],
      nfesFetcher: async ({ page }) => (page === 1 ? [rawNfe] : []),
    });

    await sync(connectionA);

    const sales = await prisma.sale.findMany({
      where: { connectionId: connectionA },
      include: { items: true, sourceDocs: true },
    });

    // Exactly 1 canonical Sale
    expect(sales).toHaveLength(1);
    const sale = sales[0];
    expect(sale.anchorType).toBe(SaleAnchorType.PEDIDO);
    expect(sale.anchorSourceId).toBe("1282");
    expect(sale.netAmount.toFixed(4)).toBe("14242.5000"); // Never sum of the three!

    // canonical SaleItems equal ONLY the Pedido item identities
    expect(sale.items).toHaveLength(2);
    const canonicalItemSourceIds = sale.items.map((i) => i.sourceItemId).sort();
    expect(canonicalItemSourceIds).toEqual(["98226", "98227"]);

    // no Venda item identity appears
    expect(canonicalItemSourceIds).not.toContain("51134");
    expect(canonicalItemSourceIds).not.toContain("51135");

    // no NFe item identity appears
    expect(canonicalItemSourceIds).not.toContain("61001");
    expect(canonicalItemSourceIds).not.toContain("61002");

    // Exactly 3 SaleSourceDocuments
    expect(sale.sourceDocs).toHaveLength(3);
    const sourceIds = sale.sourceDocs.map((d) => ({
      docType: d.docType,
      sourceId: d.sourceId,
    }));
    expect(sourceIds).toContainEqual({
      docType: SaleAnchorType.PEDIDO,
      sourceId: "1282",
    });
    expect(sourceIds).toContainEqual({
      docType: SaleAnchorType.VENDA_SIMPLES,
      sourceId: "7022",
    });
    expect(sourceIds).toContainEqual({
      docType: SaleAnchorType.NFE,
      sourceId: "2816",
    });
  });

  it("7. Existing direct Venda later reprocessed after Pedido exists consolidates and deletes old child Sale", async () => {
    // Step 1: Direct Venda synced without Pedido
    const rawVenda = {
      id: 7022,
      pedido_os_vinculada: { id: 1282 },
      valor_total: 7120.97,
      itens: [
        {
          id: 51134,
          produto_servico: { id: 2152 },
          qtd: 4,
          valor_unitario: 94.95,
          valor_subtotal: 379.8,
        },
      ],
    };

    const sync1 = createMockSync({
      vendasSimplesFetcher: async ({ page }) =>
        page === 1 ? [rawVenda] : [],
    });
    await sync1(connectionA);

    // Verify direct Sale S1 exists
    const directSaleBefore = await prisma.sale.findUnique({
      where: {
        connectionId_anchorType_anchorSourceId: {
          connectionId: connectionA,
          anchorType: SaleAnchorType.VENDA_SIMPLES,
          anchorSourceId: "7022",
        },
      },
    });
    expect(directSaleBefore).not.toBeNull();

    // Step 2: Full sync with Pedido and Venda
    const rawPedido = {
      id: 1282,
      valor_total: 14242.5,
      itens: [
        {
          id: 98226,
          produto_servico: { id: 2152 },
          qtd: 4,
          valor_unitario: 189.9,
          valor_subtotal: 759.6,
        },
      ],
    };

    const sync2 = createMockSync({
      pedidosFetcher: async ({ page }) => (page === 1 ? [rawPedido] : []),
      vendasSimplesFetcher: async ({ page }) =>
        page === 1 ? [rawVenda] : [],
    });
    await sync2(connectionA);

    // Direct Sale S1 must be deleted
    const directSaleAfter = await prisma.sale.findUnique({
      where: {
        connectionId_anchorType_anchorSourceId: {
          connectionId: connectionA,
          anchorType: SaleAnchorType.VENDA_SIMPLES,
          anchorSourceId: "7022",
        },
      },
    });
    expect(directSaleAfter).toBeNull();

    // Only Pedido Sale exists with both source docs
    const allSales = await prisma.sale.findMany({
      where: { connectionId: connectionA },
      include: { items: true, sourceDocs: true },
    });
    expect(allSales).toHaveLength(1);
    expect(allSales[0].anchorType).toBe(SaleAnchorType.PEDIDO);
    expect(allSales[0].sourceDocs).toHaveLength(2);
    // Venda items cascaded with S1, only Pedido items remain
    expect(allSales[0].items).toHaveLength(1);
    expect(allSales[0].items[0].sourceItemId).toBe("98226");
  });

  it("8. Existing direct NFe later reprocessed after Pedido exists consolidates and deletes old child Sale", async () => {
    const rawNfe = {
      id: 2816,
      pedido_os_vinculada: { id: 1282 },
      valor_nota: 7121.25,
      itens: [
        {
          id: 61001,
          produto_servico: { id: 2152 },
          qtd: 4,
          valor_unitario: 94.95,
          valor_subtotal: 379.8,
        },
      ],
    };

    // First sync: direct NFe
    const sync1 = createMockSync({
      nfesFetcher: async ({ page }) => (page === 1 ? [rawNfe] : []),
    });
    await sync1(connectionA);

    // Second sync: Pedido and NFe
    const rawPedido = {
      id: 1282,
      valor_total: 14242.5,
      itens: [
        {
          id: 98226,
          produto_servico: { id: 2152 },
          qtd: 4,
          valor_unitario: 189.9,
          valor_subtotal: 759.6,
        },
      ],
    };

    const sync2 = createMockSync({
      pedidosFetcher: async ({ page }) => (page === 1 ? [rawPedido] : []),
      nfesFetcher: async ({ page }) => (page === 1 ? [rawNfe] : []),
    });
    await sync2(connectionA);

    const allSales = await prisma.sale.findMany({
      where: { connectionId: connectionA },
      include: { sourceDocs: true },
    });
    expect(allSales).toHaveLength(1);
    expect(allSales[0].anchorType).toBe(SaleAnchorType.PEDIDO);
    expect(allSales[0].sourceDocs).toHaveLength(2);
  });

  it("9. Redundant child Sale owning another source document is not deleted until all docs consolidated", async () => {
    // Setup a direct Sale S1 that owns TWO source docs
    const directSale = await prisma.sale.create({
      data: {
        connectionId: connectionA,
        anchorType: SaleAnchorType.VENDA_SIMPLES,
        anchorSourceId: "MULTI-DOC-VENDA",
        netAmount: new Prisma.Decimal("100.0000"),
        sourceDocs: {
          create: [
            {
              connectionId: connectionA,
              docType: SaleAnchorType.VENDA_SIMPLES,
              sourceId: "CHILD-DOC-1",
              sourcePresent: true,
              lastSeenAt: new Date(),
            },
            {
              connectionId: connectionA,
              docType: SaleAnchorType.NFE,
              sourceId: "CO-OWNED-DOC-2",
              sourcePresent: true,
              lastSeenAt: new Date(),
            },
          ],
        },
      },
    });

    // Create a parent Pedido Sale
    await prisma.sale.create({
      data: {
        connectionId: connectionA,
        anchorType: SaleAnchorType.PEDIDO,
        anchorSourceId: "PARENT-100",
        netAmount: new Prisma.Decimal("500.0000"),
      },
    });

    // Consolidate ONLY CHILD-DOC-1 into parentSale
    await repository.persistChildSale(
      connectionA,
      {
        anchorType: SaleAnchorType.VENDA_SIMPLES,
        sourceId: "CHILD-DOC-1",
        parentPedidoSourceId: "PARENT-100",
        netAmount: "100",
        customerSourceId: null,
        sourceCreatedAt: null,
        sourceConfirmedAt: null,
        sourceEmissaoAt: null,
        items: [],
      },
      new Date(),
    );

    // directSale should NOT be deleted because it still owns CO-OWNED-DOC-2!
    const directSaleCheck = await prisma.sale.findUnique({
      where: { id: directSale.id },
      include: { sourceDocs: true },
    });
    expect(directSaleCheck).not.toBeNull();
    expect(directSaleCheck?.sourceDocs).toHaveLength(1);
    expect(directSaleCheck?.sourceDocs[0].sourceId).toBe("CO-OWNED-DOC-2");
  });

  it("10. Same sync repeated twice is idempotent", async () => {
    const rawPedido = {
      id: 1282,
      valor_total: 1000.0,
      itens: [
        {
          id: 10,
          produto_servico: { id: 2152 },
          qtd: 2,
          valor_unitario: 500.0,
          valor_subtotal: 1000.0,
        },
      ],
    };

    const sync = createMockSync({
      pedidosFetcher: async ({ page }) => (page === 1 ? [rawPedido] : []),
    });

    await sync(connectionA);
    const count1 = await prisma.sale.count({
      where: { connectionId: connectionA },
    });
    const items1 = await prisma.saleItem.count();
    const docs1 = await prisma.saleSourceDocument.count();

    await sync(connectionA);
    const count2 = await prisma.sale.count({
      where: { connectionId: connectionA },
    });
    const items2 = await prisma.saleItem.count();
    const docs2 = await prisma.saleSourceDocument.count();

    expect(count2).toBe(count1);
    expect(items2).toBe(items1);
    expect(docs2).toBe(docs1);
  });

  it("11. Same Product on multiple item lines remains multiple SaleItems", async () => {
    const rawPedido = {
      id: 999,
      valor_total: 200.0,
      itens: [
        {
          id: 1,
          produto_servico: { id: 2152 },
          qtd: 1,
          valor_unitario: 100.0,
          valor_subtotal: 100.0,
        },
        {
          id: 2,
          produto_servico: { id: 2152 },
          qtd: 1,
          valor_unitario: 100.0,
          valor_subtotal: 100.0,
        },
      ],
    };

    const sync = createMockSync({
      pedidosFetcher: async ({ page }) => (page === 1 ? [rawPedido] : []),
    });

    await sync(connectionA);

    const sale = await prisma.sale.findUniqueOrThrow({
      where: {
        connectionId_anchorType_anchorSourceId: {
          connectionId: connectionA,
          anchorType: SaleAnchorType.PEDIDO,
          anchorSourceId: "999",
        },
      },
      include: { items: true },
    });

    expect(sale.items).toHaveLength(2);
    expect(sale.items[0].productId).toBe(testProduct1.id);
    expect(sale.items[1].productId).toBe(testProduct1.id);
    expect(sale.items[0].sourceItemId).toBe("1");
    expect(sale.items[1].sourceItemId).toBe("2");
  });

  it("12. Missing Product retains sourceProductId with productId null", async () => {
    const rawPedido = {
      id: 1001,
      valor_total: 50.0,
      itens: [
        {
          id: 1,
          produto_servico: { id: "unmapped-product-99999" },
          qtd: 1,
          valor_unitario: 50.0,
          valor_subtotal: 50.0,
        },
      ],
    };

    const sync = createMockSync({
      pedidosFetcher: async ({ page }) => (page === 1 ? [rawPedido] : []),
    });

    await sync(connectionA);

    const sale = await prisma.sale.findUniqueOrThrow({
      where: {
        connectionId_anchorType_anchorSourceId: {
          connectionId: connectionA,
          anchorType: SaleAnchorType.PEDIDO,
          anchorSourceId: "1001",
        },
      },
      include: { items: true },
    });

    expect(sale.items[0].productId).toBeNull();
    expect(sale.items[0].sourceProductId).toBe("unmapped-product-99999");
  });

  it("13. Missing Customer allows Sale to persist with customerId null", async () => {
    const rawPedido = {
      id: 1002,
      cliente: { id: "unmapped-customer-99999" },
      valor_total: 60.0,
    };

    const sync = createMockSync({
      pedidosFetcher: async ({ page }) => (page === 1 ? [rawPedido] : []),
    });

    await sync(connectionA);

    const sale = await prisma.sale.findUniqueOrThrow({
      where: {
        connectionId_anchorType_anchorSourceId: {
          connectionId: connectionA,
          anchorType: SaleAnchorType.PEDIDO,
          anchorSourceId: "1002",
        },
      },
    });

    expect(sale.customerId).toBeNull();
  });

  it("14. Item set replacement removes deleted source line after reprocessing canonical anchor", async () => {
    const sync1 = createMockSync({
      pedidosFetcher: async ({ page }) =>
        page === 1
          ? [
              {
                id: 1003,
                valor_total: 200.0,
                itens: [
                  { id: 10, produto_servico: { id: 2152 }, qtd: 1, valor_unitario: 100, valor_subtotal: 100 },
                  { id: 20, produto_servico: { id: 2152 }, qtd: 1, valor_unitario: 100, valor_subtotal: 100 },
                ],
              },
            ]
          : [],
    });
    await sync1(connectionA);

    const sale1 = await prisma.sale.findUniqueOrThrow({
      where: {
        connectionId_anchorType_anchorSourceId: {
          connectionId: connectionA,
          anchorType: SaleAnchorType.PEDIDO,
          anchorSourceId: "1003",
        },
      },
      include: { items: true },
    });
    expect(sale1.items).toHaveLength(2);

    // Second sync: line 20 was removed at source
    const sync2 = createMockSync({
      pedidosFetcher: async ({ page }) =>
        page === 1
          ? [
              {
                id: 1003,
                valor_total: 100.0,
                itens: [
                  { id: 10, produto_servico: { id: 2152 }, qtd: 1, valor_unitario: 100, valor_subtotal: 100 },
                ],
              },
            ]
          : [],
    });
    await sync2(connectionA);

    const sale2 = await prisma.sale.findUniqueOrThrow({
      where: {
        connectionId_anchorType_anchorSourceId: {
          connectionId: connectionA,
          anchorType: SaleAnchorType.PEDIDO,
          anchorSourceId: "1003",
        },
      },
      include: { items: true },
    });
    expect(sale2.items).toHaveLength(1);
    expect(sale2.items[0].sourceItemId).toBe("10");
  });

  it("15. Short page does not terminate endpoint scan", async () => {
    let pagesCalled = 0;
    const sync = createMockSync({
      pedidosFetcher: async ({ page }) => {
        pagesCalled += 1;
        if (page === 1) return [{ id: 1, valor_total: 10 }]; // short page (1 item < 100 perPage)
        if (page === 2) return [{ id: 2, valor_total: 20 }]; // second page still requested
        return [];
      },
    });

    const result = await sync(connectionA);
    expect(pagesCalled).toBe(3);
    expect(result.pedidos.pagesFetched).toBe(3);
    expect(result.pedidos.recordsFetched).toBe(2);
  });

  it("16. Empty [] terminates endpoint scan", async () => {
    let pagesCalled = 0;
    const sync = createMockSync({
      pedidosFetcher: async ({ page }) => {
        pagesCalled += 1;
        if (page === 1) return []; // empty array immediately terminates
        return [{ id: 999, valor_total: 100 }];
      },
    });

    const result = await sync(connectionA);
    expect(pagesCalled).toBe(1);
    expect(result.pedidos.pagesFetched).toBe(1);
    expect(result.pedidos.recordsFetched).toBe(0);
  });

  it("17. Failed/incomplete endpoint scan does NOT reconcile unseen source docs absent", async () => {
    // Pre-create an active doc
    await repository.persistPedido(
      connectionA,
      {
        anchorType: SaleAnchorType.PEDIDO,
        sourceId: "EXISTING-DOC",
        parentPedidoSourceId: null,
        netAmount: "100",
        customerSourceId: null,
        sourceCreatedAt: null,
        sourceConfirmedAt: null,
        sourceEmissaoAt: null,
        items: [],
      },
      new Date(),
    );

    const sync = createMockSync({
      pedidosFetcher: async ({ page }) => {
        if (page === 1) return [{ id: 9999, valor_total: 10 }];
        throw new Error("Simulated network failure");
      },
    });

    await expect(sync(connectionA)).rejects.toThrow("Simulated network failure");

    // Existing doc must STILL be present
    const doc = await prisma.saleSourceDocument.findUniqueOrThrow({
      where: {
        connectionId_docType_sourceId: {
          connectionId: connectionA,
          docType: SaleAnchorType.PEDIDO,
          sourceId: "EXISTING-DOC",
        },
      },
    });
    expect(doc.sourcePresent).toBe(true);
  });

  it("18. Complete endpoint exhaustion DOES reconcile unseen docs of that docType absent", async () => {
    await repository.persistPedido(
      connectionA,
      {
        anchorType: SaleAnchorType.PEDIDO,
        sourceId: "DISAPPEARED-DOC",
        parentPedidoSourceId: null,
        netAmount: "100",
        customerSourceId: null,
        sourceCreatedAt: null,
        sourceConfirmedAt: null,
        sourceEmissaoAt: null,
        items: [],
      },
      new Date(),
    );

    const sync = createMockSync({
      pedidosFetcher: async ({ page }) =>
        page === 1 ? [{ id: 555, valor_total: 50 }] : [], // DISAPPEARED-DOC not returned, 555 returned
    });

    const result = await sync(connectionA);
    expect(result.pedidos.reconciledAbsent).toBe(1);

    const doc = await prisma.saleSourceDocument.findUniqueOrThrow({
      where: {
        connectionId_docType_sourceId: {
          connectionId: connectionA,
          docType: SaleAnchorType.PEDIDO,
          sourceId: "DISAPPEARED-DOC",
        },
      },
    });
    expect(doc.sourcePresent).toBe(false);

    // 555 must be present
    const doc555 = await prisma.saleSourceDocument.findUniqueOrThrow({
      where: {
        connectionId_docType_sourceId: {
          connectionId: connectionA,
          docType: SaleAnchorType.PEDIDO,
          sourceId: "555",
        },
      },
    });
    expect(doc555.sourcePresent).toBe(true);
  });

  it("19. Reconciliation for PEDIDO does not mark VENDA/NFE source docs absent", async () => {
    // Pre-create active Venda doc
    await repository.persistChildSale(
      connectionA,
      {
        anchorType: SaleAnchorType.VENDA_SIMPLES,
        sourceId: "VENDA-DOC",
        parentPedidoSourceId: null,
        netAmount: "100",
        customerSourceId: null,
        sourceCreatedAt: null,
        sourceConfirmedAt: null,
        sourceEmissaoAt: null,
        items: [],
      },
      new Date(),
    );

    // Sync Pedidos with empty results, and Vendas returning VENDA-DOC on page 1
    const sync = createMockSync({
      pedidosFetcher: async () => [],
      vendasSimplesFetcher: async ({ page }) =>
        page === 1 ? [{ id: "VENDA-DOC", valor_total: 100 }] : [],
      nfesFetcher: async () => [],
    });

    await sync(connectionA);

    const vendaDoc = await prisma.saleSourceDocument.findUniqueOrThrow({
      where: {
        connectionId_docType_sourceId: {
          connectionId: connectionA,
          docType: SaleAnchorType.VENDA_SIMPLES,
          sourceId: "VENDA-DOC",
        },
      },
    });
    expect(vendaDoc.sourcePresent).toBe(true);
  });

  it("20. Cross-connection isolation: identical TagPlus source ids cannot converge across connections", async () => {
    // Pedido 1282 in Connection A
    await repository.persistPedido(
      connectionA,
      {
        anchorType: SaleAnchorType.PEDIDO,
        sourceId: "1282",
        parentPedidoSourceId: null,
        netAmount: "1000",
        customerSourceId: null,
        sourceCreatedAt: null,
        sourceConfirmedAt: null,
        sourceEmissaoAt: null,
        items: [],
      },
      new Date(),
    );

    // Venda in Connection B referencing pedido 1282
    const syncB = createMockSync({
      vendasSimplesFetcher: async ({ page }) =>
        page === 1
          ? [
              {
                id: 7022,
                pedido_os_vinculada: { id: 1282 },
                valor_total: 500,
              },
            ]
          : [],
    });

    await syncB(connectionB);

    // Because connection B does not have Pedido 1282, Venda 7022 in connection B must be a DIRECT Sale!
    const saleB = await prisma.sale.findUnique({
      where: {
        connectionId_anchorType_anchorSourceId: {
          connectionId: connectionB,
          anchorType: SaleAnchorType.VENDA_SIMPLES,
          anchorSourceId: "7022",
        },
      },
    });
    expect(saleB).not.toBeNull();

    // Pedido in connection A should have only 1 source doc (no cross-connection convergence)
    const saleA = await prisma.sale.findUniqueOrThrow({
      where: {
        connectionId_anchorType_anchorSourceId: {
          connectionId: connectionA,
          anchorType: SaleAnchorType.PEDIDO,
          anchorSourceId: "1282",
        },
      },
      include: { sourceDocs: true },
    });
    expect(saleA.sourceDocs).toHaveLength(1);
    expect(saleA.sourceDocs[0].sourceId).toBe("1282");
  });
});
