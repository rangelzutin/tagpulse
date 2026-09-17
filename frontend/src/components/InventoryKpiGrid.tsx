import {
  DollarSign,
  Tag,
  AlertTriangle,
  Clock,
  AlertOctagon,
  PackageMinus,
  TrendingUp,
} from "lucide-react";
import type {
  InventoryDataQuality,
  InventoryOverviewSummary,
} from "../api/bi";
import {
  formatCurrency,
  formatNumber,
} from "../utils/formatters";

interface InventoryKpiGridProps {
  summary: InventoryOverviewSummary;
  dataQuality: InventoryDataQuality;
  activeFilter?: string;
  onSelectContextFilter?: (filter: "NEGATIVE_STOCK" | "ACTIVE_WITHOUT_STOCK" | "INACTIVE_WITH_STOCK" | "SOLD_IN_WINDOW") => void;
}

export function InventoryKpiGrid({
  summary,
  dataQuality,
  activeFilter,
  onSelectContextFilter,
}: InventoryKpiGridProps) {
  return (
    <section className="tp-kpi-section tp-inventory-kpi-section" aria-label="Indicadores de Estoque e Giro">
      {/* LINHA 1 — 4 KPIs Principais */}
      <div className="tp-kpi-grid">
        {/* KPI 1 — Capital atual em estoque */}
        <article className="tp-kpi-card tp-kpi-highlight">
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">Capital atual em estoque</span>
            <span className="tp-kpi-icon-wrap tp-icon-cyan">
              <DollarSign size={16} />
            </span>
          </div>
          <div className="tp-kpi-value-wrap">
            <span className="tp-kpi-value">
              {formatCurrency(summary.inventoryCostValue)}
            </span>
          </div>
          <div className="tp-product-kpi-subtext">
            {`${formatNumber(summary.productsWithPositiveStock)} SKUs com estoque`}
          </div>
        </article>

        {/* KPI 2 — Valor de tabela */}
        <article className="tp-kpi-card">
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">Valor de tabela</span>
            <span className="tp-kpi-icon-wrap tp-icon-blue">
              <Tag size={16} />
            </span>
          </div>
          <div className="tp-kpi-value-wrap">
            <span className="tp-kpi-value">
              {formatCurrency(summary.inventoryListValue)}
            </span>
          </div>
          <div className="tp-product-kpi-subtext">
            Estoque atual a preço cadastrado
          </div>
        </article>

        {/* KPI 3 — Demanda sem estoque (subconjunto ativo) */}
        <article className="tp-kpi-card">
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">Demanda sem estoque</span>
            <span className="tp-kpi-icon-wrap tp-icon-amber">
              <AlertTriangle size={16} />
            </span>
          </div>
          <div className="tp-kpi-value-wrap">
            <span className="tp-kpi-value">
              {`${formatNumber(summary.activeDemandWithoutStockCount)} `}
              <span className="tp-kpi-unit">SKUs</span>
            </span>
          </div>
          <div className="tp-product-kpi-subtext">
            SKUs ativos com saída na janela
          </div>
        </article>

        {/* KPI 4 — Capital sem saída */}
        <article className="tp-kpi-card">
          <div className="tp-kpi-header">
            <span className="tp-kpi-label">Capital sem saída</span>
            <span className="tp-kpi-icon-wrap tp-icon-rose">
              <Clock size={16} />
            </span>
          </div>
          <div className="tp-kpi-value-wrap">
            <span className="tp-kpi-value">
              {formatCurrency(summary.capitalWithoutSales)}
            </span>
          </div>
          <div className="tp-product-kpi-subtext">
            {`${summary.capitalWithoutSalesShare.toLocaleString("pt-BR", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            })}% do capital em estoque`}
          </div>
        </article>
      </div>

      {/* LINHA 2 — 4 Cards Independentes: Situação do Estoque */}
      <div
        className="tp-situation-cards-grid"
        aria-label="Situação do estoque"
      >
        {/* Mini-card 1: Estoque negativo */}
        <button
          type="button"
          className={`tp-situation-mini-card ${activeFilter === "NEGATIVE_STOCK" ? "is-active" : ""}`}
          onClick={() => onSelectContextFilter?.("NEGATIVE_STOCK")}
          title="Filtrar estoque negativo na tabela"
        >
          <div className="tp-situation-mini-header">
            <span className="tp-situation-mini-label">Estoque negativo</span>
            <span className="tp-situation-mini-icon tp-icon-rose">
              <AlertOctagon size={14} />
            </span>
          </div>
          <div className="tp-situation-mini-value-wrap">
            <strong className="tp-situation-mini-value tp-val-rose">
              {formatNumber(dataQuality.negativeStockCount)}
            </strong>
          </div>
          <span className="tp-situation-mini-subtext">
            SKUs com saldo negativo
          </span>
        </button>

        {/* Mini-card 2: Ativos sem estoque */}
        <button
          type="button"
          className={`tp-situation-mini-card ${activeFilter === "ACTIVE_WITHOUT_STOCK" ? "is-active" : ""}`}
          onClick={() => onSelectContextFilter?.("ACTIVE_WITHOUT_STOCK")}
          title="Filtrar ativos sem estoque na tabela"
        >
          <div className="tp-situation-mini-header">
            <span className="tp-situation-mini-label">Ativos sem estoque</span>
            <span className="tp-situation-mini-icon tp-icon-amber">
              <AlertTriangle size={14} />
            </span>
          </div>
          <div className="tp-situation-mini-value-wrap">
            <strong className="tp-situation-mini-value tp-val-amber">
              {formatNumber(dataQuality.activeWithoutStockCount)}
            </strong>
          </div>
          <span className="tp-situation-mini-subtext">
            Ativos com saldo zerado
          </span>
        </button>

        {/* Mini-card 3: Inativos com estoque */}
        <button
          type="button"
          className={`tp-situation-mini-card ${activeFilter === "INACTIVE_WITH_STOCK" ? "is-active" : ""}`}
          onClick={() => onSelectContextFilter?.("INACTIVE_WITH_STOCK")}
          title="Filtrar inativos com estoque na tabela"
        >
          <div className="tp-situation-mini-header">
            <span className="tp-situation-mini-label">Inativos com estoque</span>
            <span className="tp-situation-mini-icon tp-icon-muted">
              <PackageMinus size={14} />
            </span>
          </div>
          <div className="tp-situation-mini-value-wrap">
            <strong className="tp-situation-mini-value tp-val-muted">
              {formatNumber(dataQuality.inactiveWithStockCount)}
            </strong>
          </div>
          <span className="tp-situation-mini-subtext">
            Inativos com capital parado
          </span>
        </button>

        {/* Mini-card 4: Vendidos na janela */}
        <button
          type="button"
          className={`tp-situation-mini-card ${activeFilter === "SOLD_IN_WINDOW" ? "is-active" : ""}`}
          onClick={() => onSelectContextFilter?.("SOLD_IN_WINDOW")}
          title="Filtrar produtos vendidos na janela na tabela"
        >
          <div className="tp-situation-mini-header">
            <span className="tp-situation-mini-label">Vendidos na janela</span>
            <span className="tp-situation-mini-icon tp-icon-cyan">
              <TrendingUp size={14} />
            </span>
          </div>
          <div className="tp-situation-mini-value-wrap">
            <strong className="tp-situation-mini-value tp-val-cyan">
              {formatNumber(summary.productsSoldInWindow)}
            </strong>
          </div>
          <span className="tp-situation-mini-subtext">
            Com saída física recente
          </span>
        </button>
      </div>
    </section>
  );
}
