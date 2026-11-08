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
    const result = calculateBreakEven(100000, 40000, -20000);

    expect(result.status).toBe("BELOW_BREAK_EVEN");
    expect(result.realizedRevenue).toBe(100000);
    expect(result.contributionMargin).toBe(40000);
    expect(result.contributionMarginRate).toBe(0.4);
    expect(result.netResult).toBe(-20000);
    expect(result.additionalRevenueNeeded).toBe(50000);
    expect(result.breakEvenRevenue).toBe(150000);
    expect(result.additionalRevenuePercent).toBe(50);
  });

  it("A2. calculates break-even for loss with positive margin (Example 2: Rev 84k, CM rate 0.382, Net -12.4k)", () => {
    // 84000 * 0.382 = 32088
    const result = calculateBreakEven(84000, 32088, -12400);

    expect(result.status).toBe("BELOW_BREAK_EVEN");
    expect(result.realizedRevenue).toBe(84000);
    expect(result.contributionMarginRate).toBe(0.382);
    expect(result.netResult).toBe(-12400);
    // 12400 / 0.382 = 32460.73298... -> 32460.73
    expect(result.additionalRevenueNeeded).toBe(32460.73);
    // 84000 + 32460.73 = 116460.73
    expect(result.breakEvenRevenue).toBe(116460.73);
    // (32460.73 / 84000) * 100 = 38.6437...
    expect(result.additionalRevenuePercent).toBeCloseTo(38.64, 1);
  });

  it("B. handles exact break-even (NetResult == 0)", () => {
    const result = calculateBreakEven(100000, 40000, 0);

    expect(result.status).toBe("ABOVE_BREAK_EVEN");
    expect(result.additionalRevenueNeeded).toBe(0);
    expect(result.breakEvenRevenue).toBe(100000);
    expect(result.additionalRevenuePercent).toBe(0);
  });

  it("C. handles positive net result (NetResult > 0)", () => {
    // Rev = 100k, CM = 40k (rate 0.4), Net = 10k (op expenses were 30k)
    // Implicit break-even revenue = 30k / 0.4 = 75k
    const result = calculateBreakEven(100000, 40000, 10000);

    expect(result.status).toBe("ABOVE_BREAK_EVEN");
    expect(result.additionalRevenueNeeded).toBe(0);
    expect(result.breakEvenRevenue).toBe(75000);
    expect(result.additionalRevenuePercent).toBe(0);
  });

  it("D. handles zero contribution margin (UNVIABLE_MARGIN)", () => {
    const result = calculateBreakEven(100000, 0, -20000);

    expect(result.status).toBe("UNVIABLE_MARGIN");
    expect(result.contributionMarginRate).toBe(0);
    expect(result.additionalRevenueNeeded).toBeNull();
    expect(result.breakEvenRevenue).toBeNull();
    expect(result.additionalRevenuePercent).toBeNull();
  });

  it("E. handles negative contribution margin (UNVIABLE_MARGIN)", () => {
    const result = calculateBreakEven(100000, -5000, -30000);

    expect(result.status).toBe("UNVIABLE_MARGIN");
    expect(result.contributionMarginRate).toBe(-0.05);
    expect(result.additionalRevenueNeeded).toBeNull();
    expect(result.breakEvenRevenue).toBeNull();
    expect(result.additionalRevenuePercent).toBeNull();
  });

  it("F. handles zero or negative revenue (NO_REVENUE)", () => {
    const zeroRev = calculateBreakEven(0, 0, -5000);
    expect(zeroRev.status).toBe("NO_REVENUE");
    expect(zeroRev.contributionMarginRate).toBeNull();
    expect(zeroRev.additionalRevenueNeeded).toBeNull();
    expect(zeroRev.breakEvenRevenue).toBeNull();
    expect(zeroRev.additionalRevenuePercent).toBeNull();

    const negRev = calculateBreakEven(-100, -50, -200);
    expect(negRev.status).toBe("NO_REVENUE");
  });

  it("G & H. enforces monetary rounding to 2 decimal places without floating artifacts", () => {
    // 33333.33 revenue, 11111.11 margin (0.333333...), netResult -7777.77
    const result = calculateBreakEven(33333.33, 11111.11, -7777.77);

    expect(result.status).toBe("BELOW_BREAK_EVEN");
    expect(Number.isInteger(result.additionalRevenueNeeded! * 100)).toBe(true);
    expect(Number.isInteger(result.breakEvenRevenue! * 100)).toBe(true);
  });

  it("I. aggregate calculation uses Total CM / Total Revenue, NOT average of monthly rates", () => {
    // Month 1: Rev = 100,000, CM = 50,000 (50%), OpExp = 60,000, Net = -10,000
    // Month 2: Rev = 20,000, CM = 2,000 (10%), OpExp = 7,000, Net = -5,000
    // Simple average of rates = (50% + 10%) / 2 = 30%
    // True aggregated rate = (50,000 + 2,000) / (100,000 + 20,000) = 52,000 / 120,000 = 43.3333...%
    const commercialTrend: MonthlyCommercialTrend[] = [
      {
        month: "2026-01",
        realizedRevenue: 100000,
        estimatedCOGS: 50000,
        estimatedGrossProfit: 50000,
        grossMarginPercent: 50,
      },
      {
        month: "2026-02",
        realizedRevenue: 20000,
        estimatedCOGS: 18000,
        estimatedGrossProfit: 2000,
        grossMarginPercent: 10,
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

    // Aggregated numbers
    expect(summary.totals.realizedRevenue).toBe(120000);
    expect(summary.totals.contributionMargin).toBe(52000);
    expect(summary.totals.netManagerialResult).toBe(-15000);

    const breakEven = summary.totals.breakEven!;
    expect(breakEven).toBeDefined();
    // Aggregated rate should be 52000 / 120000 = 0.4333, NOT 0.30
    expect(breakEven.contributionMarginRate).toBeCloseTo(0.4333, 3);
    // Additional needed = 15000 / (52/120) = 34615.38
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
      },
      {
        month: "2026-02",
        realizedRevenue: 80000,
        estimatedCOGS: 40000,
        estimatedGrossProfit: 40000,
        grossMarginPercent: 50,
      },
    ];

    const records: DreClassificationResult[] = [
      // Jan has 35k expenses -> Net = 25k - 35k = -10k (LOSS)
      {
        recordId: "1",
        sourceId: "s1",
        category: "OPERATING_ADMINISTRATIVE",
        baseAmount: 35000,
        referenceMonth: "2026-01",
        isDeductibleInDre: true,
      },
      // Feb has 30k expenses -> Net = 40k - 30k = +10k (PROFIT)
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
    expect(months[0].breakEven?.status).toBe("BELOW_BREAK_EVEN");
    expect(months[0].breakEven?.additionalRevenueNeeded).toBe(20000);
    expect(months[0].breakEven?.breakEvenRevenue).toBe(70000);
    expect(months[0].breakEven?.additionalRevenuePercent).toBe(40);

    // Feb: Profit of 10k, margin 50% -> ABOVE_BREAK_EVEN
    expect(months[1].breakEven).toBeDefined();
    expect(months[1].breakEven?.status).toBe("ABOVE_BREAK_EVEN");
    expect(months[1].breakEven?.additionalRevenueNeeded).toBe(0);
    expect(months[1].breakEven?.breakEvenRevenue).toBe(60000); // 30k op / 0.5 = 60k
  });

  it("K. handles partial cost coverage with negative partial result (provisional break-even on covered revenue)", () => {
    // Realized = 100k, Covered = 60k, Covered CM = 30k (rate = 0.5)
    // Op expenses = 40k -> Partial Result = 30k - 40k = -10k
    // Needed = 10k / 0.5 = 20k
    // Break-even revenue = 60k + 20k = 80k
    // Additional % = (20k / 60k) * 100 = 33.3333% (over covered revenue, NOT over realized 100k!)
    const result = calculateBreakEven(100000, 50000, null, {
      fullManagerialResultAvailable: false,
      costCoveragePercent: 60,
      coveredRevenue: 60000,
      coveredContributionMargin: 30000,
      partialManagerialResult: -10000,
      isProvisional: true,
    });

    expect(result.status).toBe("INCOMPLETE_COST_COVERAGE");
    expect(result.isProvisional).toBe(true);
    expect(result.calculationBasis).toBe("COVERED_REVENUE");
    expect(result.realizedRevenue).toBe(100000);
    expect(result.coveredRevenue).toBe(60000);
    expect(result.coveredContributionMargin).toBe(30000);
    expect(result.contributionMarginRate).toBe(0.5);
    expect(result.netResult).toBe(-10000);
    expect(result.additionalRevenueNeeded).toBe(20000);
    expect(result.breakEvenRevenue).toBe(80000);
    expect(result.additionalRevenuePercent).toBeCloseTo(33.33, 1);
  });

  it("L. handles partial cost coverage with positive partial result (provisional above break-even)", () => {
    // Realized = 100k, Covered = 60k, Covered CM = 30k (rate = 0.5)
    // Op expenses = 20k -> Partial Result = 30k - 20k = +10k
    // Implicit break-even revenue = 60k - 10k / 0.5 = 40k
    const result = calculateBreakEven(100000, 50000, null, {
      fullManagerialResultAvailable: false,
      costCoveragePercent: 60,
      coveredRevenue: 60000,
      coveredContributionMargin: 30000,
      partialManagerialResult: 10000,
      isProvisional: true,
    });

    expect(result.status).toBe("INCOMPLETE_COST_COVERAGE");
    expect(result.isProvisional).toBe(true);
    expect(result.calculationBasis).toBe("COVERED_REVENUE");
    expect(result.netResult).toBe(10000);
    expect(result.additionalRevenueNeeded).toBe(0);
    expect(result.breakEvenRevenue).toBe(40000);
    expect(result.additionalRevenuePercent).toBe(0);
  });

  it("M. handles partial cost coverage with unviable covered margin (UNVIABLE_MARGIN)", () => {
    const result = calculateBreakEven(100000, 50000, null, {
      fullManagerialResultAvailable: false,
      costCoveragePercent: 60,
      coveredRevenue: 60000,
      coveredContributionMargin: -5000,
      partialManagerialResult: -15000,
      isProvisional: true,
    });

    expect(result.status).toBe("UNVIABLE_MARGIN");
    expect(result.isProvisional).toBe(true);
    expect(result.calculationBasis).toBe("COVERED_REVENUE");
    expect(result.breakEvenRevenue).toBeNull();
    expect(result.additionalRevenueNeeded).toBeNull();
  });

  it("N. handles partial cost coverage with zero covered revenue (NO_REVENUE)", () => {
    const result = calculateBreakEven(100000, 50000, null, {
      fullManagerialResultAvailable: false,
      costCoveragePercent: 0,
      coveredRevenue: 0,
      coveredContributionMargin: 0,
      partialManagerialResult: -5000,
      isProvisional: true,
    });

    expect(result.status).toBe("NO_REVENUE");
    expect(result.isProvisional).toBe(true);
    expect(result.calculationBasis).toBe("COVERED_REVENUE");
    expect(result.breakEvenRevenue).toBeNull();
  });

  it("O. calculates provisional break-even in calculateDreMonthly and calculateDreSummary when coverage is partial", () => {
    const commercialTrend: MonthlyCommercialTrend[] = [
      {
        month: "2025-07",
        realizedRevenue: 100000,
        revenueWithCurrentCost: 60000,
        revenueWithoutCurrentCost: 40000,
        costCoveragePercent: 60,
        estimatedCOGS: 30000, // on covered rev 60k -> covered gross = 30k
        estimatedGrossProfit: 30000,
        grossMarginPercent: 50,
      },
    ];

    const records: DreClassificationResult[] = [
      {
        recordId: "1",
        sourceId: "s1",
        category: "OPERATING_ADMINISTRATIVE",
        baseAmount: 10000,
        referenceMonth: "2025-07",
        isDeductibleInDre: true,
      },
    ];

    const months = calculateDreMonthly(commercialTrend, records);
    expect(months[0].fullManagerialResultAvailable).toBe(false);
    expect(months[0].costCoveragePercent).toBe(60);
    expect(months[0].coveredRevenue).toBe(60000);
    expect(months[0].coveredGrossProfit).toBe(30000);
    expect(months[0].coveredContributionMargin).toBe(30000);
    expect(months[0].partialManagerialResultOnCoveredRevenue).toBe(20000);

    // Monthly breakEven should be provisional with calculationBasis = "COVERED_REVENUE"
    expect(months[0].breakEven.status).toBe("INCOMPLETE_COST_COVERAGE");
    expect(months[0].breakEven.calculationBasis).toBe("COVERED_REVENUE");
    expect(months[0].breakEven.isProvisional).toBe(true);
    // Rate = 30k / 60k = 0.5. Net = +20k. Implicit = 60k - 20k/0.5 = 20k
    expect(months[0].breakEven.breakEvenRevenue).toBe(20000);
    expect(months[0].breakEven.additionalRevenueNeeded).toBe(0);

    const summary = calculateDreSummary(months, { from: "2025-07-01", to: "2025-07-31" });
    expect(summary.totals.fullManagerialResultAvailable).toBe(false);
    expect(summary.totals.costCoveragePercent).toBe(60);
    expect(summary.totals.coveredContributionMargin).toBe(30000);
    expect(summary.totals.breakEven.status).toBe("INCOMPLETE_COST_COVERAGE");
    expect(summary.totals.breakEven.calculationBasis).toBe("COVERED_REVENUE");
    expect(summary.totals.breakEven.breakEvenRevenue).toBe(20000);
    expect(summary.breakEven.status).toBe("INCOMPLETE_COST_COVERAGE");
    expect(summary.breakEven.calculationBasis).toBe("COVERED_REVENUE");
    expect(summary.breakEven.breakEvenRevenue).toBe(20000);
  });
});
