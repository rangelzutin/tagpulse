import { describe, it, expect } from "vitest";
import {
  calculateDecisionsOverview,
  compareCapitalItems,
  compareReplenishmentItems,
} from "./bi-decision-calculator.js";
import type { CatalogInventoryProduct } from "./bi-inventory-calculator.js";
import type { FlatCategoryInfo } from "./bi-profitability-calculator.js";
import type { DecisionsProductItem, RealizedProductMovement, SaleAnchorType } from "./bi-types.js";

describe("bi-decision-calculator", () => {
  const baseCategories: FlatCategoryInfo[] = [
    { sourceId: "root-1", description: "1 - NINECLOUDS", parentSourceId: null },
    { sourceId: "cat-shapes", description: "Shapes", parentSourceId: "root-1" },
    { sourceId: "cat-sub-shapes", description: "Shapes Maple", parentSourceId: "cat-shapes" },
    { sourceId: "root-2", description: "2- DESTRUX", parentSourceId: null },
  ];

  const defaultParams = {
    asOfDate: "2026-09-20",
    windowDays: 90 as const,
    startDate: "2026-06-23",
    endDate: "2026-09-20",
    catalogProducts: [] as CatalogInventoryProduct[],
    movementsInWindow: [] as RealizedProductMovement[],
    categoriesFlat: baseCategories,
    historicalLastPhysicalSales: new Map<string, Date>(),
  };

  it("calculates estimatedCoverageDays as null when stock <= 0 or sales = 0", () => {
    const products: CatalogInventoryProduct[] = [
      {
        id: "p1",
        sourceId: "s1",
        code: "SKU1",
        description: "Produto Sem Estoque Com Vendas",
        categoryDescription: "Shapes",
        categorySourceId: "cat-shapes",
        active: true,
        sourcePresent: true,
        stockQuantity: 0,
        effectiveCost: 100,
        averageCost: 100,
        retailSalePrice: 200,
        stockMinQuantity: null,
        stockMaxQuantity: null,
      },
      {
        id: "p2",
        sourceId: "s2",
        code: "SKU2",
        description: "Produto Estoque Negativo",
        categoryDescription: "Shapes",
        categorySourceId: "cat-shapes",
        active: true,
        sourcePresent: true,
        stockQuantity: -5,
        effectiveCost: 100,
        averageCost: 100,
        retailSalePrice: 200,
        stockMinQuantity: null,
        stockMaxQuantity: null,
      },
      {
        id: "p3",
        sourceId: "s3",
        code: "SKU3",
        description: "Produto Com Estoque Sem Vendas",
        categoryDescription: "Shapes",
        categorySourceId: "cat-shapes",
        active: true,
        sourcePresent: true,
        stockQuantity: 10,
        effectiveCost: 100,
        averageCost: 100,
        retailSalePrice: 200,
        stockMinQuantity: null,
        stockMaxQuantity: null,
      },
      {
        id: "p4",
        sourceId: "s4",
        code: "SKU4",
        description: "Produto Normal Com Giro",
        categoryDescription: "Shapes",
        categorySourceId: "cat-shapes",
        active: true,
        sourcePresent: true,
        stockQuantity: 10,
        effectiveCost: 100,
        averageCost: 100,
        retailSalePrice: 200,
        stockMinQuantity: null,
        stockMaxQuantity: null,
      },
    ];

    const movements: RealizedProductMovement[] = [
      {
        productId: "p1",
        sourceProductId: "s1",
        realizedDate: new Date("2026-08-01"),
        quantity: 9,
        grossItemAmount: 1800,
        allocationBaseAmount: 1800,
        allocatedNetRevenue: 1800,
        saleId: "sale1",
        customerId: "c1",
        channel: "VAREJO",
        sourceDocumentId: "doc1",
        sourceDocumentType: "VENDA_SIMPLES" as SaleAnchorType,
        origin: "DIRECT_VENDA_SIMPLES",
      },
      {
        productId: "p2",
        sourceProductId: "s2",
        realizedDate: new Date("2026-08-01"),
        quantity: 3,
        grossItemAmount: 600,
        allocationBaseAmount: 600,
        allocatedNetRevenue: 600,
        saleId: "sale2",
        customerId: "c1",
        channel: "VAREJO",
        sourceDocumentId: "doc2",
        sourceDocumentType: "VENDA_SIMPLES" as SaleAnchorType,
        origin: "DIRECT_VENDA_SIMPLES",
      },
      {
        productId: "p4",
        sourceProductId: "s4",
        realizedDate: new Date("2026-08-01"),
        quantity: 9,
        grossItemAmount: 1800,
        allocationBaseAmount: 1800,
        allocatedNetRevenue: 1800,
        saleId: "sale3",
        customerId: "c2",
        channel: "ATACADO",
        sourceDocumentId: "doc3",
        sourceDocumentType: "NFE" as SaleAnchorType,
        origin: "DIRECT_NFE",
      },
    ];

    const result = calculateDecisionsOverview({
      ...defaultParams,
      catalogProducts: products,
      movementsInWindow: movements,
    });

    const item1 = result.replenishment.demandWithoutStock.find((i) => i.productSourceId === "s1");
    expect(item1).toBeDefined();
    expect(item1?.estimatedCoverageDays).toBeNull();

    const item3 = result.capitalOptimization.inventoryWithoutSales.find((i) => i.productSourceId === "s3");
    expect(item3).toBeDefined();
    expect(item3?.estimatedCoverageDays).toBeNull();

    // p4: stock=10, sales=9 em 90d => ADS = 0.1, coverage = 10 / 0.1 = 100 dias
    const item4 = result.capitalOptimization.highCoverage.find((i) => i.productSourceId === "s4");
    expect(item4).toBeDefined();
    expect(item4?.estimatedCoverageDays).toBe(100);
  });

  it("handles missing cost correctly without converting null to zero and tracks dataQuality", () => {
    const products: CatalogInventoryProduct[] = [
      {
        id: "p-no-cost",
        sourceId: "s-no-cost",
        code: "SKU-NC",
        description: "Produto Sem Custo",
        categoryDescription: "Shapes",
        categorySourceId: "cat-shapes",
        active: true,
        sourcePresent: true,
        stockQuantity: 10,
        effectiveCost: null,
        averageCost: null,
        retailSalePrice: 150,
        stockMinQuantity: null,
        stockMaxQuantity: null,
      },
      {
        id: "p-with-cost",
        sourceId: "s-with-cost",
        code: "SKU-WC",
        description: "Produto Com Custo",
        categoryDescription: "Shapes",
        categorySourceId: "cat-shapes",
        active: true,
        sourcePresent: true,
        stockQuantity: 5,
        effectiveCost: 80,
        averageCost: 80,
        retailSalePrice: 160,
        stockMinQuantity: null,
        stockMaxQuantity: null,
      },
    ];

    const movements: RealizedProductMovement[] = [
      {
        productId: "p-no-cost",
        sourceProductId: "s-no-cost",
        realizedDate: new Date("2026-08-01"),
        quantity: 2,
        grossItemAmount: 300,
        allocationBaseAmount: 300,
        allocatedNetRevenue: 300,
        saleId: "sale-nc",
        customerId: "c1",
        channel: "VAREJO",
        sourceDocumentId: "doc-nc",
        sourceDocumentType: "VENDA_SIMPLES" as SaleAnchorType,
        origin: "DIRECT_VENDA_SIMPLES",
      },
      {
        productId: "p-with-cost",
        sourceProductId: "s-with-cost",
        realizedDate: new Date("2026-08-01"),
        quantity: 4,
        grossItemAmount: 640,
        allocationBaseAmount: 640,
        allocatedNetRevenue: 640,
        saleId: "sale-wc",
        customerId: "c2",
        channel: "ATACADO",
        sourceDocumentId: "doc-wc",
        sourceDocumentType: "NFE" as SaleAnchorType,
        origin: "DIRECT_NFE",
      },
    ];

    const result = calculateDecisionsOverview({
      ...defaultParams,
      catalogProducts: products,
      movementsInWindow: movements,
    });

    const noCostItem = [...result.replenishment.criticalCoverage, ...result.replenishment.alertCoverage, ...result.capitalOptimization.highCoverage, ...result.capitalOptimization.inventoryWithoutSales]
      .find((i) => i.productSourceId === "s-no-cost");

    expect(noCostItem).toBeDefined();
    expect(noCostItem?.currentEffectiveCost).toBeNull();
    expect(noCostItem?.currentInventoryCostValue).toBeNull();
    expect(noCostItem?.estimatedCOGSInWindow).toBeNull();
    expect(noCostItem?.estimatedGrossProfitInWindow).toBeNull();
    expect(noCostItem?.estimatedGrossMarginPercentInWindow).toBeNull();

    // Data Quality
    expect(result.meta.dataQuality.productsTotal).toBe(2);
    expect(result.meta.dataQuality.productsWithCurrentCost).toBe(1);
    expect(result.meta.dataQuality.productsWithoutCurrentCost).toBe(1);
    expect(result.meta.dataQuality.revenueWithCurrentCost).toBe(640);
    expect(result.meta.dataQuality.revenueWithoutCurrentCost).toBe(300);
    expect(result.meta.dataQuality.costCoveragePercent).toBe(68.09); // 640 / 940 * 100

    // Capital total em estoque não inclui itens com custo nulo
    expect(result.kpis.currentInventoryCapital).toBe(400); // 5 * 80
  });

  it("strictly excludes inactive products from replenishment groups and isolates them in inactiveWithStock", () => {
    const products: CatalogInventoryProduct[] = [
      {
        id: "p-inact-no-stock",
        sourceId: "s-inact-no-stock",
        code: "INACT1",
        description: "Inativo sem estoque mas com vendas",
        categoryDescription: "Shapes",
        categorySourceId: "cat-shapes",
        active: false,
        sourcePresent: true,
        stockQuantity: 0,
        effectiveCost: 100,
        averageCost: 100,
        retailSalePrice: 200,
        stockMinQuantity: null,
        stockMaxQuantity: null,
      },
      {
        id: "p-inact-with-stock",
        sourceId: "s-inact-with-stock",
        code: "INACT2",
        description: "Inativo com estoque positivo",
        categoryDescription: "Shapes",
        categorySourceId: "cat-shapes",
        active: false,
        sourcePresent: true,
        stockQuantity: 7,
        effectiveCost: 50,
        averageCost: 50,
        retailSalePrice: 100,
        stockMinQuantity: null,
        stockMaxQuantity: null,
      },
      {
        id: "p-act-no-stock",
        sourceId: "s-act-no-stock",
        code: "ACT1",
        description: "Ativo sem estoque com vendas",
        categoryDescription: "Shapes",
        categorySourceId: "cat-shapes",
        active: true,
        sourcePresent: true,
        stockQuantity: 0,
        effectiveCost: 100,
        averageCost: 100,
        retailSalePrice: 200,
        stockMinQuantity: null,
        stockMaxQuantity: null,
      },
    ];

    const movements: RealizedProductMovement[] = [
      {
        productId: "p-inact-no-stock",
        sourceProductId: "s-inact-no-stock",
        realizedDate: new Date("2026-08-01"),
        quantity: 5,
        grossItemAmount: 1000,
        allocationBaseAmount: 1000,
        allocatedNetRevenue: 1000,
        saleId: "s-i1",
        customerId: "c1",
        channel: "VAREJO",
        sourceDocumentId: "d1",
        sourceDocumentType: "VENDA_SIMPLES" as SaleAnchorType,
        origin: "DIRECT_VENDA_SIMPLES",
      },
      {
        productId: "p-act-no-stock",
        sourceProductId: "s-act-no-stock",
        realizedDate: new Date("2026-08-01"),
        quantity: 3,
        grossItemAmount: 600,
        allocationBaseAmount: 600,
        allocatedNetRevenue: 600,
        saleId: "s-a1",
        customerId: "c2",
        channel: "VAREJO",
        sourceDocumentId: "d2",
        sourceDocumentType: "VENDA_SIMPLES" as SaleAnchorType,
        origin: "DIRECT_VENDA_SIMPLES",
      },
    ];

    const result = calculateDecisionsOverview({
      ...defaultParams,
      catalogProducts: products,
      movementsInWindow: movements,
    });

    // Reposição deve conter SOMENTE o ativo
    expect(result.replenishment.demandWithoutStock).toHaveLength(1);
    expect(result.replenishment.demandWithoutStock[0]?.productSourceId).toBe("s-act-no-stock");
    expect(result.kpis.demandWithoutStockCount).toBe(1);

    // Inativo com estoque deve aparecer SOMENTE em inactiveWithStock
    expect(result.capitalOptimization.inactiveWithStock).toHaveLength(1);
    expect(result.capitalOptimization.inactiveWithStock[0]?.productSourceId).toBe("s-inact-with-stock");
    expect(result.capitalOptimization.inventoryWithoutSales).toHaveLength(0);
  });

  it("filters accurately by category node and its descendants", () => {
    const products: CatalogInventoryProduct[] = [
      {
        id: "p-sub",
        sourceId: "s-sub",
        code: "SUB1",
        description: "Shape Maple Descendente",
        categoryDescription: "Shapes Maple",
        categorySourceId: "cat-sub-shapes",
        active: true,
        sourcePresent: true,
        stockQuantity: 10,
        effectiveCost: 100,
        averageCost: 100,
        retailSalePrice: 200,
        stockMinQuantity: null,
        stockMaxQuantity: null,
      },
      {
        id: "p-other-root",
        sourceId: "s-other-root",
        code: "TRUCK1",
        description: "Truck Destrux",
        categoryDescription: "2- DESTRUX",
        categorySourceId: "root-2",
        active: true,
        sourcePresent: true,
        stockQuantity: 10,
        effectiveCost: 100,
        averageCost: 100,
        retailSalePrice: 200,
        stockMinQuantity: null,
        stockMaxQuantity: null,
      },
    ];

    // Filtrar pela categoria pai 'cat-shapes' deve incluir 'cat-sub-shapes' mas não 'root-2'
    const result = calculateDecisionsOverview({
      ...defaultParams,
      catalogProducts: products,
      movementsInWindow: [],
      filters: { categorySourceId: "cat-shapes" },
    });

    expect(result.meta.appliedFilters.categorySourceId).toBe("cat-shapes");
    expect(result.meta.appliedFilters.categoryDescription).toBe("Shapes");
    expect(result.capitalOptimization.inventoryWithoutSales).toHaveLength(1);
    expect(result.capitalOptimization.inventoryWithoutSales[0]?.productSourceId).toBe("s-sub");
  });

  it("sorts replenishment items with null profit after known profits, and sorts capital items with null capital after known capital", () => {
    const itemWithHighProfit: DecisionsProductItem = {
      productSourceId: "1",
      code: "1",
      description: "Item High Profit",
      active: true,
      categorySourceId: null,
      categoryDescription: null,
      rootCategorySourceId: null,
      rootCategoryDescription: null,
      currentStock: 0,
      currentEffectiveCost: 50,
      currentInventoryCostValue: 0,
      currentInventoryListValue: 0,
      retailSalePrice: 100,
      physicalQuantityInWindow: 10,
      realizedRevenueInWindow: 1000,
      customerCountInWindow: 5,
      averageDailySales: 0.11,
      estimatedCoverageDays: null,
      lastPhysicalSaleDate: null,
      daysSinceLastPhysicalSale: null,
      estimatedCOGSInWindow: 500,
      estimatedGrossProfitInWindow: 500,
      estimatedGrossMarginPercentInWindow: 50,
      channelsInWindow: ["VAREJO"],
    };

    const itemWithLowProfit: DecisionsProductItem = {
      ...itemWithHighProfit,
      productSourceId: "2",
      estimatedGrossProfitInWindow: 100,
    };

    const itemWithNullProfit: DecisionsProductItem = {
      ...itemWithHighProfit,
      productSourceId: "3",
      estimatedGrossProfitInWindow: null,
      realizedRevenueInWindow: 5000, // maior receita, mas lucro é null
    };

    const sortedReplenishment = [itemWithNullProfit, itemWithLowProfit, itemWithHighProfit].sort(compareReplenishmentItems);
    expect(sortedReplenishment[0]?.productSourceId).toBe("1"); // 500 profit
    expect(sortedReplenishment[1]?.productSourceId).toBe("2"); // 100 profit
    expect(sortedReplenishment[2]?.productSourceId).toBe("3"); // null profit (após os conhecidos)

    // Capital comparator
    const itemWithHighCap: DecisionsProductItem = {
      ...itemWithHighProfit,
      productSourceId: "c1",
      currentStock: 10,
      currentInventoryCostValue: 1000,
    };
    const itemWithLowCap: DecisionsProductItem = {
      ...itemWithHighProfit,
      productSourceId: "c2",
      currentStock: 10,
      currentInventoryCostValue: 200,
    };
    const itemWithNullCap: DecisionsProductItem = {
      ...itemWithHighProfit,
      productSourceId: "c3",
      currentStock: 50,
      currentInventoryCostValue: null,
    };

    const sortedCapital = [itemWithNullCap, itemWithLowCap, itemWithHighCap].sort(compareCapitalItems);
    expect(sortedCapital[0]?.productSourceId).toBe("c1");
    expect(sortedCapital[1]?.productSourceId).toBe("c2");
    expect(sortedCapital[2]?.productSourceId).toBe("c3");
  });

  it("accumulates distinct channels in channelsInWindow preserving all observed channels", () => {
    const products: CatalogInventoryProduct[] = [
      {
        id: "p-multi-channel",
        sourceId: "s-multi",
        code: "MULTI",
        description: "Produto Multicanal",
        categoryDescription: "Shapes",
        categorySourceId: "cat-shapes",
        active: true,
        sourcePresent: true,
        stockQuantity: 0,
        effectiveCost: 100,
        averageCost: 100,
        retailSalePrice: 200,
        stockMinQuantity: null,
        stockMaxQuantity: null,
      },
    ];

    const movements: RealizedProductMovement[] = [
      {
        productId: "p-multi-channel",
        sourceProductId: "s-multi",
        realizedDate: new Date("2026-08-01"),
        quantity: 5,
        grossItemAmount: 1000,
        allocationBaseAmount: 1000,
        allocatedNetRevenue: 1000,
        saleId: "s1",
        customerId: "c1",
        channel: "ATACADO",
        sourceDocumentId: "d1",
        sourceDocumentType: "NFE" as SaleAnchorType,
        origin: "DIRECT_NFE",
      },
      {
        productId: "p-multi-channel",
        sourceProductId: "s-multi",
        realizedDate: new Date("2026-08-05"),
        quantity: 2,
        grossItemAmount: 400,
        allocationBaseAmount: 400,
        allocatedNetRevenue: 400,
        saleId: "s2",
        customerId: "c2",
        channel: "VAREJO",
        sourceDocumentId: "d2",
        sourceDocumentType: "VENDA_SIMPLES" as SaleAnchorType,
        origin: "DIRECT_VENDA_SIMPLES",
      },
    ];

    const result = calculateDecisionsOverview({
      ...defaultParams,
      catalogProducts: products,
      movementsInWindow: movements,
    });

    const item = result.replenishment.demandWithoutStock[0];
    expect(item).toBeDefined();
    expect(item?.channelsInWindow).toEqual(["ATACADO", "VAREJO"]);
  });
});
