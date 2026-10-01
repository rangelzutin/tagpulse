import { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  ArrowDownLeft,
  ArrowUpRight,
  Info,
  CalendarOff,
  ChevronRight,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import type {
  ReceivablesOverviewResponse,
  PayablesOverviewResponse,
  CashFlowOverviewResponse,
  UndatedConfirmedCashResponse,
} from "../../api/financial";
import { formatCurrency, formatNumber, formatDateBr, getDefaultPeriod } from "../../utils/formatters";
import { UndatedCashModal } from "./UndatedCashModal";

interface FinancialOverviewTabProps {
  receivablesData: ReceivablesOverviewResponse | null;
  payablesData: PayablesOverviewResponse | null;
  cashFlowData: CashFlowOverviewResponse | null;
  undatedData: UndatedConfirmedCashResponse | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onSelectTab: (tab: "receivables" | "payables" | "cash-flow") => void;
}

export function FinancialOverviewTab({
  receivablesData,
  payablesData,
  cashFlowData,
  undatedData,
  isLoading,
  error,
  onRetry,
  onSelectTab,
}: FinancialOverviewTabProps) {
  const [isUndatedModalOpen, setIsUndatedModalOpen] = useState(false);

  if (error) {
    return (
      <div className="tp-state-card tp-state-error" role="alert">
        <div className="tp-state-icon">
          <AlertCircle size={20} />
        </div>
        <div className="tp-state-content">
          <h3 className="tp-state-title">Falha ao consultar visão geral financeira</h3>
          <p className="tp-state-message">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            disabled={isLoading}
            className="tp-btn-retry"
          >
            <RefreshCw size={13} />
            <span>Tentar novamente</span>
          </button>
        </div>
      </div>
    );
  }

  if (isLoading && !receivablesData && !payablesData && !cashFlowData) {
    return (
      <div className="tp-financial-overview-skeleton" aria-label="Carregando visão geral financeira">
        <div className="tp-kpi-grid">
          {[1, 2, 3, 4].map((idx) => (
            <div key={idx} className="tp-kpi-card tp-skeleton-card">
              <div className="tp-skeleton-line tp-skeleton-short" />
              <div className="tp-skeleton-line tp-skeleton-long" />
              <div className="tp-skeleton-line tp-skeleton-short" style={{ marginTop: "12px" }} />
            </div>
          ))}
        </div>
        <div className="tp-split-grid" style={{ marginTop: "20px" }}>
          <div className="tp-card tp-skeleton-card" style={{ height: "260px" }}>
            <div className="tp-skeleton-line tp-skeleton-short" />
            <div className="tp-skeleton-line tp-skeleton-chart-body" />
          </div>
          <div className="tp-card tp-skeleton-card" style={{ height: "260px" }}>
            <div className="tp-skeleton-line tp-skeleton-short" />
            <div className="tp-skeleton-line tp-skeleton-chart-body" />
          </div>
        </div>
      </div>
    );
  }

  const nonCashStock = cashFlowData?.excludedNonCashStockAdjustments;
  const undatedConfirmed = cashFlowData?.undated ?? undatedData?.summary;
  const hasUndatedConfirmed = Boolean(undatedConfirmed && undatedConfirmed.undatedConfirmedCount > 0);

  const defaultPeriod = getDefaultPeriod();
  const cfFrom = cashFlowData?.from ?? defaultPeriod.from;
  const cfTo = cashFlowData?.to ?? defaultPeriod.to;
  const cashFlowPeriodHint = `${formatDateBr(cfFrom)} a ${formatDateBr(cfTo)} · ${cfFrom.slice(0, 4)} YTD`;

  return (
    <div className="tp-financial-overview-content">
      {/* ========================================================
          1. CALLOUT: CONFIRMADOS SEM DATA (SE HOUVER)
          ======================================================== */}
      {hasUndatedConfirmed && undatedConfirmed && (
        <div className="tp-undated-alert-callout" role="status">
          <div className="tp-undated-alert-left">
            <span className="tp-undated-alert-icon">
              <CalendarOff size={16} />
            </span>
            <div className="tp-undated-alert-text">
              <strong className="tp-undated-alert-title">
                Confirmados sem data de confirmação:
              </strong>{" "}
              <span>
                Existem <strong>{formatNumber(undatedConfirmed.undatedConfirmedCount)}</strong> lançamentos
                marcados como confirmados sem data de confirmação fornecida pela API TagPlus (Saldo:{" "}
                <strong>{formatCurrency(undatedConfirmed.undatedConfirmedNet)}</strong>).
              </span>
            </div>
          </div>
          <button
            type="button"
            className="tp-undated-alert-action-btn"
            onClick={() => setIsUndatedModalOpen(true)}
            aria-label="Ver lançamentos sem data de confirmação"
          >
            <span>Ver lançamentos</span>
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* ========================================================
          2. TOP KPI ROW (4 CARDS ESTRUTURADOS)
          ======================================================== */}
      <section className="tp-kpi-section" aria-label="Indicadores Financeiros Principais">
        <div className="tp-kpi-grid tp-kpi-grid-3">
          {/* KPI 1: A Receber em Aberto */}
          <article
            className="tp-kpi-card tp-financial-card-clickable"
            onClick={() => onSelectTab("receivables")}
            title="Clique para detalhar Contas a Receber"
            tabIndex={0}
            role="button"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelectTab("receivables");
            }}
          >
            <div className="tp-kpi-header">
              <span className="tp-kpi-label">A Receber em Aberto</span>
              <span className="tp-kpi-icon-wrap tp-icon-cyan">
                <ArrowDownLeft size={16} />
              </span>
            </div>
            <div className="tp-kpi-value-wrap">
              <span className="tp-kpi-value">
                {receivablesData ? formatCurrency(receivablesData.openTotal) : "—"}
              </span>
            </div>
            <div className="tp-financial-card-footer">
              <div className="tp-financial-card-stat">
                <span className="tp-stat-count">
                  {receivablesData ? formatNumber(receivablesData.openCount) : 0} títulos
                </span>
                {receivablesData && receivablesData.overdueCount > 0 && (
                  <span className="tp-badge-stat is-rose">
                    {receivablesData.overdueCount} vencidos ({formatCurrency(receivablesData.overdueTotal)})
                  </span>
                )}
                {receivablesData && receivablesData.overdueCount === 0 && (
                  <span className="tp-badge-stat is-emerald">Em dia</span>
                )}
              </div>
            </div>
          </article>

          {/* KPI 2: A Pagar em Aberto */}
          <article
            className="tp-kpi-card tp-financial-card-clickable"
            onClick={() => onSelectTab("payables")}
            title="Clique para detalhar Contas a Pagar"
            tabIndex={0}
            role="button"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelectTab("payables");
            }}
          >
            <div className="tp-kpi-header">
              <span className="tp-kpi-label">A Pagar em Aberto</span>
              <span className="tp-kpi-icon-wrap tp-icon-wine">
                <ArrowUpRight size={16} />
              </span>
            </div>
            <div className="tp-kpi-value-wrap">
              <span className="tp-kpi-value">
                {payablesData ? formatCurrency(payablesData.openTotal) : "—"}
              </span>
            </div>
            <div className="tp-financial-card-footer">
              <div className="tp-financial-card-stat">
                <span className="tp-stat-count">
                  {payablesData ? formatNumber(payablesData.openCount) : 0} títulos
                </span>
                {payablesData && payablesData.overdueCount > 0 && (
                  <span className="tp-badge-stat is-rose">
                    {payablesData.overdueCount} vencidos ({formatCurrency(payablesData.overdueTotal)})
                  </span>
                )}
                {payablesData && payablesData.overdueCount === 0 && (
                  <span className="tp-badge-stat is-emerald">Em dia</span>
                )}
              </div>
            </div>
          </article>

          {/* KPI 3: Saldo de Caixa Realizado no Período (strictly not profit/margin) */}
          <article
            className="tp-kpi-card tp-financial-card-clickable"
            onClick={() => onSelectTab("cash-flow")}
            title="Clique para detalhar Fluxo de Caixa"
            tabIndex={0}
            role="button"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelectTab("cash-flow");
            }}
          >
            <div className="tp-kpi-header">
              <span className="tp-kpi-label">Saldo de Caixa no Período</span>
              <span
                className={`tp-kpi-icon-wrap ${
                  (cashFlowData?.totals.netCashFlow ?? 0) >= 0 ? "tp-icon-teal" : "tp-icon-rose"
                }`}
              >
                {(cashFlowData?.totals.netCashFlow ?? 0) >= 0 ? (
                  <TrendingUp size={16} />
                ) : (
                  <TrendingDown size={16} />
                )}
              </span>
            </div>
            <div className="tp-kpi-value-wrap">
              <span
                className={`tp-kpi-value ${
                  (cashFlowData?.totals.netCashFlow ?? 0) >= 0
                    ? "tp-color-positive"
                    : "tp-color-negative"
                }`}
              >
                {cashFlowData ? formatCurrency(cashFlowData.totals.netCashFlow) : "—"}
              </span>
            </div>
            <div className="tp-financial-card-footer">
              <div className="tp-financial-card-cash-split">
                <span className="tp-split-item is-inflow" title="Entradas realizadas no período">
                  Entradas: {cashFlowData ? formatCurrency(cashFlowData.totals.inflows) : "—"}
                </span>
                <span className="tp-split-item is-outflow" title="Saídas realizadas no período">
                  Saídas: {cashFlowData ? formatCurrency(cashFlowData.totals.outflows) : "—"}
                </span>
              </div>
              <div className="tp-kpi-period-hint">
                {cashFlowPeriodHint}
              </div>
            </div>
          </article>
        </div>

        {/* Métrica Secundária Metodológica / Auditoria */}
        <div className="tp-kpi-secondary-row">
          <aside
            className="tp-kpi-card-secondary tp-card-noncash"
            title="Lançamentos financeiros criados historicamente no ERP apenas para valorar saídas de estoque. Eles não representam pagamentos em dinheiro e são excluídos do fluxo de caixa."
          >
            <div className="tp-kpi-secondary-left">
              <span className="tp-kpi-secondary-badge">Metodologia</span>
              <div className="tp-kpi-label-with-tip">
                <span className="tp-kpi-secondary-label">Lançamentos de estoque excluídos do caixa no período</span>
                <span
                  className="tp-tooltip-trigger"
                  title="Lançamentos financeiros criados historicamente no ERP apenas para valorar saídas de estoque. Eles não representam pagamentos em dinheiro e são excluídos do fluxo de caixa."
                >
                  <Info size={12} />
                </span>
              </div>
            </div>
            <div className="tp-kpi-secondary-right">
              <span className="tp-kpi-secondary-val">
                {nonCashStock ? formatCurrency(nonCashStock.amount) : "—"}
              </span>
              <span className="tp-kpi-secondary-sub">
                {nonCashStock
                  ? `${formatNumber(nonCashStock.count)} ${nonCashStock.count === 1 ? "lançamento financeiro histórico excluído" : "lançamentos financeiros históricos excluídos"} · ${formatCurrency(nonCashStock.amount)}`
                  : "—"}
              </span>
            </div>
          </aside>
        </div>
      </section>

      {/* ========================================================
          3. COMPOSIÇÃO DE AGING & DETALHES OPERACIONAIS
          ======================================================== */}
      <section className="tp-financial-aging-section" aria-label="Aging de Títulos em Aberto">
        <div className="tp-split-grid">
          {/* Coluna 1: Contas a Receber Aging */}
          <div className="tp-card tp-aging-card">
            <div className="tp-card-header">
              <div className="tp-card-title-wrap">
                <ArrowDownLeft size={16} className="tp-color-cyan" />
                <h3 className="tp-card-title">Aging de Contas a Receber</h3>
              </div>
              <button
                type="button"
                className="tp-link-btn"
                onClick={() => onSelectTab("receivables")}
                aria-label="Abrir aba de Contas a Receber"
              >
                <span>Ver lista completa</span>
                <ChevronRight size={14} />
              </button>
            </div>
            <p className="tp-card-subtitle">
              Posição em {receivablesData ? formatDateBr(receivablesData.referenceDate) : "hoje"}:
              distribuição dos títulos por faixa de vencimento.
            </p>

            {receivablesData ? (
              <div className="tp-aging-buckets-list">
                <div className="tp-aging-bucket-item is-warning">
                  <div className="tp-bucket-info">
                    <span className="tp-bucket-name">Vencidos (1–30 dias)</span>
                    <span className="tp-bucket-count">
                      {formatNumber(receivablesData.aging.d1_30.count)} títulos
                    </span>
                  </div>
                  <span className="tp-bucket-amount">
                    {formatCurrency(receivablesData.aging.d1_30.total)}
                  </span>
                </div>

                <div className="tp-aging-bucket-item is-alert">
                  <div className="tp-bucket-info">
                    <span className="tp-bucket-name">Vencidos (31–60 dias)</span>
                    <span className="tp-bucket-count">
                      {formatNumber(receivablesData.aging.d31_60.count)} títulos
                    </span>
                  </div>
                  <span className="tp-bucket-amount">
                    {formatCurrency(receivablesData.aging.d31_60.total)}
                  </span>
                </div>

                <div className="tp-aging-bucket-item is-critical">
                  <div className="tp-bucket-info">
                    <span className="tp-bucket-name">Vencidos (61–90 dias)</span>
                    <span className="tp-bucket-count">
                      {formatNumber(receivablesData.aging.d61_90.count)} títulos
                    </span>
                  </div>
                  <span className="tp-bucket-amount">
                    {formatCurrency(receivablesData.aging.d61_90.total)}
                  </span>
                </div>

                <div className="tp-aging-bucket-item is-severe">
                  <div className="tp-bucket-info">
                    <span className="tp-bucket-name">Vencidos (+90 dias)</span>
                    <span className="tp-bucket-count">
                      {formatNumber(receivablesData.aging.d90_plus.count)} títulos
                    </span>
                  </div>
                  <span className="tp-bucket-amount">
                    {formatCurrency(receivablesData.aging.d90_plus.total)}
                  </span>
                </div>

                <div className="tp-aging-bucket-summary">
                  <div className="tp-aging-sub-stat">
                    <span className="tp-label">Vencem hoje:</span>
                    <span className="tp-val">
                      {formatNumber(receivablesData.dueTodayCount)} ({formatCurrency(receivablesData.dueTodayTotal)})
                    </span>
                  </div>
                  <div className="tp-aging-sub-stat">
                    <span className="tp-label">A vencer futuro:</span>
                    <span className="tp-val">
                      {formatNumber(receivablesData.futureCount)} ({formatCurrency(receivablesData.futureTotal)})
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="tp-empty-state-card">
                <p className="tp-empty-text">Sem dados de contas a receber.</p>
              </div>
            )}
          </div>

          {/* Coluna 2: Contas a Pagar Aging */}
          <div className="tp-card tp-aging-card">
            <div className="tp-card-header">
              <div className="tp-card-title-wrap">
                <ArrowUpRight size={16} className="tp-color-magenta" />
                <h3 className="tp-card-title">Aging de Contas a Pagar</h3>
              </div>
              <button
                type="button"
                className="tp-link-btn"
                onClick={() => onSelectTab("payables")}
                aria-label="Abrir aba de Contas a Pagar"
              >
                <span>Ver lista completa</span>
                <ChevronRight size={14} />
              </button>
            </div>
            <p className="tp-card-subtitle">
              Posição em {payablesData ? formatDateBr(payablesData.referenceDate) : "hoje"}:
              obrigações em aberto por faixa de vencimento.
            </p>

            {payablesData ? (
              <div className="tp-aging-buckets-list">
                <div className="tp-aging-bucket-item is-warning">
                  <div className="tp-bucket-info">
                    <span className="tp-bucket-name">Vencidos (1–30 dias)</span>
                    <span className="tp-bucket-count">
                      {formatNumber(payablesData.aging.d1_30.count)} títulos
                    </span>
                  </div>
                  <span className="tp-bucket-amount">
                    {formatCurrency(payablesData.aging.d1_30.total)}
                  </span>
                </div>

                <div className="tp-aging-bucket-item is-alert">
                  <div className="tp-bucket-info">
                    <span className="tp-bucket-name">Vencidos (31–60 dias)</span>
                    <span className="tp-bucket-count">
                      {formatNumber(payablesData.aging.d31_60.count)} títulos
                    </span>
                  </div>
                  <span className="tp-bucket-amount">
                    {formatCurrency(payablesData.aging.d31_60.total)}
                  </span>
                </div>

                <div className="tp-aging-bucket-item is-critical">
                  <div className="tp-bucket-info">
                    <span className="tp-bucket-name">Vencidos (61–90 dias)</span>
                    <span className="tp-bucket-count">
                      {formatNumber(payablesData.aging.d61_90.count)} títulos
                    </span>
                  </div>
                  <span className="tp-bucket-amount">
                    {formatCurrency(payablesData.aging.d61_90.total)}
                  </span>
                </div>

                <div className="tp-aging-bucket-item is-severe">
                  <div className="tp-bucket-info">
                    <span className="tp-bucket-name">Vencidos (+90 dias)</span>
                    <span className="tp-bucket-count">
                      {formatNumber(payablesData.aging.d90_plus.count)} títulos
                    </span>
                  </div>
                  <span className="tp-bucket-amount">
                    {formatCurrency(payablesData.aging.d90_plus.total)}
                  </span>
                </div>

                <div className="tp-aging-bucket-summary">
                  <div className="tp-aging-sub-stat">
                    <span className="tp-label">Vencem hoje:</span>
                    <span className="tp-val">
                      {formatNumber(payablesData.dueTodayCount)} ({formatCurrency(payablesData.dueTodayTotal)})
                    </span>
                  </div>
                  <div className="tp-aging-sub-stat">
                    <span className="tp-label">A vencer futuro:</span>
                    <span className="tp-val">
                      {formatNumber(payablesData.futureCount)} ({formatCurrency(payablesData.futureTotal)})
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="tp-empty-state-card">
                <p className="tp-empty-text">Sem dados de contas a pagar.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Undated Cash Modal */}
      <UndatedCashModal
        isOpen={isUndatedModalOpen}
        onClose={() => setIsUndatedModalOpen(false)}
        data={undatedData}
        isLoading={isLoading}
      />
    </div>
  );
}
