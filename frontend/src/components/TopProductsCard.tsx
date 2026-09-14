import { useState, useMemo } from "react";
import { DollarSign, Package, AlertTriangle, Info, ChevronLeft, ChevronRight } from "lucide-react";
import type { TopProductItem } from "../api/bi";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
} from "../utils/formatters";

interface TopProductsCardProps {
  products: TopProductItem[];
  totalRevenue: number;
  totalQuantity: number;
}

type RankingSortMode = "revenue" | "volume";

const PAGE_SIZE = 15;

export function TopProductsCard({
  products,
  totalRevenue,
  totalQuantity,
}: TopProductsCardProps) {
  const [sortMode, setSortMode] = useState<RankingSortMode>("revenue");
  const [currentPage, setCurrentPage] = useState(1);

  // Filtro e Ordenação
  const processedList = useMemo(() => {
    if (sortMode === "revenue") {
      // Todos os produtos ordenados por receita líquida realizada
      return [...products].sort((a, b) => b.realizedRevenue - a.realizedRevenue);
    } else {
      // Volume: exclui produtos com quantity === 0 no período
      return products
        .filter((p) => p.quantity > 0)
        .sort((a, b) => b.quantity - a.quantity);
    }
  }, [products, sortMode]);

  const totalPages = Math.max(1, Math.ceil(processedList.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const paginatedItems = processedList.slice(startIndex, startIndex + PAGE_SIZE);

  const handleModeChange = (newMode: RankingSortMode) => {
    if (newMode !== sortMode) {
      setSortMode(newMode);
      setCurrentPage(1);
    }
  };

  return (
    <section className="tp-card tp-top-products-card" aria-label="Mais Vendidos">
      <div className="tp-card-header tp-top-products-header">
        <div>
          <div className="tp-title-with-badge">
            <h3 className="tp-card-title">Mais vendidos</h3>
            <span className="tp-badge-count">
              {processedList.length} {processedList.length === 1 ? "item" : "itens"}
            </span>
          </div>
          <p className="tp-card-subtitle">
            {sortMode === "revenue"
              ? "Ranking ordenado por receita líquida realizada no período"
              : "Ranking ordenado por volume físico entregue no período"}
          </p>
        </div>

        <div className="tp-ranking-toggles" role="tablist" aria-label="Critério de ordenação">
          <button
            type="button"
            role="tab"
            aria-selected={sortMode === "revenue"}
            className={`tp-ranking-toggle-btn ${sortMode === "revenue" ? "is-active" : ""}`}
            onClick={() => handleModeChange("revenue")}
          >
            <DollarSign size={13} />
            <span>Faturamento</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sortMode === "volume"}
            className={`tp-ranking-toggle-btn ${sortMode === "volume" ? "is-active" : ""}`}
            onClick={() => handleModeChange("volume")}
          >
            <Package size={13} />
            <span>Volume</span>
          </button>
        </div>
      </div>

      {processedList.length === 0 ? (
        <div className="tp-empty-message">
          Nenhum produto registrado com {sortMode === "revenue" ? "faturamento" : "volume físico"} no período selecionado.
        </div>
      ) : (
        <>
          <div className="tp-table-responsive">
            <table className="tp-analytical-table tp-products-table">
              <thead>
                <tr>
                  <th className="tp-th-rank">#</th>
                  <th className="tp-th-product">Produto</th>
                  <th className="tp-th-category">Categoria</th>
                  <th className="tp-th-num tp-th-revenue">Faturamento</th>
                  <th className="tp-th-num tp-th-quantity">Unidades</th>
                  <th className="tp-th-share">Participação</th>
                  <th className="tp-th-num tp-th-customers">Clientes</th>
                  <th className="tp-th-stock">Estoque</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((item, idx) => {
                  const globalRank = startIndex + idx + 1;
                  const isTop3 = globalRank <= 3;
                  const isZeroQty = item.quantity === 0;

                  const share =
                    sortMode === "revenue"
                      ? totalRevenue > 0
                        ? (item.realizedRevenue / totalRevenue) * 100
                        : 0
                      : totalQuantity > 0
                        ? (item.quantity / totalQuantity) * 100
                        : 0;

                  const stock = item.currentStockQuantity;
                  const hasZeroOrNegativeStock = stock !== null && stock <= 0;

                  return (
                    <tr
                      key={item.productId || `${item.code}-${idx}`}
                      className={`tp-table-row ${isTop3 ? "is-top-rank" : ""}`}
                    >
                      <td className="tp-td-rank">
                        <span className={`tp-rank-badge ${isTop3 ? "tp-rank-top" : ""}`}>
                          {globalRank}
                        </span>
                      </td>

                      <td className="tp-td-product">
                        <div className="tp-product-info-cell">
                          <span className="tp-product-name" title={item.description ?? "Sem descrição"}>
                            {item.description ?? "Item sem descrição"}
                          </span>
                          {item.code && (
                            <span className="tp-product-sku">SKU: {item.code}</span>
                          )}
                        </div>
                      </td>

                      <td className="tp-td-category">
                        <span className="tp-category-pill" title={item.category}>
                          {item.category}
                        </span>
                      </td>

                      <td className="tp-td-num tp-td-revenue">
                        <span className="tp-cell-bold">
                          {formatCurrency(item.realizedRevenue)}
                        </span>
                      </td>

                      <td className="tp-td-num tp-td-quantity">
                        <div className="tp-quantity-cell">
                          <span className={isZeroQty ? "tp-text-muted" : "tp-cell-bold"}>
                            {formatNumber(item.quantity)} un
                          </span>
                          {isZeroQty && (
                            <span
                              className="tp-zero-qty-info"
                              title="Receita complementar de venda realizada fisicamente em outro período"
                              aria-label="Receita complementar de venda realizada fisicamente em outro período"
                            >
                              <Info size={13} />
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="tp-td-share">
                        <div className="tp-share-cell">
                          <span className="tp-share-text">{formatPercent(share)}</span>
                          <div className="tp-share-bar-bg">
                            <div
                              className="tp-share-bar-fill"
                              style={{ width: `${Math.min(100, Math.max(0, share))}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="tp-td-num tp-td-customers">
                        <span>{formatNumber(item.distinctCustomers)}</span>
                      </td>

                      <td className="tp-td-stock">
                        {stock === null ? (
                          <span className="tp-text-muted">—</span>
                        ) : hasZeroOrNegativeStock ? (
                          <span className="tp-stock-badge tp-stock-zero" title="Estoque zerado ou negativo">
                            <AlertTriangle size={11} />
                            <span>{formatNumber(stock)} un</span>
                          </span>
                        ) : (
                          <span className="tp-stock-badge tp-stock-ok">
                            {formatNumber(stock)} un
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="tp-pagination-bar">
              <span className="tp-pagination-info">
                Mostrando {startIndex + 1}–{Math.min(startIndex + PAGE_SIZE, processedList.length)} de{" "}
                {processedList.length} produtos
              </span>
              <div className="tp-pagination-controls">
                <button
                  type="button"
                  className="tp-pagination-btn"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  aria-label="Página anterior"
                >
                  <ChevronLeft size={14} />
                  <span>Anterior</span>
                </button>
                <span className="tp-pagination-page">
                  {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  className="tp-pagination-btn"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  aria-label="Próxima página"
                >
                  <span>Próxima</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
