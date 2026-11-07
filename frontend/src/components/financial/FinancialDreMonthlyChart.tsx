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
import {
  formatMonthlyBreakEvenTooltip,
  calculateBreakEven,
} from "./dreBreakEvenHelper";

const DRE_PENDING_ACCRUAL_LABELS: Record<string, string> = {
  VARIABLE_TAX_ON_REVENUE: "Impostos sobre vendas",
  OPERATING_PERSONNEL: "Pessoal / encargos",
  PRO_LABORE_GPS: "Encargos de pró-labore",
  DAS: "DAS / Simples Nacional",
  ICMS: "ICMS",
  TAX_ICMS_UNRESOLVED: "ICMS",
  OPERATING_PARTNER_COMPENSATION: "Pró-labore / remuneração de sócios",
  VARIABLE_PAYMENT_FEE: "Taxas de meios de pagamento",
  VARIABLE_FREIGHT_LOGISTICS: "Frete e logística",
  VARIABLE_SALES_COMMISSION: "Comissões de venda",
  VARIABLE_OTHER: "Outras despesas variáveis",
  OPERATING_MARKETING: "Marketing e comercial",
  OPERATING_OCCUPANCY: "Ocupação / aluguel",
  OPERATING_UTILITIES: "Contas de consumo",
  OPERATING_SOFTWARE: "Sistemas e software",
  OPERATING_ACCOUNTING: "Contabilidade e jurídico",
  OPERATING_INFRASTRUCTURE: "Manutenção e infraestrutura",
  OPERATING_ADMINISTRATIVE: "Despesas administrativas",
  OPERATING_OTHER: "Outras despesas operacionais",
  FINANCIAL_EXPENSE: "Despesas financeiras",
  FINANCIAL_INCOME: "Receitas financeiras",
  OTHER_OPERATING_INCOME: "Outras receitas operacionais",
  OTHER_OPERATING_EXPENSE: "Outras saídas operacionais",
  INVENTORY_PURCHASE: "Compras de estoque",
  CAPITAL_MOVEMENT: "Movimentação de capital",
  TRANSFER: "Transferências",
  UNKNOWN: "Pendente de classificação",
};

export function formatDrePendingAccrualLabel(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return "";

  const mapped = DRE_PENDING_ACCRUAL_LABELS[trimmed.toUpperCase()];
  if (mapped) return mapped;

  if (/^[A-Z0-9_]+$/.test(trimmed) || trimmed.includes("_")) {
    return "Outras pendências de conciliação";
  }

  return trimmed;
}

export function formatDrePendingAccruals(
  codes?: string[] | null,
): string[] {
  if (!codes || codes.length === 0) return [];

  const result: string[] = [];
  const seen = new Set<string>();

  for (const raw of codes) {
    if (typeof raw !== "string") continue;
    const label = formatDrePendingAccrualLabel(raw);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    result.push(label);
  }

  return result;
}

interface FinancialDreMonthlyChartProps {
  monthlyData: DreMonthlyItemDto[];
  period?: DreEvolutionPeriod;
  year?: string;
  onYearChange?: (year: string) => void;
  isLoading?: boolean;
  initialViewMode?: "chart" | "table";
  mode?: "interactive" | "export";
  exportWidth?: number;
  exportHeight?: number;
}

export interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: DreChartBucket }>;
  hasContextWindow?: boolean;
  showBreakEven?: boolean;
}

export function DreMonthlyTooltip({
  active,
  payload,
  hasContextWindow,
  showBreakEven = true,
}: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  const isProfit = item.netManagerialResult > 0;
  const isLoss = item.netManagerialResult < 0;
  const pendingLabels = formatDrePendingAccruals(
    item.dataQuality.pendingAccruals,
  );
  const breakEvenHint = item.breakEven
    ? formatMonthlyBreakEvenTooltip(item.breakEven, formatCurrency)
    : null;

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
        {showBreakEven && item.breakEven && (
          <div
            className="tp-tooltip-breakeven-section"
            data-testid="dre-tooltip-breakeven"
          >
            <div className="tp-tooltip-row">
              <span className="tp-tooltip-label">Ponto de equilíbrio:</span>
              <span className="tp-tooltip-value tp-color-amber">
                {item.breakEven.breakEvenRevenue !== null
                  ? formatCurrency(item.breakEven.breakEvenRevenue)
                  : "Indisponível"}
              </span>
            </div>
            {item.breakEven.status === "BELOW_BREAK_EVEN" &&
              item.breakEven.additionalRevenueNeeded !== null && (
                <div className="tp-tooltip-row">
                  <span className="tp-tooltip-label">Gap para equilíbrio:</span>
                  <span className="tp-tooltip-value tp-text-negative">
                    {formatCurrency(item.breakEven.additionalRevenueNeeded)}
                  </span>
                </div>
              )}
            {item.breakEven.status === "ABOVE_BREAK_EVEN" && (
              <div className="tp-tooltip-row">
                <span className="tp-tooltip-label">Gap para equilíbrio:</span>
                <span className="tp-tooltip-value tp-text-positive">
                  {formatCurrency(0)}
                </span>
              </div>
            )}
            <div className="tp-tooltip-row">
              <span className="tp-tooltip-label">Status:</span>
              <span className="tp-tooltip-value">
                {item.breakEven.status === "ABOVE_BREAK_EVEN"
                  ? "Acima do equilíbrio"
                  : item.breakEven.status === "BELOW_BREAK_EVEN"
                  ? "Abaixo do equilíbrio"
                  : item.breakEven.status === "UNVIABLE_MARGIN"
                  ? "Margem insuficiente para estimar equilíbrio"
                  : "Sem faturamento no período"}
              </span>
            </div>
            {breakEvenHint && (
              <div className="tp-tooltip-breakeven-hint">
                {breakEvenHint}
              </div>
            )}
          </div>
        )}
        {pendingLabels.length > 0 && (
          <div className="tp-tooltip-pending-hint">
            <span className="tp-tooltip-pending-label">Pendências:</span>{" "}
            <span className="tp-tooltip-pending-items">
              {pendingLabels.join(" • ")}
            </span>
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
  mode = "interactive",
  exportWidth = 760,
  exportHeight = 250,
}: FinancialDreMonthlyChartProps) {
  const isExport = mode === "export";
  const [chartViewMode, setChartViewMode] = useState<"chart" | "table">(
    initialViewMode,
  );
  const [showBreakEven, setShowBreakEven] = useState(true);
  const effectiveViewMode = isExport ? "chart" : chartViewMode;

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

  const provisionalLabelSet = useMemo(
    () =>
      new Set(
        chartBuckets
          .filter((b) => b.dataQuality.isProvisional)
          .map((b) => b.label),
      ),
    [chartBuckets],
  );

  const visiblePendingLabels = useMemo(
    () =>
      formatDrePendingAccruals(
        chartBuckets.flatMap((b) => b.dataQuality.pendingAccruals ?? []),
      ),
    [chartBuckets],
  );

  const renderXAxisTick = (props: {
    x?: string | number;
    y?: string | number;
    payload?: { value?: string | number };
  }) => {
    const { x = 0, y = 0, payload } = props;
    const label = String(payload?.value ?? "");
    const isSelectedTick = !hasContextWindow || selectedLabelSet.has(label);
    const isProvisionalTick = provisionalLabelSet.has(label);

    const fillColor = isExport
      ? isProvisionalTick
        ? "#b45309"
        : hasContextWindow
        ? isSelectedTick
          ? "#0369a1"
          : "#64748b"
        : "#334155"
      : hasContextWindow
      ? isSelectedTick
        ? "#38bdf8"
        : "#64748b"
      : "#94a3b8";

    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={12}
          textAnchor="middle"
          fill={fillColor}
          fontSize={11}
          fontWeight={
            (hasContextWindow && isSelectedTick) ||
            (isExport && isProvisionalTick)
              ? 700
              : 400
          }
        >
          {isExport && isProvisionalTick ? `${label}*` : label}
        </text>
      </g>
    );
  };

  const renderExportSvgChart = () => {
    const W = exportWidth;
    const H = exportHeight;
    const padLeft = 58;
    const padRight = 18;
    const padTop = 22;
    const padBottom = 28;
    const plotW = Math.max(100, W - padLeft - padRight);
    const plotH = Math.max(80, H - padTop - padBottom);

    const allValues: number[] = [0];
    for (const b of chartBuckets) {
      allValues.push(
        b.realizedRevenue || 0,
        b.contributionMargin || 0,
        b.netManagerialResult || 0,
      );
      if (b.breakEvenRevenue != null) {
        allValues.push(b.breakEvenRevenue);
      }
    }
    const rawMin = Math.min(...allValues, 0);
    const rawMax = Math.max(...allValues, 1000);

    // Compute clean step ticks
    const roughRange = rawMax - rawMin || 1000;
    const mag = Math.pow(10, Math.floor(Math.log10(roughRange)));
    const residual = roughRange / mag;
    const step =
      residual > 5 ? mag : residual > 2 ? mag / 2 : mag / 5;
    const niceMin = Math.floor(rawMin / step) * step;
    const niceMax = Math.ceil(rawMax / step) * step;
    const totalRange = Math.max(1, niceMax - niceMin);

    const yTicks: number[] = [];
    for (let v = niceMin; v <= niceMax + step * 0.01; v += step) {
      yTicks.push(Math.round(v));
    }
    if (!yTicks.includes(0) && niceMin < 0 && niceMax > 0) {
      yTicks.push(0);
      yTicks.sort((a, b) => a - b);
    }

    const yToPx = (val: number) =>
      padTop + plotH - ((val - niceMin) / totalRange) * plotH;

    const count = Math.max(1, chartBuckets.length);
    const slotW = plotW / count;
    const barW = Math.min(38, Math.max(10, Math.round(slotW * 0.56)));
    const xCenter = (idx: number) => padLeft + slotW * idx + slotW / 2;

    const formatYTick = (val: number) => {
      if (val === 0) return "R$ 0";
      if (Math.abs(val) >= 1000) {
        const k = val / 1000;
        const formatted = Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1);
        return `${val < 0 ? "-R$ " : "R$ "}${formatted.replace("-", "")}k`;
      }
      return `R$ ${val}`;
    };

    const yZero = yToPx(0);

    // Context window selected range highlight
    const selectedIndices = chartBuckets
      .map((b, idx) => (b.isSelected ? idx : -1))
      .filter((idx) => idx >= 0);
    const firstSelIdx = selectedIndices.length > 0 ? selectedIndices[0] : -1;
    const lastSelIdx =
      selectedIndices.length > 0
        ? selectedIndices[selectedIndices.length - 1]
        : -1;

    const mcPoints = chartBuckets.map((b, idx) => ({
      x: xCenter(idx),
      y: yToPx(b.contributionMargin || 0),
      bucket: b,
    }));

    const netPoints = chartBuckets.map((b, idx) => ({
      x: xCenter(idx),
      y: yToPx(b.netManagerialResult || 0),
      bucket: b,
    }));

    const bePoints = chartBuckets
      .map((b, idx) => ({
        x: xCenter(idx),
        y: b.breakEvenRevenue != null ? yToPx(b.breakEvenRevenue) : null,
        bucket: b,
      }))
      .filter(
        (p): p is { x: number; y: number; bucket: DreChartBucket } =>
          p.y !== null,
      );

    const buildPath = (pts: Array<{ x: number; y: number }>) =>
      pts
        .map(
          (p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
        )
        .join(" ");

    return (
      <div
        className="recharts-wrapper"
        style={{ position: "relative", width: W, height: H }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="recharts-surface tp-dre-export-svg"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
        >
          {/* Horizontal grid lines & Y-axis labels */}
          {yTicks.map((tickVal) => {
            const y = yToPx(tickVal);
            const isZero = tickVal === 0;
            return (
              <g key={`ytick-${tickVal}`}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={W - padRight}
                  y2={y}
                  stroke={isZero ? "#94a3b8" : "#e2e8f0"}
                  strokeWidth={isZero ? 1.25 : 1}
                  strokeDasharray={isZero ? "4 3" : "3 3"}
                />
                <text
                  x={padLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fill={isZero ? "#334155" : "#64748b"}
                  fontSize={10}
                  fontWeight={isZero ? 700 : 500}
                >
                  {formatYTick(tickVal)}
                </text>
              </g>
            );
          })}

          {/* Context window highlight for selected period */}
          {hasContextWindow && firstSelIdx >= 0 && lastSelIdx >= 0 && (
            <g>
              <rect
                x={padLeft + firstSelIdx * slotW + 2}
                y={padTop}
                width={(lastSelIdx - firstSelIdx + 1) * slotW - 4}
                height={plotH}
                rx={4}
                fill="#0284c7"
                fillOpacity={0.07}
                stroke="#0284c7"
                strokeOpacity={0.35}
                strokeDasharray="4 3"
              />
              <text
                x={
                  padLeft +
                  ((firstSelIdx + lastSelIdx + 1) / 2) * slotW
                }
                y={padTop - 6}
                textAnchor="middle"
                fill="#0369a1"
                fontSize={9.5}
                fontWeight={700}
              >
                Período selecionado
              </text>
            </g>
          )}

          {/* Bars: Receita Realizada */}
          {chartBuckets.map((entry, idx) => {
            const val = entry.realizedRevenue || 0;
            const yVal = yToPx(val);
            const barTop = Math.min(yVal, yZero);
            const barHeight = Math.max(1.5, Math.abs(yZero - yVal));
            const x = xCenter(idx) - barW / 2;
            const isContextBucket = hasContextWindow && entry.isContext;
            const isHighlightedBucket = hasContextWindow && entry.isSelected;
            const isProvisionalEntry = entry.dataQuality.isProvisional;

            return (
              <g key={`bar-${entry.key}`}>
                <rect
                  x={x}
                  y={barTop}
                  width={barW}
                  height={barHeight}
                  rx={3}
                  fill={
                    isProvisionalEntry
                      ? "#38bdf8"
                      : isHighlightedBucket
                      ? "#0284c7"
                      : "#0ea5e9"
                  }
                  fillOpacity={
                    isContextBucket ? 0.3 : isProvisionalEntry ? 0.45 : 0.85
                  }
                  stroke={
                    isProvisionalEntry
                      ? "#d97706"
                      : isHighlightedBucket
                      ? "#0369a1"
                      : "#0284c7"
                  }
                  strokeWidth={
                    isProvisionalEntry ? 1.75 : isHighlightedBucket ? 1.5 : 0.75
                  }
                  strokeDasharray={isProvisionalEntry ? "3 2" : undefined}
                />
              </g>
            );
          })}

          {/* Line: Margem de Contribuição */}
          {mcPoints.length > 1 && (
            <path
              d={buildPath(mcPoints)}
              fill="none"
              stroke="#0d9488"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {mcPoints.map((pt) => {
            const isCtx = hasContextWindow && pt.bucket.isContext;
            return (
              <circle
                key={`mc-dot-${pt.bucket.key}`}
                cx={pt.x}
                cy={pt.y}
                r={isCtx ? 2.75 : 3.5}
                fill="#0d9488"
                fillOpacity={isCtx ? 0.5 : 1}
                stroke="#ffffff"
                strokeWidth={1.25}
              />
            );
          })}

          {/* Line: Resultado Líquido */}
          {netPoints.length > 1 && (
            <path
              d={buildPath(netPoints)}
              fill="none"
              stroke="#e11d48"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {netPoints.map((pt) => {
            const isCtx = hasContextWindow && pt.bucket.isContext;
            const isProv = pt.bucket.dataQuality.isProvisional;
            const isPositive = (pt.bucket.netManagerialResult || 0) >= 0;
            return (
              <g key={`net-dot-${pt.bucket.key}`}>
                {isProv && (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={6.5}
                    fill="none"
                    stroke="#d97706"
                    strokeWidth={1.5}
                    strokeDasharray="2 2"
                  />
                )}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isCtx ? 3.25 : 4.25}
                  fill={isPositive ? "#059669" : "#e11d48"}
                  fillOpacity={isCtx ? 0.55 : 1}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              </g>
            );
          })}

          {/* Line: Ponto de equilíbrio */}
          {showBreakEven && bePoints.length > 1 && (
            <path
              d={buildPath(bePoints)}
              fill="none"
              stroke="#d97706"
              strokeWidth={1.75}
              strokeDasharray="4 3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {showBreakEven &&
            bePoints.map((pt) => (
              <circle
                key={`be-dot-${pt.bucket.key}`}
                cx={pt.x}
                cy={pt.y}
                r={2.5}
                fill="#d97706"
                stroke="none"
              />
            ))}

          {/* X-Axis Baseline & Ticks */}
          <line
            x1={padLeft}
            y1={padTop + plotH}
            x2={W - padRight}
            y2={padTop + plotH}
            stroke="#cbd5e1"
            strokeWidth={1}
          />
          {chartBuckets.map((entry, idx) => {
            const cx = xCenter(idx);
            const label = entry.formattedMonth;
            const isSelectedTick =
              !hasContextWindow || selectedLabelSet.has(label);
            const isProvisionalTick = provisionalLabelSet.has(label);
            const fillColor = isProvisionalTick
              ? "#b45309"
              : hasContextWindow
              ? isSelectedTick
                ? "#0369a1"
                : "#64748b"
              : "#334155";

            return (
              <g key={`xtick-${entry.key}`}>
                <line
                  x1={cx}
                  y1={padTop + plotH}
                  x2={cx}
                  y2={padTop + plotH + 4}
                  stroke="#cbd5e1"
                />
                <text
                  x={cx}
                  y={padTop + plotH + 16}
                  textAnchor="middle"
                  fill={fillColor}
                  fontSize={count > 12 ? 9.5 : 10.5}
                  fontWeight={
                    (hasContextWindow && isSelectedTick) || isProvisionalTick
                      ? 700
                      : 500
                  }
                >
                  {isProvisionalTick ? `${label}*` : label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  const chartElement = (
    <ComposedChart
      width={isExport ? exportWidth : undefined}
      height={isExport ? exportHeight : undefined}
      data={chartBuckets}
      margin={{ top: 10, right: 16, bottom: 6, left: 10 }}
    >
      <CartesianGrid
        strokeDasharray="3 3"
        stroke={isExport ? "#e2e8f0" : "#1f2c48"}
        vertical={false}
      />
      <XAxis
        dataKey="formattedMonth"
        stroke={isExport ? "#64748b" : "#64748b"}
        tick={renderXAxisTick}
        axisLine={{ stroke: isExport ? "#cbd5e1" : "#1f2c48" }}
        interval="preserveStartEnd"
        minTickGap={chartBuckets.length > 12 ? 14 : 6}
      />
      <YAxis
        stroke="#64748b"
        width={62}
        tick={{ fill: isExport ? "#475569" : "#94a3b8", fontSize: 11 }}
        axisLine={{ stroke: isExport ? "#cbd5e1" : "#1f2c48" }}
        tickFormatter={(val) => {
          if (Math.abs(val) >= 1000) {
            return `R$ ${(val / 1000).toFixed(0)}k`;
          }
          return `R$ ${val}`;
        }}
      />
      {!isExport && (
        <Tooltip
          wrapperStyle={{ zIndex: 60, pointerEvents: "none" }}
          content={
            <DreMonthlyTooltip
              hasContextWindow={hasContextWindow}
              showBreakEven={showBreakEven}
            />
          }
        />
      )}
      <Legend
        verticalAlign="top"
        align="right"
        wrapperStyle={{ paddingBottom: 6, fontSize: 11 }}
      />
      <ReferenceLine
        y={0}
        stroke={isExport ? "#94a3b8" : "#475569"}
        strokeDasharray="2 2"
      />

      {hasContextWindow && firstSelectedLabel && lastSelectedLabel && (
        <ReferenceArea
          x1={firstSelectedLabel}
          x2={lastSelectedLabel}
          fill={
            isExport ? "rgba(2, 132, 199, 0.08)" : "rgba(56, 189, 248, 0.07)"
          }
          stroke={
            isExport ? "rgba(2, 132, 199, 0.35)" : "rgba(56, 189, 248, 0.28)"
          }
          strokeDasharray="3 3"
        />
      )}

      {/* Receita Realizada */}
      <Bar
        name="Receita Realizada"
        dataKey="realizedRevenue"
        fill={isExport ? "#0284c7" : "#0ea5e9"}
        radius={[4, 4, 0, 0]}
        maxBarSize={44}
        isAnimationActive={!isExport}
      >
        {chartBuckets.map((entry) => {
          const isContextBucket = hasContextWindow && entry.isContext;
          const isHighlightedBucket = hasContextWindow && entry.isSelected;
          const isProvisionalEntry = entry.dataQuality.isProvisional;
          return (
            <Cell
              key={entry.key}
              fill={
                isExport
                  ? isHighlightedBucket
                    ? "#0284c7"
                    : "#0ea5e9"
                  : isHighlightedBucket
                  ? "#38bdf8"
                  : "#0ea5e9"
              }
              fillOpacity={isContextBucket ? 0.32 : 1}
              stroke={
                isExport && isProvisionalEntry
                  ? "#d97706"
                  : isHighlightedBucket
                  ? isExport
                    ? "#0369a1"
                    : "#7dd3fc"
                  : isContextBucket
                  ? "rgba(56, 189, 248, 0.45)"
                  : "none"
              }
              strokeWidth={
                isExport && isProvisionalEntry
                  ? 2
                  : isHighlightedBucket
                  ? 1.5
                  : isContextBucket
                  ? 1
                  : 0
              }
              strokeDasharray={
                isExport && isProvisionalEntry ? "3 2" : undefined
              }
            />
          );
        })}
      </Bar>

      {/* Margem de Contribuição */}
      <Line
        type="monotone"
        name="Margem de Contribuição"
        dataKey="contributionMargin"
        stroke={isExport ? "#0d9488" : "#2dd4bf"}
        strokeWidth={2}
        isAnimationActive={!isExport}
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
              fill={isExport ? "#0d9488" : "#2dd4bf"}
              fillOpacity={isCtx ? 0.45 : 1}
              stroke={
                hasContextWindow && payload?.isSelected
                  ? isExport
                    ? "#ffffff"
                    : "#0f172a"
                  : "none"
              }
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
        stroke={isExport ? "#e11d48" : "#f43f5e"}
        strokeWidth={2.5}
        isAnimationActive={!isExport}
        dot={(dotProps: {
          cx?: number;
          cy?: number;
          payload?: DreChartBucket;
        }) => {
          const { cx = 0, cy = 0, payload } = dotProps;
          const isCtx = hasContextWindow && payload?.isContext;
          const isProv = payload?.dataQuality.isProvisional;
          return (
            <circle
              key={`net-${payload?.key ?? `${cx}-${cy}`}`}
              cx={cx}
              cy={cy}
              r={isCtx ? 3.5 : hasContextWindow ? 6 : 5}
              fill={isExport ? "#e11d48" : "#f43f5e"}
              fillOpacity={isCtx ? 0.45 : 1}
              stroke={
                isExport && isProv
                  ? "#d97706"
                  : hasContextWindow && payload?.isSelected
                  ? "#ffffff"
                  : "none"
              }
              strokeWidth={
                isExport && isProv
                  ? 2
                  : hasContextWindow && payload?.isSelected
                  ? 1.5
                  : 0
              }
            />
          );
        }}
      />

      {/* Ponto de Equilíbrio Mensal */}
      {showBreakEven && (
        <Line
          type="monotone"
          name="Ponto de equilíbrio"
          dataKey="breakEvenRevenue"
          stroke={isExport ? "#d97706" : "#f59e0b"}
          strokeWidth={1.75}
          strokeDasharray="4 4"
          isAnimationActive={!isExport}
          dot={(dotProps: {
            cx?: number;
            cy?: number;
            payload?: DreChartBucket;
          }) => {
            const { cx = 0, cy = 0, payload } = dotProps;
            if (
              !payload ||
              payload.breakEvenRevenue === null ||
              payload.breakEvenRevenue === undefined
            ) {
              return <g key={`be-null-${cx}-${cy}`} />;
            }
            return (
              <circle
                key={`be-${payload.key ?? `${cx}-${cy}`}`}
                cx={cx}
                cy={cy}
                r={2.5}
                fill={isExport ? "#d97706" : "#f59e0b"}
                stroke="none"
              />
            );
          }}
        />
      )}
    </ComposedChart>
  );

  return (
    <div
      className={`tp-dre-monthly-card tp-card ${
        isExport ? "is-export-mode" : ""
      }`}
    >
      <div className="tp-card-header tp-dre-monthly-header">
        <div className="tp-dre-monthly-title-wrap">
          <h3 className="tp-card-title">Evolução Mensal do Resultado</h3>
          <p className="tp-card-subtitle">
            Série histórica por competência com distinção visual de meses fechados e provisórios.
          </p>
        </div>

        <div className="tp-dre-monthly-controls">
          {effectiveViewMode === "chart" && contextNotice && (
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
              <Clock size={12} />{" "}
              {isExport
                ? "Há competências provisórias no período."
                : "Há meses provisórios na série"}
            </span>
          )}

          {!isExport && effectiveViewMode === "chart" && (
            <label
              className="tp-chart-toggle-check"
              title="Exibir ou ocultar a linha de ponto de equilíbrio no gráfico"
              data-testid="dre-toggle-breakeven-wrap"
            >
              <input
                type="checkbox"
                checked={showBreakEven}
                onChange={(e) => setShowBreakEven(e.target.checked)}
                data-testid="dre-toggle-breakeven"
              />
              <span>Exibir ponto de equilíbrio</span>
            </label>
          )}

          {!isExport && (
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
          )}
        </div>
      </div>

      {effectiveViewMode === "chart" ? (
        <>
          <div
            className="tp-dre-chart-wrap"
            style={{
              width: isExport ? exportWidth : "100%",
              height: isExport ? exportHeight : 330,
            }}
            data-granularity={granularity}
            data-chart-buckets={chartBuckets.map((b) => b.label).join(",")}
            data-selected-buckets={selectedBucketLabels.join(",")}
            data-context-buckets={chartBuckets
              .filter((b) => b.isContext)
              .map((b) => b.label)
              .join(",")}
          >
            {isExport ? (
              renderExportSvgChart()
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                {chartElement}
              </ResponsiveContainer>
            )}
          </div>

          {isExport && (
            <div
              className="tp-dre-export-chart-meta"
              data-testid="dre-export-chart-meta"
            >
              <div className="tp-dre-export-chart-legend-items">
                <span>
                  <strong style={{ color: "#0284c7" }}>■</strong> Receita Realizada
                </span>
                <span>
                  <strong style={{ color: "#0d9488" }}>●</strong> Margem de Contribuição
                </span>
                <span>
                  <strong style={{ color: "#e11d48" }}>●</strong> Resultado Líquido (Lucro &gt; R$ 0 / Prejuízo &lt; R$ 0)
                </span>
                {showBreakEven && (
                  <span>
                    <strong style={{ color: "#d97706" }}>┅</strong> Ponto de equilíbrio
                  </span>
                )}
                <span>
                  <strong style={{ color: "#15803d" }}>✓</strong> Mês fechado
                </span>
                {hasProvisionalInVisibleChart && (
                  <span>
                    <strong style={{ color: "#b45309" }}>*</strong> Competência provisória
                  </span>
                )}
              </div>

              {hasProvisionalInVisibleChart && visiblePendingLabels.length > 0 && (
                <div
                  className="tp-dre-export-chart-pending"
                  data-testid="dre-export-chart-pending"
                >
                  <strong>Pendências na série:</strong>{" "}
                  {visiblePendingLabels.join(" • ")}
                </div>
              )}
            </div>
          )}
        </>
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
                <th scope="col">Ponto de Equilíbrio</th>
                <th scope="col">Gap Equilíbrio</th>
                <th scope="col">Status</th>
                <th scope="col">Qualidade</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((m) => {
                const isProfit = m.netManagerialResult > 0;
                const isLoss = m.netManagerialResult < 0;
                const be =
                  m.breakEven ??
                  calculateBreakEven(
                    m.realizedRevenue,
                    m.contributionMargin,
                    m.netManagerialResult,
                  );
                const pendingLabels = formatDrePendingAccruals(
                  m.dataQuality.pendingAccruals,
                );

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
                      {be.breakEvenRevenue !== null
                        ? formatCurrency(be.breakEvenRevenue)
                        : be.status === "UNVIABLE_MARGIN"
                        ? "Inviável"
                        : "—"}
                    </td>
                    <td>
                      {be.status === "BELOW_BREAK_EVEN" &&
                      be.additionalRevenueNeeded !== null
                        ? formatCurrency(be.additionalRevenueNeeded)
                        : be.status === "ABOVE_BREAK_EVEN"
                        ? "Superado"
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
                          title={
                            pendingLabels.length > 0
                              ? `Aguardando conciliação: ${pendingLabels.join(" • ")}`
                              : "Competência provisória"
                          }
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
