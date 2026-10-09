import { DollarSign, Package, PieChart, Layers, Warehouse, CheckCircle2 } from "lucide-react";
import type { ProductsOverviewSummary } from "../api/bi";
import { formatCurrency, formatNumber, formatPercent } from "../utils/formatters";

interface ProductKpiGridProps {
  summary: ProductsOverviewSummary;
}

export function ProductKpiGrid({ summary }: ProductKpiGridProps) {
  return (
    <section className="tp-kpi-section tp-products-kpi-section" aria-label="Indicadores Executivos de Produtos">
      <div className="tp-kpi-grid">
        {/* KPI 1 — Receita realizada */}
        <article className="tp-kpi-card tp-kpi-highlight">
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">Receita realizada</span>
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
            Faturamento líquido atribuído aos produtos
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
            <span>{formatNumber(summary.distinctCustomers)} clientes compradores</span>
          </div>
        </article>

        {/* KPI 3 — SKUs vendidos */}
        <article className="tp-kpi-card">
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">SKUs vendidos</span>
            <span className="tp-kpi-icon-wrap tp-icon-teal">
              <Layers size={16} />
            </span>
          </div>
          <div className="tp-kpi-value-wrap">
            <span className="tp-kpi-value">
              {formatNumber(summary.distinctProductsSold)}
            </span>
          </div>
          <div className="tp-product-kpi-subtext">
            <span>De {formatNumber(summary.activeCatalogProducts)} ativos no catálogo</span>
          </div>
        </article>

        {/* KPI 4 — Concentração Top 10 */}
        <article className="tp-kpi-card">
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">Concentração Top 10</span>
            <span className="tp-kpi-icon-wrap tp-icon-indigo">
              <PieChart size={16} />
            </span>
          </div>
          <div className="tp-kpi-value-wrap">
            <span className="tp-kpi-value">
              {formatPercent(summary.top10RevenueShare ?? 0)}
            </span>
          </div>
          <div className="tp-product-kpi-subtext">
            Participação dos 10 maiores SKUs no faturamento
          </div>
        </article>
      </div>

      {/* Faixa compacta integrada de Contexto do Catálogo & Estoque */}
      <div className="tp-catalog-strip" aria-label="Contexto do Catálogo e Estoque">
        <div className="tp-catalog-strip-item">
          <span className="tp-catalog-strip-icon tp-icon-cyan">
            <Layers size={13} />
          </span>
          <span className="tp-catalog-strip-label">Catálogo ativo:</span>
          <span className="tp-catalog-strip-value">{formatNumber(summary.activeCatalogProducts)}</span>
        </div>
        <div className="tp-catalog-strip-divider" />
        <div className="tp-catalog-strip-item">
          <span className="tp-catalog-strip-icon tp-icon-teal">
            <Warehouse size={13} />
          </span>
          <span className="tp-catalog-strip-label">Com estoque atualmente:</span>
          <span className="tp-catalog-strip-value">{formatNumber(summary.productsWithStock)}</span>
        </div>
        <div className="tp-catalog-strip-divider" />
        <div className="tp-catalog-strip-item">
          <span className="tp-catalog-strip-icon tp-icon-indigo">
            <CheckCircle2 size={13} />
          </span>
          <span className="tp-catalog-strip-label">Vendidos no período:</span>
          <span className="tp-catalog-strip-value">{formatNumber(summary.distinctProductsSold)}</span>
        </div>
      </div>
    </section>
  );
}
