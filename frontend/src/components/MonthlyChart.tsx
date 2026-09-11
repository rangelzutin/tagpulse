import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import type { SalesOverviewMonthly, SalesTrend, SalesTrendGranularity } from "../api/bi";
import {
  formatCurrency,
  formatNumber,
  formatMonthLabel,
  formatFullMonthName,
  formatCompactCurrency,
  formatDisplayDate,
} from "../utils/formatters";

interface MonthlyChartProps {
  trend?: SalesTrend;
  monthly?: SalesOverviewMonthly[];
  from?: string;
  toDate?: string;
}

interface ChartItem {
  key: string;
  xAxisLabel: string;
  tooltipTitle: string;
  revenue: number;
  sales: number;
  avgTicket: number;
  customers: number;
  isJuly2026: boolean;
  isPartial?: boolean;
}

interface TooltipPayloadItem {
  payload: ChartItem;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}

function isMonthPartial(monthKey: string, toDate?: string): boolean {
  if (!toDate || !toDate.startsWith(monthKey)) return false;
  const parts = toDate.split("-");
  if (parts.length < 3) return false;
  const year = parseInt(parts[0]!, 10);
  const month = parseInt(parts[1]!, 10);
  const day = parseInt(parts[2]!, 10);
  const lastDay = new Date(year, month, 0).getDate();
  return day < lastDay;
}

function CustomChartTooltip({ active, payload }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    const data = payload[0]!.payload;
    return (
      <div className="tp-chart-custom-tooltip">
        <div className="tp-tooltip-title">{data.tooltipTitle}</div>
        <div className="tp-tooltip-grid">
          <div className="tp-tooltip-row">
            <span className="tp-tooltip-key">Faturamento:</span>
            <span className="tp-tooltip-value tp-value-cyan">
              {formatCurrency(data.revenue)}
            </span>
          </div>
          <div className="tp-tooltip-row">
            <span className="tp-tooltip-key">Vendas:</span>
            <span className="tp-tooltip-value">{formatNumber(data.sales)}</span>
          </div>
          <div className="tp-tooltip-row">
            <span className="tp-tooltip-key">Ticket médio:</span>
            <span className="tp-tooltip-value">
              {formatCurrency(data.avgTicket)}
            </span>
          </div>
          <div className="tp-tooltip-row">
            <span className="tp-tooltip-key">Clientes:</span>
            <span className="tp-tooltip-value">
              {formatNumber(data.customers)}
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

export function MonthlyChart({ trend, monthly, from, toDate }: MonthlyChartProps) {
  const granularity: SalesTrendGranularity = trend ? trend.granularity : "monthly";

  const chartData = useMemo<ChartItem[]>(() => {
    if (trend && trend.points && trend.points.length > 0) {
      return trend.points.map((p) => {
        let tooltipTitle = p.label;
        let isPartial = false;
        let isJuly = false;

        if (trend.granularity === "daily") {
          tooltipTitle = formatDisplayDate(p.periodStart);
          isJuly = p.key === "2026-07-01";
        } else if (trend.granularity === "weekly") {
          tooltipTitle = `Semana: ${formatDisplayDate(p.periodStart)} a ${formatDisplayDate(p.periodEnd)}`;
          isJuly = p.periodStart <= "2026-07-01" && p.periodEnd >= "2026-07-01";
        } else {
          // monthly
          isPartial = isMonthPartial(p.key, toDate);
          const full = formatFullMonthName(p.key);
          tooltipTitle = isPartial ? `${full} (parcial)` : full;
          isJuly = p.key === "2026-07";
        }

        return {
          key: p.key,
          xAxisLabel: p.label,
          tooltipTitle,
          revenue: p.revenue,
          sales: p.sales,
          avgTicket: p.averageTicket,
          customers: p.customers,
          isJuly2026: isJuly,
          isPartial,
        };
      });
    }

    if (monthly && monthly.length > 0) {
      return monthly.map((item) => {
        const isPartial = isMonthPartial(item.month, toDate);
        const baseLabel = formatMonthLabel(item.month);
        const monthLabel = isPartial ? `${baseLabel} parcial` : baseLabel;
        const baseFull = formatFullMonthName(item.month);
        const tooltipTitle = isPartial ? `${baseFull} (parcial)` : baseFull;

        return {
          key: item.month,
          xAxisLabel: monthLabel,
          tooltipTitle,
          revenue: item.revenue,
          sales: item.sales,
          avgTicket: item.avgTicket,
          customers: item.customers,
          isJuly2026: item.month === "2026-07",
          isPartial,
        };
      });
    }

    return [];
  }, [trend, monthly, toDate]);

  // Determine if July 1, 2026 is strictly within the selected from/to interval
  const isJuly2026InInterval = Boolean(
    from && toDate && from <= "2026-07-01" && toDate >= "2026-07-01",
  );

  const julyItem = isJuly2026InInterval
    ? chartData.find((item) => item.isJuly2026)
    : undefined;

  const isSinglePoint = chartData.length === 1;

  if (chartData.length === 0) {
    return (
      <section className="tp-chart-card" aria-label="Evolução do Faturamento">
        <div className="tp-chart-header">
          <div>
            <h2 className="tp-chart-title">Evolução do Faturamento</h2>
            <p className="tp-chart-subtitle">
              Faturamento realizado no período selecionado
            </p>
          </div>
        </div>
        <div className="tp-chart-empty">
          <p>Nenhuma venda registrada no período selecionado.</p>
        </div>
      </section>
    );
  }

  const subtitle =
    granularity === "daily"
      ? "Acompanhamento diário da receita realizada no período selecionado"
      : granularity === "weekly"
        ? "Acompanhamento semanal da receita realizada no período selecionado"
        : "Acompanhamento mensal da receita realizada no período selecionado";

  // Dot settings for visibility
  const dotConfig = isSinglePoint
    ? { r: 6, fill: "#38bdf8", stroke: "#0a0e17", strokeWidth: 2 }
    : chartData.length <= 31
      ? { r: 2.5, fill: "#38bdf8", stroke: "#0a0e17", strokeWidth: 1.5 }
      : false;

  return (
    <section
      className="tp-chart-card"
      aria-label="Evolução do Faturamento"
    >
      <div className="tp-chart-header">
        <div>
          <div className="tp-title-with-badge">
            <h2 className="tp-chart-title">Evolução do Faturamento</h2>
            <span className="tp-badge-count">
              {granularity === "daily"
                ? `${chartData.length} ${chartData.length === 1 ? "dia" : "dias"}`
                : granularity === "weekly"
                  ? `${chartData.length} ${chartData.length === 1 ? "semana" : "semanas"}`
                  : `${chartData.length} ${chartData.length === 1 ? "mês" : "meses"}`}
            </span>
          </div>
          <p className="tp-chart-subtitle">{subtitle}</p>
        </div>
      </div>

      <div className="tp-recharts-container">
        <ResponsiveContainer width="100%" height={225}>
          <AreaChart
            data={chartData}
            margin={{ top: 20, right: 18, left: -4, bottom: 4 }}
          >
            <defs>
              <linearGradient
                id="tpRevenueGradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
                <stop offset="85%" stopColor="#0284c7" stopOpacity={0.03} />
                <stop offset="100%" stopColor="#0f172a" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#1e293b"
              vertical={false}
            />

            <XAxis
              dataKey="xAxisLabel"
              stroke="#64748b"
              tickLine={false}
              axisLine={{ stroke: "#1e293b" }}
              tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 500 }}
              dy={6}
            />

            <YAxis
              stroke="#64748b"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickFormatter={formatCompactCurrency}
              width={64}
            />

            <Tooltip
              content={<CustomChartTooltip />}
              cursor={{
                stroke: "#38bdf8",
                strokeWidth: 1.5,
                strokeDasharray: "3 3",
              }}
            />

            {julyItem && (
              <ReferenceLine
                x={julyItem.xAxisLabel}
                stroke="#64748b"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: "Entrada do varejo no TagPlus",
                  position: "top",
                  fill: "#94a3b8",
                  fontSize: 11,
                  fontWeight: 500,
                  offset: 8,
                }}
              />
            )}

            <Area
              type="monotone"
              dataKey="revenue"
              name="Faturamento"
              stroke="#38bdf8"
              strokeWidth={2.5}
              fill="url(#tpRevenueGradient)"
              dot={dotConfig}
              activeDot={{
                r: 5,
                fill: "#38bdf8",
                stroke: "#0a0e17",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
