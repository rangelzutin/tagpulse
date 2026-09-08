import "dotenv/config";
import type { PrismaClient } from "@prisma/client";
import { Prisma, SaleAnchorType } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createSalesFullSync,
} from "../../src/modules/sales/sales-full-sync.js";
import {
  createSalesRepository,
  type SalesRepository,
} from "../../src/modules/sales/sales-repository.js";
import { createTestPrismaClient } from "../helpers/test-prisma.js";

describe.sequential("sales sync idempotent recovery on isolated PostgreSQL", () => {
  let prisma: PrismaClient;
  let repository: SalesRepository;
  let companyId: string;
  let connectionId: string;
  let customer: { id: string; sourceId: string };
  let product1: { id: string; sourceId: string };
  let product2: { id: string; sourceId: string };
  const slug = `sales-recovery-test-${process.pid}-${Date.now()}`;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    repository = createSalesRepository(prisma);

    const company = await prisma.company.create({
      data: { name: "Sales Recovery Company", slug },
    });
    companyId = company.id;

    const connection = await prisma.tagPlusConnection.create({
      data: {
        companyId,
        name: "Recovery Connection",
        status: "ACTIVE",
        apiVersion: "2.0",
      },
    });
    connectionId = connection.id;

    customer = await prisma.customer.create({
      data: {
        connectionId,
        sourceId: "100",
        legalName: "Recovery Customer",
        sourcePresent: true,
        lastSeenAt: new Date(),
        lastSyncedAt: new Date(),
      },
    });

    [product1, product2] = await Promise.all([
      prisma.product.create({
        data: {
          connectionId,
          sourceId: "201",
          description: "Recovery Product 1",
          sourcePresent: true,
          lastSeenAt: new Date(),
          lastSyncedAt: new Date(),
        },
      }),
      prisma.product.create({
        data: {
          connectionId,
          sourceId: "202",
          description: "Recovery Product 2",
          sourcePresent: true,
          lastSeenAt: new Date(),
          lastSyncedAt: new Date(),
        },
      }),
    ]);
  });

  beforeEach(async () => {
    await prisma.saleSourceDocument.deleteMany({
      where: { connectionId },
    });
    await prisma.saleItem.deleteMany({
      where: { sale: { connectionId } },
    });
    await prisma.sale.deleteMany({
      where: { connectionId },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.saleSourceDocument.deleteMany({
        where: { connectionId },
      });
      await prisma.saleItem.deleteMany({
        where: { sale: { connectionId } },
      });
      await prisma.sale.deleteMany({
        where: { connectionId },
      });
      await prisma.product.deleteMany({
        where: { connectionId },
      });
      await prisma.customer.deleteMany({
        where: { connectionId },
      });
      await prisma.tagPlusConnection.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } });
      await prisma.$disconnect();
    }
  });

  it("recovers idempotently when restarting sync after partial failure", async () => {
    // Phase 1: Simulate the initial run that failed after persisting Pedido 1001
    const rawPedido1 = {
      id: 1001,
      valor_total: "250.00",
      cliente: { id: 100 },
      data_criacao: "2026-08-01 10:00:00",
      data_confirmacao: "2026-08-01 10:30:00",
      itens: [
        {
          id: 501,
          produto_servico: { id: 201 },
          qtd: "2",
          valor_unitario: "100.00",
          valor_subtotal: "200.00",
        },
        {
          id: 502,
          produto_servico: { id: 202 },
          qtd: "1",
          valor_unitario: "50.00",
          valor_subtotal: "50.00",
        },
      ],
    };

    // Run first sync with only Pedido 1001 (simulating partial progress before failure)
    const partialSync = createSalesFullSync({
      pedidosFetcher: async ({ page }) => (page === 1 ? [rawPedido1] : []),
      vendasSimplesFetcher: async () => [],
      nfesFetcher: async () => [],
      salesRepository: repository,
      perPage: 100,
    });

    const partialResult = await partialSync(connectionId);
    expect(partialResult.pedidos.recordsFetched).toBe(1);

    const initialSales = await prisma.sale.findMany({ where: { connectionId } });
    const initialItems = await prisma.saleItem.findMany({ where: { sale: { connectionId } } });
    const initialDocs = await prisma.saleSourceDocument.findMany({ where: { connectionId } });

    expect(initialSales).toHaveLength(1);
    expect(initialItems).toHaveLength(2);
    expect(initialDocs).toHaveLength(1);

    // Phase 2: Restart sync from page 1 including Pedido 1001 and subsequent Pedido 1002,
    // plus linked Venda Simples and NFe for Pedido 1001
    const rawPedido2 = {
      id: 1002,
      valor_total: "80.00",
      cliente: { id: 100 },
      data_criacao: "2026-08-02 11:00:00",
      data_confirmacao: "2026-08-02 11:15:00",
      itens: [
        {
          id: 503,
          produto_servico: { id: 201 },
          qtd: "1",
          valor_unitario: "80.00",
          valor_subtotal: "80.00",
        },
      ],
    };

    const rawVenda1 = {
      id: 7001,
      valor_total: "250.00",
      cliente: { id: 100 },
      data_criacao: "2026-08-01 10:35:00",
      data_confirmacao: "2026-08-01 10:35:00",
      pedido_os_vinculada: { id: 1001 },
      itens: [
        {
          id: 901,
          produto_servico: { id: 201 },
          qtd: "2",
          valor_unitario: "100.00",
          valor_subtotal: "200.00",
        },
      ],
    };

    const rawNfe1 = {
      id: 8001,
      tipo: "S",
      valor_nota: "250.00",
      cliente: { id: 100 },
      data_criacao: "2026-08-01 10:40:00",
      data_confirmacao: "2026-08-01 10:40:00",
      data_emissao: "2026-08-01 10:45:00",
      pedido_os_vinculada: { id: 1001 },
      itens: [],
    };

    const restartSync = createSalesFullSync({
      pedidosFetcher: async ({ page }) => (page === 1 ? [rawPedido1, rawPedido2] : []),
      vendasSimplesFetcher: async ({ page }) => (page === 1 ? [rawVenda1] : []),
      nfesFetcher: async ({ page }) => (page === 1 ? [rawNfe1] : []),
      salesRepository: repository,
      perPage: 100,
    });

    const recoveryResult = await restartSync(connectionId);
    expect(recoveryResult.pedidos.recordsFetched).toBe(2);
    expect(recoveryResult.vendasSimples.recordsFetched).toBe(1);
    expect(recoveryResult.nfes.recordsFetched).toBe(1);

    // Assertions:
    // 1. Reprocessing already-persisted Pedido 1001 did NOT create duplicate Sale
    const finalSales = await prisma.sale.findMany({
      where: { connectionId },
      include: { items: true, sourceDocs: true },
      orderBy: { anchorSourceId: "asc" },
    });
    expect(finalSales).toHaveLength(2); // Exactly 1 for 1001, 1 for 1002

    const sale1001 = finalSales.find((s) => s.anchorSourceId === "1001");
    expect(sale1001).toBeDefined();
    expect(sale1001!.anchorType).toBe(SaleAnchorType.PEDIDO);
    expect(sale1001!.netAmount).toEqual(new Prisma.Decimal("250.00"));
    expect(sale1001!.customerId).toBe(customer.id);

    // 2. Existing SaleItems converged correctly (no duplicate items for Pedido 1001)
    expect(sale1001!.items).toHaveLength(2);
    const item501 = sale1001!.items.find((i) => i.sourceItemId === "501");
    const item502 = sale1001!.items.find((i) => i.sourceItemId === "502");
    expect(item501).toBeDefined();
    expect(item502).toBeDefined();
    expect(item501!.productId).toBe(product1.id);
    expect(item502!.productId).toBe(product2.id);

    // 3. Source document remains unique and child docs converged to parent Pedido Sale
    expect(sale1001!.sourceDocs).toHaveLength(3);
    const docTypes = sale1001!.sourceDocs.map((d) => d.docType).sort();
    expect(docTypes).toEqual([
      SaleAnchorType.NFE,
      SaleAnchorType.PEDIDO,
      SaleAnchorType.VENDA_SIMPLES,
    ]);

    // 4. Subsequent records continue normally (Pedido 1002 persisted cleanly)
    const sale1002 = finalSales.find((s) => s.anchorSourceId === "1002");
    expect(sale1002).toBeDefined();
    expect(sale1002!.netAmount).toEqual(new Prisma.Decimal("80.00"));
    expect(sale1002!.items).toHaveLength(1);
    expect(sale1002!.sourceDocs).toHaveLength(1);
    expect(sale1002!.sourceDocs[0].docType).toBe(SaleAnchorType.PEDIDO);
  });
});
