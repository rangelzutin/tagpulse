import { useState, useMemo, useEffect, useRef } from "react";
import {
  AlertCircle,
  RefreshCw,
  Search,
  Package,
  TrendingDown,
  TrendingUp,
  DollarSign,
  Percent,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Layers,
  Filter,
  X,
} from "lucide-react";
import {
  fetchProfitabilityProducts,
  type CommercialChannel,
  type CategoryTreeNode,
  type ProfitabilityProductItem,
  type ProfitabilityProductsResult,
  type ProfitabilityMarginTier,
  type AbcClass,
  type ShapeCommercialSize,
} from "../api/bi";
import { formatCurrency, formatNumber, formatChannelLabel } from "../utils/formatters";
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
  | "quantity"
  | "revenue"
  | "cogs"
  | "profit"
  | "margin"
  | "stock";

interface ProfitabilityProductsTabProps {
  from: string;
  to: string;
  categoryTree: CategoryTreeNode[];
  initialChannel?: CommercialChannel | null;
  initialCategorySourceId?: string | null;
  initialData?: ProfitabilityProductsResult | null;
}

export function ProfitabilityProductsTab({
  from,
  to,
  categoryTree,
  initialChannel = null,
  initialCategorySourceId = null,
  initialData = null,
}: ProfitabilityProductsTabProps) {
  // Server-side filters
  const [selectedChannel, setSelectedChannel] = useState<CommercialChannel | null>(initialChannel);
  const [selectedCategorySourceId, setSelectedCategorySourceId] = useState<string | null>(initialCategorySourceId);

  // Client-side filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCommercialLine, setSelectedCommercialLine] = useState<string>("ALL");
  const [selectedShapeSize, setSelectedShapeSize] = useState<string>("ALL");
  const [selectedMarginFilter, setSelectedMarginFilter] = useState<string>("ALL");
  const [selectedAbcClass, setSelectedAbcClass] = useState<string>("ALL");

  // Sorting & Pagination
  const [sortField, setSortField] = useState<ProductSortField>("profit");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Data fetching state & Cache
  const [data, setData] = useState<ProfitabilityProductsResult | null>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialKey = `${from}:${to}:${initialChannel ?? ""}:${initialCategorySourceId ?? ""}`;
  const cacheRef = useRef<Map<string, ProfitabilityProductsResult>>(
    new Map(initialData ? [[initialKey, initialData]] : [])
  );
  const abortControllerRef = useRef<AbortController | null>(null);
  const isChannelOpenRef = useRef<HTMLDivElement>(null);
  const [isChannelOpen, setIsChannelOpen] = useState(false);

  const cacheKey = `${from}:${to}:${selectedChannel ?? ""}:${selectedCategorySourceId ?? ""}`;

  const loadData = async (forceRefetch = false) => {
    if (!forceRefetch && cacheRef.current.has(cacheKey)) {
      setData(cacheRef.current.get(cacheKey)!);
      setError(null);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetchProfitabilityProducts({
        from,
        to,
        channel: selectedChannel,
        categorySourceId: selectedCategorySourceId,
        signal: controller.signal,
      });
      cacheRef.current.set(cacheKey, res);
      setData(res);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : "Falha ao carregar a rentabilidade de produtos.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [cacheKey]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        isChannelOpenRef.current &&
        !isChannelOpenRef.current.contains(event.target as Node)
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

  // Reset pagination on filters change
  useEffect(() => {
    setPage(1);
  }, [
    searchTerm,
    selectedCommercialLine,
    selectedShapeSize,
    selectedMarginFilter,
    selectedAbcClass,
    selectedChannel,
    selectedCategorySourceId,
  ]);

  // Unique options for Line and Shape filters
  const commercialLines = useMemo(() => {
    if (!data?.products) return [];
    const lines = new Set<string>();
    for (const p of data.products) {
      if (p.commercialLine && p.commercialLine !== "SEM LINHA") {
        lines.add(p.commercialLine);
      }
    }
    return Array.from(lines).sort();
  }, [data]);

  const shapeSizes = useMemo(() => {
    if (!data?.products) return [];
    const sizes = new Set<string>();
    for (const p of data.products) {
      if (p.shapeSize && p.shapeSize !== "UNCLASSIFIED") {
        sizes.add(p.shapeSize);
      }
    }
    return Array.from(sizes).sort();
  }, [data]);

  // Client-side filtering
  const filteredProducts = useMemo(() => {
    if (!data?.products) return [];
    const term = searchTerm.trim().toLowerCase();

    return data.products.filter((p) => {
      // 1. Text Search
      if (term) {
        const nameMatch = p.productName.toLowerCase().includes(term);
        const skuMatch = p.sku ? p.sku.toLowerCase().includes(term) : false;
        const idMatch = p.productSourceId.toLowerCase().includes(term);
        const catMatch = p.category ? p.category.toLowerCase().includes(term) : false;
        if (!nameMatch && !skuMatch && !idMatch && !catMatch) return false;
      }

      // 2. Commercial Line
      if (selectedCommercialLine !== "ALL") {
        if (selectedCommercialLine === "SEM LINHA") {
          if (p.commercialLine && p.commercialLine !== "SEM LINHA") return false;
        } else {
          if (p.commercialLine !== selectedCommercialLine) return false;
        }
      }

      // 3. Shape Size
      if (selectedShapeSize !== "ALL") {
        if (p.shapeSize !== selectedShapeSize) return false;
      }

      // 4. Margin Tier Filter
      if (selectedMarginFilter !== "ALL") {
        if (selectedMarginFilter === "NEGATIVE") {
          if (p.estimatedGrossMarginPercent === null || p.estimatedGrossMarginPercent >= 0) return false;
        } else if (selectedMarginFilter === "ZERO_TO_20") {
          if (
            p.estimatedGrossMarginPercent === null ||
            p.estimatedGrossMarginPercent < 0 ||
            p.estimatedGrossMarginPercent >= 20
          )
            return false;
        } else if (selectedMarginFilter === "TWENTY_TO_40") {
          if (
            p.estimatedGrossMarginPercent === null ||
            p.estimatedGrossMarginPercent < 20 ||
            p.estimatedGrossMarginPercent >= 40
          )
            return false;
        } else if (selectedMarginFilter === "FORTY_PLUS") {
          if (p.estimatedGrossMarginPercent === null || p.estimatedGrossMarginPercent < 40) return false;
        } else if (selectedMarginFilter === "UNKNOWN") {
          if (p.estimatedGrossMarginPercent !== null) return false;
        }
      }

      // 5. ABC Class
      if (selectedAbcClass !== "ALL") {
        if (p.abcClass !== selectedAbcClass) return false;
      }

      return true;
    });
  }, [
    data,
    searchTerm,
    selectedCommercialLine,
    selectedShapeSize,
    selectedMarginFilter,
    selectedAbcClass,
  ]);

  // Client-side sorting (Nulls always last)
  const sortedProducts = useMemo(() => {
    return [...filteredProducts].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = compareStringNullsLast(a.productName, b.productName, sortDirection);
          break;
        case "quantity":
          cmp = compareNumericNullsLast(a.physicalQuantity, b.physicalQuantity, sortDirection);
          break;
        case "revenue":
          cmp = compareNumericNullsLast(a.realizedRevenue, b.realizedRevenue, sortDirection);
          break;
        case "cogs":
          cmp = compareNumericNullsLast(a.estimatedCOGS, b.estimatedCOGS, sortDirection);
          break;
        case "profit":
          cmp = compareNumericNullsLast(a.estimatedGrossProfit, b.estimatedGrossProfit, sortDirection);
          break;
        case "margin":
          cmp = compareNumericNullsLast(
            a.estimatedGrossMarginPercent,
            b.estimatedGrossMarginPercent,
            sortDirection,
          );
          break;
        case "stock":
          cmp = compareNumericNullsLast(a.stockQuantity, b.stockQuantity, sortDirection);
          break;
      }

      if (cmp !== 0) return cmp;
      return (
        (b.estimatedGrossProfit ?? -Infinity) - (a.estimatedGrossProfit ?? -Infinity) ||
        b.realizedRevenue - a.realizedRevenue ||
        a.productSourceId.localeCompare(b.productSourceId)
      );
    });
  }, [filteredProducts, sortField, sortDirection]);

  // Pagination
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
  };

  const handleResetClientFilters = () => {
    setSearchTerm("");
    setSelectedCommercialLine("ALL");
    setSelectedShapeSize("ALL");
    setSelectedMarginFilter("ALL");
    setSelectedAbcClass("ALL");
  };

  const hasActiveClientFilters =
    searchTerm !== "" ||
    selectedCommercialLine !== "ALL" ||
    selectedShapeSize !== "ALL" ||
    selectedMarginFilter !== "ALL" ||
    selectedAbcClass !== "ALL";

  if (error && !data) {
    return (
      <div className="tp-state-card tp-state-error" role="alert">
        <div className="tp-state-icon">
          <AlertCircle size={20} />
        </div>
        <div className="tp-state-content">
          <h3 className="tp-state-title">Erro ao carregar produtos de rentabilidade</h3>
          <p className="tp-state-message">{error}</p>
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={isLoading}
            className="tp-btn-retry"
          >
            <RefreshCw size={13} />
            <span>Tentar novamente</span>
          </button>
        </div>
      </div>
    );
  }

  if (isLoading && !data) {
    return (
      <div className="tp-section-skeleton">
        <div className="tp-kpi-grid">
          {[1, 2, 3, 4].map((idx) => (
            <div key={idx} className="tp-kpi-card tp-skeleton-card">
              <div className="tp-skeleton-line tp-skeleton-short" />
              <div className="tp-skeleton-line tp-skeleton-long" />
            </div>
          ))}
        </div>
        <div className="tp-card tp-skeleton-card" style={{ height: 350 }}>
          <div className="tp-skeleton-line tp-skeleton-short" />
          <div className="tp-skeleton-line tp-skeleton-chart-body" />
        </div>
      </div>
    );
  }

  const summary = data?.summary;
  const isPositiveMargin =
    summary?.estimatedGrossMarginPercent !== null &&
    summary?.estimatedGrossMarginPercent !== undefined &&
    summary.estimatedGrossMarginPercent >= 0;

  return (
    <div
      className="tp-profit-products-container"
      role="tabpanel"
      id="panel-profitability-products"
      aria-labelledby="tab-profitability-products"
    >
      {/* 1. KPIs de Produtos */}
      {summary && (
        <section className="tp-kpi-section" aria-label="Indicadores de Produtos">
          <div className="tp-kpi-grid">
            {/* KPI 1 — SKUs vendidos */}
            <article className="tp-kpi-card tp-profit-kpi-card tp-kpi-highlight">
              <div className="tp-profit-kpi-header">
                <span className="tp-profit-kpi-label">SKUs vendidos</span>
                <span className="tp-kpi-icon-wrap tp-icon-cyan">
                  <Package size={16} />
                </span>
              </div>
              <div className="tp-profit-kpi-value-wrap">
                <span className="tp-kpi-value">{formatNumber(summary.distinctProductsSold)}</span>
              </div>
              <div className="tp-profit-kpi-footer">
                <span className="tp-profit-kpi-subtext">
                  {summary.negativeMarginCount > 0 ? (
                    <strong className="tp-color-magenta">
                      {`${summary.negativeMarginCount} com margem negativa`}
                    </strong>
                  ) : (
                    "0 com margem negativa"
                  )}
                </span>
              </div>
            </article>

            {/* KPI 2 — Receita realizada */}
            <article className="tp-kpi-card tp-profit-kpi-card">
              <div className="tp-profit-kpi-header">
                <span className="tp-profit-kpi-label">Receita realizada</span>
                <span className="tp-kpi-icon-wrap tp-icon-blue">
                  <DollarSign size={16} />
                </span>
              </div>
              <div className="tp-profit-kpi-value-wrap">
                <span className="tp-kpi-value">{formatCurrency(summary.realizedRevenue)}</span>
              </div>
              <div className="tp-profit-kpi-footer">
                <span className="tp-profit-kpi-subtext">
                  Cobertura de custo atual:{" "}
                  <strong>
                    {summary.costCoveragePercent !== null
                      ? `${formatNumber(summary.costCoveragePercent)}%`
                      : "—"}
                  </strong>
                </span>
              </div>
            </article>

            {/* KPI 3 — Lucro bruto estimado ao custo atual */}
            <article className="tp-kpi-card tp-profit-kpi-card">
              <div className="tp-profit-kpi-header">
                <span className="tp-profit-kpi-label">Lucro bruto estimado ao custo atual</span>
                <span className="tp-kpi-icon-wrap tp-icon-teal">
                  <DollarSign size={16} />
                </span>
              </div>
              <div className="tp-profit-kpi-value-wrap">
                <span className="tp-kpi-value">
                  {summary.estimatedGrossProfit !== null
                    ? formatCurrency(summary.estimatedGrossProfit)
                    : "—"}
                </span>
              </div>
              <div className="tp-profit-kpi-footer">
                <span className="tp-profit-kpi-subtext">
                  CMV estimado:{" "}
                  <strong>
                    {summary.estimatedCOGS !== null
                      ? formatCurrency(summary.estimatedCOGS)
                      : "—"}
                  </strong>
                </span>
              </div>
            </article>

            {/* KPI 4 — Margem bruta estimada ao custo atual */}
            <article className="tp-kpi-card tp-profit-kpi-card">
              <div className="tp-profit-kpi-header">
                <span className="tp-profit-kpi-label">Margem bruta estimada ao custo atual</span>
                <span
                  className={`tp-kpi-icon-wrap ${
                    isPositiveMargin ? "tp-icon-teal" : "tp-icon-magenta"
                  }`}
                >
                  {isPositiveMargin ? <TrendingUp size={16} /> : <Percent size={16} />}
                </span>
              </div>
              <div className="tp-profit-kpi-value-wrap">
                <span
                  className={`tp-kpi-value ${
                    summary.estimatedGrossMarginPercent !== null &&
                    summary.estimatedGrossMarginPercent < 0
                      ? "tp-value-negative"
                      : ""
                  }`}
                >
                  {summary.estimatedGrossMarginPercent !== null
                    ? `${formatNumber(summary.estimatedGrossMarginPercent)}%`
                    : "—"}
                </span>
              </div>
              <div className="tp-profit-kpi-footer">
                <span className="tp-profit-kpi-subtext">Margem ponderada dos produtos vendidos</span>
              </div>
            </article>
          </div>
        </section>
      )}

      {/* 2. Barra de Filtros (Server-side + Client-side) */}
      <div className="tp-card tp-profit-filter-bar">
        <div className="tp-profit-filter-row">
          {/* Busca textual */}
          <div className="tp-profit-search-wrap">
            <Search size={14} className="tp-search-icon" />
            <input
              type="text"
              placeholder="Buscar por nome, SKU, ID ou categoria..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="tp-input-search"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="tp-search-clear-btn"
                title="Limpar busca"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Filtro Canal (Server-side) */}
          <div className="tp-channel-filter-dropdown" ref={isChannelOpenRef}>
            <button
              type="button"
              className={`tp-channel-filter-btn ${selectedChannel ? "is-filtered" : ""}`}
              onClick={() => setIsChannelOpen((prev) => !prev)}
              aria-expanded={isChannelOpen}
            >
              <span>{selectedChannel ? formatChannelLabel(selectedChannel) : "Todos os canais"}</span>
              <ChevronDown size={14} />
            </button>
            {isChannelOpen && (
              <ul className="tp-channel-filter-menu" role="menu">
                {CHANNEL_OPTIONS.map((opt) => (
                  <li
                    key={opt.value ?? "all"}
                    role="menuitem"
                    className={`tp-channel-menu-item ${selectedChannel === opt.value ? "is-active" : ""}`}
                    onClick={() => {
                      setSelectedChannel(opt.value);
                      setIsChannelOpen(false);
                    }}
                  >
                    <span>{opt.label}</span>
                    {selectedChannel === opt.value && <Check size={14} />}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Filtro Categoria (Server-side) */}
          <InventoryCategoryTreeSelector
            categories={categoryTree}
            selectedCategorySourceId={selectedCategorySourceId}
            onSelectCategorySourceId={setSelectedCategorySourceId}
          />

          {/* Filtro Linha Comercial (Client-side) */}
          {commercialLines.length > 0 && (
            <select
              value={selectedCommercialLine}
              onChange={(e) => setSelectedCommercialLine(e.target.value)}
              className="tp-select tp-select-compact"
              aria-label="Filtrar por Linha Comercial"
            >
              <option value="ALL">Todas as Linhas</option>
              {commercialLines.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          )}

          {/* Filtro Shape Size (Client-side) */}
          {shapeSizes.length > 0 && (
            <select
              value={selectedShapeSize}
              onChange={(e) => setSelectedShapeSize(e.target.value)}
              className="tp-select tp-select-compact"
              aria-label="Filtrar por Tamanho de Shape"
            >
              <option value="ALL">Todos os Shapes</option>
              {shapeSizes.map((s) => (
                <option key={s} value={s}>
                  Shape {s}"
                </option>
              ))}
            </select>
          )}

          {/* Filtro Faixa de Margem (Client-side) */}
          <select
            value={selectedMarginFilter}
            onChange={(e) => setSelectedMarginFilter(e.target.value)}
            className="tp-select tp-select-compact"
            aria-label="Filtrar por Faixa de Margem"
          >
            <option value="ALL">Todas as Faixas</option>
            <option value="NEGATIVE">Margem Negativa (&lt; 0%)</option>
            <option value="ZERO_TO_20">0% a 20%</option>
            <option value="TWENTY_TO_40">20% a 40%</option>
            <option value="FORTY_PLUS">40%+</option>
            <option value="UNKNOWN">Sem Margem Calculável</option>
          </select>

          {/* Filtro Curva ABC (Client-side) */}
          <select
            value={selectedAbcClass}
            onChange={(e) => setSelectedAbcClass(e.target.value)}
            className="tp-select tp-select-compact"
            aria-label="Filtrar por Curva ABC"
          >
            <option value="ALL">Curva ABC (Todas)</option>
            <option value="A">Classe A</option>
            <option value="B">Classe B</option>
            <option value="C">Classe C</option>
          </select>

          {/* Reset Filters */}
          {(hasActiveClientFilters || selectedChannel || selectedCategorySourceId) && (
            <button
              type="button"
              onClick={() => {
                setSelectedChannel(null);
                setSelectedCategorySourceId(null);
                handleResetClientFilters();
              }}
              className="tp-btn-secondary tp-btn-compact"
              title="Limpar todos os filtros"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* 3. Tabela de Produtos */}
      <div className="tp-card tp-profit-table-card">
        <div className="tp-table-responsive">
          <table className="tp-table tp-profit-table">
            <thead>
              <tr>
                <SortableTh
                  field="name"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Produto
                </SortableTh>
                <th className="tp-th-left">Linha / Categoria</th>
                <SortableTh
                  field="quantity"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                >
                  Qtd.
                </SortableTh>
                <SortableTh
                  field="revenue"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                >
                  Receita
                </SortableTh>
                <SortableTh
                  field="cogs"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                >
                  CMV Est.
                </SortableTh>
                <SortableTh
                  field="profit"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                >
                  Lucro Bruto
                </SortableTh>
                <SortableTh
                  field="margin"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                >
                  Margem
                </SortableTh>
                <SortableTh
                  field="stock"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                >
                  Estoque
                </SortableTh>
                <th className="tp-th-center">ABC</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProducts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="tp-table-empty">
                    Nenhum produto encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                paginatedProducts.map((p) => {
                  const isNegative =
                    p.estimatedGrossMarginPercent !== null &&
                    p.estimatedGrossMarginPercent < 0;

                  return (
                    <tr
                      key={p.productSourceId}
                      className={isNegative ? "tp-row-warning" : ""}
                    >
                      {/* Produto & SKU */}
                      <td>
                        <div className="tp-product-cell">
                          <span className="tp-product-cell-name" title={p.productName}>
                            {p.productName}
                          </span>
                          <div className="tp-product-cell-meta">
                            {p.sku ? (
                              <span className="tp-sku-tag">SKU: {p.sku}</span>
                            ) : (
                              <span className="tp-sku-tag tp-text-muted">ID: {p.productSourceId}</span>
                            )}
                            {p.isOrphan && (
                              <span
                                className="tp-badge tp-badge-muted"
                                title="Produto descontinuado ausente do catálogo ERP atual"
                              >
                                Histórico
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Linha / Categoria */}
                      <td>
                        <div className="tp-product-line-cell">
                          <span className="tp-commercial-line-badge">
                            {p.commercialLine || "SEM LINHA"}
                          </span>
                          <span className="tp-category-subtext">
                            {p.category || "Sem categoria"}
                            {p.shapeSize && p.shapeSize !== "UNCLASSIFIED" ? ` (${p.shapeSize}")` : ""}
                          </span>
                        </div>
                      </td>

                      {/* Qtd */}
                      <td className="tp-td-right tp-font-mono">
                        {formatNumber(p.physicalQuantity)}
                      </td>

                      {/* Receita */}
                      <td className="tp-td-right tp-font-mono tp-font-semibold">
                        {formatCurrency(p.realizedRevenue)}
                      </td>

                      {/* CMV Est */}
                      <td className="tp-td-right tp-font-mono">
                        {p.estimatedCOGS !== null ? formatCurrency(p.estimatedCOGS) : "—"}
                      </td>

                      {/* Lucro Bruto */}
                      <td className="tp-td-right tp-font-mono tp-font-bold">
                        <span className={isNegative ? "tp-color-magenta" : "tp-color-teal"}>
                          {p.estimatedGrossProfit !== null
                            ? formatCurrency(p.estimatedGrossProfit)
                            : "—"}
                        </span>
                      </td>

                      {/* Margem */}
                      <td className="tp-td-right">
                        {p.estimatedGrossMarginPercent !== null ? (
                          <span
                            className={`tp-margin-badge ${
                              isNegative
                                ? "tp-margin-badge-negative"
                                : p.estimatedGrossMarginPercent < 20
                                  ? "tp-margin-badge-warning"
                                  : p.estimatedGrossMarginPercent < 40
                                    ? "tp-margin-badge-neutral"
                                    : "tp-margin-badge-positive"
                            }`}
                          >
                            {formatNumber(p.estimatedGrossMarginPercent)}%
                          </span>
                        ) : (
                          <span className="tp-text-muted">—</span>
                        )}
                      </td>

                      {/* Estoque */}
                      <td className="tp-td-right tp-font-mono">
                        {p.stockQuantity !== null && p.stockQuantity !== undefined
                          ? formatNumber(p.stockQuantity)
                          : "—"}
                      </td>

                      {/* Curva ABC */}
                      <td className="tp-td-center">
                        {p.abcClass ? (
                          <span className={`tp-abc-badge tp-abc-${p.abcClass.toLowerCase()}`}>
                            {p.abcClass}
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

        {/* 4. Paginação */}
        <div className="tp-table-pagination">
          <div className="tp-pagination-info">
            Exibindo{" "}
            <strong>
              {totalRecords > 0 ? (currentPage - 1) * pageSize + 1 : 0}
            </strong>{" "}
            a{" "}
            <strong>
              {Math.min(currentPage * pageSize, totalRecords)}
            </strong>{" "}
            de <strong>{totalRecords}</strong> produtos
          </div>

          <div className="tp-pagination-controls">
            <label className="tp-page-size-label">
              <span>Linhas por página:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="tp-page-size-select"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>

            <div className="tp-page-buttons">
              <button
                type="button"
                className="tp-page-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                aria-label="Página anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="tp-page-current">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                className="tp-page-btn"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                aria-label="Próxima página"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
