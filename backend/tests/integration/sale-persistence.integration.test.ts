import "dotenv/config";
import type { PrismaClient } from "@prisma/client";
import { Prisma, SaleAnchorType } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { computeCommercialDate } from "../../src/modules/sales/commercial-date.js";
import { createTestPrismaClient } from "../helpers/test-prisma.js";

describe.sequential("sale persistence on isolated PostgreSQL", () => {
  let prisma: PrismaClient;
  let companyId: string;
  let connectionA: string;
  let connectionB: string;
  let testCustomer: { id: string; sourceId: string };
  let testProduct: { id: string; sourceId: string };
  const slug = `sale-persistence-${process.pid}-${Date.now()}`;

  beforeAll(async () => {
    prisma = createTestPrismaClient();

    const company = await prisma.company.create({
      data: { name: "Sale Persistence Company", slug },
    });
    companyId = company.id;

    const [a, b] = await Promise.all([
      prisma.tagPlusConnection.create({
        data: {
          companyId,
          name: "Connection A",
          status: "ACTIVE",
          apiVersion: "2.0",
        },
      }),
      prisma.tagPlusConnection.create({
        data: {
          companyId,
          name: "Connection B",
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
        sourceId: "cust-source-1",
        legalName: "Test Customer",
        sourcePresent: true,
        lastSeenAt: new Date(),
        lastSyncedAt: new Date(),
      },
    });

    testProduct = await prisma.product.create({
      data: {
        connectionId: connectionA,
        sourceId: "prod-source-1",
        description: "Test Product",
        sourcePresent: true,
        lastSeenAt: new Date(),
        lastSyncedAt: new Date(),
      },
    });
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

  it("1. duplicate Sale canonical anchor rejected", async () => {
    await prisma.sale.create({
      data: {
        connectionId: connectionA,
        anchorType: SaleAnchorType.PEDIDO,
        anchorSourceId: "ORDER-1001",
        netAmount: new Prisma.Decimal("150.0000"),
      },
    });

    await expect(
      prisma.sale.create({
        data: {
          connectionId: connectionA,
          anchorType: SaleAnchorType.PEDIDO,
          anchorSourceId: "ORDER-1001",
          netAmount: new Prisma.Decimal("200.0000"),
        },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it("2. same opaque anchorSourceId under different anchor types allowed", async () => {
    const pedido = await prisma.sale.create({
      data: {
        connectionId: connectionA,
        anchorType: SaleAnchorType.PEDIDO,
        anchorSourceId: "SHARED-ID-01",
        netAmount: new Prisma.Decimal("100.0000"),
      },
    });

    const nfe = await prisma.sale.create({
      data: {
        connectionId: connectionA,
        anchorType: SaleAnchorType.NFE,
        anchorSourceId: "SHARED-ID-01",
        netAmount: new Prisma.Decimal("100.0000"),
      },
    });

    expect(pedido.id).toBeDefined();
    expect(nfe.id).toBeDefined();
    expect(pedido.id).not.toBe(nfe.id);
  });

  it("3. duplicate SaleSourceDocument (connectionId, docType, sourceId) across two Sales rejected", async () => {
    const sale1 = await prisma.sale.create({
      data: {
        connectionId: connectionA,
        anchorType: SaleAnchorType.PEDIDO,
        anchorSourceId: "SALE-DOC-1",
        netAmount: new Prisma.Decimal("50.0000"),
      },
    });

    const sale2 = await prisma.sale.create({
      data: {
        connectionId: connectionA,
        anchorType: SaleAnchorType.PEDIDO,
        anchorSourceId: "SALE-DOC-2",
        netAmount: new Prisma.Decimal("75.0000"),
      },
    });

    await prisma.saleSourceDocument.create({
      data: {
        saleId: sale1.id,
        connectionId: connectionA,
        docType: SaleAnchorType.PEDIDO,
        sourceId: "DOC-SHARED-SOURCE",
        sourcePresent: true,
        lastSeenAt: new Date(),
      },
    });

    await expect(
      prisma.saleSourceDocument.create({
        data: {
          saleId: sale2.id,
          connectionId: connectionA,
          docType: SaleAnchorType.PEDIDO,
          sourceId: "DOC-SHARED-SOURCE",
          sourcePresent: true,
          lastSeenAt: new Date(),
        },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it("4. same source document identity allowed in different connections", async () => {
    const saleA = await prisma.sale.create({
      data: {
        connectionId: connectionA,
        anchorType: SaleAnchorType.PEDIDO,
        anchorSourceId: "CONN-A-SALE",
        netAmount: new Prisma.Decimal("50.0000"),
      },
    });

    const saleB = await prisma.sale.create({
      data: {
        connectionId: connectionB,
        anchorType: SaleAnchorType.PEDIDO,
        anchorSourceId: "CONN-B-SALE",
        netAmount: new Prisma.Decimal("50.0000"),
      },
    });

    const docA = await prisma.saleSourceDocument.create({
      data: {
        saleId: saleA.id,
        connectionId: connectionA,
        docType: SaleAnchorType.PEDIDO,
        sourceId: "SOURCE-DOC-100",
        sourcePresent: true,
        lastSeenAt: new Date(),
      },
    });

    const docB = await prisma.saleSourceDocument.create({
      data: {
        saleId: saleB.id,
        connectionId: connectionB,
        docType: SaleAnchorType.PEDIDO,
        sourceId: "SOURCE-DOC-100",
        sourcePresent: true,
        lastSeenAt: new Date(),
      },
    });

    expect(docA.id).toBeDefined();
    expect(docB.id).toBeDefined();
  });

  it("5. duplicate sourceItemId in same Sale rejected", async () => {
    const sale = await prisma.sale.create({
      data: {
        connectionId: connectionA,
        anchorType: SaleAnchorType.PEDIDO,
        anchorSourceId: "ITEM-SALE-1",
        netAmount: new Prisma.Decimal("20.0000"),
      },
    });

    await prisma.saleItem.create({
      data: {
        saleId: sale.id,
        sourceItemId: "line-item-1",
        sourceProductId: "prod-source-1",
        quantity: new Prisma.Decimal("1.0000"),
        unitPrice: new Prisma.Decimal("10.0000"),
        subtotal: new Prisma.Decimal("10.0000"),
      },
    });

    await expect(
      prisma.saleItem.create({
        data: {
          saleId: sale.id,
          sourceItemId: "line-item-1",
          sourceProductId: "prod-source-1",
          quantity: new Prisma.Decimal("2.0000"),
          unitPrice: new Prisma.Decimal("5.0000"),
          subtotal: new Prisma.Decimal("10.0000"),
        },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it("6. same Product may appear in multiple SaleItems when sourceItemId differs", async () => {
    const sale = await prisma.sale.create({
      data: {
        connectionId: connectionA,
        anchorType: SaleAnchorType.PEDIDO,
        anchorSourceId: "MULTI-LINE-SAME-PROD",
        netAmount: new Prisma.Decimal("30.0000"),
      },
    });

    const item1 = await prisma.saleItem.create({
      data: {
        saleId: sale.id,
        sourceItemId: "line-item-1",
        productId: testProduct.id,
        sourceProductId: testProduct.sourceId,
        quantity: new Prisma.Decimal("1.0000"),
        unitPrice: new Prisma.Decimal("15.0000"),
        subtotal: new Prisma.Decimal("15.0000"),
      },
    });

    const item2 = await prisma.saleItem.create({
      data: {
        saleId: sale.id,
        sourceItemId: "line-item-2",
        productId: testProduct.id,
        sourceProductId: testProduct.sourceId,
        quantity: new Prisma.Decimal("1.0000"),
        unitPrice: new Prisma.Decimal("15.0000"),
        subtotal: new Prisma.Decimal("15.0000"),
      },
    });

    expect(item1.id).toBeDefined();
    expect(item2.id).toBeDefined();
    expect(item1.productId).toBe(item2.productId);
    expect(item1.id).not.toBe(item2.id);
  });

  it("7. SaleItem productId=null with sourceProductId retained is allowed", async () => {
    const sale = await prisma.sale.create({
      data: {
        connectionId: connectionA,
        anchorType: SaleAnchorType.PEDIDO,
        anchorSourceId: "UNRESOLVED-PROD-SALE",
        netAmount: new Prisma.Decimal("25.0000"),
      },
    });

    const item = await prisma.saleItem.create({
      data: {
        saleId: sale.id,
        sourceItemId: "line-item-unresolved",
        productId: null,
        sourceProductId: "unmapped-source-product-999",
        quantity: new Prisma.Decimal("1.0000"),
        unitPrice: new Prisma.Decimal("25.0000"),
        subtotal: new Prisma.Decimal("25.0000"),
      },
    });

    expect(item.productId).toBeNull();
    expect(item.sourceProductId).toBe("unmapped-source-product-999");
  });

  it("8. Sale customerId=null is allowed", async () => {
    const sale = await prisma.sale.create({
      data: {
        connectionId: connectionA,
        anchorType: SaleAnchorType.PEDIDO,
        anchorSourceId: "UNRESOLVED-CUSTOMER-SALE",
        netAmount: new Prisma.Decimal("80.0000"),
        customerId: null,
      },
    });

    expect(sale.customerId).toBeNull();
  });

  it("9. Decimal quantity and monetary precision are preserved", async () => {
    const sale = await prisma.sale.create({
      data: {
        connectionId: connectionA,
        anchorType: SaleAnchorType.PEDIDO,
        anchorSourceId: "PRECISION-SALE-1",
        netAmount: new Prisma.Decimal("1234.5678"),
      },
    });

    const item = await prisma.saleItem.create({
      data: {
        saleId: sale.id,
        sourceItemId: "prec-item-1",
        sourceProductId: "prod-source-1",
        quantity: new Prisma.Decimal("12.3456"),
        unitPrice: new Prisma.Decimal("100.0001"),
        discountAmount: new Prisma.Decimal("0.5555"),
        subtotal: new Prisma.Decimal("1234.0123"),
      },
    });

    const fetchedSale = await prisma.sale.findUniqueOrThrow({
      where: { id: sale.id },
    });
    const fetchedItem = await prisma.saleItem.findUniqueOrThrow({
      where: { id: item.id },
    });

    expect(fetchedSale.netAmount.toString()).toBe("1234.5678");
    expect(fetchedItem.quantity.toString()).toBe("12.3456");
    expect(fetchedItem.unitPrice.toString()).toBe("100.0001");
    expect(fetchedItem.discountAmount?.toString()).toBe("0.5555");
    expect(fetchedItem.subtotal.toString()).toBe("1234.0123");
  });

  describe("computeCommercialDate rules and persistence", () => {
    it("B. computeCommercialDate confirmed-date precedence when both confirmed and created dates exist", async () => {
      const confirmedAt = new Date("2026-09-01T15:00:00.000Z");
      const createdAt = new Date("2026-09-01T10:00:00.000Z");
      const commercialDate = computeCommercialDate({
        sourceConfirmedAt: confirmedAt,
        sourceCreatedAt: createdAt,
      });

      expect(commercialDate).toEqual(confirmedAt);

      const sale = await prisma.sale.create({
        data: {
          connectionId: connectionA,
          anchorType: SaleAnchorType.PEDIDO,
          anchorSourceId: "DATE-PRECEDENCE-SALE",
          netAmount: new Prisma.Decimal("100.0000"),
          sourceCreatedAt: createdAt,
          sourceConfirmedAt: confirmedAt,
          commercialDate,
        },
      });

      const fetched = await prisma.sale.findUniqueOrThrow({
        where: { id: sale.id },
      });
      expect(fetched.commercialDate).toEqual(confirmedAt);
    });

    it("C. computeCommercialDate created-date fallback when confirmed date is absent/null", async () => {
      const createdAt = new Date("2026-09-02T10:00:00.000Z");
      const commercialDate = computeCommercialDate({
        sourceConfirmedAt: null,
        sourceCreatedAt: createdAt,
      });

      expect(commercialDate).toEqual(createdAt);

      const sale = await prisma.sale.create({
        data: {
          connectionId: connectionA,
          anchorType: SaleAnchorType.PEDIDO,
          anchorSourceId: "DATE-FALLBACK-SALE",
          netAmount: new Prisma.Decimal("100.0000"),
          sourceCreatedAt: createdAt,
          sourceConfirmedAt: null,
          commercialDate,
        },
      });

      const fetched = await prisma.sale.findUniqueOrThrow({
        where: { id: sale.id },
      });
      expect(fetched.commercialDate).toEqual(createdAt);
    });

    it("D. computeCommercialDate neither date -> null", async () => {
      const commercialDate = computeCommercialDate({
        sourceConfirmedAt: null,
        sourceCreatedAt: null,
      });

      expect(commercialDate).toBeNull();

      const sale = await prisma.sale.create({
        data: {
          connectionId: connectionA,
          anchorType: SaleAnchorType.PEDIDO,
          anchorSourceId: "DATE-NULL-SALE",
          netAmount: new Prisma.Decimal("100.0000"),
          sourceCreatedAt: null,
          sourceConfirmedAt: null,
          commercialDate,
        },
      });

      const fetched = await prisma.sale.findUniqueOrThrow({
        where: { id: sale.id },
      });
      expect(fetched.commercialDate).toBeNull();
    });
  });

  it("10. deleting Sale cascades SaleItems and SaleSourceDocuments", async () => {
    const sale = await prisma.sale.create({
      data: {
        connectionId: connectionA,
        anchorType: SaleAnchorType.PEDIDO,
        anchorSourceId: "CASCADE-SALE-1",
        netAmount: new Prisma.Decimal("100.0000"),
        items: {
          create: [
            {
              sourceItemId: "cascade-item-1",
              sourceProductId: "prod-source-1",
              quantity: new Prisma.Decimal("1.0000"),
              unitPrice: new Prisma.Decimal("100.0000"),
              subtotal: new Prisma.Decimal("100.0000"),
            },
          ],
        },
        sourceDocs: {
          create: [
            {
              connectionId: connectionA,
              docType: SaleAnchorType.PEDIDO,
              sourceId: "cascade-doc-1",
              sourcePresent: true,
              lastSeenAt: new Date(),
            },
          ],
        },
      },
      include: { items: true, sourceDocs: true },
    });

    const itemId = sale.items[0].id;
    const docId = sale.sourceDocs[0].id;

    await prisma.sale.delete({ where: { id: sale.id } });

    const remainingItem = await prisma.saleItem.findUnique({
      where: { id: itemId },
    });
    const remainingDoc = await prisma.saleSourceDocument.findUnique({
      where: { id: docId },
    });

    expect(remainingItem).toBeNull();
    expect(remainingDoc).toBeNull();
  });

  it("connection consistency: SaleSourceDocument.connectionId matches Sale.connectionId for normal persistence", async () => {
    const sale = await prisma.sale.create({
      data: {
        connectionId: connectionA,
        anchorType: SaleAnchorType.PEDIDO,
        anchorSourceId: "CONN-CONSISTENCY-SALE",
        netAmount: new Prisma.Decimal("100.0000"),
        sourceDocs: {
          create: [
            {
              connectionId: connectionA,
              docType: SaleAnchorType.PEDIDO,
              sourceId: "CONN-CONSISTENCY-DOC",
              sourcePresent: true,
              lastSeenAt: new Date(),
            },
          ],
        },
      },
      include: { sourceDocs: true },
    });

    const doc = sale.sourceDocs[0];
    expect(doc.connectionId).toBe(sale.connectionId);

    const fetchedDoc = await prisma.saleSourceDocument.findUniqueOrThrow({
      where: { id: doc.id },
    });
    const fetchedSale = await prisma.sale.findUniqueOrThrow({
      where: { id: sale.id },
    });

    expect(fetchedDoc.connectionId).toBe(fetchedSale.connectionId);
  });

  it("11. connection/customer/product relations behave according to schema", async () => {
    const sale = await prisma.sale.create({
      data: {
        connectionId: connectionA,
        customerId: testCustomer.id,
        anchorType: SaleAnchorType.PEDIDO,
        anchorSourceId: "RELATIONS-SALE-1",
        netAmount: new Prisma.Decimal("50.0000"),
        items: {
          create: [
            {
              sourceItemId: "rel-item-1",
              productId: testProduct.id,
              sourceProductId: testProduct.sourceId,
              quantity: new Prisma.Decimal("1.0000"),
              unitPrice: new Prisma.Decimal("50.0000"),
              subtotal: new Prisma.Decimal("50.0000"),
            },
          ],
        },
      },
    });

    // Forward relations from Sale
    const loadedSale = await prisma.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: {
        connection: true,
        customer: true,
        items: { include: { product: true } },
      },
    });

    expect(loadedSale.connection.id).toBe(connectionA);
    expect(loadedSale.customer?.id).toBe(testCustomer.id);
    expect(loadedSale.items[0].product?.id).toBe(testProduct.id);

    // Reverse relations
    const connectionWithSales = await prisma.tagPlusConnection.findUniqueOrThrow({
      where: { id: connectionA },
      include: { sales: true },
    });
    expect(connectionWithSales.sales.some((s) => s.id === sale.id)).toBe(true);

    const customerWithSales = await prisma.customer.findUniqueOrThrow({
      where: { id: testCustomer.id },
      include: { sales: true },
    });
    expect(customerWithSales.sales.some((s) => s.id === sale.id)).toBe(true);

    const productWithSaleItems = await prisma.product.findUniqueOrThrow({
      where: { id: testProduct.id },
      include: { saleItems: true },
    });
    expect(
      productWithSaleItems.saleItems.some(
        (i) => i.sourceItemId === "rel-item-1",
      ),
    ).toBe(true);
  });
});
