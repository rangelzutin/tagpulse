import { useEffect, useState, useTransition } from "react";
import {
  AlertCircle,
  ArrowUpDown,
  Calendar,
  ChevronRight,
  Clock,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";
import {
  fetchCustomerSegment,
  type CustomerSegmentItem,
  type CustomerSegmentResult,
  type CustomerSegmentSort,
  type CustomerSegmentType,
} from "../api/bi";
import {
  formatCpfCnpj,
  formatCurrency,
  formatCustomerName,
  formatDateBr,
  formatNumber,
  formatPercent,
} from "../utils/formatters";

export interface RateContextData {
  rate: number;
  numerator: number;
  denominator: number;
  label: string;
}

interface CustomerSegmentViewProps {
  segment: CustomerSegmentType;
  from: string;
  to: string;
  rateContext?: RateContextData | null;
  onSelectCustomer: (customerId: string) => void;
}

const SEGMENT_LABELS: Record<CustomerSegmentType, string> = {
  buyers: "Clientes Compradores",
  new: "Clientes Novos",
  returning: "Clientes Recorrentes",
  historical: "Clientes Históricos",
  single: "Compra Única",
  repeat: "Clientes Recorrentes",
  risk: "Clientes em Risco",
  inactive: "Clientes Inativos",
};

export function CustomerSegmentView({
  segment,
  from,
  to,
  rateContext,
  onSelectCustomer,
}: CustomerSegmentViewProps) {
  const [data, setData] = useState<CustomerSegmentResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<CustomerSegmentSort>("revenue_desc");
  const [page, setPage] = useState(1);
  const [, startTransition] = useTransition();

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      startTransition(() => {
        setDebouncedSearch(searchInput.trim());
        setPage(1);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Reset page when segment or sort changes
  useEffect(() => {
    setPage(1);
  }, [segment, sort]);

  const loadSegment = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchCustomerSegment({
        from,
        to,
        segment,
        page,
        pageSize: 20,
        search: debouncedSearch || undefined,
        sort,
      });
      setData(res);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar os clientes do segmento.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSegment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment, from, to, page, debouncedSearch, sort]);

  const segmentTitle = SEGMENT_LABELS[segment];

  return (
    <div className="tp-segment-view">
      {/* Header */}
      <header className="tp-drawer-view-header">
        <div className="tp-drawer-header-meta">
          <div className="tp-drawer-segment-badge">
            <Users size={12} />
            <span>Segmento Analítico</span>
          </div>
          <h2 className="tp-drawer-view-title">{segmentTitle}</h2>
          {data && (
            <p className="tp-drawer-view-subtitle">
              <strong className="tp-strong-cyan">
                {formatNumber(data.summary.segmentCustomerCount)}
              </strong>{" "}
              {data.summary.segmentCustomerCount === 1 ? "cliente" : "clientes"}
              {segment === "risk" || segment === "inactive" ? (
                <>
                  {" • "}
                  <span>
                    {segment === "risk"
                      ? "última compra realizada entre 91 e 365 dias (3 a 12 meses)"
                      : "última compra realizada há mais de 365 dias (> 1 ano)"}
                  </span>
                </>
              ) : (
                <>
                  {" • "}
                  <span>
                    {formatCurrency(data.summary.segmentTotalRevenueInPeriod)} em
                    faturamento no período
                  </span>
                </>
              )}
            </p>
          )}
        </div>

        {/* Rate context banner when opened from recurrence/repurchase rate */}
        {rateContext && (
          <div className="tp-rate-context-banner" role="status">
            <div className="tp-rate-context-badge">
              <strong>{rateContext.label}:</strong>{" "}
              <span>{formatPercent(rateContext.rate)}</span>
            </div>
            <span className="tp-rate-context-detail">
              {formatNumber(rateContext.numerator)} de{" "}
              {formatNumber(rateContext.denominator)}{" "}
              {segment === "repeat"
                ? "clientes históricos"
                : "clientes compradores"}
            </span>
          </div>
        )}
      </header>

      {/* Filter & Controls Toolbar */}
      <div className="tp-segment-toolbar">
        <div className="tp-search-input-wrap">
          <Search size={14} className="tp-search-icon" />
          <input
            type="text"
            className="tp-input-search"
            placeholder="Buscar por nome, código, CPF ou CNPJ..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Buscar clientes"
          />
          {searchInput && (
            <button
              type="button"
              className="tp-search-clear-btn"
              onClick={() => setSearchInput("")}
              aria-label="Limpar busca"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="tp-sort-select-wrap">
          <ArrowUpDown size={13} className="tp-sort-icon" />
          <select
            className="tp-select-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as CustomerSegmentSort)}
            aria-label="Ordenar clientes"
          >
            <option value="revenue_desc">Maior faturamento</option>
            <option value="purchases_desc">Mais compras</option>
            <option value="last_purchase_desc">Compra mais recente</option>
            <option value="name_asc">Nome (A–Z)</option>
          </select>
        </div>
      </div>

      {/* Content Area */}
      <div className="tp-segment-content">
        {isLoading && (
          <div className="tp-segment-skeleton-list" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="tp-segment-skeleton-row">
                <div className="tp-skeleton-line tp-skeleton-w-60" />
                <div className="tp-skeleton-line tp-skeleton-w-30" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && error && (
          <div className="tp-segment-error-box" role="alert">
            <AlertCircle size={18} className="tp-error-icon" />
            <div className="tp-error-content">
              <p className="tp-error-title">Erro ao carregar segmento</p>
              <p className="tp-error-desc">{error}</p>
            </div>
            <button
              type="button"
              className="tp-btn-secondary tp-btn-sm"
              onClick={loadSegment}
            >
              <RefreshCw size={12} />
              Tentar novamente
            </button>
          </div>
        )}

        {!isLoading && !error && data && data.customers.length === 0 && (
          <div className="tp-segment-empty-box">
            <Users size={28} className="tp-empty-icon" />
            <p className="tp-empty-title">Nenhum cliente encontrado</p>
            <p className="tp-empty-desc">
              {debouncedSearch
                ? `Nenhum cliente corresponde ao termo "${debouncedSearch}".`
                : "Não há clientes neste segmento no período selecionado."}
            </p>
            {debouncedSearch && (
              <button
                type="button"
                className="tp-btn-secondary tp-btn-sm"
                onClick={() => setSearchInput("")}
              >
                Limpar filtro de busca
              </button>
            )}
          </div>
        )}

        {!isLoading && !error && data && data.customers.length > 0 && (
          <div className="tp-segment-list-wrap">
            <ul className="tp-segment-customer-list" role="list">
              {data.customers.map((cust: CustomerSegmentItem) => {
                const formattedName = formatCustomerName(cust.displayName);
                const formattedCpfCnpj = formatCpfCnpj(cust.cpfCnpj);
                const hasDays =
                  cust.daysSinceLastPurchase !== null &&
                  cust.daysSinceLastPurchase !== undefined;

                return (
                  <li
                    key={cust.customerId}
                    className="tp-segment-customer-row"
                    tabIndex={0}
                    role="button"
                    aria-label={`Ver detalhes de ${formattedName}`}
                    onClick={() => onSelectCustomer(cust.customerId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectCustomer(cust.customerId);
                      }
                    }}
                  >
                    <div className="tp-customer-name-group">
                      <span className="tp-customer-row-name" title={formattedName}>
                        {formattedName}
                      </span>
                      <div className="tp-customer-id-tags">
                        {cust.code && (
                          <span className="tp-tag-code">Cód. {cust.code}</span>
                        )}
                        {formattedCpfCnpj && formattedCpfCnpj !== "—" && (
                          <span className="tp-tag-cpf">{formattedCpfCnpj}</span>
                        )}
                      </div>
                    </div>

                    <div className="tp-customer-row-metrics">
                      <div className="tp-metric-pill">
                        <span className="tp-metric-pill-label">No período</span>
                        <span className="tp-metric-pill-val tp-cyan">
                          {formatCurrency(cust.revenueInPeriod)}
                        </span>
                      </div>
                      <div className="tp-metric-pill">
                        <span className="tp-metric-pill-label">Compras</span>
                        <span className="tp-metric-pill-val">
                          {formatNumber(cust.purchasesInPeriod)}
                        </span>
                      </div>
                      <div className="tp-metric-pill">
                        <span className="tp-metric-pill-label">Ticket médio</span>
                        <span className="tp-metric-pill-val">
                          {formatCurrency(cust.averageTicketInPeriod)}
                        </span>
                      </div>
                    </div>

                    <div className="tp-customer-row-sub">
                      <div className="tp-row-sub-item">
                        <Calendar size={11} />
                        <span>
                          Última compra:{" "}
                          <strong>
                            {cust.lastPurchaseDate
                              ? formatDateBr(cust.lastPurchaseDate)
                              : "—"}
                          </strong>
                        </span>
                      </div>
                      {hasDays && (
                        <div className="tp-row-sub-item">
                          <Clock size={11} />
                          <span>
                            {cust.daysSinceLastPurchase === 0
                              ? "Hoje"
                              : cust.daysSinceLastPurchase === 1
                                ? "Ontem"
                                : `Há ${formatNumber(cust.daysSinceLastPurchase!)} dias`}
                          </span>
                        </div>
                      )}
                      <div className="tp-row-sub-item tp-row-sub-lifetime">
                        <span>
                          Histórico: {formatNumber(cust.lifetimePurchaseCount)}{" "}
                          {cust.lifetimePurchaseCount === 1 ? "compra" : "compras"} (
                          {formatCurrency(cust.lifetimeRevenue)})
                        </span>
                      </div>
                    </div>

                    <div className="tp-customer-row-action">
                      <ChevronRight size={16} className="tp-customer-row-arrow" />
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Pagination */}
            {data.pagination.totalPages > 1 && (
              <footer className="tp-segment-pagination">
                <span className="tp-pagination-info">
                  Página {data.pagination.page} de {data.pagination.totalPages}{" "}
                  <span className="tp-pagination-total">
                    ({formatNumber(data.pagination.totalRecords)} clientes)
                  </span>
                </span>
                <div className="tp-pagination-btns">
                  <button
                    type="button"
                    className="tp-btn-secondary tp-btn-sm"
                    disabled={data.pagination.page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label="Página anterior"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    className="tp-btn-secondary tp-btn-sm"
                    disabled={data.pagination.page >= data.pagination.totalPages}
                    onClick={() =>
                      setPage((p) => Math.min(data.pagination.totalPages, p + 1))
                    }
                    aria-label="Próxima página"
                  >
                    Próxima
                  </button>
                </div>
              </footer>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
