import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { FinancialDreBreakEvenSection } from "./FinancialDreBreakEvenSection";
import {
  calculateBreakEven,
  formatMonthlyBreakEvenTooltip,
  DRE_BREAK_EVEN_HELP_TEXT,
  DRE_BREAK_EVEN_UNVIABLE_TITLE,
  DRE_BREAK_EVEN_UNVIABLE_MESSAGE,
  DRE_BREAK_EVEN_INCOMPLETE_TITLE,
  DRE_BREAK_EVEN_INCOMPLETE_MESSAGE,
} from "./dreBreakEvenHelper";
import { formatCurrency } from "../../utils/formatters";
import type { DreSummaryTotalsDto } from "../../api/financial";

describe("FinancialDreBreakEven — Frontend Components & Calculation", () => {
  const createMockTotals = (
    realizedRevenue: number,
    contributionMargin: number,
    netManagerialResult: number | null,
    options?: {
      costCoveragePercent?: number;
      fullManagerialResultAvailable?: boolean;
      coveredRevenue?: number;
      coveredContributionMargin?: number;
      partialManagerialResultOnCoveredRevenue?: number;
    },
  ): DreSummaryTotalsDto => ({
    realizedRevenue,
    estimatedCOGS: realizedRevenue * 0.5,
    estimatedGrossProfit: realizedRevenue * 0.5,
    estimatedGrossMarginPercent: 50,
    coveredRevenue: options?.coveredRevenue ?? realizedRevenue,
    uncoveredRevenue: realizedRevenue - (options?.coveredRevenue ?? realizedRevenue),
    costCoveragePercent: options?.costCoveragePercent ?? 100,
    coveredGrossProfit: options?.coveredRevenue !== undefined ? options.coveredRevenue * 0.5 : realizedRevenue * 0.5,
    coveredGrossMarginPercent: 50,
    coveredContributionMargin: options?.coveredContributionMargin,
    fullGrossProfitAvailable: options?.fullManagerialResultAvailable ?? (netManagerialResult !== null),
    fullManagerialResultAvailable: options?.fullManagerialResultAvailable ?? (netManagerialResult !== null),
    partialManagerialResultOnCoveredRevenue: options?.partialManagerialResultOnCoveredRevenue,
    variableExpenses: {
      paymentFees: 0,
      taxesOnRevenue: 0,
      freightLogistics: 0,
      salesCommissions: 0,
      other: 0,
      total: realizedRevenue * 0.5 - contributionMargin,
    },
    contributionMargin,
    contributionMarginPercent:
      realizedRevenue > 0 ? (contributionMargin / realizedRevenue) * 100 : null,
    operatingExpenses: {
      personnel: 0,
      partnerCompensation: 0,
      marketing: 0,
      occupancy: 0,
      utilities: 0,
      software: 0,
      accounting: 0,
      infrastructure: 0,
      administrative: 0,
      other: 0,
      total: netManagerialResult !== null ? contributionMargin - netManagerialResult : 0,
    },
    financialResult: { financialIncome: 0, financialExpenses: 0, total: 0 },
    otherResult: { otherIncome: 0, otherExpenses: 0, total: 0 },
    netManagerialResult,
    netManagerialMarginPercent:
      netManagerialResult !== null && realizedRevenue > 0
        ? (netManagerialResult / realizedRevenue) * 100
        : null,
    status:
      netManagerialResult !== null
        ? netManagerialResult > 0
          ? "PROFIT"
          : netManagerialResult < 0
          ? "LOSS"
          : "BREAK_EVEN"
        : "BREAK_EVEN",
    breakEven: calculateBreakEven(
      realizedRevenue,
      contributionMargin,
      netManagerialResult,
      {
        fullManagerialResultAvailable: options?.fullManagerialResultAvailable,
        costCoveragePercent: options?.costCoveragePercent,
        coveredRevenue: options?.coveredRevenue,
        coveredContributionMargin: options?.coveredContributionMargin,
        partialManagerialResult: options?.partialManagerialResultOnCoveredRevenue,
      },
    ),
  });

  it("1. renders break-even section with 3 main metrics for negative net result (BELOW_BREAK_EVEN)", () => {
    // Example 1: Rev 100k, CM 40k, Net -20k -> Break-even 150k, Gap 50k, +50.0%
    const totals = createMockTotals(100000, 40000, -20000);
    const html = renderToString(
      React.createElement(FinancialDreBreakEvenSection, { totals }),
    );

    expect(html).toContain('data-testid="dre-breakeven-section"');
    expect(html).toContain("Ponto de equilíbrio");

    // Cards
    expect(html).toContain("Faturamento de equilíbrio");
    expect(html).toContain(formatCurrency(150000));

    expect(html).toContain("Gap para equilíbrio");
    expect(html).toContain(formatCurrency(50000));

    expect(html).toContain("Aumento necessário");
    expect(html).toContain("+50,0%");

    // Status badge
    expect(html).toContain("Abaixo do equilíbrio");

    // Context strip
    expect(html).toContain('data-testid="dre-breakeven-context"');
    expect(html).toContain(formatCurrency(100000));
    expect(html).toContain("40,0%");
    expect(html).toContain(formatCurrency(-20000));
  });

  it("2. renders positive net result with Gap R$ 0,00 and superado status (ABOVE_BREAK_EVEN)", () => {
    // Rev 100k, CM 40k, Net +10k -> Above break even
    const totals = createMockTotals(100000, 40000, 10000);
    const html = renderToString(
      React.createElement(FinancialDreBreakEvenSection, { totals }),
    );

    expect(html).toContain(formatCurrency(0));
    expect(html).toContain("0,0%");
    expect(html).toContain("Ponto de equilíbrio superado");
    expect(html).toContain("Empresa acima do ponto de equilíbrio");
  });

  it("3. renders informative state when contribution margin is <= 0 (UNVIABLE_MARGIN)", () => {
    // Rev 100k, CM -5k, Net -30k -> Unviable margin
    const totals = createMockTotals(100000, -5000, -30000);
    const html = renderToString(
      React.createElement(FinancialDreBreakEvenSection, { totals }),
    );

    expect(html).toContain('data-testid="dre-breakeven-unviable-card"');
    expect(html).toContain(DRE_BREAK_EVEN_UNVIABLE_TITLE);
    expect(html).toContain(DRE_BREAK_EVEN_UNVIABLE_MESSAGE);
    expect(html).toContain("Margem insuficiente");
  });

  it("4. renders informative state when revenue is zero (NO_REVENUE)", () => {
    const totals = createMockTotals(0, 0, -5000);
    const html = renderToString(
      React.createElement(FinancialDreBreakEvenSection, { totals }),
    );

    expect(html).toContain('data-testid="dre-breakeven-norevenue-card"');
    expect(html).toContain("Sem faturamento no período");
  });

  it("5. includes title attribute with executive explanation on help button", () => {
    const totals = createMockTotals(100000, 40000, -20000);
    const html = renderToString(
      React.createElement(FinancialDreBreakEvenSection, { totals }),
    );

    expect(html).toContain('aria-label="Mais informações sobre ponto de equilíbrio"');
    expect(html).toContain(DRE_BREAK_EVEN_HELP_TEXT);
  });

  it("6. formatMonthlyBreakEvenTooltip produces exact expected narrative for charts", () => {
    // Negative month
    const below = calculateBreakEven(50000, 25000, -10000);
    const belowText = formatMonthlyBreakEvenTooltip(below, formatCurrency);
    expect(belowText).toBe(
      `Faltou faturar aproximadamente ${formatCurrency(20000)} para atingir o equilíbrio.`,
    );

    // Positive month
    const above = calculateBreakEven(50000, 25000, 5000);
    const aboveText = formatMonthlyBreakEvenTooltip(above, formatCurrency);
    expect(aboveText).toBe("Ponto de equilíbrio superado.");

    // Unviable margin
    const unviable = calculateBreakEven(50000, -1000, -15000);
    const unviableText = formatMonthlyBreakEvenTooltip(unviable, formatCurrency);
    expect(unviableText).toBe(
      "Margem insuficiente para estimar equilíbrio por aumento de vendas.",
    );

    // Incomplete cost coverage
    const incomplete = calculateBreakEven(50000, 25000, null);
    const incompleteText = formatMonthlyBreakEvenTooltip(incomplete, formatCurrency);
    expect(incompleteText).toBe("Cobertura de custos parcial: equilíbrio indisponível.");

    // No revenue
    const noRev = calculateBreakEven(0, 0, 0);
    const noRevText = formatMonthlyBreakEvenTooltip(noRev, formatCurrency);
    expect(noRevText).toBeNull();
  });

  it("7. renders informative state when cost coverage is incomplete (INCOMPLETE_COST_COVERAGE)", () => {
    const totals = createMockTotals(100000, 40000, null, {
      costCoveragePercent: 55.4,
      fullManagerialResultAvailable: false,
    });
    const html = renderToString(
      React.createElement(FinancialDreBreakEvenSection, { totals }),
    );

    expect(html).toContain('data-testid="dre-breakeven-incomplete-card"');
    expect(html).toContain(DRE_BREAK_EVEN_INCOMPLETE_TITLE);
    expect(html).toContain(DRE_BREAK_EVEN_INCOMPLETE_MESSAGE);
    expect(html).toContain("Cobertura parcial de custos");
    expect(html).toContain("55,4%");
  });

  it("8. renders provisional break-even on covered revenue when cost coverage is partial (costCoveragePercent < 100%)", () => {
    // DEV real values: Realized 236,046.97, Covered 228,481.75, Covered CM 63,444.28, Partial Net -34,025.79, Coverage 96.8%
    const totals = createMockTotals(236046.97, 65000, null, {
      costCoveragePercent: 96.8,
      fullManagerialResultAvailable: false,
      coveredRevenue: 228481.75,
      coveredContributionMargin: 63444.28,
      partialManagerialResultOnCoveredRevenue: -34025.79,
    });
    const html = renderToString(
      React.createElement(FinancialDreBreakEvenSection, {
        totals,
        dataQuality: { isProvisional: true, pendingAccruals: ["VARIABLE_TAX_ON_REVENUE"] },
      }),
    );

    // Cards should NOT be blocked
    expect(html).toContain('data-testid="dre-breakeven-card-main"');
    expect(html).toContain("Faturamento de equilíbrio estimado");
    expect(html).toContain(formatCurrency(351018.75));

    expect(html).toContain('data-testid="dre-breakeven-card-gap"');
    expect(html).toContain(formatCurrency(122537.0));

    expect(html).toContain('data-testid="dre-breakeven-card-percent"');
    expect(html).toContain("+53,6%");

    // Provisional Callout Banner
    expect(html).toContain('data-testid="dre-breakeven-provisional-callout"');
    expect(html).toContain("Cálculo provisório baseado na parcela da receita com cobertura de custos");
    expect(html).toContain("Faturamento realizado total:");
    expect(html).toContain(formatCurrency(236046.97));
    expect(html).toContain("Considerado no cálculo:");
    expect(html).toContain(formatCurrency(228481.75));
    expect(html).toContain("96,8%");

    // Status badge
    expect(html).toContain("Provisório (cobertura 96,8%)");
  });

  it("9. formatMonthlyBreakEvenTooltip provides provisional narrative for covered revenue", () => {
    // Loss on covered revenue
    const beLoss = calculateBreakEven(100000, 40000, null, {
      fullManagerialResultAvailable: false,
      costCoveragePercent: 80,
      coveredRevenue: 80000,
      coveredContributionMargin: 40000,
      partialManagerialResult: -20000,
      isProvisional: true,
    });
    const lossText = formatMonthlyBreakEvenTooltip(beLoss, formatCurrency);
    expect(lossText).toBe(
      `Estimativa provisória: faltou faturar aproximadamente ${formatCurrency(40000)} sobre a receita coberta (80,0% de cobertura).`,
    );

    // Profit on covered revenue
    const beProfit = calculateBreakEven(100000, 40000, null, {
      fullManagerialResultAvailable: false,
      costCoveragePercent: 80,
      coveredRevenue: 80000,
      coveredContributionMargin: 40000,
      partialManagerialResult: 10000,
      isProvisional: true,
    });
    const profitText = formatMonthlyBreakEvenTooltip(beProfit, formatCurrency);
    expect(profitText).toBe(
      "Estimativa provisória: ponto de equilíbrio superado sobre a parcela coberta (80,0% de cobertura).",
    );
  });
});
