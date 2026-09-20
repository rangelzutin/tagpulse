import {
  AlertCircle,
  AlertTriangle,
  Boxes,
  Clock,
  TrendingUp,
} from "lucide-react";
import type { DecisionsKpis, InventoryWindowDays } from "../api/bi";
import { formatCurrency, formatNumber } from "../utils/formatters";

interface DecisionsKpiGridProps {
  kpis: DecisionsKpis;
  windowDays: InventoryWindowDays;
}

export function DecisionsKpiGrid({ kpis, windowDays }: DecisionsKpiGridProps) {
  return (
    <section className="tp-kpi-section" aria-label="Indicadores da Central de Decisões">
      <div className="tp-kpi-grid">
        {/* KPI 1 — Capital em estoque */}
        <article className="tp-kpi-card tp-profit-kpi-card">
          <div className="tp-profit-kpi-header">
            <span className="tp-profit-kpi-label">Capital em estoque</span>
            <span className="tp-kpi-icon-wrap tp-icon-cyan">
              <Boxes size={16} />
            </span>
          </div>
          <div className="tp-profit-kpi-value-wrap">
            <span className="tp-kpi-value">
              {formatCurrency(kpis.currentInventoryCapital)}
            </span>
          </div>
          <div className="tp-profit-kpi-footer">
            <span className="tp-profit-kpi-subtext">
              Saldo positivo a custo atual conhecido
            </span>
          </div>
        </article>

        {/* KPI 2 — Capital sem saída — ativos */}
        <article className="tp-kpi-card tp-profit-kpi-card">
          <div className="tp-profit-kpi-header">
            <span className="tp-profit-kpi-label">Capital sem saída — ativos</span>
            <span className="tp-kpi-icon-wrap tp-icon-amber">
              <AlertTriangle size={16} />
            </span>
          </div>
          <div className="tp-profit-kpi-value-wrap">
            <span className="tp-kpi-value">
              {formatCurrency(kpis.capitalWithoutSalesActive)}
            </span>
          </div>
          <div className="tp-profit-kpi-footer">
            <span className="tp-profit-kpi-subtext">
              Ativos com estoque e sem vendas em {windowDays}d
            </span>
          </div>
        </article>

        {/* KPI 3 — Demanda sem estoque */}
        <article className="tp-kpi-card tp-profit-kpi-card">
          <div className="tp-profit-kpi-header">
            <span className="tp-profit-kpi-label">Demanda sem estoque</span>
            <span className="tp-kpi-icon-wrap tp-icon-rose">
              <AlertCircle size={16} />
            </span>
          </div>
          <div className="tp-profit-kpi-value-wrap">
            <span className="tp-kpi-value">
              {formatNumber(kpis.demandWithoutStockCount)}
              <span className="tp-kpi-unit"> SKUs</span>
            </span>
          </div>
          <div className="tp-profit-kpi-footer">
            <span className="tp-profit-kpi-subtext">
              Ativos com saída recente e estoque zerado
            </span>
          </div>
        </article>

        {/* KPI 4 — Baixa cobertura < 30 dias */}
        <article className="tp-kpi-card tp-profit-kpi-card">
          <div className="tp-profit-kpi-header">
            <span className="tp-profit-kpi-label">Baixa cobertura &lt; 30 dias</span>
            <span className="tp-kpi-icon-wrap tp-icon-orange">
              <Clock size={16} />
            </span>
          </div>
          <div className="tp-profit-kpi-value-wrap">
            <span className="tp-kpi-value">
              {formatNumber(kpis.lowCoverageCount)}
              <span className="tp-kpi-unit"> SKUs</span>
            </span>
          </div>
          <div className="tp-profit-kpi-footer">
            <span className="tp-profit-kpi-subtext">
              {kpis.criticalCoverageCount} críticos (&lt;15d) e {kpis.alertCoverageCount} em alerta (15–30d)
            </span>
          </div>
        </article>

        {/* KPI 5 — Lucro bruto estimado ao custo atual */}
        <article className="tp-kpi-card tp-profit-kpi-card tp-kpi-highlight">
          <div className="tp-profit-kpi-header">
            <span className="tp-profit-kpi-label">Lucro bruto estimado ao custo atual</span>
            <span className="tp-kpi-icon-wrap tp-icon-teal">
              <TrendingUp size={16} />
            </span>
          </div>
          <div className="tp-profit-kpi-value-wrap">
            <span className="tp-kpi-value">
              {formatCurrency(kpis.estimatedGrossProfitInWindow)}
            </span>
          </div>
          <div className="tp-profit-kpi-footer">
            <span className="tp-profit-kpi-subtext">
              Margem média estimada na janela de {windowDays}d
            </span>
          </div>
        </article>
      </div>
    </section>
  );
}
