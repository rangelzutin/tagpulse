import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  fetchDecisionsOverview,
  type DecisionsOverviewResult,
} from "./bi";

describe("Central de Decisões Frontend — API Client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockDecisionsResult: DecisionsOverviewResult = {
    meta: {
      asOfDate: "2026-09-20",
      windowDays: 90,
      startDate: "2026-06-23",
      endDate: "2026-09-20",
      totalCatalogProducts: 1757,
      activeCatalogProducts: 292,
      appliedFilters: {
        categorySourceId: null,
        categoryDescription: null,
      },
      dataQuality: {
        productsTotal: 148,
        productsWithCurrentCost: 148,
        productsWithoutCurrentCost: 0,
        revenueWithCurrentCost: 83469.47,
        revenueWithoutCurrentCost: 0,
        costCoveragePercent: 100,
      },
    },
    kpis: {
      currentInventoryCapital: 146662.73,
      capitalWithoutSalesActive: 31302.57,
      demandWithoutStockCount: 20,
      lowCoverageCount: 6,
      criticalCoverageCount: 4,
      alertCoverageCount: 2,
      estimatedGrossProfitInWindow: 35262.87,
      realizedRevenueInWindow: 83469.47,
    },
    replenishment: {
      demandWithoutStock: [
        {
          productSourceId: "1431",
          code: "1431",
          description: "Shape Nineclouds Full Logo Branco 8.125",
          active: true,
          categorySourceId: "51",
          categoryDescription: "Shape Nineclouds Logo",
          rootCategorySourceId: "49",
          rootCategoryDescription: "1 - NINECLOUDS",
          currentStock: 0,
          currentEffectiveCost: 125,
          currentInventoryCostValue: 0,
          currentInventoryListValue: 0,
          retailSalePrice: 250,
          physicalQuantityInWindow: 5,
          realizedRevenueInWindow: 1255.71,
          customerCountInWindow: 5,
          averageDailySales: 0.06,
          estimatedCoverageDays: null,
          lastPhysicalSaleDate: "2026-09-11",
          daysSinceLastPhysicalSale: 9,
          estimatedCOGSInWindow: 625,
          estimatedGrossProfitInWindow: 630.71,
          estimatedGrossMarginPercentInWindow: 50.23,
          channelsInWindow: ["ATACADO", "VAREJO"],
        },
      ],
      criticalCoverage: [],
      alertCoverage: [],
    },
    capitalOptimization: {
      inventoryWithoutSales: [],
      highCoverage: [],
      inactiveWithStock: [],
    },
  };

  it("fetchDecisionsOverview calls GET /bi/decisions/overview?windowDays=90 by default", async () => {
    let calledUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        calledUrl = url;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockDecisionsResult),
        });
      }),
    );

    const result = await fetchDecisionsOverview();
    expect(calledUrl).toContain("/bi/decisions/overview?windowDays=90");
    expect(result.kpis.demandWithoutStockCount).toBe(20);
    expect(result.replenishment.demandWithoutStock[0]?.estimatedCoverageDays).toBeNull();
  });

  it("fetchDecisionsOverview forwards windowDays and categorySourceId query params", async () => {
    let calledUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        calledUrl = url;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockDecisionsResult),
        });
      }),
    );

    await fetchDecisionsOverview({
      windowDays: 180,
      categorySourceId: "cat-51",
    });

    expect(calledUrl).toContain("windowDays=180");
    expect(calledUrl).toContain("categorySourceId=cat-51");
  });

  it("throws a user-friendly error on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network connection lost")),
    );

    await expect(fetchDecisionsOverview()).rejects.toThrow(
      "Não foi possível conectar ao servidor para carregar a Central de Decisões.",
    );
  });
});
