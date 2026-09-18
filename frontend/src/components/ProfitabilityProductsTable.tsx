import { useState, useMemo } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
} from "lucide-react";
import type {
  CategoryTreeNode,
  CommercialChannel,
  ProfitabilityProductItem,
} from "../api/bi";
import {
  formatCurrency,
  formatNumber,
} from "../utils/formatters";
import { InventoryCategoryTreeSelector } from "./InventoryCategoryTreeSelector";

export type ProductSortField =
  | "name"
  | "cost"
  | "quantity"
  | "revenue"
  | "cogs"
  | "profit"
  | "margin";

export type SortDirection = "asc" | "desc";

interface ProfitabilityProductsTableProps {
  products: ProfitabilityProductItem[];
  categoryTree: CategoryTreeNode[];
  selectedChannel: CommercialChannel | null;
  onSelectChannel: (channel: CommercialChannel | null) => void;
  selectedCategorySourceId: string | null;
  onSelectCategorySourceId: (sourceId: string | null) => void;
  onResetFilters: () => void;
}

export function ProfitabilityProductsTable({
  products,
  categoryTree,
  selectedChannel,
  onSelectChannel,
  selectedCategorySourceId,
  onSelectCategorySourceId,
  onResetFilters,
}: ProfitabilityProductsTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<ProductSortField>("revenue");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // 1. Filtragem local por texto de busca (nome, SKU, ID)
  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return products;

    return products.filter((p) => {
      const nameMatch = p.productName.toLowerCase().includes(term);
      const skuMatch = p.sku ? p.sku.toLowerCase().includes(term) : false;
      const idMatch = p.productSourceId.toLowerCase().includes(term);
      const catMatch = p.category ? p.category.toLowerCase().includes(term) : false;
      return nameMatch || skuMatch || idMatch || catMatch;
    });
  }, [products, searchTerm]);

  // 2. Ordenação
  const sortedProducts = useMemo(() => {
    return [...filteredProducts].sort((a, b) => {
      let valA: number | string = 0;
      let valB: number | string = 0;

      switch (sortField) {
        case "name":
          valA = a.productName.toLowerCase();
          valB = b.productName.toLowerCase();
          break;
        case "cost":
          valA = a.currentEffectiveCost ?? -999999;
          valB = b.currentEffectiveCost ?? -999999;
          break;
        case "quantity":
          valA = a.physicalQuantity;
          valB = b.physicalQuantity;
          break;
        case "revenue":
          valA = a.realizedRevenue;
          valB = b.realizedRevenue;
          break;
        case "cogs":
          valA = a.estimatedCOGS ?? -999999;
          valB = b.estimatedCOGS ?? -999999;
          break;
        case "profit":
          valA = a.estimatedGrossProfit ?? -999999;
          valB = b.estimatedGrossProfit ?? -999999;
          break;
        case "margin":
          valA = a.estimatedGrossMarginPercent ?? -999999;
          valB = b.estimatedGrossMarginPercent ?? -999999;
          break;
      }

      if (typeof valA === "string" && typeof valB === "string") {
        return sortDirection === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      const numA = valA as number;
      const numB = valB as number;
      return sortDirection === "asc" ? numA - numB : numB - numA;
    });
  }, [filteredProducts, sortField, sortDirection]);

  // 3. Paginação
  const totalRecords = sortedProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedProducts.slice(start, start + pageSize);
  }, [sortedProducts, currentPage, pageSize]);

  const handleSort = (field: ProductSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
    setPage(1);
  };

  const renderSortIcon = (field: ProductSortField) => {
    if (sortField !== field) {
      return <ArrowUpDown size={13} className="tp-sort-icon is-inactive" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp size={13} className="tp-sort-icon is-active" />
    ) : (
      <ArrowDown size={13} className="tp-sort-icon is-active" />
    );
  };

  const hasActiveFilters =
    Boolean(selectedChannel) ||
    Boolean(selectedCategorySourceId) ||
    Boolean(searchTerm.trim());

  return (
    <div className="tp-card tp-profit-table-card" id="tabela-rentabilidade">
      {/* Table Header & Local Controls */}
      <div className="tp-card-header tp-table-header-wrap">
        <div>
          <h3 className="tp-card-title">Detalhamento por Produto</h3>
          <p className="tp-card-subtitle">
            Rentabilidade estimada calculada produto a produto com base no custo atual de catálogo
          </p>
        </div>

        {/* Filter Controls Bar */}
        <div className="tp-table-controls-bar">
          {/* Canal */}
          <div className="tp-filter-control-item">
            <select
              className="tp-select-compact"
              value={selectedChannel ?? "TODOS"}
              onChange={(e) => {
                const val = e.target.value;
                onSelectChannel(val === "TODOS" ? null : (val as CommercialChannel));
                setPage(1);
              }}
              aria-label="Filtrar por canal"
            >
              <option value="TODOS">Todos os canais</option>
              <option value="ATACADO">Atacado</option>
              <option value="VAREJO">Varejo</option>
            </select>
          </div>

          {/* Seletor Hierárquico de Categorias */}
          <div className="tp-filter-control-item">
            <InventoryCategoryTreeSelector
              categories={categoryTree}
              selectedCategorySourceId={selectedCategorySourceId}
              onSelectCategorySourceId={(sourceId) => {
                onSelectCategorySourceId(sourceId);
                setPage(1);
              }}
            />
          </div>

          {/* Search Input */}
          <div className="tp-search-wrap">
            <Search size={14} className="tp-search-icon" />
            <input
              type="text"
              placeholder="Buscar por produto, SKU ou ID..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="tp-search-input"
            />
            {searchTerm && (
              <button
                type="button"
                className="tp-search-clear"
                onClick={() => {
                  setSearchTerm("");
                  setPage(1);
                }}
                aria-label="Limpar busca"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <button
              type="button"
              className="tp-btn-reset-filters"
              onClick={() => {
                setSearchTerm("");
                onResetFilters();
                setPage(1);
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="tp-table-wrapper">
        <table className="tp-table">
          <thead>
            <tr>
              <th
                className="tp-clickable-th"
                onClick={() => handleSort("name")}
              >
                <div className="tp-th-content">
                  <span>Produto</span>
                  {renderSortIcon("name")}
                </div>
              </th>
              <th>Categoria atual</th>
              <th
                className="tp-text-right tp-clickable-th"
                onClick={() => handleSort("cost")}
              >
                <div className="tp-th-content tp-justify-end">
                  <span>Custo Atual</span>
                  {renderSortIcon("cost")}
                </div>
              </th>
              <th
                className="tp-text-right tp-clickable-th"
                onClick={() => handleSort("quantity")}
              >
                <div className="tp-th-content tp-justify-end">
                  <span>Qtd. Vendida</span>
                  {renderSortIcon("quantity")}
                </div>
              </th>
              <th
                className="tp-text-right tp-clickable-th"
                onClick={() => handleSort("revenue")}
              >
                <div className="tp-th-content tp-justify-end">
                  <span>Receita Realizada</span>
                  {renderSortIcon("revenue")}
                </div>
              </th>
              <th
                className="tp-text-right tp-clickable-th"
                onClick={() => handleSort("cogs")}
              >
                <div className="tp-th-content tp-justify-end">
                  <span>CMV Estimado</span>
                  {renderSortIcon("cogs")}
                </div>
              </th>
              <th
                className="tp-text-right tp-clickable-th"
                onClick={() => handleSort("profit")}
              >
                <div className="tp-th-content tp-justify-end">
                  <span>Lucro Bruto Est.</span>
                  {renderSortIcon("profit")}
                </div>
              </th>
              <th
                className="tp-text-right tp-clickable-th"
                onClick={() => handleSort("margin")}
              >
                <div className="tp-th-content tp-justify-end">
                  <span>Margem Bruta Est.</span>
                  {renderSortIcon("margin")}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedProducts.length === 0 ? (
              <tr>
                <td colSpan={8} className="tp-table-empty">
                  Nenhum produto encontrado com os filtros aplicados.
                </td>
              </tr>
            ) : (
              paginatedProducts.map((p) => {
                const isNegative =
                  p.estimatedGrossMarginPercent !== null &&
                  p.estimatedGrossMarginPercent < 0;

                return (
                  <tr key={`${p.productSourceId}-${p.productId ?? "orphan"}`}>
                    <td>
                      <div className="tp-product-cell">
                        <span className="tp-product-name" title={p.productName}>
                          {p.productName}
                        </span>
                        <div className="tp-product-meta">
                          {p.isOrphan ? (
                            <span className="tp-badge-orphan">
                              {`ID TagPlus: ${p.productSourceId} • Histórico`}
                            </span>
                          ) : (
                            <>
                              {p.sku && <span className="tp-sku-tag">{p.sku}</span>}
                              <span className="tp-id-tag">ID: {p.productSourceId}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="tp-category-text">
                        {p.category ?? "Sem categoria atual"}
                      </span>
                    </td>
                    <td className="tp-text-right tp-font-mono">
                      {p.currentEffectiveCost !== null
                        ? formatCurrency(p.currentEffectiveCost)
                        : "—"}
                    </td>
                    <td className="tp-text-right tp-font-mono">
                      {formatNumber(p.physicalQuantity)}
                    </td>
                    <td className="tp-text-right tp-font-mono">
                      {formatCurrency(p.realizedRevenue)}
                    </td>
                    <td className="tp-text-right tp-font-mono tp-color-blue">
                      {p.estimatedCOGS !== null
                        ? formatCurrency(p.estimatedCOGS)
                        : "—"}
                    </td>
                    <td className="tp-text-right tp-font-mono tp-color-teal">
                      {p.estimatedGrossProfit !== null
                        ? formatCurrency(p.estimatedGrossProfit)
                        : "—"}
                    </td>
                    <td className="tp-text-right tp-font-mono">
                      <span
                        className={
                          p.estimatedGrossMarginPercent === null
                            ? "tp-text-muted"
                            : isNegative
                            ? "tp-profit-negative"
                            : "tp-color-teal"
                        }
                      >
                        {p.estimatedGrossMarginPercent !== null
                          ? `${formatNumber(p.estimatedGrossMarginPercent)}%`
                          : "—"}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="tp-pagination-footer">
        <div className="tp-pagination-info">
          Exibindo{" "}
          <span className="tp-font-medium">
            {totalRecords === 0
              ? 0
              : (currentPage - 1) * pageSize + 1}
            -
            {Math.min(currentPage * pageSize, totalRecords)}
          </span>{" "}
          de <span className="tp-font-medium">{totalRecords}</span> produtos
        </div>

        <div className="tp-pagination-controls">
          <div className="tp-page-size-selector">
            <span>Por página:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="tp-select-compact"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>

          <div className="tp-pagination-nav">
            <button
              type="button"
              className="tp-btn-page"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Página anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="tp-page-indicator">
              {currentPage} de {totalPages}
            </span>
            <button
              type="button"
              className="tp-btn-page"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Próxima página"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
