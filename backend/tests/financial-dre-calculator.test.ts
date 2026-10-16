import { describe, expect, it } from "vitest";
import {
  calculateDreBreakdown,
  calculateDreMonthly,
  calculateDreSummary,
  type MonthlyCommercialTrend,
} from "../src/modules/financial/financial-dre-calculator.js";
import type { DreClassificationResult } from "../src/modules/financial/financial-dre-types.js";

describe("Financial DRE Calculator", () => {
  const sampleTrend: MonthlyCommercialTrend[] = [
    {
      month: "2026-01",
      realizedRevenue: 50000,
      estimatedCOGS: 30000,
      estimatedGrossProfit: 20000,
      grossMarginPercent: 40,
    },
    {
      month: "2026-02",
      realizedRevenue: 10000,
      estimatedCOGS: 6000,
      estimatedGrossProfit: 4000,
      grossMarginPercent: 40,
    },
  ];

  const sampleClassified: DreClassificationResult[] = [
    // Jan
    {
      recordId: "r-1",
      sourceId: "s-1",
      category: "VARIABLE_PAYMENT_FEE",
      baseAmount: 500,
      referenceMonth: "2026-01",
      isDeductibleInDre: true,
    },
    {
      recordId: "r-2",
      sourceId: "s-2",
      category: "VARIABLE_TAX_ON_REVENUE",
      baseAmount: 2000,
      referenceMonth: "2026-01",
      notes: "DAS Simples Nacional",
      isDeductibleInDre: true,
    },
    {
      recordId: "r-3",
      sourceId: "s-3",
      category: "OPERATING_PERSONNEL",
      baseAmount: 534.93,
      referenceMonth: "2026-01",
      notes: "GPS INSS",
      isDeductibleInDre: true,
    },
    {
      recordId: "r-4",
      sourceId: "s-4",
      category: "OPERATING_PARTNER_COMPENSATION",
      baseAmount: 6600,
      referenceMonth: "2026-01",
      isDeductibleInDre: true,
    },
    // Fev (missing DAS to test pendingAccruals)
    {
      recordId: "r-5",
      sourceId: "s-5",
      category: "OPERATING_PERSONNEL",
      baseAmount: 534.93,
      referenceMonth: "2026-02",
      notes: "GPS INSS",
      isDeductibleInDre: true,
    },
    // Inventory purchase (must not affect DRE)
    {
      recordId: "r-6",
      sourceId: "s-6",
      category: "INVENTORY_PURCHASE",
      baseAmount: 15000,
      referenceMonth: "2026-01",
      isDeductibleInDre: false,
    },
  ];

  it("calculates mathematical invariants for monthly items", () => {
    // Reference date set to April 2026 (both Jan and Feb are in the past)
    const refDate = new Date("2026-04-01T00:00:00Z");
    const months = calculateDreMonthly(sampleTrend, sampleClassified, { referenceDate: refDate });

    expect(months).toHaveLength(2);

    for (const m of months) {
      // Invariant 1: Revenue - COGS = Gross Profit
      expect(Math.round((m.realizedRevenue - m.estimatedCOGS - m.estimatedGrossProfit) * 100)).toBe(0);

      // Invariant 2: Gross - Var = Contribution Margin
      expect(Math.round((m.estimatedGrossProfit - m.variableExpenses.total - m.contributionMargin) * 100)).toBe(0);

      // Invariant 3: CM - Op + Fin = Net Result
      const expectedNet = m.contributionMargin - m.operatingExpenses.total + m.financialResult.total;
      expect(Math.round((expectedNet - m.netManagerialResult) * 100)).toBe(0);
    }
  });

  it("evaluates quality correctly: Jan is financiallyClosed, Feb has pendingAccrual", () => {
    const refDate = new Date("2026-04-01T00:00:00Z");
    const months = calculateDreMonthly(sampleTrend, sampleClassified, { referenceDate: refDate });

    const jan = months.find((m) => m.month === "2026-01")!;
    expect(jan.dataQuality.financiallyClosed).toBe(true);
    expect(jan.dataQuality.isProvisional).toBe(false);
    expect(jan.dataQuality.pendingAccruals).toHaveLength(0);

    const fev = months.find((m) => m.month === "2026-02")!;
    expect(fev.dataQuality.financiallyClosed).toBe(false);
    expect(fev.dataQuality.isProvisional).toBe(true);
    expect(fev.dataQuality.pendingAccruals).toContain("VARIABLE_TAX_ON_REVENUE");
  });

  it("keeps economic status independent from temporal quality", () => {
    const refDate = new Date("2026-04-01T00:00:00Z");
    const months = calculateDreMonthly(sampleTrend, sampleClassified, { referenceDate: refDate });

    const jan = months.find((m) => m.month === "2026-01")!;
    expect(jan.status).toBe("PROFIT");

    const fev = months.find((m) => m.month === "2026-02")!;
    // In Feb: Gross 4000, Op 534.93 -> Net 3465.07 > 0
    expect(fev.status).toBe("PROFIT");
    // Even though it is provisional!
    expect(fev.dataQuality.isProvisional).toBe(true);
  });

  it("evaluates current partial month as provisional", () => {
    // If refDate is in Jan/2026, Jan is in progress
    const refDate = new Date("2026-01-15T00:00:00Z");
    const months = calculateDreMonthly(sampleTrend, sampleClassified, { referenceDate: refDate });

    const jan = months.find((m) => m.month === "2026-01")!;
    expect(jan.dataQuality.isProvisional).toBe(true);
    expect(jan.dataQuality.financiallyClosed).toBe(false);
  });

  it("recalculates summary margins accurately over totals without simple average", () => {
    const refDate = new Date("2026-04-01T00:00:00Z");
    const months = calculateDreMonthly(sampleTrend, sampleClassified, { referenceDate: refDate });
    const summary = calculateDreSummary(months, { from: "2026-01-01", to: "2026-02-28" });

    // Total Revenue: 60000, Total Gross: 24000 -> 40%
    expect(summary.totals.realizedRevenue).toBe(60000);
    expect(summary.totals.estimatedGrossProfit).toBe(24000);
    expect(summary.totals.estimatedGrossMarginPercent).toBe(40);

    // Sum of months matches summary totals with 0,00 diff
    const sumNetMonths = months.reduce((acc, m) => acc + m.netManagerialResult, 0);
    expect(Math.round((sumNetMonths - summary.totals.netManagerialResult) * 100)).toBe(0);

    expect(summary.lastClosedMonth).toBe("2026-01");
  });

  it("excludes INVENTORY_PURCHASE from DRE breakdown and reconciles categories", () => {
    const breakdown = calculateDreBreakdown(
      sampleClassified,
      { from: "2026-01-01", to: "2026-02-28" },
      60000,
    );

    const invCategory = breakdown.categories.find((c) => c.economicCategory === "INVENTORY_PURCHASE");
    expect(invCategory?.group).toBe("NON_DRE");

    const paymentFeeCat = breakdown.categories.find((c) => c.economicCategory === "VARIABLE_PAYMENT_FEE");
    expect(paymentFeeCat?.amount).toBe(500);
    expect(paymentFeeCat?.group).toBe("VARIABLE_EXPENSE");
  });

  it("strictly enforces operating expense cutoff for partial periods", () => {
    // Expense A: effectiveCompetenceDate = 2026-10-10, R$ 100
    // Expense B: effectiveCompetenceDate = 2026-10-20, R$ 200
    const records: DreClassificationResult[] = [
      {
        recordId: "exp-a",
        sourceId: "sa",
        category: "OPERATING_ADMINISTRATIVE",
        baseAmount: 100,
        competenceDate: new Date("2026-10-10T00:00:00Z"),
        referenceMonth: "2026-10",
        isDeductibleInDre: true,
      },
      {
        recordId: "exp-b",
        sourceId: "sb",
        category: "OPERATING_ADMINISTRATIVE",
        baseAmount: 200,
        competenceDate: new Date("2026-10-20T00:00:00Z"),
        referenceMonth: "2026-10",
        isDeductibleInDre: true,
      },
    ];

    // Consulta 1: from=2026-10-01 to=2026-10-13 -> OpEx = 100
    const mCutoff = calculateDreMonthly([], records, {
      period: { from: "2026-10-01", to: "2026-10-13" },
      fromDate: new Date("2026-10-01T00:00:00Z"),
      toExclusiveDate: new Date("2026-10-14T00:00:00Z"),
    });
    const sCutoff = calculateDreSummary(mCutoff, { from: "2026-10-01", to: "2026-10-13" });
    expect(sCutoff.totals.operatingExpenses.total).toBe(100);

    // Consulta 2: from=2026-10-01 to=2026-10-31 -> OpEx = 300
    const mFull = calculateDreMonthly([], records, {
      period: { from: "2026-10-01", to: "2026-10-31" },
      fromDate: new Date("2026-10-01T00:00:00Z"),
      toExclusiveDate: new Date("2026-11-01T00:00:00Z"),
    });
    const sFull = calculateDreSummary(mFull, { from: "2026-10-01", to: "2026-10-31" });
    expect(sFull.totals.operatingExpenses.total).toBe(300);
  });

  it("strictly enforces financial result cutoff by confirmationDate for partial periods", () => {
    const records: DreClassificationResult[] = [
      {
        recordId: "fin-inc-1",
        sourceId: "fi1",
        category: "FINANCIAL_INCOME",
        baseAmount: 50,
        competenceDate: new Date("2026-10-05T00:00:00Z"),
        referenceMonth: "2026-10",
        isDeductibleInDre: true,
      },
      {
        recordId: "fin-inc-2",
        sourceId: "fi2",
        category: "FINANCIAL_INCOME",
        baseAmount: 80,
        competenceDate: new Date("2026-10-25T00:00:00Z"),
        referenceMonth: "2026-10",
        isDeductibleInDre: true,
      },
      {
        recordId: "fin-exp-1",
        sourceId: "fe1",
        category: "FINANCIAL_EXPENSE",
        baseAmount: 30,
        competenceDate: new Date("2026-10-08T00:00:00Z"),
        referenceMonth: "2026-10",
        isDeductibleInDre: true,
      },
      {
        recordId: "fin-exp-2",
        sourceId: "fe2",
        category: "FINANCIAL_EXPENSE",
        baseAmount: 40,
        competenceDate: new Date("2026-10-22T00:00:00Z"),
        referenceMonth: "2026-10",
        isDeductibleInDre: true,
      },
    ];

    // Cutoff on 2026-10-13 excludes events confirmed after 13/10
    const mCutoff = calculateDreMonthly([], records, {
      period: { from: "2026-10-01", to: "2026-10-13" },
      fromDate: new Date("2026-10-01T00:00:00Z"),
      toExclusiveDate: new Date("2026-10-14T00:00:00Z"),
    });
    const sCutoff = calculateDreSummary(mCutoff, { from: "2026-10-01", to: "2026-10-13" });
    expect(sCutoff.totals.financialResult.financialIncome).toBe(50);
    expect(sCutoff.totals.financialResult.financialExpenses).toBe(30);
    expect(sCutoff.totals.financialResult.total).toBe(20);

    // Full month includes both
    const mFull = calculateDreMonthly([], records, {
      period: { from: "2026-10-01", to: "2026-10-31" },
      fromDate: new Date("2026-10-01T00:00:00Z"),
      toExclusiveDate: new Date("2026-11-01T00:00:00Z"),
    });
    const sFull = calculateDreSummary(mFull, { from: "2026-10-01", to: "2026-10-31" });
    expect(sFull.totals.financialResult.financialIncome).toBe(130);
    expect(sFull.totals.financialResult.financialExpenses).toBe(70);
    expect(sFull.totals.financialResult.total).toBe(60);
  });
});
