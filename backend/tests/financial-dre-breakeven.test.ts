import { describe, expect, it } from "vitest";
import {
  calculateBreakEven,
  calculateDreMonthly,
  calculateDreSummary,
  calculateMonthlyOperationalBreakEven,
  type MonthlyCommercialTrend,
} from "../src/modules/financial/financial-dre-calculator.js";
import {
  classifyFinancialRecordForDre,
  type ClassifierRecordInput,
} from "../src/modules/financial/financial-dre-classifier.js";
import type { DreClassificationResult } from "../src/modules/financial/financial-dre-types.js";

describe("Financial DRE — Break-Even Analysis (calculateBreakEven)", () => {
  it("A1. calculates break-even for loss with positive margin (Example 1: Rev 100k, CM 40k, Net -20k)", () => {
    const result = calculateBreakEven(100000, 40000, -20000, { fullCoverage: true });

    expect(result.status).toBe("UNREACHED");
    expect(result.realizedRevenue).toBe(100000);
    expect(result.contributionMargin).toBe(40000);
    expect(result.contributionMarginRate).toBe(0.4);
    expect(result.netResult).toBe(-20000);
    expect(result.additionalRevenueNeeded).toBe(50000);
    expect(result.breakEvenRevenue).toBe(150000);
    expect(result.additionalRevenuePercent).toBe(50);
    expect(result.currentCoveragePercent).toBeCloseTo(66.67, 1);
  });

  it("A2. calculates break-even for loss with positive margin (Example 2: Rev 84k, CM rate 0.382, Net -12.4k)", () => {
    const result = calculateBreakEven(84000, 32088, -12400, { fullCoverage: true });

    expect(result.status).toBe("UNREACHED");
    expect(result.realizedRevenue).toBe(84000);
    expect(result.contributionMarginRate).toBe(0.382);
    expect(result.netResult).toBe(-12400);
    expect(result.additionalRevenueNeeded).toBe(32460.73);
    expect(result.breakEvenRevenue).toBe(116460.73);
    expect(result.additionalRevenuePercent).toBeCloseTo(38.64, 1);
  });

  it("B. handles exact break-even (NetResult == 0)", () => {
    const result = calculateBreakEven(100000, 40000, 0, { fullCoverage: true });

    expect(result.status).toBe("PROFITABLE");
    expect(result.additionalRevenueNeeded).toBe(0);
    expect(result.breakEvenRevenue).toBe(100000);
    expect(result.additionalRevenuePercent).toBe(0);
    expect(result.safetyMarginPercent).toBe(0);
    expect(result.currentCoveragePercent).toBe(100);
  });

  it("C. handles positive net result (NetResult > 0)", () => {
    const result = calculateBreakEven(100000, 40000, 10000, { fullCoverage: true });

    expect(result.status).toBe("PROFITABLE");
    expect(result.additionalRevenueNeeded).toBe(0);
    expect(result.breakEvenRevenue).toBe(75000);
    expect(result.additionalRevenuePercent).toBe(0);
    expect(result.safetyMarginPercent).toBe(25);
    expect(result.currentCoveragePercent).toBeCloseTo(133.33, 1);
  });

  it("D. handles zero contribution margin (UNDETERMINED_ZERO_MARGIN)", () => {
    const result = calculateBreakEven(100000, 0, -20000, { fullCoverage: true });

    expect(result.status).toBe("UNDETERMINED_ZERO_MARGIN");
    expect(result.contributionMarginRate).toBe(0);
    expect(result.additionalRevenueNeeded).toBeNull();
    expect(result.breakEvenRevenue).toBeNull();
    expect(result.additionalRevenuePercent).toBeNull();
  });

  it("E. handles negative contribution margin (UNDETERMINED_ZERO_MARGIN)", () => {
    const result = calculateBreakEven(100000, -5000, -30000, { fullCoverage: true });

    expect(result.status).toBe("UNDETERMINED_ZERO_MARGIN");
    expect(result.contributionMarginRate).toBe(-0.05);
    expect(result.additionalRevenueNeeded).toBeNull();
    expect(result.breakEvenRevenue).toBeNull();
    expect(result.additionalRevenuePercent).toBeNull();
  });

  it("F. handles zero or negative revenue (UNDETERMINED_ZERO_REVENUE & UNDETERMINED_NO_REVENUE_WITH_COSTS)", () => {
    const zeroRev = calculateBreakEven(0, 0, 0, { fullCoverage: true });
    expect(zeroRev.status).toBe("UNDETERMINED_ZERO_REVENUE");
    expect(zeroRev.contributionMarginRate).toBeNull();
    expect(zeroRev.additionalRevenueNeeded).toBeNull();
    expect(zeroRev.breakEvenRevenue).toBeNull();

    const noRevWithCosts = calculateBreakEven(0, 0, -5000, { fullCoverage: true });
    expect(noRevWithCosts.status).toBe("UNDETERMINED_NO_REVENUE_WITH_COSTS");
    expect(noRevWithCosts.breakEvenRevenue).toBeNull();

    const negRev = calculateBreakEven(-100, -50, -200, { fullCoverage: true });
    expect(negRev.status).toBe("UNDETERMINED_NO_REVENUE_WITH_COSTS");
  });

  it("G. enforces monetary rounding to 2 decimal places without floating artifacts", () => {
    const result = calculateBreakEven(33333.33, 11111.11, -7777.77, { fullCoverage: true });

    expect(result.status).toBe("UNREACHED");
    expect(Number.isInteger(result.additionalRevenueNeeded! * 100)).toBe(true);
    expect(Number.isInteger(result.breakEvenRevenue! * 100)).toBe(true);
  });

  it("H1. Cost Coverage Guardrail: insufficient cost coverage (< 80%) produces UNDETERMINED_PARTIAL_COST_COVERAGE", () => {
    const result = calculateBreakEven(100000, 40000, -20000, {
      costCoveragePercent: 75,
      fullCoverage: false,
    });

    expect(result.status).toBe("UNDETERMINED_PARTIAL_COST_COVERAGE");
    expect(result.netResult).toBeNull();
    expect(result.breakEvenRevenue).toBeNull();
    expect(result.additionalRevenueNeeded).toBeNull();
    expect(result.additionalRevenuePercent).toBeNull();
    expect(result.coverageNotice).toBeDefined();
    expect(result.costQualityStatus).toBe("INSUFFICIENT_COST_COVERAGE");
  });

  it("H1b. Cost Coverage Guardrail: provisional cost coverage (80-95%) produces PROVISIONAL_ESTIMATE", () => {
    const result = calculateBreakEven(100000, 40000, -20000, {
      costCoveragePercent: 82.5,
      fullCoverage: false,
    });

    expect(result.status).toBe("UNREACHED");
    expect(result.costQualityStatus).toBe("PROVISIONAL_ESTIMATE");
    expect(result.isEstimated).toBe(true);
  });

  it("H2. Cost Coverage Guardrail: zero cost coverage (0%) produces UNDETERMINED_PARTIAL_COST_COVERAGE", () => {
    const result = calculateBreakEven(100000, 40000, null, {
      costCoveragePercent: 0,
      fullCoverage: false,
    });

    expect(result.status).toBe("UNDETERMINED_PARTIAL_COST_COVERAGE");
    expect(result.netResult).toBeNull();
    expect(result.breakEvenRevenue).toBeNull();
  });

  it("H3. Cost Coverage Guardrail: netManagerialResult null produces UNDETERMINED_PARTIAL_COST_COVERAGE without creating false targets", () => {
    // When cost coverage is missing, netManagerialResult is null.
    // Must never treat null as zero or fabricate a break-even.
    const result = calculateBreakEven(100000, 40000, null);

    expect(result.status).toBe("UNDETERMINED_PARTIAL_COST_COVERAGE");
    expect(result.breakEvenRevenue).toBeNull();
    expect(result.additionalRevenueNeeded).toBeNull();
  });

  it("I. aggregate calculation uses Total CM / Total Revenue, NOT average of monthly rates", () => {
    const commercialTrend: MonthlyCommercialTrend[] = [
      {
        month: "2026-01",
        realizedRevenue: 100000,
        estimatedCOGS: 50000,
        estimatedGrossProfit: 50000,
        grossMarginPercent: 50,
        costCoveragePercent: 100,
      },
      {
        month: "2026-02",
        realizedRevenue: 20000,
        estimatedCOGS: 18000,
        estimatedGrossProfit: 2000,
        grossMarginPercent: 10,
        costCoveragePercent: 100,
      },
    ];

    const records: DreClassificationResult[] = [
      {
        recordId: "1",
        sourceId: "s1",
        category: "OPERATING_ADMINISTRATIVE",
        baseAmount: 60000,
        referenceMonth: "2026-01",
        isDeductibleInDre: true,
      },
      {
        recordId: "2",
        sourceId: "s2",
        category: "OPERATING_ADMINISTRATIVE",
        baseAmount: 7000,
        referenceMonth: "2026-02",
        isDeductibleInDre: true,
      },
    ];

    const months = calculateDreMonthly(commercialTrend, records);
    const summary = calculateDreSummary(months, { from: "2026-01-01", to: "2026-02-28" });

    expect(summary.totals.realizedRevenue).toBe(120000);
    expect(summary.totals.contributionMargin).toBe(52000);
    expect(summary.totals.netManagerialResult).toBe(-15000);

    const breakEven = summary.totals.breakEven!;
    expect(breakEven).toBeDefined();
    expect(breakEven.status).toBe("UNREACHED");
    expect(breakEven.contributionMarginRate).toBeCloseTo(0.4333, 3);
    expect(breakEven.additionalRevenueNeeded).toBe(34615.38);
    expect(breakEven.breakEvenRevenue).toBe(154615.38);
  });

  it("J. computes monthly break-even for each month in calculateDreMonthly", () => {
    const commercialTrend: MonthlyCommercialTrend[] = [
      {
        month: "2026-01",
        realizedRevenue: 50000,
        estimatedCOGS: 25000,
        estimatedGrossProfit: 25000,
        grossMarginPercent: 50,
        costCoveragePercent: 100,
      },
      {
        month: "2026-02",
        realizedRevenue: 80000,
        estimatedCOGS: 40000,
        estimatedGrossProfit: 40000,
        grossMarginPercent: 50,
        costCoveragePercent: 100,
      },
    ];

    const records: DreClassificationResult[] = [
      {
        recordId: "1",
        sourceId: "s1",
        category: "OPERATING_ADMINISTRATIVE",
        baseAmount: 35000,
        referenceMonth: "2026-01",
        isDeductibleInDre: true,
      },
      {
        recordId: "2",
        sourceId: "s2",
        category: "OPERATING_ADMINISTRATIVE",
        baseAmount: 30000,
        referenceMonth: "2026-02",
        isDeductibleInDre: true,
      },
    ];

    const months = calculateDreMonthly(commercialTrend, records);

    // Jan: Loss of 10k, margin 50% -> additional needed 20k -> break-even 70k
    expect(months[0].breakEven).toBeDefined();
    expect(months[0].breakEven?.status).toBe("UNREACHED");
    expect(months[0].breakEven?.additionalRevenueNeeded).toBe(20000);
    expect(months[0].breakEven?.breakEvenRevenue).toBe(70000);
    expect(months[0].breakEven?.additionalRevenuePercent).toBe(40);

    // Feb: Profit of 10k, margin 50% -> PROFITABLE
    expect(months[1].breakEven).toBeDefined();
    expect(months[1].breakEven?.status).toBe("PROFITABLE");
    expect(months[1].breakEven?.additionalRevenueNeeded).toBe(0);
    expect(months[1].breakEven?.breakEvenRevenue).toBe(60000);
  });

  it("K. month with partial coverage sets break-even status to UNDETERMINED_PARTIAL_COST_COVERAGE", () => {
    const commercialTrend: MonthlyCommercialTrend[] = [
      {
        month: "2026-03",
        realizedRevenue: 50000,
        revenueWithCurrentCost: 30000,
        revenueWithoutCurrentCost: 20000,
        costCoveragePercent: 60,
        estimatedCOGS: 15000,
        estimatedGrossProfit: 15000,
        grossMarginPercent: 50,
      },
    ];

    const records: DreClassificationResult[] = [
      {
        recordId: "1",
        sourceId: "s1",
        category: "OPERATING_ADMINISTRATIVE",
        baseAmount: 10000,
        referenceMonth: "2026-03",
        isDeductibleInDre: true,
      },
    ];

    const months = calculateDreMonthly(commercialTrend, records);
    expect(months[0].fullManagerialResultAvailable).toBe(false);
    expect(months[0].netManagerialResult).toBeNull();
    expect(months[0].breakEven?.status).toBe("UNDETERMINED_PARTIAL_COST_COVERAGE");
    expect(months[0].breakEven?.breakEvenRevenue).toBeNull();
    expect(months[0].breakEven?.additionalRevenueNeeded).toBeNull();
    expect(months[0].breakEven?.calculationBasis).toBe("COVERED_REVENUE");
    expect(months[0].breakEven?.isProvisional).toBe(true);
    expect(months[0].breakEven?.coveredRevenue).toBe(30000);
    expect(months[0].coveredContributionMargin).toBe(15000);
  });

  describe("L. Provisional Break-Even with Financial Result & Partial Coverage", () => {
    it("L1. live production dataset values with negative financial result", () => {
      // covRev = 359107.14, covCm = 107051.54, opExp = 145379.48, finResult = -1853.84
      const result = calculateBreakEven(366672.36, 107051.54, null, {
        costCoveragePercent: 97.94,
        fullCoverage: false,
        coveredRevenue: 359107.14,
        coveredContributionMargin: 107051.54,
        operatingExpenses: 145379.48,
        financialResult: -1853.84,
      });

      expect(result.status).toBe("UNREACHED");
      expect(result.breakEvenRevenue).toBeDefined();
      expect(result.isEstimated).toBe(true);
      expect(result.costQualityStatus).toBe("HIGH_CONFIDENCE_ESTIMATE");
      expect(result.isProvisional).toBe(true);
      expect(result.provisionalFixedCostBase).toBe(147233.32);
      expect(result.provisionalBreakEvenRevenue).toBe(493897.95);
      expect(result.provisionalGap).toBe(134790.81);
      expect(result.provisionalCurrentCoveragePercent).toBe(72.71);
    });

    it("L2. scenario with financialResult = 0", () => {
      // opExp = 100000, finResult = 0 -> fixedBase = 100000
      // covRev = 200000, covCm = 80000 -> rawRate = 0.4
      // provBreakEven = 100000 / 0.4 = 250000
      // provGap = 250000 - 200000 = 50000
      // provCoverage = (200000 / 250000) * 100 = 80%
      const result = calculateBreakEven(250000, 80000, null, {
        costCoveragePercent: 80,
        fullCoverage: false,
        coveredRevenue: 200000,
        coveredContributionMargin: 80000,
        operatingExpenses: 100000,
        financialResult: 0,
      });

      expect(result.status).toBe("UNREACHED");
      expect(result.breakEvenRevenue).toBeDefined();
      expect(result.isEstimated).toBe(true);
      expect(result.costQualityStatus).toBe("PROVISIONAL_ESTIMATE");
      expect(result.isProvisional).toBe(true);
      expect(result.provisionalFixedCostBase).toBe(100000);
      expect(result.provisionalBreakEvenRevenue).toBe(250000);
      expect(result.provisionalGap).toBe(50000);
      expect(result.provisionalCurrentCoveragePercent).toBe(80);
    });

    it("L3. scenario with positive financialResult (financial income decreases required fixed base)", () => {
      // opExp = 100000, finResult = 10000 -> fixedBase = 100000 - 10000 = 90000
      // covRev = 200000, covCm = 80000 -> rawRate = 0.4
      // provBreakEven = 90000 / 0.4 = 225000
      // provGap = 225000 - 200000 = 25000
      // provCoverage = (200000 / 225000) * 100 = 88.89%
      const result = calculateBreakEven(250000, 80000, null, {
        costCoveragePercent: 80,
        fullCoverage: false,
        coveredRevenue: 200000,
        coveredContributionMargin: 80000,
        operatingExpenses: 100000,
        financialResult: 10000,
      });

      expect(result.status).toBe("UNREACHED");
      expect(result.breakEvenRevenue).toBeDefined();
      expect(result.isEstimated).toBe(true);
      expect(result.costQualityStatus).toBe("PROVISIONAL_ESTIMATE");
      expect(result.isProvisional).toBe(true);
      expect(result.provisionalFixedCostBase).toBe(90000);
      expect(result.provisionalBreakEvenRevenue).toBe(225000);
      expect(result.provisionalGap).toBe(25000);
      expect(result.provisionalCurrentCoveragePercent).toBe(88.89);
    });

    it("L4. 100% cost coverage uses official break-even and ignores provisional", () => {
      // Full coverage: NetResult = CM (40000) - OpExp (50000) + FinResult (-5000) = -15000
      // Official break even = 100000 + (15000 / 0.4) = 137500
      const result = calculateBreakEven(100000, 40000, -15000, {
        costCoveragePercent: 100,
        fullCoverage: true,
        coveredRevenue: 100000,
        coveredContributionMargin: 40000,
        operatingExpenses: 50000,
        financialResult: -5000,
      });

      expect(result.status).toBe("UNREACHED");
      expect(result.breakEvenRevenue).toBe(137500);
      expect(result.additionalRevenueNeeded).toBe(37500);
      expect(result.isProvisional).toBeUndefined();
      expect(result.provisionalBreakEvenRevenue).toBeUndefined();
      expect(result.gapToBreakEven).toBe(37500);
      expect(result.surplusRevenue).toBe(0);
    });

    it("L5. computes canonical gapToBreakEven and surplusRevenue for surplus (profitable month)", () => {
      // Exemplo real Jan/26: Receita 58987.80, BreakEven 58697.94 -> Superávit 289.86
      const result = calculateBreakEven(58987.80, 15057.38, 73.99, {
        costCoveragePercent: 96.71,
        fullCoverage: false,
        operatingExpenses: 14806.34,
        financialResult: -177.05,
      });

      expect(result.status).toBe("PROFITABLE");
      expect(result.breakEvenRevenue).toBe(58697.94);
      expect(result.gapToBreakEven).toBe(-289.86);
      expect(result.surplusRevenue).toBe(289.86);
    });
  });

  describe("M. Home Operational Monthly Break-Even KPI (Section 13)", () => {
    const baseTrend: MonthlyCommercialTrend[] = [
      {
        month: "2026-09",
        realizedRevenue: 50000,
        revenueWithCurrentCost: 50000,
        revenueWithoutCurrentCost: 0,
        costCoveragePercent: 100,
        estimatedCOGS: 30000,
        estimatedGrossProfit: 20000,
        grossMarginPercent: 40,
      },
      {
        month: "2026-10",
        realizedRevenue: 40000,
        revenueWithCurrentCost: 40000,
        revenueWithoutCurrentCost: 0,
        costCoveragePercent: 100,
        estimatedCOGS: 24000,
        estimatedGrossProfit: 16000,
        grossMarginPercent: 40,
      },
      {
        month: "2026-11",
        realizedRevenue: 11602.87,
        revenueWithCurrentCost: 11602.87,
        revenueWithoutCurrentCost: 0,
        costCoveragePercent: 100,
        estimatedCOGS: 6788.01,
        estimatedGrossProfit: 4814.86,
        grossMarginPercent: 41.5,
      },
    ];

    it("A & B: DAS (920.24) and GPS (534.93) with dueDate 2026-11-20 enter Home November operational KPI while remaining in October for DRE", () => {
      const records: ClassifierRecordInput[] = [
        {
          id: "rec-das",
          sourceId: "11568",
          type: "SAIDA",
          budgetPlanSourceId: "27",
          description: "Simples Nacional",
          dueDate: new Date("2026-11-20T00:00:00Z"),
          originalAmount: 920.24,
          totalAmount: 920.24,
        },
        {
          id: "rec-gps",
          sourceId: "11567",
          type: "SAIDA",
          budgetPlanSourceId: "27",
          description: "GPS",
          dueDate: new Date("2026-11-20T00:00:00Z"),
          originalAmount: 534.93,
          totalAmount: 534.93,
        },
      ];

      // 1. Verify DRE remains unchanged (belongs to 2026-10)
      const dreClassified = records.map((r) => classifyFinancialRecordForDre(r));
      expect(dreClassified[0]!.referenceMonth).toBe("2026-10");
      expect(dreClassified[1]!.referenceMonth).toBe("2026-10");

      const dreMonths = calculateDreMonthly(baseTrend, dreClassified, {
        period: { from: "2026-11-01", to: "2026-11-30" },
        fromDate: new Date("2026-11-01T00:00:00Z"),
        toExclusiveDate: new Date("2026-12-01T00:00:00Z"),
      });
      const dreNov = dreMonths.find((m) => m.month === "2026-11")!;
      expect(dreNov.variableExpenses.taxesOnRevenue).toBe(0);
      expect(dreNov.operatingExpenses.personnel).toBe(0);

      // 2. Verify Home Operational KPI includes both in 2026-11
      const homeNov = calculateMonthlyOperationalBreakEven(baseTrend, records, {
        targetMonth: "2026-11",
        referenceDate: new Date("2026-11-17T12:00:00Z"),
      });
      expect(homeNov.calculationBasis).toBe("CURRENT_MONTH_DUE_DATE");
      expect(homeNov.variableExpenses.taxesOnRevenue).toBe(920.24);
      expect(homeNov.operatingExpenses.personnel).toBe(534.93);
    });

    it("C & D: excludes inventory purchases (Plan 19) from KPI expenses and includes November partner compensation (Plan 39)", () => {
      const records: ClassifierRecordInput[] = [
        {
          id: "rec-inv",
          sourceId: "11531",
          type: "SAIDA",
          budgetPlanSourceId: "19",
          description: "Compra Fornecedor YOURFACE",
          dueDate: new Date("2026-11-05T00:00:00Z"),
          originalAmount: 1888.0,
          totalAmount: 1888.0,
        },
        {
          id: "rec-pro-1",
          sourceId: "11572",
          type: "SAIDA",
          budgetPlanSourceId: "39",
          description: "Andre",
          dueDate: new Date("2026-11-10T00:00:00Z"),
          originalAmount: 2000.0,
          totalAmount: 2000.0,
        },
        {
          id: "rec-pro-2",
          sourceId: "11573",
          type: "SAIDA",
          budgetPlanSourceId: "39",
          description: "Rangel",
          dueDate: new Date("2026-11-10T00:00:00Z"),
          originalAmount: 2000.0,
          totalAmount: 2000.0,
        },
        {
          id: "rec-pro-3",
          sourceId: "11574",
          type: "SAIDA",
          budgetPlanSourceId: "39",
          description: "Mario",
          dueDate: new Date("2026-11-10T00:00:00Z"),
          originalAmount: 2000.0,
          totalAmount: 2000.0,
        },
      ];

      const homeNov = calculateMonthlyOperationalBreakEven(baseTrend, records, {
        targetMonth: "2026-11",
        referenceDate: new Date("2026-11-17T12:00:00Z"),
      });

      expect(homeNov.variableExpenses.total).toBe(0);
      expect(homeNov.operatingExpenses.partnerCompensation).toBe(6000);
      expect(homeNov.operatingExpenses.total).toBe(6000);
      expect(homeNov.estimatedCOGS).toBe(6788.01);
    });

    it("E & F: includes expense with dueDate 30/11 even on 17/11 and excludes December dueDate expenses", () => {
      const records: ClassifierRecordInput[] = [
        {
          id: "rec-icms-nov",
          sourceId: "11520",
          type: "SAIDA",
          budgetPlanSourceId: "27",
          description: "ICMS",
          dueDate: new Date("2026-11-30T00:00:00Z"),
          originalAmount: 550.2,
          totalAmount: 550.2,
        },
        {
          id: "rec-frete-dec",
          sourceId: "11570",
          type: "SAIDA",
          budgetPlanSourceId: "8",
          description: "Braspress",
          dueDate: new Date("2026-12-04T00:00:00Z"),
          originalAmount: 159.23,
          totalAmount: 159.23,
        },
      ];

      const homeNov = calculateMonthlyOperationalBreakEven(baseTrend, records, {
        targetMonth: "2026-11",
        referenceDate: new Date("2026-11-17T12:00:00Z"),
      });

      expect(homeNov.period).toEqual({ from: "2026-11-01", to: "2026-11-30" });
      expect(homeNov.variableExpenses.taxesOnRevenue).toBe(550.2);
      expect(homeNov.variableExpenses.freightLogistics).toBe(0);
    });

    it("G: averageOperationalBreakEven excludes Jan-Jun (legacy regime), excludes Jul (missing accounting), includes Aug-Oct (40630.17), and excludes open Nov", () => {
      const fullTrend: MonthlyCommercialTrend[] = [
        // 2026-05: legacy regime (< 2026-07) even if complete -> excluded
        {
          month: "2026-05",
          realizedRevenue: 30483.36,
          revenueWithCurrentCost: 30483.36,
          revenueWithoutCurrentCost: 0,
          costCoveragePercent: 100,
          estimatedCOGS: 17948.75,
          estimatedGrossProfit: 12534.61,
          grossMarginPercent: 41.12,
        },
        // 2026-07: current regime, but missing accounting -> excluded
        {
          month: "2026-07",
          realizedRevenue: 35784.89,
          revenueWithCurrentCost: 35784.89,
          revenueWithoutCurrentCost: 0,
          costCoveragePercent: 100,
          estimatedCOGS: 20979.18,
          estimatedGrossProfit: 14805.71,
          grossMarginPercent: 41.37,
        },
        // 2026-08: complete current regime (BE = 39674.13)
        {
          month: "2026-08",
          realizedRevenue: 31509.52,
          revenueWithCurrentCost: 31509.52,
          revenueWithoutCurrentCost: 0,
          costCoveragePercent: 100,
          estimatedCOGS: 18352.71,
          estimatedGrossProfit: 13156.81,
          grossMarginPercent: 41.76,
        },
        // 2026-09: complete current regime (BE = 43718.18)
        {
          month: "2026-09",
          realizedRevenue: 39137.44,
          revenueWithCurrentCost: 39137.44,
          revenueWithoutCurrentCost: 0,
          costCoveragePercent: 100,
          estimatedCOGS: 23365.58,
          estimatedGrossProfit: 15771.86,
          grossMarginPercent: 40.3,
        },
        // 2026-10: complete current regime (BE = 38498.20)
        {
          month: "2026-10",
          realizedRevenue: 21208.4,
          revenueWithCurrentCost: 21208.4,
          revenueWithoutCurrentCost: 0,
          costCoveragePercent: 100,
          estimatedCOGS: 11441.28,
          estimatedGrossProfit: 9767.12,
          grossMarginPercent: 46.05,
        },
        // 2026-11: open current month -> excluded from reference average
        {
          month: "2026-11",
          realizedRevenue: 11602.87,
          revenueWithCurrentCost: 11602.87,
          revenueWithoutCurrentCost: 0,
          costCoveragePercent: 100,
          estimatedCOGS: 6788.01,
          estimatedGrossProfit: 4814.86,
          grossMarginPercent: 41.5,
        },
      ];

      const makeCompleteMonthRecords = (
        monthPrefix: string,
        nextMonthPrefix: string,
        opts: {
          dasDueInMonth: number;
          gpsDueInMonth: number;
          freight: number;
          proLabore: number;
          rent: number;
          marketing: number;
          accounting: number;
          otherOpEx: number;
          finExp: number;
          nextMonthDasForDreClose: number;
          nextMonthGpsForDreClose: number;
        },
      ): ClassifierRecordInput[] => {
        const list: ClassifierRecordInput[] = [
          {
            id: `${monthPrefix}-das`,
            sourceId: `${monthPrefix}-das`,
            type: "SAIDA",
            budgetPlanSourceId: "27",
            description: "Simples Nacional",
            dueDate: new Date(`${monthPrefix}-20T00:00:00Z`),
            originalAmount: opts.dasDueInMonth,
            totalAmount: opts.dasDueInMonth,
          },
          {
            id: `${monthPrefix}-gps`,
            sourceId: `${monthPrefix}-gps`,
            type: "SAIDA",
            budgetPlanSourceId: "27",
            description: "GPS",
            dueDate: new Date(`${monthPrefix}-20T00:00:00Z`),
            originalAmount: opts.gpsDueInMonth,
            totalAmount: opts.gpsDueInMonth,
          },
          {
            id: `${monthPrefix}-fr`,
            sourceId: `${monthPrefix}-fr`,
            type: "SAIDA",
            budgetPlanSourceId: "8",
            description: "Melhor Envio",
            dueDate: new Date(`${monthPrefix}-10T00:00:00Z`),
            originalAmount: opts.freight,
            totalAmount: opts.freight,
          },
          {
            id: `${monthPrefix}-pro`,
            sourceId: `${monthPrefix}-pro`,
            type: "SAIDA",
            budgetPlanSourceId: "39",
            description: "Retirada Mensal",
            dueDate: new Date(`${monthPrefix}-10T00:00:00Z`),
            originalAmount: opts.proLabore,
            totalAmount: opts.proLabore,
          },
          {
            id: `${monthPrefix}-rent`,
            sourceId: `${monthPrefix}-rent`,
            type: "SAIDA",
            budgetPlanSourceId: "8",
            description: "Aluguel Tiradentes",
            dueDate: new Date(`${monthPrefix}-08T00:00:00Z`),
            originalAmount: opts.rent,
            totalAmount: opts.rent,
          },
          {
            id: `${monthPrefix}-mkt`,
            sourceId: `${monthPrefix}-mkt`,
            type: "SAIDA",
            budgetPlanSourceId: "23",
            description: "Google Ads",
            dueDate: new Date(`${monthPrefix}-15T00:00:00Z`),
            originalAmount: opts.marketing,
            totalAmount: opts.marketing,
          },
          {
            id: `${monthPrefix}-other`,
            sourceId: `${monthPrefix}-other`,
            type: "SAIDA",
            budgetPlanSourceId: "8",
            description: "TagPlus - Nineclouds",
            dueDate: new Date(`${monthPrefix}-15T00:00:00Z`),
            originalAmount: opts.otherOpEx,
            totalAmount: opts.otherOpEx,
          },
          {
            id: `${monthPrefix}-fin`,
            sourceId: `${monthPrefix}-fin`,
            type: "SAIDA",
            budgetPlanSourceId: "8",
            description: "Conta Corrente Bradesco",
            dueDate: new Date(`${monthPrefix}-15T00:00:00Z`),
            originalAmount: opts.finExp,
            totalAmount: opts.finExp,
          },
        ];
        if (opts.accounting > 0) {
          list.push({
            id: `${monthPrefix}-acc`,
            sourceId: `${monthPrefix}-acc`,
            type: "SAIDA",
            budgetPlanSourceId: "8",
            description: "Escritorio Ortiz",
            dueDate: new Date(`${monthPrefix}-15T00:00:00Z`),
            originalAmount: opts.accounting,
            totalAmount: opts.accounting,
          });
        }
        return list;
      };

      const records: ClassifierRecordInput[] = [
        // 2026-05 (legacy regime)
        ...makeCompleteMonthRecords("2026-05", "2026-06", {
          dasDueInMonth: 2081.99,
          gpsDueInMonth: 534.93,
          freight: 1941.39,
          proLabore: 9000,
          rent: 4067.59,
          marketing: 2486.14,
          accounting: 770.3,
          otherOpEx: 830.98,
          finExp: 200.82,
          nextMonthDasForDreClose: 1288.18,
          nextMonthGpsForDreClose: 534.93,
        }),
        // 2026-06 DAS/GPS to close 2026-05 in DRE
        {
          id: "2026-06-das",
          sourceId: "2026-06-das",
          type: "SAIDA",
          budgetPlanSourceId: "27",
          description: "Simples Nacional",
          dueDate: new Date("2026-06-20T00:00:00Z"),
          originalAmount: 1288.18,
          totalAmount: 1288.18,
        },
        {
          id: "2026-06-gps",
          sourceId: "2026-06-gps",
          type: "SAIDA",
          budgetPlanSourceId: "27",
          description: "GPS",
          dueDate: new Date("2026-06-20T00:00:00Z"),
          originalAmount: 534.93,
          totalAmount: 534.93,
        },
        // 2026-07 (missing accounting: accounting = 0)
        ...makeCompleteMonthRecords("2026-07", "2026-08", {
          dasDueInMonth: 985.81,
          gpsDueInMonth: 534.93,
          freight: 2218.33,
          proLabore: 6000,
          rent: 1571.85,
          marketing: 3022.51,
          accounting: 0,
          otherOpEx: 975.97,
          finExp: 203.76,
          nextMonthDasForDreClose: 1084.18,
          nextMonthGpsForDreClose: 534.93,
        }),
        // 2026-08 (complete: BE = 39674.13)
        ...makeCompleteMonthRecords("2026-08", "2026-09", {
          dasDueInMonth: 1084.18,
          gpsDueInMonth: 534.93,
          freight: 1675.85,
          proLabore: 6000,
          rent: 1571.85,
          marketing: 3332.98,
          accounting: 770.3,
          otherOpEx: 676.93,
          finExp: 203.76,
          nextMonthDasForDreClose: 1592.55,
          nextMonthGpsForDreClose: 534.93,
        }),
        // 2026-09 (complete: BE = 43718.18)
        ...makeCompleteMonthRecords("2026-09", "2026-10", {
          dasDueInMonth: 2700.09,
          gpsDueInMonth: 534.93,
          freight: 1498.96,
          proLabore: 6000,
          rent: 1571.85,
          marketing: 2491.14,
          accounting: 770.3,
          otherOpEx: 1411.21,
          finExp: 147.89,
          nextMonthDasForDreClose: 1447.35,
          nextMonthGpsForDreClose: 534.93,
        }),
        // 2026-10 (complete: BE = 38498.20)
        ...makeCompleteMonthRecords("2026-10", "2026-11", {
          dasDueInMonth: 1447.35,
          gpsDueInMonth: 534.93,
          freight: 1715.06,
          proLabore: 6000,
          rent: 1571.85,
          marketing: 1757.26,
          accounting: 770.3,
          otherOpEx: 1150.99,
          finExp: 203.76,
          nextMonthDasForDreClose: 920.24,
          nextMonthGpsForDreClose: 534.93,
        }),
        // 2026-11 DAS and GPS (closes 2026-10 in DRE and enters 2026-11 in Home)
        {
          id: "2026-11-das",
          sourceId: "11568",
          type: "SAIDA",
          budgetPlanSourceId: "27",
          description: "Simples Nacional",
          dueDate: new Date("2026-11-20T00:00:00Z"),
          originalAmount: 920.24,
          totalAmount: 920.24,
        },
        {
          id: "2026-11-gps",
          sourceId: "11567",
          type: "SAIDA",
          budgetPlanSourceId: "27",
          description: "GPS",
          dueDate: new Date("2026-11-20T00:00:00Z"),
          originalAmount: 534.93,
          totalAmount: 534.93,
        },
      ];

      const homeNov = calculateMonthlyOperationalBreakEven(fullTrend, records, {
        targetMonth: "2026-11",
        referenceDate: new Date("2026-11-17T12:00:00Z"),
      });

      // Only 2026-08, 2026-09, and 2026-10 enter the reference average!
      expect(homeNov.averageReferenceMonthsCount).toBe(3);
      expect(homeNov.averageReferenceStartMonth).toBe("2026-08");
      expect(homeNov.averageReferenceEndMonth).toBe("2026-10");
      expect(homeNov.averageOperationalBreakEven).toBe(40630.17);
    });
  });
});
