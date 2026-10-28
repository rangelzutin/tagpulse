import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";
import type { DreMonthlyItemDto } from "../../api/financial";
import {
  formatCurrency,
  formatPercent,
  formatMonthLabel,
} from "../../utils/formatters";
import { AlertCircle, Clock, CheckCircle2 } from "lucide-react";

interface FinancialDreMonthlyChartProps {
  monthlyData: DreMonthlyItemDto[];
  year: string;
  onYearChange?: (year: string) => void;
  isLoading?: boolean;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

function DreMonthlyTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0]?.payload as DreMonthlyItemDto | undefined;
  if (!item) return null;

  const isProfit = item.netManagerialResult > 0;
  const isLoss = item.netManagerialResult < 0;

  return (
    <div className="tp-chart-tooltip tp-dre-tooltip">
      <div className="tp-tooltip-header">
        <span className="tp-tooltip-title">{formatMonthLabel(item.month)}</span>
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
            {formatCurrency(item.operatingExpenses.total)}
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
        {item.dataQuality.pendingAccruals && item.dataQuality.pendingAccruals.length > 0 && (
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
  year,
  onYearChange,
  isLoading,
}: FinancialDreMonthlyChartProps) {
  const [chartViewMode, setChartViewMode] = useState<"chart" | "table">("chart");

  const chartData = useMemo(() => {
    return monthlyData.map((m) => {
      return {
        ...m,
        formattedMonth: formatMonthLabel(m.month),
        // For visual chart differentiation
        revenueProvisional: m.dataQuality.isProvisional ? m.realizedRevenue : 0,
        revenueClosed: !m.dataQuality.isProvisional ? m.realizedRevenue : 0,
      };
    });
  }, [monthlyData]);

  const hasProvisionalMonths = useMemo(() => {
    return monthlyData.some((m) => m.dataQuality.isProvisional);
  }, [monthlyData]);

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
          {hasProvisionalMonths && (
            <span className="tp-badge-provisional-legend" title="A série histórica anual contém meses com apropriações a conciliar">
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
        <div className="tp-dre-chart-wrap" style={{ width: "100%", height: 380 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2c48" vertical={false} />
              <XAxis
                dataKey="formattedMonth"
                stroke="#64748b"
                tick={{ fill: "#94a3b8", fontSize: 12 }}
                axisLine={{ stroke: "#1f2c48" }}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={{ stroke: "#1f2c48" }}
                tickFormatter={(val) => {
                  if (Math.abs(val) >= 1000) {
                    return `R$ ${(val / 1000).toFixed(0)}k`;
                  }
                  return `R$ ${val}`;
                }}
              />
              <Tooltip content={<DreMonthlyTooltip />} />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: 12, fontSize: 12 }}
              />
              <ReferenceLine y={0} stroke="#475569" strokeDasharray="2 2" />

              {/* Receita Realizada */}
              <Bar
                name="Receita Realizada"
                dataKey="realizedRevenue"
                fill="#0ea5e9"
                radius={[4, 4, 0, 0]}
                maxBarSize={44}
              />

              {/* Margem de Contribuição */}
              <Line
                type="monotone"
                name="Margem de Contribuição"
                dataKey="contributionMargin"
                stroke="#2dd4bf"
                strokeWidth={2}
                dot={{ r: 4, fill: "#2dd4bf" }}
              />

              {/* Resultado Líquido Gerencial Estimado */}
              <Line
                type="monotone"
                name="Resultado Líquido"
                dataKey="netManagerialResult"
                stroke="#f43f5e"
                strokeWidth={2.5}
                dot={{ r: 5, fill: "#f43f5e" }}
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
              {monthlyData.map((m) => {
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
