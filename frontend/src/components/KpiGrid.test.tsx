import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { KpiGrid } from "./KpiGrid";
import type { SalesOverviewSummary } from "../api/bi";
import type { MonthlyOperationalBreakEvenDto } from "../api/financial";
import { formatCurrency, formatPercent } from "../utils/formatters";

const mockSummary: SalesOverviewSummary = {
  revenue: 25513.45,
  sales: 16,
  avgTicket: 1594.59,
  customers: 14,
  salesWithoutCustomer: 0,
};

const mockBreakEvenNov = {
  referenceMonth: "2026-11",
  operationalBreakEvenRevenue: 33419.51,
  realizedRevenue: 25513.45,
  remainingRevenueNeeded: 7906.06,
  surplusRevenue: 0,
  progressPercent: 76.34,
  status: "BELOW_BREAK_EVEN",
  statusLabel: "EM ABERTO",
  monthStatus: "IN_PROGRESS",
  isProvisional: true,
  averageOperationalBreakEven: 40630.17,
  averageReferenceMonthsCount: 3,
  averageReferenceStartMonth: "2026-08",
  averageReferenceEndMonth: "2026-10",
  estimatedCOGS: 15604.63,
  estimatedGrossProfit: 9908.82,
  estimatedGrossMarginPercent: 38.84,
  variableExpenses: {
    total: 2222.06,
    paymentFees: 113.54,
    taxes: 1470.44,
    shipping: 638.08,
  },
  operatingExpenses: {
    total: 9872.86,
  },
  financialResult: {
    total: -195.86,
  },
  totalFixedAndOperationalBase: 10068.72,
  operationalContributionMargin: 7686.76,
  operationalContributionMarginRatio: 0.301283,
  period: {
    from: "2026-11-01",
    to: "2026-11-19",
  },
} as unknown as MonthlyOperationalBreakEvenDto;

describe("KpiGrid — Ponto de Equilíbrio Dinâmico e Referência Histórica", () => {
  it("renderiza a hierarquia correta com Falta Vender como destaque principal e PE dinâmico do mês", () => {
    const html = renderToString(
      <KpiGrid summary={mockSummary} operationalBreakEven={mockBreakEvenNov} />,
    );

    // 1. Falta vender em destaque principal hero
    expect(html).toContain('data-testid="home-breakeven-gap-block"');
    expect(html).toContain("Falta vender");
    expect(html).toContain(formatCurrency(7906.06));

    // 2. Ponto de equilíbrio atual do mês
    expect(html).toContain("Ponto de equilíbrio do mês");
    expect(html).toContain("Equilíbrio atual do mês");
    expect(html).toContain(formatCurrency(33419.51));

    // 3. Progresso
    expect(html).toContain("Progresso");
    expect(html).toContain(formatPercent(76.34, 1));

    // 4. Média recente como referência secundária
    expect(html).toContain("Média recente");
    expect(html).toContain(formatCurrency(40630.17));

    // 5. Comparação dinâmica percentual vs média recente: ((33419.51 / 40630.17) - 1) * 100 = -17,7%
    expect(html).toContain("-17,7% vs média");
  });

  it("inclui tooltips explicativos para PE atual e Média recente sem poluir a interface", () => {
    const html = renderToString(
      <KpiGrid summary={mockSummary} operationalBreakEven={mockBreakEvenNov} />,
    );

    // Tooltip do PE atual
    expect(html).toContain(
      "Ponto de equilíbrio calculado com a margem de contribuição realizada no mês. Pode variar conforme o mix, custos e margens das vendas.",
    );

    // Tooltip da média recente
    expect(html).toContain(
      "Referência baseada em meses completos e comparáveis da estrutura operacional atual.",
    );
  });

  it("identifica corretamente mês em andamento com badge EM ANDAMENTO", () => {
    const html = renderToString(
      <KpiGrid summary={mockSummary} operationalBreakEven={mockBreakEvenNov} />,
    );

    expect(html).toContain("EM ANDAMENTO");
  });
});
