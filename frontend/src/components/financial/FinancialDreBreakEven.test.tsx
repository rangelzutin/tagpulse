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
  DRE_BREAK_EVEN_PARTIAL_COVERAGE_TITLE,
  DRE_BREAK_EVEN_PARTIAL_COVERAGE_MESSAGE,
} from "./dreBreakEvenHelper";
import { formatCurrency } from "../../utils/formatters";
import type { DreSummaryTotalsDto } from "../../api/financial";

describe("FinancialDreBreakEven — Frontend Components & Calculation", () => {
  const createMockTotals = (
    realizedRevenue: number,
    contributionMargin: number,
    netManagerialResult: number | null,
    options?: {
      costCoveragePercent?: number | null;
      fullCoverage?: boolean;
    },
  ): DreSummaryTotalsDto => {
    const isFull = options?.fullCoverage ?? (options?.costCoveragePercent === undefined || options?.costCoveragePercent === 100);
    const net = isFull ? netManagerialResult : null;
    const cov = options?.costCoveragePercent ?? (isFull ? 100 : 50);
    const coveredRev = isFull ? realizedRevenue : (realizedRevenue * cov) / 100;
    const uncoveredRev = isFull ? 0 : realizedRevenue - coveredRev;

    return {
      realizedRevenue,
      estimatedCOGS: realizedRevenue * 0.5,
      estimatedGrossProfit: realizedRevenue * 0.5,
      estimatedGrossMarginPercent: 50,
      coveredRevenue: coveredRev,
      uncoveredRevenue: uncoveredRev,
      costCoveragePercent: options?.costCoveragePercent ?? 100,
      coveredGrossProfit: realizedRevenue * 0.5,
      coveredGrossMarginPercent: 50,
      fullGrossProfitAvailable: isFull,
      fullManagerialResultAvailable: isFull,
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
        total: contributionMargin - (netManagerialResult ?? 0),
      },
      financialResult: { financialIncome: 0, financialExpenses: 0, total: 0 },
      otherResult: { otherIncome: 0, otherExpenses: 0, total: 0 },
      netManagerialResult: net,
      netManagerialMarginPercent:
        net !== null && realizedRevenue > 0 ? (net / realizedRevenue) * 100 : null,
      status:
        net !== null && net > 0
          ? "PROFIT"
          : net !== null && net < 0
          ? "LOSS"
          : "BREAK_EVEN",
      breakEven: calculateBreakEven(
        realizedRevenue,
        contributionMargin,
        net,
        {
          costCoveragePercent: options?.costCoveragePercent ?? (isFull ? 100 : 50),
          fullCoverage: isFull,
        },
      ),
    };
  };

  it("1. renders break-even section with 3 main metrics for negative net result (UNREACHED)", () => {
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

  it("2. renders positive net result with Gap R$ 0,00 and superado status (PROFITABLE)", () => {
    const totals = createMockTotals(100000, 40000, 10000);
    const html = renderToString(
      React.createElement(FinancialDreBreakEvenSection, { totals }),
    );

    expect(html).toContain(formatCurrency(0));
    expect(html).toContain("0,0%");
    expect(html).toContain("Ponto de equilíbrio superado");
    expect(html).toContain("Empresa acima do ponto de equilíbrio");
  });

  it("3. renders informative state when contribution margin is <= 0 (UNDETERMINED_ZERO_MARGIN)", () => {
    const totals = createMockTotals(100000, -5000, -30000);
    const html = renderToString(
      React.createElement(FinancialDreBreakEvenSection, { totals }),
    );

    expect(html).toContain('data-testid="dre-breakeven-unviable-card"');
    expect(html).toContain(DRE_BREAK_EVEN_UNVIABLE_TITLE);
    expect(html).toContain(DRE_BREAK_EVEN_UNVIABLE_MESSAGE);
    expect(html).toContain("Margem insuficiente");
  });

  it("4. renders informative state when revenue is zero (UNDETERMINED_ZERO_REVENUE)", () => {
    const totals = createMockTotals(0, 0, -5000);
    const html = renderToString(
      React.createElement(FinancialDreBreakEvenSection, { totals }),
    );

    expect(html).toContain('data-testid="dre-breakeven-norevenue-card"');
    expect(html).toContain("Sem faturamento no período");
  });

  it("5. renders informative state when cost coverage is partial (< 100%) without creating false targets", () => {
    const totals = createMockTotals(100000, 40000, null, {
      costCoveragePercent: 78.4,
      fullCoverage: false,
    });

    const html = renderToString(
      React.createElement(FinancialDreBreakEvenSection, { totals }),
    );

    expect(html).toContain('data-testid="dre-breakeven-partial-coverage-card"');
    expect(html).toContain(DRE_BREAK_EVEN_PARTIAL_COVERAGE_TITLE);
    expect(html).toContain(DRE_BREAK_EVEN_PARTIAL_COVERAGE_MESSAGE);
    expect(html).toContain("O cálculo é liberado quando 100% da receita possui custo disponível.");
    expect(html).toContain("Cobertura parcial de custos");
    expect(html).toContain("Indisponível");
    expect(html).toContain("78,4%");
    expect(html).toContain(formatCurrency(21600));
    expect(html).not.toContain("Faturamento de equilíbrio"); // No false cards
  });

  it("6. includes title attribute with executive explanation on help button", () => {
    const totals = createMockTotals(100000, 40000, -20000);
    const html = renderToString(
      React.createElement(FinancialDreBreakEvenSection, { totals }),
    );

    expect(html).toContain('aria-label="Mais informações sobre ponto de equilíbrio"');
    expect(html).toContain(DRE_BREAK_EVEN_HELP_TEXT);
  });

  it("7. formatMonthlyBreakEvenTooltip produces exact expected narrative for charts", () => {
    // Negative month
    const below = calculateBreakEven(50000, 25000, -10000, { fullCoverage: true });
    const belowText = formatMonthlyBreakEvenTooltip(below, formatCurrency);
    expect(belowText).toBe(
      `Faltou faturar aproximadamente ${formatCurrency(20000)} para atingir o equilíbrio.`,
    );

    // Positive month
    const above = calculateBreakEven(50000, 25000, 5000, { fullCoverage: true });
    const aboveText = formatMonthlyBreakEvenTooltip(above, formatCurrency);
    expect(aboveText).toBe("Ponto de equilíbrio superado.");

    // Unviable margin
    const unviable = calculateBreakEven(50000, -1000, -15000, { fullCoverage: true });
    const unviableText = formatMonthlyBreakEvenTooltip(unviable, formatCurrency);
    expect(unviableText).toBe(
      "Margem insuficiente para estimar equilíbrio por aumento de vendas.",
    );

    // Partial coverage
    const partial = calculateBreakEven(50000, 25000, null, { fullCoverage: false });
    const partialText = formatMonthlyBreakEvenTooltip(partial, formatCurrency);
    expect(partialText).toContain("Cobertura parcial de CMV");

    // No revenue
    const noRev = calculateBreakEven(0, 0, 0, { fullCoverage: true });
    const noRevText = formatMonthlyBreakEvenTooltip(noRev, formatCurrency);
    expect(noRevText).toBeNull();
  });
});
