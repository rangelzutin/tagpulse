import { useMemo } from "react";
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
} from "recharts";
import type { ProfitabilityTrendPoint } from "../api/bi";
import {
  formatCompactCurrency,
  formatCurrency,
  formatNumber,
} from "../utils/formatters";

interface ProfitabilityTrendChartProps {
  trend: ProfitabilityTrendPoint[];
  granularity: "DAY" | "MONTH";
}

function formatPeriodLabel(periodStr: string, granularity: "DAY" | "MONTH"): string {
  if (granularity === "DAY") {
    // YYYY-MM-DD -> DD/MM
    const parts = periodStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}`;
    }
    return periodStr;
  }
  // YYYY-MM -> MMM/YY
  const parts = periodStr.split("-");
  if (parts.length === 2) {
    const monthNames = [
      "Jan",
      "Fev",
      "Mar",
      "Abr",
      "Mai",
      "Jun",
      "Jul",
      "Ago",
      "Set",
      "Out",
      "Nov",
      "Dez",
    ];
    const monthIdx = parseInt(parts[1]!, 10) - 1;
    const yearShort = parts[0]!.slice(2);
    return `${monthNames[monthIdx] ?? parts[1]}/${yearShort}`;
  }
  return periodStr;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  granularity: "DAY" | "MONTH";
}

function CustomTooltip({ active, payload, label, granularity }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0]?.payload as ProfitabilityTrendPoint | undefined;
  if (!data) return null;

  return (
    <div className="tp-chart-tooltip">
      <div className="tp-tooltip-header">
        <span className="tp-tooltip-title">
          {granularity === "DAY" ? `Data: ${data.period}` : `Mês: ${data.period}`}
        </span>
        {data.costCoveragePercent !== null && (
          <span className="tp-tooltip-badge">
            Cobertura: {formatNumber(data.costCoveragePercent)}%
          </span>
        )}
      </div>
      <div className="tp-tooltip-body">
        <div className="tp-tooltip-row">
          <span className="tp-tooltip-label">Receita realizada:</span>
          <span className="tp-tooltip-value tp-color-cyan">
            {formatCurrency(data.realizedRevenue)}
          </span>
        </div>
        <div className="tp-tooltip-row">
          <span className="tp-tooltip-label">CMV estimado:</span>
          <span className="tp-tooltip-value tp-color-blue">
            {formatCurrency(data.estimatedCOGS)}
          </span>
        </div>
        <div className="tp-tooltip-row">
          <span className="tp-tooltip-label">Lucro bruto est.:</span>
          <span className="tp-tooltip-value tp-color-teal">
            {formatCurrency(data.estimatedGrossProfit)}
          </span>
        </div>
        <div className="tp-tooltip-row">
          <span className="tp-tooltip-label">Margem bruta est.:</span>
          <span
            className={`tp-tooltip-value ${
              data.estimatedGrossMarginPercent !== null &&
              data.estimatedGrossMarginPercent < 0
                ? "tp-color-magenta"
                : "tp-color-teal"
            }`}
          >
            {data.estimatedGrossMarginPercent !== null
              ? `${formatNumber(data.estimatedGrossMarginPercent)}%`
              : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

export function ProfitabilityTrendChart({
  trend,
  granularity,
}: ProfitabilityTrendChartProps) {
  const chartData = useMemo(() => {
    return trend.map((p) => ({
      ...p,
      displayLabel: formatPeriodLabel(p.period, granularity),
    }));
  }, [trend, granularity]);

  return (
    <div className="tp-card tp-profit-chart-card">
      <div className="tp-card-header">
        <div>
          <h3 className="tp-card-title">Evolução Temporal da Rentabilidade</h3>
          <p className="tp-card-subtitle">
            Comparativo de Receita realizada vs CMV estimado ao custo atual e Margem bruta estimada (%)
          </p>
        </div>
        <div className="tp-chart-granularity-badge">
          {granularity === "DAY" ? "Agrupamento Diário" : "Agrupamento Mensal"}
        </div>
      </div>

      <div className="tp-chart-container" style={{ height: 320, width: "100%" }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 12, right: 24, left: 8, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2c48" vertical={false} />
            <XAxis
              dataKey="displayLabel"
              stroke="#64748b"
              fontSize={12}
              tickLine={false}
              axisLine={{ stroke: "#1f2c48" }}
            />
            <YAxis
              yAxisId="left"
              stroke="#64748b"
              fontSize={12}
              tickLine={false}
              axisLine={{ stroke: "#1f2c48" }}
              tickFormatter={(val: number) => formatCompactCurrency(val)}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#64748b"
              fontSize={12}
              tickLine={false}
              axisLine={{ stroke: "#1f2c48" }}
              tickFormatter={(val: number) => `${val}%`}
              domain={[0, "auto"]}
            />
            <Tooltip
              content={<CustomTooltip granularity={granularity} />}
              cursor={{ fill: "rgba(255, 255, 255, 0.03)" }}
            />
            <Legend
              wrapperStyle={{ paddingTop: "12px", fontSize: "12px" }}
              formatter={(value) => {
                if (value === "realizedRevenue") return "Receita realizada";
                if (value === "estimatedCOGS") return "CMV estimado ao custo atual";
                if (value === "estimatedGrossMarginPercent") return "Margem bruta estimada (%)";
                return value;
              }}
            />
            <Bar
              yAxisId="left"
              dataKey="realizedRevenue"
              fill="#0ea5e9"
              radius={[3, 3, 0, 0]}
              maxBarSize={32}
            />
            <Bar
              yAxisId="left"
              dataKey="estimatedCOGS"
              fill="#3b82f6"
              radius={[3, 3, 0, 0]}
              maxBarSize={32}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="estimatedGrossMarginPercent"
              stroke="#2dd4bf"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "#2dd4bf" }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="tp-chart-footnote">
        Nota: Linha temporal contínua preenchida com zero nos intervalos sem movimentações realizadas.
      </div>
    </div>
  );
}
