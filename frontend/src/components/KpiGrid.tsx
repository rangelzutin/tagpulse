import type { SalesOverviewSummary } from "../api/bi";
import { formatCurrency, formatNumber } from "../utils/formatters";

interface KpiGridProps {
  summary: SalesOverviewSummary;
}

export function KpiGrid({ summary }: KpiGridProps) {
  return (
    <section className="tp-kpi-section" aria-label="Indicadores Comerciais">
      <div className="tp-kpi-grid">
        <article className="tp-kpi-card">
          <span className="tp-kpi-label">Faturamento</span>
          <span className="tp-kpi-value tp-kpi-primary">
            {formatCurrency(summary.revenue)}
          </span>
        </article>

        <article className="tp-kpi-card">
          <span className="tp-kpi-label">Vendas</span>
          <span className="tp-kpi-value">{formatNumber(summary.sales)}</span>
        </article>

        <article className="tp-kpi-card">
          <span className="tp-kpi-label">Ticket médio</span>
          <span className="tp-kpi-value">
            {formatCurrency(summary.avgTicket)}
          </span>
        </article>

        <article className="tp-kpi-card">
          <span className="tp-kpi-label">Clientes compradores</span>
          <span className="tp-kpi-value">
            {formatNumber(summary.customers)}
          </span>
        </article>
      </div>

      <div className="tp-kpi-secondary-info">
        <span className="tp-secondary-label">
          Vendas sem cliente identificado:
        </span>
        <span className="tp-secondary-value">
          {formatNumber(summary.salesWithoutCustomer)}
        </span>
      </div>
    </section>
  );
}
