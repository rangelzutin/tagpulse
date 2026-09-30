import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  ArrowDownLeft,
  ArrowUpRight,
  Layers,
  CalendarOff,
  ChevronRight,
  Info,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import {
  fetchCashFlowOverview,
  fetchUndatedConfirmedCash,
  type CashFlowOverviewResponse,
  type UndatedConfirmedCashResponse,
} from "../../api/financial";
import {
  formatCurrency,
  formatNumber,
  formatCompactCurrency,
  formatMonthLabel,
  formatDisplayDate,
  getDefaultPeriod,
} from "../../utils/formatters";
import { PeriodFilter, type PeriodMode } from "../PeriodFilter";
import { UndatedCashModal } from "./UndatedCashModal";

interface FinancialCashFlowTabProps {
  initialOverview?: CashFlowOverviewResponse | null;
}

interface CashFlowChartItem {
  period: string;
  label: string;
  inflows: number;
  outflows: number;
  netCashFlow: number;
  inflowCount: number;
  outflowCount: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: CashFlowChartItem }>;
}

function CustomCashFlowTooltip({ active, payload }: CustomTooltipProps) {
  if (active && payload && payload.length > 0) {
    const data = payload[0]!.payload;
    return (
      <div className="tp-chart-custom-tooltip">
        <div className="tp-tooltip-title">{data.label}</div>
        <div className="tp-tooltip-grid">
          <div className="tp-tooltip-row">
            <span className="tp-tooltip-key">Entradas realizadas:</span>
            <span className="tp-tooltip-value tp-value-emerald">
              {formatCurrency(data.inflows)}
            </span>
          </div>
          <div className="tp-tooltip-row">
            <span className="tp-tooltip-key">Saídas realizadas:</span>
            <span className="tp-tooltip-value tp-value-rose">
              {formatCurrency(data.outflows)}
            </span>
          </div>
          <div className="tp-tooltip-row">
            <span className="tp-tooltip-key">Saldo de caixa:</span>
            <span
              className={`tp-tooltip-value ${
                data.netCashFlow >= 0 ? "tp-value-cyan" : "tp-color-negative"
              }`}
            >
              {formatCurrency(data.netCashFlow)}
            </span>
          </div>
          <div className="tp-tooltip-row" style={{ marginTop: "4px", fontSize: "0.75rem", opacity: 0.8 }}>
            <span className="tp-tooltip-key">Movimentações:</span>
            <span className="tp-tooltip-value">
              {formatNumber(data.inflowCount + data.outflowCount)} ({data.inflowCount}E / {data.outflowCount}S)
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

export function FinancialCashFlowTab({
  initialOverview,
}: FinancialCashFlowTabProps) {
  const [currentPeriod, setCurrentPeriod] = useState(() => getDefaultPeriod());
  const [periodMode, setPeriodMode] = useState<PeriodMode>("range");
  const [granularity, setGranularity] = useState<"month" | "day">("month");

  // Only use initialOverview if it actually matches currentPeriod and granularity
  const isInitialMatching = Boolean(
    initialOverview &&
      initialOverview.from === currentPeriod.from &&
      initialOverview.to === currentPeriod.to &&
      initialOverview.granularity === granularity,
  );

  const [cashFlowData, setCashFlowData] = useState<CashFlowOverviewResponse | null>(
    isInitialMatching && initialOverview ? initialOverview : null,
  );
  const [undatedData, setUndatedData] = useState<UndatedConfirmedCashResponse | null>(null);
  const [isLoading, setIsLoading] = useState(!isInitialMatching);
  const [error, setError] = useState<string | null>(null);

  const [isUndatedModalOpen, setIsUndatedModalOpen] = useState(false);

  // Load Cash Flow data
  const loadCashFlow = useCallback(
    async (from: string, to: string, gran: "month" | "day") => {
      setIsLoading(true);
      setError(null);

      try {
        const [cfRes, undatedRes] = await Promise.allSettled([
          fetchCashFlowOverview({ from, to, granularity: gran }),
          fetchUndatedConfirmedCash(),
        ]);

        if (cfRes.status === "fulfilled") {
          setCashFlowData(cfRes.value);
        } else {
          setCashFlowData(null);
          throw new Error(cfRes.reason?.message || "Erro ao consultar fluxo de caixa.");
        }

        if (undatedRes.status === "fulfilled") {
          setUndatedData(undatedRes.value);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Falha ao consultar fluxo de caixa.";
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadCashFlow(currentPeriod.from, currentPeriod.to, granularity);
  }, [currentPeriod.from, currentPeriod.to, granularity, loadCashFlow]);

  const handleApplyFilter = (from: string, to: string, mode: PeriodMode) => {
    setPeriodMode(mode);
    setCurrentPeriod({ from, to });
  };

  const handleGranularityChange = (newGran: "month" | "day") => {
    if (newGran === granularity) return;
    setGranularity(newGran);
  };

  const chartData = useMemo<CashFlowChartItem[]>(() => {
    const rawSeries = cashFlowData?.series ?? [];
    return rawSeries.map((p) => {
      let label = p.period;
      if (granularity === "month") {
        label = formatMonthLabel(p.period);
      } else {
        label = formatDisplayDate(p.period);
      }

      return {
        period: p.period,
        label,
        inflows: p.inflows,
        outflows: p.outflows,
        netCashFlow: p.netCashFlow,
        inflowCount: p.inflowCount,
        outflowCount: p.outflowCount,
      };
    });
  }, [cashFlowData?.series, granularity]);

  const nonCashStock = cashFlowData?.excludedNonCashStockAdjustments;
  const undatedSummary = cashFlowData?.undated ?? undatedData?.summary;
  const hasUndated = Boolean(undatedSummary && undatedSummary.undatedConfirmedCount > 0);

  return (
    <div className="tp-financial-subview tp-cash-flow-view">
      {/* ========================================================
          1. CONTROLS BAR: PERIOD FILTER + GRANULARITY SELECTOR
          ======================================================== */}
      <div className="tp-cashflow-controls-bar">
        <div className="tp-granularity-selector" role="radiogroup" aria-label="Granularidade do gráfico">
          <span className="tp-control-label">Visualizar por:</span>
          <div className="tp-granularity-pills">
            <button
              type="button"
              role="radio"
              aria-checked={granularity === "month"}
              className={`tp-filter-pill ${granularity === "month" ? "is-selected" : ""}`}
              onClick={() => handleGranularityChange("month")}
              disabled={isLoading}
            >
              Mês
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={granularity === "day"}
              className={`tp-filter-pill ${granularity === "day" ? "is-selected" : ""}`}
              onClick={() => handleGranularityChange("day")}
              disabled={isLoading}
            >
              Dia
            </button>
          </div>
        </div>

        <div className="tp-cashflow-period-wrap">
          <PeriodFilter
            initialFrom={currentPeriod.from}
            initialTo={currentPeriod.to}
            periodMode={periodMode}
            isLoading={isLoading}
            onApply={handleApplyFilter}
          />
        </div>
      </div>

      {/* ========================================================
          2. CALLOUT: CONFIRMADOS SEM DATA
          ======================================================== */}
      {hasUndated && undatedSummary && (
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
                Existem <strong>{formatNumber(undatedSummary.undatedConfirmedCount)}</strong> lançamentos
                confirmados sem data no ERP (Saldo:{" "}
                <strong>{formatCurrency(undatedSummary.undatedConfirmedNet)}</strong>). Esses lançamentos não
                entram no gráfico por período porque não possuem data de confirmação registrada.
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
          3. ERROR STATE (EXCLUSIVE)
          ======================================================== */}
      {error && (
        <div className="tp-state-card tp-state-error" role="alert">
          <div className="tp-state-icon">
            <AlertCircle size={20} />
          </div>
          <div className="tp-state-content">
            <h3 className="tp-state-title">Falha ao consultar fluxo de caixa</h3>
            <p className="tp-state-message">{error}</p>
            <button
              type="button"
              onClick={() => void loadCashFlow(currentPeriod.from, currentPeriod.to, granularity)}
              disabled={isLoading}
              className="tp-btn-retry"
            >
              <RefreshCw size={13} />
              <span>Tentar novamente</span>
            </button>
          </div>
        </div>
      )}

      {!error && (
        <>
          {/* ========================================================
              4. 3 MAIN CASH KPIS + NON-CASH ADJUSTMENT METRIC
              ======================================================== */}
          <section className="tp-kpi-section" aria-label="Totais de Fluxo de Caixa Realizado">
        <div className="tp-kpi-grid tp-kpi-grid-4">
          {/* Entradas Realizadas */}
          <article className="tp-kpi-card">
            <div className="tp-kpi-header">
              <span className="tp-kpi-label">Entradas realizadas</span>
              <span className="tp-kpi-icon-wrap tp-icon-teal">
                <ArrowDownLeft size={16} />
              </span>
            </div>
            <div className="tp-kpi-value-wrap">
              <span className="tp-kpi-value tp-value-emerald">
                {cashFlowData ? formatCurrency(cashFlowData.totals.inflows) : "—"}
              </span>
            </div>
            <div className="tp-financial-card-footer">
              <span className="tp-stat-count">
                {cashFlowData ? `${formatNumber(cashFlowData.totals.inflowCount)} recebimentos` : "—"}
              </span>
            </div>
          </article>

          {/* Saídas Realizadas */}
          <article className="tp-kpi-card">
            <div className="tp-kpi-header">
              <span className="tp-kpi-label">Saídas realizadas</span>
              <span className="tp-kpi-icon-wrap tp-icon-wine">
                <ArrowUpRight size={16} />
              </span>
            </div>
            <div className="tp-kpi-value-wrap">
              <span className="tp-kpi-value tp-value-rose">
                {cashFlowData ? formatCurrency(cashFlowData.totals.outflows) : "—"}
              </span>
            </div>
            <div className="tp-financial-card-footer">
              <span className="tp-stat-count">
                {cashFlowData ? `${formatNumber(cashFlowData.totals.outflowCount)} pagamentos` : "—"}
              </span>
            </div>
          </article>

          {/* Saldo de Caixa Realizado */}
          <article className="tp-kpi-card tp-kpi-highlight">
            <div className="tp-kpi-header">
              <span className="tp-kpi-label">Saldo de caixa</span>
              <span
                className={`tp-kpi-icon-wrap ${
                  (cashFlowData?.totals.netCashFlow ?? 0) >= 0 ? "tp-icon-cyan" : "tp-icon-rose"
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
              <span className="tp-stat-count">
                {cashFlowData ? `${formatNumber(cashFlowData.totals.totalCount)} baixas no período` : "—"}
              </span>
            </div>
          </article>

          {/* Saídas Não-Caixa Segregadas */}
          <article
            className="tp-kpi-card tp-card-noncash"
            title="Lançamentos financeiros criados historicamente no ERP apenas para valorar saídas de estoque. Eles não representam pagamentos em dinheiro e são excluídos do fluxo de caixa."
          >
            <div className="tp-kpi-header">
              <div className="tp-kpi-label-with-tip">
                <span className="tp-kpi-label">Lançamentos de estoque excluídos do caixa</span>
                <span
                  className="tp-tooltip-trigger"
                  title="Lançamentos financeiros criados historicamente no ERP apenas para valorar saídas de estoque. Eles não representam pagamentos em dinheiro e são excluídos do fluxo de caixa."
                >
                  <Info size={12} />
                </span>
              </div>
              <span className="tp-kpi-icon-wrap tp-icon-indigo">
                <Layers size={16} />
              </span>
            </div>
            <div className="tp-kpi-value-wrap">
              <span className="tp-kpi-value">
                {nonCashStock ? formatCurrency(nonCashStock.amount) : "—"}
              </span>
            </div>
            <div className="tp-financial-card-footer">
              <span className="tp-stat-count tp-text-muted">
                {nonCashStock ? `${formatNumber(nonCashStock.count)} ${nonCashStock.count === 1 ? "lançamento financeiro histórico excluído no período" : "lançamentos financeiros históricos excluídos no período"}` : "—"}
              </span>
            </div>
          </article>
        </div>
      </section>

      {/* ========================================================
          5. CASH FLOW EVOLUTION CHART (RECHARTS)
          ======================================================== */}
      <section className="tp-chart-section" aria-label="Evolução Temporal do Fluxo de Caixa">
        <div className="tp-chart-card">
          <div className="tp-chart-header">
            <div>
              <h3 className="tp-chart-title">Evolução do Fluxo de Caixa Realizado</h3>
              <p className="tp-chart-subtitle">
                Entradas e saídas liquidadas por período com indicador de saldo de caixa líquido.
              </p>
            </div>
            <div className="tp-chart-legend-custom">
              <span className="tp-legend-item">
                <span className="tp-legend-color tp-bg-emerald" />
                <span>Entradas</span>
              </span>
              <span className="tp-legend-item">
                <span className="tp-legend-color tp-bg-rose" />
                <span>Saídas</span>
              </span>
              <span className="tp-legend-item">
                <span className="tp-legend-color tp-bg-cyan" />
                <span>Saldo líquido</span>
              </span>
            </div>
          </div>

          {isLoading && !cashFlowData ? (
            <div className="tp-chart-skeleton" aria-label="Carregando gráfico">
              <div className="tp-skeleton-line tp-skeleton-chart-body" style={{ height: "300px" }} />
            </div>
          ) : chartData.length === 0 ? (
            <div className="tp-state-card tp-state-empty">
              <div className="tp-state-content">
                <h3 className="tp-state-title">Nenhum movimento de caixa no período</h3>
                <p className="tp-state-message">
                  Não foram encontradas confirmações/baixas financeiras no intervalo selecionado.
                </p>
              </div>
            </div>
          ) : (
            <div className="tp-chart-body" style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 15, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: "#334155" }}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: "#334155" }}
                    tickFormatter={(val: number) => formatCompactCurrency(val)}
                  />
                  <Tooltip content={<CustomCashFlowTooltip />} />
                  <Bar
                    dataKey="inflows"
                    name="Entradas"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                  <Bar
                    dataKey="outflows"
                    name="Saídas"
                    fill="#f43f5e"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                  <Line
                    type="monotone"
                    dataKey="netCashFlow"
                    name="Saldo líquido"
                    stroke="#38bdf8"
                    strokeWidth={2.5}
                    dot={{ fill: "#38bdf8", r: 3 }}
                    activeDot={{ fill: "#7dd3fc", r: 5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      {/* ========================================================
          6. TIMESERIES BREAKDOWN TABLE
          ======================================================== */}
      {chartData.length > 0 && (
        <section className="tp-financial-table-section" aria-label="Detalhamento por Período">
          <div className="tp-card">
            <div className="tp-card-header">
              <h3 className="tp-card-title">Detalhamento dos Períodos</h3>
              <span className="tp-card-count">{chartData.length} períodos</span>
            </div>
            <div className="tp-table-container">
              <table className="tp-table tp-table-compact" aria-label="Detalhamento de períodos do fluxo de caixa">
                <thead>
                  <tr>
                    <th className="tp-th tp-th-left">Período</th>
                    <th className="tp-th tp-th-right">Entradas</th>
                    <th className="tp-th tp-th-right">Saídas</th>
                    <th className="tp-th tp-th-right">Saldo Líquido</th>
                    <th className="tp-th tp-th-center">Movimentações</th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((row) => (
                    <tr key={row.period} className="tp-table-row">
                      <td className="tp-td tp-td-left tp-font-medium">{row.label}</td>
                      <td className="tp-td tp-td-right tp-font-mono tp-value-emerald">
                        {formatCurrency(row.inflows)}
                      </td>
                      <td className="tp-td tp-td-right tp-font-mono tp-value-rose">
                        {formatCurrency(row.outflows)}
                      </td>
                      <td
                        className={`tp-td tp-td-right tp-font-mono tp-font-medium ${
                          row.netCashFlow >= 0 ? "tp-value-cyan" : "tp-color-negative"
                        }`}
                      >
                        {formatCurrency(row.netCashFlow)}
                      </td>
                      <td className="tp-td tp-td-center tp-text-muted tp-font-mono">
                        {row.inflowCount}E / {row.outflowCount}S
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
      </>
    )}

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
