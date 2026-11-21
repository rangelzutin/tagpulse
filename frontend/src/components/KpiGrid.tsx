import { useState } from "react";
import {
  DollarSign,
  HelpCircle,
  Scale,
  ShoppingBag,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import type { SalesOverviewSummary } from "../api/bi";
import type { MonthlyOperationalBreakEvenDto } from "../api/financial";
import {
  formatCurrency,
  formatDateBr,
  formatNumber,
  formatPercent,
} from "../utils/formatters";

const CURRENT_BREAK_EVEN_HELP_TEXT =
  "Ponto de equilíbrio calculado com a margem de contribuição realizada no mês. Pode variar conforme o mix, custos e margens das vendas.";
const RECENT_AVERAGE_HELP_TEXT =
  "Referência baseada em meses completos e comparáveis da estrutura operacional atual.";

interface KpiGridProps {
  summary: SalesOverviewSummary;
  operationalBreakEven?: MonthlyOperationalBreakEvenDto | null;
}

export function KpiGrid({ summary, operationalBreakEven }: KpiGridProps) {
  const [isDrilldownOpen, setIsDrilldownOpen] = useState(false);

  const be = operationalBreakEven ?? null;
  const isAbove = be?.status === "ABOVE_BREAK_EVEN";
  const progressBarPct =
    be?.progressPercent != null
      ? Math.min(100, Math.max(0, be.progressPercent))
      : 0;

  // Semântica da Home: o badge indica se o mês de referência ainda está em andamento
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

  const avgDiffPct =
    be?.averageOperationalBreakEven &&
    be.averageOperationalBreakEven > 0 &&
    be.operationalBreakEvenRevenue !== null
      ? ((be.operationalBreakEvenRevenue / be.averageOperationalBreakEven) - 1) * 100
      : null;
  const avgDiffSign = avgDiffPct !== null && avgDiffPct > 0 ? "+" : "";
  const avgDiffFormatted =
    avgDiffPct !== null
      ? `${avgDiffSign}${formatPercent(avgDiffPct, 1)} vs média`
      : null;

  return (
    <section className="tp-kpi-section" aria-label="Indicadores Comerciais">
      <div className="tp-kpi-grid">
        <article className="tp-kpi-card tp-kpi-highlight">
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">Faturamento</span>
            <span className="tp-kpi-icon-wrap tp-icon-cyan">
              <DollarSign size={16} />
            </span>
          </div>
          <div className="tp-kpi-value-wrap">
            <span className="tp-kpi-value">
              {formatCurrency(summary.revenue)}
            </span>
          </div>
        </article>

        <article className="tp-kpi-card">
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">Vendas</span>
            <span className="tp-kpi-icon-wrap tp-icon-blue">
              <ShoppingBag size={16} />
            </span>
          </div>
          <div className="tp-kpi-value-wrap">
            <span className="tp-kpi-value">{formatNumber(summary.sales)}</span>
          </div>
        </article>

        <article className="tp-kpi-card">
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">Ticket médio</span>
            <span className="tp-kpi-icon-wrap tp-icon-teal">
              <TrendingUp size={16} />
            </span>
          </div>
          <div className="tp-kpi-value-wrap">
            <span className="tp-kpi-value">
              {formatCurrency(summary.avgTicket)}
            </span>
          </div>
        </article>

        <article className="tp-kpi-card">
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">Clientes compradores</span>
            <span className="tp-kpi-icon-wrap tp-icon-indigo">
              <Users size={16} />
            </span>
          </div>
          <div className="tp-kpi-value-wrap">
            <span className="tp-kpi-value">
              {formatNumber(summary.customers)}
            </span>
          </div>
        </article>
      </div>

      {be && (
        <article
          className={`tp-kpi-card tp-breakeven-banner ${
            isAbove ? "tp-banner-above" : ""
          }`}
          data-testid="home-operational-breakeven-card"
          role="button"
          tabIndex={0}
          onClick={() => setIsDrilldownOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setIsDrilldownOpen(true);
            }
          }}
          title="Calculado com base nas despesas já lançadas com vencimento neste mês."
        >
          {/* Top header row */}
          <div className="tp-breakeven-banner-top">
            <div className="tp-breakeven-banner-title-wrap">
              <span className="tp-kpi-icon-wrap tp-icon-cyan">
                <Scale size={16} />
              </span>
              <span className="tp-kpi-label tp-breakeven-banner-title">
                Ponto de equilíbrio do mês
              </span>
              {isMonthInProgress && (
                <span
                  className="tp-badge-in-progress"
                  title="Mês ainda em andamento. O ponto de equilíbrio pode variar conforme novos lançamentos e vendas forem registrados."
                >
                  EM ANDAMENTO
                </span>
              )}
            </div>

            <div className="tp-breakeven-banner-status-wrap">
              <span
                className={`tp-breakeven-status-pill ${
                  isAbove ? "tp-status-above" : "tp-status-below"
                }`}
              >
                {be.statusLabel}
              </span>
              <span className="tp-breakeven-drilldown-hint">
                Ver detalhes &rarr;
              </span>
            </div>
          </div>

          {/* Metrics horizontal row/grid: A) Ponto de equilíbrio, B) FALTA VENDER (destaque principal), C) Progresso, D) Média recente */}
          <div className="tp-breakeven-metrics-grid">
            {/* Block A: Ponto de equilíbrio do mês (Dinâmico / Principal) */}
            <div
              className="tp-breakeven-metric-block"
              title={CURRENT_BREAK_EVEN_HELP_TEXT}
            >
              <span
                className="tp-breakeven-metric-label"
                style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
              >
                Ponto de equilíbrio do mês
                <span
                  title={CURRENT_BREAK_EVEN_HELP_TEXT}
                  aria-label={CURRENT_BREAK_EVEN_HELP_TEXT}
                  style={{ display: "inline-flex", alignItems: "center", color: "#94a3b8", cursor: "help" }}
                >
                  <HelpCircle size={11} />
                </span>
              </span>
              <div className="tp-breakeven-metric-value tp-breakeven-val-white">
                {be.operationalBreakEvenRevenue !== null
                  ? formatCurrency(be.operationalBreakEvenRevenue)
                  : "—"}
              </div>
              <span className="tp-breakeven-metric-subtext">
                Equilíbrio atual do mês
              </span>
            </div>

            {/* Block B: FALTA VENDER / SUPERADO (Maior destaque visual da faixa) */}
            <div
              className={`tp-breakeven-metric-block tp-breakeven-gap-highlight ${
                isAbove ? "is-above" : "is-below"
              }`}
              data-testid="home-breakeven-gap-block"
            >
              <span className="tp-breakeven-metric-label tp-breakeven-gap-label">
                {isAbove ? "Superado" : "Falta vender"}
              </span>
              <div
                className={`tp-breakeven-metric-value tp-breakeven-val-gap-hero ${
                  isAbove ? "tp-breakeven-val-emerald" : "tp-breakeven-val-amber"
                }`}
              >
                {isAbove
                  ? formatCurrency(be.surplusRevenue ?? 0)
                  : formatCurrency(be.remainingRevenueNeeded ?? 0)}
              </div>
              <span className="tp-breakeven-metric-subtext">
                {isAbove ? "Acima do equilíbrio" : "Para o equilíbrio"}
              </span>
            </div>

            {/* Block C: Progresso */}
            <div className="tp-breakeven-metric-block">
              <span className="tp-breakeven-metric-label">Progresso</span>
              <div
                className={`tp-breakeven-metric-value ${
                  isAbove ? "tp-breakeven-val-emerald" : "tp-breakeven-val-cyan"
                }`}
              >
                {be.progressPercent !== null
                  ? formatPercent(be.progressPercent, 1)
                  : "—"}
              </div>
              <span className="tp-breakeven-metric-subtext">
                {isAbove ? "Superado" : "Do equilíbrio"}
              </span>
            </div>

            {/* Block D: Média recente (Referência estrutural histórica) */}
            <div
              className="tp-breakeven-metric-block"
              title={RECENT_AVERAGE_HELP_TEXT}
            >
              <span
                className="tp-breakeven-metric-label"
                style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
              >
                Média recente
                <span
                  title={RECENT_AVERAGE_HELP_TEXT}
                  aria-label={RECENT_AVERAGE_HELP_TEXT}
                  style={{ display: "inline-flex", alignItems: "center", color: "#94a3b8", cursor: "help" }}
                >
                  <HelpCircle size={11} />
                </span>
              </span>
              <div className="tp-breakeven-metric-value tp-breakeven-val-muted">
                {be.averageOperationalBreakEven !== null
                  ? formatCurrency(be.averageOperationalBreakEven)
                  : "—"}
              </div>
              {avgDiffFormatted ? (
                <div className="tp-breakeven-avg-reference">
                  <span
                    className={`tp-breakeven-avg-diff ${
                      avgDiffPct && avgDiffPct > 0
                        ? "tp-diff-positive"
                        : "tp-diff-negative"
                    }`}
                  >
                    {avgDiffFormatted}
                  </span>
                </div>
              ) : (
                <span className="tp-breakeven-metric-subtext">
                  Referência operacional
                </span>
              )}
            </div>
          </div>

          {/* Progress bar horizontal area */}
          <div className="tp-breakeven-progress-container">
            <div className="tp-breakeven-progress-labels">
              <span className="tp-breakeven-progress-left">
                {`${formatCurrency(be.realizedRevenue)} de ${
                  be.operationalBreakEvenRevenue !== null
                    ? formatCurrency(be.operationalBreakEvenRevenue)
                    : "—"
                }`}
              </span>
              <span className="tp-breakeven-progress-right">
                {isAbove
                  ? (be.surplusRevenue && be.surplusRevenue > 0
                      ? `Superado em ${formatCurrency(be.surplusRevenue)}`
                      : "Ponto de equilíbrio superado")
                  : (be.progressPercent !== null
                      ? `${formatPercent(be.progressPercent, 1)}`
                      : "—")}
              </span>
            </div>
            <div className="tp-breakeven-progress-track">
              <div
                className={`tp-breakeven-progress-fill ${
                  isAbove ? "tp-fill-emerald" : "tp-fill-cyan"
                }`}
                style={{ width: `${isAbove ? 100 : progressBarPct}%` }}
              />
            </div>
          </div>
        </article>
      )}

      {summary.salesWithoutCustomer > 0 && (
        <div className="tp-kpi-secondary-info">
          <span className="tp-secondary-dot" />
          <span className="tp-secondary-label">
            Vendas sem cliente identificado no período:
          </span>
          <span className="tp-secondary-value">
            {formatNumber(summary.salesWithoutCustomer)}
          </span>
        </div>
      )}

      {be && isDrilldownOpen && (
        <div
          className="tp-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="home-breakeven-modal-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.8)",
            backdropFilter: "blur(4px)",
            zIndex: 1100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={() => setIsDrilldownOpen(false)}
        >
          <div
            className="tp-modal-box"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "780px",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.6)",
              color: "#f8fafc",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                padding: "16px 24px",
                borderBottom: "1px solid #1e293b",
                gap: "12px",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <h3
                    id="home-breakeven-modal-title"
                    style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#f8fafc" }}
                  >
                    Ponto de Equilíbrio do Mês ({be.referenceMonth})
                  </h3>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "999px",
                      background: "rgba(56, 189, 248, 0.15)",
                      color: "#38bdf8",
                      border: "1px solid rgba(56, 189, 248, 0.35)",
                    }}
                  >
                    Critério Home: vencimento no mês
                  </span>
                  {isMonthInProgress && (
                    <span
                      className="tp-badge-in-progress"
                      title="Mês ainda em andamento. O ponto de equilíbrio pode variar conforme novos lançamentos e vendas forem registrados."
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "999px",
                        background: "rgba(56, 189, 248, 0.15)",
                        color: "#38bdf8",
                        border: "1px solid rgba(56, 189, 248, 0.35)",
                      }}
                    >
                      EM ANDAMENTO
                    </span>
                  )}
                </div>
                <p style={{ margin: "6px 0 0 0", fontSize: "12px", color: "#94a3b8" }}>
                  Visão operacional de {formatDateBr(be.period.from)} a {formatDateBr(be.period.to)}. Considera todas as despesas, impostos (DAS/ICMS) e encargos (GPS) com vencimento no mês corrente (diferente do Critério DRE: competência econômica). Compras de estoque permanecem fora das despesas (custo apropriado via CMV).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDrilldownOpen(false)}
                aria-label="Fechar detalhamento"
                style={{
                  background: "none",
                  border: "none",
                  color: "#94a3b8",
                  cursor: "pointer",
                  padding: "4px",
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
              {/* Top summary cards */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                  gap: "12px",
                  marginBottom: "18px",
                }}
              >
                <div style={{ background: "#1e293b", padding: "12px 14px", borderRadius: "8px", border: "1px solid #334155" }}>
                  <div style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", fontWeight: 600 }}>
                    Receita Realizada
                  </div>
                  <div style={{ fontSize: "17px", fontWeight: 700, color: "#f8fafc", marginTop: "4px" }}>
                    {formatCurrency(be.realizedRevenue)}
                  </div>
                </div>
                <div
                  style={{ background: "#1e293b", padding: "12px 14px", borderRadius: "8px", border: "1px solid #334155" }}
                  title={CURRENT_BREAK_EVEN_HELP_TEXT}
                >
                  <div style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", fontWeight: 600 }}>
                    Ponto de Equilíbrio
                  </div>
                  <div style={{ fontSize: "17px", fontWeight: 700, color: "#38bdf8", marginTop: "4px" }}>
                    {be.operationalBreakEvenRevenue !== null
                      ? formatCurrency(be.operationalBreakEvenRevenue)
                      : "—"}
                  </div>
                  <div style={{ fontSize: "10.5px", color: "#94a3b8", marginTop: "2px" }}>
                    Dinâmico · margem do mês
                  </div>
                </div>
                <div style={{ background: "#1e293b", padding: "12px 14px", borderRadius: "8px", border: "1px solid #334155" }}>
                  <div style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", fontWeight: 600 }}>
                    {isAbove ? "Superado em" : "Quanto falta vender"}
                  </div>
                  <div
                    style={{
                      fontSize: "17px",
                      fontWeight: 700,
                      color: isAbove ? "#34d399" : "#fbbf24",
                      marginTop: "4px",
                    }}
                  >
                    {isAbove
                      ? formatCurrency(be.surplusRevenue ?? 0)
                      : formatCurrency(be.remainingRevenueNeeded ?? 0)}
                  </div>
                </div>
                {be.averageOperationalBreakEven !== null && (
                  <div
                    style={{ background: "#1e293b", padding: "12px 14px", borderRadius: "8px", border: "1px solid #334155" }}
                    title={RECENT_AVERAGE_HELP_TEXT}
                  >
                    <div style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", fontWeight: 600 }}>
                      Média Recente ({be.averageReferenceMonthsCount} meses)
                    </div>
                    <div style={{ fontSize: "17px", fontWeight: 700, color: "#cbd5e1", marginTop: "4px" }}>
                      {formatCurrency(be.averageOperationalBreakEven)}
                    </div>
                    <div style={{ fontSize: "10.5px", color: "#64748b", marginTop: "2px" }}>
                      {avgDiffFormatted ? `${avgDiffFormatted} · ` : ""}Ref.: {be.averageReferenceStartMonth} a {be.averageReferenceEndMonth}
                    </div>
                  </div>
                )}
              </div>

              {/* Vertical formula breakdown table */}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8", textAlign: "left" }}>
                    <th style={{ padding: "8px" }}>Componente Operacional</th>
                    <th style={{ padding: "8px", textAlign: "right" }}>Valor (R$)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: "1px solid #1e293b", fontWeight: 700 }}>
                    <td style={{ padding: "8px" }}>Receita realizada</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>{formatCurrency(be.realizedRevenue)}</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #1e293b", color: "#f87171" }}>
                    <td style={{ padding: "8px" }}>(-) CMV</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>-{formatCurrency(be.estimatedCOGS)}</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #1e293b", fontWeight: 700, background: "rgba(30, 41, 59, 0.4)" }}>
                    <td style={{ padding: "8px" }}>
                      (=) Margem Bruta{" "}
                      {be.estimatedGrossMarginPercent !== null && (
                        <span style={{ fontSize: "11.5px", color: "#94a3b8", fontWeight: 500 }}>
                          ({formatPercent(be.estimatedGrossMarginPercent, 2)})
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "8px", textAlign: "right" }}>{formatCurrency(be.estimatedGrossProfit)}</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #1e293b", fontWeight: 600, color: "#f87171" }}>
                    <td style={{ padding: "8px" }}>(-) Despesas Variáveis (vencimento no mês)</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>-{formatCurrency(be.variableExpenses.total)}</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #1e293b", fontSize: "12px", color: "#94a3b8" }}>
                    <td style={{ padding: "5px 8px 5px 24px" }}>• Taxas de Pagamento</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{formatCurrency(be.variableExpenses.paymentFees)}</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #1e293b", fontSize: "12px", color: "#94a3b8" }}>
                    <td style={{ padding: "5px 8px 5px 24px" }}>• Impostos sobre Vendas (DAS / ICMS no vencimento)</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{formatCurrency(be.variableExpenses.taxesOnRevenue)}</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #1e293b", fontSize: "12px", color: "#94a3b8" }}>
                    <td style={{ padding: "5px 8px 5px 24px" }}>• Fretes / Logística</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{formatCurrency(be.variableExpenses.freightLogistics)}</td>
                  </tr>
                  {(be.variableExpenses.packaging ?? 0) > 0 && (
                    <tr style={{ borderBottom: "1px solid #1e293b", fontSize: "12px", color: "#94a3b8" }}>
                      <td style={{ padding: "5px 8px 5px 24px" }}>• Embalagens / Expedição</td>
                      <td style={{ padding: "5px 8px", textAlign: "right" }}>
                        {formatCurrency(be.variableExpenses.packaging ?? 0)}
                      </td>
                    </tr>
                  )}
                  <tr style={{ borderBottom: "1px solid #1e293b", fontWeight: 700, background: "rgba(56, 189, 248, 0.08)" }}>
                    <td style={{ padding: "8px" }}>
                      (=) Margem de Contribuição{" "}
                      <span style={{ fontSize: "11.5px", color: "#38bdf8", fontWeight: 600 }}>
                        (Taxa de Margem de Contribuição:{" "}
                        {be.contributionMarginPercent !== null
                          ? formatPercent(be.contributionMarginPercent, 2)
                          : "—"}
                        )
                      </span>
                    </td>
                    <td style={{ padding: "8px", textAlign: "right", color: "#38bdf8" }}>
                      {formatCurrency(be.contributionMargin)}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #1e293b", fontWeight: 600, color: "#f87171" }}>
                    <td style={{ padding: "8px" }}>(-) Despesas Operacionais (vencimento no mês)</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>-{formatCurrency(be.operatingExpenses.total)}</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #1e293b", fontSize: "12px", color: "#94a3b8" }}>
                    <td style={{ padding: "5px 8px 5px 24px" }}>• Pró-labore dos Sócios</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>
                      {formatCurrency(be.operatingExpenses.partnerCompensation)}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #1e293b", fontSize: "12px", color: "#94a3b8" }}>
                    <td style={{ padding: "5px 8px 5px 24px" }}>• Encargos sobre Pró-labore / Pessoal (GPS no vencimento)</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>
                      {formatCurrency(be.operatingExpenses.personnel)}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #1e293b", fontSize: "12px", color: "#94a3b8" }}>
                    <td style={{ padding: "5px 8px 5px 24px" }}>• Aluguel e Espaço Físico</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>
                      {formatCurrency(be.operatingExpenses.occupancy)}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #1e293b", fontSize: "12px", color: "#94a3b8" }}>
                    <td style={{ padding: "5px 8px 5px 24px" }}>• Marketing e Publicidade</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>
                      {formatCurrency(be.operatingExpenses.marketing)}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #1e293b", fontSize: "12px", color: "#94a3b8" }}>
                    <td style={{ padding: "5px 8px 5px 24px" }}>• Serviços Operacionais</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>
                      {formatCurrency(be.operatingExpenses.utilities)}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #1e293b", fontSize: "12px", color: "#94a3b8" }}>
                    <td style={{ padding: "5px 8px 5px 24px" }}>• Software e Assinaturas</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>
                      {formatCurrency(be.operatingExpenses.software)}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #1e293b", fontSize: "12px", color: "#94a3b8" }}>
                    <td style={{ padding: "5px 8px 5px 24px" }}>• Contabilidade / Jurídico</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>
                      {formatCurrency(be.operatingExpenses.accounting)}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #1e293b", fontSize: "12px", color: "#94a3b8" }}>
                    <td style={{ padding: "5px 8px 5px 24px" }}>• Infraestrutura / Manutenção</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>
                      {formatCurrency(be.operatingExpenses.infrastructure)}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #1e293b", fontSize: "12px", color: "#94a3b8" }}>
                    <td style={{ padding: "5px 8px 5px 24px" }}>• Administrativo</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>
                      {formatCurrency(be.operatingExpenses.administrative)}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #1e293b", fontWeight: 600 }}>
                    <td style={{ padding: "8px" }}>(+/-) Resultado Financeiro</td>
                    <td
                      style={{
                        padding: "8px",
                        textAlign: "right",
                        color: be.financialResult.total < 0 ? "#f87171" : "#34d399",
                      }}
                    >
                      {formatCurrency(be.financialResult.total)}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #334155", fontWeight: 700, background: "rgba(30, 41, 59, 0.6)" }}>
                    <td style={{ padding: "10px 8px" }}>(=) Ponto de Equilíbrio Operacional do Mês</td>
                    <td style={{ padding: "10px 8px", textAlign: "right", color: "#38bdf8", fontSize: "15px" }}>
                      {be.operationalBreakEvenRevenue !== null
                        ? formatCurrency(be.operationalBreakEvenRevenue)
                        : "—"}
                    </td>
                  </tr>
                  <tr style={{ fontWeight: 700 }}>
                    <td style={{ padding: "10px 8px" }}>
                      {isAbove ? "Superado em" : "Quanto falta vender"}
                    </td>
                    <td
                      style={{
                        padding: "10px 8px",
                        textAlign: "right",
                        color: isAbove ? "#34d399" : "#fbbf24",
                        fontSize: "15px",
                      }}
                    >
                      {isAbove
                        ? formatCurrency(be.surplusRevenue ?? 0)
                        : formatCurrency(be.remainingRevenueNeeded ?? 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
