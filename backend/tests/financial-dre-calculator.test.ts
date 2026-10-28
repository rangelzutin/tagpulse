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

  it("preserves exact canonical baseline contract (Phase 5C) deterministically without live db", () => {
    // Exact canonical baseline snapshot from Phase 5C (01/01/2026 - 13/10/2026)
    const canonicalTrend: MonthlyCommercialTrend[] = [
      {
        month: "2026-01",
        realizedRevenue: 322465.68,
        estimatedCOGS: 197277.62,
        estimatedGrossProfit: 125188.06,
        grossMarginPercent: 38.82,
      },
    ];

    const canonicalClassified: DreClassificationResult[] = [
      // Despesas Variáveis (Total: 32284.53)
      {
        recordId: "var-fee",
        sourceId: "s-fee",
        category: "VARIABLE_PAYMENT_FEE",
        baseAmount: 3213.5,
        referenceMonth: "2026-01",
        isDeductibleInDre: true,
      },
      {
        recordId: "var-tax",
        sourceId: "s-tax",
        category: "VARIABLE_TAX_ON_REVENUE",
        baseAmount: 15164.05,
        referenceMonth: "2026-01",
        isDeductibleInDre: true,
      },
      {
        recordId: "var-freight",
        sourceId: "s-freight",
        category: "VARIABLE_FREIGHT_LOGISTICS",
        baseAmount: 13906.98,
        referenceMonth: "2026-01",
        isDeductibleInDre: true,
      },
      // Despesas Operacionais (Total: 107833.95)
      {
        recordId: "op-pers",
        sourceId: "s-pers",
        category: "OPERATING_PERSONNEL",
        baseAmount: 4279.44,
        referenceMonth: "2026-01",
        isDeductibleInDre: true,
      },
      {
        recordId: "op-part",
        sourceId: "s-part",
        category: "OPERATING_PARTNER_COMPENSATION",
        baseAmount: 66000.0,
        referenceMonth: "2026-01",
        isDeductibleInDre: true,
      },
      {
        recordId: "op-mkt",
        sourceId: "s-mkt",
        category: "OPERATING_MARKETING",
        baseAmount: 18669.05,
        referenceMonth: "2026-01",
        isDeductibleInDre: true,
      },
      {
        recordId: "op-occ",
        sourceId: "s-occ",
        category: "OPERATING_OCCUPANCY",
        baseAmount: 4715.55,
        referenceMonth: "2026-01",
        isDeductibleInDre: true,
      },
      {
        recordId: "op-util",
        sourceId: "s-util",
        category: "OPERATING_UTILITIES",
        baseAmount: 1166.32,
        referenceMonth: "2026-01",
        isDeductibleInDre: true,
      },
      {
        recordId: "op-soft",
        sourceId: "s-soft",
        category: "OPERATING_SOFTWARE",
        baseAmount: 2448.88,
        referenceMonth: "2026-01",
        isDeductibleInDre: true,
      },
      {
        recordId: "op-acc",
        sourceId: "s-acc",
        category: "OPERATING_ACCOUNTING",
        baseAmount: 6293.76,
        referenceMonth: "2026-01",
        isDeductibleInDre: true,
      },
      {
        recordId: "op-infra",
        sourceId: "s-infra",
        category: "OPERATING_INFRASTRUCTURE",
        baseAmount: 1705.17,
        referenceMonth: "2026-01",
        isDeductibleInDre: true,
      },
      {
        recordId: "op-admin",
        sourceId: "s-admin",
        category: "OPERATING_ADMINISTRATIVE",
        baseAmount: 2425.78,
        referenceMonth: "2026-01",
        isDeductibleInDre: true,
      },
      {
        recordId: "op-other",
        sourceId: "s-other",
        category: "OPERATING_OTHER",
        baseAmount: 130.0,
        referenceMonth: "2026-01",
        isDeductibleInDre: true,
      },
      // Resultado Financeiro (Total: -1446.32)
      {
        recordId: "fin-inc",
        sourceId: "s-finc",
        category: "FINANCIAL_INCOME",
        baseAmount: 60.37,
        referenceMonth: "2026-01",
        isDeductibleInDre: true,
      },
      {
        recordId: "fin-exp",
        sourceId: "s-fexp",
        category: "FINANCIAL_EXPENSE",
        baseAmount: 1506.69,
        referenceMonth: "2026-01",
        isDeductibleInDre: true,
      },
      // Registro não-DRE para testar que não interfere
      {
        recordId: "inv-non-dre",
        sourceId: "s-inv",
        category: "INVENTORY_PURCHASE",
        baseAmount: 50000.0,
        referenceMonth: "2026-01",
        isDeductibleInDre: false,
      },
    ];

    const months = calculateDreMonthly(canonicalTrend, canonicalClassified, {
      period: { from: "2026-01-01", to: "2026-10-13" },
    });
    const summary = calculateDreSummary(months, { from: "2026-01-01", to: "2026-10-13" });

    // Contrato canônico estrito da Fase 5C:
    expect(summary.totals.realizedRevenue).toBe(322465.68);
    expect(summary.totals.estimatedCOGS).toBe(197277.62);
    expect(summary.totals.estimatedGrossProfit).toBe(125188.06);
    expect(summary.totals.estimatedGrossMarginPercent).toBe(38.82);

    expect(summary.totals.variableExpenses.paymentFees).toBe(3213.5);
    expect(summary.totals.variableExpenses.taxesOnRevenue).toBe(15164.05);
    expect(summary.totals.variableExpenses.freightLogistics).toBe(13906.98);
    expect(summary.totals.variableExpenses.total).toBe(32284.53);

    expect(summary.totals.contributionMargin).toBe(92903.53);
    expect(summary.totals.contributionMarginPercent).toBe(28.81);

    expect(summary.totals.operatingExpenses.total).toBe(107833.95);
    expect(summary.totals.operatingExpenses.personnel).toBe(4279.44);
    expect(summary.totals.operatingExpenses.partnerCompensation).toBe(66000.0);
    expect(summary.totals.operatingExpenses.marketing).toBe(18669.05);
    expect(summary.totals.operatingExpenses.occupancy).toBe(4715.55);
    expect(summary.totals.operatingExpenses.utilities).toBe(1166.32);
    expect(summary.totals.operatingExpenses.software).toBe(2448.88);
    expect(summary.totals.operatingExpenses.accounting).toBe(6293.76);
    expect(summary.totals.operatingExpenses.infrastructure).toBe(1705.17);
    expect(summary.totals.operatingExpenses.administrative).toBe(2425.78);
    expect(summary.totals.operatingExpenses.other).toBe(130.0);

    expect(summary.totals.financialResult.financialIncome).toBe(60.37);
    expect(summary.totals.financialResult.financialExpenses).toBe(1506.69);
    expect(summary.totals.financialResult.total).toBe(-1446.32);
    expect(summary.totals.otherResult.total).toBe(0.0);

    expect(summary.totals.netManagerialResult).toBe(-16376.74);
    expect(summary.totals.netManagerialMarginPercent).toBe(-5.08);
    expect(summary.totals.status).toBe("LOSS");
  });

  it("preserves exact canonical temporal quality contract (Phase 5C) deterministically without live db", () => {
    // Reference date set to mid-October 2026 (matching Phase 5C cutoff 2026-10-13)
    const refDate = new Date("2026-10-13T23:59:59Z");

    const monthsTrend: MonthlyCommercialTrend[] = [
      { month: "2026-08", realizedRevenue: 30000, estimatedCOGS: 18000, estimatedGrossProfit: 12000, grossMarginPercent: 40 },
      { month: "2026-09", realizedRevenue: 30000, estimatedCOGS: 18000, estimatedGrossProfit: 12000, grossMarginPercent: 40 },
      { month: "2026-10", realizedRevenue: 30000, estimatedCOGS: 18000, estimatedGrossProfit: 12000, grossMarginPercent: 40 },
    ];

    // August has both DAS and GPS -> financiallyClosed
    // September is in the past relative to refDate but missing DAS and GPS -> provisional with pendingAccruals
    // October is in-progress relative to refDate and missing DAS and GPS -> provisional with pendingAccruals
    const records: DreClassificationResult[] = [
      {
        recordId: "aug-das",
        sourceId: "s-aug-das",
        category: "VARIABLE_TAX_ON_REVENUE",
        baseAmount: 1500,
        notes: "DAS Simples Nacional",
        referenceMonth: "2026-08",
        isDeductibleInDre: true,
      },
      {
        recordId: "aug-gps",
        sourceId: "s-aug-gps",
        category: "OPERATING_PERSONNEL",
        baseAmount: 534.93,
        notes: "GPS INSS",
        referenceMonth: "2026-08",
        isDeductibleInDre: true,
      },
    ];

    const months = calculateDreMonthly(monthsTrend, records, {
      referenceDate: refDate,
      period: { from: "2026-08-01", to: "2026-10-13" },
    });
    const summary = calculateDreSummary(months, { from: "2026-08-01", to: "2026-10-13" });

    // August is financially closed
    const aug = summary.months.find((m) => m.month === "2026-08")!;
    expect(aug.dataQuality.financiallyClosed).toBe(true);
    expect(aug.dataQuality.isProvisional).toBe(false);
    expect(aug.dataQuality.pendingAccruals).toHaveLength(0);

    // September is provisional with pending accruals (DAS and GPS)
    const sep = summary.months.find((m) => m.month === "2026-09")!;
    expect(sep.dataQuality.financiallyClosed).toBe(false);
    expect(sep.dataQuality.isProvisional).toBe(true);
    expect(sep.dataQuality.pendingAccruals).toContain("VARIABLE_TAX_ON_REVENUE");
    expect(sep.dataQuality.pendingAccruals).toContain("OPERATING_PERSONNEL");

    // October is provisional with pending accruals (DAS and GPS)
    const oct = summary.months.find((m) => m.month === "2026-10")!;
    expect(oct.dataQuality.financiallyClosed).toBe(false);
    expect(oct.dataQuality.isProvisional).toBe(true);
    expect(oct.dataQuality.pendingAccruals).toContain("VARIABLE_TAX_ON_REVENUE");
    expect(oct.dataQuality.pendingAccruals).toContain("OPERATING_PERSONNEL");

    // Summary lastClosedMonth is exactly 2026-08
    expect(summary.lastClosedMonth).toBe("2026-08");
  });

  it("regression: ensures partner compensation is preserved across August, September (3 x 2000 = 6000), and October", () => {
    const commercialTrend: MonthlyCommercialTrend[] = [
      {
        month: "2026-08",
        realizedRevenue: 35000,
        estimatedCOGS: 20000,
        estimatedGrossProfit: 15000,
        grossMarginPercent: 42.86,
      },
      {
        month: "2026-09",
        realizedRevenue: 39137.44,
        estimatedCOGS: 23365.58,
        estimatedGrossProfit: 15771.86,
        grossMarginPercent: 40.3,
      },
      {
        month: "2026-10",
        realizedRevenue: 28000,
        estimatedCOGS: 16000,
        estimatedGrossProfit: 12000,
        grossMarginPercent: 42.86,
      },
    ];

    const records: DreClassificationResult[] = [
      // Agosto/2026: 3 retiradas de 2.000 = 6.000
      {
        recordId: "rec-aug-1",
        sourceId: "11251",
        category: "OPERATING_PARTNER_COMPENSATION",
        baseAmount: 2000,
        referenceMonth: "2026-08",
        competenceDate: new Date("2026-08-10T00:00:00Z"),
        isDeductibleInDre: true,
      },
      {
        recordId: "rec-aug-2",
        sourceId: "11252",
        category: "OPERATING_PARTNER_COMPENSATION",
        baseAmount: 2000,
        referenceMonth: "2026-08",
        competenceDate: new Date("2026-08-10T00:00:00Z"),
        isDeductibleInDre: true,
      },
      {
        recordId: "rec-aug-3",
        sourceId: "11253",
        category: "OPERATING_PARTNER_COMPENSATION",
        baseAmount: 2000,
        referenceMonth: "2026-08",
        competenceDate: new Date("2026-08-10T00:00:00Z"),
        isDeductibleInDre: true,
      },
      // Setembro/2026: 3 retiradas de 2.000 = 6.000 (Mario: 11491, Rangel: 11492, Andre: 11493)
      {
        recordId: "rec-sep-1",
        sourceId: "11491",
        category: "OPERATING_PARTNER_COMPENSATION",
        baseAmount: 2000,
        referenceMonth: "2026-09",
        competenceDate: new Date("2026-09-10T00:00:00Z"),
        isDeductibleInDre: true,
      },
      {
        recordId: "rec-sep-2",
        sourceId: "11492",
        category: "OPERATING_PARTNER_COMPENSATION",
        baseAmount: 2000,
        referenceMonth: "2026-09",
        competenceDate: new Date("2026-09-10T00:00:00Z"),
        isDeductibleInDre: true,
      },
      {
        recordId: "rec-sep-3",
        sourceId: "11493",
        category: "OPERATING_PARTNER_COMPENSATION",
        baseAmount: 2000,
        referenceMonth: "2026-09",
        competenceDate: new Date("2026-09-10T00:00:00Z"),
        isDeductibleInDre: true,
      },
      // Outubro/2026: 3 retiradas de 2.000 = 6.000
      {
        recordId: "rec-oct-1",
        sourceId: "11494",
        category: "OPERATING_PARTNER_COMPENSATION",
        baseAmount: 2000,
        referenceMonth: "2026-10",
        competenceDate: new Date("2026-10-10T00:00:00Z"),
        isDeductibleInDre: true,
      },
      {
        recordId: "rec-oct-2",
        sourceId: "11495",
        category: "OPERATING_PARTNER_COMPENSATION",
        baseAmount: 2000,
        referenceMonth: "2026-10",
        competenceDate: new Date("2026-10-10T00:00:00Z"),
        isDeductibleInDre: true,
      },
      {
        recordId: "rec-oct-3",
        sourceId: "11496",
        category: "OPERATING_PARTNER_COMPENSATION",
        baseAmount: 2000,
        referenceMonth: "2026-10",
        competenceDate: new Date("2026-10-10T00:00:00Z"),
        isDeductibleInDre: true,
      },
    ];

    const monthlyItems = calculateDreMonthly(commercialTrend, records, {
      period: { from: "2026-08-01", to: "2026-10-31" },
    });

    const aug = monthlyItems.find((m) => m.month === "2026-08")!;
    const sep = monthlyItems.find((m) => m.month === "2026-09")!;
    const oct = monthlyItems.find((m) => m.month === "2026-10")!;

    // 1. Agosto: pró-labore presente
    expect(aug).toBeDefined();
    expect(aug.operatingExpenses.partnerCompensation).toBe(6000);

    // 2. Setembro: 3 x R$ 2.000 = R$ 6.000
    expect(sep).toBeDefined();
    expect(sep.operatingExpenses.partnerCompensation).toBe(6000);

    // 3. Outubro: pró-labore presente
    expect(oct).toBeDefined();
    expect(oct.operatingExpenses.partnerCompensation).toBe(6000);

    // 4. Setembro summary = monthly["2026-09"]
    const sepMonthlyOnly = calculateDreMonthly(commercialTrend, records, {
      period: { from: "2026-09-01", to: "2026-09-30" },
      fromDate: new Date("2026-09-01T00:00:00.000Z"),
      toExclusiveDate: new Date("2026-10-01T00:00:00.000Z"),
    });
    const summarySep = calculateDreSummary(sepMonthlyOnly, {
      from: "2026-09-01",
      to: "2026-09-30",
    });

    expect(summarySep.totals.operatingExpenses.partnerCompensation).toBe(6000);
    expect(summarySep.totals.operatingExpenses.partnerCompensation).toBe(sep.operatingExpenses.partnerCompensation);
    expect(summarySep.totals.operatingExpenses.total).toBe(sep.operatingExpenses.total);
    expect(summarySep.totals.netManagerialResult).toBe(sep.netManagerialResult);
    expect(summarySep.totals.status).toBe(sep.status);
  });
});
