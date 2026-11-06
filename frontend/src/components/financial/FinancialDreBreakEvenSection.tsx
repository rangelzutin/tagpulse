import { useState } from "react";
import type { DreBreakEvenDto, DreSummaryTotalsDto } from "../../api/financial";
import { formatCurrency, formatPercent } from "../../utils/formatters";
import {
  Target,
  Scale,
  TrendingUp,
  AlertTriangle,
  HelpCircle,
  CheckCircle2,
} from "lucide-react";
import {
  calculateBreakEven,
  DRE_BREAK_EVEN_HELP_TEXT,
  DRE_BREAK_EVEN_UNVIABLE_TITLE,
  DRE_BREAK_EVEN_UNVIABLE_MESSAGE,
  DRE_BREAK_EVEN_UNVIABLE_SUBTEXT,
} from "./dreBreakEvenHelper";

interface FinancialDreBreakEvenSectionProps {
  totals: DreSummaryTotalsDto;
  breakEvenOverride?: DreBreakEvenDto;
}

export function FinancialDreBreakEvenSection({
  totals,
  breakEvenOverride,
}: FinancialDreBreakEvenSectionProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const breakEven: DreBreakEvenDto =
    breakEvenOverride ??
    totals.breakEven ??
    calculateBreakEven(
      totals.realizedRevenue,
      totals.contributionMargin,
      totals.netManagerialResult,
    );

  const { status } = breakEven;
  const isBelow = status === "BELOW_BREAK_EVEN";
  const isAbove = status === "ABOVE_BREAK_EVEN";
  const isUnviable = status === "UNVIABLE_MARGIN";
  const isNoRevenue = status === "NO_REVENUE";

  return (
    <section
      className="tp-dre-breakeven-section"
      aria-label="Ponto de Equilíbrio Gerencial"
      data-testid="dre-breakeven-section"
    >
      <div className="tp-dre-breakeven-header">
        <div className="tp-dre-breakeven-title-group">
          <div className="tp-dre-breakeven-heading-row">
            <h3 className="tp-dre-breakeven-title">Ponto de equilíbrio</h3>
            <div className="tp-dre-breakeven-help-wrap">
              <button
                type="button"
                className="tp-dre-help-btn"
                aria-label="Mais informações sobre ponto de equilíbrio"
                title={DRE_BREAK_EVEN_HELP_TEXT}
                onClick={() => setShowTooltip((prev) => !prev)}
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
              >
                <HelpCircle size={14} />
              </button>
              {showTooltip && (
                <div
                  className="tp-dre-help-tooltip"
                  role="tooltip"
                  data-testid="dre-breakeven-tooltip"
                >
                  {DRE_BREAK_EVEN_HELP_TEXT}
                </div>
              )}
            </div>
          </div>
          <p className="tp-dre-breakeven-desc">
            Estimativa do faturamento necessário para zerar o resultado gerencial do período, mantendo a margem de contribuição atual.
          </p>
        </div>

        <div className="tp-dre-breakeven-status-wrap">
          {isBelow && (
            <span className="tp-kpi-status-badge is-loss" data-testid="dre-breakeven-status-badge">
              Abaixo do equilíbrio
            </span>
          )}
          {isAbove && (
            <span className="tp-kpi-status-badge is-profit" data-testid="dre-breakeven-status-badge">
              Ponto de equilíbrio superado
            </span>
          )}
          {isUnviable && (
            <span className="tp-kpi-status-badge is-even" data-testid="dre-breakeven-status-badge">
              Margem insuficiente
            </span>
          )}
        </div>
      </div>

      {isUnviable ? (
        <div className="tp-dre-breakeven-unviable-card" data-testid="dre-breakeven-unviable-card">
          <div className="tp-unviable-icon-wrap">
            <AlertTriangle size={20} className="tp-icon-magenta" />
          </div>
          <div className="tp-unviable-content">
            <h4 className="tp-unviable-title">{DRE_BREAK_EVEN_UNVIABLE_TITLE}</h4>
            <p className="tp-unviable-message">{DRE_BREAK_EVEN_UNVIABLE_MESSAGE}</p>
            <p className="tp-unviable-subtext">{DRE_BREAK_EVEN_UNVIABLE_SUBTEXT}</p>
            <div className="tp-unviable-metrics">
              <span>
                Faturamento realizado: <strong>{formatCurrency(breakEven.realizedRevenue)}</strong>
              </span>
              <span className="tp-metric-sep">•</span>
              <span>
                Margem de contribuição: <strong>{formatCurrency(breakEven.contributionMargin)}</strong>
              </span>
            </div>
          </div>
        </div>
      ) : isNoRevenue ? (
        <div className="tp-dre-breakeven-unviable-card" data-testid="dre-breakeven-norevenue-card">
          <div className="tp-unviable-icon-wrap">
            <Scale size={20} className="tp-icon-blue" />
          </div>
          <div className="tp-unviable-content">
            <h4 className="tp-unviable-title">Sem faturamento no período</h4>
            <p className="tp-unviable-message">
              Não há receita operacional realizada no período selecionado para projetar o ponto de equilíbrio.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="tp-dre-breakeven-cards-grid">
            {/* Card 1 — Faturamento de Equilíbrio */}
            <article className="tp-kpi-card tp-profit-kpi-card" data-testid="dre-breakeven-card-revenue">
              <div className="tp-profit-kpi-header">
                <span className="tp-profit-kpi-label">Faturamento de equilíbrio</span>
                <span className="tp-kpi-icon-wrap tp-icon-cyan">
                  <Target size={16} />
                </span>
              </div>
              <div className="tp-profit-kpi-value-wrap">
                <span className="tp-kpi-value" data-testid="dre-breakeven-revenue">
                  {breakEven.breakEvenRevenue !== null
                    ? formatCurrency(breakEven.breakEvenRevenue)
                    : "—"}
                </span>
              </div>
              <div className="tp-profit-kpi-footer">
                {isAbove ? (
                  <span className="tp-kpi-meta-badge tp-meta-teal">
                    <CheckCircle2 size={11} /> Superado
                  </span>
                ) : (
                  <span className="tp-profit-kpi-subtext">
                    Meta para zerar o resultado
                  </span>
                )}
              </div>
            </article>

            {/* Card 2 — Gap para Equilíbrio */}
            <article
              className={`tp-kpi-card tp-profit-kpi-card ${isBelow ? "tp-card-loss" : ""}`}
              data-testid="dre-breakeven-card-gap"
            >
              <div className="tp-profit-kpi-header">
                <span className="tp-profit-kpi-label">Gap para equilíbrio</span>
                <span
                  className={`tp-kpi-icon-wrap ${
                    isAbove ? "tp-icon-teal" : "tp-icon-magenta"
                  }`}
                >
                  <Scale size={16} />
                </span>
              </div>
              <div className="tp-profit-kpi-value-wrap">
                <span
                  className={`tp-kpi-value ${isBelow ? "tp-value-negative" : "tp-value-positive"}`}
                  data-testid="dre-breakeven-gap"
                >
                  {isAbove
                    ? formatCurrency(0)
                    : breakEven.additionalRevenueNeeded !== null
                    ? formatCurrency(breakEven.additionalRevenueNeeded)
                    : "—"}
                </span>
              </div>
              <div className="tp-profit-kpi-footer">
                <span className="tp-profit-kpi-subtext">
                  {isAbove
                    ? "Empresa acima do ponto de equilíbrio"
                    : "Faturamento adicional necessário"}
                </span>
              </div>
            </article>

            {/* Card 3 — Aumento Necessário */}
            <article className="tp-kpi-card tp-profit-kpi-card" data-testid="dre-breakeven-card-percent">
              <div className="tp-profit-kpi-header">
                <span className="tp-profit-kpi-label">Aumento necessário</span>
                <span className="tp-kpi-icon-wrap tp-icon-teal">
                  <TrendingUp size={16} />
                </span>
              </div>
              <div className="tp-profit-kpi-value-wrap">
                <span className="tp-kpi-value" data-testid="dre-breakeven-percent">
                  {isAbove
                    ? "0,0%"
                    : breakEven.additionalRevenuePercent !== null
                    ? `+${formatPercent(breakEven.additionalRevenuePercent, 1)}`
                    : "—"}
                </span>
              </div>
              <div className="tp-profit-kpi-footer">
                <span className="tp-profit-kpi-subtext">
                  {isAbove ? "Resultado positivo atingido" : "Sobre o faturamento realizado"}
                </span>
              </div>
            </article>
          </div>

          {/* Contextual baseline footer strip */}
          <div className="tp-dre-breakeven-context-strip" data-testid="dre-breakeven-context">
            <div className="tp-breakeven-context-item">
              <span className="tp-breakeven-context-label">Faturamento realizado:</span>
              <span className="tp-breakeven-context-value">
                {formatCurrency(breakEven.realizedRevenue)}
              </span>
            </div>
            <div className="tp-secondary-divider" />
            <div className="tp-breakeven-context-item">
              <span className="tp-breakeven-context-label">Margem de contribuição gerencial estimada:</span>
              <span className="tp-breakeven-context-value tp-color-teal">
                {totals.contributionMarginPercent !== null
                  ? formatPercent(totals.contributionMarginPercent, 1)
                  : breakEven.contributionMarginRate !== null
                  ? formatPercent(breakEven.contributionMarginRate * 100, 1)
                  : "—"}
              </span>
            </div>
            <div className="tp-secondary-divider" />
            <div className="tp-breakeven-context-item">
              <span className="tp-breakeven-context-label">Resultado líquido gerencial estimado:</span>
              <span
                className={`tp-breakeven-context-value ${
                  breakEven.netResult > 0
                    ? "tp-text-positive"
                    : breakEven.netResult < 0
                    ? "tp-text-negative"
                    : ""
                }`}
              >
                {formatCurrency(breakEven.netResult)}
              </span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
