import { useState } from "react";
import { AlertTriangle, PackageX, ChevronDown, ChevronUp } from "lucide-react";
import type { ProductStockOpportunities, ProductStockOpportunityItem } from "../api/bi";
import { formatCurrency, formatNumber } from "../utils/formatters";

interface ProductStockOpportunitiesCardProps {
  opportunities?: ProductStockOpportunities;
}

const DEFAULT_VISIBLE_ITEMS = 8;

export function ProductStockOpportunitiesCard({
  opportunities,
}: ProductStockOpportunitiesCardProps) {
  const [expandZeroStock, setExpandZeroStock] = useState(false);
  const [expandStockNoSales, setExpandStockNoSales] = useState(false);

  const rawZeroStock = opportunities?.zeroStockWithSales ?? [];
  const rawStockNoSales = opportunities?.stockWithoutSales ?? [];

  // Card A: Vendidos no período e sem estoque hoje
  // Ordenação: 1. active === true primeiro; 2. realizedRevenue desc
  const sortedZeroStock = [...rawZeroStock].sort((a, b) => {
    if (a.active !== b.active) {
      return a.active ? -1 : 1;
    }
    return b.realizedRevenue - a.realizedRevenue;
  });

  const visibleZeroStock = expandZeroStock
    ? sortedZeroStock
    : sortedZeroStock.slice(0, DEFAULT_VISIBLE_ITEMS);
  const hasMoreZeroStock = sortedZeroStock.length > DEFAULT_VISIBLE_ITEMS;

  // Card B: Estoque atual sem venda no período
  // Ordenação: stockQuantity desc
  const sortedStockNoSales = [...rawStockNoSales].sort(
    (a, b) => b.stockQuantity - a.stockQuantity,
  );

  const visibleStockNoSales = expandStockNoSales
    ? sortedStockNoSales
    : sortedStockNoSales.slice(0, DEFAULT_VISIBLE_ITEMS);
  const hasMoreStockNoSales = sortedStockNoSales.length > DEFAULT_VISIBLE_ITEMS;

  return (
    <section
      className="tp-stock-opportunities-grid"
      aria-label="Diagnóstico de Oportunidades de Estoque"
    >
      {/* CARD A — Vendidos no período e sem estoque hoje */}
      <article className="tp-card tp-opportunity-card" aria-label="Vendidos no período e sem estoque hoje">
        <div className="tp-card-header">
          <div>
            <div className="tp-title-with-badge">
              <h3 className="tp-card-title">Vendidos no período e sem estoque hoje</h3>
              <span className="tp-badge-count tp-badge-warning">
                {`${sortedZeroStock.length} ${sortedZeroStock.length === 1 ? "produto" : "produtos"}`}
              </span>
            </div>
            <p className="tp-card-subtitle">
              Produtos com venda realizada no período selecionado e saldo atual zerado ou negativo
            </p>
          </div>
        </div>

        {sortedZeroStock.length === 0 ? (
          <div className="tp-empty-message">
            Nenhum produto vendido com estoque zerado no período selecionado.
          </div>
        ) : (
          <>
            <div className={`tp-opportunity-list ${expandZeroStock ? "is-expanded" : ""}`}>
              {visibleZeroStock.map((item: ProductStockOpportunityItem) => (
                <div
                  key={item.productId || item.sourceProductId}
                  className="tp-opportunity-item-row"
                >
                  <div className="tp-opportunity-item-main">
                    <div className="tp-opportunity-item-title-row">
                      <span className="tp-opportunity-item-name" title={item.description ?? "Sem descrição"}>
                        {item.description ?? "Item sem descrição"}
                      </span>
                      {!item.active && (
                        <span className="tp-status-pill tp-status-inactive" title="Produto inativo no catálogo">
                          Inativo
                        </span>
                      )}
                    </div>
                    <div className="tp-opportunity-item-sub">
                      {item.code && <span className="tp-sku-text">SKU: {item.code}</span>}
                      {item.commercialLine && (
                        <>
                          <span className="tp-bullet">•</span>
                          <span>{item.commercialLine}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="tp-opportunity-item-figures">
                    <div className="tp-opportunity-item-val-primary">
                      {formatCurrency(item.realizedRevenue)}
                    </div>
                    <div className="tp-opportunity-item-val-secondary">
                      <AlertTriangle size={11} className="tp-warning-icon" />
                      <span>{formatNumber(item.realizedQuantity)} un vendidas · Saldo: {formatNumber(item.stockQuantity)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {hasMoreZeroStock && (
              <button
                type="button"
                className="tp-category-expand-btn"
                onClick={() => setExpandZeroStock((prev) => !prev)}
              >
                {expandZeroStock ? (
                  <>
                    <ChevronUp size={13} />
                    <span>Recolher para Top {DEFAULT_VISIBLE_ITEMS}</span>
                  </>
                ) : (
                  <>
                    <ChevronDown size={13} />
                    <span>Ver todos os {sortedZeroStock.length} produtos</span>
                  </>
                )}
              </button>
            )}
          </>
        )}
      </article>

      {/* CARD B — Estoque atual sem venda no período */}
      <article className="tp-card tp-opportunity-card" aria-label="Estoque atual sem venda no período">
        <div className="tp-card-header">
          <div>
            <div className="tp-title-with-badge">
              <h3 className="tp-card-title">Estoque atual sem venda no período</h3>
              <span className="tp-badge-count">
                {`${sortedStockNoSales.length} ${sortedStockNoSales.length === 1 ? "produto" : "produtos"}`}
              </span>
            </div>
            <p className="tp-card-subtitle">
              Produtos ativos com saldo positivo e nenhuma venda realizada no período selecionado
            </p>
          </div>
        </div>

        {sortedStockNoSales.length === 0 ? (
          <div className="tp-empty-message">
            Nenhum produto ativo em estoque sem venda no período selecionado.
          </div>
        ) : (
          <>
            <div className={`tp-opportunity-list ${expandStockNoSales ? "is-expanded" : ""}`}>
              {visibleStockNoSales.map((item: ProductStockOpportunityItem) => (
                <div
                  key={item.productId || item.sourceProductId}
                  className="tp-opportunity-item-row"
                >
                  <div className="tp-opportunity-item-main">
                    <div className="tp-opportunity-item-title-row">
                      <span className="tp-opportunity-item-name" title={item.description ?? "Sem descrição"}>
                        {item.description ?? "Item sem descrição"}
                      </span>
                    </div>
                    <div className="tp-opportunity-item-sub">
                      {item.code && <span className="tp-sku-text">SKU: {item.code}</span>}
                      {item.commercialLine && (
                        <>
                          <span className="tp-bullet">•</span>
                          <span>{item.commercialLine}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="tp-opportunity-item-figures">
                    <div className="tp-opportunity-item-val-stock">
                      {formatNumber(item.stockQuantity)} un em estoque
                    </div>
                    <div className="tp-opportunity-item-val-secondary">
                      <PackageX size={11} className="tp-text-muted" />
                      <span>Zero saída no período</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {hasMoreStockNoSales && (
              <button
                type="button"
                className="tp-category-expand-btn"
                onClick={() => setExpandStockNoSales((prev) => !prev)}
              >
                {expandStockNoSales ? (
                  <>
                    <ChevronUp size={13} />
                    <span>Recolher para Top {DEFAULT_VISIBLE_ITEMS}</span>
                  </>
                ) : (
                  <>
                    <ChevronDown size={13} />
                    <span>Ver todos os {sortedStockNoSales.length} produtos</span>
                  </>
                )}
              </button>
            )}
          </>
        )}
      </article>
    </section>
  );
}
