import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  FinancialDreMonthlyChart,
  DreMonthlyTooltip,
  formatDrePendingAccrualLabel,
  formatDrePendingAccruals,
} from "./FinancialDreMonthlyChart";
import {
  buildAdaptiveDreEvolution,
  getRequiredYearsForPeriod,
  aggregateByQuarter,
  aggregateByYear,
  removeFutureMonths,
} from "./dreEvolutionHelper";
import type { DreMonthlyItemDto } from "../../api/financial";

function makeMonthlyItem(
  month: string,
  overrides?: Partial<{
    realizedRevenue: number;
    estimatedCOGS: number;
    variableTotal: number;
    operatingTotal: number;
    financialTotal: number;
    isProvisional: boolean;
  }>,
): DreMonthlyItemDto {
  const rev = overrides?.realizedRevenue ?? 30000;
  const cogs = overrides?.estimatedCOGS ?? 18000;
  const gross = rev - cogs;
  const varTotal = overrides?.variableTotal ?? 3000;
  const cm = gross - varTotal;
  const opTotal = overrides?.operatingTotal ?? 7000;
  const finTotal = overrides?.financialTotal ?? 0;
  const net = cm - opTotal + finTotal;
  const isProvisional = overrides?.isProvisional ?? false;

  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  return {
    month,
    realizedRevenue: rev,
    estimatedCOGS: cogs,
    estimatedGrossProfit: gross,
    estimatedGrossMarginPercent: rev > 0 ? r2((gross / rev) * 100) : null,
    variableExpenses: {
      paymentFees: varTotal,
      taxesOnRevenue: 0,
      freightLogistics: 0,
      salesCommissions: 0,
      other: 0,
      total: varTotal,
    },
    contributionMargin: cm,
    contributionMarginPercent: rev > 0 ? r2((cm / rev) * 100) : null,
    operatingExpenses: {
      personnel: 0,
      partnerCompensation: opTotal,
      marketing: 0,
      occupancy: 0,
      utilities: 0,
      software: 0,
      accounting: 0,
      infrastructure: 0,
      administrative: 0,
      other: 0,
      total: opTotal,
    },
    financialResult: {
      financialIncome: finTotal > 0 ? finTotal : 0,
      financialExpenses: finTotal < 0 ? Math.abs(finTotal) : 0,
      total: finTotal,
    },
    otherResult: {
      otherIncome: 0,
      otherExpenses: 0,
      total: 0,
    },
    netManagerialResult: net,
    netManagerialMarginPercent: rev > 0 ? r2((net / rev) * 100) : null,
    status: net > 0 ? "PROFIT" : net < 0 ? "LOSS" : "BREAK_EVEN",
    dataQuality: {
      isProvisional,
      financiallyClosed: !isProvisional,
      pendingAccruals: isProvisional ? ["VARIABLE_TAX_ON_REVENUE"] : [],
      dreClassificationCoveragePercent: 100,
      unknownAmount: 0,
    },
  };
}

function buildMultiYearFixture(startYear: number, endYear: number): DreMonthlyItemDto[] {
  const items: DreMonthlyItemDto[] = [];
  for (let y = startYear; y <= endYear; y++) {
    for (let m = 1; m <= 12; m++) {
      const ym = `${y}-${String(m).padStart(2, "0")}`;
      const isFutureZero = y === 2026 && m >= 11;
      const isOct2026 = ym === "2026-10";
      items.push(
        makeMonthlyItem(ym, {
          realizedRevenue: isFutureZero ? 0 : 25000 + m * 1000,
          estimatedCOGS: isFutureZero ? 0 : 15000 + m * 500,
          variableTotal: isFutureZero ? 0 : 2000,
          operatingTotal: isFutureZero ? 400 : 6000,
          isProvisional: isOct2026 || isFutureZero,
        }),
      );
    }
  }
  return items;
}

describe("Phase 5D.5: Adaptive DRE Evolution Chart & Faithful Monthly Table", () => {
  const refDate = new Date("2026-10-29T12:00:00Z");
  const fullData = buildMultiYearFixture(2020, 2026);

  it("Scenario A (1 month — Set/26): Chart shows 6-month context (Abr/26–Set/26), Table shows only Set/26", () => {
    const period = { from: "2026-09-01", to: "2026-09-30" };
    const result = buildAdaptiveDreEvolution(fullData, period, refDate);

    expect(result.granularity).toBe("monthly");
    expect(result.hasContextWindow).toBe(true);
    expect(result.contextNotice).toBe(
      "Contexto de 6 meses — período selecionado: Set/26",
    );

    // Chart has 6 months: Abr/26..Set/26
    expect(result.chartBuckets.map((b) => b.label)).toEqual([
      "Abr/26",
      "Mai/26",
      "Jun/26",
      "Jul/26",
      "Ago/26",
      "Set/26",
    ]);
    // Only Set/26 is selected; Abr/26..Ago/26 are context
    expect(
      result.chartBuckets.filter((b) => b.isSelected).map((b) => b.label),
    ).toEqual(["Set/26"]);
    expect(
      result.chartBuckets.filter((b) => b.isContext).map((b) => b.label),
    ).toEqual(["Abr/26", "Mai/26", "Jun/26", "Jul/26", "Ago/26"]);

    // Abr/26..Set/26 are all closed, so provisional badge must be false even though Out/26 is provisional
    expect(result.hasProvisionalInVisibleChart).toBe(false);

    // Table has ONLY Set/26 (1 row)
    expect(result.tableRows).toHaveLength(1);
    expect(result.tableRows[0]?.month).toBe("2026-09");

    // Component SSR verification (chart mode & table mode)
    const chartHtml = renderToString(
      <FinancialDreMonthlyChart
        monthlyData={fullData}
        period={period}
        initialViewMode="chart"
      />,
    );
    expect(chartHtml).toContain(
      "Contexto de 6 meses — período selecionado: Set/26",
    );
    expect(chartHtml).toContain(
      'data-chart-buckets="Abr/26,Mai/26,Jun/26,Jul/26,Ago/26,Set/26"',
    );
    expect(chartHtml).toContain('data-selected-buckets="Set/26"');
    expect(chartHtml).not.toContain("Há meses provisórios na série");

    const tableHtml = renderToString(
      <FinancialDreMonthlyChart
        monthlyData={fullData}
        period={period}
        initialViewMode="table"
      />,
    );
    expect(tableHtml).toContain("Set/26");
    expect(tableHtml).not.toContain("Ago/26");
    expect(tableHtml).not.toContain("Abr/26");
  });

  it("Scenario B (2 months — Ago–Set/26): Chart shows 6-month context (Abr/26–Set/26), Table shows Ago/26 and Set/26", () => {
    const period = { from: "2026-08-01", to: "2026-09-30" };
    const result = buildAdaptiveDreEvolution(fullData, period, refDate);

    expect(result.granularity).toBe("monthly");
    expect(result.hasContextWindow).toBe(true);
    expect(result.contextNotice).toBe(
      "Contexto de 6 meses — período selecionado: Ago/26–Set/26",
    );

    expect(result.chartBuckets.map((b) => b.label)).toEqual([
      "Abr/26",
      "Mai/26",
      "Jun/26",
      "Jul/26",
      "Ago/26",
      "Set/26",
    ]);
    expect(
      result.chartBuckets.filter((b) => b.isSelected).map((b) => b.label),
    ).toEqual(["Ago/26", "Set/26"]);
    expect(
      result.chartBuckets.filter((b) => b.isContext).map((b) => b.label),
    ).toEqual(["Abr/26", "Mai/26", "Jun/26", "Jul/26"]);

    // Table has ONLY Ago/26 and Set/26 (2 rows)
    expect(result.tableRows.map((r) => r.month)).toEqual([
      "2026-08",
      "2026-09",
    ]);

    const chartHtml = renderToString(
      <FinancialDreMonthlyChart
        monthlyData={fullData}
        period={period}
        initialViewMode="chart"
      />,
    );
    expect(chartHtml).toContain(
      "Contexto de 6 meses — período selecionado: Ago/26–Set/26",
    );
    expect(chartHtml).toContain('data-selected-buckets="Ago/26,Set/26"');

    const tableHtml = renderToString(
      <FinancialDreMonthlyChart
        monthlyData={fullData}
        period={period}
        initialViewMode="table"
      />,
    );
    expect(tableHtml).toContain("Ago/26");
    expect(tableHtml).toContain("Set/26");
    expect(tableHtml).not.toContain("Jul/26");
  });

  it("Scenario C (3–24 months — Jan–Out/26): Chart & Table show Jan/26–Out/26 without Nov/26 or Dez/26", () => {
    const period = { from: "2026-01-01", to: "2026-10-29" };
    const result = buildAdaptiveDreEvolution(fullData, period, refDate);

    expect(result.granularity).toBe("monthly");
    expect(result.hasContextWindow).toBe(false);
    expect(result.contextNotice).toBeNull();

    const expectedLabels = [
      "Jan/26",
      "Fev/26",
      "Mar/26",
      "Abr/26",
      "Mai/26",
      "Jun/26",
      "Jul/26",
      "Ago/26",
      "Set/26",
      "Out/26",
    ];
    expect(result.chartBuckets.map((b) => b.label)).toEqual(expectedLabels);
    expect(result.tableRows).toHaveLength(10);
    expect(result.tableRows.map((r) => r.month)).not.toContain("2026-11");
    expect(result.tableRows.map((r) => r.month)).not.toContain("2026-12");

    // Out/26 is provisional, so badge is visible
    expect(result.hasProvisionalInVisibleChart).toBe(true);

    const tableHtml = renderToString(
      <FinancialDreMonthlyChart
        monthlyData={fullData}
        period={period}
        initialViewMode="table"
      />,
    );
    expect(tableHtml).toContain("Jan/26");
    expect(tableHtml).toContain("Out/26");
    expect(tableHtml).not.toContain("Nov/26");
    expect(tableHtml).not.toContain("Dez/26");
    expect(tableHtml).toContain("Há meses provisórios na série");
  });

  it("Scenario D (Multi-year 16 months — Jul/25–Out/26): Chart & Table show all 16 months across 2025 and 2026", () => {
    const period = { from: "2025-07-01", to: "2026-10-29" };
    expect(getRequiredYearsForPeriod(period, refDate)).toEqual(["2025", "2026"]);

    const result = buildAdaptiveDreEvolution(fullData, period, refDate);

    expect(result.granularity).toBe("monthly");
    expect(result.hasContextWindow).toBe(false);
    expect(result.chartBuckets).toHaveLength(16);
    expect(result.chartBuckets[0]?.label).toBe("Jul/25");
    expect(result.chartBuckets[5]?.label).toBe("Dez/25");
    expect(result.chartBuckets[6]?.label).toBe("Jan/26");
    expect(result.chartBuckets[15]?.label).toBe("Out/26");

    expect(result.tableRows).toHaveLength(16);
    expect(result.tableRows[0]?.month).toBe("2025-07");
    expect(result.tableRows[15]?.month).toBe("2026-10");
  });

  it("Scenario E (25–60 months — 30 months Mai/24–Out/26): Chart aggregates by quarter (T2/24..T4/26), Table remains monthly (30 rows)", () => {
    const period = { from: "2024-05-01", to: "2026-10-29" };
    const result = buildAdaptiveDreEvolution(fullData, period, refDate);

    expect(result.selectedMonths).toHaveLength(30);
    expect(result.granularity).toBe("quarterly");

    // Chart buckets are quarterly: T2/24, T3/24, T4/24, T1/25, T2/25, T3/25, T4/25, T1/26, T2/26, T3/26, T4/26
    expect(result.chartBuckets.map((b) => b.label)).toEqual([
      "T2/24",
      "T3/24",
      "T4/24",
      "T1/25",
      "T2/25",
      "T3/25",
      "T4/25",
      "T1/26",
      "T2/26",
      "T3/26",
      "T4/26",
    ]);

    // Table remains strictly monthly with 30 rows
    expect(result.tableRows).toHaveLength(30);
    expect(result.tableRows[0]?.month).toBe("2024-05");
    expect(result.tableRows[29]?.month).toBe("2026-10");
  });

  it("Scenario F (>60 months — 70 months Jan/21–Out/26): Chart aggregates by year (2021..2026), Table remains monthly (70 rows)", () => {
    const period = { from: "2021-01-01", to: "2026-10-29" };
    const result = buildAdaptiveDreEvolution(fullData, period, refDate);

    expect(result.selectedMonths).toHaveLength(70);
    expect(result.granularity).toBe("yearly");

    expect(result.chartBuckets.map((b) => b.label)).toEqual([
      "2021",
      "2022",
      "2023",
      "2024",
      "2025",
      "2026",
    ]);

    // Table remains strictly monthly with 70 rows
    expect(result.tableRows).toHaveLength(70);
    expect(result.tableRows[0]?.month).toBe("2021-01");
    expect(result.tableRows[69]?.month).toBe("2026-10");
  });

  it("Recalculates percentages over aggregated totals rather than averaging monthly percentages", () => {
    const m1 = makeMonthlyItem("2025-01", {
      realizedRevenue: 10000,
      estimatedCOGS: 5000,
      variableTotal: 0,
      operatingTotal: 0,
    }); // MC = 5000 (50%)
    const m2 = makeMonthlyItem("2025-02", {
      realizedRevenue: 90000,
      estimatedCOGS: 81000,
      variableTotal: 0,
      operatingTotal: 0,
    }); // MC = 9000 (10%)

    // Simple average of 50% and 10% would be 30%.
    // Correct weighted recalculation over total revenue (14000 / 100000) is 14.00%.
    const quarters = aggregateByQuarter([m1, m2]);
    expect(quarters).toHaveLength(1);
    expect(quarters[0]?.realizedRevenue).toBe(100000);
    expect(quarters[0]?.contributionMargin).toBe(14000);
    expect(quarters[0]?.contributionMarginPercent).toBe(14);

    const years = aggregateByYear([m1, m2]);
    expect(years).toHaveLength(1);
    expect(years[0]?.contributionMarginPercent).toBe(14);
  });

  it("Removes future zero-revenue months even if period.to extends to year-end", () => {
    const cleaned = removeFutureMonths(fullData, "2026-12-31", refDate);
    const months2026 = cleaned
      .filter((m) => m.month.startsWith("2026-"))
      .map((m) => m.month);
    expect(months2026).toContain("2026-10");
    expect(months2026).not.toContain("2026-11");
    expect(months2026).not.toContain("2026-12");
  });

  describe("DreMonthlyTooltip — Contraste, Labels Amigáveis e Hierarquia", () => {
    it("A. Mês provisório com pendências exibe status Provisório, múltiplas pendências formatadas e conteúdo completo", () => {
      const provisionalMonth = makeMonthlyItem("2026-10", {
        realizedRevenue: 50000,
        estimatedCOGS: 25000,
        variableTotal: 5000,
        operatingTotal: 8000,
        isProvisional: true,
      });
      provisionalMonth.dataQuality.pendingAccruals = [
        "VARIABLE_TAX_ON_REVENUE",
        "OPERATING_PERSONNEL",
      ];

      const evolution = buildAdaptiveDreEvolution(
        [provisionalMonth],
        { from: "2026-10-01", to: "2026-10-31" },
        new Date("2026-10-29T12:00:00Z"),
      );
      const bucket = evolution.chartBuckets.find((b) => b.isSelected)!;

      const html = renderToString(
        React.createElement(DreMonthlyTooltip, {
          active: true,
          payload: [{ payload: bucket }],
          hasContextWindow: true,
        }),
      );

      // Classes de contraste e container do tooltip
      expect(html).toContain("tp-chart-tooltip tp-dre-tooltip");
      // Mês e status do período
      expect(html).toContain(bucket.label);
      expect(html).toContain("Provisório");
      expect(html).toContain("Selecionado");
      expect(html).toContain("Lucro");
      // Múltiplas pendências renderizadas de forma organizada
      expect(html).toContain("Pendências:");
      expect(html).toContain("Impostos sobre vendas • Pessoal / encargos");
      // Raw keys ausentes
      expect(html).not.toContain("VARIABLE_TAX_ON_REVENUE");
      expect(html).not.toContain("OPERATING_PERSONNEL");
    });

    it("B. Mês fechado sem pendências exibe status Fechado e omite seção de pendências", () => {
      const closedMonth = makeMonthlyItem("2026-08", {
        realizedRevenue: 40000,
        estimatedCOGS: 28000,
        variableTotal: 4000,
        operatingTotal: 12000,
        isProvisional: false,
      });

      const evolution = buildAdaptiveDreEvolution(
        [closedMonth],
        { from: "2026-08-01", to: "2026-08-31" },
        new Date("2026-10-29T12:00:00Z"),
      );
      const bucket = evolution.chartBuckets.find((b) => b.isSelected)!;

      const html = renderToString(
        React.createElement(DreMonthlyTooltip, {
          active: true,
          payload: [{ payload: bucket }],
          hasContextWindow: false,
        }),
      );

      expect(html).toContain("Fechado");
      expect(html).toContain("Prejuízo");
      expect(html).not.toContain("Provisório");
      expect(html).not.toContain("Pendências:");
      expect(html).not.toContain("tp-tooltip-pending-hint");
    });

    it("C. Mapeia corretamente todos os códigos reais de pendências para labels amigáveis", () => {
      expect(formatDrePendingAccrualLabel("VARIABLE_TAX_ON_REVENUE")).toBe(
        "Impostos sobre vendas",
      );
      expect(formatDrePendingAccrualLabel("OPERATING_PERSONNEL")).toBe(
        "Pessoal / encargos",
      );
      expect(formatDrePendingAccrualLabel("PRO_LABORE_GPS")).toBe(
        "Encargos de pró-labore",
      );
      expect(formatDrePendingAccrualLabel("DAS")).toBe(
        "DAS / Simples Nacional",
      );
      expect(formatDrePendingAccrualLabel("ICMS")).toBe("ICMS");
      expect(formatDrePendingAccrualLabel("TAX_ICMS_UNRESOLVED")).toBe("ICMS");
      expect(
        formatDrePendingAccrualLabel("OPERATING_PARTNER_COMPENSATION"),
      ).toBe("Pró-labore / remuneração de sócios");

      // Deduplicação e múltiplas pendências
      expect(
        formatDrePendingAccruals([
          "VARIABLE_TAX_ON_REVENUE",
          "OPERATING_PERSONNEL",
          "PRO_LABORE_GPS",
          "ICMS",
          "TAX_ICMS_UNRESOLVED",
        ]),
      ).toEqual([
        "Impostos sobre vendas",
        "Pessoal / encargos",
        "Encargos de pró-labore",
        "ICMS",
      ]);
    });

    it("D. Garante ausência total de raw keys técnicas no tooltip e na visualização em tabela", () => {
      const m = makeMonthlyItem("2026-10", { isProvisional: true });
      m.dataQuality.pendingAccruals = [
        "VARIABLE_TAX_ON_REVENUE",
        "OPERATING_PERSONNEL",
        "PRO_LABORE_GPS",
        "UNMAPPED_INTERNAL_KEY",
      ];

      const evolution = buildAdaptiveDreEvolution(
        [m],
        { from: "2026-10-01", to: "2026-10-31" },
        new Date("2026-10-29T12:00:00Z"),
      );

      const tooltipHtml = renderToString(
        React.createElement(DreMonthlyTooltip, {
          active: true,
          payload: [{ payload: evolution.chartBuckets.find((b) => b.isSelected)! }],
        }),
      );

      const tableHtml = renderToString(
        React.createElement(FinancialDreMonthlyChart, {
          monthlyData: [m],
          period: { from: "2026-10-01", to: "2026-10-31" },
          initialViewMode: "table",
        }),
      );

      for (const rawKey of [
        "VARIABLE_TAX_ON_REVENUE",
        "OPERATING_PERSONNEL",
        "PRO_LABORE_GPS",
        "UNMAPPED_INTERNAL_KEY",
      ]) {
        expect(tooltipHtml).not.toContain(rawKey);
        expect(tableHtml).not.toContain(rawKey);
      }

      expect(tooltipHtml).toContain(
        "Impostos sobre vendas • Pessoal / encargos • Encargos de pró-labore • Outras pendências de conciliação",
      );
      expect(tableHtml).toContain(
        "Aguardando conciliação: Impostos sobre vendas • Pessoal / encargos • Encargos de pró-labore • Outras pendências de conciliação",
      );
    });

    it("E. Renderiza a hierarquia completa do tooltip com valores monetários e percentuais preservados", () => {
      const m = makeMonthlyItem("2026-09", {
        realizedRevenue: 100000,
        estimatedCOGS: 60000,
        variableTotal: 10000,
        operatingTotal: 15000,
        isProvisional: true,
      });
      m.dataQuality.pendingAccruals = ["DAS", "ICMS"];

      const evolution = buildAdaptiveDreEvolution(
        [m],
        { from: "2026-09-01", to: "2026-09-30" },
        new Date("2026-10-29T12:00:00Z"),
      );
      const bucket = evolution.chartBuckets.find((b) => b.isSelected)!;

      const html = renderToString(
        React.createElement(DreMonthlyTooltip, {
          active: true,
          payload: [{ payload: bucket }],
          hasContextWindow: false,
        }),
      );

      // Hierarquia completa exigida:
      // 1. Mês
      expect(html).toContain(bucket.label);
      // 2. Status do período
      expect(html).toContain("Provisório");
      // 3. Lucro / Prejuízo
      expect(html).toContain("Lucro");
      // 4. Receita realizada
      expect(html).toContain("Receita realizada:");
      expect(html).toContain("100.000,00");
      // 5. CMV estimado
      expect(html).toContain("CMV estimado:");
      expect(html).toContain("60.000,00");
      // 6. Margem de contribuição (R$ 30.000,00 / 30,0%)
      expect(html).toContain("Margem de contribuição:");
      expect(html).toContain("30.000,00");
      expect(html).toContain("30,0%");
      // 7. Despesas operacionais (R$ 15.000,00)
      expect(html).toContain("Despesas operacionais:");
      expect(html).toContain("15.000,00");
      // 8. Resultado líquido (R$ 15.000,00 / 15,0%)
      expect(html).toContain("Resultado líquido:");
      expect(html).toContain("15,0%");
      // 9. Pendências
      expect(html).toContain("Pendências:");
      expect(html).toContain("DAS / Simples Nacional • ICMS");
    });
  });
});

