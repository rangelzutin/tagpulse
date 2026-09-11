import { Users, UserPlus, UserCheck, Repeat } from "lucide-react";
import type {
  CustomerLifetimeMetrics,
  CustomerOverviewMetrics,
  CustomerSegmentType,
} from "../api/bi";
import type { RateContextData } from "./CustomerSegmentView";
import { formatNumber, formatPercent } from "../utils/formatters";

interface CustomerKpiGridProps {
  metrics: CustomerOverviewMetrics;
  lifetime?: CustomerLifetimeMetrics;
  periodMode?: "range" | "allUpTo";
  onSelectSegment?: (
    segment: CustomerSegmentType,
    rateContext?: RateContextData | null,
  ) => void;
}

export function CustomerKpiGrid({
  metrics,
  lifetime,
  periodMode = "range",
  onSelectSegment,
}: CustomerKpiGridProps) {
  const isAllUpTo = periodMode === "allUpTo" && !!lifetime;

  const card1Label = isAllUpTo ? "Clientes históricos" : "Clientes compradores";
  const card1Value = isAllUpTo ? lifetime.customers : metrics.buyingCustomers;
  const card1Segment: CustomerSegmentType = isAllUpTo ? "historical" : "buyers";

  const card2Label = isAllUpTo ? "Compra única" : "Clientes novos";
  const card2Value = isAllUpTo
    ? lifetime.singlePurchaseCustomers
    : metrics.newCustomers;
  const card2Segment: CustomerSegmentType = isAllUpTo ? "single" : "new";

  const card3Label = "Clientes recorrentes";
  const card3Value = isAllUpTo
    ? lifetime.repeatCustomers
    : metrics.returningCustomers;
  const card3Segment: CustomerSegmentType = isAllUpTo ? "repeat" : "returning";

  const card4Label = isAllUpTo ? "Taxa de recompra" : "Taxa de recorrência";
  const card4Value = isAllUpTo ? lifetime.repeatRate : metrics.recurrenceRate;
  const card4Segment: CustomerSegmentType = isAllUpTo ? "repeat" : "returning";

  const card4RateContext: RateContextData = isAllUpTo
    ? {
        rate: lifetime.repeatRate,
        numerator: lifetime.repeatCustomers,
        denominator: lifetime.customers,
        label: "Taxa de recompra",
      }
    : {
        rate: metrics.recurrenceRate,
        numerator: metrics.returningCustomers,
        denominator: metrics.buyingCustomers,
        label: "Taxa de recorrência",
      };

  const handleCardClick = (
    segment: CustomerSegmentType,
    rateContext?: RateContextData | null,
  ) => {
    if (onSelectSegment) {
      onSelectSegment(segment, rateContext);
    }
  };

  return (
    <section
      className="tp-customer-kpi-section"
      aria-label="Métricas da base de clientes"
    >
      <div className="tp-kpi-grid">
        <article
          className="tp-kpi-card tp-kpi-interactive"
          role="button"
          tabIndex={0}
          aria-label={`Ver lista de ${card1Label}: ${formatNumber(card1Value)}`}
          onClick={() => handleCardClick(card1Segment, null)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleCardClick(card1Segment, null);
            }
          }}
        >
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

        <article
          className="tp-kpi-card tp-kpi-interactive"
          role="button"
          tabIndex={0}
          aria-label={`Ver lista de ${card2Label}: ${formatNumber(card2Value)}`}
          onClick={() => handleCardClick(card2Segment, null)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleCardClick(card2Segment, null);
            }
          }}
        >
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

        <article
          className="tp-kpi-card tp-kpi-interactive"
          role="button"
          tabIndex={0}
          aria-label={`Ver lista de ${card3Label}: ${formatNumber(card3Value)}`}
          onClick={() => handleCardClick(card3Segment, null)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleCardClick(card3Segment, null);
            }
          }}
        >
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

        <article
          className="tp-kpi-card tp-kpi-highlight-subtle tp-kpi-interactive"
          role="button"
          tabIndex={0}
          aria-label={`Ver detalhes de ${card4Label}: ${formatPercent(card4Value)}`}
          onClick={() => handleCardClick(card4Segment, card4RateContext)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleCardClick(card4Segment, card4RateContext);
            }
          }}
        >
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
