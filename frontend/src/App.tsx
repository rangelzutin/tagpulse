import { useState, useEffect, useCallback } from "react";
import {
  fetchSalesOverview,
  fetchCustomerOverview,
  type SalesOverviewResult,
  type CustomerOverviewResult,
} from "./api/bi";
import { AppShell } from "./components/AppShell";
import { Header } from "./components/Header";
import { PeriodFilter } from "./components/PeriodFilter";
import { KpiGrid } from "./components/KpiGrid";
import { MonthlyChart } from "./components/MonthlyChart";
import { CustomerKpiGrid } from "./components/CustomerKpiGrid";
import { CustomerRankingCard } from "./components/CustomerRankingCard";
import { RecencyDistributionCard } from "./components/RecencyDistributionCard";
import { AlertCircle, RefreshCw, Users } from "lucide-react";

export function App() {
  const [currentPeriod, setCurrentPeriod] = useState({
    from: "2026-01-01",
    to: "2026-09-08",
  });

  // Sales State
  const [salesData, setSalesData] = useState<SalesOverviewResult | null>(null);
  const [isSalesLoading, setIsSalesLoading] = useState(true);
  const [salesError, setSalesError] = useState<string | null>(null);

  // Customer State
  const [customerData, setCustomerData] =
    useState<CustomerOverviewResult | null>(null);
  const [isCustomerLoading, setIsCustomerLoading] = useState(true);
  const [customerError, setCustomerError] = useState<string | null>(null);

  // Global updating state for header
  const [isUpdating, setIsUpdating] = useState(false);

  // Fetch Sales Overview independently
  const loadSalesOverview = useCallback(
    async (from: string, to: string, isBackground = false) => {
      setSalesError(null);
      if (!isBackground) {
        setIsSalesLoading(true);
      }

      try {
        const result = await fetchSalesOverview(from, to);
        setSalesData(result);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Não foi possível carregar os dados de vendas.";
        setSalesError(message);
      } finally {
        setIsSalesLoading(false);
      }
    },
    [],
  );

  // Fetch Customer Overview independently
  const loadCustomerOverview = useCallback(
    async (from: string, to: string, isBackground = false) => {
      setCustomerError(null);
      if (!isBackground) {
        setIsCustomerLoading(true);
      }

      try {
        const result = await fetchCustomerOverview(from, to);
        setCustomerData(result);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Não foi possível carregar a inteligência de clientes.";
        setCustomerError(message);
      } finally {
        setIsCustomerLoading(false);
      }
    },
    [],
  );

  // Orchestrate both endpoints concurrently using Promise.allSettled
  const loadAllData = useCallback(
    async (from: string, to: string) => {
      const hasAnyData = Boolean(salesData || customerData);
      if (hasAnyData) {
        setIsUpdating(true);
      }

      await Promise.allSettled([
        loadSalesOverview(from, to, hasAnyData),
        loadCustomerOverview(from, to, hasAnyData),
      ]);

      setIsUpdating(false);
    },
    [loadSalesOverview, loadCustomerOverview, salesData, customerData],
  );

  // Initial load
  useEffect(() => {
    loadAllData(currentPeriod.from, currentPeriod.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApplyFilter = (from: string, to: string) => {
    setCurrentPeriod({ from, to });
    setIsUpdating(true);
    Promise.allSettled([
      loadSalesOverview(from, to, Boolean(salesData)),
      loadCustomerOverview(from, to, Boolean(customerData)),
    ]).finally(() => {
      setIsUpdating(false);
    });
  };

  const handleRetrySales = () => {
    loadSalesOverview(currentPeriod.from, currentPeriod.to, false);
  };

  const handleRetryCustomers = () => {
    loadCustomerOverview(currentPeriod.from, currentPeriod.to, false);
  };

  const isAnyLoading = isSalesLoading || isCustomerLoading || isUpdating;

  return (
    <AppShell>
      <main className="tp-dashboard-main">
        {/* Header with integrated Period Filter */}
        <Header isUpdating={isUpdating}>
          <PeriodFilter
            initialFrom={currentPeriod.from}
            initialTo={currentPeriod.to}
            isLoading={isAnyLoading}
            onApply={handleApplyFilter}
          />
        </Header>

        {/* =======================================================
            SEÇÃO 1: PERFORMANCE COMERCIAL (SALES OVERVIEW)
            ======================================================= */}
        <section
          className="tp-dashboard-section"
          aria-label="Performance Comercial"
        >
          {/* Sales Error Card (Partial Degradation) */}
          {salesError && (
            <div className="tp-state-card tp-state-error" role="alert">
              <div className="tp-state-icon">
                <AlertCircle size={20} />
              </div>
              <div className="tp-state-content">
                <h3 className="tp-state-title">
                  Falha ao consultar indicadores de vendas
                </h3>
                <p className="tp-state-message">{salesError}</p>
                <button
                  type="button"
                  onClick={handleRetrySales}
                  disabled={isSalesLoading}
                  className="tp-btn-retry"
                >
                  <RefreshCw size={13} />
                  <span>Tentar novamente</span>
                </button>
              </div>
            </div>
          )}

          {/* Sales Skeleton Loading */}
          {isSalesLoading && !salesData && !salesError && (
            <div className="tp-section-skeleton" aria-label="Carregando vendas">
              <div className="tp-kpi-grid">
                {[1, 2, 3, 4].map((idx) => (
                  <div key={idx} className="tp-kpi-card tp-skeleton-card">
                    <div className="tp-skeleton-line tp-skeleton-short" />
                    <div className="tp-skeleton-line tp-skeleton-long" />
                  </div>
                ))}
              </div>
              <div className="tp-chart-card tp-skeleton-card tp-skeleton-chart">
                <div className="tp-skeleton-line tp-skeleton-short" />
                <div className="tp-skeleton-line tp-skeleton-chart-body" />
              </div>
            </div>
          )}

          {/* Sales Content */}
          {salesData && (
            <div
              className={`tp-sales-content ${isUpdating ? "is-refreshing" : ""}`}
            >
              <KpiGrid summary={salesData.summary} />

              {salesData.summary.sales === 0 ? (
                <div className="tp-state-card tp-state-empty">
                  <div className="tp-state-content">
                    <h3 className="tp-state-title">Nenhuma venda encontrada</h3>
                    <p className="tp-state-message">
                      Não há vendas realizadas entre as datas informadas. Tente
                      selecionar um período diferente para visualizar a
                      evolução.
                    </p>
                  </div>
                </div>
              ) : (
                <MonthlyChart
                  monthly={salesData.monthly}
                  toDate={currentPeriod.to}
                />
              )}
            </div>
          )}
        </section>

        {/* =======================================================
            SEÇÃO 2: INTELIGÊNCIA DE CLIENTES (CUSTOMER OVERVIEW)
            ======================================================= */}
        <section
          className="tp-dashboard-section tp-customer-section"
          id="clientes"
          aria-label="Inteligência de Clientes"
        >
          <div className="tp-section-header">
            <div className="tp-section-title-wrap">
              <span className="tp-section-icon-badge">
                <Users size={14} />
              </span>
              <h2 className="tp-section-title">INTELIGÊNCIA DE CLIENTES</h2>
            </div>
            <p className="tp-section-desc">
              Comportamento, taxa de recorrência, concentração de faturamento e
              tempo de recência da base.
            </p>
          </div>

          {/* Customer Error Card (Partial Degradation) */}
          {customerError && (
            <div className="tp-state-card tp-state-error" role="alert">
              <div className="tp-state-icon">
                <AlertCircle size={20} />
              </div>
              <div className="tp-state-content">
                <h3 className="tp-state-title">
                  Falha ao consultar inteligência de clientes
                </h3>
                <p className="tp-state-message">{customerError}</p>
                <button
                  type="button"
                  onClick={handleRetryCustomers}
                  disabled={isCustomerLoading}
                  className="tp-btn-retry"
                >
                  <RefreshCw size={13} />
                  <span>Tentar novamente</span>
                </button>
              </div>
            </div>
          )}

          {/* Customer Skeleton Loading */}
          {isCustomerLoading && !customerData && !customerError && (
            <div
              className="tp-section-skeleton"
              aria-label="Carregando inteligência de clientes"
            >
              <div className="tp-kpi-grid">
                {[1, 2, 3, 4].map((idx) => (
                  <div key={idx} className="tp-kpi-card tp-skeleton-card">
                    <div className="tp-skeleton-line tp-skeleton-short" />
                    <div className="tp-skeleton-line tp-skeleton-long" />
                  </div>
                ))}
              </div>
              <div className="tp-split-grid">
                <div className="tp-card tp-skeleton-card tp-skeleton-table">
                  <div className="tp-skeleton-line tp-skeleton-short" />
                  <div className="tp-skeleton-line tp-skeleton-chart-body" />
                </div>
                <div className="tp-card tp-skeleton-card tp-skeleton-recency">
                  <div className="tp-skeleton-line tp-skeleton-short" />
                  <div className="tp-skeleton-line tp-skeleton-chart-body" />
                </div>
              </div>
            </div>
          )}

          {/* Customer Content */}
          {customerData && (
            <div
              className={`tp-customer-content ${isUpdating ? "is-refreshing" : ""}`}
            >
              <CustomerKpiGrid metrics={customerData.customers} />

              <div className="tp-split-grid">
                <div className="tp-split-col-ranking">
                  <CustomerRankingCard ranking={customerData.ranking} />
                </div>
                <div className="tp-split-col-recency">
                  <RecencyDistributionCard recency={customerData.recency} />
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}
