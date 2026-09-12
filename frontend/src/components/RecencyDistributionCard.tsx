import { Clock } from "lucide-react";
import type {
  CustomerRecencyBucket,
  CustomerRecencySegment,
  CustomerSegmentType,
} from "../api/bi";
import { formatNumber, formatPercent } from "../utils/formatters";

interface RecencyDistributionCardProps {
  recency: CustomerRecencySegment[];
  onSelectSegment?: (segment: CustomerSegmentType) => void;
  onSelectRecencyBucket?: (bucket: CustomerRecencyBucket) => void;
}

export function RecencyDistributionCard({
  recency,
  onSelectSegment,
  onSelectRecencyBucket,
}: RecencyDistributionCardProps) {
  if (!recency || recency.length === 0) {
    return (
      <section
        className="tp-card tp-recency-card"
        aria-label="Recência da Base"
      >
        <div className="tp-card-header">
          <div>
            <h3 className="tp-card-title">Recência da Base</h3>
            <p className="tp-card-subtitle">
              Tempo desde a última compra realizada até o final do período
              selecionado.
            </p>
          </div>
        </div>
        <div className="tp-empty-message">
          Sem dados de recência para o período.
        </div>
      </section>
    );
  }

  const totalRecencyCustomers = recency.reduce(
    (acc, seg) => acc + seg.customerCount,
    0,
  );

  // Clientes em risco: última compra entre 91 e 365 dias (3 a 12 meses)
  const riskCount = recency
    .filter((s) => s.key === "91-180" || s.key === "181-365")
    .reduce((acc, s) => acc + s.customerCount, 0);
  const riskPct =
    totalRecencyCustomers === 0
      ? 0
      : Number(((riskCount / totalRecencyCustomers) * 100).toFixed(1));

  // Clientes inativos: última compra há mais de 365 dias (> 1 ano)
  const inactiveCount = recency
    .filter(
      (s) =>
        s.key === "366-730" || s.key === "731-1095" || s.key === "1096+",
    )
    .reduce((acc, s) => acc + s.customerCount, 0);
  const inactivePct =
    totalRecencyCustomers === 0
      ? 0
      : Number(((inactiveCount / totalRecencyCustomers) * 100).toFixed(1));

  return (
    <section className="tp-card tp-recency-card" aria-label="Recência da Base">
      <div className="tp-card-header">
        <div>
          <div className="tp-title-with-badge">
            <h3 className="tp-card-title">Recência da Base</h3>
            <span className="tp-badge-count">
              {formatNumber(totalRecencyCustomers)} clientes
            </span>
          </div>
          <p className="tp-card-subtitle">
            Tempo desde a última compra realizada até o final do período
            selecionado.
          </p>
        </div>
      </div>

      <div className="tp-recency-list">
        {recency.map((segment) => {
          const barWidth = Math.min(100, Math.max(0, segment.percentage));

          return (
            <div
              key={segment.key}
              className="tp-recency-item tp-recency-item-interactive"
              role="button"
              tabIndex={0}
              aria-label={`Ver clientes da faixa ${segment.label}: ${formatNumber(segment.customerCount)} clientes (${formatPercent(segment.percentage)})`}
              onClick={() => onSelectRecencyBucket?.(segment.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectRecencyBucket?.(segment.key);
                }
              }}
            >
              <div className="tp-recency-meta">
                <div className="tp-recency-label-wrap">
                  <span className="tp-recency-bullet" />
                  <span className="tp-recency-label">{segment.label}</span>
                </div>
                <div className="tp-recency-numbers">
                  <span className="tp-recency-count">
                    {formatNumber(segment.customerCount)}
                  </span>
                  <span className="tp-recency-pct">
                    {formatPercent(segment.percentage)}
                  </span>
                </div>
              </div>

              <div className="tp-recency-track">
                <div
                  className="tp-recency-bar"
                  style={{
                    width: `${barWidth}%`,
                  }}
                  title={`${segment.label}: ${formatNumber(segment.customerCount)} clientes (${formatPercent(segment.percentage)})`}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="tp-recency-summary">
        <div
          className="tp-recency-kpi tp-kpi-risk tp-kpi-interactive"
          role="button"
          tabIndex={0}
          aria-label={`Ver lista de Clientes em Risco: ${formatNumber(riskCount)}`}
          onClick={() => onSelectSegment?.("risk")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelectSegment?.("risk");
            }
          }}
        >
          <div className="tp-recency-kpi-header">
            <span className="tp-recency-kpi-indicator tp-indicator-amber" />
            <span className="tp-recency-kpi-title">Clientes em Risco</span>
          </div>
          <div className="tp-recency-kpi-body">
            <span className="tp-recency-kpi-val">{formatNumber(riskCount)}</span>
            <span className="tp-recency-kpi-pct tp-pct-amber">
              {formatPercent(riskPct)}
            </span>
          </div>
          <span className="tp-recency-kpi-rule">Sem compras entre 3 e 12 meses</span>
        </div>

        <div
          className="tp-recency-kpi tp-kpi-inactive tp-kpi-interactive"
          role="button"
          tabIndex={0}
          aria-label={`Ver lista de Clientes Inativos: ${formatNumber(inactiveCount)}`}
          onClick={() => onSelectSegment?.("inactive")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelectSegment?.("inactive");
            }
          }}
        >
          <div className="tp-recency-kpi-header">
            <span className="tp-recency-kpi-indicator tp-indicator-rose" />
            <span className="tp-recency-kpi-title">Clientes Inativos</span>
          </div>
          <div className="tp-recency-kpi-body">
            <span className="tp-recency-kpi-val">
              {formatNumber(inactiveCount)}
            </span>
            <span className="tp-recency-kpi-pct tp-pct-rose">
              {formatPercent(inactivePct)}
            </span>
          </div>
          <span className="tp-recency-kpi-rule">Sem compras há mais de 1 ano</span>
        </div>
      </div>

      <div className="tp-card-footer">
        <span className="tp-footer-highlight-icon">
          <Clock size={13} />
        </span>
        <span className="tp-footer-text">
          Distribuição baseada no histórico acumulado até a data final
          selecionada
        </span>
      </div>
    </section>
  );
}
