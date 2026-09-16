import { useState, useMemo, useEffect } from "react";
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
  CoverageBucket,
  InventoryOperationalFlag,
  InventoryProductItem,
} from "../api/bi";
import {
  formatCurrency,
  formatDateBr,
  formatNumber,
} from "../utils/formatters";
import { InventoryCategoryCombobox } from "./InventoryCategoryCombobox";

export type TableStatusFilter =
  | "ALL"
  | "DEMAND_WITHOUT_STOCK"
  | "LOW_ESTIMATED_COVERAGE"
  | "LONG_ESTIMATED_COVERAGE"
  | "NO_SALES_IN_WINDOW"
  | "NEGATIVE_STOCK"
  | "INACTIVE_WITH_STOCK"
  | "ACTIVE_WITHOUT_STOCK"
  | "SOLD_IN_WINDOW";

// Alias para compatibilidade reversa
export type TableFilterChip = TableStatusFilter;

export type TableSortField =
  | "capital"
  | "stock"
  | "quantity"
  | "revenue"
  | "coverage"
  | "daysWithoutSale";

export type TableSortDirection = "asc" | "desc";

interface InventoryProductsTableProps {
  products: InventoryProductItem[];
  statusFilter?: TableStatusFilter;
  onStatusFilterChange?: (filter: TableStatusFilter) => void;
  coverageBucket?: CoverageBucket | null;
  onCoverageBucketChange?: (bucket: CoverageBucket | null) => void;
  selectedCategory?: string;
  onCategoryChange?: (category: string) => void;
  onResetAllFilters?: () => void;
  // Compatibilidade com código/testes legados
  activeChip?: TableFilterChip;
  onChipChange?: (chip: TableFilterChip) => void;
}

const PAGE_SIZE = 15;

const CHIPS: { id: TableStatusFilter; label: string }[] = [
  { id: "ALL", label: "Todos" },
  { id: "DEMAND_WITHOUT_STOCK", label: "Demanda sem estoque" },
  { id: "LOW_ESTIMATED_COVERAGE", label: "Cobertura < 30d" },
  { id: "LONG_ESTIMATED_COVERAGE", label: "Cobertura > 90d" },
  { id: "NO_SALES_IN_WINDOW", label: "Sem saída" },
  { id: "NEGATIVE_STOCK", label: "Estoque negativo" },
  { id: "INACTIVE_WITH_STOCK", label: "Inativos com estoque" },
  { id: "ACTIVE_WITHOUT_STOCK", label: "Ativos sem estoque" },
  { id: "SOLD_IN_WINDOW", label: "Vendidos na janela" },
];

export function InventoryProductsTable({
  products,
  statusFilter: propStatusFilter,
  onStatusFilterChange,
  coverageBucket: propCoverageBucket = null,
  onCoverageBucketChange,
  selectedCategory: propCategory,
  onCategoryChange,
  onResetAllFilters,
  activeChip,
  onChipChange,
}: InventoryProductsTableProps) {
  // Gerenciamento de estado controlado vs local
  const currentStatusFilter = propStatusFilter ?? activeChip ?? "ALL";
  const currentCoverageBucket = propCoverageBucket ?? null;

  const [localCategory, setLocalCategory] = useState<string>("ALL");
  const currentCategory = propCategory ?? localCategory;

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortField, setSortField] = useState<TableSortField>("capital");
  const [sortDirection, setSortDirection] = useState<TableSortDirection>("desc");
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Lista canônica de categorias distintas a partir dos produtos
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.category) {
        set.add(p.category);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [products]);

  // Sempre reseta para a primeira página quando qualquer dimensão de filtro muda
  useEffect(() => {
    setCurrentPage(1);
  }, [currentStatusFilter, currentCoverageBucket, currentCategory, searchQuery]);

  const handleChipClick = (id: TableStatusFilter) => {
    if (id === "ALL") {
      // O chip "Todos" limpa statusFilter e coverageBucket, mas preserva categoria e busca
      if (onStatusFilterChange) {
        onStatusFilterChange("ALL");
      } else if (onChipChange) {
        onChipChange("ALL");
      }
      onCoverageBucketChange?.(null);
    } else {
      if (onStatusFilterChange) {
        onStatusFilterChange(id);
      } else if (onChipChange) {
        onChipChange(id);
      }
    }
    setCurrentPage(1);
  };

  const handleCategorySelect = (cat: string) => {
    if (onCategoryChange) {
      onCategoryChange(cat);
    } else {
      setLocalCategory(cat);
    }
    setCurrentPage(1);
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  };

  const handleResetAll = () => {
    if (onResetAllFilters) {
      onResetAllFilters();
    } else {
      if (onStatusFilterChange) onStatusFilterChange("ALL");
      if (onChipChange) onChipChange("ALL");
      onCoverageBucketChange?.(null);
      if (onCategoryChange) onCategoryChange("ALL");
      setLocalCategory("ALL");
    }
    setSearchQuery("");
    setCurrentPage(1);
  };

  // Alternar ordenação
  const handleSort = (field: TableSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
    setCurrentPage(1);
  };

  // Filtragem multi-dimensional estrita e inequívoca
  const filteredProducts = useMemo(() => {
    return products.filter((item) => {
      // 1. Filtro Operacional (Status)
      if (currentStatusFilter !== "ALL") {
        if (currentStatusFilter === "DEMAND_WITHOUT_STOCK") {
          if (!item.operationalFlags.includes("DEMAND_WITHOUT_STOCK")) return false;
        } else if (currentStatusFilter === "LOW_ESTIMATED_COVERAGE") {
          if (!item.operationalFlags.includes("LOW_ESTIMATED_COVERAGE")) return false;
        } else if (currentStatusFilter === "LONG_ESTIMATED_COVERAGE") {
          if (!item.operationalFlags.includes("LONG_ESTIMATED_COVERAGE")) return false;
        } else if (currentStatusFilter === "NO_SALES_IN_WINDOW") {
          if (!item.operationalFlags.includes("NO_SALES_IN_WINDOW")) return false;
        } else if (currentStatusFilter === "NEGATIVE_STOCK") {
          if (!item.operationalFlags.includes("NEGATIVE_STOCK") && item.currentStock >= 0) return false;
        } else if (currentStatusFilter === "INACTIVE_WITH_STOCK") {
          if (!item.operationalFlags.includes("INACTIVE_WITH_STOCK")) return false;
        } else if (currentStatusFilter === "ACTIVE_WITHOUT_STOCK") {
          if (!(item.active && item.currentStock <= 0)) return false;
        } else if (currentStatusFilter === "SOLD_IN_WINDOW") {
          if (item.quantityInWindow <= 0) return false;
        }
      }

      // 2. Filtro de Cobertura Estimada (product.coverageBucket enviado pelo backend)
      if (currentCoverageBucket !== null) {
        if (item.coverageBucket !== currentCoverageBucket) return false;
      }

      // 3. Filtro por Categoria (Match exato)
      if (currentCategory !== "ALL" && item.category !== currentCategory) {
        return false;
      }

      // 4. Filtro por Busca de Texto (código ou descrição)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const codeMatch = item.code.toLowerCase().includes(q);
        const descMatch = item.description.toLowerCase().includes(q);
        if (!codeMatch && !descMatch) return false;
      }

      return true;
    });
  }, [products, currentStatusFilter, currentCoverageBucket, currentCategory, searchQuery]);

  // Ordenação
  const sortedProducts = useMemo(() => {
    const list = [...filteredProducts];
    list.sort((a, b) => {
      let valA = 0;
      let valB = 0;

      switch (sortField) {
        case "capital":
          valA = a.stockCostValue;
          valB = b.stockCostValue;
          break;
        case "stock":
          valA = a.currentStock;
          valB = b.currentStock;
          break;
        case "quantity":
          valA = a.quantityInWindow;
          valB = b.quantityInWindow;
          break;
        case "revenue":
          valA = a.realizedRevenueInWindow;
          valB = b.realizedRevenueInWindow;
          break;
        case "coverage":
          valA = a.estimatedDaysOfStock ?? -1;
          valB = b.estimatedDaysOfStock ?? -1;
          break;
        case "daysWithoutSale":
          valA = a.daysSinceLastPhysicalSale ?? -1;
          valB = b.daysSinceLastPhysicalSale ?? -1;
          break;
      }

      if (valA === valB) {
        return a.description.localeCompare(b.description, "pt-BR");
      }

      return sortDirection === "asc" ? valA - valB : valB - valA;
    });

    return list;
  }, [filteredProducts, sortField, sortDirection]);

  // Paginação
  const totalPages = Math.max(1, Math.ceil(sortedProducts.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const startIndex = (safePage - 1) * PAGE_SIZE;
  const paginatedItems = sortedProducts.slice(startIndex, startIndex + PAGE_SIZE);

  // Renderizador de ícone de ordenação
  const renderSortIcon = (field: TableSortField) => {
    if (sortField !== field) {
      return <ArrowUpDown size={12} className="tp-th-sort-icon tp-muted" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp size={12} className="tp-th-sort-icon is-active" />
    ) : (
      <ArrowDown size={12} className="tp-th-sort-icon is-active" />
    );
  };

  // Renderiza badges operacionais humanos estritamente a partir de flags
  // Correção: produtos com active=false e estoque=0 NÃO recebem "Inativo com estoque"
  const renderStatusBadges = (flags: InventoryOperationalFlag[]) => {
    const badges: { text: string; className: string }[] = [];

    if (flags.includes("DEMAND_WITHOUT_STOCK")) {
      badges.push({ text: "Demanda sem estoque", className: "is-amber" });
    }
    if (flags.includes("NEGATIVE_STOCK")) {
      badges.push({ text: "Estoque negativo", className: "is-negative" });
    }
    if (flags.includes("NO_SALES_IN_WINDOW")) {
      badges.push({ text: "Sem saída", className: "is-rose" });
    }
    if (flags.includes("LOW_ESTIMATED_COVERAGE")) {
      badges.push({ text: "Cobertura < 30d", className: "is-amber" });
    }
    if (flags.includes("LONG_ESTIMATED_COVERAGE")) {
      badges.push({ text: "Cobertura > 90d", className: "is-blue" });
    }
    if (flags.includes("INACTIVE_WITH_STOCK")) {
      badges.push({ text: "Inativo com estoque", className: "is-inactive" });
    }

    if (badges.length === 0) {
      return <span className="tp-badge-neutral">—</span>;
    }

    return (
      <div className="tp-table-badges-wrap">
        {badges.map((b, idx) => (
          <span key={idx} className={`tp-badge-status ${b.className}`}>
            {b.text}
          </span>
        ))}
      </div>
    );
  };

  // Renderiza a cobertura estimada humanizada
  const renderCoverage = (item: InventoryProductItem) => {
    if (item.currentStock <= 0) {
      return <span className="tp-muted">—</span>;
    }
    if (item.quantityInWindow === 0) {
      return <span className="tp-badge-status is-rose">Sem saída</span>;
    }
    if (item.estimatedDaysOfStock !== null) {
      const days = Math.round(item.estimatedDaysOfStock);
      return (
        <span className={days < 30 ? "tp-val-amber" : ""}>
          {`${formatNumber(days)} dias`}
        </span>
      );
    }
    return <span className="tp-muted">—</span>;
  };

  // Labels humanizados para os filtros ativos
  const getCoverageLabel = (bucket: CoverageBucket) => {
    switch (bucket) {
      case "LT_15": return "< 15 dias";
      case "15_TO_30": return "15–30 dias";
      case "30_TO_45": return "30–45 dias";
      case "45_TO_90": return "45–90 dias";
      case "GT_90": return "> 90 dias";
    }
  };

  const getStatusLabel = (s: TableStatusFilter) => {
    const item = CHIPS.find((c) => c.id === s);
    return item ? item.label : s;
  };

  const hasAnyFilterActive =
    currentStatusFilter !== "ALL" ||
    currentCoverageBucket !== null ||
    currentCategory !== "ALL" ||
    searchQuery.trim() !== "";

  return (
    <section
      className="tp-card tp-inventory-table-card"
      id="tabela-estoque"
      aria-label="Saúde do estoque"
    >
      <div className="tp-card-header tp-inventory-table-header">
        <div>
          <div className="tp-title-with-badge">
            <h3 className="tp-card-title">Saúde do estoque</h3>
            <span className="tp-badge-count">
              {`${filteredProducts.length} ${
                filteredProducts.length === 1 ? "produto" : "produtos"
              }`}
            </span>
          </div>
          <p className="tp-card-subtitle">
            Posição atual cruzada com saída, cobertura e capital a custo
          </p>
        </div>

        {/* Controles: Busca e Combobox Pesquisável de Categoria */}
        <div className="tp-table-header-controls">
          <div className="tp-table-search-box">
            <Search size={14} className="tp-search-icon" />
            <input
              type="text"
              placeholder="Buscar SKU ou descrição..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="tp-table-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="tp-table-search-clear"
                onClick={() => handleSearchChange("")}
                title="Limpar busca"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="tp-table-category-filter">
            <InventoryCategoryCombobox
              categories={categories}
              selectedCategory={currentCategory}
              onSelectCategory={handleCategorySelect}
            />
          </div>
        </div>
      </div>

      {/* Faixa de Feedback de Filtros Ativos e Ação Limpar Filtros */}
      {hasAnyFilterActive && (
        <div className="tp-table-active-context-bar" aria-label="Filtros ativos">
          <div className="tp-active-tags-row">
            <span className="tp-active-context-title">Filtros ativos:</span>

            {/* Tag Categoria */}
            {currentCategory !== "ALL" && (
              <span className="tp-active-tag">
                <span>Categoria: <strong>{currentCategory}</strong></span>
                <button
                  type="button"
                  className="tp-active-tag-remove"
                  onClick={() => handleCategorySelect("ALL")}
                  title="Remover filtro de categoria"
                >
                  <X size={12} />
                </button>
              </span>
            )}

            {/* Tag Cobertura */}
            {currentCoverageBucket !== null && (
              <span className="tp-active-tag">
                <span>Cobertura: <strong>{getCoverageLabel(currentCoverageBucket)}</strong></span>
                <button
                  type="button"
                  className="tp-active-tag-remove"
                  onClick={() => onCoverageBucketChange?.(null)}
                  title="Remover filtro de cobertura"
                >
                  <X size={12} />
                </button>
              </span>
            )}

            {/* Tag Status Operacional */}
            {currentStatusFilter !== "ALL" && (
              <span className="tp-active-tag">
                <span>Status: <strong>{getStatusLabel(currentStatusFilter)}</strong></span>
                <button
                  type="button"
                  className="tp-active-tag-remove"
                  onClick={() => handleChipClick("ALL")}
                  title="Remover filtro de status"
                >
                  <X size={12} />
                </button>
              </span>
            )}

            {/* Tag Busca */}
            {searchQuery.trim() !== "" && (
              <span className="tp-active-tag">
                <span>Busca: "<strong>{searchQuery}</strong>"</span>
                <button
                  type="button"
                  className="tp-active-tag-remove"
                  onClick={() => handleSearchChange("")}
                  title="Limpar busca textual"
                >
                  <X size={12} />
                </button>
              </span>
            )}
          </div>

          <button
            type="button"
            className="tp-btn-clear-all-filters"
            onClick={handleResetAll}
            title="Limpar todos os filtros da tabela"
          >
            Limpar filtros
          </button>
        </div>
      )}

      {/* Chips de filtro operacional */}
      <div
        className="tp-table-chips-bar"
        role="tablist"
        aria-label="Filtros operacionais da tabela"
      >
        {CHIPS.map((chip) => {
          const isActive =
            chip.id === "ALL"
              ? currentStatusFilter === "ALL" && currentCoverageBucket === null
              : currentStatusFilter === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`tp-table-chip ${isActive ? "is-active" : ""}`}
              onClick={() => handleChipClick(chip.id)}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Tabela de Produtos */}
      {sortedProducts.length === 0 ? (
        <div className="tp-empty-message">
          Nenhum produto encontrado com os filtros selecionados.
        </div>
      ) : (
        <>
          <div className="tp-table-responsive">
            <table className="tp-table tp-inventory-table">
              <thead>
                <tr>
                  <th scope="col" className="tp-col-product">
                    PRODUTO
                  </th>
                  <th scope="col" className="tp-col-status">
                    STATUS
                  </th>
                  <th
                    scope="col"
                    className="tp-col-num tp-clickable"
                    onClick={() => handleSort("stock")}
                  >
                    <div className="tp-th-content">
                      <span>ESTOQUE</span>
                      {renderSortIcon("stock")}
                    </div>
                  </th>
                  <th
                    scope="col"
                    className="tp-col-num tp-clickable"
                    onClick={() => handleSort("capital")}
                  >
                    <div className="tp-th-content">
                      <span>CAPITAL</span>
                      {renderSortIcon("capital")}
                    </div>
                  </th>
                  <th
                    scope="col"
                    className="tp-col-num tp-clickable"
                    onClick={() => handleSort("quantity")}
                  >
                    <div className="tp-th-content">
                      <span>SAÍDA</span>
                      {renderSortIcon("quantity")}
                    </div>
                  </th>
                  <th
                    scope="col"
                    className="tp-col-num tp-clickable"
                    onClick={() => handleSort("revenue")}
                  >
                    <div className="tp-th-content">
                      <span>RECEITA</span>
                      {renderSortIcon("revenue")}
                    </div>
                  </th>
                  <th
                    scope="col"
                    className="tp-col-date tp-clickable"
                    onClick={() => handleSort("daysWithoutSale")}
                  >
                    <div className="tp-th-content">
                      <span>ÚLTIMA SAÍDA</span>
                      {renderSortIcon("daysWithoutSale")}
                    </div>
                  </th>
                  <th
                    scope="col"
                    className="tp-col-num tp-clickable"
                    onClick={() => handleSort("coverage")}
                  >
                    <div className="tp-th-content">
                      <span>COBERTURA</span>
                      {renderSortIcon("coverage")}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((item) => {
                  const isNegative = item.currentStock < 0;
                  return (
                    <tr
                      key={item.productId ?? item.sourceProductId}
                      className="tp-table-row"
                    >
                      {/* PRODUTO */}
                      <td className="tp-col-product">
                        <div className="tp-prod-cell">
                          <span className="tp-prod-desc" title={item.description}>
                            {item.description}
                          </span>
                          <div className="tp-prod-sub">
                            <span className="tp-prod-code">{item.code}</span>
                            <span className="tp-prod-sep">•</span>
                            <span className="tp-prod-cat">{item.category}</span>
                          </div>
                        </div>
                      </td>

                      {/* STATUS (corrigido: sem flag errônea em inativo com estoque 0) */}
                      <td className="tp-col-status">
                        {renderStatusBadges(item.operationalFlags)}
                      </td>

                      {/* ESTOQUE */}
                      <td className="tp-col-num">
                        <span
                          className={`tp-stock-val ${isNegative ? "is-negative-val" : ""}`}
                        >
                          {formatNumber(item.currentStock)}
                        </span>
                      </td>

                      {/* CAPITAL */}
                      <td className="tp-col-num">
                        <strong>{formatCurrency(item.stockCostValue)}</strong>
                      </td>

                      {/* SAÍDA */}
                      <td className="tp-col-num">
                        <span>{`${formatNumber(item.quantityInWindow)} un`}</span>
                      </td>

                      {/* RECEITA */}
                      <td className="tp-col-num">
                        <span>{formatCurrency(item.realizedRevenueInWindow)}</span>
                      </td>

                      {/* ÚLTIMA SAÍDA */}
                      <td className="tp-col-date">
                        {item.lastPhysicalSaleDate ? (
                          <div className="tp-last-sale-cell">
                            <span className="tp-last-sale-date">
                              {formatDateBr(item.lastPhysicalSaleDate)}
                            </span>
                            {item.daysSinceLastPhysicalSale !== null && (
                              <span className="tp-last-sale-days">
                                {`(${item.daysSinceLastPhysicalSale}d sem saída)`}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="tp-muted">Sem saída registrada</span>
                        )}
                      </td>

                      {/* COBERTURA */}
                      <td className="tp-col-num">{renderCoverage(item)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="tp-pagination-bar">
              <span className="tp-pagination-info">
                {`Página ${safePage} de ${totalPages} (${filteredProducts.length} itens)`}
              </span>
              <div className="tp-pagination-controls">
                <button
                  type="button"
                  className="tp-pagination-btn"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  aria-label="Página anterior"
                >
                  <ChevronLeft size={16} />
                  <span>Anterior</span>
                </button>
                <button
                  type="button"
                  className="tp-pagination-btn"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  aria-label="Próxima página"
                >
                  <span>Próxima</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
