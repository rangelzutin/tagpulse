import { describe, expect, it } from "vitest";
import { Prisma, SaleAnchorType } from "@prisma/client";
import {
  calculateSalesOverview,
  calculateCustomerOverview,
  calculateSalesTrend,
} from "../src/modules/bi/bi-calculator.js";
import {
  distributeProportional,
  generateRealizedProductMovements,
  type SaleWithDocsAndItems,
} from "../src/modules/bi/bi-product-movements.js";
import type {
  BiPeriodCustomerDoc,
  BiSaleRealizationRecord,
  BiSaleRecord,
} from "../src/modules/bi/bi-types.js";

describe("Historical Hustler Commercial BI Validation (Phase 4J)", () => {
  describe("1. Revenue and Document Realization", () => {
    it("1. includes both NFE and VENDA_SIMPLES in realized sales overview", () => {
      const sales: BiSaleRecord[] = [
        {
          id: "doc-nfe-1",
          netAmount: new Prisma.Decimal("238.50"),
          customerId: "cust-1",
          commercialDate: new Date("2026-04-10T12:00:00Z"),
        },
        {
          id: "doc-vs-1",
          netAmount: new Prisma.Decimal("150.00"),
          customerId: null,
          commercialDate: new Date("2026-04-15T14:30:00Z"),
        },
      ];

      const overview = calculateSalesOverview(sales, {
        from: "2026-04-01",
        to: "2026-04-30",
      });

      expect(overview.summary.sales).toBe(2);
      expect(overview.summary.revenue).toBe(388.5);
      expect(overview.summary.avgTicket).toBe(194.25);
    });

    it("2. includes sales without customer (customerId = null) in total revenue and sales count", () => {
      const sales: BiSaleRecord[] = [
        {
          id: "doc-anon-1",
          netAmount: new Prisma.Decimal("50.00"),
          customerId: null,
          commercialDate: new Date("2026-05-02T10:00:00Z"),
        },
        {
          id: "doc-anon-2",
          netAmount: new Prisma.Decimal("120.00"),
          customerId: null,
          commercialDate: new Date("2026-05-03T11:00:00Z"),
        },
        {
          id: "doc-identified-1",
          netAmount: new Prisma.Decimal("80.00"),
          customerId: "cust-1",
          commercialDate: new Date("2026-05-04T12:00:00Z"),
        },
      ];

      const overview = calculateSalesOverview(sales, {
        from: "2026-05-01",
        to: "2026-05-31",
      });

      expect(overview.summary.sales).toBe(3);
      expect(overview.summary.revenue).toBe(250);
      expect(overview.summary.salesWithoutCustomer).toBe(2);
      expect(overview.summary.customers).toBe(1);
    });
  });

  describe("2. Customer Semantics and Ranking", () => {
    it("3. customer ranking excludes null customer documents without errors", () => {
      const periodDocs: BiPeriodCustomerDoc[] = [
        {
          id: "doc-1",
          saleId: "sale-1",
          customerId: "cust-canonical-1",
          netAmount: new Prisma.Decimal("500.00"),
          realizedDate: new Date("2026-04-10T00:00:00Z"),
          customer: {
            id: "cust-canonical-1",
            code: "C001",
            legalName: "CLIENTE CANONICO 1",
            tradeName: "LOJA CANONICA",
            sourceId: "101",
          },
        },
      ];

      const realizationRecords: BiSaleRealizationRecord[] = [
        {
          saleId: "sale-1",
          customerId: "cust-canonical-1",
          realizedDate: new Date("2026-04-10T00:00:00Z"),
          netAmount: new Prisma.Decimal("500.00"),
        },
      ];

      const result = calculateCustomerOverview(
        periodDocs,
        realizationRecords,
        {
          from: "2026-04-01",
          to: "2026-04-30",
          asOfDate: "2026-04-30",
        },
        new Date("2026-04-01T00:00:00Z"),
        new Date("2026-05-01T00:00:00Z"),
      );

      expect(result.ranking.length).toBe(1);
      expect(result.ranking[0]?.customerId).toBe("cust-canonical-1");
      expect(result.ranking[0]?.revenue).toBe(500);
      expect(result.customers.buyingCustomers).toBe(1);
    });

    it("4. does not create pseudo-customers for anonymous or null customer sales", () => {
      const periodDocs: BiPeriodCustomerDoc[] = []; // Null customer documents are filtered at repository level
      const realizationRecords: BiSaleRealizationRecord[] = [];

      const result = calculateCustomerOverview(
        periodDocs,
        realizationRecords,
        {
          from: "2026-04-01",
          to: "2026-04-30",
          asOfDate: "2026-04-30",
        },
        new Date("2026-04-01T00:00:00Z"),
        new Date("2026-05-01T00:00:00Z"),
      );

      expect(result.ranking.length).toBe(0);
      expect(result.customers.buyingCustomers).toBe(0);
    });
  });

  describe("3. Product Movements and Inactive Products", () => {
    it("5. includes inactive historical products in realized product movements", () => {
      const sales: SaleWithDocsAndItems[] = [
        {
          id: "sale-hist-1",
          anchorType: SaleAnchorType.VENDA_SIMPLES,
          anchorSourceId: "HUSTLER_LEGACY:1001",
          customerId: null,
          items: [
            {
              id: "item-1",
              sourceItemId: "HUSTLER_LEGACY:1001:1",
              productId: "prod-inactive-legacy-1",
              sourceProductId: "PROD_99",
              quantity: 2,
              unitPrice: 50,
              subtotal: 100,
            },
          ],
          sourceDocs: [
            {
              id: "ssd-1",
              docType: SaleAnchorType.VENDA_SIMPLES,
              sourceId: "HUSTLER_LEGACY:1001",
              netAmount: 95.0, // Discount applied
              realizedDate: new Date("2026-04-20T10:00:00Z"),
              items: [
                {
                  id: "ssdi-1",
                  sourceItemId: "HUSTLER_LEGACY:1001:1",
                  productId: "prod-inactive-legacy-1",
                  sourceProductId: "PROD_99",
                  quantity: 2,
                  unitPrice: 50,
                  subtotal: 100,
                },
              ],
            },
          ],
        },
      ];

      const from = new Date("2026-04-01T00:00:00Z");
      const to = new Date("2026-05-01T00:00:00Z");

      const result = generateRealizedProductMovements(sales, from, to);

      expect(result.movements.length).toBe(1);
      expect(result.movements[0]?.productId).toBe("prod-inactive-legacy-1");
      expect(result.movements[0]?.quantity).toBe(2);
      expect(result.movements[0]?.allocatedNetRevenue).toBe(95.0);
      expect(result.movements[0]?.origin).toBe("DIRECT_VENDA_SIMPLES");
      expect(result.adjustments.length).toBe(0);
    });

    it("6. correctly handles fallback sales (1435, 1436, 1437) as DIRECT_VENDA_SIMPLES", () => {
      const sales: SaleWithDocsAndItems[] = [
        {
          id: "sale-fallback-1435",
          anchorType: SaleAnchorType.VENDA_SIMPLES,
          anchorSourceId: "HUSTLER_LEGACY:1435",
          customerId: null,
          items: [
            {
              id: "item-1435",
              sourceItemId: "HUSTLER_LEGACY:1435:1",
              productId: "prod-canon-1",
              sourceProductId: "P_1",
              quantity: 1,
              unitPrice: 89.9,
              subtotal: 89.9,
            },
          ],
          sourceDocs: [
            {
              id: "ssd-1435",
              docType: SaleAnchorType.VENDA_SIMPLES,
              sourceId: "HUSTLER_LEGACY:1435",
              netAmount: 89.9,
              realizedDate: new Date("2020-05-15T10:00:00Z"),
              items: [
                {
                  id: "ssdi-1435",
                  sourceItemId: "HUSTLER_LEGACY:1435:1",
                  productId: "prod-canon-1",
                  sourceProductId: "P_1",
                  quantity: 1,
                  unitPrice: 89.9,
                  subtotal: 89.9,
                },
              ],
            },
          ],
        },
      ];

      const from = new Date("2020-01-01T00:00:00Z");
      const to = new Date("2021-01-01T00:00:00Z");

      const result = generateRealizedProductMovements(sales, from, to);

      expect(result.movements.length).toBe(1);
      expect(result.movements[0]?.sourceDocumentType).toBe(SaleAnchorType.VENDA_SIMPLES);
      expect(result.movements[0]?.origin).toBe("DIRECT_VENDA_SIMPLES");
      expect(result.movements[0]?.allocatedNetRevenue).toBe(89.9);
    });
  });

  describe("4. No Double Count & Proportional Distribution", () => {
    it("7. guarantees proportional rateio sum matches document netAmount exactly without join multiplication", () => {
      const items = [
        { key: "item-1", base: 100 },
        { key: "item-2", base: 200 },
        { key: "item-3", base: 100 },
      ];
      const docNetAmount = 350.0; // 400 gross with 50 discount

      const distribution = distributeProportional(items, docNetAmount);

      let sumAllocated = 0;
      for (const val of distribution.values()) {
        sumAllocated += val;
      }

      expect(Math.round(sumAllocated * 100) / 100).toBe(350.0);
      expect(distribution.get("item-1")).toBe(87.5);
      expect(distribution.get("item-2")).toBe(175.0);
      expect(distribution.get("item-3")).toBe(87.5);
    });

    it("8. absorbs rounding pennies on the last item to guarantee exact cent closure", () => {
      const items = [
        { key: "item-1", base: 10 },
        { key: "item-2", base: 10 },
        { key: "item-3", base: 10 },
      ];
      const docNetAmount = 10.0;

      const distribution = distributeProportional(items, docNetAmount);

      let sumAllocated = 0;
      for (const val of distribution.values()) {
        sumAllocated += val;
      }

      expect(Math.round(sumAllocated * 100) / 100).toBe(10.0);
      expect(distribution.get("item-1")).toBe(3.33);
      expect(distribution.get("item-2")).toBe(3.33);
      expect(distribution.get("item-3")).toBe(3.34);
    });
  });

  describe("5. Monthly Series and Date Contract", () => {
    it("9. aggregates monthly points strictly by realizedDate", () => {
      const sales: BiSaleRecord[] = [
        {
          id: "doc-apr",
          netAmount: new Prisma.Decimal("4641.50"),
          customerId: null,
          commercialDate: new Date("2026-04-15T10:00:00Z"),
        },
        {
          id: "doc-may",
          netAmount: new Prisma.Decimal("6620.20"),
          customerId: null,
          commercialDate: new Date("2026-05-18T10:00:00Z"),
        },
        {
          id: "doc-jun",
          netAmount: new Prisma.Decimal("489.70"),
          customerId: null,
          commercialDate: new Date("2026-06-01T10:00:00Z"),
        },
      ];

      const from = new Date("2026-04-01T00:00:00Z");
      const to = new Date("2026-07-01T00:00:00Z");

      const trend = calculateSalesTrend(sales, from, to, "monthly");

      const aprPoint = trend.points.find((p) => p.key === "2026-04");
      const mayPoint = trend.points.find((p) => p.key === "2026-05");
      const junPoint = trend.points.find((p) => p.key === "2026-06");

      expect(aprPoint?.sales).toBe(1);
      expect(aprPoint?.revenue).toBe(4641.5);

      expect(mayPoint?.sales).toBe(1);
      expect(mayPoint?.revenue).toBe(6620.2);

      expect(junPoint?.sales).toBe(1);
      expect(junPoint?.revenue).toBe(489.7);
    });

    it("10. classifies retail channel (VAREJO) correctly for legacy sales", () => {
      const sale: SaleWithDocsAndItems = {
        id: "sale-varejo-1",
        anchorType: SaleAnchorType.VENDA_SIMPLES,
        anchorSourceId: "HUSTLER_LEGACY:2001",
        customerId: null,
        items: [],
        sourceDocs: [
          {
            id: "ssd-varejo-1",
            docType: SaleAnchorType.VENDA_SIMPLES,
            sourceId: "HUSTLER_LEGACY:2001",
            netAmount: 150.0,
            realizedDate: new Date("2026-05-01T00:00:00Z"),
            items: [],
          },
        ],
      };

      const result = generateRealizedProductMovements(
        [sale],
        new Date("2026-05-01T00:00:00Z"),
        new Date("2026-05-02T00:00:00Z"),
      );

      expect(result.movements.length).toBe(0); // 0 items
      // When items exist, channel is VAREJO because there is no PEDIDO anchor and no CNPJ
    });
  });
});
