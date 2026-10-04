import { useState, useEffect, useCallback, useRef } from "react";
import {
  LayoutDashboard,
  ArrowDownLeft,
  ArrowUpRight,
  CircleDollarSign,
} from "lucide-react";
import {
  fetchReceivablesOverview,
  fetchPayablesOverview,
  fetchCashFlowOverview,
  fetchUndatedConfirmedCash,
  type ReceivablesOverviewResponse,
  type PayablesOverviewResponse,
  type CashFlowOverviewResponse,
  type UndatedConfirmedCashResponse,
} from "../../api/financial";
import { getDefaultPeriod } from "../../utils/formatters";
import { Header } from "../Header";
import { PeriodFilter, type PeriodMode } from "../PeriodFilter";
import { FinancialSyncControl } from "./FinancialSyncControl";
import { FinancialOverviewTab } from "./FinancialOverviewTab";
import { FinancialReceivablesTab } from "./FinancialReceivablesTab";
import { FinancialPayablesTab } from "./FinancialPayablesTab";
import { FinancialCashFlowTab } from "./FinancialCashFlowTab";

export type FinancialSubTab = "overview" | "receivables" | "payables" | "cash-flow";

interface FinancialViewProps {
  onSyncSuccessGlobal?: () => void;
  minDate?: string | null;
}

export function FinancialView({ onSyncSuccessGlobal, minDate }: FinancialViewProps) {
  const [activeTab, setActiveTab] = useState<FinancialSubTab>("overview");

  // Overview data states
  const [receivablesOverview, setReceivablesOverview] =
    useState<ReceivablesOverviewResponse | null>(null);
  const [payablesOverview, setPayablesOverview] =
    useState<PayablesOverviewResponse | null>(null);
  const [cashFlowOverview, setCashFlowOverview] =
    useState<CashFlowOverviewResponse | null>(null);
  const [undatedConfirmed, setUndatedConfirmed] =
    useState<UndatedConfirmedCashResponse | null>(null);

  const [currentPeriod, setCurrentPeriod] = useState(() => getDefaultPeriod());
  const [periodMode, setPeriodMode] = useState<PeriodMode>("range");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const effectiveMinDate = minDate ?? "2015-05-05";

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadFinancialOverviewData = useCallback(async (
    isBackground = false,
    from?: string,
    to?: string,
    mode?: PeriodMode,
  ) => {
    if (!isBackground) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setOverviewError(null);

    try {
      const activeMode = mode ?? periodMode;
      const activeFrom = from ?? currentPeriod.from;
      const activeTo = to ?? currentPeriod.to;
      const [recRes, payRes, cfRes, undRes] = await Promise.allSettled([
        fetchReceivablesOverview({
          referenceDate: activeTo,
          dueTo: activeMode === "allUpTo" ? activeTo : undefined,
        }),
        fetchPayablesOverview({
          referenceDate: activeTo,
          dueTo: activeMode === "allUpTo" ? activeTo : undefined,
        }),
        fetchCashFlowOverview({
          from: activeMode === "allUpTo" ? undefined : activeFrom,
          to: activeTo,
          granularity: "month",
        }),
        fetchUndatedConfirmedCash(),
      ]);

      if (!isMountedRef.current) return;

      if (recRes.status === "fulfilled") {
        setReceivablesOverview(recRes.value);
      }
      if (payRes.status === "fulfilled") {
        setPayablesOverview(payRes.value);
      }
      if (cfRes.status === "fulfilled") {
        setCashFlowOverview(cfRes.value);
      }
      if (undRes.status === "fulfilled") {
        setUndatedConfirmed(undRes.value);
      }

      // If all failed, show error
      if (
        recRes.status === "rejected" &&
        payRes.status === "rejected" &&
        cfRes.status === "rejected"
      ) {
        const firstError =
          recRes.reason?.message ||
          payRes.reason?.message ||
          cfRes.reason?.message ||
          "Erro ao consultar dados financeiros.";
        setOverviewError(firstError);
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const msg = err instanceof Error ? err.message : "Erro ao carregar dados financeiros.";
      setOverviewError(msg);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [currentPeriod.from, currentPeriod.to, periodMode]);

  useEffect(() => {
    void loadFinancialOverviewData();
  }, [loadFinancialOverviewData]);

  const handleSyncSuccess = useCallback(() => {
    void loadFinancialOverviewData(true);
    onSyncSuccessGlobal?.();
  }, [loadFinancialOverviewData, onSyncSuccessGlobal]);

  const handleApplyFilter = useCallback((from: string, to: string, mode: PeriodMode) => {
    setCurrentPeriod({ from, to });
    setPeriodMode(mode);
    void loadFinancialOverviewData(true, from, to, mode);
  }, [loadFinancialOverviewData]);

  return (
    <div className="tp-financial-module" aria-label="Módulo Financeiro">
      {/* Header with Title, Subtitle, Sync Status & Trigger, and Date Range Picker */}
      <Header
        title="Financeiro"
        subtitle="Contas a receber, contas a pagar e fluxo de caixa operacional."
        isUpdating={isRefreshing}
      >
        <div className="tp-financial-header-actions">
          <FinancialSyncControl onSyncSuccess={handleSyncSuccess} />
          <PeriodFilter
            initialFrom={currentPeriod.from}
            initialTo={currentPeriod.to}
            periodMode={periodMode}
            minDate={effectiveMinDate}
            isLoading={isLoading}
            onApply={handleApplyFilter}
          />
        </div>
      </Header>

      {/* Persistent Subnavigation Tabs */}
      <nav
        className="tp-financial-nav-tabs"
        role="tablist"
        aria-label="Subnavegação do Módulo Financeiro"
      >
        <button
          type="button"
          role="tab"
          id="tab-financial-overview"
          aria-selected={activeTab === "overview"}
          aria-controls="panel-financial-overview"
          className={`tp-financial-tab-btn ${activeTab === "overview" ? "is-active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          <LayoutDashboard size={14} className="tp-tab-icon" />
          <span>Visão Geral</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-financial-receivables"
          aria-selected={activeTab === "receivables"}
          aria-controls="panel-financial-receivables"
          className={`tp-financial-tab-btn ${activeTab === "receivables" ? "is-active" : ""}`}
          onClick={() => setActiveTab("receivables")}
        >
          <ArrowDownLeft size={14} className="tp-tab-icon" />
          <span>Contas a Receber</span>
          {receivablesOverview && receivablesOverview.overdueCount > 0 && (
            <span className="tp-tab-pill-badge is-rose" title={`${receivablesOverview.overdueCount} títulos vencidos`}>
              {receivablesOverview.overdueCount}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          id="tab-financial-payables"
          aria-selected={activeTab === "payables"}
          aria-controls="panel-financial-payables"
          className={`tp-financial-tab-btn ${activeTab === "payables" ? "is-active" : ""}`}
          onClick={() => setActiveTab("payables")}
        >
          <ArrowUpRight size={14} className="tp-tab-icon" />
          <span>Contas a Pagar</span>
          {payablesOverview && payablesOverview.overdueCount > 0 && (
            <span className="tp-tab-pill-badge is-rose" title={`${payablesOverview.overdueCount} títulos vencidos`}>
              {payablesOverview.overdueCount}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          id="tab-financial-cash-flow"
          aria-selected={activeTab === "cash-flow"}
          aria-controls="panel-financial-cash-flow"
          className={`tp-financial-tab-btn ${activeTab === "cash-flow" ? "is-active" : ""}`}
          onClick={() => setActiveTab("cash-flow")}
        >
          <CircleDollarSign size={14} className="tp-tab-icon" />
          <span>Fluxo de Caixa</span>
        </button>
      </nav>

      {/* Tab Panels */}
      <div className="tp-financial-tab-content">
        {activeTab === "overview" && (
          <section
            id="panel-financial-overview"
            role="tabpanel"
            aria-labelledby="tab-financial-overview"
            className="tp-financial-tab-panel"
          >
            <FinancialOverviewTab
              receivablesData={receivablesOverview}
              payablesData={payablesOverview}
              cashFlowData={cashFlowOverview}
              undatedData={undatedConfirmed}
              isLoading={isLoading}
              error={overviewError}
              periodMode={periodMode}
              currentPeriod={currentPeriod}
              onRetry={() => void loadFinancialOverviewData(false)}
              onSelectTab={(tab) => setActiveTab(tab)}
            />
          </section>
        )}

        {activeTab === "receivables" && (
          <section
            id="panel-financial-receivables"
            role="tabpanel"
            aria-labelledby="tab-financial-receivables"
            className="tp-financial-tab-panel"
          >
            <FinancialReceivablesTab
              initialOverview={receivablesOverview}
              referenceDate={currentPeriod.to}
              periodMode={periodMode}
            />
          </section>
        )}

        {activeTab === "payables" && (
          <section
            id="panel-financial-payables"
            role="tabpanel"
            aria-labelledby="tab-financial-payables"
            className="tp-financial-tab-panel"
          >
            <FinancialPayablesTab
              initialOverview={payablesOverview}
              referenceDate={currentPeriod.to}
              periodMode={periodMode}
            />
          </section>
        )}

        {activeTab === "cash-flow" && (
          <section
            id="panel-financial-cash-flow"
            role="tabpanel"
            aria-labelledby="tab-financial-cash-flow"
            className="tp-financial-tab-panel"
          >
            <FinancialCashFlowTab
              initialOverview={cashFlowOverview}
              currentPeriod={currentPeriod}
              periodMode={periodMode}
              onApplyFilter={handleApplyFilter}
              showPeriodFilter={false}
            />
          </section>
        )}
      </div>
    </div>
  );
}
