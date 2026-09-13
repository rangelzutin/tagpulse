import { DollarSign, Package, Boxes, Users } from "lucide-react";
import type { ProductsOverviewSummary } from "../api/bi";
import { formatCurrency, formatNumber } from "../utils/formatters";

interface ProductKpiGridProps {
  summary: ProductsOverviewSummary;
}

export function ProductKpiGrid({ summary }: ProductKpiGridProps) {
  return (
    <section className="tp-kpi-section" aria-label="Indicadores de Produtos">
      <div className="tp-kpi-grid">
        {/* KPI 1 — Faturamento realizado */}
        <article className="tp-kpi-card tp-kpi-highlight">
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">Faturamento realizado</span>
            <span className="tp-kpi-icon-wrap tp-icon-cyan">
              <DollarSign size={16} />
            </span>
          </div>
          <div className="tp-kpi-value-wrap">
            <span className="tp-kpi-value">
              {formatCurrency(summary.realizedRevenue)}
            </span>
          </div>
          <div className="tp-product-kpi-subtext">
            Receita atribuída aos produtos
          </div>
        </article>

        {/* KPI 2 — Unidades vendidas */}
        <article className="tp-kpi-card">
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">Unidades vendidas</span>
            <span className="tp-kpi-icon-wrap tp-icon-blue">
              <Package size={16} />
            </span>
          </div>
          <div className="tp-kpi-value-wrap">
            <span className="tp-kpi-value">
              {formatNumber(summary.realizedQuantity)}
            </span>
          </div>
          <div className="tp-product-kpi-subtext">
            Volume realizado no período
          </div>
        </article>

        {/* KPI 3 — SKUs vendidos */}
        <article className="tp-kpi-card">
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">SKUs vendidos</span>
            <span className="tp-kpi-icon-wrap tp-icon-teal">
              <Boxes size={16} />
            </span>
          </div>
          <div className="tp-kpi-value-wrap">
            <span className="tp-kpi-value">
              {formatNumber(summary.distinctProductsSold)}
            </span>
          </div>
          <div className="tp-product-kpi-subtext">
            Produtos com saída física
          </div>
        </article>

        {/* KPI 4 — Clientes compradores */}
        <article className="tp-kpi-card">
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">Clientes compradores</span>
            <span className="tp-kpi-icon-wrap tp-icon-indigo">
              <Users size={16} />
            </span>
          </div>
          <div className="tp-kpi-value-wrap">
            <span className="tp-kpi-value">
              {formatNumber(summary.distinctCustomers)}
            </span>
          </div>
          <div className="tp-product-kpi-subtext">
            Clientes distintos no período
          </div>
        </article>
      </div>
    </section>
  );
}
