import { useMemo } from "react";
import type {
  DreSummaryDto,
  DreMonthlyItemDto,
  DreBreakdownDto,
  DreBreakdownItemDto,
} from "../../api/financial";
import {
  formatCurrency,
  formatPercent,
  formatDateBr,
} from "../../utils/formatters";
import {
  FinancialDreMonthlyChart,
  formatDrePendingAccruals,
} from "./FinancialDreMonthlyChart";
import { buildAdaptiveDreEvolution } from "./dreEvolutionHelper";
import { formatExportGeneratedAt } from "./dreExportService";
import { calculateBreakEven } from "./dreBreakEvenHelper";

export const DRE_EXPORT_DISCLAIMER_TEXT =
  "Relatório gerencial elaborado a partir dos dados disponíveis no TagPulse. CMV e margens utilizam custo atual estimado quando indicado. Não substitui demonstrações contábeis oficiais.";

export interface FinancialDreExportReportProps {
  companyName?: string;
  period: {
    from: string;
    to: string;
  };
  generatedAt?: Date | string;
  summaryData: DreSummaryDto;
  monthlyData: DreMonthlyItemDto[];
  breakdownData: DreBreakdownDto | null;
  layoutMode?: "paginated" | "continuous";
}

const DRE_EXPORT_REPORT_CSS = `
  .tp-dre-export-sheet,
  .tp-dre-export-page {
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #ffffff;
    color: #0f172a;
    box-sizing: border-box;
    width: 840px;
    padding: 32px 36px;
    line-height: 1.4;
    -webkit-font-smoothing: antialiased;
  }
  .tp-dre-export-page {
    height: 1188px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    background: #ffffff;
    page-break-after: always;
    break-after: page;
  }
  .tp-dre-export-page-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    flex: 1;
  }
  .tp-dre-export-continuous-body {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .tp-dre-export-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #0f172a;
    padding-bottom: 14px;
  }
  .tp-dre-export-brand-eyebrow {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #0284c7;
    margin-bottom: 2px;
  }
  .tp-dre-export-company {
    font-size: 22px;
    font-weight: 800;
    color: #0f172a;
    margin: 0;
    letter-spacing: -0.02em;
  }
  .tp-dre-export-title {
    font-size: 15px;
    font-weight: 600;
    color: #334155;
    margin: 2px 0 0 0;
  }
  .tp-dre-export-meta {
    text-align: right;
    font-size: 12px;
    color: #334155;
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: flex-end;
  }
  .tp-dre-export-meta-row strong {
    color: #0f172a;
    font-weight: 700;
  }
  .tp-dre-export-badges {
    display: flex;
    gap: 6px;
    margin-top: 4px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .tp-export-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
  }
  .tp-export-pill.is-profit {
    background: #dcfce7;
    color: #166534;
    border: 1px solid #86efac;
  }
  .tp-export-pill.is-loss {
    background: #ffe4e6;
    color: #9f1239;
    border: 1px solid #fda4af;
  }
  .tp-export-pill.is-even {
    background: #f1f5f9;
    color: #334155;
    border: 1px solid #cbd5e1;
  }
  .tp-export-pill.is-provisional {
    background: #fef3c7;
    color: #92400e;
    border: 1px solid #fcd34d;
  }
  .tp-export-pill.is-closed {
    background: #e0f2fe;
    color: #075985;
    border: 1px solid #7dd3fc;
  }
  .tp-dre-export-mini-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 8px;
    font-size: 12px;
    color: #475569;
  }
  .tp-dre-export-mini-header strong {
    color: #0f172a;
    font-weight: 700;
  }
  .tp-dre-export-kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }
  .tp-dre-export-kpi-card {
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 6px;
  }
  .tp-dre-export-kpi-card.is-profit {
    background: #f0fdf4;
    border-color: #86efac;
  }
  .tp-dre-export-kpi-card.is-loss {
    background: #fff1f2;
    border-color: #fda4af;
  }
  .tp-dre-export-kpi-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #475569;
  }
  .tp-dre-export-kpi-value {
    font-size: 18px;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.02em;
  }
  .tp-dre-export-kpi-value.is-positive {
    color: #15803d;
  }
  .tp-dre-export-kpi-value.is-negative {
    color: #be123c;
  }
  .tp-dre-export-kpi-foot {
    font-size: 11px;
    color: #475569;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .tp-dre-export-secondary-strip {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 10px 12px;
  }
  .tp-dre-export-sec-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    border-right: 1px solid #cbd5e1;
    padding-right: 8px;
  }
  .tp-dre-export-sec-item:last-child {
    border-right: none;
    padding-right: 0;
  }
  .tp-dre-export-sec-label {
    font-size: 10px;
    font-weight: 600;
    color: #475569;
    text-transform: uppercase;
  }
  .tp-dre-export-sec-value {
    font-size: 13px;
    font-weight: 700;
    color: #0f172a;
  }
  .tp-dre-export-sec-value.is-negative {
    color: #be123c;
  }
  .tp-dre-export-sec-value.is-positive {
    color: #15803d;
  }
  .tp-dre-export-breakeven-box {
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: #f8fafc;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .tp-dre-export-breakeven-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .tp-dre-export-breakeven-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    color: #334155;
    letter-spacing: 0.04em;
  }
  .tp-dre-export-breakeven-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .tp-dre-export-be-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .tp-dre-export-be-label {
    font-size: 10px;
    color: #64748b;
    font-weight: 600;
  }
  .tp-dre-export-be-value {
    font-size: 14px;
    font-weight: 700;
    color: #0f172a;
  }
  .tp-dre-export-be-subtext {
    font-size: 9.5px;
    color: #64748b;
  }
  .tp-dre-export-breakeven-context {
    font-size: 10.5px;
    color: #475569;
    border-top: 1px solid #e2e8f0;
    padding-top: 6px;
    display: flex;
    gap: 12px;
  }
  .tp-dre-export-section-box {
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: #ffffff;
    padding: 14px 16px;
  }
  .tp-dre-export-section-box .tp-dre-monthly-card {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
    margin: 0 !important;
  }
  .tp-dre-export-section-box .tp-card-header {
    padding: 0 0 8px 0 !important;
    margin-bottom: 8px !important;
    border-bottom: 1px solid #e2e8f0 !important;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .tp-dre-export-section-box .tp-card-title {
    color: #0f172a !important;
    font-size: 14px !important;
    font-weight: 700 !important;
    margin: 0 !important;
  }
  .tp-dre-export-section-box .tp-card-subtitle {
    color: #64748b !important;
    font-size: 11px !important;
    margin: 2px 0 0 0 !important;
  }
  .tp-dre-export-section-box .tp-dre-monthly-controls {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }
  .tp-dre-export-section-box .tp-badge-context-window {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #e0f2fe;
    color: #0369a1;
    border: 1px solid #7dd3fc;
    border-radius: 999px;
    padding: 2px 8px;
    font-size: 10px;
    font-weight: 700;
  }
  .tp-dre-export-section-box .tp-badge-provisional-legend {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #fef3c7;
    color: #92400e;
    border: 1px solid #fcd34d;
    border-radius: 999px;
    padding: 2px 8px;
    font-size: 10px;
    font-weight: 700;
  }
  .tp-dre-export-chart-meta {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #e2e8f0;
    font-size: 11px;
    color: #334155;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .tp-dre-export-chart-legend-items {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    align-items: center;
  }
  .tp-dre-export-chart-pending {
    color: #92400e;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 11px;
  }
  .tp-dre-export-section-title {
    font-size: 14px;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 2px 0;
  }
  .tp-dre-export-section-subtitle {
    font-size: 11px;
    color: #64748b;
    margin: 0 0 10px 0;
  }
  .tp-dre-export-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11.5px;
  }
  .tp-dre-export-table th {
    text-align: left;
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #475569;
    border-bottom: 2px solid #cbd5e1;
    padding: 6px 8px;
    background: #f8fafc;
  }
  .tp-dre-export-table th.is-right,
  .tp-dre-export-table td.is-right {
    text-align: right;
  }
  .tp-dre-export-table td {
    padding: 4.5px 8px;
    border-bottom: 1px solid #e2e8f0;
    color: #1e293b;
  }
  .tp-dre-export-table tr.is-main td {
    font-weight: 700;
    background: #f8fafc;
    color: #0f172a;
  }
  .tp-dre-export-table tr.is-subtotal td {
    font-weight: 700;
    background: #f1f5f9;
    color: #0f172a;
    border-top: 1px solid #cbd5e1;
    border-bottom: 1px solid #cbd5e1;
  }
  .tp-dre-export-table tr.is-highlight td {
    font-weight: 800;
    background: #f0f9ff;
    color: #0c4a6e;
    border-top: 1px solid #bae6fd;
    border-bottom: 1px solid #bae6fd;
  }
  .tp-dre-export-table tr.is-subitem td {
    color: #475569;
    font-size: 11px;
  }
  .tp-dre-export-table tr.is-subitem td.is-indent {
    padding-left: 24px;
  }
  .tp-dre-export-table tr.is-final td {
    font-size: 12.5px;
    font-weight: 800;
    padding: 8px;
    border-top: 2px solid #0f172a;
    border-bottom: 2px solid #0f172a;
  }
  .tp-dre-export-table tr.is-final.is-profit td {
    background: #dcfce7;
    color: #14532d;
  }
  .tp-dre-export-table tr.is-final.is-loss td {
    background: #ffe4e6;
    color: #881337;
  }
  .tp-dre-export-table td.is-deduction {
    color: #b91c1c;
  }
  .tp-dre-export-table td.is-positive {
    color: #15803d;
  }
  .tp-dre-export-bar-cell {
    width: 120px;
  }
  .tp-dre-export-bar-track {
    width: 100%;
    height: 7px;
    background: #e2e8f0;
    border-radius: 999px;
    overflow: hidden;
  }
  .tp-dre-export-bar-fill {
    height: 100%;
    background: #0284c7;
    border-radius: 999px;
  }
  .tp-dre-export-quality-box {
    border-radius: 8px;
    padding: 12px 14px;
    font-size: 11.5px;
  }
  .tp-dre-export-quality-box.is-provisional {
    background: #fffbeb;
    border: 1px solid #f59e0b;
    color: #78350f;
  }
  .tp-dre-export-quality-box.is-closed {
    background: #f0f9ff;
    border: 1px solid #bae6fd;
    color: #0c4a6e;
  }
  .tp-dre-export-quality-title {
    font-weight: 700;
    margin-bottom: 4px;
    font-size: 12px;
  }
  .tp-dre-export-disclaimer {
    border-top: 1px solid #cbd5e1;
    padding-top: 10px;
    font-size: 10.5px;
    color: #475569;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 16px;
  }
  .tp-dre-export-page-footer {
    border-top: 1px solid #e2e8f0;
    padding-top: 8px;
    font-size: 10.5px;
    color: #64748b;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
`;

function getNatureLabel(group: DreBreakdownItemDto["group"]): string {
  switch (group) {
    case "VARIABLE_EXPENSE":
      return "Variável";
    case "OPERATING_EXPENSE":
      return "Operacional";
    case "FINANCIAL_RESULT":
      return "Financeiro";
    case "OTHER_RESULT":
      return "Outros";
    default:
      return "Gerencial";
  }
}

export function FinancialDreExportReport({
  companyName = "Nineclouds",
  period,
  generatedAt,
  summaryData,
  monthlyData,
  breakdownData,
  layoutMode = "paginated",
}: FinancialDreExportReportProps) {
  const { totals, dataQuality } = summaryData;
  const formattedGeneratedAt = useMemo(
    () => formatExportGeneratedAt(generatedAt ?? new Date()),
    [generatedAt],
  );

  const evolution = useMemo(
    () => buildAdaptiveDreEvolution(monthlyData, period),
    [monthlyData, period],
  );

  const isProvisional =
    dataQuality.isProvisional || evolution.hasProvisionalInVisibleChart;

  const allPendingAccrualCodes = useMemo(() => {
    const codes = [
      ...(dataQuality.pendingAccruals ?? []),
      ...evolution.chartBuckets.flatMap(
        (b) => b.dataQuality.pendingAccruals ?? [],
      ),
    ];
    return formatDrePendingAccruals(codes);
  }, [dataQuality.pendingAccruals, evolution.chartBuckets]);

  const relevantBreakdownCategories = useMemo(() => {
    if (!breakdownData || !breakdownData.categories) return [];
    return breakdownData.categories
      .filter((c) => c.group !== "NON_DRE" && c.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [breakdownData]);

  const maxBreakdownAmount =
    relevantBreakdownCategories.length > 0
      ? relevantBreakdownCategories[0]!.amount
      : 1;

  const safeRevenue = totals.realizedRevenue > 0 ? totals.realizedRevenue : 1;
  const calcShare = (val: number) => {
    if (totals.realizedRevenue <= 0) return "—";
    return formatPercent((val / safeRevenue) * 100, 2);
  };

  const hasFullManagerialResult =
    totals.fullManagerialResultAvailable !== false && totals.netManagerialResult !== null;
  const isProfit = hasFullManagerialResult && (totals.netManagerialResult ?? 0) > 0;
  const isLoss = hasFullManagerialResult && (totals.netManagerialResult ?? 0) < 0;
  const statusLabel = !hasFullManagerialResult
    ? "Parcial"
    : totals.status === "PROFIT"
    ? "Lucro"
    : totals.status === "LOSS"
    ? "Prejuízo"
    : "Equilíbrio";

  // 1. CABEÇALHO
  const headerSection = (
    <header
      className="tp-dre-export-header"
      data-testid="dre-export-header"
      data-export-section="1-header"
    >
      <div>
        <div className="tp-dre-export-brand-eyebrow">TAGPULSE • RELATÓRIO EXECUTIVO</div>
        <h1 className="tp-dre-export-company">{companyName}</h1>
        <h2 className="tp-dre-export-title">DRE Gerencial</h2>
      </div>

      <div className="tp-dre-export-meta">
        <div className="tp-dre-export-meta-row">
          <strong>Período:</strong>{" "}
          {`${formatDateBr(period.from)} a ${formatDateBr(period.to)}`}
        </div>
        <div className="tp-dre-export-meta-row">
          <strong>Gerado em:</strong> {formattedGeneratedAt}
        </div>
        <div className="tp-dre-export-badges">
          <span
            className={`tp-export-pill ${
              isProfit ? "is-profit" : isLoss ? "is-loss" : "is-even"
            }`}
          >
            {statusLabel}
          </span>
          {isProvisional ? (
            <span className="tp-export-pill is-provisional">
              Competência Provisória
            </span>
          ) : (
            <span className="tp-export-pill is-closed">
              Competência Fechada
            </span>
          )}
        </div>
      </div>
    </header>
  );

  // 2. KPIs PRINCIPAIS
  const kpisSection = (
    <section
      className="tp-dre-export-kpi-grid"
      aria-label="KPIs Principais do Relatório"
      data-testid="dre-export-kpis"
      data-export-section="2-kpis"
    >
      <div className="tp-dre-export-kpi-card">
        <span className="tp-dre-export-kpi-label">Receita Realizada</span>
        <span className="tp-dre-export-kpi-value">
          {formatCurrency(totals.realizedRevenue)}
        </span>
        <div className="tp-dre-export-kpi-foot">
          <span>Faturamento líquido faturado no período</span>
        </div>
      </div>

      <div className="tp-dre-export-kpi-card">
        <span className="tp-dre-export-kpi-label">Margem de Contribuição</span>
        <span className="tp-dre-export-kpi-value">
          {formatCurrency(totals.contributionMargin)}
        </span>
        <div className="tp-dre-export-kpi-foot">
          <strong>
            {totals.contributionMarginPercent !== null
              ? formatPercent(totals.contributionMarginPercent, 2)
              : "—"}
          </strong>
          <span>Após CMV e desp. variáveis</span>
        </div>
      </div>

      <div
        className={`tp-dre-export-kpi-card ${
          isProfit ? "is-profit" : isLoss ? "is-loss" : ""
        }`}
      >
        <span className="tp-dre-export-kpi-label">
          Resultado Líquido Gerencial Estimado
        </span>
        <span
          className={`tp-dre-export-kpi-value ${
            isProfit ? "is-positive" : isLoss ? "is-negative" : ""
          }`}
        >
          {hasFullManagerialResult
            ? formatCurrency(totals.netManagerialResult as number)
            : "Indisponível"}
        </span>
        <div className="tp-dre-export-kpi-foot">
          <strong>{statusLabel}</strong>
          {!hasFullManagerialResult && (
            <span>• Cobertura parcial</span>
          )}
          {isProvisional && <span>• Provisório</span>}
        </div>
      </div>

      <div className="tp-dre-export-kpi-card">
        <span className="tp-dre-export-kpi-label">
          Margem Líquida Gerencial Estimada
        </span>
        <span
          className={`tp-dre-export-kpi-value ${
            totals.netManagerialMarginPercent !== null &&
            totals.netManagerialMarginPercent < 0
              ? "is-negative"
              : totals.netManagerialMarginPercent !== null &&
                totals.netManagerialMarginPercent > 0
              ? "is-positive"
              : ""
          }`}
        >
          {totals.netManagerialMarginPercent !== null
            ? formatPercent(totals.netManagerialMarginPercent, 2)
            : "—"}
        </span>
        <div className="tp-dre-export-kpi-foot">
          <span>Sobre a receita realizada</span>
        </div>
      </div>
    </section>
  );

  // 3. MÉTRICAS SECUNDÁRIAS
  const secondaryMetricsSection = (
    <section
      className="tp-dre-export-secondary-strip"
      aria-label="Métricas Secundárias do Relatório"
      data-testid="dre-export-secondary"
      data-export-section="3-secondary"
    >
      <div className="tp-dre-export-sec-item">
        <span className="tp-dre-export-sec-label">
          CMV Estimado ao Custo Atual
        </span>
        <span className="tp-dre-export-sec-value">
          {formatCurrency(totals.estimatedCOGS)}
        </span>
      </div>
      <div className="tp-dre-export-sec-item">
        <span className="tp-dre-export-sec-label">Lucro Bruto Estimado</span>
        <span className="tp-dre-export-sec-value">
          {formatCurrency(totals.estimatedGrossProfit)}
        </span>
      </div>
      <div className="tp-dre-export-sec-item">
        <span className="tp-dre-export-sec-label">Margem Bruta Estimada</span>
        <span className="tp-dre-export-sec-value">
          {totals.estimatedGrossMarginPercent !== null
            ? formatPercent(totals.estimatedGrossMarginPercent, 2)
            : "—"}
        </span>
      </div>
      <div className="tp-dre-export-sec-item">
        <span className="tp-dre-export-sec-label">Despesas Operacionais</span>
        <span className="tp-dre-export-sec-value">
          {formatCurrency(totals.operatingExpenses.total)}
        </span>
      </div>
      <div className="tp-dre-export-sec-item">
        <span className="tp-dre-export-sec-label">Resultado Financeiro</span>
        <span
          className={`tp-dre-export-sec-value ${
            totals.financialResult.total < 0
              ? "is-negative"
              : totals.financialResult.total > 0
              ? "is-positive"
              : ""
          }`}
        >
          {formatCurrency(totals.financialResult.total)}
        </span>
      </div>
    </section>
  );

  // 3B. PONTO DE EQUILÍBRIO
  const breakEven =
    totals.breakEven ??
    calculateBreakEven(
      totals.realizedRevenue,
      totals.contributionMargin,
      totals.fullManagerialResultAvailable ? totals.netManagerialResult : null,
      {
        costCoveragePercent: totals.costCoveragePercent,
        fullCoverage: totals.fullManagerialResultAvailable,
      },
    );

  const isBeAbove =
    breakEven.status === "PROFITABLE" || breakEven.status === "ABOVE_BREAK_EVEN";
  const isBeBelow =
    breakEven.status === "UNREACHED" || breakEven.status === "BELOW_BREAK_EVEN";
  const isBeUnviable =
    breakEven.status === "UNDETERMINED_ZERO_MARGIN" ||
    breakEven.status === "UNVIABLE_MARGIN";
  const isBeNoRevenue =
    breakEven.status === "UNDETERMINED_ZERO_REVENUE" ||
    breakEven.status === "UNDETERMINED_NO_REVENUE_WITH_COSTS" ||
    breakEven.status === "NO_REVENUE";
  const isBePartial = breakEven.status === "UNDETERMINED_PARTIAL_COST_COVERAGE";

  const breakEvenSection = (
    <section
      className="tp-dre-export-breakeven-box"
      aria-label="Ponto de Equilíbrio no Relatório"
      data-testid="dre-export-breakeven"
      data-export-section="3b-breakeven"
    >
      <div className="tp-dre-export-breakeven-header">
        <span className="tp-dre-export-breakeven-title">Ponto de Equilíbrio</span>
        <span style={{ fontSize: "10px", color: "#64748b" }}>
          Estimativa de faturamento para zerar o resultado gerencial
        </span>
      </div>

      {isBePartial ? (
        <div style={{ padding: "4px 0", fontSize: "11px", color: "#0284c7", fontWeight: 600 }}>
          Ponto de equilíbrio indisponível por cobertura parcial de custos (CMV incompleto no período).
        </div>
      ) : isBeUnviable ? (
        <div style={{ padding: "4px 0", fontSize: "11px", color: "#be123c", fontWeight: 600 }}>
          Margem de contribuição insuficiente para calcular o ponto de equilíbrio (aumento de faturamento isoladamente não elimina o prejuízo).
        </div>
      ) : isBeNoRevenue ? (
        <div style={{ padding: "4px 0", fontSize: "11px", color: "#64748b" }}>
          Sem faturamento realizado no período para estimar ponto de equilíbrio.
        </div>
      ) : (
        <>
          <div className="tp-dre-export-breakeven-grid">
            <div className="tp-dre-export-be-card">
              <span className="tp-dre-export-be-label">Faturamento de Equilíbrio</span>
              <span className="tp-dre-export-be-value">
                {breakEven.breakEvenRevenue !== null
                  ? formatCurrency(breakEven.breakEvenRevenue)
                  : "—"}
              </span>
              <span className="tp-dre-export-be-subtext">
                {isBeAbove ? "Superado no período" : "Meta para resultado zero"}
              </span>
            </div>

            <div className="tp-dre-export-be-card">
              <span className="tp-dre-export-be-label">Gap para Equilíbrio</span>
              <span
                className="tp-dre-export-be-value"
                style={{
                  color: isBeAbove ? "#15803d" : "#be123c",
                }}
              >
                {isBeAbove
                  ? "R$ 0,00"
                  : breakEven.additionalRevenueNeeded !== null
                  ? formatCurrency(breakEven.additionalRevenueNeeded)
                  : "—"}
              </span>
              <span className="tp-dre-export-be-subtext">
                {isBeAbove ? "Resultado positivo atingido" : "Faturamento adicional necessário"}
              </span>
            </div>

            <div className="tp-dre-export-be-card">
              <span className="tp-dre-export-be-label">Aumento Necessário</span>
              <span className="tp-dre-export-be-value">
                {isBeAbove
                  ? "0,0%"
                  : breakEven.additionalRevenuePercent !== null
                  ? `+${formatPercent(breakEven.additionalRevenuePercent, 1)}`
                  : "—"}
              </span>
              <span className="tp-dre-export-be-subtext">
                {isBeAbove ? "Acima da meta de equilíbrio" : "Sobre o faturamento realizado"}
              </span>
            </div>
          </div>

          <div className="tp-dre-export-breakeven-context">
            <span>
              Faturamento: <strong>{formatCurrency(breakEven.realizedRevenue)}</strong>
            </span>
            <span>•</span>
            <span>
              Margem de Contribuição:{" "}
              <strong style={{ color: "#0d9488" }}>
                {totals.contributionMarginPercent !== null
                  ? formatPercent(totals.contributionMarginPercent, 1)
                  : breakEven.contributionMarginRate !== null
                  ? formatPercent(breakEven.contributionMarginRate * 100, 1)
                  : "—"}
              </strong>
            </span>
            <span>•</span>
            <span>
              Resultado Gerencial:{" "}
              <strong
                style={{
                  color:
                    breakEven.netResult !== null && breakEven.netResult > 0
                      ? "#15803d"
                      : breakEven.netResult !== null && breakEven.netResult < 0
                      ? "#be123c"
                      : "#334155",
                }}
              >
                {breakEven.netResult !== null
                  ? formatCurrency(breakEven.netResult)
                  : "Indisponível"}
              </strong>
            </span>
          </div>
        </>
      )}
    </section>
  );

  // 4. EVOLUÇÃO MENSAL DO RESULTADO — GRÁFICO
  const chartSection = (
    <section
      className="tp-dre-export-section-box"
      aria-label="Evolução Mensal do Resultado no Relatório"
      data-testid="dre-export-chart-section"
      data-export-section="4-chart"
    >
      <FinancialDreMonthlyChart
        monthlyData={monthlyData}
        period={period}
        mode="export"
        exportWidth={736}
        exportHeight={240}
      />
    </section>
  );

  // 5. DEMONSTRATIVO DO RESULTADO — DRE
  const dreTableSection = (
    <section
      className="tp-dre-export-section-box"
      aria-label="Demonstrativo do Resultado do Exercício no Relatório"
      data-testid="dre-export-dre-table"
      data-export-section="5-dre-table"
    >
      <h3 className="tp-dre-export-section-title">
        Demonstrativo do Resultado — DRE
      </h3>
      <p className="tp-dre-export-section-subtitle">
        Estrutura vertical gerencial por competência com participação sobre a receita realizada ({formatDateBr(period.from)} a {formatDateBr(period.to)}).
      </p>

      <table className="tp-dre-export-table">
        <thead>
          <tr>
            <th>Linha Econômica</th>
            <th className="is-right">Valor (R$)</th>
            <th className="is-right">% da Receita</th>
          </tr>
        </thead>
        <tbody>
          <tr className="is-main">
            <td>Receita Realizada</td>
            <td className="is-right">{formatCurrency(totals.realizedRevenue)}</td>
            <td className="is-right">100,00%</td>
          </tr>

          <tr>
            <td>(-) CMV estimado ao custo atual</td>
            <td className="is-right is-deduction">
              -{formatCurrency(totals.estimatedCOGS)}
            </td>
            <td className="is-right">{calcShare(totals.estimatedCOGS)}</td>
          </tr>

          <tr className="is-subtotal">
            <td>(=) Lucro Bruto estimado</td>
            <td className="is-right">
              {formatCurrency(totals.estimatedGrossProfit)}
            </td>
            <td className="is-right">
              {totals.estimatedGrossMarginPercent !== null
                ? formatPercent(totals.estimatedGrossMarginPercent, 2)
                : "—"}
            </td>
          </tr>

          <tr className="is-subtotal">
            <td>(-) Despesas Variáveis</td>
            <td className="is-right is-deduction">
              -{formatCurrency(totals.variableExpenses.total)}
            </td>
            <td className="is-right">
              {calcShare(totals.variableExpenses.total)}
            </td>
          </tr>
          <tr className="is-subitem">
            <td className="is-indent">Taxas de Pagamento</td>
            <td className="is-right">
              {formatCurrency(totals.variableExpenses.paymentFees)}
            </td>
            <td className="is-right">
              {calcShare(totals.variableExpenses.paymentFees)}
            </td>
          </tr>
          <tr className="is-subitem">
            <td className="is-indent">Impostos sobre Vendas</td>
            <td className="is-right">
              {formatCurrency(totals.variableExpenses.taxesOnRevenue)}
            </td>
            <td className="is-right">
              {calcShare(totals.variableExpenses.taxesOnRevenue)}
            </td>
          </tr>
          <tr className="is-subitem">
            <td className="is-indent">Fretes / Logística</td>
            <td className="is-right">
              {formatCurrency(totals.variableExpenses.freightLogistics)}
            </td>
            <td className="is-right">
              {calcShare(totals.variableExpenses.freightLogistics)}
            </td>
          </tr>
          <tr className="is-subitem">
            <td className="is-indent">Comissões</td>
            <td className="is-right">
              {formatCurrency(totals.variableExpenses.salesCommissions)}
            </td>
            <td className="is-right">
              {calcShare(totals.variableExpenses.salesCommissions)}
            </td>
          </tr>
          <tr className="is-subitem">
            <td className="is-indent">Outras Despesas Variáveis</td>
            <td className="is-right">
              {formatCurrency(totals.variableExpenses.other)}
            </td>
            <td className="is-right">
              {calcShare(totals.variableExpenses.other)}
            </td>
          </tr>

          <tr className="is-highlight">
            <td>(=) Margem de Contribuição</td>
            <td className="is-right">
              {formatCurrency(totals.contributionMargin)}
            </td>
            <td className="is-right">
              {totals.contributionMarginPercent !== null
                ? formatPercent(totals.contributionMarginPercent, 2)
                : "—"}
            </td>
          </tr>

          <tr className="is-subtotal">
            <td>(-) Despesas Operacionais</td>
            <td className="is-right is-deduction">
              -{formatCurrency(totals.operatingExpenses.total)}
            </td>
            <td className="is-right">
              {calcShare(totals.operatingExpenses.total)}
            </td>
          </tr>
          <tr className="is-subitem">
            <td className="is-indent">Pessoal / Encargos</td>
            <td className="is-right">
              {formatCurrency(totals.operatingExpenses.personnel)}
            </td>
            <td className="is-right">
              {calcShare(totals.operatingExpenses.personnel)}
            </td>
          </tr>
          <tr className="is-subitem">
            <td className="is-indent">Pró-labore</td>
            <td className="is-right">
              {formatCurrency(totals.operatingExpenses.partnerCompensation)}
            </td>
            <td className="is-right">
              {calcShare(totals.operatingExpenses.partnerCompensation)}
            </td>
          </tr>
          <tr className="is-subitem">
            <td className="is-indent">Marketing</td>
            <td className="is-right">
              {formatCurrency(totals.operatingExpenses.marketing)}
            </td>
            <td className="is-right">
              {calcShare(totals.operatingExpenses.marketing)}
            </td>
          </tr>
          <tr className="is-subitem">
            <td className="is-indent">Ocupação</td>
            <td className="is-right">
              {formatCurrency(totals.operatingExpenses.occupancy)}
            </td>
            <td className="is-right">
              {calcShare(totals.operatingExpenses.occupancy)}
            </td>
          </tr>
          <tr className="is-subitem">
            <td className="is-indent">Utilidades</td>
            <td className="is-right">
              {formatCurrency(totals.operatingExpenses.utilities)}
            </td>
            <td className="is-right">
              {calcShare(totals.operatingExpenses.utilities)}
            </td>
          </tr>
          <tr className="is-subitem">
            <td className="is-indent">Software</td>
            <td className="is-right">
              {formatCurrency(totals.operatingExpenses.software)}
            </td>
            <td className="is-right">
              {calcShare(totals.operatingExpenses.software)}
            </td>
          </tr>
          <tr className="is-subitem">
            <td className="is-indent">Contabilidade</td>
            <td className="is-right">
              {formatCurrency(totals.operatingExpenses.accounting)}
            </td>
            <td className="is-right">
              {calcShare(totals.operatingExpenses.accounting)}
            </td>
          </tr>
          <tr className="is-subitem">
            <td className="is-indent">Infraestrutura</td>
            <td className="is-right">
              {formatCurrency(totals.operatingExpenses.infrastructure)}
            </td>
            <td className="is-right">
              {calcShare(totals.operatingExpenses.infrastructure)}
            </td>
          </tr>
          <tr className="is-subitem">
            <td className="is-indent">Administrativo</td>
            <td className="is-right">
              {formatCurrency(totals.operatingExpenses.administrative)}
            </td>
            <td className="is-right">
              {calcShare(totals.operatingExpenses.administrative)}
            </td>
          </tr>
          <tr className="is-subitem">
            <td className="is-indent">Outros</td>
            <td className="is-right">
              {formatCurrency(totals.operatingExpenses.other)}
            </td>
            <td className="is-right">
              {calcShare(totals.operatingExpenses.other)}
            </td>
          </tr>

          <tr className="is-subtotal">
            <td>(+/-) Resultado Financeiro</td>
            <td
              className={`is-right ${
                totals.financialResult.total < 0
                  ? "is-deduction"
                  : totals.financialResult.total > 0
                  ? "is-positive"
                  : ""
              }`}
            >
              {formatCurrency(totals.financialResult.total)}
            </td>
            <td className="is-right">
              {calcShare(Math.abs(totals.financialResult.total))}
            </td>
          </tr>
          <tr className="is-subitem">
            <td className="is-indent">(+) Receitas Financeiras</td>
            <td className="is-right is-positive">
              {formatCurrency(totals.financialResult.financialIncome)}
            </td>
            <td className="is-right">
              {calcShare(totals.financialResult.financialIncome)}
            </td>
          </tr>
          <tr className="is-subitem">
            <td className="is-indent">(-) Despesas Financeiras</td>
            <td className="is-right is-deduction">
              -{formatCurrency(totals.financialResult.financialExpenses)}
            </td>
            <td className="is-right">
              {calcShare(totals.financialResult.financialExpenses)}
            </td>
          </tr>

          <tr className="is-subtotal">
            <td>(+/-) Outros Resultados</td>
            <td className="is-right">
              {formatCurrency(totals.otherResult.total)}
            </td>
            <td className="is-right">
              {calcShare(Math.abs(totals.otherResult.total))}
            </td>
          </tr>
          <tr className="is-subitem">
            <td className="is-indent">(+) Outras Receitas Operacionais</td>
            <td className="is-right">
              {formatCurrency(totals.otherResult.otherIncome)}
            </td>
            <td className="is-right">
              {calcShare(totals.otherResult.otherIncome)}
            </td>
          </tr>
          <tr className="is-subitem">
            <td className="is-indent">(-) Outras Despesas Operacionais</td>
            <td className="is-right is-deduction">
              -{formatCurrency(totals.otherResult.otherExpenses)}
            </td>
            <td className="is-right">
              {calcShare(totals.otherResult.otherExpenses)}
            </td>
          </tr>

          <tr
            className={`is-final ${
              isProfit ? "is-profit" : isLoss ? "is-loss" : ""
            }`}
          >
            <td>
              (=) Resultado Líquido Gerencial Estimado ({statusLabel})
            </td>
            <td className="is-right">
              {hasFullManagerialResult
                ? formatCurrency(totals.netManagerialResult as number)
                : "Indisponível (cobertura parcial)"}
            </td>
            <td className="is-right">
              {hasFullManagerialResult && totals.netManagerialMarginPercent !== null
                ? formatPercent(totals.netManagerialMarginPercent, 2)
                : "—"}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );

  // 6. COMPOSIÇÃO DAS DESPESAS
  const breakdownSection = (
    <section
      className="tp-dre-export-section-box"
      aria-label="Composição das Despesas no Relatório"
      data-testid="dre-export-breakdown"
      data-export-section="6-breakdown"
    >
      <h3 className="tp-dre-export-section-title">Composição das Despesas</h3>
      <p className="tp-dre-export-section-subtitle">
        Ranking executivo por categoria econômica e representatividade sobre a receita realizada.
      </p>

      {relevantBreakdownCategories.length === 0 ? (
        <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
          Nenhuma despesa registrada no período selecionado.
        </p>
      ) : (
        <table className="tp-dre-export-table">
          <thead>
            <tr>
              <th>Categoria</th>
              <th>Natureza</th>
              <th className="is-right">Registros</th>
              <th className="tp-dre-export-bar-cell">Representatividade</th>
              <th className="is-right">Valor (R$)</th>
              <th className="is-right">Participação</th>
            </tr>
          </thead>
          <tbody>
            {relevantBreakdownCategories.map((cat) => {
              const barPct = Math.min(
                100,
                Math.max(4, (cat.amount / maxBreakdownAmount) * 100),
              );
              return (
                <tr key={cat.economicCategory}>
                  <td>
                    <strong>{cat.label}</strong>
                  </td>
                  <td>{getNatureLabel(cat.group)}</td>
                  <td className="is-right">{cat.recordCount}</td>
                  <td className="tp-dre-export-bar-cell">
                    <div className="tp-dre-export-bar-track">
                      <div
                        className="tp-dre-export-bar-fill"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </td>
                  <td className="is-right">
                    <strong>{formatCurrency(cat.amount)}</strong>
                  </td>
                  <td className="is-right">
                    {cat.shareOfRevenuePercent !== null
                      ? formatPercent(cat.shareOfRevenuePercent, 2)
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );

  // 7. QUALIDADE / OBSERVAÇÕES
  const qualitySection = (
    <section
      className={`tp-dre-export-quality-box ${
        isProvisional ? "is-provisional" : "is-closed"
      }`}
      aria-label="Qualidade Temporal e Observações"
      data-testid="dre-export-quality"
      data-export-section="7-quality"
    >
      {isProvisional ? (
        <>
          <div className="tp-dre-export-quality-title">
            Este relatório contém competências provisórias.
          </div>
          <div>
            Existem apropriações com vencimento diferido ainda pendentes no período selecionado.
            {allPendingAccrualCodes.length > 0 && (
              <>
                {" "}
                <strong>Pendências conhecidas:</strong>{" "}
                {allPendingAccrualCodes.join(", ")}.
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="tp-dre-export-quality-title">
            Competências fechadas no período selecionado
          </div>
          <div>
            Todas as apropriações mensais previstas encontram-se conciliadas no período ({formatDateBr(period.from)} a {formatDateBr(period.to)}). Cobertura de classificação gerencial: {dataQuality.dreClassificationCoveragePercent}%.
          </div>
        </>
      )}
    </section>
  );

  // 8. DISCLAIMER / RODAPÉ
  const disclaimerSection = (
    <footer
      className="tp-dre-export-disclaimer"
      data-testid="dre-export-disclaimer"
      data-export-section="8-disclaimer"
    >
      <div>{DRE_EXPORT_DISCLAIMER_TEXT}</div>
      <div style={{ whiteSpace: "nowrap", fontWeight: 600 }}>
        TagPulse • {companyName}
      </div>
    </footer>
  );

  if (layoutMode === "continuous") {
    return (
      <div
        className="tp-dre-export-root"
        data-testid="dre-export-report"
        data-layout-mode="continuous"
      >
        <div
          className="tp-dre-export-sheet"
          data-export-continuous="true"
        >
          <style>{DRE_EXPORT_REPORT_CSS}</style>
          <div className="tp-dre-export-continuous-body">
            {headerSection}
            {kpisSection}
            {secondaryMetricsSection}
            {breakEvenSection}
            {chartSection}
            {dreTableSection}
            {breakdownSection}
            {qualitySection}
            {disclaimerSection}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="tp-dre-export-root"
      data-testid="dre-export-report"
      data-layout-mode="paginated"
    >
      {/* PÁGINA 1: Cabeçalho, KPIs Principais, Métricas Secundárias, Gráfico */}
      <div className="tp-dre-export-page" data-export-page="1">
        <style>{DRE_EXPORT_REPORT_CSS}</style>
        <div className="tp-dre-export-page-body">
          {headerSection}
          {kpisSection}
          {secondaryMetricsSection}
          {breakEvenSection}
          {chartSection}
        </div>
        <div className="tp-dre-export-page-footer">
          <span>
            {companyName} • DRE Gerencial ({formatDateBr(period.from)} a{" "}
            {formatDateBr(period.to)})
          </span>
          <span>Página 1 de 3</span>
        </div>
      </div>

      {/* PÁGINA 2: Demonstrativo do Resultado — DRE */}
      <div className="tp-dre-export-page" data-export-page="2">
        <style>{DRE_EXPORT_REPORT_CSS}</style>
        <div className="tp-dre-export-page-body">
          <div className="tp-dre-export-mini-header">
            <span>
              <strong>{companyName}</strong> — DRE Gerencial
            </span>
            <span>
              Período: <strong>{formatDateBr(period.from)}</strong> a{" "}
              <strong>{formatDateBr(period.to)}</strong>
            </span>
          </div>
          {dreTableSection}
        </div>
        <div className="tp-dre-export-page-footer">
          <span>
            {companyName} • DRE Gerencial ({formatDateBr(period.from)} a{" "}
            {formatDateBr(period.to)})
          </span>
          <span>Página 2 de 3</span>
        </div>
      </div>

      {/* PÁGINA 3: Composição das Despesas, Qualidade / Observações, Disclaimer */}
      <div className="tp-dre-export-page" data-export-page="3">
        <style>{DRE_EXPORT_REPORT_CSS}</style>
        <div className="tp-dre-export-page-body">
          <div className="tp-dre-export-mini-header">
            <span>
              <strong>{companyName}</strong> — DRE Gerencial
            </span>
            <span>
              Período: <strong>{formatDateBr(period.from)}</strong> a{" "}
              <strong>{formatDateBr(period.to)}</strong>
            </span>
          </div>
          {breakdownSection}
          {qualitySection}
          {disclaimerSection}
        </div>
        <div className="tp-dre-export-page-footer">
          <span>
            {companyName} • DRE Gerencial ({formatDateBr(period.from)} a{" "}
            {formatDateBr(period.to)})
          </span>
          <span>Página 3 de 3</span>
        </div>
      </div>
    </div>
  );
}
