import { useState, useMemo } from "react";
import {
  DollarSign,
  Package,
  TrendingUp,
  Award,
  AlertTriangle,
  Info,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Filter,
} from "lucide-react";
import type { TopProductItem, ShapeCommercialSize, AbcClass } from "../api/bi";
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
  | "profit"
  | "margin"
  | "stock"
  | "abc";

interface TopProductsCardProps {
  products: TopProductItem[];
  totalRevenue: number;
  totalQuantity: number;
  initialSearchTerm?: string;
  initialSortField?: ProductSortField;
  initialSortDirection?: SortDirection;
}

type QuickSortMode = "revenue" | "volume" | "profit" | "abc" | "custom";

const PAGE_SIZE = 15;

function getShapeBadgeLabel(shape: ShapeCommercialSize | null | undefined): string | null {
  if (!shape) return null;
  if (shape === "OTHER") return "Outro tamanho";
  if (shape === "UNCLASSIFIED") return "Tamanho não classificado";
  return `${shape}"`;
}

function getAbcOrder(abc: AbcClass | null | undefined): number {
  if (abc === "A") return 1;
  if (abc === "B") return 2;
  if (abc === "C") return 3;
  return 4; // null / undefined por último
}

export function TopProductsCard({
  products,
  totalRevenue,
  totalQuantity: _totalQuantity,
  initialSearchTerm = "",
  initialSortField = "revenue",
  initialSortDirection = "desc",
}: TopProductsCardProps) {
  const [quickSortMode, setQuickSortMode] = useState<QuickSortMode>(
    initialSortField === "quantity"
      ? "volume"
      : initialSortField === "profit"
        ? "profit"
        : initialSortField === "abc"
          ? "abc"
          : "revenue",
  );
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [selectedLine, setSelectedLine] = useState<string>("ALL");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedShapeSize, setSelectedShapeSize] = useState<string>("ALL");
  const [selectedAbc, setSelectedAbc] = useState<string>("ALL");

  const [sortField, setSortField] = useState<ProductSortField>(initialSortField);
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialSortDirection);
  const [currentPage, setCurrentPage] = useState(1);

  // Extrai listas únicas para os filtros locais da tabela
  const uniqueLines = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.commercialLine && p.commercialLine.trim()) {
        set.add(p.commercialLine.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const uniqueCategories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.category && p.category.trim()) {
        set.add(p.category.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const hasAnyFilterActive =
    Boolean(searchTerm.trim()) ||
    selectedLine !== "ALL" ||
    selectedCategory !== "ALL" ||
    selectedShapeSize !== "ALL" ||
    selectedAbc !== "ALL";

  const handleClearFilters = () => {
    setSearchTerm("");
    setSelectedLine("ALL");
    setSelectedCategory("ALL");
    setSelectedShapeSize("ALL");
    setSelectedAbc("ALL");
    setCurrentPage(1);
  };

  const handleSort = (field: ProductSortField) => {
    setQuickSortMode("custom");
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection(field === "product" ? "asc" : "desc");
    }
    setCurrentPage(1);
  };

  const handleQuickSort = (mode: "revenue" | "volume" | "profit" | "abc") => {
    setQuickSortMode(mode);
    if (mode === "revenue") {
      setSortField("revenue");
      setSortDirection("desc");
    } else if (mode === "volume") {
      setSortField("quantity");
      setSortDirection("desc");
    } else if (mode === "profit") {
      setSortField("profit");
      setSortDirection("desc");
    } else if (mode === "abc") {
      setSortField("abc");
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  // 1. Filtragem local da tabela (Busca + Marca/Linha + Categoria + Shape + ABC)
  const filteredList = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return products.filter((item) => {
      // Busca textual
      if (term) {
        const descMatch = item.description?.toLowerCase().includes(term) ?? false;
        const codeMatch = item.code?.toLowerCase().includes(term) ?? false;
        const idMatch = item.productId ? item.productId.toLowerCase().includes(term) : false;
        const lineMatch = item.commercialLine?.toLowerCase().includes(term) ?? false;
        if (!descMatch && !codeMatch && !idMatch && !lineMatch) {
          return false;
        }
      }

      // Marca / Linha
      if (selectedLine !== "ALL" && item.commercialLine !== selectedLine) {
        return false;
      }

      // Categoria
      if (selectedCategory !== "ALL" && item.category !== selectedCategory) {
        return false;
      }

      // Tamanho de shape
      if (selectedShapeSize !== "ALL") {
        if (item.shapeCommercialSize !== selectedShapeSize) {
          return false;
        }
      }

      // Classe ABC
      if (selectedAbc !== "ALL" && item.abcClass !== selectedAbc) {
        return false;
      }

      return true;
    });
  }, [
    products,
    searchTerm,
    selectedLine,
    selectedCategory,
    selectedShapeSize,
    selectedAbc,
  ]);

  // 2. Ordenação rigorosa (com nulls last e desempates canônicos)
  const sortedList = useMemo(() => {
    return [...filteredList].sort((a, b) => {
      let cmp = 0;

      switch (sortField) {
        case "product":
          cmp = compareStringNullsLast(a.description, b.description, sortDirection);
          break;

        case "revenue":
          cmp = compareNumericNullsLast(a.realizedRevenue, b.realizedRevenue, sortDirection);
          break;

        case "quantity": {
          const qtyA = a.realizedQuantity ?? a.quantity;
          const qtyB = b.realizedQuantity ?? b.quantity;
          cmp = compareNumericNullsLast(qtyA, qtyB, sortDirection);
          break;
        }

        case "profit": {
          const profitA = a.grossProfitEstimatedCurrentCost;
          const profitB = b.grossProfitEstimatedCurrentCost;
          cmp = compareNumericNullsLast(profitA, profitB, sortDirection);
          break;
        }

        case "margin": {
          const marginA = a.grossMarginEstimatedCurrentCost;
          const marginB = b.grossMarginEstimatedCurrentCost;
          cmp = compareNumericNullsLast(marginA, marginB, sortDirection);
          break;
        }

        case "stock": {
          const stockA = a.currentStockQuantity ?? a.stockQuantity ?? null;
          const stockB = b.currentStockQuantity ?? b.stockQuantity ?? null;
          cmp = compareNumericNullsLast(stockA, stockB, sortDirection);
          break;
        }

        case "abc": {
          const orderA = getAbcOrder(a.abcClass);
          const orderB = getAbcOrder(b.abcClass);
          cmp = sortDirection === "asc" ? orderA - orderB : orderB - orderA;
          break;
        }
      }

      if (cmp !== 0) return cmp;

      // Desempate canônico e estável:
      // 1. Receita realizada DESC
      // 2. Quantidade realizada DESC
      // 3. Código SKU ASC
      // 4. ProductId ASC
      const tieRevenue = compareNumericNullsLast(a.realizedRevenue, b.realizedRevenue, "desc");
      if (tieRevenue !== 0) return tieRevenue;

      const tieQty = compareNumericNullsLast(
        a.realizedQuantity ?? a.quantity,
        b.realizedQuantity ?? b.quantity,
        "desc",
      );
      if (tieQty !== 0) return tieQty;

      return (
        (a.code || "").localeCompare(b.code || "") ||
        (a.productId || "").localeCompare(b.productId || "")
      );
    });
  }, [filteredList, sortField, sortDirection]);

  // 3. Paginação
  const totalItems = sortedList.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const paginatedItems = sortedList.slice(startIndex, startIndex + PAGE_SIZE);

  return (
    <section className="tp-card tp-top-products-card" aria-label="Ranking de Produtos">
      {/* Cabeçalho do Card */}
      <div className="tp-card-header tp-top-products-header">
        <div>
          <div className="tp-title-with-badge">
            <h3 className="tp-card-title">Ranking de Produtos</h3>
            <span className="tp-badge-count">
              {hasAnyFilterActive
                ? `${totalItems} de ${products.length} produtos`
                : `${products.length} ${products.length === 1 ? "produto" : "produtos"}`}
            </span>
          </div>
          <p className="tp-card-subtitle">
            Desempenho comercial dos SKUs no período selecionado
          </p>
        </div>

        {/* Visões Rápidas de Ordenação */}
        <div className="tp-ranking-toggles" role="tablist" aria-label="Critério de ordenação do ranking">
          <button
            type="button"
            role="tab"
            aria-selected={quickSortMode === "revenue"}
            className={`tp-ranking-toggle-btn ${quickSortMode === "revenue" ? "is-active" : ""}`}
            onClick={() => handleQuickSort("revenue")}
          >
            <DollarSign size={13} />
            <span>Faturamento</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={quickSortMode === "volume"}
            className={`tp-ranking-toggle-btn ${quickSortMode === "volume" ? "is-active" : ""}`}
            onClick={() => handleQuickSort("volume")}
          >
            <Package size={13} />
            <span>Volume</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={quickSortMode === "profit"}
            className={`tp-ranking-toggle-btn ${quickSortMode === "profit" ? "is-active" : ""}`}
            onClick={() => handleQuickSort("profit")}
          >
            <TrendingUp size={13} />
            <span>Lucro estimado</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={quickSortMode === "abc"}
            className={`tp-ranking-toggle-btn ${quickSortMode === "abc" ? "is-active" : ""}`}
            onClick={() => handleQuickSort("abc")}
          >
            <Award size={13} />
            <span>Curva ABC</span>
          </button>
        </div>
      </div>

      {/* Barra de Filtros Locais da Tabela */}
      <div className="tp-ranking-filter-bar" aria-label="Filtros da tabela de ranking">
        {/* Busca textual */}
        <div className="tp-ranking-search-box">
          <Search size={14} className="tp-search-icon" />
          <input
            type="text"
            placeholder="Buscar produto ou código..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="tp-input-search tp-ranking-search-input"
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

        {/* Dropdowns de Filtro Local */}
        <div className="tp-ranking-selects-wrap">
          {/* Marca / Linha */}
          <div className="tp-filter-select-group">
            <select
              value={selectedLine}
              onChange={(e) => {
                setSelectedLine(e.target.value);
                setCurrentPage(1);
              }}
              className="tp-filter-select"
              aria-label="Filtrar por Marca ou Linha"
            >
              <option value="ALL">Todas as marcas/linhas</option>
              {uniqueLines.map((line) => (
                <option key={line} value={line}>
                  {line}
                </option>
              ))}
            </select>
          </div>

          {/* Categoria */}
          <div className="tp-filter-select-group">
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setCurrentPage(1);
              }}
              className="tp-filter-select"
              aria-label="Filtrar por Categoria"
            >
              <option value="ALL">Todas as categorias</option>
              {uniqueCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Tamanho de Shape */}
          <div className="tp-filter-select-group">
            <select
              value={selectedShapeSize}
              onChange={(e) => {
                setSelectedShapeSize(e.target.value);
                setCurrentPage(1);
              }}
              className="tp-filter-select"
              aria-label="Filtrar por Tamanho de Shape"
            >
              <option value="ALL">Todos os shapes</option>
              <option value="7.7">Shape 7.7"</option>
              <option value="7.8">Shape 7.8"</option>
              <option value="8.0">Shape 8.0"</option>
              <option value="8.1">Shape 8.1"</option>
              <option value="8.2">Shape 8.2"</option>
              <option value="8.5">Shape 8.5"</option>
              <option value="OTHER">Shape: Outro tamanho</option>
              <option value="UNCLASSIFIED">Shape: Não classificado</option>
            </select>
          </div>

          {/* Classe ABC */}
          <div className="tp-filter-select-group">
            <select
              value={selectedAbc}
              onChange={(e) => {
                setSelectedAbc(e.target.value);
                setCurrentPage(1);
              }}
              className="tp-filter-select"
              aria-label="Filtrar por Classe ABC"
            >
              <option value="ALL">Todas as classes ABC</option>
              <option value="A">Classe A</option>
              <option value="B">Classe B</option>
              <option value="C">Classe C</option>
            </select>
          </div>

          {/* Botão limpar filtros quando ativo */}
          {hasAnyFilterActive && (
            <button
              type="button"
              className="tp-btn-clear-filters"
              onClick={handleClearFilters}
              title="Limpar todos os filtros da tabela"
            >
              <Filter size={12} />
              <span>Limpar filtros</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabela de Produtos */}
      {products.length === 0 ? (
        <div className="tp-empty-message">
          Nenhum produto registrado no período selecionado.
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
                    Produto / SKU
                  </SortableTh>
                  <th className="tp-th-line-cat">Marca-Linha / Categoria</th>
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
                    field="profit"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    className="tp-th-num tp-th-profit"
                    align="right"
                  >
                    Resultado estimado
                  </SortableTh>
                  <SortableTh
                    field="margin"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    className="tp-th-num tp-th-margin"
                    align="right"
                  >
                    Margem estimada
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
                  <SortableTh
                    field="abc"
                    currentSortField={sortField}
                    currentSortDirection={sortDirection}
                    onSort={handleSort}
                    className="tp-th-abc"
                    align="center"
                  >
                    ABC
                  </SortableTh>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="tp-table-empty">
                      Nenhum produto encontrado com os filtros selecionados.
                      {hasAnyFilterActive && (
                        <div style={{ marginTop: "0.5rem" }}>
                          <button
                            type="button"
                            className="tp-btn-retry"
                            onClick={handleClearFilters}
                          >
                            <span>Limpar filtros</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((item, idx) => {
                    const globalRank = startIndex + idx + 1;
                    const isTop3 = globalRank <= 3 && !hasAnyFilterActive;
                    const qty = item.realizedQuantity ?? item.quantity;
                    const isZeroQty = qty === 0;

                    const share =
                      item.revenueShare ??
                      (totalRevenue > 0
                        ? (item.realizedRevenue / totalRevenue) * 100
                        : 0);

                    const stock =
                      item.currentStockQuantity ?? item.stockQuantity ?? null;
                    const hasZeroOrNegativeStock = stock !== null && stock <= 0;

                    const shapeBadge = getShapeBadgeLabel(item.shapeCommercialSize);

                    return (
                      <tr
                        key={item.productId || `${item.code}-${idx}`}
                        className={`tp-table-row ${isTop3 ? "is-top-rank" : ""}`}
                      >
                        {/* 1. Rank */}
                        <td className="tp-td-rank">
                          <span className={`tp-rank-badge ${isTop3 ? "tp-rank-top" : ""}`}>
                            {globalRank}
                          </span>
                        </td>

                        {/* 2. Produto / SKU */}
                        <td className="tp-td-product">
                          <div className="tp-product-info-cell">
                            <div className="tp-product-title-row">
                              <span
                                className="tp-product-name"
                                title={item.description ?? "Sem descrição"}
                              >
                                {item.description ?? "Item sem descrição"}
                              </span>
                              {shapeBadge && (
                                <span
                                  className="tp-shape-badge"
                                  title={`Tamanho comercial: ${shapeBadge}`}
                                >
                                  {shapeBadge}
                                </span>
                              )}
                            </div>
                            {item.code && (
                              <span className="tp-product-sku">SKU: {item.code}</span>
                            )}
                          </div>
                        </td>

                        {/* 3. Marca-Linha / Categoria */}
                        <td className="tp-td-line-cat">
                          <div className="tp-line-cat-cell">
                            <span className="tp-line-text" title={item.commercialLine || "Sem linha"}>
                              {item.commercialLine || "—"}
                            </span>
                            <span className="tp-cat-subtext" title={item.category}>
                              {item.category}
                            </span>
                          </div>
                        </td>

                        {/* 4. Faturamento */}
                        <td className="tp-td-num tp-td-revenue">
                          <div className="tp-revenue-cell">
                            <span className="tp-cell-bold">
                              {formatCurrency(item.realizedRevenue)}
                            </span>
                            <span className="tp-share-subtext">
                              {formatPercent(share)}
                            </span>
                          </div>
                        </td>

                        {/* 5. Unidades */}
                        <td className="tp-td-num tp-td-quantity">
                          <div className="tp-quantity-cell">
                            <span className={isZeroQty ? "tp-text-muted" : "tp-cell-bold"}>
                              {formatNumber(qty)} un
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

                        {/* 6. Resultado estimado (Lucro + CMV) */}
                        <td className="tp-td-num tp-td-profit">
                          <div className="tp-profit-cell">
                            <span className="tp-cell-bold">
                              {item.grossProfitEstimatedCurrentCost !== null &&
                              item.grossProfitEstimatedCurrentCost !== undefined
                                ? formatCurrency(item.grossProfitEstimatedCurrentCost)
                                : "—"}
                            </span>
                            <span className="tp-cmv-subtext" title="CMV estimado ao custo atual">
                              {item.cmvEstimatedCurrentCost !== null &&
                              item.cmvEstimatedCurrentCost !== undefined
                                ? `CMV: ${formatCurrency(item.cmvEstimatedCurrentCost)}`
                                : "CMV: —"}
                            </span>
                          </div>
                        </td>

                        {/* 7. Margem estimada */}
                        <td className="tp-td-num tp-td-margin">
                          <span
                            className="tp-margin-text"
                            title="Margem bruta estimada ao custo atual"
                          >
                            {item.grossMarginEstimatedCurrentCost !== null &&
                            item.grossMarginEstimatedCurrentCost !== undefined
                              ? formatPercent(item.grossMarginEstimatedCurrentCost)
                              : "—"}
                          </span>
                        </td>

                        {/* 8. Estoque */}
                        <td className="tp-td-stock">
                          {stock === null ? (
                            <span className="tp-text-muted">—</span>
                          ) : hasZeroOrNegativeStock ? (
                            <span
                              className="tp-stock-badge tp-stock-zero"
                              title="Estoque zerado ou negativo"
                            >
                              <AlertTriangle size={11} />
                              <span>{formatNumber(stock)} un</span>
                            </span>
                          ) : (
                            <span className="tp-stock-badge tp-stock-ok">
                              {formatNumber(stock)} un
                            </span>
                          )}
                        </td>

                        {/* 9. Classe ABC */}
                        <td className="tp-td-abc">
                          {item.abcClass ? (
                            <span className={`tp-abc-badge tp-abc-${item.abcClass.toLowerCase()}`}>
                              {item.abcClass}
                            </span>
                          ) : (
                            <span className="tp-text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {totalPages > 1 && totalItems > 0 && (
            <div className="tp-pagination-bar">
              <span className="tp-pagination-info">
                {`Mostrando ${startIndex + 1}–${Math.min(startIndex + PAGE_SIZE, totalItems)} de ${totalItems} produtos`}
                {hasAnyFilterActive && ` (filtrados de ${products.length})`}
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
