import { describe, expect, it } from "vitest";
import {
  calculateInventoryOverview,
  calculateWindowDateRange,
  type CatalogInventoryProduct,
} from "../src/modules/bi/bi-inventory-calculator.js";
import type { RealizedProductMovement } from "../src/modules/bi/bi-types.js";

describe("Inventory & Turnover BI V1 — Deterministic Calculator", () => {
  const asOfDate = "2026-09-14";

  it("1. calculateWindowDateRange: limites exatos de calendário incluindo o asOfDate", () => {
    // Janela de 30 dias: 16/08/2026 a 14/09/2026 (16 dias em agosto + 14 em setembro = 30 dias)
    const w30 = calculateWindowDateRange("2026-09-14", 30);
    expect(w30.fromStr).toBe("2026-08-16");
    expect(w30.toStr).toBe("2026-09-14");
    expect(w30.toExclusiveDate.toISOString()).toBe("2026-09-15T00:00:00.000Z");

    // Janela de 90 dias: 17/06/2026 a 14/09/2026 (14 em junho + 31 em julho + 31 em agosto + 14 em setembro = 90 dias)
    const w90 = calculateWindowDateRange("2026-09-14", 90);
    expect(w90.fromStr).toBe("2026-06-17");
    expect(w90.toStr).toBe("2026-09-14");
    expect(w90.toExclusiveDate.toISOString()).toBe("2026-09-15T00:00:00.000Z");

    // Janela de 180 dias: 19/03/2026 a 14/09/2026
    const w180 = calculateWindowDateRange("2026-09-14", 180);
    expect(w180.fromStr).toBe("2026-03-19");
    expect(w180.toStr).toBe("2026-09-14");
    expect(w180.toExclusiveDate.toISOString()).toBe("2026-09-15T00:00:00.000Z");
  });

  it("2. Produto com estoque positivo e venda na janela: calcula ADS, EDS e bucket", () => {
    const catalogProducts: CatalogInventoryProduct[] = [
      {
        id: "prod-1",
        sourceId: "101",
        code: "SKU-101",
        description: "Shape Nineclouds Kilt 8.0",
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
    ];

    // Vendeu 90 unidades em 90 dias -> ADS = 1.0 un/dia -> EDS = 10 / 1 = 10 dias (< 15 -> LT_15)
    const movementsInWindow: RealizedProductMovement[] = [
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
    ];

    const result = calculateInventoryOverview({
      asOfDate,
      windowDays: 90,
      catalogProducts,
      movementsInWindow,
    });

    expect(result.summary.totalProducts).toBe(1);
    expect(result.summary.productsWithPositiveStock).toBe(1);
    expect(result.summary.productsSoldInWindow).toBe(1);
    expect(result.summary.inventoryCostValue).toBe(1000); // 10 * 100
    expect(result.summary.inventoryListValue).toBe(2000); // 10 * 200

    const p = result.products[0]!;
    expect(p.currentStock).toBe(10);
    expect(p.quantityInWindow).toBe(90);
    expect(p.realizedRevenueInWindow).toBe(17500);
    expect(p.averageDailySales).toBe(1.0);
    expect(p.estimatedDaysOfStock).toBe(10.0);
    expect(p.coverageBucket).toBe("LT_15");
    expect(p.operationalFlags).toContain("STOCK_WITH_SALES");
    expect(p.operationalFlags).toContain("LOW_ESTIMATED_COVERAGE");

    expect(result.coverageDistribution.lt15).toBe(1);
    expect(result.coverageDistribution.totalWithStockAndSales).toBe(1);
    expect(result.coverageDistribution.noSalesInWindow).toBe(0);
  });

  it("3. Produto com estoque positivo e ZERO venda na janela: estimatedDaysOfStock é null e não entra em bucket", () => {
    const catalogProducts: CatalogInventoryProduct[] = [
      {
        id: "prod-idle",
        sourceId: "102",
        code: "SKU-102",
        description: "Produto Parado",
        categoryDescription: "Acessórios",
        active: true,
        sourcePresent: true,
        stockQuantity: 25,
        effectiveCost: 40,
        averageCost: 40,
        retailSalePrice: 80,
        stockMinQuantity: 0,
        stockMaxQuantity: 0,
      },
    ];

    const result = calculateInventoryOverview({
      asOfDate,
      windowDays: 90,
      catalogProducts,
      movementsInWindow: [],
      historicalLastPhysicalSales: new Map([
        ["102", new Date("2025-10-15T00:00:00.000Z")],
      ]),
    });

    const p = result.products[0]!;
    expect(p.currentStock).toBe(25);
    expect(p.quantityInWindow).toBe(0);
    expect(p.averageDailySales).toBe(0);
    expect(p.estimatedDaysOfStock).toBeNull();
    expect(p.coverageBucket).toBeNull();
    expect(p.operationalFlags).toContain("NO_SALES_IN_WINDOW");
    expect(p.lastPhysicalSaleDate).toBe("2025-10-15");
    expect(p.daysSinceLastPhysicalSale).toBeGreaterThan(300);

    expect(result.summary.productsWithStockNoSales).toBe(1);
    expect(result.summary.capitalWithoutSales).toBe(1000); // 25 * 40
    expect(result.summary.capitalWithoutSalesShare).toBe(100);

    expect(result.coverageDistribution.totalWithStockAndSales).toBe(0);
    expect(result.coverageDistribution.noSalesInWindow).toBe(1);
  });

  it("4. Produto com estoque zero e venda recente: cobertura é null e recebe DEMAND_WITHOUT_STOCK", () => {
    const catalogProducts: CatalogInventoryProduct[] = [
      {
        id: "prod-zero",
        sourceId: "103",
        code: "SKU-103",
        description: "Shape Esgotado",
        categoryDescription: "Shapes",
        active: true,
        sourcePresent: true,
        stockQuantity: 0,
        effectiveCost: 125,
        averageCost: 125,
        retailSalePrice: 250,
        stockMinQuantity: 0,
        stockMaxQuantity: 0,
      },
    ];

    const movementsInWindow: RealizedProductMovement[] = [
      {
        productId: "prod-zero",
        sourceProductId: "103",
        realizedDate: new Date("2026-09-01T00:00:00.000Z"),
        quantity: 5,
        grossItemAmount: 1250,
        allocationBaseAmount: 1250,
        allocatedNetRevenue: 1250,
        saleId: "sale-zero",
        customerId: "cust-2",
        channel: "VAREJO",
        sourceDocumentId: "doc-zero",
        sourceDocumentType: "VENDA_SIMPLES" as any,
        origin: "DIRECT_VENDA_SIMPLES",
      },
    ];

    const result = calculateInventoryOverview({
      asOfDate,
      windowDays: 90,
      catalogProducts,
      movementsInWindow,
    });

    const p = result.products[0]!;
    expect(p.currentStock).toBe(0);
    expect(p.stockCostValue).toBe(0);
    expect(p.stockListValue).toBe(0);
    expect(p.estimatedDaysOfStock).toBeNull(); // NUNCA ZERO, NUNCA NEGATIVO
    expect(p.coverageBucket).toBeNull();
    expect(p.operationalFlags).toContain("DEMAND_WITHOUT_STOCK");

    expect(result.summary.demandWithoutStockCount).toBe(1);
    expect(result.summary.activeDemandWithoutStockCount).toBe(1);
    expect(result.coverageDistribution.totalWithStockAndSales).toBe(0);
  });

  it("5. Produto com estoque negativo e venda: cobertura é estritamente null (nunca negativa)", () => {
    const catalogProducts: CatalogInventoryProduct[] = [
      {
        id: "prod-neg",
        sourceId: "104",
        code: "SKU-104",
        description: "Rolamentos Destrux Negativo",
        categoryDescription: "Rolamentos",
        active: true,
        sourcePresent: true,
        stockQuantity: -125,
        effectiveCost: 15,
        averageCost: 15,
        retailSalePrice: 35,
        stockMinQuantity: 0,
        stockMaxQuantity: 0,
      },
    ];

    const movementsInWindow: RealizedProductMovement[] = [
      {
        productId: "prod-neg",
        sourceProductId: "104",
        realizedDate: new Date("2026-08-31T00:00:00.000Z"),
        quantity: 68,
        grossItemAmount: 2380,
        allocationBaseAmount: 2380,
        allocatedNetRevenue: 1905,
        saleId: "sale-neg",
        customerId: "cust-3",
        channel: "ATACADO",
        sourceDocumentId: "doc-neg",
        sourceDocumentType: "NFE" as any,
        origin: "DIRECT_NFE",
      },
    ];

    const result = calculateInventoryOverview({
      asOfDate,
      windowDays: 90,
      catalogProducts,
      movementsInWindow,
    });

    const p = result.products[0]!;
    expect(p.currentStock).toBe(-125);
    expect(p.stockCostValue).toBe(0); // max(stock, 0)
    expect(p.stockListValue).toBe(0);
    expect(p.estimatedDaysOfStock).toBeNull(); // NUNCA NEGATIVO
    expect(p.coverageBucket).toBeNull();
    expect(p.operationalFlags).toContain("NEGATIVE_STOCK");
    expect(p.operationalFlags).toContain("DEMAND_WITHOUT_STOCK");

    expect(result.summary.productsWithNegativeStock).toBe(1);
    expect(result.summary.demandWithoutStockCount).toBe(1);
  });

  it("6. Movimento puramente financeiro (quantity = 0, revenue > 0) não conta como saída física", () => {
    const catalogProducts: CatalogInventoryProduct[] = [
      {
        id: "prod-fin",
        sourceId: "105",
        code: "SKU-105",
        description: "Item com rateio financeiro residual",
        categoryDescription: "Acessórios",
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

    const movementsInWindow: RealizedProductMovement[] = [
      {
        productId: "prod-fin",
        sourceProductId: "105",
        realizedDate: new Date("2026-09-05T00:00:00.000Z"),
        quantity: 0, // Puramente financeiro
        grossItemAmount: 0,
        allocationBaseAmount: 100,
        allocatedNetRevenue: 95.5,
        saleId: "sale-fin",
        customerId: "cust-4",
        channel: "ATACADO",
        sourceDocumentId: "doc-fin",
        sourceDocumentType: "VENDA_SIMPLES" as any,
        origin: "PEDIDO_FINANCIAL_COMPLEMENT_VENDA_SIMPLES",
      },
    ];

    const result = calculateInventoryOverview({
      asOfDate,
      windowDays: 90,
      catalogProducts,
      movementsInWindow,
    });

    const p = result.products[0]!;
    expect(p.quantityInWindow).toBe(0);
    expect(p.realizedRevenueInWindow).toBe(95.5);
    expect(p.averageDailySales).toBe(0);
    expect(p.estimatedDaysOfStock).toBeNull();
    expect(p.coverageBucket).toBeNull();
    expect(p.operationalFlags).toContain("NO_SALES_IN_WINDOW");

    expect(result.summary.productsSoldInWindow).toBe(0);
    expect(result.summary.productsWithStockNoSales).toBe(1);
  });

  it("7. Produto inativo com estoque: reportado em inactiveProductsWithStock e INACTIVE_WITH_STOCK", () => {
    const catalogProducts: CatalogInventoryProduct[] = [
      {
        id: "prod-inact",
        sourceId: "106",
        code: "SKU-106",
        description: "Coleção Antiga Inativa",
        categoryDescription: "Confecções",
        active: false,
        sourcePresent: true,
        stockQuantity: 5,
        effectiveCost: 50,
        averageCost: 50,
        retailSalePrice: 120,
        stockMinQuantity: 0,
        stockMaxQuantity: 0,
      },
    ];

    const result = calculateInventoryOverview({
      asOfDate,
      windowDays: 90,
      catalogProducts,
      movementsInWindow: [],
    });

    const p = result.products[0]!;
    expect(p.active).toBe(false);
    expect(p.operationalFlags).toContain("INACTIVE_WITH_STOCK");
    expect(result.summary.inactiveProductsWithStock).toBe(1);
    expect(result.summary.inactiveStockCostValue).toBe(250); // 5 * 50
  });

  it("8. Distribuição de Cobertura: soma exata de faixas bate com totalWithStockAndSales", () => {
    // 5 produtos, cada um caindo em um bucket diferente
    const catalogProducts: CatalogInventoryProduct[] = [
      { id: "p1", sourceId: "1", code: "S1", description: "P1", categoryDescription: "C", active: true, sourcePresent: true, stockQuantity: 10, effectiveCost: 10, averageCost: 10, retailSalePrice: 20, stockMinQuantity: 0, stockMaxQuantity: 0 },
      { id: "p2", sourceId: "2", code: "S2", description: "P2", categoryDescription: "C", active: true, sourcePresent: true, stockQuantity: 20, effectiveCost: 10, averageCost: 10, retailSalePrice: 20, stockMinQuantity: 0, stockMaxQuantity: 0 },
      { id: "p3", sourceId: "3", code: "S3", description: "P3", categoryDescription: "C", active: true, sourcePresent: true, stockQuantity: 35, effectiveCost: 10, averageCost: 10, retailSalePrice: 20, stockMinQuantity: 0, stockMaxQuantity: 0 },
      { id: "p4", sourceId: "4", code: "S4", description: "P4", categoryDescription: "C", active: true, sourcePresent: true, stockQuantity: 60, effectiveCost: 10, averageCost: 10, retailSalePrice: 20, stockMinQuantity: 0, stockMaxQuantity: 0 },
      { id: "p5", sourceId: "5", code: "S5", description: "P5", categoryDescription: "C", active: true, sourcePresent: true, stockQuantity: 150, effectiveCost: 10, averageCost: 10, retailSalePrice: 20, stockMinQuantity: 0, stockMaxQuantity: 0 },
    ];

    // Cada um vendeu 90 unidades em 90 dias -> ADS = 1.0 un/dia
    // P1: EDS = 10 -> LT_15
    // P2: EDS = 20 -> 15_TO_30
    // P3: EDS = 35 -> 30_TO_45
    // P4: EDS = 60 -> 45_TO_90
    // P5: EDS = 150 -> GT_90
    const movementsInWindow: RealizedProductMovement[] = [
      { productId: "p1", sourceProductId: "1", realizedDate: new Date(), quantity: 90, grossItemAmount: 900, allocationBaseAmount: 900, allocatedNetRevenue: 900, saleId: "s1", customerId: "c1", channel: "VAREJO", sourceDocumentId: "d1", sourceDocumentType: "NFE" as any, origin: "DIRECT_NFE" },
      { productId: "p2", sourceProductId: "2", realizedDate: new Date(), quantity: 90, grossItemAmount: 900, allocationBaseAmount: 900, allocatedNetRevenue: 900, saleId: "s2", customerId: "c1", channel: "VAREJO", sourceDocumentId: "d2", sourceDocumentType: "NFE" as any, origin: "DIRECT_NFE" },
      { productId: "p3", sourceProductId: "3", realizedDate: new Date(), quantity: 90, grossItemAmount: 900, allocationBaseAmount: 900, allocatedNetRevenue: 900, saleId: "s3", customerId: "c1", channel: "VAREJO", sourceDocumentId: "d3", sourceDocumentType: "NFE" as any, origin: "DIRECT_NFE" },
      { productId: "p4", sourceProductId: "4", realizedDate: new Date(), quantity: 90, grossItemAmount: 900, allocationBaseAmount: 900, allocatedNetRevenue: 900, saleId: "s4", customerId: "c1", channel: "VAREJO", sourceDocumentId: "d4", sourceDocumentType: "NFE" as any, origin: "DIRECT_NFE" },
      { productId: "p5", sourceProductId: "5", realizedDate: new Date(), quantity: 90, grossItemAmount: 900, allocationBaseAmount: 900, allocatedNetRevenue: 900, saleId: "s5", customerId: "c1", channel: "VAREJO", sourceDocumentId: "d5", sourceDocumentType: "NFE" as any, origin: "DIRECT_NFE" },
    ];

    const result = calculateInventoryOverview({
      asOfDate,
      windowDays: 90,
      catalogProducts,
      movementsInWindow,
    });

    const d = result.coverageDistribution;
    expect(d.lt15).toBe(1);
    expect(d.from15to30).toBe(1);
    expect(d.from30to45).toBe(1);
    expect(d.from45to90).toBe(1);
    expect(d.gt90).toBe(1);
    expect(d.totalWithStockAndSales).toBe(5);
    expect(d.lt15 + d.from15to30 + d.from30to45 + d.from45to90 + d.gt90).toBe(d.totalWithStockAndSales);
  });
});
