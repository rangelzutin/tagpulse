import { DollarSign, Package, TrendingUp, PieChart, Layers, Warehouse, CheckCircle2, AlertCircle } from "lucide-react";
import type { ProductsOverviewSummary } from "../api/bi";
import { formatCurrency, formatNumber, formatPercent } from "../utils/formatters";

interface ProductKpiGridProps {
  summary: ProductsOverviewSummary;
}

export function ProductKpiGrid({ summary }: ProductKpiGridProps) {
  const hasIncompleteCost =
    summary.costCoverage && summary.costCoverage.productsWithoutCost > 0;

  const costCoveragePercent = summary.costCoverage?.revenueCoveragePercent;

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
            <span>{formatNumber(summary.distinctProductsSold)} SKUs vendidos</span>
            <span className="tp-bullet">•</span>
            <span>{formatNumber(summary.distinctCustomers)} clientes compradores</span>
          </div>
        </article>

        {/* KPI 3 — Lucro bruto estimado ao custo atual */}
        <article className={`tp-kpi-card ${hasIncompleteCost ? "tp-kpi-warning-card" : ""}`}>
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">Lucro bruto estimado ao custo atual</span>
            <span className="tp-kpi-icon-wrap tp-icon-teal">
              <TrendingUp size={16} />
            </span>
          </div>
          <div className="tp-kpi-value-wrap">
            <span className="tp-kpi-value">
              {summary.grossProfitEstimatedCurrentCost !== null
                ? formatCurrency(summary.grossProfitEstimatedCurrentCost)
                : "—"}
            </span>
          </div>
          <div className="tp-product-kpi-subtext">
            <span>
              Margem bruta estimada:{" "}
              {summary.grossMarginEstimatedCurrentCost !== null
                ? formatPercent(summary.grossMarginEstimatedCurrentCost)
                : "—"}
            </span>
            <span className="tp-bullet">•</span>
            <span>
              CMV estimado:{" "}
              {summary.cmvEstimatedCurrentCost !== null
                ? formatCurrency(summary.cmvEstimatedCurrentCost)
                : "—"}
            </span>
          </div>

          {/* Cobertura de custo atual */}
          {summary.costCoverage && (
            <div className={`tp-cost-coverage-indicator ${hasIncompleteCost ? "is-partial" : "is-complete"}`}>
              {hasIncompleteCost ? (
                <>
                  <AlertCircle size={11} className="tp-cost-cov-icon" />
                  <span>
                    Cobertura de custo atual:{" "}
                    {costCoveragePercent !== null && costCoveragePercent !== undefined
                      ? formatPercent(costCoveragePercent)
                      : "—"}
                    {" "}
                    ({summary.costCoverage.productsWithoutCost} SKUs sem custo • {formatCurrency(summary.costCoverage.realizedRevenueWithoutCost)} sem cobertura)
                  </span>
                </>
              ) : (
                <span>Cobertura de custo atual: 100%</span>
              )}
            </div>
          )}
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
