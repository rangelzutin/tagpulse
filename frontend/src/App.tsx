import { useState, useEffect, useCallback } from "react";
import { fetchSalesOverview, type SalesOverviewResult } from "./api/bi";
import { Header } from "./components/Header";
import { PeriodFilter } from "./components/PeriodFilter";
import { KpiGrid } from "./components/KpiGrid";
import { MonthlyChart } from "./components/MonthlyChart";
import { getDefaultPeriod } from "./utils/formatters";

export function App() {
  const [initialPeriod] = useState(getDefaultPeriod);
  const [currentPeriod, setCurrentPeriod] = useState(initialPeriod);
  const [data, setData] = useState<SalesOverviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async (from: string, to: string) => {
    setError(null);
    setData((prev) => {
      if (prev) {
        setIsUpdating(true);
      } else {
        setIsLoading(true);
      }
      return prev;
    });

    try {
      const result = await fetchSalesOverview(from, to);
      setData(result);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Não foi possível carregar os dados de vendas no momento.";
      setError(message);
    } finally {
      setIsLoading(false);
      setIsUpdating(false);
    }
  }, []);

  useEffect(() => {
    loadOverview(initialPeriod.from, initialPeriod.to);
  }, [loadOverview, initialPeriod]);

  const handleApplyFilter = (from: string, to: string) => {
    setCurrentPeriod({ from, to });
    loadOverview(from, to);
  };

  const handleRetry = () => {
    loadOverview(currentPeriod.from, currentPeriod.to);
  };

  return (
    <div className="tp-app-container">
      <div className="tp-dashboard-wrapper">
        <Header isUpdating={isUpdating} />

        <main className="tp-main-content">
          <PeriodFilter
            initialFrom={currentPeriod.from}
            initialTo={currentPeriod.to}
            isLoading={isLoading || isUpdating}
            onApply={handleApplyFilter}
          />

          {error && (
            <section className="tp-state-card tp-state-error" role="alert">
              <div className="tp-state-content">
                <h2 className="tp-state-title">Falha na comunicação</h2>
                <p className="tp-state-message">{error}</p>
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={isLoading || isUpdating}
                  className="tp-btn-secondary"
                >
                  Tentar novamente
                </button>
              </div>
            </section>
          )}

          {isLoading && !data && (
            <section className="tp-loading-state" aria-label="Carregando dados">
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
            </section>
          )}

          {data && (
            <div
              className={`tp-data-view ${isUpdating ? "tp-view-updating" : ""}`}
            >
              <KpiGrid summary={data.summary} />

              {data.summary.sales === 0 ? (
                <section className="tp-state-card tp-state-empty">
                  <div className="tp-state-content">
                    <h2 className="tp-state-title">Nenhuma venda encontrada</h2>
                    <p className="tp-state-message">
                      Não há vendas realizadas entre as datas informadas. Tente
                      selecionar um período diferente para visualizar os dados.
                    </p>
                  </div>
                </section>
              ) : (
                <MonthlyChart monthly={data.monthly} />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
