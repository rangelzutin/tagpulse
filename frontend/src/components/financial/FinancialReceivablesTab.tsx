import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  X,
} from "lucide-react";
import {
  fetchReceivablesOverview,
  fetchReceivablesList,
  type ReceivablesOverviewResponse,
  type ReceivablesListItem,
  type FinancialListStatusFilter,
  type PaginatedResult,
} from "../../api/financial";
import {
  formatCurrency,
  formatNumber,
  formatDateBr,
  formatFinancialEntityName,
  formatFinancialDescription,
} from "../../utils/formatters";
import type { PeriodMode } from "../PeriodFilter";
import {
  FinancialMonthNavigator,
  calculateEffectiveDueRange,
  type SelectedMonthRange,
} from "./FinancialMonthNavigator";

interface FinancialReceivablesTabProps {
  initialOverview?: ReceivablesOverviewResponse | null;
  initialList?: PaginatedResult<ReceivablesListItem> | null;
  referenceDate?: string;
  periodMode?: PeriodMode;
}

const STATUS_FILTERS: { value: FinancialListStatusFilter; label: string }[] = [
  { value: "OPEN", label: "Em aberto" },
  { value: "OVERDUE", label: "Vencidos" },
  { value: "DUE_TODAY", label: "Vencem hoje" },
  { value: "FUTURE", label: "A vencer" },
  { value: "CONFIRMED", label: "Confirmados / Baixados" },
  { value: "ALL", label: "Todos" },
];

export function FinancialReceivablesTab({
  initialOverview,
  initialList,
  referenceDate,
  periodMode,
}: FinancialReceivablesTabProps) {
  const [overview, setOverview] = useState<ReceivablesOverviewResponse | null>(
    initialOverview ?? null,
  );
  const [listData, setListData] = useState<PaginatedResult<ReceivablesListItem> | null>(
    initialList ?? null,
  );
  const [isLoadingList, setIsLoadingList] = useState(initialList ? false : true);
  const [error, setError] = useState<string | null>(null);

  // Filters state
  const [statusFilter, setStatusFilter] = useState<FinancialListStatusFilter>("OPEN");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState<"dueDate_asc" | "dueDate_desc" | "totalAmount_desc" | "totalAmount_asc">("dueDate_asc");

  // Month navigation filter state
  const [selectedMonth, setSelectedMonth] = useState<SelectedMonthRange | null>(null);

  // Load Overview
  const loadOverview = useCallback(async () => {
    const effective = calculateEffectiveDueRange(
      selectedMonth,
      periodMode,
      referenceDate,
    );

    try {
      const res = await fetchReceivablesOverview({
        referenceDate,
        dueFrom: effective.dueFrom,
        dueTo: effective.dueTo,
      });
      setOverview(res);
    } catch (err) {
      console.error(err);
    }
  }, [referenceDate, periodMode, selectedMonth]);

  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (!initialOverview) {
        void loadOverview();
      }
      return;
    }
    void loadOverview();
  }, [loadOverview, initialOverview]);

  // Load Paginated List
  const loadList = useCallback(async () => {
    setIsLoadingList(true);
    setError(null);

    const effective = calculateEffectiveDueRange(
      selectedMonth,
      periodMode,
      referenceDate,
    );

    try {
      const res = await fetchReceivablesList({
        status: statusFilter,
        search: appliedSearch.trim() || undefined,
        page,
        pageSize,
        sort,
        referenceDate,
        dueFrom: effective.dueFrom,
        dueTo: effective.dueTo,
      });
      setListData(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao carregar lista de contas a receber.";
      setError(msg);
    } finally {
      setIsLoadingList(false);
    }
  }, [statusFilter, appliedSearch, page, pageSize, sort, referenceDate, periodMode, selectedMonth]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // Search input handler
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setAppliedSearch(searchInput);
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setAppliedSearch("");
    setPage(1);
  };

  const handleStatusChange = (val: FinancialListStatusFilter) => {
    setStatusFilter(val);
    setPage(1);
  };

  const handleMonthChange = (range: SelectedMonthRange | null) => {
    setSelectedMonth(range);
    setPage(1);
  };

  const totalPages = listData?.totalPages ?? 1;
  const totalRecords = listData?.total ?? 0;
  const items = listData?.items ?? [];

  return (
    <div className="tp-financial-subview tp-receivables-view">
      {/* ========================================================
          1. COMPACT OVERVIEW SUMMARY BANNER
          ======================================================== */}
      {overview && (
        <section className="tp-financial-summary-banner" aria-label="Resumo de Contas a Receber">
          <div className="tp-summary-stat-group">
            <div className="tp-summary-stat">
              <span className="tp-stat-label">Em Aberto:</span>
              <span className="tp-stat-val tp-value-cyan">
                {formatCurrency(overview.openTotal)}
              </span>
              <span className="tp-stat-sub">({formatNumber(overview.openCount)} títulos)</span>
            </div>
            <div className="tp-summary-stat-divider" />
            <div className="tp-summary-stat">
              <span className="tp-stat-label">Vencidos:</span>
              <span className="tp-stat-val tp-value-rose">
                {formatCurrency(overview.overdueTotal)}
              </span>
              <span className="tp-stat-sub">({formatNumber(overview.overdueCount)})</span>
            </div>
            <div className="tp-summary-stat-divider" />
            <div className="tp-summary-stat">
              <span className="tp-stat-label">Vencem hoje:</span>
              <span className="tp-stat-val tp-value-amber">
                {formatCurrency(overview.dueTodayTotal)}
              </span>
              <span className="tp-stat-sub">({formatNumber(overview.dueTodayCount)})</span>
            </div>
            <div className="tp-summary-stat-divider" />
            <div className="tp-summary-stat">
              <span className="tp-stat-label">A vencer:</span>
              <span className="tp-stat-val tp-value-emerald">
                {formatCurrency(overview.futureTotal)}
              </span>
              <span className="tp-stat-sub">({formatNumber(overview.futureCount)})</span>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================
          2. FILTER BAR (STATUS PILLS + MONTH + SEARCH)
          ======================================================== */}
      <div className="tp-table-controls-bar">
        {/* Status Pills */}
        <div className="tp-status-filter-pills" role="radiogroup" aria-label="Filtro de situação">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={statusFilter === f.value}
              className={`tp-filter-pill ${statusFilter === f.value ? "is-selected" : ""}`}
              onClick={() => handleStatusChange(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Right side: Month Navigator + Search Form */}
        <div className="tp-table-controls-actions">
          <FinancialMonthNavigator
            selectedMonth={selectedMonth}
            onChange={handleMonthChange}
            referenceDate={referenceDate}
            maxDate={periodMode === "allUpTo" ? referenceDate : undefined}
          />

          <form onSubmit={handleSearchSubmit} className="tp-table-search-form">
            <div className="tp-search-input-wrap">
              <Search size={14} className="tp-search-icon" />
              <input
                type="text"
                placeholder="Buscar cliente ou documento..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="tp-table-search-input"
                aria-label="Buscar títulos a receber"
              />
              {searchInput && (
                <button
                  type="button"
                  className="tp-search-clear-btn"
                  onClick={handleClearSearch}
                  aria-label="Limpar busca"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <button type="submit" className="tp-action-btn tp-btn-sm">
              Buscar
            </button>
          </form>
        </div>
      </div>

      {/* ========================================================
          3. ERROR STATE (EXCLUSIVE)
          ======================================================== */}
      {error && (
        <div className="tp-state-card tp-state-error" role="alert">
          <div className="tp-state-icon">
            <AlertCircle size={20} />
          </div>
          <div className="tp-state-content">
            <h3 className="tp-state-title">Falha ao consultar contas a receber</h3>
            <p className="tp-state-message">{error}</p>
            <button
              type="button"
              onClick={() => void loadList()}
              disabled={isLoadingList}
              className="tp-btn-retry"
            >
              <RefreshCw size={13} />
              <span>Tentar novamente</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================
          4. EMPTY STATE (EXCLUSIVE LEGITIMATE EMPTY)
          ======================================================== */}
      {!error && !isLoadingList && items.length === 0 && (
        <div className="tp-state-card tp-state-empty" role="status">
          <div className="tp-state-content">
            <h3 className="tp-state-title">Nenhuma conta a receber encontrada</h3>
            <p className="tp-state-message">
              Não existem títulos correspondentes aos filtros selecionados.
            </p>
          </div>
        </div>
      )}

      {/* ========================================================
          5. TABLE & DATA (LOADING OR SUCCESS WITH DATA)
          ======================================================== */}
      {!error && (isLoadingList || items.length > 0) && (
        <>
          <div className="tp-table-container">
            <table className="tp-table" aria-label="Tabela de Contas a Receber">
              <thead>
                <tr>
                  <th className="tp-th tp-th-left" style={{ width: "24%", minWidth: "160px" }}>
                    Cliente / Entidade
                  </th>
                  <th className="tp-th tp-th-left" style={{ width: "34%", minWidth: "200px" }}>
                    Descrição / Documento
                  </th>
                  <th className="tp-th tp-th-center" style={{ width: "14%", minWidth: "110px" }}>
                    <button
                      type="button"
                      className="tp-th-sort-btn"
                      onClick={() =>
                        setSort((prev) => (prev === "dueDate_asc" ? "dueDate_desc" : "dueDate_asc"))
                      }
                      title="Ordenar por vencimento"
                    >
                      <span>Vencimento</span>
                      <span className="tp-th-sort-dir">
                        {sort === "dueDate_asc" ? " ↑" : sort === "dueDate_desc" ? " ↓" : ""}
                      </span>
                    </button>
                  </th>
                  <th className="tp-th tp-th-right" style={{ width: "14%", minWidth: "100px" }}>
                    <button
                      type="button"
                      className="tp-th-sort-btn"
                      onClick={() =>
                        setSort((prev) => (prev === "totalAmount_desc" ? "totalAmount_asc" : "totalAmount_desc"))
                      }
                      title="Ordenar por valor"
                    >
                      <span>Valor</span>
                      <span className="tp-th-sort-dir">
                        {sort === "totalAmount_desc" ? " ↓" : sort === "totalAmount_asc" ? " ↑" : ""}
                      </span>
                    </button>
                  </th>
                  <th className="tp-th tp-th-center" style={{ width: "7%", minWidth: "80px" }}>
                    Situação
                  </th>
                  <th className="tp-th tp-th-center" style={{ width: "7%", minWidth: "80px" }}>
                    Confirmação
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoadingList ? (
                  // Table loading skeleton rows
                  [1, 2, 3, 4, 5].map((idx) => (
                    <tr key={idx} className="tp-table-row tp-table-skeleton-row">
                      <td className="tp-td"><div className="tp-skeleton-line tp-skeleton-long" /></td>
                      <td className="tp-td"><div className="tp-skeleton-line tp-skeleton-long" /></td>
                      <td className="tp-td tp-td-center"><div className="tp-skeleton-line tp-skeleton-short" /></td>
                      <td className="tp-td tp-td-right"><div className="tp-skeleton-line tp-skeleton-short" /></td>
                      <td className="tp-td tp-td-center"><div className="tp-skeleton-line tp-skeleton-short" /></td>
                      <td className="tp-td tp-td-center"><div className="tp-skeleton-line tp-skeleton-short" /></td>
                    </tr>
                  ))
                ) : (
                  items.map((item, idx) => {
                    const isOverdue = item.status === "OVERDUE";
                    const isDueToday = item.status === "DUE_TODAY";
                    const isFuture = item.status === "FUTURE";
                    const isConfirmed = item.status === "CONFIRMED";

                    const installmentLabel =
                      item.installmentNumber && item.installmentCount
                        ? `${item.installmentNumber}/${item.installmentCount}`
                        : "";

                    const formattedEntity = formatFinancialEntityName(item.entityName);
                    const formattedDesc = formatFinancialDescription(item.description);

                    return (
                      <tr key={item.sourceId || (item as { id?: number | string }).id || idx} className="tp-table-row">
                        <td
                          className="tp-td tp-td-left tp-font-medium"
                          title={item.entityName || undefined}
                        >
                          {formattedEntity}
                        </td>
                        <td className="tp-td tp-td-left tp-text-secondary">
                          <div className="tp-td-desc-clamp" title={item.description || undefined}>
                            <span>{formattedDesc}</span>
                          </div>
                          {(item.documentNumber || installmentLabel) && (
                            <div className="tp-doc-row">
                              {item.documentNumber && (
                                <span className="tp-doc-pill">Doc: {item.documentNumber}</span>
                              )}
                              {installmentLabel && (
                                <span className="tp-installment-tag">{installmentLabel}</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="tp-td tp-td-center tp-font-mono">
                          {formatDateBr(item.dueDate)}
                        </td>
                        <td className="tp-td tp-td-right tp-font-mono tp-font-medium tp-value-cyan">
                          {formatCurrency(item.totalAmount)}
                        </td>
                        <td className="tp-td tp-td-center">
                          {isOverdue && <span className="tp-badge-status is-overdue">Vencido</span>}
                          {isDueToday && <span className="tp-badge-status is-due-today">Vence hoje</span>}
                          {isFuture && <span className="tp-badge-status is-future">A vencer</span>}
                          {isConfirmed && <span className="tp-badge-status is-confirmed">Confirmado</span>}
                        </td>
                        <td className="tp-td tp-td-center tp-font-mono tp-text-muted">
                          {item.confirmationDate ? formatDateBr(item.confirmationDate) : "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ========================================================
              6. SERVER-SIDE PAGINATION FOOTER
              ======================================================== */}
          <div className="tp-pagination-bar">
            <div className="tp-pagination-info">
              <span>
                Mostrando{" "}
                <strong className="tp-font-mono">
                  {totalRecords === 0 ? 0 : (page - 1) * pageSize + 1}
                </strong>{" "}
                a{" "}
                <strong className="tp-font-mono">
                  {Math.min(page * pageSize, totalRecords)}
                </strong>{" "}
                de <strong className="tp-font-mono">{formatNumber(totalRecords)}</strong> títulos
              </span>
            </div>

            <div className="tp-pagination-controls">
              <div className="tp-page-size-wrap">
                <span className="tp-text-muted">Itens por página:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="tp-page-size-select"
                  aria-label="Itens por página"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              <div className="tp-pagination-nav">
                <button
                  type="button"
                  className="tp-page-btn"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || isLoadingList}
                  aria-label="Página anterior"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="tp-page-current">
                  Página <strong>{page}</strong> de <strong>{totalPages}</strong>
                </span>
                <button
                  type="button"
                  className="tp-page-btn"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || isLoadingList}
                  aria-label="Próxima página"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
