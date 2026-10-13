import { useState, useMemo, useEffect, useRef } from "react";
import {
  AlertCircle,
  RefreshCw,
  Search,
  Users,
  TrendingDown,
  TrendingUp,
  DollarSign,
  Percent,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  CreditCard,
} from "lucide-react";
import {
  fetchProfitabilityCustomers,
  type CommercialChannel,
  type ProfitabilityCustomerItem,
  type ProfitabilityCustomersResult,
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

export type CustomerSortField =
  | "customer"
  | "sales"
  | "quantity"
  | "ticket"
  | "revenue"
  | "cogs"
  | "profit"
  | "margin"
  | "lastPurchase";

interface ProfitabilityCustomersTabProps {
  from: string;
  to: string;
  initialChannel?: CommercialChannel | null;
  initialData?: ProfitabilityCustomersResult | null;
}

function formatDocumentNumber(cpf: string | null, cnpj: string | null): string | null {
  if (cpf) {
    const d = cpf.replace(/\D/g, "");
    if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    return cpf;
  }
  if (cnpj) {
    const d = cnpj.replace(/\D/g, "");
    if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    return cnpj;
  }
  return null;
}

export function ProfitabilityCustomersTab({
  from,
  to,
  initialChannel = null,
  initialData = null,
}: ProfitabilityCustomersTabProps) {
  // Server-side filter
  const [selectedChannel, setSelectedChannel] = useState<CommercialChannel | null>(initialChannel);

  // Client-side filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMarginFilter, setSelectedMarginFilter] = useState<string>("ALL");
  const [selectedDocTypeFilter, setSelectedDocTypeFilter] = useState<string>("ALL");

  // Sorting & Pagination
  const [sortField, setSortField] = useState<CustomerSortField>("profit");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Data fetching & In-memory cache
  const [data, setData] = useState<ProfitabilityCustomersResult | null>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialKey = `${from}:${to}:${initialChannel ?? ""}`;
  const cacheRef = useRef<Map<string, ProfitabilityCustomersResult>>(
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
      const res = await fetchProfitabilityCustomers({
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
          : "Falha ao carregar a rentabilidade de clientes.",
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
  }, [searchTerm, selectedMarginFilter, selectedDocTypeFilter, selectedChannel]);

  // Client-side filtering
  const filteredCustomers = useMemo(() => {
    if (!data?.customers) return [];
    const term = searchTerm.trim().toLowerCase();

    return data.customers.filter((c) => {
      // 1. Text Search (name, tradeName, legalName, cpf, cnpj)
      if (term) {
        const nameMatch = c.customerName.toLowerCase().includes(term);
        const tradeMatch = c.tradeName ? c.tradeName.toLowerCase().includes(term) : false;
        const legalMatch = c.legalName ? c.legalName.toLowerCase().includes(term) : false;
        const cpfMatch = c.cpf ? c.cpf.replace(/\D/g, "").includes(term.replace(/\D/g, "")) : false;
        const cnpjMatch = c.cnpj ? c.cnpj.replace(/\D/g, "").includes(term.replace(/\D/g, "")) : false;
        if (!nameMatch && !tradeMatch && !legalMatch && !cpfMatch && !cnpjMatch) return false;
      }

      // 2. Margin Tier Filter
      if (selectedMarginFilter !== "ALL") {
        if (selectedMarginFilter === "NEGATIVE") {
          if (c.estimatedGrossMarginPercent === null || c.estimatedGrossMarginPercent >= 0) return false;
        } else if (selectedMarginFilter === "ZERO_TO_20") {
          if (
            c.estimatedGrossMarginPercent === null ||
            c.estimatedGrossMarginPercent < 0 ||
            c.estimatedGrossMarginPercent >= 20
          )
            return false;
        } else if (selectedMarginFilter === "TWENTY_TO_40") {
          if (
            c.estimatedGrossMarginPercent === null ||
            c.estimatedGrossMarginPercent < 20 ||
            c.estimatedGrossMarginPercent >= 40
          )
            return false;
        } else if (selectedMarginFilter === "FORTY_PLUS") {
          if (c.estimatedGrossMarginPercent === null || c.estimatedGrossMarginPercent < 40) return false;
        } else if (selectedMarginFilter === "UNKNOWN") {
          if (c.estimatedGrossMarginPercent !== null) return false;
        }
      }

      // 3. Document Type Filter
      if (selectedDocTypeFilter !== "ALL") {
        if (selectedDocTypeFilter === "CPF") {
          if (!c.cpf) return false;
        } else if (selectedDocTypeFilter === "CNPJ") {
          if (!c.cnpj) return false;
        } else if (selectedDocTypeFilter === "UNIDENTIFIED") {
          if (c.customerId !== null) return false;
        }
      }

      return true;
    });
  }, [data, searchTerm, selectedMarginFilter, selectedDocTypeFilter]);

  // Client-side sorting (nulls always last)
  const sortedCustomers = useMemo(() => {
    return [...filteredCustomers].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "customer":
          cmp = compareStringNullsLast(a.customerName, b.customerName, sortDirection);
          break;
        case "sales":
          cmp = compareNumericNullsLast(a.realizedSales, b.realizedSales, sortDirection);
          break;
        case "quantity":
          cmp = compareNumericNullsLast(a.realizedQuantity, b.realizedQuantity, sortDirection);
          break;
        case "ticket":
          cmp = compareNumericNullsLast(a.ticketAverage, b.ticketAverage, sortDirection);
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
        case "lastPurchase":
          cmp = compareStringNullsLast(a.lastPurchaseInPeriod, b.lastPurchaseInPeriod, sortDirection);
          break;
      }

      if (cmp !== 0) return cmp;
      return (
        (b.estimatedGrossProfit ?? -Infinity) - (a.estimatedGrossProfit ?? -Infinity) ||
        b.realizedRevenue - a.realizedRevenue ||
        a.customerName.localeCompare(b.customerName)
      );
    });
  }, [filteredCustomers, sortField, sortDirection]);

  // Pagination
  const totalRecords = sortedCustomers.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedCustomers.slice(start, start + pageSize);
  }, [sortedCustomers, currentPage, pageSize]);

  const handleSort = (field: CustomerSortField) => {
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
          <h3 className="tp-state-title">Erro ao carregar clientes de rentabilidade</h3>
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
      className="tp-profit-customers-container"
      role="tabpanel"
      id="panel-profitability-customers"
      aria-labelledby="tab-profitability-customers"
    >
      {/* 1. KPIs de Clientes */}
      {summary && (
        <section className="tp-kpi-section" aria-label="Indicadores de Clientes">
          <div className="tp-kpi-grid">
            {/* KPI 1 — Clientes compradores */}
            <article className="tp-kpi-card tp-profit-kpi-card tp-kpi-highlight">
              <div className="tp-profit-kpi-header">
                <span className="tp-profit-kpi-label">Clientes compradores</span>
                <span className="tp-kpi-icon-wrap tp-icon-cyan">
                  <Users size={16} />
                </span>
              </div>
              <div className="tp-profit-kpi-value-wrap">
                <span className="tp-kpi-value">{formatNumber(summary.totalCustomers)}</span>
              </div>
              <div className="tp-profit-kpi-footer">
                <span className="tp-profit-kpi-subtext">
                  Ticket médio: <strong>{formatCurrency(summary.averageTicket)}</strong>
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
                <span className="tp-profit-kpi-subtext">Margem ponderada da carteira de clientes</span>
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
              placeholder="Buscar por cliente, razão social, CPF ou CNPJ..."
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

          {/* Filtro Tipo de Documento (Client-side) */}
          <select
            value={selectedDocTypeFilter}
            onChange={(e) => setSelectedDocTypeFilter(e.target.value)}
            className="tp-select tp-select-compact"
            aria-label="Filtrar por Tipo de Documento"
          >
            <option value="ALL">Todos os Tipos</option>
            <option value="CPF">Pessoa Física (CPF)</option>
            <option value="CNPJ">Pessoa Jurídica (CNPJ)</option>
            <option value="UNIDENTIFIED">Não Identificado</option>
          </select>

          {/* Reset Filters */}
          {(searchTerm !== "" || selectedMarginFilter !== "ALL" || selectedDocTypeFilter !== "ALL" || selectedChannel) && (
            <button
              type="button"
              onClick={() => {
                setSelectedChannel(null);
                setSearchTerm("");
                setSelectedMarginFilter("ALL");
                setSelectedDocTypeFilter("ALL");
              }}
              className="tp-btn-secondary tp-btn-compact"
              title="Limpar filtros"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* 3. Tabela de Clientes */}
      <div className="tp-card tp-profit-table-card">
        <div className="tp-table-responsive">
          <table className="tp-table tp-profit-table">
            <thead>
              <tr>
                <SortableTh
                  field="customer"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Cliente
                </SortableTh>
                <th className="tp-th-left">Canal Predominante</th>
                <SortableTh
                  field="sales"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                >
                  Negociações
                </SortableTh>
                <SortableTh
                  field="quantity"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                >
                  Unidades
                </SortableTh>
                <SortableTh
                  field="ticket"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                >
                  Ticket Médio
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
                  field="lastPurchase"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                >
                  Última Compra
                </SortableTh>
              </tr>
            </thead>
            <tbody>
              {paginatedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="tp-table-empty">
                    Nenhum cliente encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                paginatedCustomers.map((c) => {
                  const isNegative =
                    c.estimatedGrossMarginPercent !== null &&
                    c.estimatedGrossMarginPercent < 0;
                  const docFormatted = formatDocumentNumber(c.cpf, c.cnpj);

                  return (
                    <tr
                      key={c.customerId ?? "__null_cust__"}
                      className={isNegative ? "tp-row-warning" : ""}
                    >
                      {/* Cliente */}
                      <td>
                        <div className="tp-customer-cell">
                          <span className="tp-customer-name" title={c.customerName}>
                            {c.customerName}
                          </span>
                          <div className="tp-customer-meta">
                            {docFormatted && (
                              <span className="tp-doc-number">{docFormatted}</span>
                            )}
                            {c.tradeName && c.tradeName !== c.customerName && (
                              <span className="tp-trade-name" title={c.tradeName}>
                                Fantasia: {c.tradeName}
                              </span>
                            )}
                            {c.customerId === null && (
                              <span className="tp-badge tp-badge-muted">
                                Não identificado
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Canal Predominante */}
                      <td>
                        <span
                          className={`tp-channel-badge ${
                            c.predominantChannel === "ATACADO"
                              ? "tp-channel-badge-atacado"
                              : c.predominantChannel === "VAREJO"
                                ? "tp-channel-badge-varejo"
                                : "tp-channel-badge-indeterminado"
                          }`}
                          title="Canal predominante no período (maior receita gerada)"
                        >
                          {formatChannelLabel(c.predominantChannel)}
                        </span>
                      </td>

                      {/* Negociações */}
                      <td className="tp-td-right tp-font-mono">
                        {formatNumber(c.realizedSales)}
                      </td>

                      {/* Unidades */}
                      <td className="tp-td-right tp-font-mono">
                        {formatNumber(c.realizedQuantity)}
                      </td>

                      {/* Ticket Médio */}
                      <td className="tp-td-right tp-font-mono">
                        {formatCurrency(c.ticketAverage)}
                      </td>

                      {/* Receita */}
                      <td className="tp-td-right tp-font-mono tp-font-semibold">
                        {formatCurrency(c.realizedRevenue)}
                      </td>

                      {/* CMV Est */}
                      <td className="tp-td-right tp-font-mono">
                        {c.estimatedCOGS !== null ? formatCurrency(c.estimatedCOGS) : "—"}
                      </td>

                      {/* Lucro Bruto */}
                      <td className="tp-td-right tp-font-mono tp-font-bold">
                        <span className={isNegative ? "tp-color-magenta" : "tp-color-teal"}>
                          {c.estimatedGrossProfit !== null
                            ? formatCurrency(c.estimatedGrossProfit)
                            : "—"}
                        </span>
                      </td>

                      {/* Margem */}
                      <td className="tp-td-right">
                        {c.estimatedGrossMarginPercent !== null ? (
                          <span
                            className={`tp-margin-badge ${
                              isNegative
                                ? "tp-margin-badge-negative"
                                : c.estimatedGrossMarginPercent < 20
                                  ? "tp-margin-badge-warning"
                                  : c.estimatedGrossMarginPercent < 40
                                    ? "tp-margin-badge-neutral"
                                    : "tp-margin-badge-positive"
                            }`}
                          >
                            {formatNumber(c.estimatedGrossMarginPercent)}%
                          </span>
                        ) : (
                          <span className="tp-text-muted">—</span>
                        )}
                      </td>

                      {/* Última Compra */}
                      <td className="tp-td-right tp-font-mono tp-text-xs">
                        {c.lastPurchaseInPeriod ? formatDateBr(c.lastPurchaseInPeriod) : "—"}
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
            de <strong>{totalRecords}</strong> clientes
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
