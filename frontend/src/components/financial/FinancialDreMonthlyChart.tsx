import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Cell,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import type { DreMonthlyItemDto } from "../../api/financial";
import {
  formatCurrency,
  formatPercent,
  formatMonthLabel,
} from "../../utils/formatters";
import { Clock, CheckCircle2, CalendarRange } from "lucide-react";
import {
  buildAdaptiveDreEvolution,
  type DreChartBucket,
  type DreEvolutionPeriod,
} from "./dreEvolutionHelper";

interface FinancialDreMonthlyChartProps {
  monthlyData: DreMonthlyItemDto[];
  period?: DreEvolutionPeriod;
  year?: string;
  onYearChange?: (year: string) => void;
  isLoading?: boolean;
  initialViewMode?: "chart" | "table";
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: DreChartBucket }>;
  hasContextWindow?: boolean;
}

function DreMonthlyTooltip({
  active,
  payload,
  hasContextWindow,
}: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  const isProfit = item.netManagerialResult > 0;
  const isLoss = item.netManagerialResult < 0;

  return (
    <div className="tp-chart-tooltip tp-dre-tooltip">
      <div className="tp-tooltip-header">
        <div className="tp-tooltip-title-group">
          <span className="tp-tooltip-title">{item.label}</span>
          {hasContextWindow && (
            <span
              className={`tp-badge-range-role ${
                item.isSelected ? "is-selected" : "is-context"
              }`}
            >
              {item.isSelected ? "Selecionado" : "Contexto"}
            </span>
          )}
        </div>
        <div className="tp-tooltip-badges">
          {item.dataQuality.isProvisional ? (
            <span className="tp-badge-provisional" title="Competências provisórias">
              <Clock size={11} /> Provisório
            </span>
          ) : (
            <span className="tp-badge-closed" title="Competência fechada">
              <CheckCircle2 size={11} /> Fechado
            </span>
          )}
          <span
            className={`tp-badge-status ${
              isProfit ? "is-profit" : isLoss ? "is-loss" : "is-even"
            }`}
          >
            {item.status === "PROFIT"
              ? "Lucro"
              : item.status === "LOSS"
              ? "Prejuízo"
              : "Equilíbrio"}
          </span>
        </div>
      </div>

      <div className="tp-tooltip-body">
        <div className="tp-tooltip-row">
          <span className="tp-tooltip-label">Receita realizada:</span>
          <span className="tp-tooltip-value tp-color-cyan">
            {formatCurrency(item.realizedRevenue)}
          </span>
        </div>
        <div className="tp-tooltip-row">
          <span className="tp-tooltip-label">CMV estimado:</span>
          <span className="tp-tooltip-value">
            {formatCurrency(item.estimatedCOGS)}
          </span>
        </div>
        <div className="tp-tooltip-row">
          <span className="tp-tooltip-label">Margem de contribuição:</span>
          <span className="tp-tooltip-value tp-color-teal">
            {formatCurrency(item.contributionMargin)} (
            {item.contributionMarginPercent !== null
              ? formatPercent(item.contributionMarginPercent, 1)
              : "—"}
            )
          </span>
        </div>
        <div className="tp-tooltip-row">
          <span className="tp-tooltip-label">Despesas operacionais:</span>
          <span className="tp-tooltip-value">
            {formatCurrency(item.operatingExpensesTotal)}
          </span>
        </div>
        <div className="tp-tooltip-row tp-tooltip-divider">
          <span className="tp-tooltip-label">Resultado líquido:</span>
          <span
            className={`tp-tooltip-value ${
              isProfit
                ? "tp-text-positive"
                : isLoss
                ? "tp-text-negative"
                : ""
            }`}
          >
            {formatCurrency(item.netManagerialResult)} (
            {item.netManagerialMarginPercent !== null
              ? formatPercent(item.netManagerialMarginPercent, 1)
              : "—"}
            )
          </span>
        </div>
        {item.dataQuality.pendingAccruals &&
          item.dataQuality.pendingAccruals.length > 0 && (
            <div className="tp-tooltip-pending-hint">
              Pendências: {item.dataQuality.pendingAccruals.join(", ")}
            </div>
          )}
      </div>
    </div>
  );
}

export function FinancialDreMonthlyChart({
  monthlyData,
  period,
  initialViewMode = "chart",
}: FinancialDreMonthlyChartProps) {
  const [chartViewMode, setChartViewMode] = useState<"chart" | "table">(
    initialViewMode,
  );

  const evolution = useMemo(
    () => buildAdaptiveDreEvolution(monthlyData, period),
    [monthlyData, period],
  );

  const {
    granularity,
    hasContextWindow,
    contextNotice,
    chartBuckets,
    tableRows,
    hasProvisionalInVisibleChart,
  } = evolution;

  const selectedBucketLabels = useMemo(
    () => chartBuckets.filter((b) => b.isSelected).map((b) => b.label),
    [chartBuckets],
  );

  const firstSelectedLabel = selectedBucketLabels[0];
  const lastSelectedLabel =
    selectedBucketLabels[selectedBucketLabels.length - 1];

  const selectedLabelSet = useMemo(
    () => new Set(selectedBucketLabels),
    [selectedBucketLabels],
  );

  const renderXAxisTick = (props: {
    x?: string | number;
    y?: string | number;
    payload?: { value?: string | number };
  }) => {
    const { x = 0, y = 0, payload } = props;
    const label = String(payload?.value ?? "");
    const isSelectedTick = !hasContextWindow || selectedLabelSet.has(label);

    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={12}
          textAnchor="middle"
          fill={
            hasContextWindow
              ? isSelectedTick
                ? "#38bdf8"
                : "#64748b"
              : "#94a3b8"
          }
          fontSize={11}
          fontWeight={hasContextWindow && isSelectedTick ? 700 : 400}
        >
          {label}
        </text>
      </g>
    );
  };

  return (
    <div className="tp-dre-monthly-card tp-card">
      <div className="tp-card-header tp-dre-monthly-header">
        <div className="tp-dre-monthly-title-wrap">
          <h3 className="tp-card-title">Evolução Mensal do Resultado</h3>
          <p className="tp-card-subtitle">
            Série histórica por competência com distinção visual de meses fechados e provisórios.
          </p>
        </div>

        <div className="tp-dre-monthly-controls">
          {chartViewMode === "chart" && contextNotice && (
            <span
              className="tp-badge-context-window"
              data-testid="dre-context-notice"
            >
              <CalendarRange size={12} />
              <span>{contextNotice}</span>
            </span>
          )}

          {hasProvisionalInVisibleChart && (
            <span
              className="tp-badge-provisional-legend"
              title="A série visível contém competências com apropriações a conciliar"
            >
              <Clock size={12} /> Há meses provisórios na série
            </span>
          )}

          <div className="tp-chart-toggle-group">
            <button
              type="button"
              className={`tp-toggle-btn ${chartViewMode === "chart" ? "is-active" : ""}`}
              onClick={() => setChartViewMode("chart")}
              aria-label="Visualização em Gráfico"
            >
              Gráfico
            </button>
            <button
              type="button"
              className={`tp-toggle-btn ${chartViewMode === "table" ? "is-active" : ""}`}
              onClick={() => setChartViewMode("table")}
              aria-label="Visualização em Tabela"
            >
              Tabela
            </button>
          </div>
        </div>
      </div>

      {chartViewMode === "chart" ? (
        <div
          className="tp-dre-chart-wrap"
          style={{ width: "100%", height: 330 }}
          data-granularity={granularity}
          data-chart-buckets={chartBuckets.map((b) => b.label).join(",")}
          data-selected-buckets={selectedBucketLabels.join(",")}
          data-context-buckets={chartBuckets
            .filter((b) => b.isContext)
            .map((b) => b.label)
            .join(",")}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartBuckets}
              margin={{ top: 10, right: 16, bottom: 6, left: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2c48" vertical={false} />
              <XAxis
                dataKey="formattedMonth"
                stroke="#64748b"
                tick={renderXAxisTick}
                axisLine={{ stroke: "#1f2c48" }}
                interval="preserveStartEnd"
                minTickGap={chartBuckets.length > 12 ? 14 : 6}
              />
              <YAxis
                stroke="#64748b"
                width={62}
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={{ stroke: "#1f2c48" }}
                tickFormatter={(val) => {
                  if (Math.abs(val) >= 1000) {
                    return `R$ ${(val / 1000).toFixed(0)}k`;
                  }
                  return `R$ ${val}`;
                }}
              />
              <Tooltip
                content={<DreMonthlyTooltip hasContextWindow={hasContextWindow} />}
              />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: 6, fontSize: 11 }}
              />
              <ReferenceLine y={0} stroke="#475569" strokeDasharray="2 2" />

              {hasContextWindow && firstSelectedLabel && lastSelectedLabel && (
                <ReferenceArea
                  x1={firstSelectedLabel}
                  x2={lastSelectedLabel}
                  fill="rgba(56, 189, 248, 0.07)"
                  stroke="rgba(56, 189, 248, 0.28)"
                  strokeDasharray="3 3"
                />
              )}

              {/* Receita Realizada */}
              <Bar
                name="Receita Realizada"
                dataKey="realizedRevenue"
                fill="#0ea5e9"
                radius={[4, 4, 0, 0]}
                maxBarSize={44}
              >
                {chartBuckets.map((entry) => {
                  const isContextBucket = hasContextWindow && entry.isContext;
                  const isHighlightedBucket =
                    hasContextWindow && entry.isSelected;
                  return (
                    <Cell
                      key={entry.key}
                      fill={isHighlightedBucket ? "#38bdf8" : "#0ea5e9"}
                      fillOpacity={isContextBucket ? 0.3 : 1}
                      stroke={
                        isHighlightedBucket
                          ? "#7dd3fc"
                          : isContextBucket
                          ? "rgba(56, 189, 248, 0.45)"
                          : "none"
                      }
                      strokeWidth={isHighlightedBucket ? 1.5 : isContextBucket ? 1 : 0}
                    />
                  );
                })}
              </Bar>

              {/* Margem de Contribuição */}
              <Line
                type="monotone"
                name="Margem de Contribuição"
                dataKey="contributionMargin"
                stroke="#2dd4bf"
                strokeWidth={2}
                dot={(dotProps: {
                  cx?: number;
                  cy?: number;
                  payload?: DreChartBucket;
                }) => {
                  const { cx = 0, cy = 0, payload } = dotProps;
                  const isCtx = hasContextWindow && payload?.isContext;
                  return (
                    <circle
                      key={`mc-${payload?.key ?? `${cx}-${cy}`}`}
                      cx={cx}
                      cy={cy}
                      r={isCtx ? 3 : hasContextWindow ? 5 : 4}
                      fill="#2dd4bf"
                      fillOpacity={isCtx ? 0.45 : 1}
                      stroke={hasContextWindow && payload?.isSelected ? "#0f172a" : "none"}
                      strokeWidth={hasContextWindow && payload?.isSelected ? 1.5 : 0}
                    />
                  );
                }}
              />

              {/* Resultado Líquido Gerencial Estimado */}
              <Line
                type="monotone"
                name="Resultado Líquido"
                dataKey="netManagerialResult"
                stroke="#f43f5e"
                strokeWidth={2.5}
                dot={(dotProps: {
                  cx?: number;
                  cy?: number;
                  payload?: DreChartBucket;
                }) => {
                  const { cx = 0, cy = 0, payload } = dotProps;
                  const isCtx = hasContextWindow && payload?.isContext;
                  return (
                    <circle
                      key={`net-${payload?.key ?? `${cx}-${cy}`}`}
                      cx={cx}
                      cy={cy}
                      r={isCtx ? 3.5 : hasContextWindow ? 6 : 5}
                      fill="#f43f5e"
                      fillOpacity={isCtx ? 0.45 : 1}
                      stroke={hasContextWindow && payload?.isSelected ? "#ffffff" : "none"}
                      strokeWidth={hasContextWindow && payload?.isSelected ? 1.5 : 0}
                    />
                  );
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="tp-dre-monthly-table-wrap">
          <table className="tp-dre-mini-table" aria-label="Resumo Mensal do DRE">
            <thead>
              <tr>
                <th scope="col">Mês</th>
                <th scope="col">Receita</th>
                <th scope="col">MC (R$)</th>
                <th scope="col">MC (%)</th>
                <th scope="col">Resultado Líquido</th>
                <th scope="col">Margem Líq.</th>
                <th scope="col">Status</th>
                <th scope="col">Qualidade</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((m) => {
                const isProfit = m.netManagerialResult > 0;
                const isLoss = m.netManagerialResult < 0;

                return (
                  <tr
                    key={m.month}
                    className={m.dataQuality.isProvisional ? "tp-row-provisional" : ""}
                  >
                    <td>
                      <strong>{formatMonthLabel(m.month)}</strong>
                    </td>
                    <td>{formatCurrency(m.realizedRevenue)}</td>
                    <td>{formatCurrency(m.contributionMargin)}</td>
                    <td>
                      {m.contributionMarginPercent !== null
                        ? formatPercent(m.contributionMarginPercent, 1)
                        : "—"}
                    </td>
                    <td
                      className={
                        isProfit
                          ? "tp-text-positive"
                          : isLoss
                          ? "tp-text-negative"
                          : ""
                      }
                    >
                      <strong>{formatCurrency(m.netManagerialResult)}</strong>
                    </td>
                    <td>
                      {m.netManagerialMarginPercent !== null
                        ? formatPercent(m.netManagerialMarginPercent, 1)
                        : "—"}
                    </td>
                    <td>
                      <span
                        className={`tp-badge-status ${
                          isProfit ? "is-profit" : isLoss ? "is-loss" : "is-even"
                        }`}
                      >
                        {m.status === "PROFIT"
                          ? "Lucro"
                          : m.status === "LOSS"
                          ? "Prejuízo"
                          : "Equilíbrio"}
                      </span>
                    </td>
                    <td>
                      {m.dataQuality.isProvisional ? (
                        <span
                          className="tp-badge-provisional"
                          title={`Aguardando conciliação: ${m.dataQuality.pendingAccruals.join(", ")}`}
                        >
                          <Clock size={11} /> Provisório
                        </span>
                      ) : (
                        <span className="tp-badge-closed">
                          <CheckCircle2 size={11} /> Fechado
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
