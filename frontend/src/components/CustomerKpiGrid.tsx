import { Users, UserPlus, UserCheck, Repeat } from "lucide-react";
import type {
  CustomerLifetimeMetrics,
  CustomerOverviewMetrics,
} from "../api/bi";
import { formatNumber, formatPercent } from "../utils/formatters";

interface CustomerKpiGridProps {
  metrics: CustomerOverviewMetrics;
  lifetime?: CustomerLifetimeMetrics;
  periodMode?: "range" | "allUpTo";
}

export function CustomerKpiGrid({
  metrics,
  lifetime,
  periodMode = "range",
}: CustomerKpiGridProps) {
  const isAllUpTo = periodMode === "allUpTo" && !!lifetime;

  const card1Label = isAllUpTo ? "Clientes históricos" : "Clientes compradores";
  const card1Value = isAllUpTo ? lifetime.customers : metrics.buyingCustomers;

  const card2Label = isAllUpTo ? "Compra única" : "Clientes novos";
  const card2Value = isAllUpTo
    ? lifetime.singlePurchaseCustomers
    : metrics.newCustomers;

  const card3Label = "Clientes recorrentes";
  const card3Value = isAllUpTo
    ? lifetime.repeatCustomers
    : metrics.returningCustomers;

  const card4Label = isAllUpTo ? "Taxa de recompra" : "Taxa de recorrência";
  const card4Value = isAllUpTo ? lifetime.repeatRate : metrics.recurrenceRate;

  return (
    <section
      className="tp-customer-kpi-section"
      aria-label="Métricas da base de clientes"
    >
      <div className="tp-kpi-grid">
        <article className="tp-kpi-card">
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">{card1Label}</span>
            <span className="tp-kpi-icon-wrap tp-icon-cyan">
              <Users size={16} />
            </span>
          </div>
          <div className="tp-kpi-value-wrap">
            <span className="tp-kpi-value">{formatNumber(card1Value)}</span>
          </div>
        </article>

        <article className="tp-kpi-card">
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">{card2Label}</span>
            <span className="tp-kpi-icon-wrap tp-icon-blue">
              <UserPlus size={16} />
            </span>
          </div>
          <div className="tp-kpi-value-wrap">
            <span className="tp-kpi-value">{formatNumber(card2Value)}</span>
          </div>
        </article>

        <article className="tp-kpi-card">
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">{card3Label}</span>
            <span className="tp-kpi-icon-wrap tp-icon-teal">
              <UserCheck size={16} />
            </span>
          </div>
          <div className="tp-kpi-value-wrap">
            <span className="tp-kpi-value">{formatNumber(card3Value)}</span>
          </div>
        </article>

        <article className="tp-kpi-card tp-kpi-highlight-subtle">
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">{card4Label}</span>
            <span className="tp-kpi-icon-wrap tp-icon-magenta">
              <Repeat size={16} />
            </span>
          </div>
          <div className="tp-kpi-value-wrap">
            <span className="tp-kpi-value">{formatPercent(card4Value)}</span>
          </div>
        </article>
      </div>
    </section>
  );
}
