import { DollarSign, ShoppingBag, TrendingUp, Users } from "lucide-react";
import type { SalesOverviewSummary } from "../api/bi";
import { formatCurrency, formatNumber } from "../utils/formatters";

interface KpiGridProps {
  summary: SalesOverviewSummary;
}

export function KpiGrid({ summary }: KpiGridProps) {
  return (
    <section className="tp-kpi-section" aria-label="Indicadores Comerciais">
      <div className="tp-kpi-grid">
        <article className="tp-kpi-card tp-kpi-highlight">
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">Faturamento</span>
            <span className="tp-kpi-icon-wrap tp-icon-cyan">
              <DollarSign size={16} />
            </span>
          </div>
          <div className="tp-kpi-value-wrap">
            <span className="tp-kpi-value">
              {formatCurrency(summary.revenue)}
            </span>
          </div>
        </article>

        <article className="tp-kpi-card">
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">Vendas</span>
            <span className="tp-kpi-icon-wrap tp-icon-blue">
              <ShoppingBag size={16} />
            </span>
          </div>
          <div className="tp-kpi-value-wrap">
            <span className="tp-kpi-value">{formatNumber(summary.sales)}</span>
          </div>
        </article>

        <article className="tp-kpi-card">
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">Ticket médio</span>
            <span className="tp-kpi-icon-wrap tp-icon-teal">
              <TrendingUp size={16} />
            </span>
          </div>
          <div className="tp-kpi-value-wrap">
            <span className="tp-kpi-value">
              {formatCurrency(summary.avgTicket)}
            </span>
          </div>
        </article>

        <article className="tp-kpi-card">
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">Clientes compradores</span>
            <span className="tp-kpi-icon-wrap tp-icon-indigo">
              <Users size={16} />
            </span>
          </div>
          <div className="tp-kpi-value-wrap">
            <span className="tp-kpi-value">
              {formatNumber(summary.customers)}
            </span>
          </div>
        </article>
      </div>

      {summary.salesWithoutCustomer > 0 && (
        <div className="tp-kpi-secondary-info">
          <span className="tp-secondary-dot" />
          <span className="tp-secondary-label">
            Vendas sem cliente identificado no período:
          </span>
          <span className="tp-secondary-value">
            {formatNumber(summary.salesWithoutCustomer)}
          </span>
        </div>
      )}
    </section>
  );
}
