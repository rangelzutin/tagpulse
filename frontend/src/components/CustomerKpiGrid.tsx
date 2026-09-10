import { Users, UserPlus, UserCheck, Repeat } from "lucide-react";
import type { CustomerOverviewMetrics } from "../api/bi";
import { formatNumber, formatPercent } from "../utils/formatters";

interface CustomerKpiGridProps {
  metrics: CustomerOverviewMetrics;
}

export function CustomerKpiGrid({ metrics }: CustomerKpiGridProps) {
  return (
    <section
      className="tp-customer-kpi-section"
      aria-label="Métricas da base de clientes"
    >
      <div className="tp-kpi-grid">
        <article className="tp-kpi-card">
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">Clientes compradores</span>
            <span className="tp-kpi-icon-wrap tp-icon-cyan">
              <Users size={16} />
            </span>
          </div>
          <div className="tp-kpi-value-wrap">
            <span className="tp-kpi-value">
              {formatNumber(metrics.buyingCustomers)}
            </span>
          </div>
        </article>

        <article className="tp-kpi-card">
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">Clientes novos</span>
            <span className="tp-kpi-icon-wrap tp-icon-blue">
              <UserPlus size={16} />
            </span>
          </div>
          <div className="tp-kpi-value-wrap">
            <span className="tp-kpi-value">
              {formatNumber(metrics.newCustomers)}
            </span>
          </div>
        </article>

        <article className="tp-kpi-card">
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">Clientes recorrentes</span>
            <span className="tp-kpi-icon-wrap tp-icon-teal">
              <UserCheck size={16} />
            </span>
          </div>
          <div className="tp-kpi-value-wrap">
            <span className="tp-kpi-value">
              {formatNumber(metrics.returningCustomers)}
            </span>
          </div>
        </article>

        <article className="tp-kpi-card tp-kpi-highlight-subtle">
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">Taxa de recorrência</span>
            <span className="tp-kpi-icon-wrap tp-icon-magenta">
              <Repeat size={16} />
            </span>
          </div>
          <div className="tp-kpi-value-wrap">
            <span className="tp-kpi-value">
              {formatPercent(metrics.recurrenceRate)}
            </span>
          </div>
        </article>
      </div>
    </section>
  );
}
