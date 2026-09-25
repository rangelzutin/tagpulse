import { useState, useMemo } from "react";
import { DollarSign, Package, AlertTriangle, Info, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import type { TopProductItem } from "../api/bi";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
} from "../utils/formatters";
import {
  compareNumericNullsLast,
  compareStringNullsLast,
  type SortDirection,
} from "../utils/sortUtils";
import { SortableTh } from "./SortableTh";

export type ProductSortField =
  | "product"
  | "revenue"
  | "quantity"
  | "share"
  | "customers"
  | "stock";

interface TopProductsCardProps {
  products: TopProductItem[];
  totalRevenue: number;
  totalQuantity: number;
  initialSearchTerm?: string;
  initialSortField?: ProductSortField;
  initialSortDirection?: SortDirection;
}

type RankingSortMode = "revenue" | "volume";

const PAGE_SIZE = 15;

export function TopProductsCard({
  products,
  totalRevenue,
  totalQuantity,
  initialSearchTerm = "",
  initialSortField = "revenue",
  initialSortDirection = "desc",
}: TopProductsCardProps) {
  const [sortMode, setSortMode] = useState<RankingSortMode>("revenue");
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [sortField, setSortField] = useState<ProductSortField>(initialSortField);
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialSortDirection);
  const [currentPage, setCurrentPage] = useState(1);

  const handleSort = (field: ProductSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      // Produto inicia com ASC; métricas numéricas com DESC
      setSortDirection(field === "product" ? "asc" : "desc");
    }
    setCurrentPage(1);
  };

  const handleModeChange = (newMode: RankingSortMode) => {
    if (newMode !== sortMode) {
      setSortMode(newMode);
      if (newMode === "revenue") {
        setSortField("revenue");
        setSortDirection("desc");
      } else {
        setSortField("quantity");
        setSortDirection("desc");
      }
      setCurrentPage(1);
    }
  };

  // 1. Filtro base operacional do card
  const baseList = useMemo(() => {
    if (sortMode === "volume") {
      // Volume: exclui produtos com quantity === 0 no período
      return products.filter((p) => p.quantity > 0);
    }
    return products;
  }, [products, sortMode]);

  // 2. Busca textual local (case-insensitive, trim)
  const searchedList = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return baseList;

    return baseList.filter((item) => {
      const descMatch = item.description?.toLowerCase().includes(term) ?? false;
      const codeMatch = item.code?.toLowerCase().includes(term) ?? false;
      const idMatch = item.productId ? item.productId.toLowerCase().includes(term) : false;
      const sourceIdMatch = (item as any).productSourceId
        ? String((item as any).productSourceId).toLowerCase().includes(term)
        : false;
      return descMatch || codeMatch || idMatch || sourceIdMatch;
    });
  }, [baseList, searchTerm]);

  // 3. Ordenação com preservação de null sempre por último
  const sortedList = useMemo(() => {
    return [...searchedList].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "product":
          cmp = compareStringNullsLast(a.description, b.description, sortDirection);
          break;
        case "revenue":
          cmp = compareNumericNullsLast(a.realizedRevenue, b.realizedRevenue, sortDirection);
          break;
        case "quantity":
          cmp = compareNumericNullsLast(a.quantity, b.quantity, sortDirection);
          break;
        case "share": {
          const shareA =
            sortMode === "revenue"
              ? totalRevenue > 0
                ? (a.realizedRevenue / totalRevenue) * 100
                : 0
              : totalQuantity > 0
                ? (a.quantity / totalQuantity) * 100
                : 0;
          const shareB =
            sortMode === "revenue"
              ? totalRevenue > 0
                ? (b.realizedRevenue / totalRevenue) * 100
                : 0
              : totalQuantity > 0
                ? (b.quantity / totalQuantity) * 100
                : 0;
          cmp = compareNumericNullsLast(shareA, shareB, sortDirection);
          break;
        }
        case "customers":
          cmp = compareNumericNullsLast(a.distinctCustomers, b.distinctCustomers, sortDirection);
          break;
        case "stock":
          cmp = compareNumericNullsLast(a.currentStockQuantity, b.currentStockQuantity, sortDirection);
          break;
      }

      if (cmp !== 0) return cmp;
      // Desempate estável: faturamento DESC, código, ID
      return (
        compareNumericNullsLast(a.realizedRevenue, b.realizedRevenue, "desc") ||
        (a.code || "").localeCompare(b.code || "") ||
        (a.productId || "").localeCompare(b.productId || "")
      );
    });
  }, [searchedList, sortField, sortDirection, sortMode, totalRevenue, totalQuantity]);

  // 4. Paginação
  const totalItems = sortedList.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const paginatedItems = sortedList.slice(startIndex, startIndex + PAGE_SIZE);

  return (
    <section className="tp-card tp-top-products-card" aria-label="Mais Vendidos">
      <div className="tp-card-header tp-top-products-header">
        <div>
          <div className="tp-title-with-badge">
            <h3 className="tp-card-title">Mais vendidos</h3>
            <span className="tp-badge-count">
              {`${sortedList.length} ${sortedList.length === 1 ? "item" : "itens"}`}
            </span>
          </div>
          <p className="tp-card-subtitle">
            {sortMode === "revenue"
              ? "Ranking ordenado por receita líquida realizada no período"
              : "Ranking ordenado por volume físico entregue no período"}
          </p>
        </div>

        <div className="tp-top-products-controls">
          <div className="tp-search-input-wrap tp-profit-search-wrap tp-products-search-wrap">
            <Search size={14} className="tp-search-icon" />
            <input
              type="text"
              placeholder="Buscar produto ou código..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="tp-input-search tp-profit-search-input"
            />
            {searchTerm && (
              <button
                type="button"
                className="tp-search-clear-btn"
                onClick={() => {
                  setSearchTerm("");
                  setCurrentPage(1);
                }}
                aria-label="Limpar busca"
              >
                <X size={12} />
              </button>
            )}
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
      </div>

      {baseList.length === 0 ? (
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
                  <SortableTh
                    field="product"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    className="tp-th-product"
                    align="left"
                  >
                    Produto
                  </SortableTh>
                  <th className="tp-th-category">Categoria</th>
                  <SortableTh
                    field="revenue"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    className="tp-th-num tp-th-revenue"
                    align="right"
                  >
                    Faturamento
                  </SortableTh>
                  <SortableTh
                    field="quantity"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    className="tp-th-num tp-th-quantity"
                    align="right"
                  >
                    Unidades
                  </SortableTh>
                  <SortableTh
                    field="share"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    className="tp-th-share"
                    align="right"
                  >
                    Participação
                  </SortableTh>
                  <SortableTh
                    field="customers"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    className="tp-th-num tp-th-customers"
                    align="right"
                  >
                    Clientes
                  </SortableTh>
                  <SortableTh
                    field="stock"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    className="tp-th-stock"
                    align="right"
                  >
                    Estoque
                  </SortableTh>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="tp-table-empty">
                      Nenhum produto encontrado para esta busca.
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((item, idx) => {
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
                }))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && totalItems > 0 && (
            <div className="tp-pagination-bar">
              <span className="tp-pagination-info">
                {`Mostrando ${startIndex + 1}–${Math.min(startIndex + PAGE_SIZE, totalItems)} de ${totalItems} produtos`}
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
                  {`${safePage} / ${totalPages}`}
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
