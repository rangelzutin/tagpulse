import { useState, useMemo, useEffect } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import type {
  InventoryOperationalFlag,
  InventoryProductItem,
} from "../api/bi";
import {
  formatCurrency,
  formatDateBr,
  formatNumber,
} from "../utils/formatters";

export type TableFilterChip =
  | "ALL"
  | "DEMAND_WITHOUT_STOCK"
  | "LOW_ESTIMATED_COVERAGE"
  | "LONG_ESTIMATED_COVERAGE"
  | "NO_SALES_IN_WINDOW"
  | "NEGATIVE_STOCK"
  | "INACTIVE_WITH_STOCK";

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
  activeChip: TableFilterChip;
  onChipChange: (chip: TableFilterChip) => void;
}

const PAGE_SIZE = 15;

const CHIPS: { id: TableFilterChip; label: string }[] = [
  { id: "ALL", label: "Todos" },
  { id: "DEMAND_WITHOUT_STOCK", label: "Demanda sem estoque" },
  { id: "LOW_ESTIMATED_COVERAGE", label: "Cobertura < 30d" },
  { id: "LONG_ESTIMATED_COVERAGE", label: "Cobertura > 90d" },
  { id: "NO_SALES_IN_WINDOW", label: "Sem saída" },
  { id: "NEGATIVE_STOCK", label: "Estoque negativo" },
  { id: "INACTIVE_WITH_STOCK", label: "Inativos com estoque" },
];

export function InventoryProductsTable({
  products,
  activeChip,
  onChipChange,
}: InventoryProductsTableProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortField, setSortField] = useState<TableSortField>("capital");
  const [sortDirection, setSortDirection] = useState<TableSortDirection>("desc");
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Lista de categorias distintas disponíveis
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.category) {
        set.add(p.category);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [products]);

  // Resetar página quando os filtros mudam
  const handleChipChange = (chip: TableFilterChip) => {
    onChipChange(chip);
    setCurrentPage(1);
  };

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    setCurrentPage(1);
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
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

  // Filtragem
  const filteredProducts = useMemo(() => {
    return products.filter((item) => {
      // 1. Filtro por Chip
      if (activeChip !== "ALL") {
        if (activeChip === "DEMAND_WITHOUT_STOCK") {
          if (!item.operationalFlags.includes("DEMAND_WITHOUT_STOCK")) return false;
        } else if (activeChip === "LOW_ESTIMATED_COVERAGE") {
          if (!item.operationalFlags.includes("LOW_ESTIMATED_COVERAGE")) return false;
        } else if (activeChip === "LONG_ESTIMATED_COVERAGE") {
          if (!item.operationalFlags.includes("LONG_ESTIMATED_COVERAGE")) return false;
        } else if (activeChip === "NO_SALES_IN_WINDOW") {
          if (!item.operationalFlags.includes("NO_SALES_IN_WINDOW")) return false;
        } else if (activeChip === "NEGATIVE_STOCK") {
          if (!item.operationalFlags.includes("NEGATIVE_STOCK") && item.currentStock >= 0) return false;
        } else if (activeChip === "INACTIVE_WITH_STOCK") {
          if (!item.operationalFlags.includes("INACTIVE_WITH_STOCK")) return false;
        }
      }

      // 2. Filtro por Categoria
      if (selectedCategory !== "ALL" && item.category !== selectedCategory) {
        return false;
      }

      // 3. Filtro por Busca de Texto (código ou descrição)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const codeMatch = item.code.toLowerCase().includes(q);
        const descMatch = item.description.toLowerCase().includes(q);
        if (!codeMatch && !descMatch) return false;
      }

      return true;
    });
  }, [products, activeChip, selectedCategory, searchQuery]);

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

  // Renderiza badges operacionais humanos (excluindo STOCK_WITH_SALES)
  const renderStatusBadges = (flags: InventoryOperationalFlag[], isInactive: boolean) => {
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
    if (isInactive || flags.includes("INACTIVE_WITH_STOCK")) {
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

        {/* Controles: Busca e Filtro de Categoria */}
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
          </div>

          <div className="tp-table-category-filter">
            <select
              value={selectedCategory}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="tp-table-category-select"
              aria-label="Filtrar por categoria"
            >
              <option value="ALL">Todas as categorias ({categories.length})</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Chips de filtro operacional */}
      <div
        className="tp-table-chips-bar"
        role="tablist"
        aria-label="Filtros operacionais da tabela"
      >
        {CHIPS.map((chip) => {
          const isActive = activeChip === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`tp-table-chip ${isActive ? "is-active" : ""}`}
              onClick={() => handleChipChange(chip.id)}
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

                      {/* STATUS */}
                      <td className="tp-col-status">
                        {renderStatusBadges(item.operationalFlags, !item.active)}
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
