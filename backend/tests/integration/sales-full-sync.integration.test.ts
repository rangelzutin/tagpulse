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
      tipo: "S",
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
      tipo: "S",
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
      tipo: "S",
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
      tipo: "S",
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

  it("21. Inbound NFE (tipo: 'E') is ignored and does not create Sale, SaleItem or SaleSourceDocument", async () => {
    const rawNfeE = {
      id: 9001,
      tipo: "E",
      numero: 100,
      valor_nota: 250.0,
      itens: [
        {
          id: 1,
          produto_servico: { id: 10 },
          qtd: 1,
          valor_unitario: 250.0,
          valor_subtotal: 250.0,
        },
      ],
    };

    const sync = createMockSync({
      nfesFetcher: async ({ page }) => (page === 1 ? [rawNfeE] : []),
    });

    const result = await sync(connectionA);
    expect(result.nfes.recordsFetched).toBe(1);

    const sales = await prisma.sale.findMany({
      where: { connectionId: connectionA },
    });
    expect(sales).toHaveLength(0);

    const docs = await prisma.saleSourceDocument.findMany({
      where: { connectionId: connectionA },
    });
    expect(docs).toHaveLength(0);
  });

  it("22. NFE without tipo or with invalid tipo fails closed and does not enter Sale domain", async () => {
    const rawNoTipo = {
      id: 9002,
      valor_nota: 100.0,
      itens: [
        {
          id: 2,
          produto_servico: { id: 20 },
          qtd: 1,
          valor_unitario: 100.0,
          valor_subtotal: 100.0,
        },
      ],
    };

    const rawNullTipo = {
      id: 9003,
      tipo: null,
      valor_nota: 100.0,
      itens: [
        {
          id: 3,
          produto_servico: { id: 30 },
          qtd: 1,
          valor_unitario: 100.0,
          valor_subtotal: 100.0,
        },
      ],
    };

    const sync = createMockSync({
      nfesFetcher: async ({ page }) =>
        page === 1 ? [rawNoTipo, rawNullTipo] : [],
    });

    const result = await sync(connectionA);
    expect(result.nfes.recordsFetched).toBe(2);

    const sales = await prisma.sale.findMany({
      where: { connectionId: connectionA },
    });
    expect(sales).toHaveLength(0);
  });

  it("23. Mixed page with S and E: recordsFetched counts all, only S enters Sale domain", async () => {
    const rawS = {
      id: 1001,
      tipo: "S",
      valor_nota: 150.0,
      itens: [
        {
          id: 11,
          produto_servico: { id: 101 },
          qtd: 1,
          valor_unitario: 150.0,
          valor_subtotal: 150.0,
        },
      ],
    };

    const rawE1 = {
      id: 1002,
      tipo: "E",
      valor_nota: 200.0,
      itens: [
        {
          id: 12,
          produto_servico: { id: 102 },
          qtd: 1,
          valor_unitario: 200.0,
          valor_subtotal: 200.0,
        },
      ],
    };

    const rawE2 = {
      id: 1003,
      tipo: "E",
      valor_nota: 300.0,
      itens: [
        {
          id: 13,
          produto_servico: { id: 103 },
          qtd: 1,
          valor_unitario: 300.0,
          valor_subtotal: 300.0,
        },
      ],
    };

    const sync = createMockSync({
      nfesFetcher: async ({ page }) =>
        page === 1 ? [rawS, rawE1, rawE2] : [],
    });

    const result = await sync(connectionA);
    expect(result.nfes.recordsFetched).toBe(3);

    const sales = await prisma.sale.findMany({
      where: { connectionId: connectionA },
      include: { sourceDocs: true },
    });
    expect(sales).toHaveLength(1);
    expect(sales[0].anchorSourceId).toBe("1001");
    expect(sales[0].sourceDocs).toHaveLength(1);
    expect(sales[0].sourceDocs[0].sourceId).toBe("1001");
  });

  it("24. Page containing only E does not terminate sync; continues to subsequent pages until []", async () => {
    const rawPage1E = {
      id: 2001,
      tipo: "E",
      valor_nota: 50.0,
      itens: [],
    };

    const rawPage2S = {
      id: 2002,
      tipo: "S",
      valor_nota: 75.0,
      itens: [
        {
          id: 21,
          produto_servico: { id: 201 },
          qtd: 1,
          valor_unitario: 75.0,
          valor_subtotal: 75.0,
        },
      ],
    };

    const sync = createMockSync({
      nfesFetcher: async ({ page }) => {
        if (page === 1) return [rawPage1E];
        if (page === 2) return [rawPage2S];
        return [];
      },
    });

    const result = await sync(connectionA);
    expect(result.nfes.pagesFetched).toBe(3);
    expect(result.nfes.recordsFetched).toBe(2);

    const sales = await prisma.sale.findMany({
      where: { connectionId: connectionA },
    });
    expect(sales).toHaveLength(1);
    expect(sales[0].anchorSourceId).toBe("2002");
  });

  it("25. Reconciles and safely removes previously persisted orphan direct entry NFE Sale without affecting Pedido Sale; preserves Customer and Product", async () => {
    // 1. Pre-seed a direct NFE Sale (simulating contaminated state from run before fix)
    await repository.persistChildSale(
      connectionA,
      {
        anchorType: SaleAnchorType.NFE,
        sourceId: "3001",
        parentPedidoSourceId: null,
        netAmount: "500",
        customerSourceId: "507",
        sourceCreatedAt: null,
        sourceConfirmedAt: null,
        sourceEmissaoAt: null,
        items: [
          {
            sourceItemId: "ITEM-3001",
            lineNumber: 1,
            sourceProductId: "2152",
            quantity: "1",
            unitPrice: "500",
            discountAmount: null,
            subtotal: "500",
          },
        ],
      },
      new Date(),
    );

    // 2. Pre-seed a legitimate Pedido Sale that has an NFE doc attached
    await repository.persistPedido(
      connectionA,
      {
        anchorType: SaleAnchorType.PEDIDO,
        sourceId: "PEDIDO-5001",
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

    await repository.persistChildSale(
      connectionA,
      {
        anchorType: SaleAnchorType.NFE,
        sourceId: "3002",
        parentPedidoSourceId: "PEDIDO-5001",
        netAmount: "1000",
        customerSourceId: null,
        sourceCreatedAt: null,
        sourceConfirmedAt: null,
        sourceEmissaoAt: null,
        items: [],
      },
      new Date(),
    );

    // Verify initial pre-seeded state
    const preSales = await prisma.sale.findMany({
      where: { connectionId: connectionA },
    });
    expect(preSales).toHaveLength(2); // 1 direct NFE 3001 + 1 Pedido 5001

    // 3. Now run full sync where both 3001 and 3002 appear as tipo: "E" (inbound), plus Pedido 5001
    const sync = createMockSync({
      pedidosFetcher: async ({ page }) =>
        page === 1 ? [{ id: "PEDIDO-5001", valor_total: 1000 }] : [],
      nfesFetcher: async ({ page }) =>
        page === 1
          ? [
              { id: "3001", tipo: "E", valor_nota: 500 },
              { id: "3002", tipo: "E", valor_nota: 1000 },
            ]
          : [],
    });

    const result = await sync(connectionA);
    expect(result.status).toBe("COMPLETED");

    // 4. Verification of final state:
    // Spurious direct Sale 3001 MUST be completely deleted!
    const directSale = await prisma.sale.findUnique({
      where: {
        connectionId_anchorType_anchorSourceId: {
          connectionId: connectionA,
          anchorType: SaleAnchorType.NFE,
          anchorSourceId: "3001",
        },
      },
    });
    expect(directSale).toBeNull();

    // Spurious SaleItem for 3001 must be cascaded away
    const orphanItems = await prisma.saleItem.findMany({
      where: { sourceItemId: "ITEM-3001" },
    });
    expect(orphanItems).toHaveLength(0);

    // Spurious SaleSourceDocument for 3001 must be cascaded away
    const directDoc = await prisma.saleSourceDocument.findUnique({
      where: {
        connectionId_docType_sourceId: {
          connectionId: connectionA,
          docType: SaleAnchorType.NFE,
          sourceId: "3001",
        },
      },
    });
    expect(directDoc).toBeNull();

    // Customer and Product referenced by the deleted Sale MUST be preserved!
    const preservedCustomer = await prisma.customer.findUnique({
      where: {
        connectionId_sourceId: {
          connectionId: connectionA,
          sourceId: "507",
        },
      },
    });
    expect(preservedCustomer).not.toBeNull();

    const preservedProduct = await prisma.product.findUnique({
      where: {
        connectionId_sourceId: {
          connectionId: connectionA,
          sourceId: "2152",
        },
      },
    });
    expect(preservedProduct).not.toBeNull();

    // Legitimate Pedido Sale 5001 MUST NOT be deleted!
    const pedidoSale = await prisma.sale.findUnique({
      where: {
        connectionId_anchorType_anchorSourceId: {
          connectionId: connectionA,
          anchorType: SaleAnchorType.PEDIDO,
          anchorSourceId: "PEDIDO-5001",
        },
      },
      include: { sourceDocs: true },
    });
    expect(pedidoSale).not.toBeNull();
    expect(pedidoSale!.anchorType).toBe(SaleAnchorType.PEDIDO);

    // Attached NFE 3002 source doc is marked sourcePresent = false without deleting the Pedido Sale
    const nfeDoc3002 = await prisma.saleSourceDocument.findUnique({
      where: {
        connectionId_docType_sourceId: {
          connectionId: connectionA,
          docType: SaleAnchorType.NFE,
          sourceId: "3002",
        },
      },
    });
    expect(nfeDoc3002?.sourcePresent).toBe(false);
  });

  it("26. Conceptual case 2218: NFE E with duplicate item IDs does not crash or trigger unique constraint, and cleans up contaminated pre-existing Sale", async () => {
    // Pre-seed a contaminated Sale 2218
    await repository.persistChildSale(
      connectionA,
      {
        anchorType: SaleAnchorType.NFE,
        sourceId: "2218",
        parentPedidoSourceId: null,
        netAmount: "44915.39",
        customerSourceId: null,
        sourceCreatedAt: null,
        sourceConfirmedAt: null,
        sourceEmissaoAt: null,
        items: [
          {
            sourceItemId: "37702",
            lineNumber: 1,
            sourceProductId: "2152",
            quantity: "50000",
            unitPrice: "0.52947",
            discountAmount: null,
            subtotal: "26473.5",
          },
        ],
      },
      new Date(),
    );

    const rawNfe2218 = {
      id: 2218,
      numero: 2152,
      tipo: "E",
      valor_nota: 44915.39,
      itens: [
        {
          id: 37702,
          produto_servico: { id: 1724 },
          qtd: 50000,
          valor_unitario: 0.52947,
          valor_subtotal: 26473.5,
        },
        {
          id: 37702,
          produto_servico: { id: 1724 },
          qtd: 50000,
          valor_unitario: 0.52947,
          valor_subtotal: 26473.5,
        },
      ],
    };

    const sync = createMockSync({
      nfesFetcher: async ({ page }) => (page === 1 ? [rawNfe2218] : []),
    });

    const result = await sync(connectionA);
    expect(result.status).toBe("COMPLETED");
    expect(result.nfes.recordsFetched).toBe(1);

    // The contaminated Sale 2218 should now be cleanly removed by confirmed inbound recovery
    const sales = await prisma.sale.findMany({
      where: { connectionId: connectionA },
    });
    expect(sales).toHaveLength(0);
  });

  it("27. Partial failure before exhaustion does NOT clean up previously existing sales", async () => {
    // Pre-seed a direct NFE Sale
    await repository.persistChildSale(
      connectionA,
      {
        anchorType: SaleAnchorType.NFE,
        sourceId: "4001",
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

    // Sync that fails during NFE fetch
    const sync = createMockSync({
      nfesFetcher: async () => {
        throw new Error("Network timeout simulation");
      },
    });

    await expect(sync(connectionA)).rejects.toThrow("Network timeout simulation");

    // Pre-existing Sale 4001 must still exist
    const sale = await prisma.sale.findUnique({
      where: {
        connectionId_anchorType_anchorSourceId: {
          connectionId: connectionA,
          anchorType: SaleAnchorType.NFE,
          anchorSourceId: "4001",
        },
      },
    });
    expect(sale).not.toBeNull();
  });

  it("28. NFE S previously persisted but ABSENT in current scan: Sale and items remain; sourcePresent becomes false", async () => {
    // Pre-seed an outbound NFE Sale
    await repository.persistChildSale(
      connectionA,
      {
        anchorType: SaleAnchorType.NFE,
        sourceId: "OUTBOUND-ABSENT",
        parentPedidoSourceId: null,
        netAmount: "350",
        customerSourceId: null,
        sourceCreatedAt: null,
        sourceConfirmedAt: null,
        sourceEmissaoAt: null,
        items: [
          {
            sourceItemId: "ITEM-ABSENT",
            lineNumber: 1,
            sourceProductId: "2152",
            quantity: "1",
            unitPrice: "350",
            discountAmount: null,
            subtotal: "350",
          },
        ],
      },
      new Date(),
    );

    // Scan returns another outbound NFE, but NOT "OUTBOUND-ABSENT"
    const sync = createMockSync({
      nfesFetcher: async ({ page }) =>
        page === 1
          ? [
              {
                id: "OTHER-S",
                tipo: "S",
                valor_nota: 100,
                itens: [
                  {
                    id: 99,
                    produto_servico: { id: 2152 },
                    qtd: 1,
                    valor_unitario: 100,
                    valor_subtotal: 100,
                  },
                ],
              },
            ]
          : [],
    });

    const result = await sync(connectionA);
    expect(result.status).toBe("COMPLETED");

    // Sale MUST NOT be hard-deleted!
    const absentSale = await prisma.sale.findUnique({
      where: {
        connectionId_anchorType_anchorSourceId: {
          connectionId: connectionA,
          anchorType: SaleAnchorType.NFE,
          anchorSourceId: "OUTBOUND-ABSENT",
        },
      },
      include: { items: true, sourceDocs: true },
    });
    expect(absentSale).not.toBeNull();
    expect(absentSale!.items).toHaveLength(1);
    expect(absentSale!.items[0].sourceItemId).toBe("ITEM-ABSENT");
    expect(absentSale!.sourceDocs[0].sourcePresent).toBe(false);
  });

  it("29. NFE with unknown/missing tipo previously persisted: NOT hard-deleted because unknown != E", async () => {
    // Pre-seed a direct NFE Sale
    await repository.persistChildSale(
      connectionA,
      {
        anchorType: SaleAnchorType.NFE,
        sourceId: "UNKNOWN-DOC",
        parentPedidoSourceId: null,
        netAmount: "200",
        customerSourceId: null,
        sourceCreatedAt: null,
        sourceConfirmedAt: null,
        sourceEmissaoAt: null,
        items: [],
      },
      new Date(),
    );

    // Current scan returns this NFE with unknown / missing tipo
    const sync = createMockSync({
      nfesFetcher: async ({ page }) =>
        page === 1
          ? [
              { id: "UNKNOWN-DOC", tipo: null, valor_nota: 200 },
              { id: "OTHER-UNKNOWN", tipo: "X", valor_nota: 100 },
            ]
          : [],
    });

    const result = await sync(connectionA);
    expect(result.status).toBe("COMPLETED");

    // UNKNOWN-DOC MUST NOT be deleted because it is NOT confirmed E!
    const sale = await prisma.sale.findUnique({
      where: {
        connectionId_anchorType_anchorSourceId: {
          connectionId: connectionA,
          anchorType: SaleAnchorType.NFE,
          anchorSourceId: "UNKNOWN-DOC",
        },
      },
      include: { sourceDocs: true },
    });
    expect(sale).not.toBeNull();
    // Reconciled absent normally
    expect(sale!.sourceDocs[0].sourcePresent).toBe(false);
  });

  it("30. Observed outbound empty + endpoint containing only entries: only confirmed E are deleted; other historical sales remain", async () => {
    // Pre-seed a historical outbound NFE Sale and a contaminated entry NFE Sale
    await repository.persistChildSale(
      connectionA,
      {
        anchorType: SaleAnchorType.NFE,
        sourceId: "HISTORICAL-S",
        parentPedidoSourceId: null,
        netAmount: "500",
        customerSourceId: null,
        sourceCreatedAt: null,
        sourceConfirmedAt: null,
        sourceEmissaoAt: null,
        items: [],
      },
      new Date(),
    );

    await repository.persistChildSale(
      connectionA,
      {
        anchorType: SaleAnchorType.NFE,
        sourceId: "HISTORICAL-E",
        parentPedidoSourceId: null,
        netAmount: "300",
        customerSourceId: null,
        sourceCreatedAt: null,
        sourceConfirmedAt: null,
        sourceEmissaoAt: null,
        items: [],
      },
      new Date(),
    );

    // Current scan returns only HISTORICAL-E with tipo: "E" (no outbound sales observed)
    const sync = createMockSync({
      nfesFetcher: async ({ page }) =>
        page === 1 ? [{ id: "HISTORICAL-E", tipo: "E", valor_nota: 300 }] : [],
    });

    const result = await sync(connectionA);
    expect(result.status).toBe("COMPLETED");

    // HISTORICAL-E was confirmed as E -> MUST be deleted
    const deletedSale = await prisma.sale.findUnique({
      where: {
        connectionId_anchorType_anchorSourceId: {
          connectionId: connectionA,
          anchorType: SaleAnchorType.NFE,
          anchorSourceId: "HISTORICAL-E",
        },
      },
    });
    expect(deletedSale).toBeNull();

    // HISTORICAL-S was NOT confirmed as E -> MUST NOT be deleted (remains with sourcePresent: false)
    const preservedSale = await prisma.sale.findUnique({
      where: {
        connectionId_anchorType_anchorSourceId: {
          connectionId: connectionA,
          anchorType: SaleAnchorType.NFE,
          anchorSourceId: "HISTORICAL-S",
        },
      },
      include: { sourceDocs: true },
    });
    expect(preservedSale).not.toBeNull();
    expect(preservedSale!.sourceDocs[0].sourcePresent).toBe(false);
  });

  it("31. Completely empty endpoint: ZERO hard-delete of Sale; sourcePresent reconciled normally", async () => {
    // Pre-seed a direct NFE Sale
    await repository.persistChildSale(
      connectionA,
      {
        anchorType: SaleAnchorType.NFE,
        sourceId: "OLD-NFE",
        parentPedidoSourceId: null,
        netAmount: "150",
        customerSourceId: null,
        sourceCreatedAt: null,
        sourceConfirmedAt: null,
        sourceEmissaoAt: null,
        items: [],
      },
      new Date(),
    );

    // Empty endpoint
    const sync = createMockSync({
      nfesFetcher: async () => [],
    });

    const result = await sync(connectionA);
    expect(result.status).toBe("COMPLETED");

    // ZERO hard-delete: OLD-NFE remains intact with sourcePresent = false
    const sale = await prisma.sale.findUnique({
      where: {
        connectionId_anchorType_anchorSourceId: {
          connectionId: connectionA,
          anchorType: SaleAnchorType.NFE,
          anchorSourceId: "OLD-NFE",
        },
      },
      include: { sourceDocs: true },
    });
    expect(sale).not.toBeNull();
    expect(sale!.sourceDocs[0].sourcePresent).toBe(false);
  });

  it("32. NFE E linked to Sale anchored by VENDA_SIMPLES: legitimate Sale remains intact", async () => {
    // Pre-seed a legitimate Venda Simples Sale
    await repository.persistChildSale(
      connectionA,
      {
        anchorType: SaleAnchorType.VENDA_SIMPLES,
        sourceId: "VENDA-7001",
        parentPedidoSourceId: null,
        netAmount: "800",
        customerSourceId: null,
        sourceCreatedAt: null,
        sourceConfirmedAt: null,
        sourceEmissaoAt: null,
        items: [],
      },
      new Date(),
    );

    // Attach an NFE doc to this Venda Simples Sale
    await prisma.saleSourceDocument.create({
      data: {
        connectionId: connectionA,
        saleId: (
          await prisma.sale.findFirstOrThrow({
            where: {
              connectionId: connectionA,
              anchorType: SaleAnchorType.VENDA_SIMPLES,
              anchorSourceId: "VENDA-7001",
            },
          })
        ).id,
        docType: SaleAnchorType.NFE,
        sourceId: "NFE-INBOUND-ATTACHED",
        sourcePresent: true,
        lastSeenAt: new Date(),
      },
    });

    // Run sync where NFE-INBOUND-ATTACHED is confirmed as tipo: "E"
    const sync = createMockSync({
      vendasSimplesFetcher: async ({ page }) =>
        page === 1 ? [{ id: "VENDA-7001", valor_total: 800 }] : [],
      nfesFetcher: async ({ page }) =>
        page === 1
          ? [{ id: "NFE-INBOUND-ATTACHED", tipo: "E", valor_nota: 800 }]
          : [],
    });

    const result = await sync(connectionA);
    expect(result.status).toBe("COMPLETED");

    // The VENDA_SIMPLES Sale MUST NOT be deleted!
    const vendaSale = await prisma.sale.findUnique({
      where: {
        connectionId_anchorType_anchorSourceId: {
          connectionId: connectionA,
          anchorType: SaleAnchorType.VENDA_SIMPLES,
          anchorSourceId: "VENDA-7001",
        },
      },
    });
    expect(vendaSale).not.toBeNull();
  });

  it("33. Sale with anchorType NFE that has an attached PEDIDO/VENDA_SIMPLES source document: NOT deleted", async () => {
    // Pre-seed a Sale with anchorType NFE
    await repository.persistChildSale(
      connectionA,
      {
        anchorType: SaleAnchorType.NFE,
        sourceId: "CONVERGED-NFE-ANCHOR",
        parentPedidoSourceId: null,
        netAmount: "600",
        customerSourceId: null,
        sourceCreatedAt: null,
        sourceConfirmedAt: null,
        sourceEmissaoAt: null,
        items: [],
      },
      new Date(),
    );

    const saleRecord = await prisma.sale.findFirstOrThrow({
      where: {
        connectionId: connectionA,
        anchorType: SaleAnchorType.NFE,
        anchorSourceId: "CONVERGED-NFE-ANCHOR",
      },
    });

    // Attach a PEDIDO document to this Sale
    await prisma.saleSourceDocument.create({
      data: {
        connectionId: connectionA,
        saleId: saleRecord.id,
        docType: SaleAnchorType.PEDIDO,
        sourceId: "ATTACHED-PEDIDO-DOC",
        sourcePresent: true,
        lastSeenAt: new Date(),
      },
    });

    // Run sync where CONVERGED-NFE-ANCHOR appears as tipo: "E"
    const sync = createMockSync({
      nfesFetcher: async ({ page }) =>
        page === 1
          ? [{ id: "CONVERGED-NFE-ANCHOR", tipo: "E", valor_nota: 600 }]
          : [],
    });

    const result = await sync(connectionA);
    expect(result.status).toBe("COMPLETED");

    // Sale MUST NOT be deleted because it has a source document of another docType (PEDIDO)
    const preservedSale = await prisma.sale.findUnique({
      where: { id: saleRecord.id },
    });
    expect(preservedSale).not.toBeNull();
  });

  it("34. Second execution after cleanup is completely idempotent", async () => {
    // Run sync with one outbound NFE and one inbound NFE
    const sync = createMockSync({
      nfesFetcher: async ({ page }) =>
        page === 1
          ? [
              {
                id: "OUTBOUND-10",
                tipo: "S",
                valor_nota: 100,
                itens: [
                  {
                    id: 1,
                    produto_servico: { id: 2152 },
                    qtd: 1,
                    valor_unitario: 100,
                    valor_subtotal: 100,
                  },
                ],
              },
              { id: "INBOUND-20", tipo: "E", valor_nota: 200 },
            ]
          : [],
    });

    // First execution
    const result1 = await sync(connectionA);
    expect(result1.status).toBe("COMPLETED");

    const salesRun1 = await prisma.sale.findMany({
      where: { connectionId: connectionA },
      include: { items: true, sourceDocs: true },
    });
    expect(salesRun1).toHaveLength(1);
    expect(salesRun1[0].anchorSourceId).toBe("OUTBOUND-10");

    // Second execution (same input)
    const result2 = await sync(connectionA);
    expect(result2.status).toBe("COMPLETED");

    const salesRun2 = await prisma.sale.findMany({
      where: { connectionId: connectionA },
      include: { items: true, sourceDocs: true },
    });
    expect(salesRun2).toHaveLength(1);
    expect(salesRun2[0].id).toBe(salesRun1[0].id);
    expect(salesRun2[0].anchorSourceId).toBe("OUTBOUND-10");
  });
});
