import { DollarSign, Percent, TrendingDown, TrendingUp } from "lucide-react";
import type { ProfitabilitySummary } from "../api/bi";
import { formatCurrency, formatNumber } from "../utils/formatters";

interface ProfitabilityKpiGridProps {
  summary: ProfitabilitySummary;
}

export function ProfitabilityKpiGrid({ summary }: ProfitabilityKpiGridProps) {
  const isPositiveMargin =
    summary.estimatedGrossMarginPercent !== null &&
    summary.estimatedGrossMarginPercent >= 0;

  return (
    <section className="tp-kpi-section" aria-label="Indicadores de Rentabilidade">
      <div className="tp-kpi-grid">
        {/* KPI 1 — Receita realizada */}
        <article className="tp-kpi-card tp-profit-kpi-card tp-kpi-highlight">
          <div className="tp-profit-kpi-header">
            <span className="tp-profit-kpi-label">Receita realizada</span>
            <span className="tp-kpi-icon-wrap tp-icon-cyan">
              <DollarSign size={16} />
            </span>
          </div>
          <div className="tp-profit-kpi-value-wrap">
            <span className="tp-kpi-value">
              {formatCurrency(summary.realizedRevenue)}
            </span>
          </div>
          <div className="tp-profit-kpi-footer">
            <span className="tp-profit-kpi-subtext">
              Faturamento líquido faturado no período
            </span>
          </div>
        </article>

        {/* KPI 2 — CMV estimado ao custo atual */}
        <article className="tp-kpi-card tp-profit-kpi-card">
          <div className="tp-profit-kpi-header">
            <span className="tp-profit-kpi-label">CMV estimado ao custo atual</span>
            <span className="tp-kpi-icon-wrap tp-icon-blue">
              <TrendingDown size={16} />
            </span>
          </div>
          <div className="tp-profit-kpi-value-wrap">
            <span className="tp-kpi-value">
              {summary.estimatedCOGS !== null
                ? formatCurrency(summary.estimatedCOGS)
                : "—"}
            </span>
          </div>
          <div className="tp-profit-kpi-footer">
            <span className="tp-profit-kpi-subtext">
              Custo dos produtos vendidos a custo atual
            </span>
          </div>
        </article>

        {/* KPI 3 — Lucro bruto estimado ao custo atual */}
        <article className="tp-kpi-card tp-profit-kpi-card">
          <div className="tp-profit-kpi-header">
            <span className="tp-profit-kpi-label">Lucro bruto estimado ao custo atual</span>
            <span className="tp-kpi-icon-wrap tp-icon-teal">
              <DollarSign size={16} />
            </span>
          </div>
          <div className="tp-profit-kpi-value-wrap">
            <span className="tp-kpi-value">
              {summary.estimatedGrossProfit !== null
                ? formatCurrency(summary.estimatedGrossProfit)
                : "—"}
            </span>
          </div>
          <div className="tp-profit-kpi-footer">
            <span className="tp-profit-kpi-subtext">
              Receita com custo menos CMV estimado
            </span>
          </div>
        </article>

        {/* KPI 4 — Margem bruta estimada ao custo atual */}
        <article className="tp-kpi-card tp-profit-kpi-card">
          <div className="tp-profit-kpi-header">
            <span className="tp-profit-kpi-label">Margem bruta estimada ao custo atual</span>
            <span
              className={`tp-kpi-icon-wrap ${
                isPositiveMargin ? "tp-icon-teal" : "tp-icon-magenta"
              }`}
            >
              {isPositiveMargin ? <TrendingUp size={16} /> : <Percent size={16} />}
            </span>
          </div>
          <div className="tp-profit-kpi-value-wrap">
            <span
              className={`tp-kpi-value ${
                summary.estimatedGrossMarginPercent !== null &&
                summary.estimatedGrossMarginPercent < 0
                  ? "tp-value-negative"
                  : ""
              }`}
            >
              {summary.estimatedGrossMarginPercent !== null
                ? `${formatNumber(summary.estimatedGrossMarginPercent)}%`
                : "—"}
            </span>
          </div>
          <div className="tp-profit-kpi-footer">
            <span className="tp-profit-kpi-subtext">
              Sobre receita com cobertura de custo
            </span>
          </div>
        </article>
      </div>
    </section>
  );
}
