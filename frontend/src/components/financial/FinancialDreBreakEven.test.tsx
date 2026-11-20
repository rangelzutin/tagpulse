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
import type { DreSummaryTotalsDto, MonthlyOperationalBreakEvenDto } from "../../api/financial";
import { KpiGrid } from "../KpiGrid";

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

  it("8. renders Home Operational Monthly Break-Even KPI card inside KpiGrid with PROVISÓRIO badge and auxiliary metrics", () => {
    const novKpi: MonthlyOperationalBreakEvenDto = {
      referenceMonth: "2026-11",
      period: { from: "2026-11-01", to: "2026-11-30" },
      calculationBasis: "CURRENT_MONTH_DUE_DATE",
      realizedRevenue: 11602.87,
      estimatedCOGS: 6788.01,
      estimatedGrossProfit: 4814.86,
      estimatedGrossMarginPercent: 41.5,
      variableExpenses: {
        paymentFees: 99.08,
        taxesOnRevenue: 1470.44,
        freightLogistics: 430.08,
        salesCommissions: 0,
        packaging: 0,
        other: 0,
        total: 1999.6,
      },
      contributionMargin: 2815.26,
      contributionMarginPercent: 24.26,
      contributionMarginRate: 0.2426,
      operatingExpenses: {
        personnel: 534.93,
        partnerCompensation: 6000,
        marketing: 1072.28,
        athletes: 0,
        occupancy: 1571.85,
        utilities: 85.68,
        software: 159,
        accounting: 0,
        infrastructure: 129.5,
        administrative: 179.82,
        losses: 0,
        other: 0,
        total: 9733.06,
      },
      financialResult: {
        financialIncome: 7.9,
        financialExpenses: 203.76,
        total: -195.86,
      },
      fixedCostBase: 9928.92,
      operationalNetResult: -7113.66,
      operationalBreakEvenRevenue: 40921.25,
      remainingRevenueNeeded: 29318.38,
      surplusRevenue: 0,
      progressPercent: 28.35,
      status: "BELOW_BREAK_EVEN",
      statusLabel: "Faltam R$ 29.318,38 para o equilíbrio",
      isProvisional: true,
      pendingItems: [],
      averageOperationalBreakEven: 40630.17,
      averageReferenceStartMonth: "2026-08",
      averageReferenceEndMonth: "2026-10",
      averageReferenceMonthsCount: 3,
      entries: [],
    };

    const html = renderToString(
      React.createElement(KpiGrid, {
        summary: {
          revenue: 11602.87,
          sales: 32,
          avgTicket: 362.59,
          customers: 28,
          salesWithoutCustomer: 0,
        },
        operationalBreakEven: novKpi,
      }),
    );

    expect(html).toContain('data-testid="home-operational-breakeven-card"');
    expect(html).toContain("tp-breakeven-banner");
    expect(html).toContain("tp-breakeven-metrics-grid");
    expect(html).toContain("Ponto de equilíbrio do mês");
    expect(html).toContain("EM ANDAMENTO");
    expect(html).not.toContain("PROVISÓRIO");
    expect(html).not.toContain("Provisório");
    expect(html).toContain("Mês ainda em andamento. O ponto de equilíbrio pode variar conforme novos lançamentos e vendas forem registrados.");
    expect(html).toContain("Faltam R$ 29.318,38 para o equilíbrio");
    expect(html).toContain(formatCurrency(40921.25)); // A) Ponto de equilíbrio
    expect(html).toContain(formatCurrency(11602.87)); // B) Faturado
    expect(html).toContain(formatCurrency(29318.38)); // C) Falta vender
    expect(html).toContain("28,4%"); // D) Progresso
    expect(html).toContain(formatCurrency(40630.17)); // E) Média recente
    expect(html).toContain("+0,7% vs média"); // F) Comparação com média (1 casa decimal)
    expect(html).toContain(`${formatCurrency(11602.87)} de ${formatCurrency(40921.25)}`);
    expect(html).not.toContain("Meta atingida");
  });

  it("9. renders Home Break-Even banner when ABOVE_BREAK_EVEN with full bar and surplus message", () => {
    const aboveKpi: MonthlyOperationalBreakEvenDto = {
      referenceMonth: "2026-11",
      period: { from: "2026-11-01", to: "2026-11-30" },
      calculationBasis: "CURRENT_MONTH_DUE_DATE",
      realizedRevenue: 50000,
      estimatedCOGS: 25000,
      estimatedGrossProfit: 25000,
      estimatedGrossMarginPercent: 50,
      variableExpenses: {
        paymentFees: 500,
        taxesOnRevenue: 2500,
        freightLogistics: 1000,
        salesCommissions: 0,
        packaging: 0,
        other: 0,
        total: 4000,
      },
      contributionMargin: 21000,
      contributionMarginPercent: 42,
      contributionMarginRate: 0.42,
      operatingExpenses: {
        personnel: 5000,
        partnerCompensation: 4000,
        marketing: 1000,
        athletes: 0,
        occupancy: 1500,
        utilities: 100,
        software: 200,
        accounting: 0,
        infrastructure: 100,
        administrative: 200,
        losses: 0,
        other: 0,
        total: 12100,
      },
      financialResult: {
        financialIncome: 0,
        financialExpenses: 100,
        total: -100,
      },
      fixedCostBase: 12200,
      operationalNetResult: 8800,
      operationalBreakEvenRevenue: 29047.62,
      remainingRevenueNeeded: 0,
      surplusRevenue: 20952.38,
      progressPercent: 172.13,
      status: "ABOVE_BREAK_EVEN",
      statusLabel: "Superado em R$ 20.952,38",
      monthStatus: "CLOSED",
      isProvisional: false,
      pendingItems: [],
      averageOperationalBreakEven: 30000,
      averageReferenceStartMonth: "2026-08",
      averageReferenceEndMonth: "2026-10",
      averageReferenceMonthsCount: 3,
      entries: [],
    };

    const html = renderToString(
      React.createElement(KpiGrid, {
        summary: {
          revenue: 50000,
          sales: 80,
          avgTicket: 625,
          customers: 60,
          salesWithoutCustomer: 0,
        },
        operationalBreakEven: aboveKpi,
      }),
    );

    expect(html).toContain('data-testid="home-operational-breakeven-card"');
    expect(html).toContain("tp-banner-above");
    expect(html).toContain("tp-status-above");
    expect(html).toContain("Superado em R$ 20.952,38");
    expect(html).toContain(formatCurrency(29047.62));
    expect(html).toContain(formatCurrency(50000));
    expect(html).toContain(formatCurrency(20952.38));
    expect(html).toContain("Superado");
    expect(html).toContain("tp-fill-emerald");
    expect(html).toContain("width:100%");
    expect(html).not.toContain("EM ANDAMENTO");
    expect(html).not.toContain("PROVISÓRIO");
    expect(html).not.toContain("Provisório");
  });
});
