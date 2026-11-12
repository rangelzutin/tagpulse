import { describe, expect, it } from "vitest";
import {
  calculateBreakEven,
  calculateDreMonthly,
  calculateDreSummary,
  type MonthlyCommercialTrend,
} from "../src/modules/financial/financial-dre-calculator.js";
import type { DreClassificationResult } from "../src/modules/financial/financial-dre-types.js";

describe("Financial DRE — Partial Cost Semantics & Coverage Guardrails", () => {
  it("Scenario 1 (100% cost coverage): standard calculation with full managerial result", () => {
    const commercialTrend: MonthlyCommercialTrend[] = [
      {
        month: "2026-05",
        realizedRevenue: 100000,
        estimatedCOGS: 40000,
        estimatedGrossProfit: 60000,
        grossMarginPercent: 60,
        costCoveragePercent: 100,
      },
    ];

    const records: DreClassificationResult[] = [
      {
        recordId: "1",
        sourceId: "s1",
        category: "VARIABLE_PAYMENT_FEE",
        baseAmount: 10000,
        referenceMonth: "2026-05",
        isDeductibleInDre: true,
      },
      {
        recordId: "2",
        sourceId: "s2",
        category: "OPERATING_ADMINISTRATIVE",
        baseAmount: 20000,
        referenceMonth: "2026-05",
        isDeductibleInDre: true,
      },
    ];

    const months = calculateDreMonthly(commercialTrend, records);
    expect(months[0].costCoveragePercent).toBe(100);
    expect(months[0].fullGrossProfitAvailable).toBe(true);
    expect(months[0].fullManagerialResultAvailable).toBe(true);
    expect(months[0].realizedRevenue).toBe(100000);
    expect(months[0].coveredRevenue).toBe(100000);
    expect(months[0].uncoveredRevenue).toBe(0);
    expect(months[0].estimatedGrossProfit).toBe(60000);
    expect(months[0].coveredGrossProfit).toBe(60000);
    expect(months[0].variableExpenses.total).toBe(10000);
    expect(months[0].coveredVariableExpenses).toBe(10000);
    expect(months[0].contributionMargin).toBe(50000);
    expect(months[0].coveredContributionMargin).toBe(50000);
    expect(months[0].netManagerialResult).toBe(30000);

    const summary = calculateDreSummary(months, { from: "2026-05-01", to: "2026-05-31" });
    expect(summary.totals.fullManagerialResultAvailable).toBe(true);
    expect(summary.totals.contributionMargin).toBe(50000);
    expect(summary.totals.netManagerialResult).toBe(30000);
    expect(summary.totals.breakEven?.status).toBe("PROFITABLE");
  });

  it("Scenario 2 (99% cost coverage): uncovered revenue is never credited as zero-cost margin", () => {
    const commercialTrend: MonthlyCommercialTrend[] = [
      {
        month: "2026-05",
        realizedRevenue: 100000,
        revenueWithCurrentCost: 99000,
        revenueWithoutCurrentCost: 1000,
        costCoveragePercent: 99,
        estimatedCOGS: 49500, // CMV da parcela coberta
        estimatedGrossProfit: 49500,
        grossMarginPercent: 49.5,
      },
    ];

    const records: DreClassificationResult[] = [
      {
        recordId: "1",
        sourceId: "s1",
        category: "VARIABLE_TAX_ON_REVENUE",
        baseAmount: 10000, // 10% sobre receita total
        referenceMonth: "2026-05",
        isDeductibleInDre: true,
      },
      {
        recordId: "2",
        sourceId: "s2",
        category: "OPERATING_ADMINISTRATIVE",
        baseAmount: 20000,
        referenceMonth: "2026-05",
        isDeductibleInDre: true,
      },
    ];

    const months = calculateDreMonthly(commercialTrend, records);
    const m = months[0];

    expect(m.fullManagerialResultAvailable).toBe(false);
    expect(m.coveredRevenue).toBe(99000);
    expect(m.uncoveredRevenue).toBe(1000);
    expect(m.costCoveragePercent).toBe(99);

    // coveredGrossProfit = 99.000 - 49.500 = 49.500
    expect(m.coveredGrossProfit).toBe(49500);

    // coveredVariableExpenses = 10.000 * 0.99 = 9.900
    expect(m.coveredVariableExpenses).toBe(9900);

    // coveredContributionMargin = 49.500 - 9.900 = 39.600
    expect(m.coveredContributionMargin).toBe(39600);

    // contributionMargin oficial deve refletir a margem coberta, NÃO somar R$ 1.000 como margem zero-cost
    expect(m.contributionMargin).toBe(39600);

    // netManagerialResult é null quando cobertura < 100%
    expect(m.netManagerialResult).toBeNull();

    // partialManagerialResultOnCoveredRevenue = 39.600 - 20.000 = 19.600
    expect(m.partialManagerialResultOnCoveredRevenue).toBe(19600);

    // Break-even provisório baseado na taxa coberta (39.600 / 99.000 = 0.40)
    expect(m.breakEven?.status).toBe("UNDETERMINED_PARTIAL_COST_COVERAGE");
    expect(m.breakEven?.contributionMarginRate).toBe(0.4);
    expect(m.breakEven?.provisionalBreakEvenRevenue).toBe(50000); // 20.000 / 0.4 = 50.000
    expect(m.breakEven?.provisionalGap).toBe(-49000); // 50.000 - 99.000 = -49.000 (superado)
  });

  it("Scenario 3 (50% cost coverage): proportional variables and safe guardrails", () => {
    const commercialTrend: MonthlyCommercialTrend[] = [
      {
        month: "2026-06",
        realizedRevenue: 80000,
        revenueWithCurrentCost: 40000,
        revenueWithoutCurrentCost: 40000,
        costCoveragePercent: 50,
        estimatedCOGS: 20000,
        estimatedGrossProfit: 20000,
        grossMarginPercent: 25,
      },
    ];

    const records: DreClassificationResult[] = [
      {
        recordId: "1",
        sourceId: "s1",
        category: "VARIABLE_PAYMENT_FEE",
        baseAmount: 8000,
        referenceMonth: "2026-06",
        isDeductibleInDre: true,
      },
      {
        recordId: "2",
        sourceId: "s2",
        category: "OPERATING_OCCUPANCY",
        baseAmount: 15000,
        referenceMonth: "2026-06",
        isDeductibleInDre: true,
      },
    ];

    const months = calculateDreMonthly(commercialTrend, records);
    const m = months[0];

    expect(m.coveredRevenue).toBe(40000);
    expect(m.uncoveredRevenue).toBe(40000);
    expect(m.costCoveragePercent).toBe(50);
    expect(m.coveredGrossProfit).toBe(20000);

    // 50% de 8.000 = 4.000
    expect(m.coveredVariableExpenses).toBe(4000);
    // coveredContributionMargin = 20.000 - 4.000 = 16.000
    expect(m.coveredContributionMargin).toBe(16000);
    expect(m.contributionMargin).toBe(16000);
    expect(m.fullManagerialResultAvailable).toBe(false);
    expect(m.netManagerialResult).toBeNull();

    // partialManagerialResult = 16.000 - 15.000 = 1.000
    expect(m.partialManagerialResultOnCoveredRevenue).toBe(1000);

    // summary
    const summary = calculateDreSummary(months, { from: "2026-06-01", to: "2026-06-30" });
    expect(summary.totals.costCoveragePercent).toBe(50);
    expect(summary.totals.coveredRevenue).toBe(40000);
    expect(summary.totals.uncoveredRevenue).toBe(40000);
    expect(summary.totals.coveredGrossProfit).toBe(20000);
    expect(summary.totals.coveredVariableExpenses).toBe(4000);
    expect(summary.totals.coveredContributionMargin).toBe(16000);
    expect(summary.totals.contributionMargin).toBe(16000);
    expect(summary.totals.fullManagerialResultAvailable).toBe(false);
    expect(summary.totals.netManagerialResult).toBeNull();
    expect(summary.totals.partialManagerialResultOnCoveredRevenue).toBe(1000);
  });

  it("Scenario 4 (0% cost coverage): no cost known, completely indeterminate margins", () => {
    const commercialTrend: MonthlyCommercialTrend[] = [
      {
        month: "2026-07",
        realizedRevenue: 50000,
        revenueWithCurrentCost: 0,
        revenueWithoutCurrentCost: 50000,
        costCoveragePercent: 0,
        estimatedCOGS: 0,
        estimatedGrossProfit: 0,
        grossMarginPercent: 0,
      },
    ];

    const records: DreClassificationResult[] = [
      {
        recordId: "1",
        sourceId: "s1",
        category: "OPERATING_SOFTWARE",
        baseAmount: 5000,
        referenceMonth: "2026-07",
        isDeductibleInDre: true,
      },
    ];

    const months = calculateDreMonthly(commercialTrend, records);
    const m = months[0];

    expect(m.coveredRevenue).toBe(0);
    expect(m.uncoveredRevenue).toBe(50000);
    expect(m.costCoveragePercent).toBe(0);
    expect(m.coveredGrossProfit).toBe(0);
    expect(m.coveredVariableExpenses).toBe(0);
    expect(m.coveredContributionMargin).toBe(0);
    expect(m.contributionMargin).toBe(0);
    expect(m.fullManagerialResultAvailable).toBe(false);
    expect(m.netManagerialResult).toBeNull();
    expect(m.partialManagerialResultOnCoveredRevenue).toBe(-5000);
    expect(m.breakEven?.status).toBe("UNDETERMINED_PARTIAL_COST_COVERAGE");
    expect(m.breakEven?.contributionMarginRate).toBeNull();
  });

  it("Scenario 5 (Canonical 2026 Reference Case): exact figures and non-zero-cost guarantee", () => {
    // Referência canônica exata de 2026:
    // TOTAL_REVENUE = 366.672,36
    // COVERED_REVENUE = 359.107,14
    // UNCOVERED_REVENUE = 7.565,22
    // KNOWN_CMV = 218.037,08
    // VARIABLE_EXPENSES = 34.947,88
    // OPERATING_EXPENSES = 145.379,48
    // FINANCIAL_RESULT = -1.853,84

    const commercialTrend: MonthlyCommercialTrend[] = [
      {
        month: "2026-01",
        realizedRevenue: 366672.36,
        revenueWithCurrentCost: 359107.14,
        revenueWithoutCurrentCost: 7565.22,
        costCoveragePercent: 97.94,
        estimatedCOGS: 218037.08,
        estimatedGrossProfit: 141070.06, // 359107.14 - 218037.08
        grossMarginPercent: 39.28,
      },
    ];

    const records: DreClassificationResult[] = [
      {
        recordId: "var1",
        sourceId: "s_var",
        category: "VARIABLE_PAYMENT_FEE",
        baseAmount: 34947.88,
        referenceMonth: "2026-01",
        isDeductibleInDre: true,
      },
      {
        recordId: "op1",
        sourceId: "s_op",
        category: "OPERATING_ADMINISTRATIVE",
        baseAmount: 145379.48,
        referenceMonth: "2026-01",
        isDeductibleInDre: true,
      },
      {
        recordId: "fin1",
        sourceId: "s_fin",
        category: "FINANCIAL_EXPENSE",
        baseAmount: 1853.84,
        referenceMonth: "2026-01",
        isDeductibleInDre: true,
      },
    ];

    const months = calculateDreMonthly(commercialTrend, records);
    const summary = calculateDreSummary(months, { from: "2026-01-01", to: "2026-10-31" });
    const tot = summary.totals;

    expect(tot.realizedRevenue).toBe(366672.36);
    expect(tot.coveredRevenue).toBe(359107.14);
    expect(tot.uncoveredRevenue).toBe(7565.22);
    expect(tot.costCoveragePercent).toBe(97.94);
    expect(tot.estimatedCOGS).toBe(218037.08);

    // 1. Lucro Bruto Coberto
    // 359.107,14 - 218.037,08 = 141.070,06
    expect(tot.coveredGrossProfit).toBe(141070.06);

    // 2. Despesas Variáveis Cobertas Proporcionais
    // 34.947,88 * (359.107,14 / 366.672,36) = 34.226,83
    expect(tot.coveredVariableExpenses).toBe(34226.83);

    // 3. Margem de Contribuição Coberta
    // 141.070,06 - 34.226,83 = 106.843,23
    expect(tot.coveredContributionMargin).toBe(106843.23);

    // 4. Margem de Contribuição Oficial (não inflada com receita descoberta)
    expect(tot.contributionMargin).toBe(106843.23);

    // Taxa de Margem de Contribuição Coberta: 106.843,23 / 359.107,14 = 29.75%
    expect(tot.contributionMarginPercent).toBe(29.75);

    // 5. Resultado Gerencial Final é NULL (cobertura incompleta)
    expect(tot.fullManagerialResultAvailable).toBe(false);
    expect(tot.netManagerialResult).toBeNull();

    // 6. Resultado Gerencial Parcial sobre Base Coberta
    // 106.843,23 - 145.379,48 - 1.853,84 = -40.390,09
    expect(tot.partialManagerialResultOnCoveredRevenue).toBe(-40390.09);

    // 7. Break-Even Provisório
    expect(tot.breakEven?.status).toBe("UNDETERMINED_PARTIAL_COST_COVERAGE");
    expect(tot.breakEven?.breakEvenRevenue).toBeNull(); // canônico permanece null para não enganar
    expect(tot.breakEven?.contributionMarginRate).toBe(0.2975);
    expect(tot.breakEven?.provisionalFixedCostBase).toBe(147233.32); // 145.379,48 - (-1.853,84)
    expect(tot.breakEven?.provisionalBreakEvenRevenue).toBe(494860.9); // 147.233,32 / (106.843,23 / 359.107,14)
    expect(tot.breakEven?.isProvisional).toBe(true);
  });
});

