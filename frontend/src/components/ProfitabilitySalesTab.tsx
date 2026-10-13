import { useState, useMemo, useEffect, useRef } from "react";
import {
  AlertCircle,
  RefreshCw,
  Search,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  DollarSign,
  Percent,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  FileText,
} from "lucide-react";
import {
  fetchProfitabilitySales,
  type CommercialChannel,
  type ProfitabilitySaleItem,
  type ProfitabilitySalesResult,
} from "../api/bi";
import {
  formatCurrency,
  formatNumber,
  formatChannelLabel,
  formatDateBr,
} from "../utils/formatters";
import {
  compareNumericNullsLast,
  compareStringNullsLast,
  type SortDirection,
} from "../utils/sortUtils";
import { SortableTh } from "./SortableTh";

const CHANNEL_OPTIONS: { label: string; value: CommercialChannel | null }[] = [
  { label: "Todos os canais", value: null },
  { label: formatChannelLabel("ATACADO"), value: "ATACADO" },
  { label: formatChannelLabel("VAREJO"), value: "VAREJO" },
  { label: formatChannelLabel("INDETERMINADO"), value: "INDETERMINADO" },
  { label: formatChannelLabel("CONFLITO"), value: "CONFLITO" },
];

export type SaleSortField =
  | "sale"
  | "date"
  | "customer"
  | "quantity"
  | "revenue"
  | "cogs"
  | "profit"
  | "margin";

interface ProfitabilitySalesTabProps {
  from: string;
  to: string;
  initialChannel?: CommercialChannel | null;
  initialData?: ProfitabilitySalesResult | null;
}

function formatAnchorLabel(anchorType: string, anchorSourceId: string): string {
  if (anchorType === "PEDIDO_VENDA" || anchorType === "PEDIDO") {
    return `Pedido #${anchorSourceId}`;
  }
  if (anchorType === "VENDA_SIMPLES") {
    return `Venda Simples #${anchorSourceId}`;
  }
  if (anchorType === "NFE") {
    return `NF-e #${anchorSourceId}`;
  }
  return `Negociação #${anchorSourceId}`;
}

function formatDocShortLabel(docType: string, sourceId: string): string {
  if (docType === "NFE") return `NF-e #${sourceId}`;
  if (docType === "PEDIDO_VENDA" || docType === "PEDIDO") return `Pedido #${sourceId}`;
  if (docType === "VENDA_SIMPLES") return `VS #${sourceId}`;
  return `#${sourceId}`;
}

function formatRealizationDate(first: string, last: string): string {
  const f = formatDateBr(first);
  const l = formatDateBr(last);
  if (f === l) return f;
  return `${f} → ${l}`;
}

export function ProfitabilitySalesTab({
  from,
  to,
  initialChannel = null,
  initialData = null,
}: ProfitabilitySalesTabProps) {
  // Server-side filter
  const [selectedChannel, setSelectedChannel] = useState<CommercialChannel | null>(initialChannel);

  // Client-side filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMarginFilter, setSelectedMarginFilter] = useState<string>("ALL");

  // Sorting & Pagination
  const [sortField, setSortField] = useState<SaleSortField>("profit");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Data fetching & In-memory cache
  const [data, setData] = useState<ProfitabilitySalesResult | null>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialKey = `${from}:${to}:${initialChannel ?? ""}`;
  const cacheRef = useRef<Map<string, ProfitabilitySalesResult>>(
    new Map(initialData ? [[initialKey, initialData]] : [])
  );
  const abortControllerRef = useRef<AbortController | null>(null);
  const isChannelOpenRef = useRef<HTMLDivElement>(null);
  const [isChannelOpen, setIsChannelOpen] = useState(false);

  const cacheKey = `${from}:${to}:${selectedChannel ?? ""}`;

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
      const res = await fetchProfitabilitySales({
        from,
        to,
        channel: selectedChannel,
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
          : "Falha ao carregar a rentabilidade de vendas.",
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

  useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedMarginFilter, selectedChannel]);

  // Client-side filtering
  const filteredSales = useMemo(() => {
    if (!data?.sales) return [];
    const term = searchTerm.trim().toLowerCase();

    return data.sales.filter((s) => {
      // 1. Text Search
      if (term) {
        const customerMatch = s.customerName
          ? s.customerName.toLowerCase().includes(term)
          : false;
        const idMatch = s.saleId.toLowerCase().includes(term);
        const anchorMatch = s.anchorSourceId.toLowerCase().includes(term);
        const docsMatch = s.realizingDocuments.some((d) =>
          d.sourceId.toLowerCase().includes(term),
        );
        if (!customerMatch && !idMatch && !anchorMatch && !docsMatch) return false;
      }

      // 2. Margin Tier Filter
      if (selectedMarginFilter !== "ALL") {
        if (selectedMarginFilter === "NEGATIVE") {
          if (s.estimatedGrossMarginPercent === null || s.estimatedGrossMarginPercent >= 0) return false;
        } else if (selectedMarginFilter === "ZERO_TO_20") {
          if (
            s.estimatedGrossMarginPercent === null ||
            s.estimatedGrossMarginPercent < 0 ||
            s.estimatedGrossMarginPercent >= 20
          )
            return false;
        } else if (selectedMarginFilter === "TWENTY_TO_40") {
          if (
            s.estimatedGrossMarginPercent === null ||
            s.estimatedGrossMarginPercent < 20 ||
            s.estimatedGrossMarginPercent >= 40
          )
            return false;
        } else if (selectedMarginFilter === "FORTY_PLUS") {
          if (s.estimatedGrossMarginPercent === null || s.estimatedGrossMarginPercent < 40) return false;
        } else if (selectedMarginFilter === "UNKNOWN") {
          if (s.estimatedGrossMarginPercent !== null) return false;
        }
      }

      return true;
    });
  }, [data, searchTerm, selectedMarginFilter]);

  // Client-side sorting (nulls always last)
  const sortedSales = useMemo(() => {
    return [...filteredSales].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "sale":
          cmp = a.anchorSourceId.localeCompare(b.anchorSourceId);
          break;
        case "date":
          cmp = a.firstRealizedDate.localeCompare(b.firstRealizedDate);
          break;
        case "customer":
          cmp = compareStringNullsLast(a.customerName, b.customerName, sortDirection);
          break;
        case "quantity":
          cmp = compareNumericNullsLast(a.realizedQuantity, b.realizedQuantity, sortDirection);
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
      }

      if (cmp !== 0) return cmp;
      return (
        (b.estimatedGrossProfit ?? -Infinity) - (a.estimatedGrossProfit ?? -Infinity) ||
        b.realizedRevenue - a.realizedRevenue ||
        a.saleId.localeCompare(b.saleId)
      );
    });
  }, [filteredSales, sortField, sortDirection]);

  // Pagination
  const totalRecords = sortedSales.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paginatedSales = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedSales.slice(start, start + pageSize);
  }, [sortedSales, currentPage, pageSize]);

  const handleSort = (field: SaleSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  if (error && !data) {
    return (
      <div className="tp-state-card tp-state-error" role="alert">
        <div className="tp-state-icon">
          <AlertCircle size={20} />
        </div>
        <div className="tp-state-content">
          <h3 className="tp-state-title">Erro ao carregar vendas de rentabilidade</h3>
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
      className="tp-profit-sales-container"
      role="tabpanel"
      id="panel-profitability-sales"
      aria-labelledby="tab-profitability-sales"
    >
      {/* 1. KPIs de Vendas */}
      {summary && (
        <section className="tp-kpi-section" aria-label="Indicadores de Vendas">
          <div className="tp-kpi-grid">
            {/* KPI 1 — Negociações realizadas */}
            <article className="tp-kpi-card tp-profit-kpi-card tp-kpi-highlight">
              <div className="tp-profit-kpi-header">
                <span className="tp-profit-kpi-label">Negociações realizadas</span>
                <span className="tp-kpi-icon-wrap tp-icon-cyan">
                  <ShoppingCart size={16} />
                </span>
              </div>
              <div className="tp-profit-kpi-value-wrap">
                <span className="tp-kpi-value">{formatNumber(summary.totalSales)}</span>
              </div>
              <div className="tp-profit-kpi-footer">
                <span className="tp-profit-kpi-subtext">
                  {summary.negativeMarginSalesCount > 0 ? (
                    <strong className="tp-color-magenta">
                      {`${summary.negativeMarginSalesCount} com margem negativa`}
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
                <span className="tp-profit-kpi-subtext">Margem ponderada das negociações</span>
              </div>
            </article>
          </div>
        </section>
      )}

      {/* 2. Barra de Filtros */}
      <div className="tp-card tp-profit-filter-bar">
        <div className="tp-profit-filter-row">
          {/* Busca textual */}
          <div className="tp-profit-search-wrap">
            <Search size={14} className="tp-search-icon" />
            <input
              type="text"
              placeholder="Buscar por cliente, pedido, documento realizador..."
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

          {/* Reset Filters */}
          {(searchTerm !== "" || selectedMarginFilter !== "ALL" || selectedChannel) && (
            <button
              type="button"
              onClick={() => {
                setSelectedChannel(null);
                setSearchTerm("");
                setSelectedMarginFilter("ALL");
              }}
              className="tp-btn-secondary tp-btn-compact"
              title="Limpar filtros"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* 3. Tabela de Vendas */}
      <div className="tp-card tp-profit-table-card">
        <div className="tp-table-responsive">
          <table className="tp-table tp-profit-table">
            <thead>
              <tr>
                <SortableTh
                  field="sale"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Negociação
                </SortableTh>
                <SortableTh
                  field="date"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Realização
                </SortableTh>
                <SortableTh
                  field="customer"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Cliente
                </SortableTh>
                <th className="tp-th-left">Canal</th>
                <SortableTh
                  field="quantity"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                >
                  Itens
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
              </tr>
            </thead>
            <tbody>
              {paginatedSales.length === 0 ? (
                <tr>
                  <td colSpan={9} className="tp-table-empty">
                    Nenhuma negociação encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                paginatedSales.map((s) => {
                  const isNegative =
                    s.estimatedGrossMarginPercent !== null &&
                    s.estimatedGrossMarginPercent < 0;

                  return (
                    <tr key={s.saleId} className={isNegative ? "tp-row-warning" : ""}>
                      {/* Negociação */}
                      <td>
                        <div className="tp-sale-cell">
                          <span className="tp-sale-anchor-title">
                            {formatAnchorLabel(s.anchorType, s.anchorSourceId)}
                          </span>
                          {s.realizingDocuments.length > 0 && (
                            <div className="tp-sale-docs-wrap">
                              {s.realizingDocuments.map((d) => (
                                <span
                                  key={d.sourceId}
                                  className="tp-doc-badge"
                                  title={`Documento realizador (${d.docType}) faturado em ${formatDateBr(d.realizedDate)}`}
                                >
                                  {formatDocShortLabel(d.docType, d.sourceId)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Realização */}
                      <td>
                        <div className="tp-realization-date-cell">
                          <span className="tp-font-mono">
                            {formatRealizationDate(s.firstRealizedDate, s.lastRealizedDate)}
                          </span>
                          {s.commercialDate && (
                            <span
                              className="tp-text-muted tp-text-xs"
                              title={`Data comercial de abertura do pedido: ${formatDateBr(s.commercialDate)}`}
                            >
                              Ped: {formatDateBr(s.commercialDate)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Cliente */}
                      <td>
                        <div className="tp-customer-cell">
                          <span
                            className="tp-customer-name"
                            title={s.customerName ?? "Cliente não identificado"}
                          >
                            {s.customerName || "Cliente não identificado"}
                          </span>
                        </div>
                      </td>

                      {/* Canal */}
                      <td>
                        <span
                          className={`tp-channel-badge ${
                            s.channel === "ATACADO"
                              ? "tp-channel-badge-atacado"
                              : s.channel === "VAREJO"
                                ? "tp-channel-badge-varejo"
                                : "tp-channel-badge-indeterminado"
                          }`}
                        >
                          {formatChannelLabel(s.channel)}
                        </span>
                      </td>

                      {/* Itens */}
                      <td className="tp-td-right">
                        <div className="tp-items-metric-cell">
                          <span className="tp-font-mono font-medium">
                            {formatNumber(s.realizedQuantity)} un.
                          </span>
                          <span className="tp-text-muted tp-text-xs">
                            {s.distinctProducts} {s.distinctProducts === 1 ? "SKU" : "SKUs"}
                          </span>
                        </div>
                      </td>

                      {/* Receita */}
                      <td className="tp-td-right tp-font-mono tp-font-semibold">
                        {formatCurrency(s.realizedRevenue)}
                      </td>

                      {/* CMV Est */}
                      <td className="tp-td-right tp-font-mono">
                        {s.estimatedCOGS !== null ? formatCurrency(s.estimatedCOGS) : "—"}
                      </td>

                      {/* Lucro Bruto */}
                      <td className="tp-td-right tp-font-mono tp-font-bold">
                        <span className={isNegative ? "tp-color-magenta" : "tp-color-teal"}>
                          {s.estimatedGrossProfit !== null
                            ? formatCurrency(s.estimatedGrossProfit)
                            : "—"}
                        </span>
                      </td>

                      {/* Margem */}
                      <td className="tp-td-right">
                        {s.estimatedGrossMarginPercent !== null ? (
                          <span
                            className={`tp-margin-badge ${
                              isNegative
                                ? "tp-margin-badge-negative"
                                : s.estimatedGrossMarginPercent < 20
                                  ? "tp-margin-badge-warning"
                                  : s.estimatedGrossMarginPercent < 40
                                    ? "tp-margin-badge-neutral"
                                    : "tp-margin-badge-positive"
                            }`}
                          >
                            {formatNumber(s.estimatedGrossMarginPercent)}%
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
            de <strong>{totalRecords}</strong> negociações
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
