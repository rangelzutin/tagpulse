import { describe, expect, it } from "vitest";
import {
  calculateBreakEven,
  calculateDreMonthly,
  calculateDreSummary,
  type MonthlyCommercialTrend,
} from "../src/modules/financial/financial-dre-calculator.js";
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

  it("H1. Cost Coverage Guardrail: partial cost coverage (< 100%) produces UNDETERMINED_PARTIAL_COST_COVERAGE", () => {
    const result = calculateBreakEven(100000, 40000, -20000, {
      costCoveragePercent: 82.5,
      fullCoverage: false,
    });

    expect(result.status).toBe("UNDETERMINED_PARTIAL_COST_COVERAGE");
    expect(result.netResult).toBeNull();
    expect(result.breakEvenRevenue).toBeNull();
    expect(result.additionalRevenueNeeded).toBeNull();
    expect(result.additionalRevenuePercent).toBeNull();
    expect(result.coverageNotice).toBeDefined();
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

      expect(result.status).toBe("UNDETERMINED_PARTIAL_COST_COVERAGE");
      expect(result.breakEvenRevenue).toBeNull();
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

      expect(result.status).toBe("UNDETERMINED_PARTIAL_COST_COVERAGE");
      expect(result.breakEvenRevenue).toBeNull();
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

      expect(result.status).toBe("UNDETERMINED_PARTIAL_COST_COVERAGE");
      expect(result.breakEvenRevenue).toBeNull();
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
    });
  });
});
