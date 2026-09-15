import { ArrowDownRight, Clock, ArrowRight } from "lucide-react";
import type { InventoryProductItem } from "../api/bi";
import {
  formatCurrency,
  formatDateBr,
  formatNumber,
} from "../utils/formatters";

interface InventoryProblemCardsProps {
  products: InventoryProductItem[];
  onViewAll: (filter: "demand_without_stock" | "no_sales") => void;
}

export function InventoryProblemCards({
  products,
  onViewAll,
}: InventoryProblemCardsProps) {
  // 1. Demanda sem estoque: ativos, saldo <= 0, com saída na janela
  const demandWithoutStockItems = products
    .filter(
      (p) =>
        p.active === true &&
        p.operationalFlags.includes("DEMAND_WITHOUT_STOCK"),
    )
    .sort((a, b) => b.quantityInWindow - a.quantityInWindow)
    .slice(0, 7);

  // 2. Capital sem saída: saldo > 0, zero saída na janela
  const capitalWithoutSalesItems = products
    .filter(
      (p) =>
        p.currentStock > 0 &&
        p.operationalFlags.includes("NO_SALES_IN_WINDOW"),
    )
    .sort((a, b) => b.stockCostValue - a.stockCostValue)
    .slice(0, 7);

  return (
    <div className="tp-inventory-problems-grid">
      {/* CARD A — Demanda sem estoque */}
      <section
        className="tp-card tp-inventory-problem-card"
        aria-label="Demanda sem estoque"
      >
        <div className="tp-card-header tp-inventory-card-header">
          <div>
            <div className="tp-title-with-badge">
              <span className="tp-section-icon-badge tp-badge-amber">
                <ArrowDownRight size={14} />
              </span>
              <h3 className="tp-card-title">Demanda sem estoque</h3>
            </div>
            <p className="tp-card-subtitle">
              Produtos ativos com saída na janela e saldo atual ≤ 0
            </p>
          </div>
          <button
            type="button"
            className="tp-btn-link"
            onClick={() => onViewAll("demand_without_stock")}
          >
            <span>Ver todos</span>
            <ArrowRight size={13} />
          </button>
        </div>

        {demandWithoutStockItems.length === 0 ? (
          <div className="tp-empty-message">
            Nenhum produto ativo com demanda e estoque zerado nesta janela.
          </div>
        ) : (
          <div className="tp-inventory-items-list">
            {demandWithoutStockItems.map((item) => {
              const isNegative = item.currentStock < 0;
              return (
                <div
                  key={item.productId ?? item.sourceProductId}
                  className="tp-inventory-mini-item"
                >
                  <div className="tp-inventory-item-main">
                    <div className="tp-inventory-item-title-row">
                      <span className="tp-inventory-item-desc" title={item.description}>
                        {item.description}
                      </span>
                      {isNegative && (
                        <span className="tp-badge-status is-negative">
                          {`Estoque negativo (${item.currentStock})`}
                        </span>
                      )}
                    </div>
                    <div className="tp-inventory-item-meta">
                      <span className="tp-inventory-item-code">{item.code}</span>
                      <span className="tp-inventory-item-bullet">•</span>
                      <span className="tp-inventory-item-cat">{item.category}</span>
                      {item.lastPhysicalSaleDate && (
                        <>
                          <span className="tp-inventory-item-bullet">•</span>
                          <span className="tp-inventory-item-date">
                            {`Última saída: ${formatDateBr(item.lastPhysicalSaleDate)}`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="tp-inventory-item-numbers">
                    <div className="tp-inventory-item-metric">
                      <span className="tp-inventory-metric-label">Vendido na janela</span>
                      <strong className="tp-inventory-metric-val">
                        {`${formatNumber(item.quantityInWindow)} un`}
                      </strong>
                    </div>
                    <div className="tp-inventory-item-metric">
                      <span className="tp-inventory-metric-label">Receita janela</span>
                      <span className="tp-inventory-metric-sub">
                        {formatCurrency(item.realizedRevenueInWindow)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* CARD B — Capital sem saída */}
      <section
        className="tp-card tp-inventory-problem-card"
        aria-label="Capital sem saída"
      >
        <div className="tp-card-header tp-inventory-card-header">
          <div>
            <div className="tp-title-with-badge">
              <span className="tp-section-icon-badge tp-badge-rose">
                <Clock size={14} />
              </span>
              <h3 className="tp-card-title">Capital sem saída</h3>
            </div>
            <p className="tp-card-subtitle">
              Estoque atual sem saída física na janela
            </p>
          </div>
          <button
            type="button"
            className="tp-btn-link"
            onClick={() => onViewAll("no_sales")}
          >
            <span>Ver todos</span>
            <ArrowRight size={13} />
          </button>
        </div>

        {capitalWithoutSalesItems.length === 0 ? (
          <div className="tp-empty-message">
            Nenhum produto com estoque ficou sem saída nesta janela.
          </div>
        ) : (
          <div className="tp-inventory-items-list">
            {capitalWithoutSalesItems.map((item) => {
              const isInactive = !item.active;
              return (
                <div
                  key={item.productId ?? item.sourceProductId}
                  className="tp-inventory-mini-item"
                >
                  <div className="tp-inventory-item-main">
                    <div className="tp-inventory-item-title-row">
                      <span className="tp-inventory-item-desc" title={item.description}>
                        {item.description}
                      </span>
                      {isInactive && (
                        <span className="tp-badge-status is-inactive">
                          Inativo com estoque
                        </span>
                      )}
                    </div>
                    <div className="tp-inventory-item-meta">
                      <span className="tp-inventory-item-code">{item.code}</span>
                      <span className="tp-inventory-item-bullet">•</span>
                      <span className="tp-inventory-item-cat">{item.category}</span>
                      <span className="tp-inventory-item-bullet">•</span>
                      <span className="tp-inventory-item-stock">
                        Estoque: <strong>{formatNumber(item.currentStock)}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="tp-inventory-item-numbers">
                    <div className="tp-inventory-item-metric">
                      <span className="tp-inventory-metric-label">Capital a custo</span>
                      <strong className="tp-inventory-metric-val tp-val-rose">
                        {formatCurrency(item.stockCostValue)}
                      </strong>
                    </div>
                    <div className="tp-inventory-item-metric">
                      <span className="tp-inventory-metric-label">Última saída</span>
                      <span className="tp-inventory-metric-sub">
                        {item.lastPhysicalSaleDate
                          ? `${formatDateBr(item.lastPhysicalSaleDate)}${
                              item.daysSinceLastPhysicalSale !== null
                                ? ` (${item.daysSinceLastPhysicalSale}d)`
                                : ""
                            }`
                          : "Sem saída registrada"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
