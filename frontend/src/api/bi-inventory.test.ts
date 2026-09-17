import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  fetchCategoryTree,
  fetchInventoryOverview,
  type InventoryOverviewResult,
} from "./bi";

describe("Estoque & Giro Frontend — API Client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockInventoryResult: InventoryOverviewResult = {
    asOfDate: "2026-09-14",
    windowDays: 90,
    summary: {
      totalProducts: 300,
      activeProducts: 250,
      productsWithPositiveStock: 261,
      productsWithZeroStock: 33,
      productsWithNegativeStock: 6,
      inventoryCostValue: 148936.33,
      inventoryListValue: 518727.6,
      productsSoldInWindow: 154,
      demandWithoutStockCount: 41,
      activeDemandWithoutStockCount: 39,
      productsWithStockAndSales: 113,
      productsWithStockNoSales: 148,
      capitalWithSales: 119362.11,
      capitalWithoutSales: 29574.22,
      capitalWithoutSalesShare: 19.9,
      inactiveProductsWithStock: 18,
      inactiveStockCostValue: 8420.5,
    },
    coverageDistribution: {
      lt15: 16,
      from15to30: 22,
      from30to45: 18,
      from45to90: 24,
      gt90: 33,
      totalWithStockAndSales: 113,
      noSalesInWindow: 148,
    },
    products: [
      {
        productId: "prod-1",
        sourceProductId: "101",
        code: "SKU-101",
        description: "Shape Nineclouds Maple 8.0",
        category: "Shapes",
        categorySourceId: "51",
        active: true,
        currentStock: 10,
        effectiveCost: 100,
        retailSalePrice: 200,
        stockCostValue: 1000,
        stockListValue: 2000,
        quantityInWindow: 90,
        realizedRevenueInWindow: 18000,
        averageDailySales: 1.0,
        lastPhysicalSaleDate: "2026-09-10",
        daysSinceLastPhysicalSale: 4,
        estimatedDaysOfStock: 10,
        coverageBucket: "LT_15",
        distinctCustomersInWindow: 12,
        operationalFlags: ["DEMAND_WITHOUT_STOCK", "LOW_ESTIMATED_COVERAGE"],
      },
    ],
    categories: [
      {
        categorySourceId: "51",
        category: "Shapes",
        products: 50,
        productsWithStock: 45,
        stockUnits: 320,
        inventoryCostValue: 45000,
        inventoryListValue: 90000,
        quantityInWindow: 200,
        realizedRevenueInWindow: 40000,
        productsWithSales: 35,
        productsWithoutSales: 10,
        capitalWithoutSales: 9000,
        capitalWithoutSalesShare: 20.0,
        demandWithoutStockCount: 5,
        lowCoverageCount: 8,
        aggregatedEstimatedDaysOfStock: 48,
      },
    ],
    dataQuality: {
      negativeStockCount: 6,
      activeWithoutStockCount: 33,
      inactiveWithStockCount: 18,
      effectiveCostMissingOrZero: 0,
      retailSalePriceMissingOrZero: 0,
      averageCostMissingOrZero: 0,
      stockMinNotConfiguredCount: 15,
      stockMaxNotConfiguredCount: 20,
    },
  };

  it("fetchInventoryOverview calls GET /bi/inventory/overview?windowDays=90 by default", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockInventoryResult,
    } as Response);

    const result = await fetchInventoryOverview();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/bi/inventory/overview?windowDays=90");
    expect(result.asOfDate).toBe("2026-09-14");
    expect(result.summary.inventoryCostValue).toBe(148936.33);
  });

  it("fetchInventoryOverview supports custom windowDays (30 and 180)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ ...mockInventoryResult, windowDays: 30 }),
    } as Response);

    const res30 = await fetchInventoryOverview(30);
    expect(fetchSpy.mock.calls[0][0]).toContain("windowDays=30");
    expect(res30.windowDays).toBe(30);

    await fetchInventoryOverview(180);
    expect(fetchSpy.mock.calls[1][0]).toContain("windowDays=180");
  });

  it("fetchInventoryOverview throws friendly error on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network connection lost"),
    );

    await expect(fetchInventoryOverview(90)).rejects.toThrow(
      "Não foi possível conectar ao servidor para carregar Estoque & Giro.",
    );
  });

  it("fetchInventoryOverview supports abort signal without generic error wrapping", async () => {
    const abortErr = new DOMException("The user aborted a request.", "AbortError");
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(abortErr);

    const controller = new AbortController();
    controller.abort();

    await expect(
      fetchInventoryOverview(90, controller.signal),
    ).rejects.toThrow(abortErr);
  });

  it("fetchCategoryTree calls GET /bi/categories/tree and returns tree structure", async () => {
    const mockTree = {
      categories: [
        {
          sourceId: "49",
          description: "1 - NINECLOUDS",
          parentSourceId: null,
          directProductCount: 0,
          descendantProductCount: 1342,
          children: [],
        },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockTree,
    } as Response);

    const result = await fetchCategoryTree();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toContain("/bi/categories/tree");
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0].sourceId).toBe("49");
  });

  it("fetchCategoryTree throws friendly error on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network connection lost"),
    );

    await expect(fetchCategoryTree()).rejects.toThrow(
      "Não foi possível conectar ao servidor para carregar a árvore de categorias.",
    );
  });
});
