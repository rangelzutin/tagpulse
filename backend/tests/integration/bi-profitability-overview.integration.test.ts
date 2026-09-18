import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../src/app.js";
import type { BiRepository } from "../../src/modules/bi/bi-repository.js";
import type { RealizedProductMovement } from "../../src/modules/bi/bi-types.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function createApp(repository: BiRepository) {
  const app = await buildApp({
    databaseHealth: { check: vi.fn() },
    frontendUrl: "http://localhost:5173",
    logger: false,
    biRepository: repository,
  });
  apps.push(app);
  return app;
}

describe("GET /bi/profitability/overview — Integration Suite", () => {
  const mockMovements: RealizedProductMovement[] = [
    {
      productId: "prod-1",
      sourceProductId: "101",
      realizedDate: new Date("2026-01-10T14:00:00.000Z"),
      quantity: 10,
      grossItemAmount: 2000,
      allocationBaseAmount: 2000,
      allocatedNetRevenue: 2000,
      saleId: "sale-1",
      customerId: "cust-1",
      channel: "ATACADO",
      sourceDocumentId: "doc-1",
      sourceDocumentType: "NFE" as any,
      origin: "DIRECT_NFE",
    },
    {
      // Produto histórico órfão (excluído do catálogo ERP)
      productId: null,
      sourceProductId: "645",
      realizedDate: new Date("2026-01-15T14:00:00.000Z"),
      quantity: 5,
      grossItemAmount: 500,
      allocationBaseAmount: 500,
      allocatedNetRevenue: 500,
      saleId: "sale-2",
      customerId: "cust-2",
      channel: "ECOMMERCE",
      sourceDocumentId: "doc-2",
      sourceDocumentType: "NFE" as any,
      origin: "DIRECT_NFE",
    },
  ];

  const createMockRepo = (): BiRepository => ({
    async findRealizedSales() {
      return [];
    },
    async findCatalogInventoryProducts() {
      return [];
    },
    async findRealizedProductMovements() {
      return { movements: [], adjustments: [] };
    },
    async findHistoricalLastPhysicalSales() {
      return new Map();
    },
    async findProfitabilityContext() {
      return {
        movements: mockMovements,
        catalogProductsMap: new Map([
          [
            "101",
            {
              id: "prod-1",
              sourceId: "101",
              code: "COD-101",
              description: "Shape Maple",
              categorySourceId: "cat-1",
              categoryDescription: "SHAPES",
              effectiveCost: 50,
            },
          ],
        ]),
        categoriesFlat: [
          {
            sourceId: "cat-1",
            description: "SHAPES",
            parentSourceId: null,
          },
        ],
        categoryTree: [
          {
            sourceId: "cat-1",
            description: "SHAPES",
            parentId: null,
            parentSourceId: null,
            active: true,
            childrenCount: 0,
            children: [],
          },
        ],
        costSnapshot: {
          asOf: new Date("2026-09-17T21:00:00.000Z"),
          lastProductSyncAt: new Date("2026-09-17T20:30:00.000Z"),
          lastProductSyncStatus: "SUCCESS",
          totalCatalogProducts: 1,
          productsWithCostCount: 1,
          productsWithoutCostCount: 0,
        },
      };
    },
  });

  it("1. Retorna status 200 e payload canônico com reconciliação de produtos órfãos", async () => {
    const app = await createApp(createMockRepo());
    const res = await app.inject({
      method: "GET",
      url: "/bi/profitability/overview?from=2026-01-01&to=2026-01-31",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);

    // Contrato base
    expect(body.period.from).toBe("2026-01-01");
    expect(body.period.to).toBe("2026-01-31");
    expect(body.costSnapshot.totalCatalogProducts).toBe(1);

    // Summary
    // prod-1: 2000 rev, cost 50 * 10 = 500 COGS. profit = 1500, margin = 75%.
    // orphan 645: 500 rev, no cost.
    // Total revenue = 2500.
    expect(body.summary.realizedRevenue).toBe(2500);
    expect(body.summary.revenueWithCurrentCost).toBe(2000);
    expect(body.summary.revenueWithoutCurrentCost).toBe(500);
    expect(body.summary.costCoveragePercent).toBe(80);
    expect(body.summary.estimatedCOGS).toBe(500);
    expect(body.summary.estimatedGrossProfit).toBe(1500);
    expect(body.summary.estimatedGrossMarginPercent).toBe(75);

    // Data Quality
    expect(body.dataQuality.movementsWithoutCurrentProduct).toBe(1);
    expect(body.dataQuality.revenueWithoutCurrentProduct).toBe(500);
    expect(body.dataQuality.currentCategoryCoveragePercent).toBe(80);

    // Reconciliação dos breakdowns de categoria vs summary
    const sumRoots = body.rootCategories.reduce((acc: number, r: any) => acc + r.realizedRevenue, 0);
    expect(sumRoots).toBe(2000);
    expect(body.summary.realizedRevenue).toBe(sumRoots + body.dataQuality.revenueWithoutCurrentProduct);

    // Produto órfão preservado na listagem de produtos com apresentação neutra
    const orphanItem = body.products.find((p: any) => p.productSourceId === "645");
    expect(orphanItem).toBeDefined();
    expect(orphanItem.productName).toBe("Produto não disponível no catálogo atual (ID: 645)");
    expect(orphanItem.sku).toBeNull();
    expect(orphanItem.currentEffectiveCost).toBeNull();
    expect(orphanItem.estimatedGrossProfit).toBeNull();
    expect(orphanItem.estimatedGrossMarginPercent).toBeNull();
  });

  it("2. Valida filtros por canal e categoria", async () => {
    const app = await createApp(createMockRepo());
    const res = await app.inject({
      method: "GET",
      url: "/bi/profitability/overview?from=2026-01-01&to=2026-01-31&channel=ATACADO",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.filters.channel).toBe("ATACADO");
    expect(body.summary.realizedRevenue).toBe(2000);
  });
});
