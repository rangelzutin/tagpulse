import { useState, useEffect, useCallback, useRef } from "react";
import {
  DollarSign,
  TrendingDown,
  TrendingUp,
  Percent,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  Scale,
  Calendar,
  Layers,
} from "lucide-react";
import {
  fetchFinancialDreSummary,
  fetchFinancialDreMonthly,
  fetchFinancialDreBreakdown,
  type DreSummaryDto,
  type DreMonthlyItemDto,
  type DreBreakdownDto,
  DRE_DISCLAIMER,
} from "../../api/financial";
import {
  formatCurrency,
  formatPercent,
  formatDateBr,
} from "../../utils/formatters";
import { FinancialDreTable } from "./FinancialDreTable";
import { FinancialDreMonthlyChart } from "./FinancialDreMonthlyChart";
import { FinancialDreBreakdownCard } from "./FinancialDreBreakdownCard";

interface FinancialDreTabProps {
  currentPeriod: {
    from: string;
    to: string;
  };
  isLoadingGlobal?: boolean;
}

export function formatPendingAccrualLabel(code: string): string {
  switch (code) {
    case "VARIABLE_TAX_ON_REVENUE":
      return "DAS / tributos sobre vendas";
    case "OPERATING_PERSONNEL":
      return "GPS / encargos";
    case "TAX_ICMS_UNRESOLVED":
      return "ICMS pendente de conciliação";
    default:
      return code;
  }
}

export function FinancialDreTab({ currentPeriod, isLoadingGlobal }: FinancialDreTabProps) {
  // Data states
  const [summaryData, setSummaryData] = useState<DreSummaryDto | null>(null);
  const [monthlyData, setMonthlyData] = useState<DreMonthlyItemDto[]>([]);
  const [breakdownData, setBreakdownData] = useState<DreBreakdownDto | null>(null);

  // Loading and Error states
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [isLoadingMonthly, setIsLoadingMonthly] = useState(true);
  const [isLoadingBreakdown, setIsLoadingBreakdown] = useState(true);

  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [monthlyError, setMonthlyError] = useState<string | null>(null);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);

  const [selectedYear, setSelectedYear] = useState<string>(() => {
    return currentPeriod.to ? currentPeriod.to.slice(0, 4) : String(new Date().getFullYear());
  });

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Update selected year when currentPeriod changes
  useEffect(() => {
    if (currentPeriod.to) {
      setSelectedYear(currentPeriod.to.slice(0, 4));
    }
  }, [currentPeriod.to]);

  // Load Summary
  const loadSummary = useCallback(async (from: string, to: string) => {
    setIsLoadingSummary(true);
    setSummaryError(null);
    try {
      const data = await fetchFinancialDreSummary({ from, to });
      if (isMountedRef.current) {
        setSummaryData(data);
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
        const msg = err instanceof Error ? err.message : "Erro ao carregar resumo do DRE.";
        setSummaryError(msg);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingSummary(false);
      }
    }
  }, []);

  // Load Monthly
  const loadMonthly = useCallback(async (yearStr: string) => {
    setIsLoadingMonthly(true);
    setMonthlyError(null);
    try {
      const data = await fetchFinancialDreMonthly({ year: yearStr });
      if (isMountedRef.current) {
        setMonthlyData(data);
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
        const msg = err instanceof Error ? err.message : "Erro ao carregar série mensal do DRE.";
        setMonthlyError(msg);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingMonthly(false);
      }
    }
  }, []);

  // Load Breakdown
  const loadBreakdown = useCallback(async (from: string, to: string) => {
    setIsLoadingBreakdown(true);
    setBreakdownError(null);
    try {
      const data = await fetchFinancialDreBreakdown({ from, to });
      if (isMountedRef.current) {
        setBreakdownData(data);
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
        const msg = err instanceof Error ? err.message : "Erro ao carregar composição de despesas.";
        setBreakdownError(msg);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingBreakdown(false);
      }
    }
  }, []);

  // Effect to reload all when period changes
  useEffect(() => {
    void loadSummary(currentPeriod.from, currentPeriod.to);
    void loadBreakdown(currentPeriod.from, currentPeriod.to);
    void loadMonthly(selectedYear);
  }, [currentPeriod.from, currentPeriod.to, selectedYear, loadSummary, loadBreakdown, loadMonthly]);

  // Main error state if summary failed completely
  if (summaryError && !summaryData) {
    return (
      <div className="tp-state-card tp-state-error" role="alert">
        <div className="tp-state-icon">
          <AlertCircle size={22} />
        </div>
        <div className="tp-state-content">
          <h3 className="tp-state-title">Falha ao carregar DRE Gerencial</h3>
          <p className="tp-state-message">{summaryError}</p>
          <button
            type="button"
            className="tp-btn-retry"
            onClick={() => {
              void loadSummary(currentPeriod.from, currentPeriod.to);
              void loadBreakdown(currentPeriod.from, currentPeriod.to);
              void loadMonthly(selectedYear);
            }}
          >
            <RefreshCw size={13} />
            <span>Tentar novamente</span>
          </button>
        </div>
      </div>
    );
  }

  // Skeleton loading state
  if (isLoadingSummary && !summaryData) {
    return (
      <div className="tp-section-skeleton tp-dre-skeleton" aria-label="Carregando DRE Gerencial">
        {/* KPI Skeleton Grid */}
        <div className="tp-kpi-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="tp-kpi-card tp-skeleton-card">
              <div className="tp-skeleton-line tp-skeleton-short" />
              <div className="tp-skeleton-line tp-skeleton-long" />
            </div>
          ))}
        </div>
        {/* Secondary Strip Skeleton */}
        <div className="tp-dre-secondary-strip tp-skeleton-card">
          <div className="tp-skeleton-line tp-skeleton-long" />
        </div>
        {/* Table & Chart Skeletons */}
        <div className="tp-card tp-skeleton-card tp-skeleton-table">
          <div className="tp-skeleton-line tp-skeleton-short" />
          <div className="tp-skeleton-line tp-skeleton-chart-body" />
        </div>
      </div>
    );
  }

  const totals = summaryData?.totals;
  const isProvisional = summaryData?.dataQuality.isProvisional ?? false;
  const isClosed = summaryData?.dataQuality.financiallyClosed ?? false;
  const pendingAccruals = summaryData?.dataQuality.pendingAccruals ?? [];

  // Check empty state
  const isEmpty =
    !totals ||
    (totals.realizedRevenue === 0 &&
      totals.operatingExpenses.total === 0 &&
      totals.variableExpenses.total === 0);

  if (isEmpty) {
    return (
      <div className="tp-state-card tp-state-empty">
        <div className="tp-state-content">
          <h3 className="tp-state-title">Nenhum movimento disponível para o período selecionado.</h3>
          <p className="tp-state-message">
            Tente selecionar outro intervalo de datas para visualizar o resultado econômico da operação.
          </p>
        </div>
      </div>
    );
  }

  const isPositiveNet = totals.netManagerialResult > 0;
  const isNegativeNet = totals.netManagerialResult < 0;

  return (
    <div className="tp-dre-module-content" aria-label="DRE Gerencial">
      {/* Context & Quality Header Banner */}
      <section className="tp-dre-context-banner" aria-label="Informações do período">
        <div className="tp-dre-context-left">
          <div className="tp-dre-period-tag">
            <Calendar size={13} />
            <span>
              {formatDateBr(currentPeriod.from)} — {formatDateBr(currentPeriod.to)}
            </span>
          </div>

          {/* Temporal Quality Badge */}
          {isProvisional ? (
            <div
              className="tp-quality-badge is-provisional"
              title="Existem competências ainda não disponíveis no financeiro."
            >
              <Clock size={12} />
              <span>Provisório</span>
              {pendingAccruals.length > 0 && (
                <span className="tp-pending-hint">
                  — aguardando:{" "}
                  {pendingAccruals.map(formatPendingAccrualLabel).join(", ")}
                </span>
              )}
            </div>
          ) : isClosed ? (
            <div className="tp-quality-badge is-closed">
              <CheckCircle2 size={12} />
              <span>Fechado</span>
              {summaryData?.lastClosedMonth && (
                <span className="tp-closed-hint">
                  (Até {summaryData.lastClosedMonth})
                </span>
              )}
            </div>
          ) : null}

          {/* Economic Status Badge */}
          <div
            className={`tp-economic-status-badge ${
              totals.status === "PROFIT"
                ? "is-profit"
                : totals.status === "LOSS"
                ? "is-loss"
                : "is-even"
            }`}
          >
            <span className="tp-status-dot" />
            <span>
              {totals.status === "PROFIT"
                ? "Lucro"
                : totals.status === "LOSS"
                ? "Prejuízo"
                : "Equilíbrio"}
            </span>
          </div>
        </div>

        {/* Coverage and Disclaimer */}
        <div className="tp-dre-context-right">
          <span
            className="tp-dre-coverage-pill"
            title="Cobertura de classificação gerencial dos lançamentos"
          >
            Cobertura: {summaryData.dataQuality.dreClassificationCoveragePercent}%
          </span>
          {summaryData.dataQuality.unknownAmount > 0 && (
            <span
              className="tp-dre-unknown-pill"
              title="Valores não classificados gerencialmente"
            >
              Não classificado: {formatCurrency(summaryData.dataQuality.unknownAmount)}
            </span>
          )}
        </div>
      </section>

      {/* Provisional notice explanation if provisional */}
      {isProvisional && (
        <div className="tp-provisional-callout" role="note">
          <div className="tp-provisional-callout-content">
            <strong>Resultado provisório:</strong> Existem competências ainda não disponíveis no
            financeiro (competências de impostos e encargos com vencimento diferido).
          </div>
        </div>
      )}

      {/* Primary KPI Grid (4 Cards) */}
      <section className="tp-kpi-section" aria-label="Indicadores Prioritários">
        <div className="tp-kpi-grid tp-dre-kpi-grid">
          {/* KPI 1 — Receita Realizada */}
          <article className="tp-kpi-card tp-profit-kpi-card tp-kpi-highlight">
            <div className="tp-profit-kpi-header">
              <span className="tp-profit-kpi-label">Receita Realizada</span>
              <span className="tp-kpi-icon-wrap tp-icon-cyan">
                <DollarSign size={16} />
              </span>
            </div>
            <div className="tp-profit-kpi-value-wrap">
              <span className="tp-kpi-value">{formatCurrency(totals.realizedRevenue)}</span>
            </div>
            <div className="tp-profit-kpi-footer">
              <span className="tp-profit-kpi-subtext">Faturamento líquido faturado no período</span>
            </div>
          </article>

          {/* KPI 2 — Margem de Contribuição */}
          <article className="tp-kpi-card tp-profit-kpi-card">
            <div className="tp-profit-kpi-header">
              <span className="tp-profit-kpi-label">Margem de Contribuição</span>
              <span className="tp-kpi-icon-wrap tp-icon-teal">
                <TrendingUp size={16} />
              </span>
            </div>
            <div className="tp-profit-kpi-value-wrap">
              <span className="tp-kpi-value">{formatCurrency(totals.contributionMargin)}</span>
            </div>
            <div className="tp-profit-kpi-footer">
              <span className="tp-kpi-meta-badge tp-meta-teal">
                {totals.contributionMarginPercent !== null
                  ? formatPercent(totals.contributionMarginPercent, 2)
                  : "—"}
              </span>
              <span className="tp-profit-kpi-subtext">Após CMV e desp. variáveis</span>
            </div>
          </article>

          {/* KPI 3 — Resultado Líquido Gerencial Estimado */}
          <article
            className={`tp-kpi-card tp-profit-kpi-card ${
              isPositiveNet
                ? "tp-card-profit"
                : isNegativeNet
                ? "tp-card-loss"
                : ""
            }`}
          >
            <div className="tp-profit-kpi-header">
              <span className="tp-profit-kpi-label">Resultado Líquido Gerencial Estimado</span>
              <span
                className={`tp-kpi-icon-wrap ${
                  isPositiveNet ? "tp-icon-teal" : isNegativeNet ? "tp-icon-magenta" : "tp-icon-blue"
                }`}
              >
                {isPositiveNet ? (
                  <TrendingUp size={16} />
                ) : isNegativeNet ? (
                  <TrendingDown size={16} />
                ) : (
                  <Scale size={16} />
                )}
              </span>
            </div>
            <div className="tp-profit-kpi-value-wrap">
              <span
                className={`tp-kpi-value ${
                  isPositiveNet
                    ? "tp-value-positive"
                    : isNegativeNet
                    ? "tp-value-negative"
                    : ""
                }`}
              >
                {formatCurrency(totals.netManagerialResult)}
              </span>
            </div>
            <div className="tp-profit-kpi-footer">
              <span
                className={`tp-kpi-status-badge ${
                  isPositiveNet ? "is-profit" : isNegativeNet ? "is-loss" : "is-even"
                }`}
              >
                {totals.status === "PROFIT"
                  ? "Lucro"
                  : totals.status === "LOSS"
                  ? "Prejuízo"
                  : "Equilíbrio"}
              </span>
              <span className="tp-profit-kpi-subtext">Resultado operacional líquido</span>
            </div>
          </article>

          {/* KPI 4 — Margem Líquida Gerencial Estimada */}
          <article className="tp-kpi-card tp-profit-kpi-card">
            <div className="tp-profit-kpi-header">
              <span className="tp-profit-kpi-label">Margem Líquida Gerencial Estimada</span>
              <span
                className={`tp-kpi-icon-wrap ${
                  isPositiveNet ? "tp-icon-teal" : isNegativeNet ? "tp-icon-magenta" : "tp-icon-blue"
                }`}
              >
                <Percent size={16} />
              </span>
            </div>
            <div className="tp-profit-kpi-value-wrap">
              <span
                className={`tp-kpi-value ${
                  totals.netManagerialMarginPercent !== null && totals.netManagerialMarginPercent < 0
                    ? "tp-value-negative"
                    : totals.netManagerialMarginPercent !== null && totals.netManagerialMarginPercent > 0
                    ? "tp-value-positive"
                    : ""
                }`}
              >
                {totals.netManagerialMarginPercent !== null
                  ? formatPercent(totals.netManagerialMarginPercent, 2)
                  : "—"}
              </span>
            </div>
            <div className="tp-profit-kpi-footer">
              <span className="tp-profit-kpi-subtext">Sobre a receita realizada</span>
            </div>
          </article>
        </div>
      </section>

      {/* Secondary Indicators Strip (5 Compact Metrics) */}
      <section className="tp-dre-secondary-strip" aria-label="Indicadores Secundários">
        <div className="tp-secondary-metric-item">
          <span className="tp-secondary-label">CMV Estimado ao Custo Atual</span>
          <span className="tp-secondary-value">{formatCurrency(totals.estimatedCOGS)}</span>
        </div>
        <div className="tp-secondary-divider" />
        <div className="tp-secondary-metric-item">
          <span className="tp-secondary-label">Lucro Bruto Estimado</span>
          <span className="tp-secondary-value">{formatCurrency(totals.estimatedGrossProfit)}</span>
        </div>
        <div className="tp-secondary-divider" />
        <div className="tp-secondary-metric-item">
          <span className="tp-secondary-label">Margem Bruta Estimada</span>
          <span className="tp-secondary-value">
            {totals.estimatedGrossMarginPercent !== null
              ? formatPercent(totals.estimatedGrossMarginPercent, 2)
              : "—"}
          </span>
        </div>
        <div className="tp-secondary-divider" />
        <div className="tp-secondary-metric-item">
          <span className="tp-secondary-label">Despesas Operacionais</span>
          <span className="tp-secondary-value">{formatCurrency(totals.operatingExpenses.total)}</span>
        </div>
        <div className="tp-secondary-divider" />
        <div className="tp-secondary-metric-item">
          <span className="tp-secondary-label">Resultado Financeiro</span>
          <span
            className={`tp-secondary-value ${
              totals.financialResult.total < 0
                ? "tp-text-negative"
                : totals.financialResult.total > 0
                ? "tp-text-positive"
                : ""
            }`}
          >
            {formatCurrency(totals.financialResult.total)}
          </span>
        </div>
      </section>

      {/* 1. Full-Width Monthly Evolution Section */}
      <section className="tp-dre-evolution-section" aria-label="Evolução Mensal do Resultado">
        {monthlyError ? (
          <div className="tp-state-card tp-state-error" role="alert">
            <div className="tp-state-icon">
              <AlertCircle size={18} />
            </div>
            <div className="tp-state-content">
              <h4 className="tp-state-title">Falha ao carregar evolução mensal</h4>
              <p className="tp-state-message">{monthlyError}</p>
              <button
                type="button"
                className="tp-btn-retry"
                onClick={() => void loadMonthly(selectedYear)}
              >
                <RefreshCw size={12} />
                <span>Tentar novamente</span>
              </button>
            </div>
          </div>
        ) : (
          <FinancialDreMonthlyChart
            monthlyData={monthlyData}
            year={selectedYear}
            onYearChange={setSelectedYear}
            isLoading={isLoadingMonthly}
          />
        )}
      </section>

      {/* 2. Full-Width DRE Table Section */}
      <section className="tp-dre-table-section" aria-label="Demonstrativo do Resultado do Exercício">
        <FinancialDreTable totals={totals} realizedRevenue={totals.realizedRevenue} />
      </section>

      {/* 3. Full-Width Expense Breakdown Section */}
      <section className="tp-dre-breakdown-section" aria-label="Composição das Despesas">
        {breakdownError ? (
          <div className="tp-state-card tp-state-error" role="alert">
            <div className="tp-state-icon">
              <AlertCircle size={18} />
            </div>
            <div className="tp-state-content">
              <h4 className="tp-state-title">Falha ao carregar composição de despesas</h4>
              <p className="tp-state-message">{breakdownError}</p>
              <button
                type="button"
                className="tp-btn-retry"
                onClick={() => void loadBreakdown(currentPeriod.from, currentPeriod.to)}
              >
                <RefreshCw size={12} />
                <span>Tentar novamente</span>
              </button>
            </div>
          </div>
        ) : (
          <FinancialDreBreakdownCard
            breakdown={breakdownData}
            isLoading={isLoadingBreakdown}
          />
        )}
      </section>

      {/* Discreet Legal & Managerial Disclaimer */}
      <footer className="tp-dre-footer-disclaimer">
        <HelpCircle size={14} className="tp-disclaimer-icon" />
        <span>{summaryData.disclaimer || DRE_DISCLAIMER}</span>
      </footer>
    </div>
  );
}
