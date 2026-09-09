import { useState } from "react";
import type { SalesOverviewMonthly } from "../api/bi";
import {
  formatCurrency,
  formatNumber,
  formatMonthLabel,
  formatFullMonthName,
} from "../utils/formatters";

interface MonthlyChartProps {
  monthly: SalesOverviewMonthly[];
}

export function MonthlyChart({ monthly }: MonthlyChartProps) {
  const [activeMonth, setActiveMonth] = useState<SalesOverviewMonthly | null>(
    null,
  );

  if (!monthly || monthly.length === 0) {
    return (
      <section className="tp-chart-card" aria-label="Evolução Mensal">
        <h2 className="tp-chart-title">Evolução Mensal</h2>
        <div className="tp-chart-empty">
          <p>Nenhuma venda registrada no período selecionado.</p>
        </div>
      </section>
    );
  }

  const maxRevenue = Math.max(...monthly.map((m) => m.revenue), 0);

  return (
    <section
      className="tp-chart-card"
      aria-label="Evolução Mensal do Faturamento"
    >
      <div className="tp-chart-header">
        <div>
          <h2 className="tp-chart-title">Evolução Mensal</h2>
          <p className="tp-chart-subtitle">Faturamento realizado por mês</p>
        </div>
      </div>

      <div className="tp-chart-wrapper">
        <div
          className="tp-chart-plot"
          role="region"
          aria-label="Gráfico de barras de faturamento por mês"
        >
          {monthly.map((item) => {
            const heightPercent =
              maxRevenue > 0
                ? Math.round((item.revenue / maxRevenue) * 100)
                : 0;

            const isCurrentHovered = activeMonth?.month === item.month;

            return (
              <div
                key={item.month}
                className={`tp-bar-column ${isCurrentHovered ? "is-hovered" : ""}`}
                onMouseEnter={() => setActiveMonth(item)}
                onMouseLeave={() => setActiveMonth(null)}
                onFocus={() => setActiveMonth(item)}
                onBlur={() => setActiveMonth(null)}
                tabIndex={0}
                aria-label={`${formatFullMonthName(item.month)}: ${formatCurrency(item.revenue)}, ${item.sales} vendas`}
              >
                {/* Tooltip flutuante do item selecionado */}
                {isCurrentHovered && (
                  <div className="tp-tooltip" role="tooltip">
                    <div className="tp-tooltip-header">
                      {formatFullMonthName(item.month)}
                    </div>
                    <div className="tp-tooltip-row">
                      <span>Faturamento:</span>
                      <strong>{formatCurrency(item.revenue)}</strong>
                    </div>
                    <div className="tp-tooltip-row">
                      <span>Vendas:</span>
                      <strong>{formatNumber(item.sales)}</strong>
                    </div>
                    <div className="tp-tooltip-row">
                      <span>Ticket médio:</span>
                      <strong>{formatCurrency(item.avgTicket)}</strong>
                    </div>
                    <div className="tp-tooltip-row">
                      <span>Clientes:</span>
                      <strong>{formatNumber(item.customers)}</strong>
                    </div>
                  </div>
                )}

                {/* Valor no topo da barra */}
                <div className="tp-bar-top-value">
                  {item.revenue > 0 ? formatCurrency(item.revenue) : "R$ 0"}
                </div>

                {/* Trilho e Barra */}
                <div className="tp-bar-track">
                  <div
                    className="tp-bar-fill"
                    style={{
                      height:
                        item.revenue > 0
                          ? `${Math.max(heightPercent, 4)}%`
                          : "2px",
                    }}
                  />
                </div>

                {/* Rótulo do eixo X */}
                <div className="tp-bar-x-label">
                  {formatMonthLabel(item.month)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
