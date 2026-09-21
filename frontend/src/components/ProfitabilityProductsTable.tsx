import { useState, useMemo, useRef, useEffect } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  X,
} from "lucide-react";
import type {
  CategoryTreeNode,
  CommercialChannel,
  ProfitabilityProductItem,
} from "../api/bi";
import {
  formatChannelLabel,
  formatCurrency,
  formatNumber,
} from "../utils/formatters";
import {
  compareNumericNullsLast,
  compareStringNullsLast,
  type SortDirection,
} from "../utils/sortUtils";
import { InventoryCategoryTreeSelector } from "./InventoryCategoryTreeSelector";
import { SortableTh } from "./SortableTh";

const CHANNEL_OPTIONS: { label: string; value: CommercialChannel | null }[] = [
  { label: "Todos os canais", value: null },
  { label: formatChannelLabel("ATACADO"), value: "ATACADO" },
  { label: formatChannelLabel("VAREJO"), value: "VAREJO" },
  { label: formatChannelLabel("INDETERMINADO"), value: "INDETERMINADO" },
  { label: formatChannelLabel("CONFLITO"), value: "CONFLITO" },
];


export type ProductSortField =
  | "name"
  | "cost"
  | "quantity"
  | "revenue"
  | "cogs"
  | "profit"
  | "margin";

export type { SortDirection } from "../utils/sortUtils";

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
  const [isChannelOpen, setIsChannelOpen] = useState(false);
  const channelDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        channelDropdownRef.current &&
        !channelDropdownRef.current.contains(event.target as Node)
      ) {
        setIsChannelOpen(false);
      }
    }
    if (isChannelOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isChannelOpen]);

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
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = compareStringNullsLast(a.productName, b.productName, sortDirection);
          break;
        case "cost":
          cmp = compareNumericNullsLast(
            a.currentEffectiveCost,
            b.currentEffectiveCost,
            sortDirection,
          );
          break;
        case "quantity":
          cmp = compareNumericNullsLast(
            a.physicalQuantity,
            b.physicalQuantity,
            sortDirection,
          );
          break;
        case "revenue":
          cmp = compareNumericNullsLast(
            a.realizedRevenue,
            b.realizedRevenue,
            sortDirection,
          );
          break;
        case "cogs":
          cmp = compareNumericNullsLast(
            a.estimatedCOGS,
            b.estimatedCOGS,
            sortDirection,
          );
          break;
        case "profit":
          cmp = compareNumericNullsLast(
            a.estimatedGrossProfit,
            b.estimatedGrossProfit,
            sortDirection,
          );
          break;
        case "margin":
          cmp = compareNumericNullsLast(
            a.estimatedGrossMarginPercent,
            b.estimatedGrossMarginPercent,
            sortDirection,
          );
          break;
      }

      if (cmp !== 0) return cmp;
      // Desempate determinístico: receita DESC, seguido por productSourceId
      return (
        b.realizedRevenue - a.realizedRevenue ||
        a.productSourceId.localeCompare(b.productSourceId)
      );
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
          {/* Canal Custom Dropdown */}
          <div className="tp-filter-control-item tp-channel-filter-item">
            <div
              className="tp-combobox-container tp-channel-combobox"
              ref={channelDropdownRef}
            >
              <button
                type="button"
                className={`tp-combobox-trigger tp-filter-trigger ${isChannelOpen ? "is-open" : ""} ${selectedChannel ? "is-filtered" : ""}`}
                onClick={() => setIsChannelOpen((prev) => !prev)}
                aria-label="Filtrar por canal"
                aria-expanded={isChannelOpen}
              >
                <span className="tp-combobox-label">
                  {CHANNEL_OPTIONS.find((opt) => opt.value === selectedChannel)?.label ?? "Todos os canais"}
                </span>
                <ChevronDown
                  size={14}
                  className={`tp-combobox-chevron ${isChannelOpen ? "is-rotated" : ""}`}
                />
              </button>

              {isChannelOpen && (
                <div className="tp-combobox-popover tp-filter-dropdown-popover" role="listbox">
                  {CHANNEL_OPTIONS.map((opt) => {
                    const isSelected = selectedChannel === opt.value;
                    return (
                      <button
                        key={opt.value ?? "ALL"}
                        type="button"
                        className={`tp-combobox-option ${isSelected ? "is-selected" : ""}`}
                        onClick={() => {
                          onSelectChannel(opt.value);
                          setIsChannelOpen(false);
                          setPage(1);
                        }}
                        role="option"
                        aria-selected={isSelected}
                      >
                        <span className="tp-combobox-option-text">{opt.label}</span>
                        {isSelected && (
                          <Check size={14} className="tp-combobox-check-icon" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Seletor Hierárquico de Categorias */}
          <div className="tp-filter-control-item tp-category-filter-item">
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
          <div className="tp-search-input-wrap tp-profit-search-wrap">
            <Search size={14} className="tp-search-icon" />
            <input
              type="text"
              placeholder="Buscar produto ou código..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="tp-input-search tp-profit-search-input"
            />
            {searchTerm && (
              <button
                type="button"
                className="tp-search-clear-btn"
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
        <table className="tp-table tp-profit-table">
          <thead>
            <tr>
              <SortableTh
                field="name"
                currentSortField={sortField}
                currentSortDirection={sortDirection}
                onSort={handleSort}
                className="tp-col-product"
              >
                Produto
              </SortableTh>
              <th>Categoria atual</th>
              <SortableTh
                field="cost"
                currentSortField={sortField}
                currentSortDirection={sortDirection}
                onSort={handleSort}
                align="right"
              >
                Custo Atual
              </SortableTh>
              <SortableTh
                field="quantity"
                currentSortField={sortField}
                currentSortDirection={sortDirection}
                onSort={handleSort}
                align="right"
              >
                Qtd. Vendida
              </SortableTh>
              <SortableTh
                field="revenue"
                currentSortField={sortField}
                currentSortDirection={sortDirection}
                onSort={handleSort}
                align="right"
              >
                Receita Realizada
              </SortableTh>
              <SortableTh
                field="cogs"
                currentSortField={sortField}
                currentSortDirection={sortDirection}
                onSort={handleSort}
                align="right"
              >
                CMV Estimado
              </SortableTh>
              <SortableTh
                field="profit"
                currentSortField={sortField}
                currentSortDirection={sortDirection}
                onSort={handleSort}
                align="right"
              >
                Lucro Bruto Est.
              </SortableTh>
              <SortableTh
                field="margin"
                currentSortField={sortField}
                currentSortDirection={sortDirection}
                onSort={handleSort}
                align="right"
              >
                Margem Bruta Est.
              </SortableTh>
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
                    <td className="tp-col-product">
                      <div className="tp-product-cell">
                        <span className="tp-product-name" title={p.productName}>
                          {p.productName}
                        </span>
                        <div className="tp-product-meta">
                          {p.isOrphan ? (
                            <span className="tp-badge-orphan">
                              {`ID TagPlus: ${p.productSourceId} • Histórico`}
                            </span>
                          ) : p.sku ? (
                            <span className="tp-product-code">
                              {`Código: ${p.sku}`}
                            </span>
                          ) : null}
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
