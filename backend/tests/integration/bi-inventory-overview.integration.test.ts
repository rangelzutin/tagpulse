import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { createBiRepository } from "../../src/modules/bi/bi-repository.js";
import type { BiRepository } from "../../src/modules/bi/bi-repository.js";

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

describe("GET /bi/inventory/overview — Route & Contract Validation", () => {
  it("1. Valida windowDays default = 90 e retorno do contrato completo", async () => {
    const fakeRepo: BiRepository = {
      async findRealizedSales() {
        return [];
      },
      async findCatalogInventoryProducts() {
        return [
          {
            id: "p1",
            sourceId: "1",
            code: "COD-1",
            description: "Produto Teste",
            categoryDescription: "Cat 1",
            active: true,
            sourcePresent: true,
            stockQuantity: 10,
            effectiveCost: 50,
            averageCost: 50,
            retailSalePrice: 100,
            stockMinQuantity: 0,
            stockMaxQuantity: 0,
          },
        ];
      },
      async findRealizedProductMovements() {
        return {
          movements: [],
          adjustments: [],
        };
      },
    };

    const app = await createApp(fakeRepo);
    const res = await app.inject({
      method: "GET",
      url: "/bi/inventory/overview",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);

    expect(body.windowDays).toBe(90);
    expect(body.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Contrato do summary (17 campos)
    expect(body.summary).toBeDefined();
    expect(body.summary.totalProducts).toBe(1);
    expect(body.summary.activeProducts).toBe(1);
    expect(body.summary.productsWithPositiveStock).toBe(1);
    expect(body.summary.productsWithZeroStock).toBe(0);
    expect(body.summary.productsWithNegativeStock).toBe(0);
    expect(body.summary.inventoryCostValue).toBe(500);
    expect(body.summary.inventoryListValue).toBe(1000);
    expect(body.summary.productsSoldInWindow).toBe(0);
    expect(body.summary.demandWithoutStockCount).toBe(0);
    expect(body.summary.activeDemandWithoutStockCount).toBe(0);
    expect(body.summary.productsWithStockAndSales).toBe(0);
    expect(body.summary.productsWithStockNoSales).toBe(1);
    expect(body.summary.capitalWithSales).toBe(0);
    expect(body.summary.capitalWithoutSales).toBe(500);
    expect(body.summary.capitalWithoutSalesShare).toBe(100);
    expect(body.summary.inactiveProductsWithStock).toBe(0);
    expect(body.summary.inactiveStockCostValue).toBe(0);

    // Contrato da distribuição de cobertura
    expect(body.coverageDistribution).toBeDefined();
    expect(body.coverageDistribution.totalWithStockAndSales).toBe(0);
    expect(body.coverageDistribution.noSalesInWindow).toBe(1);

    // Contrato de produtos
    expect(Array.isArray(body.products)).toBe(true);
    expect(body.products.length).toBe(1);
    const p = body.products[0];
    expect(p.code).toBe("COD-1");
    expect(p.currentStock).toBe(10);
    expect(p.effectiveCost).toBe(50);
    expect(p.retailSalePrice).toBe(100);
    expect(p.stockCostValue).toBe(500);
    expect(p.stockListValue).toBe(1000);
    expect(p.operationalFlags).toContain("NO_SALES_IN_WINDOW");

    // Contrato de categorias
    expect(Array.isArray(body.categories)).toBe(true);
    expect(body.categories.length).toBe(1);
    expect(body.categories[0].category).toBe("Cat 1");

    // Contrato de qualidade de dados
    expect(body.dataQuality).toBeDefined();
    expect(body.dataQuality.negativeStockCount).toBe(0);
  });

  it("2. Aceita 30, 90 e 180 dias explicitamente", async () => {
    const fakeRepo: BiRepository = {
      async findRealizedSales() {
        return [];
      },
      async findCatalogInventoryProducts() {
        return [];
      },
      async findRealizedProductMovements() {
        return { movements: [], adjustments: [] };
      },
    };

    const app = await createApp(fakeRepo);

    for (const w of [30, 90, 180]) {
      const res = await app.inject({
        method: "GET",
        url: `/bi/inventory/overview?windowDays=${w}`,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.windowDays).toBe(w);
    }
  });

  it("3. Rejeita janelas não homologadas com HTTP 400", async () => {
    const fakeRepo: BiRepository = {
      async findRealizedSales() {
        return [];
      },
      async findCatalogInventoryProducts() {
        return [];
      },
      async findRealizedProductMovements() {
        return { movements: [], adjustments: [] };
      },
    };

    const app = await createApp(fakeRepo);

    for (const invalid of ["15", "45", "60", "365", "abc", "-1"]) {
      const res = await app.inject({
        method: "GET",
        url: `/bi/inventory/overview?windowDays=${invalid}`,
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.status).toBe("error");
      expect(body.message).toContain("windowDays");
    }
  });
});

describe("GET /bi/inventory/overview — Auditoria do Snapshot Homologado (Base Real)", () => {
  it(
    "Reconciliação dos números de 14/09/2026 com base de produção",
    async () => {
      const realRepo = createBiRepository(prisma);
      const app = await createApp(realRepo);

    const res = await app.inject({
      method: "GET",
      url: "/bi/inventory/overview?windowDays=90",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);

    // Validação do catálogo e estoque atual
    expect(body.summary.totalProducts).toBe(1757);
    expect(body.summary.activeProducts).toBe(297);
    expect(body.summary.productsWithPositiveStock).toBe(261);
    expect(body.summary.productsWithZeroStock).toBe(1490);
    expect(body.summary.productsWithNegativeStock).toBe(6);

    // Validação financeira do estoque
    expect(body.summary.inventoryCostValue).toBe(148936.33);
    expect(body.summary.inventoryListValue).toBe(518727.6);

    // Validação da janela de 90 dias
    expect(body.summary.productsSoldInWindow).toBe(154);
    expect(body.summary.productsWithStockAndSales).toBe(113);
    expect(body.summary.productsWithStockNoSales).toBe(148);
    expect(body.summary.capitalWithSales).toBe(119362.11);
    expect(body.summary.capitalWithoutSales).toBe(29574.22);

    // Validação da distribuição de cobertura
    expect(body.coverageDistribution.totalWithStockAndSales).toBe(113);
    expect(body.coverageDistribution.lt15).toBe(4);
    expect(body.coverageDistribution.from15to30).toBe(2);
    expect(body.coverageDistribution.from30to45).toBe(2);
    expect(body.coverageDistribution.from45to90).toBe(26);
    expect(body.coverageDistribution.gt90).toBe(79);
    expect(body.coverageDistribution.noSalesInWindow).toBe(148);

    // Validação de qualidade dos dados
    expect(body.dataQuality.negativeStockCount).toBe(6);
    expect(body.dataQuality.inactiveWithStockCount).toBe(3);
    expect(body.dataQuality.activeWithoutStockCount).toBe(39);
    expect(body.dataQuality.effectiveCostMissingOrZero).toBe(0);
    expect(body.dataQuality.retailSalePriceMissingOrZero).toBe(0);
  }, 30000);
});
