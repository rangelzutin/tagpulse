import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../src/app.js";
import type { BiRepository } from "../../src/modules/bi/bi-repository.js";
import type { CatalogInventoryProduct } from "../../src/modules/bi/bi-inventory-calculator.js";
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

describe("GET /bi/inventory/overview — Permanent Deterministic Suite", () => {
  const deterministicProducts: CatalogInventoryProduct[] = [
    // 1. Estoque positivo + alta saída (cobertura < 15 dias -> LT_15)
    {
      id: "prod-1",
      sourceId: "101",
      code: "COD-101",
      description: "Shape Alta Saída",
      categoryDescription: "Shapes",
      active: true,
      sourcePresent: true,
      stockQuantity: 10,
      effectiveCost: 100,
      averageCost: 100,
      retailSalePrice: 200,
      stockMinQuantity: 0,
      stockMaxQuantity: 0,
    },
    // 2. Estoque positivo + baixa saída (cobertura > 90 dias -> GT_90)
    {
      id: "prod-2",
      sourceId: "102",
      code: "COD-102",
      description: "Rolamento Longa Cobertura",
      categoryDescription: "Rolamentos",
      active: true,
      sourcePresent: true,
      stockQuantity: 1000,
      effectiveCost: 10,
      averageCost: 10,
      retailSalePrice: 25,
      stockMinQuantity: 0,
      stockMaxQuantity: 0,
    },
    // 3. Estoque positivo + ZERO saída na janela (NO_SALES_IN_WINDOW)
    {
      id: "prod-3",
      sourceId: "103",
      code: "COD-103",
      description: "Tênis sem Giro",
      categoryDescription: "Tenis",
      active: true,
      sourcePresent: true,
      stockQuantity: 5,
      effectiveCost: 150,
      averageCost: 150,
      retailSalePrice: 300,
      stockMinQuantity: 0,
      stockMaxQuantity: 0,
    },
    // 4. Estoque zero + saída na janela (DEMAND_WITHOUT_STOCK)
    {
      id: "prod-4",
      sourceId: "104",
      code: "COD-104",
      description: "Lixa Esgotada",
      categoryDescription: "Lixas",
      active: true,
      sourcePresent: true,
      stockQuantity: 0,
      effectiveCost: 20,
      averageCost: 20,
      retailSalePrice: 40,
      stockMinQuantity: 0,
      stockMaxQuantity: 0,
    },
    // 5. Estoque negativo + saída na janela (NEGATIVE_STOCK + DEMAND_WITHOUT_STOCK)
    {
      id: "prod-5",
      sourceId: "105",
      code: "COD-105",
      description: "Parafuso Negativo",
      categoryDescription: "Hardgoods",
      active: true,
      sourcePresent: true,
      stockQuantity: -10,
      effectiveCost: 5,
      averageCost: 5,
      retailSalePrice: 15,
      stockMinQuantity: 0,
      stockMaxQuantity: 0,
    },
    // 6. Inativo com estoque positivo (INACTIVE_WITH_STOCK)
    {
      id: "prod-6",
      sourceId: "106",
      code: "COD-106",
      description: "Coleção Antiga Inativa",
      categoryDescription: "Confecções",
      active: false,
      sourcePresent: true,
      stockQuantity: 4,
      effectiveCost: 50,
      averageCost: 50,
      retailSalePrice: 100,
      stockMinQuantity: 0,
      stockMaxQuantity: 0,
    },
  ];

  const deterministicMovements: RealizedProductMovement[] = [
    // Prod 1: Vendeu 90 un em 90d -> ADS = 1.0 -> EDS = 10 / 1.0 = 10 dias (LT_15)
    {
      productId: "prod-1",
      sourceProductId: "101",
      realizedDate: new Date("2026-09-10T12:00:00.000Z"),
      quantity: 90,
      grossItemAmount: 18000,
      allocationBaseAmount: 18000,
      allocatedNetRevenue: 17500,
      saleId: "sale-1",
      customerId: "cust-1",
      channel: "ATACADO",
      sourceDocumentId: "doc-1",
      sourceDocumentType: "NFE" as any,
      origin: "DIRECT_NFE",
    },
    // Prod 2: Vendeu 90 un em 90d -> ADS = 1.0 -> EDS = 1000 / 1.0 = 1000 dias (GT_90)
    {
      productId: "prod-2",
      sourceProductId: "102",
      realizedDate: new Date("2026-09-08T12:00:00.000Z"),
      quantity: 90,
      grossItemAmount: 2250,
      allocationBaseAmount: 2250,
      allocatedNetRevenue: 2200,
      saleId: "sale-2",
      customerId: "cust-2",
      channel: "VAREJO",
      sourceDocumentId: "doc-2",
      sourceDocumentType: "VENDA_SIMPLES" as any,
      origin: "DIRECT_VENDA_SIMPLES",
    },
    // Prod 4: Vendeu 10 un com estoque 0 -> DEMAND_WITHOUT_STOCK
    {
      productId: "prod-4",
      sourceProductId: "104",
      realizedDate: new Date("2026-09-05T12:00:00.000Z"),
      quantity: 10,
      grossItemAmount: 400,
      allocationBaseAmount: 400,
      allocatedNetRevenue: 400,
      saleId: "sale-4",
      customerId: "cust-3",
      channel: "VAREJO",
      sourceDocumentId: "doc-4",
      sourceDocumentType: "VENDA_SIMPLES" as any,
      origin: "DIRECT_VENDA_SIMPLES",
    },
    // Prod 5: Vendeu 20 un com estoque -10 -> DEMAND_WITHOUT_STOCK + NEGATIVE_STOCK
    {
      productId: "prod-5",
      sourceProductId: "105",
      realizedDate: new Date("2026-09-01T12:00:00.000Z"),
      quantity: 20,
      grossItemAmount: 300,
      allocationBaseAmount: 300,
      allocatedNetRevenue: 300,
      saleId: "sale-5",
      customerId: "cust-4",
      channel: "ATACADO",
      sourceDocumentId: "doc-5",
      sourceDocumentType: "NFE" as any,
      origin: "DIRECT_NFE",
    },
    // Movimento puramente financeiro (quantity = 0, revenue > 0)
    {
      productId: "prod-1",
      sourceProductId: "101",
      realizedDate: new Date("2026-09-02T12:00:00.000Z"),
      quantity: 0,
      grossItemAmount: 0,
      allocationBaseAmount: 100,
      allocatedNetRevenue: 100,
      saleId: "sale-fin",
      customerId: "cust-1",
      channel: "ATACADO",
      sourceDocumentId: "doc-fin",
      sourceDocumentType: "VENDA_SIMPLES" as any,
      origin: "PEDIDO_FINANCIAL_COMPLEMENT_VENDA_SIMPLES",
    },
  ];

  const createDeterministicRepo = (): BiRepository => ({
    async findRealizedSales() {
      return [];
    },
    async findCatalogInventoryProducts() {
      return deterministicProducts;
    },
    async findRealizedProductMovements() {
      return {
        movements: deterministicMovements,
        adjustments: [],
      };
    },
    async findHistoricalLastPhysicalSales() {
      return new Map([
        ["103", new Date("2025-11-20T10:00:00.000Z")],
      ]);
    },
  });

  it("1. Retorno completo do contrato público (summary 17 campos, flags, buckets, categorias e qualidade)", async () => {
    const app = await createApp(createDeterministicRepo());
    const res = await app.inject({
      method: "GET",
      url: "/bi/inventory/overview",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);

    expect(body.windowDays).toBe(90);
    expect(body.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Contrato do summary (17 campos exatos)
    const s = body.summary;
    expect(s.totalProducts).toBe(6);
    expect(s.activeProducts).toBe(5);
    expect(s.productsWithPositiveStock).toBe(4); // prod-1, prod-2, prod-3, prod-6
    expect(s.productsWithZeroStock).toBe(1);     // prod-4
    expect(s.productsWithNegativeStock).toBe(1); // prod-5

    // Capital a custo: (10*100) + (1000*10) + (5*150) + (4*50) = 1000 + 10000 + 750 + 200 = 11.950
    expect(s.inventoryCostValue).toBe(11950);
    // Valor de tabela: (10*200) + (1000*25) + (5*300) + (4*100) = 2000 + 25000 + 1500 + 400 = 28.900
    expect(s.inventoryListValue).toBe(28900);

    // Produtos vendidos: prod-1, prod-2, prod-4, prod-5 = 4
    expect(s.productsSoldInWindow).toBe(4);
    // Demanda sem estoque: prod-4 (0) e prod-5 (-10) = 2
    expect(s.demandWithoutStockCount).toBe(2);
    expect(s.activeDemandWithoutStockCount).toBe(2);

    // Estoque > 0 com venda: prod-1 e prod-2 = 2
    expect(s.productsWithStockAndSales).toBe(2);
    // Estoque > 0 sem venda: prod-3 e prod-6 = 2
    expect(s.productsWithStockNoSales).toBe(2);

    // Capital com venda: (10*100) + (1000*10) = 11.000
    expect(s.capitalWithSales).toBe(11000);
    // Capital sem venda: (5*150) + (4*50) = 950
    expect(s.capitalWithoutSales).toBe(950);
    expect(s.capitalWithoutSalesShare).toBeCloseTo((950 / 11950) * 100, 2);

    // Inativos com estoque: prod-6 (4 un * R$ 50 = R$ 200)
    expect(s.inactiveProductsWithStock).toBe(1);
    expect(s.inactiveStockCostValue).toBe(200);

    // Distribuição de Cobertura
    const c = body.coverageDistribution;
    expect(c.lt15).toBe(1);       // prod-1 (10 dias)
    expect(c.from15to30).toBe(0);
    expect(c.from30to45).toBe(0);
    expect(c.from45to90).toBe(0);
    expect(c.gt90).toBe(1);       // prod-2 (1000 dias)
    expect(c.totalWithStockAndSales).toBe(2);
    expect(c.noSalesInWindow).toBe(2); // prod-3 e prod-6

    // Produtos individuais e flags
    const p1 = body.products.find((p: any) => p.code === "COD-101");
    expect(p1.estimatedDaysOfStock).toBe(10);
    expect(p1.coverageBucket).toBe("LT_15");
    expect(p1.operationalFlags).toContain("STOCK_WITH_SALES");
    expect(p1.operationalFlags).toContain("LOW_ESTIMATED_COVERAGE");

    const p3 = body.products.find((p: any) => p.code === "COD-103");
    expect(p3.estimatedDaysOfStock).toBeNull();
    expect(p3.coverageBucket).toBeNull();
    expect(p3.operationalFlags).toContain("NO_SALES_IN_WINDOW");
    expect(p3.lastPhysicalSaleDate).toBe("2025-11-20");
    expect(p3.daysSinceLastPhysicalSale).toBeGreaterThan(200);

    const p4 = body.products.find((p: any) => p.code === "COD-104");
    expect(p4.estimatedDaysOfStock).toBeNull();
    expect(p4.coverageBucket).toBeNull();
    expect(p4.operationalFlags).toContain("DEMAND_WITHOUT_STOCK");

    const p5 = body.products.find((p: any) => p.code === "COD-105");
    expect(p5.estimatedDaysOfStock).toBeNull();
    expect(p5.operationalFlags).toContain("NEGATIVE_STOCK");
    expect(p5.operationalFlags).toContain("DEMAND_WITHOUT_STOCK");

    const p6 = body.products.find((p: any) => p.code === "COD-106");
    expect(p6.operationalFlags).toContain("INACTIVE_WITH_STOCK");

    // Categorias
    expect(body.categories.length).toBe(6);
    const catShapes = body.categories.find((c: any) => c.category === "Shapes");
    expect(catShapes.inventoryCostValue).toBe(1000);
    expect(catShapes.lowCoverageCount).toBe(1);

    // Qualidade dos dados
    expect(body.dataQuality.negativeStockCount).toBe(1);
    expect(body.dataQuality.inactiveWithStockCount).toBe(1);
    expect(body.dataQuality.activeWithoutStockCount).toBe(2); // prod-4 (0) e prod-5 (-10)
  });

  it("2. Aceita 30, 90 e 180 dias e calcula janelas correspondentes", async () => {
    const app = await createApp(createDeterministicRepo());

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

  it("3. Rejeita parâmetros de janela inválidos com HTTP 400", async () => {
    const app = await createApp(createDeterministicRepo());

    for (const invalid of ["15", "45", "60", "365", "abc", "-1", "0"]) {
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
