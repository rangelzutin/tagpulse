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

  /* Break-even Banner — Padronizado com DRE (.tp-dre-export-breakeven-box) */
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
    padding: 2px 9px;
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
    grid-template-columns: 1.4fr 1fr 1fr 1fr;
    gap: 10px;
  }
  .tp-home-export-be-col {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .tp-home-export-be-col-label {
    font-size: 10px;
    font-weight: 700;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .tp-home-export-be-col-val {
    font-size: 16px;
    font-weight: 800;
    color: #0f172a;
    font-variant-numeric: tabular-nums;
  }
  .tp-home-export-be-col-val.is-cyan { color: #0284c7; }
  .tp-home-export-be-col-val.is-emerald { color: #15803d; }
  .tp-home-export-be-col-val.is-amber { color: #92400e; }
  .tp-home-export-be-subtext {
    font-size: 10px;
    color: #64748b;
  }
  .tp-home-export-be-avg {
    font-size: 10px;
    color: #475569;
    margin-top: 2px;
  }
  .tp-home-export-be-avg strong {
    color: #0f172a;
  }
  .tp-home-export-be-avg-diff {
    font-weight: 700;
    margin-left: 4px;
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

  /* Page 2: Customers Table — Padronizado com DRE (.tp-dre-export-table) */
  .tp-home-export-table-card {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 14px 16px;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .tp-home-export-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11.5px;
  }
  .tp-home-export-table th {
    text-align: left;
    color: #475569;
    font-weight: 700;
    text-transform: uppercase;
    font-size: 10.5px;
    letter-spacing: 0.04em;
    padding: 7px 10px;
    background: #f8fafc;
    border-bottom: 2px solid #cbd5e1;
  }
  .tp-home-export-table td {
    padding: 9px 10px;
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
    width: 20px;
    height: 20px;
    border-radius: 4px;
    background: #e0f2fe;
    color: #0369a1;
    border: 1px solid #bae6fd;
    font-weight: 700;
    font-size: 10px;
  }
  .tp-home-export-share-bar-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: flex-end;
  }
  .tp-home-export-share-bar {
    width: 60px;
    height: 6px;
    background: #e2e8f0;
    border-radius: 999px;
    overflow: hidden;
  }
  .tp-home-export-share-fill {
    height: 100%;
    background: #0284c7;
    border-radius: 999px;
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

  // Top 5 Clientes
  const topCustomers = useMemo(() => {
    if (!customerData?.ranking) return [];
    return customerData.ranking.slice(0, 5);
  }, [customerData]);

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

      {/* Bloco de Ponto de Equilíbrio */}
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
            {/* Ponto de equilíbrio */}
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
              {be.averageOperationalBreakEven !== null && (
                <div className="tp-home-export-be-avg">
                  <span>
                    Média recente:{" "}
                    <strong>
                      {formatCurrency(be.averageOperationalBreakEven)}
                    </strong>
                  </span>
                  {avgDiffFormatted && (
                    <span
                      className={`tp-home-export-be-avg-diff ${
                        avgDiffPct && avgDiffPct > 0 ? "is-pos" : "is-neg"
                      }`}
                    >
                      {avgDiffFormatted}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Faturado */}
            <div className="tp-home-export-be-col">
              <span className="tp-home-export-be-col-label">Faturado</span>
              <span
                className="tp-home-export-be-col-val is-cyan"
                data-testid="export-be-realized"
              >
                {formatCurrency(be.realizedRevenue)}
              </span>
              <span className="tp-home-export-be-subtext">
                Receita realizada
              </span>
            </div>

            {/* Falta vender / Superado */}
            <div className="tp-home-export-be-col">
              <span className="tp-home-export-be-col-label">
                {isAbove ? "Superado" : "Falta vender"}
              </span>
              <span
                className={`tp-home-export-be-col-val ${
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

            {/* Progresso */}
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
          </div>

          {/* Barra de Progresso */}
          <div className="tp-home-export-be-bar-container">
            <div className="tp-home-export-be-bar-labels">
              <span>
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

  // Render Page 2 Content (Customer Intelligence)
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

        {/* Top 5 Clientes Table */}
        <div className="tp-home-export-table-card">
          <div className="tp-home-export-chart-header">
            <div className="tp-home-export-chart-title">
              <span>Top 5 Clientes por Faturamento</span>
              <span className="tp-home-export-chart-badge">
                Concentração comercial
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
                <th style={{ width: 40 }}>#</th>
                <th>Cliente</th>
                <th className="col-right">Faturamento</th>
                <th className="col-right">Vendas</th>
                <th className="col-right">Ticket Médio</th>
                <th className="col-right" style={{ width: 140 }}>
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
                      <span>{formatPercent(cust.revenueSharePercent, 1)}</span>
                      <div className="tp-home-export-share-bar">
                        <div
                          className="tp-home-export-share-fill"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(0, cust.revenueSharePercent),
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
