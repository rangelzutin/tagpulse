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
import { FinancialSyncControl } from "./FinancialSyncControl";
import { FinancialOverviewTab } from "./FinancialOverviewTab";
import { FinancialReceivablesTab } from "./FinancialReceivablesTab";
import { FinancialPayablesTab } from "./FinancialPayablesTab";
import { FinancialCashFlowTab } from "./FinancialCashFlowTab";

export type FinancialSubTab = "overview" | "receivables" | "payables" | "cash-flow";

interface FinancialViewProps {
  onSyncSuccessGlobal?: () => void;
}

export function FinancialView({ onSyncSuccessGlobal }: FinancialViewProps) {
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

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadFinancialOverviewData = useCallback(async (isBackground = false) => {
    if (!isBackground) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setOverviewError(null);

    try {
      const defaultPeriod = getDefaultPeriod();
      const [recRes, payRes, cfRes, undRes] = await Promise.allSettled([
        fetchReceivablesOverview(),
        fetchPayablesOverview(),
        fetchCashFlowOverview({
          from: defaultPeriod.from,
          to: defaultPeriod.to,
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
  }, []);

  useEffect(() => {
    void loadFinancialOverviewData();
  }, [loadFinancialOverviewData]);

  const handleSyncSuccess = useCallback(() => {
    void loadFinancialOverviewData(true);
    onSyncSuccessGlobal?.();
  }, [loadFinancialOverviewData, onSyncSuccessGlobal]);

  return (
    <div className="tp-financial-module" aria-label="Módulo Financeiro">
      {/* Header with Title, Subtitle, Sync Status & Trigger */}
      <Header
        title="Financeiro"
        subtitle="Contas a receber, contas a pagar e fluxo de caixa operacional."
        isUpdating={isRefreshing}
      >
        <FinancialSyncControl onSyncSuccess={handleSyncSuccess} />
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
            <FinancialReceivablesTab initialOverview={receivablesOverview} />
          </section>
        )}

        {activeTab === "payables" && (
          <section
            id="panel-financial-payables"
            role="tabpanel"
            aria-labelledby="tab-financial-payables"
            className="tp-financial-tab-panel"
          >
            <FinancialPayablesTab initialOverview={payablesOverview} />
          </section>
        )}

        {activeTab === "cash-flow" && (
          <section
            id="panel-financial-cash-flow"
            role="tabpanel"
            aria-labelledby="tab-financial-cash-flow"
            className="tp-financial-tab-panel"
          >
            <FinancialCashFlowTab initialOverview={cashFlowOverview} />
          </section>
        )}
      </div>
    </div>
  );
}
