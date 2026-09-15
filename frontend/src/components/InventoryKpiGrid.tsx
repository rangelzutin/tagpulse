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
}

export function InventoryKpiGrid({
  summary,
  dataQuality,
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

      {/* Faixa de Contexto / Qualidade de Dados compacta */}
      <div
        className="tp-inventory-context-strip"
        aria-label="Contexto Operacional e Qualidade dos Dados"
      >
        <div className="tp-inventory-context-item">
          <span className="tp-inventory-context-dot tp-dot-rose" />
          <span className="tp-inventory-context-label">Estoque negativo:</span>
          <strong className="tp-inventory-context-val">
            {formatNumber(dataQuality.negativeStockCount)}
          </strong>
        </div>

        <div className="tp-inventory-context-separator" aria-hidden="true">
          •
        </div>

        <div className="tp-inventory-context-item">
          <span className="tp-inventory-context-dot tp-dot-amber" />
          <span className="tp-inventory-context-label">Ativos sem estoque:</span>
          <strong className="tp-inventory-context-val">
            {formatNumber(dataQuality.activeWithoutStockCount)}
          </strong>
        </div>

        <div className="tp-inventory-context-separator" aria-hidden="true">
          •
        </div>

        <div className="tp-inventory-context-item">
          <span className="tp-inventory-context-dot tp-dot-muted" />
          <span className="tp-inventory-context-label">Inativos com estoque:</span>
          <strong className="tp-inventory-context-val">
            {formatNumber(dataQuality.inactiveWithStockCount)}
          </strong>
        </div>

        <div className="tp-inventory-context-separator" aria-hidden="true">
          •
        </div>

        <div className="tp-inventory-context-item">
          <span className="tp-inventory-context-dot tp-dot-cyan" />
          <span className="tp-inventory-context-label">Produtos vendidos na janela:</span>
          <strong className="tp-inventory-context-val">
            {formatNumber(summary.productsSoldInWindow)}
          </strong>
        </div>
      </div>
    </section>
  );
}
