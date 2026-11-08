import { describe, expect, it } from "vitest";
import {
  calculateDreMonthly,
  calculateDreSummary,
  type MonthlyCommercialTrend,
} from "../src/modules/financial/financial-dre-calculator.js";
import {
  parseOperationUnit,
  parseSourceSystem,
} from "../src/shared/filters/filter-options.js";
import { buildApp } from "../src/app.js";
import { createFinancialDreService } from "../src/modules/financial/financial-dre-service.js";
import type { FinancialDreRepository } from "../src/modules/financial/financial-dre-repository.js";
import type { BiRepository } from "../src/modules/bi/bi-repository.js";

describe("DRE Cost Coverage and Filter Semantics", () => {
  describe("Cost Coverage Semantics in Calculator", () => {
    it("reports fullGrossProfitAvailable=true and fullManagerialResultAvailable=true when coverage is 100%", () => {
      const trend: MonthlyCommercialTrend[] = [
        {
          month: "2026-01",
          realizedRevenue: 100000,
          estimatedCOGS: 40000,
          estimatedGrossProfit: 60000,
          grossMarginPercent: 60,
          revenueWithCurrentCost: 100000,
          revenueWithoutCurrentCost: 0,
          costCoveragePercent: 100,
        },
      ];

      const monthly = calculateDreMonthly(trend, []);
      expect(monthly[0]?.fullGrossProfitAvailable).toBe(true);
      expect(monthly[0]?.fullManagerialResultAvailable).toBe(true);
      expect(monthly[0]?.netManagerialResult).toBe(60000);
      expect(monthly[0]?.costCoveragePercent).toBe(100);
      expect(monthly[0]?.coveredGrossProfit).toBe(60000);
      expect(monthly[0]?.partialManagerialResultOnCoveredRevenue).toBe(60000);

      const summary = calculateDreSummary(monthly, "2026-01-01", "2026-01-31");
      expect(summary.totals.fullGrossProfitAvailable).toBe(true);
      expect(summary.totals.fullManagerialResultAvailable).toBe(true);
      expect(summary.totals.netManagerialResult).toBe(60000);
      expect(summary.totals.costCoveragePercent).toBe(100);
      expect(summary.totals.partialManagerialResultOnCoveredRevenue).toBe(60000);
    });

    it("reports fullGrossProfitAvailable=false, fullManagerialResultAvailable=false, netManagerialResult=null when coverage is < 100%", () => {
      // Historical Hustler situation: ~19.63% coverage
      const trend: MonthlyCommercialTrend[] = [
        {
          month: "2024-05",
          realizedRevenue: 1141693.14,
          estimatedCOGS: 119974.75,
          estimatedGrossProfit: 104084.85,
          grossMarginPercent: 46.45,
          revenueWithCurrentCost: 224059.60,
          revenueWithoutCurrentCost: 917633.54,
          costCoveragePercent: 19.63,
        },
      ];

      // With operating expenses = 487874.99
      const classifiedExpenses = [
        {
          recordId: "rec-1",
          sourceId: "src-1",
          category: "OPERATING_ADMINISTRATIVE" as const,
          baseAmount: 487874.99,
          referenceMonth: "2024-05",
          isDeductibleInDre: true,
        },
      ];

      const monthly = calculateDreMonthly(trend, classifiedExpenses);
      const m = monthly[0]!;
      expect(m.fullGrossProfitAvailable).toBe(false);
      expect(m.fullManagerialResultAvailable).toBe(false);
      expect(m.netManagerialResult).toBeNull();
      expect(m.netManagerialMarginPercent).toBeNull();
      expect(m.costCoveragePercent).toBe(19.63);
      expect(m.coveredRevenue).toBe(224059.60);
      expect(m.uncoveredRevenue).toBe(917633.54);
      expect(m.coveredGrossProfit).toBe(104084.85);

      // Partial managerial result = coveredGrossProfit (104084.85) - operatingExpenses (487874.99) = -383790.14
      expect(m.partialManagerialResultOnCoveredRevenue).toBe(-383790.14);

      const summary = calculateDreSummary(monthly, "2024-01-01", "2024-12-31");
      expect(summary.totals.fullGrossProfitAvailable).toBe(false);
      expect(summary.totals.fullManagerialResultAvailable).toBe(false);
      expect(summary.totals.netManagerialResult).toBeNull();
      expect(summary.totals.netManagerialMarginPercent).toBeNull();
      expect(summary.totals.costCoveragePercent).toBe(19.63);
      expect(summary.totals.coveredRevenue).toBe(224059.60);
      expect(summary.totals.uncoveredRevenue).toBe(917633.54);
      expect(summary.totals.coveredGrossProfit).toBe(104084.85);
      expect(summary.totals.partialManagerialResultOnCoveredRevenue).toBe(-383790.14);
    });

    it("does not treat missing cost as zero cost for total margin", () => {
      const trend: MonthlyCommercialTrend[] = [
        {
          month: "2025-01",
          realizedRevenue: 100000,
          estimatedCOGS: 20000,
          estimatedGrossProfit: 30000,
          grossMarginPercent: 60,
          revenueWithCurrentCost: 50000,
          revenueWithoutCurrentCost: 50000,
          costCoveragePercent: 50,
        },
      ];

      const monthly = calculateDreMonthly(trend, []);
      expect(monthly[0]?.netManagerialResult).toBeNull();
      expect(monthly[0]?.fullManagerialResultAvailable).toBe(false);
      // It must NOT say total gross profit is 100000 - 20000 = 80000
      expect(monthly[0]?.coveredGrossProfit).toBe(30000);
    });
  });

  describe("Filter Options Validation", () => {
    it("validates operationUnit correctly", () => {
      expect(parseOperationUnit("HUSTLER")).toEqual({ valid: true, value: "HUSTLER" });
      expect(parseOperationUnit("NINECLOUDS")).toEqual({ valid: true, value: "NINECLOUDS" });
      expect(parseOperationUnit(undefined)).toEqual({ valid: true, value: undefined });
      expect(parseOperationUnit("")).toEqual({ valid: true, value: undefined });

      const invalid = parseOperationUnit("INVALID_OP");
      expect(invalid.valid).toBe(false);
      if (!invalid.valid) {
        expect(invalid.error).toContain("Invalid operationUnit");
      }
    });

    it("validates sourceSystem correctly", () => {
      expect(parseSourceSystem("HUSTLER_LEGACY_DUMP")).toEqual({
        valid: true,
        value: "HUSTLER_LEGACY_DUMP",
      });
      expect(parseSourceSystem("TAGPLUS_CURRENT")).toEqual({
        valid: true,
        value: "TAGPLUS_CURRENT",
      });
      expect(parseSourceSystem(undefined)).toEqual({ valid: true, value: undefined });
      expect(parseSourceSystem("")).toEqual({ valid: true, value: undefined });

      const invalid = parseSourceSystem("UNKNOWN_SYS");
      expect(invalid.valid).toBe(false);
      if (!invalid.valid) {
        expect(invalid.error).toContain("Invalid sourceSystem");
      }
    });
  });

  describe("Routes HTTP 400 on Invalid Enums", () => {
    const mockDreRepo: FinancialDreRepository = {
      async findDreData() {
        return {
          rawRecords: [],
          recordsForClassifier: [],
          commercialTrend: [],
        };
      },
    };

    const mockBiRepo = {
      async findRealizedSales() {
        return [];
      },
      async findRealizedProductMovements() {
        return [];
      },
      async findProfitabilityContext() {
        return {
          sales: [],
          movements: [],
          customers: [],
          productCosts: new Map(),
          channelFees: new Map(),
        };
      },
      async findDataRange() {
        return {
          minSaleDate: null,
          maxSaleDate: null,
          minMovementDate: null,
          maxMovementDate: null,
        };
      },
      async findCategoryTree() {
        return [];
      },
    } as unknown as BiRepository;

    const dreService = createFinancialDreService(mockDreRepo);

    let app: any;

    it("returns 400 on invalid operationUnit for /financial/dre/summary", async () => {
      app = await buildApp({
        databaseHealth: { check: async () => {} },
        frontendUrl: "http://localhost:5173",
        logger: false,
        financialDreService: dreService,
        biRepository: mockBiRepo,
      });

      const res = await app.inject({
        method: "GET",
        url: "/financial/dre/summary?operationUnit=BAD_UNIT",
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain("Invalid operationUnit");
    });

    it("returns 400 on invalid sourceSystem for /financial/dre/summary", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/financial/dre/summary?sourceSystem=BAD_SOURCE",
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain("Invalid sourceSystem");
    });

    it("returns 400 on invalid operationUnit for /financial/dre/monthly", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/financial/dre/monthly?operationUnit=BAD_UNIT",
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain("Invalid operationUnit");
    });

    it("returns 400 on invalid sourceSystem for /financial/dre/monthly", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/financial/dre/monthly?sourceSystem=BAD_SOURCE",
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain("Invalid sourceSystem");
    });

    it("returns 400 on invalid operationUnit for /financial/dre/breakdown", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/financial/dre/breakdown?operationUnit=BAD_UNIT",
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain("Invalid operationUnit");
    });

    it("returns 400 on invalid operationUnit for /bi/sales/overview", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/bi/sales/overview?operationUnit=BAD_UNIT",
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain("Invalid operationUnit");
    });

    it("returns 400 on invalid operationUnit for /bi/profitability/overview", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/bi/profitability/overview?operationUnit=BAD_UNIT",
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain("Invalid operationUnit");
    });

    it("returns 200 with valid operationUnit or without params (backward compatibility)", async () => {
      const resNoParams = await app.inject({
        method: "GET",
        url: "/financial/dre/summary?from=2026-01-01&to=2026-10-13",
      });
      if (resNoParams.statusCode !== 200) {
        console.error("resNoParams error:", resNoParams.body);
      }
      expect(resNoParams.statusCode).toBe(200);

      const resWithValid = await app.inject({
        method: "GET",
        url: "/financial/dre/summary?from=2026-01-01&to=2026-10-13&operationUnit=HUSTLER&sourceSystem=HUSTLER_LEGACY_DUMP",
      });
      expect(resWithValid.statusCode).toBe(200);

      await app.close();
    });
  });
});
