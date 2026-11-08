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
  Info,
  Clock,
} from "lucide-react";
import {
  calculateBreakEven,
  DRE_BREAK_EVEN_HELP_TEXT,
  DRE_BREAK_EVEN_UNVIABLE_TITLE,
  DRE_BREAK_EVEN_UNVIABLE_MESSAGE,
  DRE_BREAK_EVEN_UNVIABLE_SUBTEXT,
  DRE_BREAK_EVEN_INCOMPLETE_TITLE,
  DRE_BREAK_EVEN_INCOMPLETE_MESSAGE,
} from "./dreBreakEvenHelper";
import { formatPendingAccrualLabel } from "./FinancialDreTab";

interface FinancialDreBreakEvenSectionProps {
  totals: DreSummaryTotalsDto;
  breakEvenOverride?: DreBreakEvenDto;
  dataQuality?: {
    isProvisional?: boolean;
    financiallyClosed?: boolean;
    pendingAccruals?: string[];
  };
}

export function FinancialDreBreakEvenSection({
  totals,
  breakEvenOverride,
  dataQuality,
}: FinancialDreBreakEvenSectionProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const breakEven: DreBreakEvenDto =
    breakEvenOverride ??
    totals.breakEven ??
    calculateBreakEven(
      totals.realizedRevenue,
      totals.contributionMargin,
      totals.netManagerialResult,
      {
        fullManagerialResultAvailable: totals.fullManagerialResultAvailable,
        costCoveragePercent: totals.costCoveragePercent,
        coveredRevenue: totals.coveredRevenue,
        coveredContributionMargin: totals.coveredContributionMargin,
        partialManagerialResult: totals.partialManagerialResultOnCoveredRevenue,
        isProvisional: dataQuality?.isProvisional ?? false,
      },
    );

  const isCoveredBasis = breakEven.calculationBasis === "COVERED_REVENUE";
  const costCoveragePercent = breakEven.costCoveragePercent ?? totals.costCoveragePercent;
  const isProvisional = breakEven.isProvisional || (dataQuality?.isProvisional ?? false);
  const pendingAccruals = dataQuality?.pendingAccruals ?? [];

  const { status } = breakEven;
  const hasValidBreakEven = breakEven.breakEvenRevenue !== null;
  const isBelow = status === "BELOW_BREAK_EVEN" || (isCoveredBasis && hasValidBreakEven && (breakEven.additionalRevenueNeeded ?? 0) > 0);
  const isAbove = status === "ABOVE_BREAK_EVEN" || (isCoveredBasis && hasValidBreakEven && breakEven.additionalRevenueNeeded === 0);
  const isUnviable = status === "UNVIABLE_MARGIN";
  const isNoRevenue = status === "NO_REVENUE";
  const isIncompleteBlocked = status === "INCOMPLETE_COST_COVERAGE" && !hasValidBreakEven;

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
          {isCoveredBasis && hasValidBreakEven ? (
            <span className="tp-kpi-status-badge is-even" data-testid="dre-breakeven-status-badge">
              {isAbove
                ? `Provisório (superado • cobertura ${formatPercent(costCoveragePercent ?? 0, 1)})`
                : `Provisório (cobertura ${formatPercent(costCoveragePercent ?? 0, 1)})`}
            </span>
          ) : isBelow ? (
            <span className="tp-kpi-status-badge is-loss" data-testid="dre-breakeven-status-badge">
              Abaixo do equilíbrio{isProvisional ? " (Provisório)" : ""}
            </span>
          ) : isAbove ? (
            <span className="tp-kpi-status-badge is-profit" data-testid="dre-breakeven-status-badge">
              Ponto de equilíbrio superado{isProvisional ? " (Provisório)" : ""}
            </span>
          ) : isUnviable ? (
            <span className="tp-kpi-status-badge is-even" data-testid="dre-breakeven-status-badge">
              Margem insuficiente
            </span>
          ) : (
            <span className="tp-kpi-status-badge is-even" data-testid="dre-breakeven-status-badge">
              Cobertura parcial de custos
            </span>
          )}
        </div>
      </div>

      {isIncompleteBlocked ? (
        <div className="tp-dre-breakeven-unviable-card" data-testid="dre-breakeven-incomplete-card">
          <div className="tp-unviable-icon-wrap">
            <Info size={20} className="tp-icon-blue" />
          </div>
          <div className="tp-unviable-content">
            <h4 className="tp-unviable-title">{DRE_BREAK_EVEN_INCOMPLETE_TITLE}</h4>
            <p className="tp-unviable-message">{DRE_BREAK_EVEN_INCOMPLETE_MESSAGE}</p>
            <p className="tp-unviable-subtext">
              Para garantir precisão gerencial, metas de faturamento de equilíbrio não são projetadas sobre bases de custos incompletas.
            </p>
            <div className="tp-unviable-metrics">
              <span>
                Faturamento realizado: <strong>{formatCurrency(breakEven.realizedRevenue)}</strong>
              </span>
              <span className="tp-metric-sep">•</span>
              <span>
                Margem de contribuição: <strong>{formatCurrency(breakEven.contributionMargin)}</strong>
              </span>
              {totals.costCoveragePercent !== undefined && totals.costCoveragePercent !== null && (
                <>
                  <span className="tp-metric-sep">•</span>
                  <span>
                    Cobertura de custos: <strong>{formatPercent(totals.costCoveragePercent, 1)}</strong>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      ) : isUnviable ? (
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
          {/* Callout de cobertura parcial de custos com cálculo provisório */}
          {isCoveredBasis && (
            <div
              className="tp-dre-breakeven-unviable-card"
              data-testid="dre-breakeven-provisional-callout"
              style={{
                background: "rgba(56, 189, 248, 0.08)",
                borderColor: "rgba(56, 189, 248, 0.25)",
              }}
            >
              <div className="tp-unviable-icon-wrap">
                <Info size={18} className="tp-icon-blue" />
              </div>
              <div className="tp-unviable-content">
                <h4 className="tp-unviable-title" style={{ color: "#38bdf8" }}>
                  Cálculo provisório baseado na parcela da receita com cobertura de custos
                </h4>
                <div className="tp-unviable-metrics">
                  <span>
                    Faturamento realizado total: <strong>{formatCurrency(breakEven.realizedRevenue)}</strong>
                  </span>
                  <span className="tp-metric-sep">•</span>
                  <span>
                    Considerado no cálculo: <strong>{formatCurrency(breakEven.coveredRevenue ?? totals.coveredRevenue ?? breakEven.realizedRevenue)}</strong>
                  </span>
                  {costCoveragePercent !== null && costCoveragePercent !== undefined && (
                    <>
                      <span className="tp-metric-sep">•</span>
                      <span>
                        Cobertura de custos: <strong>{formatPercent(costCoveragePercent, 1)}</strong>
                      </span>
                    </>
                  )}
                </div>
                {pendingAccruals.length > 0 && (
                  <p className="tp-unviable-subtext" style={{ color: "#94a3b8", marginTop: 4 }}>
                    Competências em aberto: {pendingAccruals.map(formatPendingAccrualLabel).join(", ")}.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Notice para competências provisórias com cobertura total (ex: DAS/GPS pendente) */}
          {isProvisional && !isCoveredBasis && pendingAccruals.length > 0 && (
            <div
              className="tp-dre-breakeven-unviable-card"
              data-testid="dre-breakeven-provisional-notice"
              style={{
                background: "rgba(56, 189, 248, 0.06)",
                borderColor: "rgba(56, 189, 248, 0.2)",
              }}
            >
              <div className="tp-unviable-icon-wrap">
                <Clock size={16} className="tp-icon-blue" />
              </div>
              <div className="tp-unviable-content">
                <h4 className="tp-unviable-title" style={{ color: "#38bdf8" }}>
                  Estimativa provisória
                </h4>
                <p className="tp-unviable-message" style={{ color: "#cbd5e1" }}>
                  Período com competências ainda em aberto ({pendingAccruals.map(formatPendingAccrualLabel).join(", ")}). O cálculo reflete os dados contábeis disponíveis no momento.
                </p>
              </div>
            </div>
          )}

          <div className="tp-dre-breakeven-cards-grid">
            {/* Card 1 — Ponto de Equilíbrio */}
            <article className="tp-kpi-card tp-profit-kpi-card" data-testid="dre-breakeven-card-main">
              <div className="tp-profit-kpi-header">
                <span className="tp-profit-kpi-label">
                  {isCoveredBasis ? "Faturamento de equilíbrio estimado" : "Faturamento de equilíbrio"}
                </span>
                <span className="tp-kpi-icon-wrap tp-icon-teal">
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
                    {isCoveredBasis ? "Estimativa sobre a receita coberta" : "Meta para zerar o resultado"}
                  </span>
                )}
              </div>
            </article>

            {/* Card 2 — Gap para Equilíbrio */}
            <article
              className={`tp-kpi-card tp-profit-kpi-card ${!isAbove ? "tp-card-loss" : ""}`}
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
                  className={`tp-kpi-value ${!isAbove ? "tp-value-negative" : "tp-value-positive"}`}
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
                    ? (isCoveredBasis ? "Superado sobre a receita coberta" : "Empresa acima do ponto de equilíbrio")
                    : (isCoveredBasis ? "Faturamento adicional estimado" : "Faturamento adicional necessário")}
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
                  {isAbove
                    ? "Resultado positivo atingido"
                    : isCoveredBasis
                    ? "Sobre a receita coberta"
                    : "Sobre o faturamento realizado"}
                </span>
              </div>
            </article>
          </div>

          {/* Contextual baseline footer strip */}
          <div className="tp-dre-breakeven-context-strip" data-testid="dre-breakeven-context">
            <div className="tp-breakeven-context-item">
              <span className="tp-breakeven-context-label">
                {isCoveredBasis ? "Faturamento realizado total:" : "Faturamento realizado:"}
              </span>
              <span className="tp-breakeven-context-value">
                {formatCurrency(breakEven.realizedRevenue)}
              </span>
            </div>
            {isCoveredBasis && (
              <>
                <div className="tp-secondary-divider" />
                <div className="tp-breakeven-context-item">
                  <span className="tp-breakeven-context-label">Considerado no cálculo:</span>
                  <span className="tp-breakeven-context-value">
                    {formatCurrency(breakEven.coveredRevenue ?? totals.coveredRevenue ?? breakEven.realizedRevenue)}
                    {costCoveragePercent !== null && costCoveragePercent !== undefined && (
                      <span style={{ fontSize: "11px", color: "var(--tp-cyan-400, #38bdf8)", marginLeft: "4px" }}>
                        ({formatPercent(costCoveragePercent, 1)})
                      </span>
                    )}
                  </span>
                </div>
              </>
            )}
            <div className="tp-secondary-divider" />
            <div className="tp-breakeven-context-item">
              <span className="tp-breakeven-context-label">
                {isCoveredBasis ? "Margem de contribuição considerada:" : "Margem de contribuição gerencial estimada:"}
              </span>
              <span className="tp-breakeven-context-value tp-color-teal">
                {breakEven.contributionMarginRate !== null && breakEven.contributionMarginRate !== undefined
                  ? formatPercent(breakEven.contributionMarginRate * 100, 1)
                  : totals.contributionMarginPercent !== null && totals.contributionMarginPercent !== undefined
                  ? formatPercent(totals.contributionMarginPercent, 1)
                  : "—"}
              </span>
            </div>
            <div className="tp-secondary-divider" />
            <div className="tp-breakeven-context-item">
              <span className="tp-breakeven-context-label">
                {isCoveredBasis ? "Resultado gerencial considerado:" : "Resultado líquido gerencial estimado:"}
              </span>
              <span
                className={`tp-breakeven-context-value ${
                  breakEven.netResult !== null && breakEven.netResult > 0
                    ? "tp-text-positive"
                    : breakEven.netResult !== null && breakEven.netResult < 0
                    ? "tp-text-negative"
                    : ""
                }`}
              >
                {breakEven.netResult !== null ? formatCurrency(breakEven.netResult) : "—"}
              </span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
