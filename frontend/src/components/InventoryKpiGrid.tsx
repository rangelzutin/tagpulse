import { DollarSign, Tag, AlertTriangle, Clock } from "lucide-react";
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

      {/* Seção Executiva: SITUAÇÃO DO ESTOQUE com indicadores acionáveis */}
      <div
        className="tp-situation-card"
        aria-label="Situação do estoque"
      >
        <div className="tp-situation-header">
          <span className="tp-situation-title">SITUAÇÃO DO ESTOQUE</span>
        </div>

        <div className="tp-situation-grid">
          <button
            type="button"
            className={`tp-situation-item ${activeFilter === "NEGATIVE_STOCK" ? "is-active" : ""}`}
            onClick={() => onSelectContextFilter?.("NEGATIVE_STOCK")}
            title="Filtrar estoque negativo na tabela"
          >
            <strong className="tp-situation-val tp-val-rose">
              {formatNumber(dataQuality.negativeStockCount)}
            </strong>
            <span className="tp-situation-label">Estoque negativo</span>
          </button>

          <div className="tp-situation-divider" aria-hidden="true" />

          <button
            type="button"
            className={`tp-situation-item ${activeFilter === "ACTIVE_WITHOUT_STOCK" ? "is-active" : ""}`}
            onClick={() => onSelectContextFilter?.("ACTIVE_WITHOUT_STOCK")}
            title="Filtrar ativos sem estoque na tabela"
          >
            <strong className="tp-situation-val tp-val-amber">
              {formatNumber(dataQuality.activeWithoutStockCount)}
            </strong>
            <span className="tp-situation-label">Ativos sem estoque</span>
          </button>

          <div className="tp-situation-divider" aria-hidden="true" />

          <button
            type="button"
            className={`tp-situation-item ${activeFilter === "INACTIVE_WITH_STOCK" ? "is-active" : ""}`}
            onClick={() => onSelectContextFilter?.("INACTIVE_WITH_STOCK")}
            title="Filtrar inativos com estoque na tabela"
          >
            <strong className="tp-situation-val tp-val-muted">
              {formatNumber(dataQuality.inactiveWithStockCount)}
            </strong>
            <span className="tp-situation-label">Inativos com estoque</span>
          </button>

          <div className="tp-situation-divider" aria-hidden="true" />

          <button
            type="button"
            className={`tp-situation-item ${activeFilter === "SOLD_IN_WINDOW" ? "is-active" : ""}`}
            onClick={() => onSelectContextFilter?.("SOLD_IN_WINDOW")}
            title="Filtrar produtos vendidos na janela na tabela"
          >
            <strong className="tp-situation-val tp-val-cyan">
              {formatNumber(summary.productsSoldInWindow)}
            </strong>
            <span className="tp-situation-label">Vendidos na janela</span>
          </button>
        </div>
      </div>
    </section>
  );
}
