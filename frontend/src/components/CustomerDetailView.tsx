import { useEffect, useState } from "react";
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  MapPin,
  Receipt,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  XCircle,
} from "lucide-react";

import {
  fetchCustomerDetailOverview,
  fetchCustomerSales,
  type CustomerDetailOverviewResult,
  type CustomerSaleItem,
  type CustomerSalesResult,
  type CustomerSalesScope,
} from "../api/bi";
import {
  formatCpfCnpj,
  formatCurrency,
  formatCustomerName,
  formatDateBr,
  formatNumber,
  formatPercent,
} from "../utils/formatters";

interface CustomerDetailViewProps {
  customerId: string;
  from: string;
  to: string;
  periodMode?: "range" | "allUpTo";
}

export function CustomerDetailView({
  customerId,
  from,
  to,
  periodMode = "range",
}: CustomerDetailViewProps) {
  // Customer Overview State
  const [overview, setOverview] = useState<CustomerDetailOverviewResult | null>(
    null,
  );
  const [isOverviewLoading, setIsOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  // Customer Sales State
  const [salesScope, setSalesScope] = useState<CustomerSalesScope>("period");
  const [salesPage, setSalesPage] = useState(1);
  const [salesData, setSalesData] = useState<CustomerSalesResult | null>(null);
  const [isSalesLoading, setIsSalesLoading] = useState(true);
  const [salesError, setSalesError] = useState<string | null>(null);

  // Expanded Sales Set (accordion)
  const [expandedSaleIds, setExpandedSaleIds] = useState<Set<string>>(
    new Set(),
  );

  const toggleExpandSale = (saleId: string) => {
    setExpandedSaleIds((prev) => {
      const next = new Set(prev);
      if (next.has(saleId)) {
        next.delete(saleId);
      } else {
        next.add(saleId);
      }
      return next;
    });
  };

  // Load Customer Overview
  const loadOverview = async () => {
    setIsOverviewLoading(true);
    setOverviewError(null);
    try {
      const res = await fetchCustomerDetailOverview(customerId, from, to);
      setOverview(res);
    } catch (err) {
      setOverviewError(
        err instanceof Error
          ? err.message
          : "Erro ao consultar dados cadastrais do cliente.",
      );
    } finally {
      setIsOverviewLoading(false);
    }
  };

  // Load Customer Sales
  const loadSales = async () => {
    setIsSalesLoading(true);
    setSalesError(null);
    try {
      const res = await fetchCustomerSales(customerId, {
        from,
        to,
        scope: salesScope,
        page: salesPage,
        pageSize: 20,
      });
      setSalesData(res);
      // Auto-expand the first sale for immediate discovery
      if (res.sales.length > 0 && expandedSaleIds.size === 0) {
        setExpandedSaleIds(new Set([res.sales[0]!.saleId]));
      }
    } catch (err) {
      setSalesError(
        err instanceof Error
          ? err.message
          : "Erro ao consultar histórico de negociações.",
      );
    } finally {
      setIsSalesLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, from, to]);

  useEffect(() => {
    loadSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, from, to, salesScope, salesPage]);

  // Loading skeleton for entire view
  if (isOverviewLoading) {
    return (
      <div className="tp-detail-view tp-detail-loading" aria-busy="true">
        <div className="tp-detail-skeleton-header">
          <div className="tp-skeleton-line tp-skeleton-w-70" />
          <div className="tp-skeleton-line tp-skeleton-w-40" />
        </div>
        <div className="tp-detail-skeleton-grid">
          <div className="tp-skeleton-card" />
          <div className="tp-skeleton-card" />
          <div className="tp-skeleton-card" />
          <div className="tp-skeleton-card" />
        </div>
      </div>
    );
  }

  // Overview Error State
  if (overviewError || !overview) {
    return (
      <div className="tp-detail-view">
        <div className="tp-segment-error-box" role="alert">
          <AlertCircle size={18} className="tp-error-icon" />
          <div className="tp-error-content">
            <p className="tp-error-title">Erro ao carregar detalhes</p>
            <p className="tp-error-desc">{overviewError}</p>
          </div>
          <button
            type="button"
            className="tp-btn-secondary tp-btn-sm"
            onClick={loadOverview}
          >
            <RefreshCw size={12} />
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const { identity, classification, period, lifetime } = overview;
  const formattedDisplayName = formatCustomerName(identity.displayName);
  const formattedLegalName = identity.legalName
    ? formatCustomerName(identity.legalName)
    : null;
  const formattedCpfCnpj = formatCpfCnpj(identity.cpfCnpj);
  const showLegalName =
    formattedLegalName &&
    formattedLegalName.toLowerCase() !== formattedDisplayName.toLowerCase();

  return (
    <div className="tp-detail-view">
      {/* Identity Header */}
      <header className="tp-detail-header">
        <div className="tp-detail-identity">
          <div className="tp-detail-title-wrap">
            <h2 className="tp-detail-title" title={formattedDisplayName}>
              {formattedDisplayName}
            </h2>
            {periodMode === "allUpTo" ? (
              <>
                {lifetime.purchaseCount === 1 && (
                  <span className="tp-badge tp-badge-cyan">Compra única</span>
                )}
                {lifetime.purchaseCount >= 2 && (
                  <span className="tp-badge tp-badge-blue">
                    Cliente recorrente
                  </span>
                )}
                {lifetime.purchaseCount === 0 && (
                  <span className="tp-badge tp-badge-muted">Sem compras</span>
                )}
              </>
            ) : (
              <>
                {classification.isNewInPeriod && (
                  <span className="tp-badge tp-badge-cyan">Novo no período</span>
                )}
                {classification.isReturningInPeriod && (
                  <span className="tp-badge tp-badge-blue">
                    Recorrente no período
                  </span>
                )}
                {!classification.hasPeriodActivity && (
                  <span className="tp-badge tp-badge-muted">
                    Sem compras no período
                  </span>
                )}
              </>
            )}
          </div>

          {showLegalName && (
            <p className="tp-detail-legal-name" title={formattedLegalName}>
              <Building2 size={12} />
              <span>{formattedLegalName}</span>
            </p>
          )}

          <div className="tp-detail-meta-row">
            {formattedCpfCnpj && formattedCpfCnpj !== "—" && (
              <span className="tp-detail-meta-pill">
                <strong>Doc:</strong> {formattedCpfCnpj}
              </span>
            )}
            {identity.code && (
              <span className="tp-detail-meta-pill">
                <strong>Cód:</strong> {identity.code}
              </span>
            )}
            {(identity.city || identity.state) && (
              <span className="tp-detail-meta-pill">
                <MapPin size={11} />
                <span>
                  {[identity.city, identity.state].filter(Boolean).join(" - ")}
                </span>
              </span>
            )}
          </div>
        </div>
      </header>

      {/* METRICS SECTION: If allUpTo, single unified lifetime view to avoid duplication; if range, side-by-side comparison */}
      {periodMode === "allUpTo" ? (
        <section
          className="tp-detail-section"
          aria-label="Visão acumulada da base"
        >
          <h3 className="tp-detail-section-title">
            <TrendingUp size={13} />
            <span>Visão Acumulada da Base (até {formatDateBr(lifetime.asOfDate)})</span>
          </h3>
          <div className="tp-detail-kpi-grid tp-kpi-grid-5">
            <div className="tp-detail-kpi-card">
              <span className="tp-detail-kpi-label">Faturamento Total</span>
              <span className="tp-detail-kpi-value tp-cyan">
                {formatCurrency(lifetime.revenue)}
              </span>
            </div>
            <div className="tp-detail-kpi-card">
              <span className="tp-detail-kpi-label">Compras Realizadas</span>
              <span className="tp-detail-kpi-value">
                {formatNumber(lifetime.purchaseCount)}
              </span>
            </div>
            <div className="tp-detail-kpi-card">
              <span className="tp-detail-kpi-label">Ticket Médio</span>
              <span className="tp-detail-kpi-value">
                {formatCurrency(lifetime.averageTicket)}
              </span>
            </div>
            <div className="tp-detail-kpi-card">
              <span className="tp-detail-kpi-label">Participação na Base</span>
              <span className="tp-detail-kpi-value tp-blue">
                {formatPercent(period.revenueSharePercent)}
              </span>
            </div>
            <div className="tp-detail-kpi-card">
              <span className="tp-detail-kpi-label">Dias Sem Comprar</span>
              <span className="tp-detail-kpi-value">
                {lifetime.daysSinceLastPurchase === null
                  ? "—"
                  : lifetime.daysSinceLastPurchase === 0
                    ? "Hoje"
                    : `${formatNumber(lifetime.daysSinceLastPurchase)} dias`}
              </span>
            </div>
          </div>

          <div className="tp-detail-dates-footer">
            <div className="tp-detail-date-item">
              <Calendar size={11} />
              <span>
                Primeira compra:{" "}
                <strong>{formatDateBr(lifetime.firstPurchaseDate)}</strong>
              </span>
            </div>
            <div className="tp-detail-date-item">
              <Calendar size={11} />
              <span>
                Última compra:{" "}
                <strong>{formatDateBr(lifetime.lastPurchaseDate)}</strong>
              </span>
            </div>
          </div>
        </section>
      ) : (
        <div className="tp-detail-metrics-row">
          {/* SECTION: NO PERÍODO */}
          <section className="tp-detail-section" aria-label="Desempenho no período">
            <h3 className="tp-detail-section-title">
              <TrendingUp size={13} />
              <span>No Período Selecionado</span>
            </h3>
            <div className="tp-detail-kpi-grid">
              <div className="tp-detail-kpi-card">
                <span className="tp-detail-kpi-label">Faturamento</span>
                <span className="tp-detail-kpi-value tp-cyan">
                  {formatCurrency(period.revenue)}
                </span>
              </div>
              <div className="tp-detail-kpi-card">
                <span className="tp-detail-kpi-label">Compras</span>
                <span className="tp-detail-kpi-value">
                  {formatNumber(period.purchaseCount)}
                </span>
              </div>
              <div className="tp-detail-kpi-card">
                <span className="tp-detail-kpi-label">Ticket Médio</span>
                <span className="tp-detail-kpi-value">
                  {formatCurrency(period.averageTicket)}
                </span>
              </div>
              <div className="tp-detail-kpi-card">
                <span className="tp-detail-kpi-label">Participação</span>
                <span className="tp-detail-kpi-value tp-blue">
                  {formatPercent(period.revenueSharePercent)}
                </span>
              </div>
            </div>
          </section>

          {/* SECTION: HISTÓRICO ATÉ [to] */}
          <section
            className="tp-detail-section"
            aria-label="Desempenho histórico acumulado"
          >
            <h3 className="tp-detail-section-title">
              <Clock size={13} />
              <span>Histórico Acumulado (até {formatDateBr(lifetime.asOfDate)})</span>
            </h3>
            <div className="tp-detail-kpi-grid tp-kpi-grid-dense">
              <div className="tp-detail-kpi-card">
                <span className="tp-detail-kpi-label">Faturamento Histórico</span>
                <span className="tp-detail-kpi-value">
                  {formatCurrency(lifetime.revenue)}
                </span>
              </div>
              <div className="tp-detail-kpi-card">
                <span className="tp-detail-kpi-label">Compras Históricas</span>
                <span className="tp-detail-kpi-value">
                  {formatNumber(lifetime.purchaseCount)}
                </span>
              </div>
              <div className="tp-detail-kpi-card">
                <span className="tp-detail-kpi-label">Ticket Histórico</span>
                <span className="tp-detail-kpi-value">
                  {formatCurrency(lifetime.averageTicket)}
                </span>
              </div>
              <div className="tp-detail-kpi-card">
                <span className="tp-detail-kpi-label">Dias Sem Comprar</span>
                <span className="tp-detail-kpi-value">
                  {lifetime.daysSinceLastPurchase === null
                    ? "—"
                    : lifetime.daysSinceLastPurchase === 0
                      ? "Hoje"
                      : `${formatNumber(lifetime.daysSinceLastPurchase)} dias`}
                </span>
              </div>
            </div>

            <div className="tp-detail-dates-footer">
              <div className="tp-detail-date-item">
                <Calendar size={11} />
                <span>
                  Primeira compra:{" "}
                  <strong>{formatDateBr(lifetime.firstPurchaseDate)}</strong>
                </span>
              </div>
              <div className="tp-detail-date-item">
                <Calendar size={11} />
                <span>
                  Última compra:{" "}
                  <strong>{formatDateBr(lifetime.lastPurchaseDate)}</strong>
                </span>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* SECTION: NEGOCIAÇÕES */}
      <section
        className="tp-detail-section tp-section-sales"
        aria-label="Negociações e documentos"
      >
        <div className="tp-sales-section-header">
          <div className="tp-sales-header-title">
            <Receipt size={14} />
            <h3 className="tp-detail-section-title tp-no-margin">Negociações</h3>
          </div>

          {/* Scope switch */}
          <div
            className="tp-scope-segmented-control"
            role="tablist"
            aria-label="Escopo das negociações"
          >
            <button
              type="button"
              role="tab"
              aria-selected={salesScope === "period"}
              className={`tp-scope-btn ${salesScope === "period" ? "is-active" : ""}`}
              onClick={() => {
                if (salesScope !== "period") {
                  setSalesScope("period");
                  setSalesPage(1);
                }
              }}
            >
              Período selecionado
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={salesScope === "history"}
              className={`tp-scope-btn ${salesScope === "history" ? "is-active" : ""}`}
              onClick={() => {
                if (salesScope !== "history") {
                  setSalesScope("history");
                  setSalesPage(1);
                }
              }}
            >
              Histórico completo
            </button>
          </div>
        </div>

        {/* Sales List Area */}
        <div className="tp-sales-content-area">
          {isSalesLoading && (
            <div className="tp-sales-skeleton" aria-busy="true">
              <div className="tp-skeleton-card tp-skeleton-h-60" />
              <div className="tp-skeleton-card tp-skeleton-h-60" />
            </div>
          )}

          {!isSalesLoading && salesError && (
            <div className="tp-segment-error-box" role="alert">
              <AlertCircle size={16} className="tp-error-icon" />
              <div className="tp-error-content">
                <p className="tp-error-desc">{salesError}</p>
              </div>
              <button
                type="button"
                className="tp-btn-secondary tp-btn-sm"
                onClick={loadSales}
              >
                Tentar novamente
              </button>
            </div>
          )}

          {!isSalesLoading &&
            !salesError &&
            salesData &&
            salesData.sales.length === 0 && (
              <div className="tp-sales-empty-box">
                <ShoppingBag size={24} className="tp-empty-icon" />
                <p className="tp-empty-title">
                  Nenhuma negociação realizada no escopo selecionado
                </p>
                <p className="tp-empty-desc">
                  {salesScope === "period"
                    ? "Alterne para 'Histórico completo' para visualizar compras de outros períodos."
                    : "Este cliente não possui compras realizadas na base."}
                </p>
              </div>
            )}

          {!isSalesLoading &&
            !salesError &&
            salesData &&
            salesData.sales.length > 0 && (
              <div className="tp-sales-list-wrap">
                <ul className="tp-sales-accordion-list" role="list">
                  {salesData.sales.map((sale: CustomerSaleItem) => {
                    const isExpanded = expandedSaleIds.has(sale.saleId);

                    return (
                      <li key={sale.saleId} className="tp-sale-card">
                        {/* Sale Card Header (Clickable to toggle expansion) */}
                        <div
                          className="tp-sale-card-header"
                          role="button"
                          tabIndex={0}
                          aria-expanded={isExpanded}
                          onClick={() => toggleExpandSale(sale.saleId)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleExpandSale(sale.saleId);
                            }
                          }}
                        >
                          <div className="tp-sale-header-left">
                            <span className="tp-expand-indicator">
                              {isExpanded ? (
                                <ChevronDown size={14} />
                              ) : (
                                <ChevronRight size={14} />
                              )}
                            </span>

                            <div className="tp-sale-main-info">
                              <div className="tp-sale-badges-row">
                                {sale.hasPedido && sale.pedidoSourceId && (
                                  <span className="tp-doc-badge tp-doc-badge-pedido">
                                    PEDIDO #{sale.pedidoSourceId}
                                  </span>
                                )}
                                {sale.anchorType !== "PEDIDO" && (
                                  <span className="tp-doc-badge tp-doc-badge-anchor">
                                    {sale.anchorType.replace(/_/g, " ")} #
                                    {sale.anchorSourceId}
                                  </span>
                                )}
                                <span className="tp-sale-doc-count-badge">
                                  {sale.realizedDocCount}{" "}
                                  {sale.realizedDocCount === 1
                                    ? "doc realizado"
                                    : "docs realizados"}
                                </span>
                              </div>

                              <div className="tp-sale-date-row">
                                <Calendar size={11} />
                                <span>
                                  Data realizada:{" "}
                                  <strong>
                                    {formatDateBr(sale.saleRealizedDate)}
                                  </strong>
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Adjustment 3: Value of the negotiation (not period revenue) */}
                          <div className="tp-sale-header-right">
                            <span className="tp-sale-val-label">
                              Valor realizado da negociação
                            </span>
                            <span className="tp-sale-val-amount tp-cyan">
                              {formatCurrency(sale.totalRealizedAmount)}
                            </span>
                          </div>
                        </div>

                        {/* Expanded Documents Context List */}
                        {isExpanded && (
                          <div
                            className="tp-sale-documents-expanded"
                            role="region"
                            aria-label={`Documentos da negociação ${sale.saleId}`}
                          >
                            <div className="tp-sale-docs-title">
                              <FileText size={12} />
                              <span>Documentos associados como contexto:</span>
                            </div>

                            <div className="tp-sale-docs-table-wrap">
                              <table className="tp-docs-table">
                                <thead>
                                  <tr>
                                    <th>Documento</th>
                                    <th>Status</th>
                                    <th>Data realizada</th>
                                    <th>Emissão</th>
                                    <th className="tp-text-right">Valor</th>
                                    <th className="tp-text-right">Condição</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sale.documents.map((doc) => {
                                    const isRealized = doc.isRealizedDoc;

                                    return (
                                      <tr
                                        key={doc.id}
                                        className={`tp-doc-row ${isRealized ? "is-realized-doc" : "is-non-realized-doc"}`}
                                      >
                                        <td className="tp-doc-name-cell">
                                          <span
                                            className={`tp-doc-type-tag tp-doc-${doc.docType.toLowerCase()}`}
                                          >
                                            {doc.docType === "VENDA_SIMPLES"
                                              ? "VENDA SIMPLES"
                                              : doc.docType === "NFE"
                                                ? "NF-e"
                                                : doc.docType}{" "}
                                            #{doc.sourceId}
                                          </span>
                                        </td>
                                        <td>
                                          <span className="tp-doc-status-text">
                                            {doc.status || "—"}
                                          </span>
                                        </td>
                                        <td>
                                          {doc.realizedDate
                                            ? formatDateBr(doc.realizedDate)
                                            : "—"}
                                        </td>
                                        <td>
                                          {doc.sourceEmissaoAt
                                            ? formatDateBr(doc.sourceEmissaoAt)
                                            : "—"}
                                        </td>
                                        <td className="tp-text-right tp-cell-amount">
                                          {doc.netAmount !== null &&
                                          doc.netAmount !== undefined
                                            ? formatCurrency(doc.netAmount)
                                            : "—"}
                                        </td>
                                        <td className="tp-text-right">
                                          {isRealized ? (
                                            <span className="tp-realized-pill is-active">
                                              <CheckCircle2 size={11} />
                                              Realizado
                                            </span>
                                          ) : (
                                            <span className="tp-realized-pill is-muted">
                                              <XCircle size={11} />
                                              Não realizado
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {/* Sales Pagination */}
                {salesData.pagination.totalPages > 1 && (
                  <footer className="tp-segment-pagination tp-sales-pagination">
                    <span className="tp-pagination-info">
                      Página {salesData.pagination.page} de{" "}
                      {salesData.pagination.totalPages}{" "}
                      <span className="tp-pagination-total">
                        ({formatNumber(salesData.pagination.totalRecords)}{" "}
                        negociações)
                      </span>
                    </span>
                    <div className="tp-pagination-btns">
                      <button
                        type="button"
                        className="tp-btn-secondary tp-btn-sm"
                        disabled={salesData.pagination.page <= 1}
                        onClick={() => setSalesPage((p) => Math.max(1, p - 1))}
                        aria-label="Página anterior de negociações"
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        className="tp-btn-secondary tp-btn-sm"
                        disabled={
                          salesData.pagination.page >=
                          salesData.pagination.totalPages
                        }
                        onClick={() =>
                          setSalesPage((p) =>
                            Math.min(salesData.pagination.totalPages, p + 1),
                          )
                        }
                        aria-label="Próxima página de negociações"
                      >
                        Próxima
                      </button>
                    </div>
                  </footer>
                )}
              </div>
            )}
        </div>
      </section>
    </div>
  );
}
