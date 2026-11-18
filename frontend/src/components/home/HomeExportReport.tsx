import { useMemo } from "react";
import type {
  SalesOverviewResult,
  CustomerOverviewResult,
  SalesTrendPoint,
  SalesOverviewMonthly,
} from "../../api/bi";
import type { MonthlyOperationalBreakEvenDto } from "../../api/financial";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatDateBr,
  formatCompactCurrency,
  formatMonthLabel,
} from "../../utils/formatters";
import { formatExportGeneratedAt } from "../financial/dreExportService";

export interface HomeExportReportProps {
  period: {
    from: string;
    to: string;
  };
  generatedAt?: Date | string;
  lastSyncAt?: Date | string | null;
  salesData?: SalesOverviewResult | null;
  operationalBreakEven?: MonthlyOperationalBreakEvenDto | null;
  customerData?: CustomerOverviewResult | null;
  layoutMode?: "paginated" | "continuous";
}

const HOME_EXPORT_REPORT_CSS = `
  .tp-home-export-root,
  .tp-home-export-page,
  .tp-home-export-sheet,
  .tp-home-export-sheet-section {
    background: #ffffff;
    color: #0f172a;
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    line-height: 1.4;
    -webkit-font-smoothing: antialiased;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    box-sizing: border-box;
  }
  .tp-home-export-root *,
  .tp-home-export-page *,
  .tp-home-export-sheet *,
  .tp-home-export-sheet-section * {
    box-sizing: border-box;
  }

  .tp-home-export-page {
    width: 1120px;
    height: 792px;
    padding: 26px 34px;
    background: #ffffff;
    color: #0f172a;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 12px;
    page-break-after: always;
    break-after: page;
    position: relative;
    overflow: hidden;
  }

  .tp-home-export-sheet {
    width: 1120px;
    padding: 26px 34px;
    background: #ffffff;
    color: #0f172a;
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  .tp-home-export-sheet-section {
    width: 100%;
    background: #ffffff;
    color: #0f172a;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  /* Header — Padronizado com DRE */
  .tp-home-export-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #0f172a;
    padding-bottom: 12px;
  }
  .tp-home-export-brand {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #0284c7;
    margin-bottom: 2px;
  }
  .tp-home-export-title {
    font-size: 21px;
    font-weight: 800;
    color: #0f172a;
    margin: 0;
    letter-spacing: -0.02em;
  }
  .tp-home-export-subtitle {
    font-size: 13px;
    font-weight: 600;
    color: #334155;
    margin: 2px 0 0 0;
  }
  .tp-home-export-meta {
    text-align: right;
    font-size: 11.5px;
    color: #334155;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .tp-home-export-meta strong {
    color: #0f172a;
    font-weight: 600;
  }

  /* 4 KPI Grid — Padronizado com DRE (.tp-dre-export-kpi-card) */
  .tp-home-export-kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }
  .tp-home-export-kpi-card {
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 11px 14px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .tp-home-export-kpi-card.is-highlight {
    border-color: #7dd3fc;
    background: #f0f9ff;
  }
  .tp-home-export-kpi-label {
    font-size: 10.5px;
    font-weight: 700;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .tp-home-export-kpi-value {
    font-size: 19px;
    font-weight: 800;
    color: #0f172a;
    margin-top: 4px;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .tp-home-export-kpi-value.is-cyan {
    color: #0284c7;
  }

  /* Break-even Banner — Padronizado com DRE + Destaque Principal em FALTA VENDER */
  .tp-home-export-breakeven {
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .tp-home-export-breakeven.is-above {
    border-color: #86efac;
    background: #f0fdf4;
  }
  .tp-home-export-be-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .tp-home-export-be-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .tp-home-export-be-title {
    font-size: 13px;
    font-weight: 800;
    color: #0f172a;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .tp-home-export-badge-inprogress {
    font-size: 9.5px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
    background: #fef3c7;
    color: #92400e;
    border: 1px solid #fcd34d;
    letter-spacing: 0.03em;
  }
  .tp-home-export-inprogress-note {
    font-size: 10.5px;
    color: #64748b;
    font-style: italic;
    margin-left: 4px;
  }
  .tp-home-export-be-pill {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 10px;
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .tp-home-export-be-pill.is-above {
    background: #dcfce7;
    color: #166534;
    border: 1px solid #86efac;
  }
  .tp-home-export-be-pill.is-below {
    background: #fef3c7;
    color: #92400e;
    border: 1px solid #fcd34d;
  }
  .tp-home-export-be-grid {
    display: grid;
    grid-template-columns: 1.1fr 1.35fr 0.9fr 1.15fr;
    gap: 10px;
    align-items: stretch;
  }
  .tp-home-export-be-col {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
  }
  .tp-home-export-be-col.is-gap-highlight {
    background: #fffbeb;
    border: 1.5px solid #f59e0b;
    padding: 9px 14px;
  }
  .tp-home-export-be-col.is-gap-highlight.is-above {
    background: #dcfce7;
    border-color: #22c55e;
  }
  .tp-home-export-be-col-label {
    font-size: 10px;
    font-weight: 700;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .tp-home-export-be-col.is-gap-highlight .tp-home-export-be-col-label {
    color: #92400e;
    font-weight: 800;
  }
  .tp-home-export-be-col.is-gap-highlight.is-above .tp-home-export-be-col-label {
    color: #166534;
  }
  .tp-home-export-be-col-val {
    font-size: 16px;
    font-weight: 800;
    color: #0f172a;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }
  .tp-home-export-be-col-val.is-gap-hero {
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .tp-home-export-be-col-val.is-cyan { color: #0284c7; }
  .tp-home-export-be-col-val.is-emerald { color: #15803d; }
  .tp-home-export-be-col-val.is-amber { color: #b45309; }
  .tp-home-export-be-subtext {
    font-size: 10px;
    color: #64748b;
  }
  .tp-home-export-be-col.is-gap-highlight .tp-home-export-be-subtext {
    color: #92400e;
    font-weight: 600;
  }
  .tp-home-export-be-col.is-gap-highlight.is-above .tp-home-export-be-subtext {
    color: #166534;
  }
  .tp-home-export-be-avg-diff {
    font-size: 10px;
    font-weight: 700;
  }
  .tp-home-export-be-avg-diff.is-pos { color: #92400e; }
  .tp-home-export-be-avg-diff.is-neg { color: #15803d; }

  /* Progress bar */
  .tp-home-export-be-bar-container {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 2px;
  }
  .tp-home-export-be-bar-labels {
    display: flex;
    justify-content: space-between;
    font-size: 10.5px;
    font-weight: 600;
    color: #475569;
  }
  .tp-home-export-be-bar-track {
    height: 7px;
    background: #e2e8f0;
    border-radius: 999px;
    overflow: hidden;
  }
  .tp-home-export-be-bar-fill {
    height: 100%;
    border-radius: 999px;
    background: #0284c7;
  }
  .tp-home-export-be-bar-fill.is-above {
    background: #15803d;
  }

  /* Chart Card — Padronizado com DRE (.tp-dre-export-section-box) */
  .tp-home-export-chart-card {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
  }
  .tp-home-export-chart-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .tp-home-export-chart-title {
    font-size: 13.5px;
    font-weight: 700;
    color: #0f172a;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .tp-home-export-chart-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
    background: #f1f5f9;
    color: #334155;
    border: 1px solid #cbd5e1;
  }
  .tp-home-export-chart-subtitle {
    font-size: 11px;
    color: #64748b;
  }
  .tp-home-export-svg-container {
    width: 100%;
    height: 195px;
    position: relative;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 4px;
  }

  /* Page 2: Layout Lado a Lado (Top 5 Clientes + Concentração Comercial) */
  .tp-home-export-p2-split {
    display: grid;
    grid-template-columns: 1.55fr 1fr;
    gap: 14px;
    flex: 1;
    align-items: stretch;
  }
  .tp-home-export-table-card {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 12px;
  }
  .tp-home-export-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .tp-home-export-table th {
    text-align: left;
    color: #475569;
    font-weight: 700;
    text-transform: uppercase;
    font-size: 10.5px;
    letter-spacing: 0.04em;
    padding: 9px 10px;
    background: #f8fafc;
    border-bottom: 2px solid #cbd5e1;
  }
  .tp-home-export-table td {
    padding: 13px 10px;
    border-bottom: 1px solid #e2e8f0;
    color: #1e293b;
    font-variant-numeric: tabular-nums;
  }
  .tp-home-export-table tr:last-child td {
    border-bottom: none;
  }
  .tp-home-export-table .col-right {
    text-align: right;
  }
  .tp-home-export-rank-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 5px;
    background: #e0f2fe;
    color: #0369a1;
    border: 1px solid #bae6fd;
    font-weight: 800;
    font-size: 10.5px;
  }
  .tp-home-export-share-bar-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
    justify-content: flex-end;
  }
  .tp-home-export-share-pct-label {
    font-weight: 700;
    color: #0f172a;
    min-width: 42px;
    text-align: right;
  }
  .tp-home-export-share-bar {
    width: 96px;
    height: 8px;
    background: #e2e8f0;
    border-radius: 999px;
    overflow: hidden;
  }
  .tp-home-export-share-fill {
    height: 100%;
    background: linear-gradient(90deg, #0284c7, #38bdf8);
    border-radius: 999px;
  }
  .tp-home-export-table-summary-footer {
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    padding: 10px 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11.5px;
    color: #334155;
  }
  .tp-home-export-table-summary-footer strong {
    color: #0f172a;
    font-weight: 800;
  }

  /* Coluna Direita Página 2: Concentração Comercial & Novos x Recorrentes */
  .tp-home-export-p2-side {
    display: flex;
    flex-direction: column;
    gap: 14px;
    justify-content: space-between;
  }
  .tp-home-export-side-card {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex: 1;
    justify-content: space-between;
  }
  .tp-home-export-conc-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .tp-home-export-conc-box {
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .tp-home-export-conc-box.is-primary {
    background: #f0f9ff;
    border-color: #7dd3fc;
  }
  .tp-home-export-conc-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #475569;
  }
  .tp-home-export-conc-val {
    font-size: 17px;
    font-weight: 800;
    color: #0f172a;
    font-variant-numeric: tabular-nums;
  }
  .tp-home-export-conc-val.is-cyan {
    color: #0284c7;
  }
  .tp-home-export-conc-share {
    font-size: 11px;
    font-weight: 700;
    color: #0369a1;
  }
  .tp-home-export-conc-sub {
    font-size: 10px;
    color: #64748b;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tp-home-export-conc-bar-block {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .tp-home-export-conc-bar-labels {
    display: flex;
    justify-content: space-between;
    font-size: 10.5px;
    color: #475569;
    font-weight: 600;
  }
  .tp-home-export-conc-track {
    width: 100%;
    height: 10px;
    background: #e2e8f0;
    border-radius: 999px;
    overflow: hidden;
    display: flex;
  }
  .tp-home-export-conc-fill-top1 {
    height: 100%;
    background: #0369a1;
  }
  .tp-home-export-conc-fill-top5 {
    height: 100%;
    background: #38bdf8;
  }
  .tp-home-export-conc-legend {
    display: flex;
    gap: 12px;
    font-size: 10px;
    color: #475569;
    flex-wrap: wrap;
  }
  .tp-home-export-legend-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 4px;
    vertical-align: middle;
  }

  /* Footers — Padronizado com DRE (.tp-dre-export-page-footer) */
  .tp-home-export-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10.5px;
    color: #64748b;
    border-top: 1px solid #cbd5e1;
    padding-top: 8px;
  }
`;

interface SvgChartItem {
  key: string;
  label: string;
  revenue: number;
  isMilestone: boolean;
}

export function HomeExportReport({
  period,
  generatedAt,
  lastSyncAt,
  salesData,
  operationalBreakEven,
  customerData,
  layoutMode = "paginated",
}: HomeExportReportProps) {
  const be = operationalBreakEven ?? null;
  const summary = salesData?.summary ?? {
    revenue: 0,
    sales: 0,
    avgTicket: 0,
    customers: 0,
  };

  const isAbove = be?.status === "ABOVE_BREAK_EVEN";

  // Mês em andamento
  const isMonthInProgress =
    be?.monthStatus === "IN_PROGRESS" ||
    (be?.monthStatus !== "CLOSED" &&
      (be?.referenceMonth
        ? (() => {
            const now = new Date();
            const currentMonth = `${now.getUTCFullYear()}-${String(
              now.getUTCMonth() + 1,
            ).padStart(2, "0")}`;
            return be.referenceMonth >= currentMonth;
          })()
        : be?.isProvisional ?? false));

  // Diferença vs média recente
  const avgDiffPct =
    be?.averageOperationalBreakEven &&
    be.averageOperationalBreakEven > 0 &&
    be.operationalBreakEvenRevenue !== null
      ? ((be.operationalBreakEvenRevenue - be.averageOperationalBreakEven) /
          be.averageOperationalBreakEven) *
        100
      : null;
  const avgDiffSign = avgDiffPct !== null && avgDiffPct > 0 ? "+" : "";
  const avgDiffFormatted =
    avgDiffPct !== null
      ? `${avgDiffSign}${formatPercent(avgDiffPct, 2)} vs média`
      : null;

  // Granularidade e pontos do gráfico
  const { chartItems, granularity } = useMemo(() => {
    if (salesData?.trend && salesData.trend.points && salesData.trend.points.length > 0) {
      const g = salesData.trend.granularity;
      const items: SvgChartItem[] = salesData.trend.points.map((p: SalesTrendPoint) => {
        let isMilestone = false;
        if (g === "daily") {
          isMilestone = p.key === "2026-06-03";
        } else if (g === "weekly") {
          isMilestone = p.periodStart <= "2026-06-03" && p.periodEnd >= "2026-06-03";
        } else {
          isMilestone = p.key === "2026-06";
        }
        return {
          key: p.key,
          label: p.label,
          revenue: p.revenue,
          isMilestone,
        };
      });
      return { chartItems: items, granularity: g };
    }

    if (salesData?.monthly && salesData.monthly.length > 0) {
      const items: SvgChartItem[] = salesData.monthly.map((m: SalesOverviewMonthly) => ({
        key: m.month,
        label: formatMonthLabel(m.month),
        revenue: m.revenue,
        isMilestone: m.month === "2026-06",
      }));
      return { chartItems: items, granularity: "monthly" };
    }

    return { chartItems: [], granularity: "monthly" };
  }, [salesData]);

  // Marcador histórico: 03/06/2026 Nineclouds + Hustler no mesmo sistema
  // Somente se 03/06/2026 estiver dentro do período exportado
  const isMilestoneInInterval = Boolean(
    period.from &&
      period.to &&
      period.from <= "2026-06-03" &&
      period.to >= "2026-06-03",
  );

  const milestoneIndex = isMilestoneInInterval
    ? chartItems.findIndex((item) => item.isMilestone)
    : -1;

  // Metadados do cabeçalho
  const formattedPeriod = `${formatDateBr(period.from)} a ${formatDateBr(period.to)}`;
  const formattedGeneratedAt = formatExportGeneratedAt(generatedAt ?? new Date());
  const formattedLastSync = lastSyncAt
    ? formatExportGeneratedAt(lastSyncAt)
    : "Não informada";

  // Top 5 Clientes & Métricas de Concentração Comercial
  const topCustomers = useMemo(() => {
    if (!customerData?.ranking) return [];
    return customerData.ranking.slice(0, 5);
  }, [customerData]);

  const concentrationMetrics = useMemo(() => {
    const allRanked = customerData?.ranking ?? [];
    const totalRankedRevenue = allRanked.reduce((acc, c) => acc + c.revenue, 0);
    const top5Revenue = topCustomers.reduce((acc, c) => acc + c.revenue, 0);
    const lastTopCustomer =
      topCustomers.length > 0 ? topCustomers[topCustomers.length - 1] : null;
    const sumShare = topCustomers.reduce(
      (acc, c) => acc + c.revenueSharePercent,
      0,
    );
    const top5SharePercent =
      lastTopCustomer?.cumulativeRevenueSharePercent ?? sumShare;
    const top1 = topCustomers[0] ?? null;
    const top1Revenue = top1 ? top1.revenue : 0;
    const top1SharePercent = top1 ? top1.revenueSharePercent : 0;
    const top1Name = top1?.displayName || "Maior cliente";
    const baseRevenue =
      totalRankedRevenue >= top5Revenue && totalRankedRevenue > 0
        ? totalRankedRevenue
        : summary.revenue;
    const othersRevenue = Math.max(0, baseRevenue - top5Revenue);
    const othersSharePercent = Math.max(0, 100 - top5SharePercent);

    const buyingCustomers = customerData?.customers.buyingCustomers ?? 0;
    const newCustomers = customerData?.customers.newCustomers ?? 0;
    const returningCustomers = customerData?.customers.returningCustomers ?? 0;
    const newSharePercent =
      buyingCustomers > 0 ? (newCustomers / buyingCustomers) * 100 : 0;
    const returningSharePercent =
      buyingCustomers > 0 ? (returningCustomers / buyingCustomers) * 100 : 0;

    return {
      top5Revenue,
      top5SharePercent,
      top1Revenue,
      top1SharePercent,
      top1Name,
      othersRevenue,
      othersSharePercent,
      buyingCustomers,
      newCustomers,
      returningCustomers,
      newSharePercent,
      returningSharePercent,
    };
  }, [topCustomers, summary.revenue, customerData]);

  const hasCustomerPage = Boolean(
    customerData?.customers &&
      (customerData.customers.buyingCustomers > 0 || topCustomers.length > 0),
  );

  // SVG Chart Geometry
  const svgWidth = 1044;
  const svgHeight = 185;
  const paddingLeft = 65;
  const paddingRight = 30;
  const paddingTop = 24;
  const paddingBottom = 28;
  const plotWidth = svgWidth - paddingLeft - paddingRight;
  const plotHeight = svgHeight - paddingTop - paddingBottom;

  const maxRevenue = Math.max(...chartItems.map((c) => c.revenue), 1000);
  // Grid values (4 horizontal lines)
  const yTicks = [0, maxRevenue * 0.33, maxRevenue * 0.66, maxRevenue];

  const pointsCoords = chartItems.map((item, idx) => {
    const x =
      chartItems.length > 1
        ? paddingLeft + (idx / (chartItems.length - 1)) * plotWidth
        : paddingLeft + plotWidth / 2;
    const y = paddingTop + plotHeight - (item.revenue / maxRevenue) * plotHeight;
    return { x, y, item, idx };
  });

  const polylinePoints = pointsCoords.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPolygonPoints =
    pointsCoords.length > 0
      ? `${paddingLeft},${paddingTop + plotHeight} ${polylinePoints} ${
          pointsCoords[pointsCoords.length - 1]!.x
        },${paddingTop + plotHeight}`
      : "";

  const milestoneCoord =
    milestoneIndex >= 0 && pointsCoords[milestoneIndex]
      ? pointsCoords[milestoneIndex]
      : null;

  // Render Page 1 Content
  const renderPage1 = (isSheet = false) => (
    <div
      className={isSheet ? "tp-home-export-sheet-section" : "tp-home-export-page"}
      data-export-page="1"
      key="page-1"
    >
      <style>{HOME_EXPORT_REPORT_CSS}</style>
      {/* Header */}
      <div className="tp-home-export-header">
        <div>
          <div className="tp-home-export-brand">TAGPULSE • RELATÓRIO EXECUTIVO</div>
          <h1 className="tp-home-export-title">Nineclouds — Performance Comercial</h1>
          <p className="tp-home-export-subtitle">
            Visão executiva comercial e operacional
          </p>
        </div>
        <div className="tp-home-export-meta">
          <div>
            Período: <strong>{formattedPeriod}</strong>
          </div>
          <div>
            Data de geração: <strong>{formattedGeneratedAt}</strong>
          </div>
          <div data-testid="export-last-sync">
            Última sincronização: <strong>{formattedLastSync}</strong>
          </div>
        </div>
      </div>

      {/* 4 KPIs Principais */}
      <div className="tp-home-export-kpi-grid">
        <div className="tp-home-export-kpi-card is-highlight">
          <span className="tp-home-export-kpi-label">Faturamento</span>
          <span className="tp-home-export-kpi-value is-cyan" data-testid="export-kpi-revenue">
            {formatCurrency(summary.revenue)}
          </span>
        </div>
        <div className="tp-home-export-kpi-card">
          <span className="tp-home-export-kpi-label">Vendas</span>
          <span className="tp-home-export-kpi-value" data-testid="export-kpi-sales">
            {formatNumber(summary.sales)}
          </span>
        </div>
        <div className="tp-home-export-kpi-card">
          <span className="tp-home-export-kpi-label">Ticket médio</span>
          <span className="tp-home-export-kpi-value" data-testid="export-kpi-avg-ticket">
            {formatCurrency(summary.avgTicket)}
          </span>
        </div>
        <div className="tp-home-export-kpi-card">
          <span className="tp-home-export-kpi-label">Clientes compradores</span>
          <span className="tp-home-export-kpi-value" data-testid="export-kpi-customers">
            {formatNumber(summary.customers)}
          </span>
        </div>
      </div>

      {/* Bloco de Ponto de Equilíbrio (Sem duplicidade de Faturado; FALTA VENDER como destaque principal) */}
      {be && (
        <div
          className={`tp-home-export-breakeven ${isAbove ? "is-above" : ""}`}
          data-testid="export-breakeven-card"
        >
          <div className="tp-home-export-be-top">
            <div className="tp-home-export-be-title-wrap">
              <span className="tp-home-export-be-title">
                Ponto de equilíbrio do mês
              </span>
              {isMonthInProgress && (
                <span
                  className="tp-home-export-badge-inprogress"
                  data-testid="export-badge-inprogress"
                >
                  EM ANDAMENTO
                </span>
              )}
              {isMonthInProgress && (
                <span className="tp-home-export-inprogress-note">
                  Os valores podem variar conforme novos lançamentos e vendas forem registrados.
                </span>
              )}
            </div>
            <div>
              <span
                className={`tp-home-export-be-pill ${
                  isAbove ? "is-above" : "is-below"
                }`}
                data-testid="export-breakeven-status-pill"
              >
                {be.statusLabel}
              </span>
            </div>
          </div>

          <div className="tp-home-export-be-grid">
            {/* A) Ponto de equilíbrio do mês */}
            <div className="tp-home-export-be-col">
              <span className="tp-home-export-be-col-label">
                Ponto de equilíbrio do mês
              </span>
              <span
                className="tp-home-export-be-col-val"
                data-testid="export-be-revenue"
              >
                {be.operationalBreakEvenRevenue !== null
                  ? formatCurrency(be.operationalBreakEvenRevenue)
                  : "—"}
              </span>
              <span className="tp-home-export-be-subtext">
                Meta operacional do mês
              </span>
            </div>

            {/* B) FALTA VENDER / SUPERADO (Maior destaque visual após o título) */}
            <div
              className={`tp-home-export-be-col is-gap-highlight ${
                isAbove ? "is-above" : ""
              }`}
            >
              <span className="tp-home-export-be-col-label">
                {isAbove ? "Superado" : "Falta vender"}
              </span>
              <span
                className={`tp-home-export-be-col-val is-gap-hero ${
                  isAbove ? "is-emerald" : "is-amber"
                }`}
                data-testid="export-be-gap"
              >
                {isAbove
                  ? formatCurrency(be.surplusRevenue ?? 0)
                  : formatCurrency(be.remainingRevenueNeeded ?? 0)}
              </span>
              <span className="tp-home-export-be-subtext">
                {isAbove ? "Acima do equilíbrio" : "Para o equilíbrio"}
              </span>
            </div>

            {/* C) Progresso */}
            <div className="tp-home-export-be-col">
              <span className="tp-home-export-be-col-label">Progresso</span>
              <span
                className={`tp-home-export-be-col-val ${
                  isAbove ? "is-emerald" : "is-cyan"
                }`}
                data-testid="export-be-progress"
              >
                {be.progressPercent !== null
                  ? formatPercent(be.progressPercent, 1)
                  : "—"}
              </span>
              <span className="tp-home-export-be-subtext">
                {isAbove ? "Superado" : "Do equilíbrio"}
              </span>
            </div>

            {/* D) Média recente */}
            <div className="tp-home-export-be-col">
              <span className="tp-home-export-be-col-label">Média recente</span>
              <span
                className="tp-home-export-be-col-val"
                data-testid="export-be-avg"
              >
                {be.averageOperationalBreakEven !== null
                  ? formatCurrency(be.averageOperationalBreakEven)
                  : "—"}
              </span>
              {avgDiffFormatted ? (
                <span
                  className={`tp-home-export-be-avg-diff ${
                    avgDiffPct && avgDiffPct > 0 ? "is-pos" : "is-neg"
                  }`}
                >
                  {avgDiffFormatted}
                </span>
              ) : (
                <span className="tp-home-export-be-subtext">
                  Referência operacional
                </span>
              )}
            </div>
          </div>

          {/* Barra de Progresso (único local onde o valor faturado aparece dentro da faixa) */}
          <div className="tp-home-export-be-bar-container">
            <div className="tp-home-export-be-bar-labels">
              <span data-testid="export-be-realized">
                {`${formatCurrency(be.realizedRevenue)} de ${
                  be.operationalBreakEvenRevenue !== null
                    ? formatCurrency(be.operationalBreakEvenRevenue)
                    : "—"
                }`}
              </span>
              <span>
                {isAbove
                  ? (be.surplusRevenue && be.surplusRevenue > 0
                      ? `Superado em ${formatCurrency(be.surplusRevenue)}`
                      : "Ponto de equilíbrio superado")
                  : (be.progressPercent !== null
                      ? `${formatPercent(be.progressPercent, 1)}`
                      : "—")}
              </span>
            </div>
            <div className="tp-home-export-be-bar-track">
              <div
                className={`tp-home-export-be-bar-fill ${
                  isAbove ? "is-above" : ""
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(0, be.progressPercent ?? 0),
                  )}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Gráfico Evolução do Faturamento */}
      <div className="tp-home-export-chart-card">
        <div className="tp-home-export-chart-header">
          <div className="tp-home-export-chart-title">
            <span>Evolução do Faturamento</span>
            <span className="tp-home-export-chart-badge">
              {granularity === "daily"
                ? `${chartItems.length} ${chartItems.length === 1 ? "dia" : "dias"}`
                : granularity === "weekly"
                  ? `${chartItems.length} ${chartItems.length === 1 ? "semana" : "semanas"}`
                  : `${chartItems.length} ${chartItems.length === 1 ? "mês" : "meses"}`}
            </span>
          </div>
          <span className="tp-home-export-chart-subtitle">
            {granularity === "daily"
              ? "Acompanhamento diário da receita realizada no período"
              : granularity === "weekly"
                ? "Acompanhamento semanal da receita realizada no período"
                : "Acompanhamento mensal da receita realizada no período"}
          </span>
        </div>

        <div className="tp-home-export-svg-container">
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="tpHomeExportGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0284c7" stopOpacity={0.22} />
                <stop offset="85%" stopColor="#0284c7" stopOpacity={0.03} />
                <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
              </linearGradient>
            </defs>

            {/* Horizontal Grid lines */}
            {yTicks.map((tickVal, i) => {
              const y = paddingTop + plotHeight - (tickVal / maxRevenue) * plotHeight;
              return (
                <g key={i}>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={svgWidth - paddingRight}
                    y2={y}
                    stroke="#cbd5e1"
                    strokeDasharray={i === 0 ? undefined : "3 3"}
                    strokeWidth={1}
                  />
                  <text
                    x={paddingLeft - 8}
                    y={y + 3}
                    fill="#475569"
                    fontSize={10}
                    fontWeight={600}
                    textAnchor="end"
                  >
                    {formatCompactCurrency(tickVal)}
                  </text>
                </g>
              );
            })}

            {/* Area Fill */}
            {areaPolygonPoints && (
              <polygon
                points={areaPolygonPoints}
                fill="url(#tpHomeExportGrad)"
              />
            )}

            {/* Stroke Line */}
            {polylinePoints && (
              <polyline
                points={polylinePoints}
                fill="none"
                stroke="#0284c7"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Dots */}
            {pointsCoords.length <= 31 &&
              pointsCoords.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={pointsCoords.length === 1 ? 5 : 2.8}
                  fill="#0284c7"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              ))}

            {/* X-axis labels */}
            {pointsCoords.map((p, i) => {
              const step = Math.ceil(pointsCoords.length / 12);
              if (i % step !== 0 && i !== pointsCoords.length - 1) return null;
              return (
                <text
                  key={i}
                  x={p.x}
                  y={paddingTop + plotHeight + 16}
                  fill="#475569"
                  fontSize={10}
                  fontWeight={500}
                  textAnchor="middle"
                >
                  {p.item.label}
                </text>
              );
            })}

            {/* Milestone marker: Nineclouds + Hustler no mesmo sistema (03/06/2026) */}
            {milestoneCoord && (
              <g data-testid="export-historical-marker">
                <line
                  x1={milestoneCoord.x}
                  y1={paddingTop}
                  x2={milestoneCoord.x}
                  y2={paddingTop + plotHeight}
                  stroke="#92400e"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                />
                <circle
                  cx={milestoneCoord.x}
                  cy={milestoneCoord.y}
                  r={4}
                  fill="#d97706"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
                <text
                  x={milestoneCoord.x}
                  y={paddingTop - 6}
                  fill="#92400e"
                  fontSize={10}
                  fontWeight={700}
                  textAnchor="middle"
                >
                  Nineclouds + Hustler no mesmo sistema
                </text>
              </g>
            )}
          </svg>
        </div>
      </div>

      {/* Footer */}
      <div className="tp-home-export-footer">
        <span>
          Nineclouds • Performance Comercial ({formattedPeriod})
        </span>
        <span>
          {hasCustomerPage ? "Página 1 de 2" : "Página 1 de 1"}
        </span>
      </div>
    </div>
  );

  // Render Page 2 Content (Customer Intelligence & Commercial Concentration)
  const renderPage2 = (isSheet = false) => {
    if (!hasCustomerPage) return null;
    return (
      <div
        className={isSheet ? "tp-home-export-sheet-section" : "tp-home-export-page"}
        data-export-page="2"
        key="page-2"
      >
        <style>{HOME_EXPORT_REPORT_CSS}</style>
        {/* Header */}
        <div className="tp-home-export-header">
          <div>
            <div className="tp-home-export-brand">TAGPULSE • RELATÓRIO EXECUTIVO</div>
            <h1 className="tp-home-export-title">
              Nineclouds — Performance Comercial · Inteligência de Clientes
            </h1>
            <p className="tp-home-export-subtitle">
              Comportamento, concentração de faturamento e taxa de recorrência
            </p>
          </div>
          <div className="tp-home-export-meta">
            <div>
              Período: <strong>{formattedPeriod}</strong>
            </div>
            <div>
              Data de geração: <strong>{formattedGeneratedAt}</strong>
            </div>
            <div>
              Última sincronização: <strong>{formattedLastSync}</strong>
            </div>
          </div>
        </div>

        {/* 4 Customer KPIs */}
        <div className="tp-home-export-kpi-grid">
          <div className="tp-home-export-kpi-card is-highlight">
            <span className="tp-home-export-kpi-label">Clientes compradores</span>
            <span
              className="tp-home-export-kpi-value is-cyan"
              data-testid="export-cust-buying"
            >
              {formatNumber(customerData?.customers.buyingCustomers ?? 0)}
            </span>
          </div>
          <div className="tp-home-export-kpi-card">
            <span className="tp-home-export-kpi-label">Clientes novos</span>
            <span
              className="tp-home-export-kpi-value"
              data-testid="export-cust-new"
            >
              {formatNumber(customerData?.customers.newCustomers ?? 0)}
            </span>
          </div>
          <div className="tp-home-export-kpi-card">
            <span className="tp-home-export-kpi-label">Clientes recorrentes</span>
            <span
              className="tp-home-export-kpi-value"
              data-testid="export-cust-returning"
            >
              {formatNumber(customerData?.customers.returningCustomers ?? 0)}
            </span>
          </div>
          <div className="tp-home-export-kpi-card">
            <span className="tp-home-export-kpi-label">Taxa de recorrência</span>
            <span
              className="tp-home-export-kpi-value"
              data-testid="export-cust-recurrence"
            >
              {formatPercent(customerData?.customers.recurrenceRate ?? 0)}
            </span>
          </div>
        </div>

        {/* Corpo Página 2 Lado a Lado: Top 5 Clientes (esquerda) + Concentração Comercial e Novos x Recorrentes (direita) */}
        <div className="tp-home-export-p2-split">
          {/* Esquerda: Top 5 Clientes Table */}
          <div className="tp-home-export-table-card">
            <div>
              <div className="tp-home-export-chart-header" style={{ marginBottom: 10 }}>
                <div className="tp-home-export-chart-title">
                  <span>Top 5 Clientes por Faturamento</span>
                  <span className="tp-home-export-chart-badge">
                    Ranking do período
                  </span>
                </div>
                <span className="tp-home-export-chart-subtitle">
                  Principais compradores ordenados por receita realizada
                </span>
              </div>

              <table
                className="tp-home-export-table"
                data-testid="export-top-customers-table"
              >
                <thead>
                  <tr>
                    <th style={{ width: 38 }}>#</th>
                    <th>Cliente</th>
                    <th className="col-right">Faturamento</th>
                    <th className="col-right">Vendas</th>
                    <th className="col-right">Ticket Médio</th>
                    <th className="col-right" style={{ width: 175 }}>
                      % Participação
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topCustomers.map((cust, idx) => (
                    <tr key={cust.customerId || idx}>
                      <td>
                        <span className="tp-home-export-rank-badge">
                          {idx + 1}
                        </span>
                      </td>
                      <td>
                        <strong style={{ color: "#0f172a" }}>
                          {cust.displayName || "Cliente"}
                        </strong>
                        {cust.code && (
                          <span
                            style={{
                              color: "#64748b",
                              fontSize: "10px",
                              marginLeft: 6,
                            }}
                          >
                            ({cust.code})
                          </span>
                        )}
                      </td>
                      <td className="col-right" style={{ fontWeight: 700, color: "#0284c7" }}>
                        {formatCurrency(cust.revenue)}
                      </td>
                      <td className="col-right">{formatNumber(cust.purchaseCount)}</td>
                      <td className="col-right">
                        {formatCurrency(cust.averageTicket)}
                      </td>
                      <td className="col-right">
                        <div className="tp-home-export-share-bar-wrap">
                          <span className="tp-home-export-share-pct-label">
                            {formatPercent(cust.revenueSharePercent, 1)}
                          </span>
                          <div className="tp-home-export-share-bar">
                            <div
                              className="tp-home-export-share-fill"
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.max(4, cust.revenueSharePercent),
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {topCustomers.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        style={{ textAlign: "center", color: "#64748b", padding: 24 }}
                      >
                        Nenhum cliente registrado no período selecionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {topCustomers.length > 0 && (
              <div className="tp-home-export-table-summary-footer">
                <span>
                  Subtotal Top 5:{" "}
                  <strong>{formatCurrency(concentrationMetrics.top5Revenue)}</strong>{" "}
                  ({formatPercent(concentrationMetrics.top5SharePercent, 1)} da receita)
                </span>
                <span>
                  Demais clientes:{" "}
                  <strong>{formatCurrency(concentrationMetrics.othersRevenue)}</strong>{" "}
                  ({formatPercent(concentrationMetrics.othersSharePercent, 1)})
                </span>
              </div>
            )}
          </div>

          {/* Direita: Concentração Comercial & Novos x Recorrentes */}
          <div className="tp-home-export-p2-side">
            {/* Bloco 1: Concentração Comercial */}
            <div
              className="tp-home-export-side-card"
              data-testid="export-commercial-concentration"
            >
              <div className="tp-home-export-chart-header">
                <div className="tp-home-export-chart-title">
                  <span>Concentração Comercial</span>
                </div>
                <span className="tp-home-export-chart-badge">
                  Peso na receita
                </span>
              </div>

              <div className="tp-home-export-conc-grid">
                <div className="tp-home-export-conc-box is-primary">
                  <span className="tp-home-export-conc-label">
                    Top 5 representam
                  </span>
                  <span
                    className="tp-home-export-conc-val is-cyan"
                    data-testid="export-top5-revenue"
                  >
                    {formatCurrency(concentrationMetrics.top5Revenue)}
                  </span>
                  <span
                    className="tp-home-export-conc-share"
                    data-testid="export-top5-share"
                  >
                    {formatPercent(concentrationMetrics.top5SharePercent, 1)} do faturamento
                  </span>
                  <span className="tp-home-export-conc-sub">
                    Acumulado dos 5 maiores
                  </span>
                </div>

                <div className="tp-home-export-conc-box">
                  <span className="tp-home-export-conc-label">
                    Maior cliente
                  </span>
                  <span
                    className="tp-home-export-conc-val"
                    data-testid="export-top1-revenue"
                  >
                    {formatCurrency(concentrationMetrics.top1Revenue)}
                  </span>
                  <span
                    className="tp-home-export-conc-share"
                    data-testid="export-top1-share"
                  >
                    {formatPercent(concentrationMetrics.top1SharePercent, 1)} do faturamento
                  </span>
                  <span className="tp-home-export-conc-sub">
                    {concentrationMetrics.top1Name}
                  </span>
                </div>
              </div>

              <div className="tp-home-export-conc-bar-block">
                <div className="tp-home-export-conc-bar-labels">
                  <span>Distribuição do faturamento por concentração</span>
                  <span>{formatPercent(concentrationMetrics.top5SharePercent, 1)} no Top 5</span>
                </div>
                <div className="tp-home-export-conc-track">
                  <div
                    className="tp-home-export-conc-fill-top1"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(0, concentrationMetrics.top1SharePercent),
                      )}%`,
                    }}
                  />
                  <div
                    className="tp-home-export-conc-fill-top5"
                    style={{
                      width: `${Math.min(
                        100 - Math.min(100, Math.max(0, concentrationMetrics.top1SharePercent)),
                        Math.max(
                          0,
                          concentrationMetrics.top5SharePercent -
                            concentrationMetrics.top1SharePercent,
                        ),
                      )}%`,
                    }}
                  />
                </div>
                <div className="tp-home-export-conc-legend">
                  <span>
                    <i
                      className="tp-home-export-legend-dot"
                      style={{ background: "#0369a1" }}
                    />
                    Top 1 ({formatPercent(concentrationMetrics.top1SharePercent, 1)})
                  </span>
                  <span>
                    <i
                      className="tp-home-export-legend-dot"
                      style={{ background: "#38bdf8" }}
                    />
                    2º ao 5º ({formatPercent(
                      Math.max(
                        0,
                        concentrationMetrics.top5SharePercent -
                          concentrationMetrics.top1SharePercent,
                      ),
                      1,
                    )})
                  </span>
                  <span>
                    <i
                      className="tp-home-export-legend-dot"
                      style={{ background: "#cbd5e1" }}
                    />
                    Demais ({formatPercent(concentrationMetrics.othersSharePercent, 1)})
                  </span>
                </div>
              </div>
            </div>

            {/* Bloco 2: Novos x Recorrentes */}
            <div
              className="tp-home-export-side-card"
              data-testid="export-new-vs-returning"
            >
              <div className="tp-home-export-chart-header">
                <div className="tp-home-export-chart-title">
                  <span>Novos x Recorrentes</span>
                </div>
                <span className="tp-home-export-chart-badge">
                  {formatNumber(concentrationMetrics.buyingCustomers)} compradores
                </span>
              </div>

              <div className="tp-home-export-conc-grid">
                <div className="tp-home-export-conc-box">
                  <span className="tp-home-export-conc-label">
                    Clientes novos
                  </span>
                  <span className="tp-home-export-conc-val">
                    {formatNumber(concentrationMetrics.newCustomers)}
                  </span>
                  <span className="tp-home-export-conc-share" style={{ color: "#475569" }}>
                    {formatPercent(concentrationMetrics.newSharePercent, 1)} da base ativa
                  </span>
                </div>

                <div className="tp-home-export-conc-box is-primary">
                  <span className="tp-home-export-conc-label">
                    Clientes recorrentes
                  </span>
                  <span className="tp-home-export-conc-val is-cyan">
                    {formatNumber(concentrationMetrics.returningCustomers)}
                  </span>
                  <span className="tp-home-export-conc-share">
                    {formatPercent(concentrationMetrics.returningSharePercent, 1)} da base ativa
                  </span>
                </div>
              </div>

              <div className="tp-home-export-conc-bar-block">
                <div className="tp-home-export-conc-track">
                  <div
                    className="tp-home-export-conc-fill-top1"
                    style={{
                      background: "#0284c7",
                      width: `${Math.min(
                        100,
                        Math.max(0, concentrationMetrics.returningSharePercent),
                      )}%`,
                    }}
                  />
                  <div
                    className="tp-home-export-conc-fill-top5"
                    style={{
                      background: "#94a3b8",
                      width: `${Math.min(
                        100,
                        Math.max(0, concentrationMetrics.newSharePercent),
                      )}%`,
                    }}
                  />
                </div>
                <div className="tp-home-export-conc-legend">
                  <span>
                    <i
                      className="tp-home-export-legend-dot"
                      style={{ background: "#0284c7" }}
                    />
                    Recorrentes ({formatPercent(concentrationMetrics.returningSharePercent, 1)})
                  </span>
                  <span>
                    <i
                      className="tp-home-export-legend-dot"
                      style={{ background: "#94a3b8" }}
                    />
                    Novos ({formatPercent(concentrationMetrics.newSharePercent, 1)})
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="tp-home-export-footer">
          <span>
            Nineclouds • Performance Comercial ({formattedPeriod})
          </span>
          <span>Página 2 de 2</span>
        </div>
      </div>
    );
  };

  return (
    <div
      className="tp-home-export-root"
      data-testid="home-export-report"
      data-layout-mode={layoutMode}
    >
      <style>{HOME_EXPORT_REPORT_CSS}</style>
      {layoutMode === "continuous" ? (
        <div className="tp-home-export-sheet" data-export-continuous="true">
          <style>{HOME_EXPORT_REPORT_CSS}</style>
          {renderPage1(true)}
          {hasCustomerPage && renderPage2(true)}
        </div>
      ) : (
        <>
          {renderPage1(false)}
          {renderPage2(false)}
        </>
      )}
    </div>
  );
}
