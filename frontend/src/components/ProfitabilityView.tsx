import { useState, useRef } from "react";
import {
  AlertCircle,
  Info,
  RefreshCw,
  TrendingUp,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
} from "lucide-react";
import type {
  CategoryTreeNode,
  CommercialChannel,
  ProfitabilityOverviewResult,
} from "../api/bi";
import { ProfitabilityOverviewTab } from "./ProfitabilityOverviewTab";
import { ProfitabilityProductsTab } from "./ProfitabilityProductsTab";
import { ProfitabilitySalesTab } from "./ProfitabilitySalesTab";
import { ProfitabilityCustomersTab } from "./ProfitabilityCustomersTab";

export type ProfitabilityTab = "overview" | "products" | "sales" | "customers";

export interface ProfitabilityViewProps {
  from?: string;
  to?: string;
  data: ProfitabilityOverviewResult | null;
  isLoading: boolean;
  isRefreshing?: boolean;
  error: string | null;
  onRetry: () => void;
  selectedChannel: CommercialChannel | null;
  onSelectChannel: (channel: CommercialChannel | null) => void;
  selectedCategorySourceId: string | null;
  onSelectCategorySourceId: (sourceId: string | null) => void;
  categoryTree: CategoryTreeNode[];
  initialTab?: ProfitabilityTab;
}

function formatCostSnapshotDate(isoString: string | null | undefined): string {
  if (!isoString) return "Data de atualização dos custos indisponível";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "Data de atualização dos custos indisponível";
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `Custos atuais atualizados em ${day}/${month}/${year} às ${hours}:${minutes}`;
  } catch {
    return "Data de atualização dos custos indisponível";
  }
}

export function ProfitabilityView({
  from,
  to,
  data,
  isLoading,
  isRefreshing = false,
  error,
  onRetry,
  selectedChannel,
  onSelectChannel,
  selectedCategorySourceId,
  onSelectCategorySourceId,
  categoryTree,
  initialTab = "overview",
}: ProfitabilityViewProps) {
  const [activeTab, setActiveTab] = useState<ProfitabilityTab>(initialTab);
  const [isPremiseExpanded, setIsPremiseExpanded] = useState(false);
  const tabListRef = useRef<HTMLDivElement>(null);

  // Teclado acessível para navegação entre abas (WAI-ARIA)
  const handleKeyDownTabList = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const tabs: ProfitabilityTab[] = ["overview", "products", "sales", "customers"];
    const currentIndex = tabs.indexOf(activeTab);
    let nextIndex = -1;

    if (e.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = tabs.length - 1;
    }

    if (nextIndex !== -1) {
      e.preventDefault();
      const nextTab = tabs[nextIndex];
      setActiveTab(nextTab);
      const tabElement = document.getElementById(`tab-profitability-${nextTab}`);
      tabElement?.focus();
    }
  };

  // Estado de Erro sem dados em cache (no nível raiz de Overview)
  if (error && !data) {
    return (
      <section
        className="tp-dashboard-section"
        aria-label="Erro na Rentabilidade"
      >
        <div className="tp-state-card tp-state-error" role="alert">
          <div className="tp-state-icon">
            <AlertCircle size={20} />
          </div>
          <div className="tp-state-content">
            <h3 className="tp-state-title">
              Falha ao consultar indicadores de rentabilidade
            </h3>
            <p className="tp-state-message">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              disabled={isLoading}
              className="tp-btn-retry"
            >
              <RefreshCw size={13} />
              <span>Tentar novamente</span>
            </button>
          </div>
        </div>
      </section>
    );
  }

  // Estado de Skeleton Inicial
  if (isLoading && !data) {
    return (
      <section
        className="tp-dashboard-section"
        aria-label="Carregando rentabilidade"
      >
        <div className="tp-section-skeleton">
          {/* Skeleton Nav Tabs */}
          <div className="tp-products-nav-tabs-skeleton">
            {[1, 2, 3, 4].map((idx) => (
              <div key={idx} className="tp-skeleton-tab-item" />
            ))}
          </div>

          {/* Skeleton KPIs */}
          <div className="tp-kpi-grid">
            {[1, 2, 3, 4].map((idx) => (
              <div key={idx} className="tp-kpi-card tp-skeleton-card">
                <div className="tp-skeleton-line tp-skeleton-short" />
                <div className="tp-skeleton-line tp-skeleton-long" />
              </div>
            ))}
          </div>

          {/* Skeleton Chart */}
          <div className="tp-card tp-skeleton-card" style={{ height: 320 }}>
            <div className="tp-skeleton-line tp-skeleton-short" />
            <div className="tp-skeleton-line tp-skeleton-chart-body" />
          </div>
        </div>
      </section>
    );
  }

  if (!data) {
    return null;
  }

  const effectiveFrom = from || data.period?.from || "";
  const effectiveTo = to || data.period?.to || "";
  const { costSnapshot } = data;

  return (
    <section
      className={`tp-dashboard-section tp-profitability-section ${
        isRefreshing ? "is-refreshing" : ""
      }`}
      aria-label="Rentabilidade Estimada ao Custo Atual"
    >
      {/* 1. Header & Subtitle */}
      <div className="tp-section-header">
        <div className="tp-section-header-main">
          <div className="tp-section-title-wrap">
            <span className="tp-section-icon-badge tp-icon-cyan">
              <TrendingUp size={15} />
            </span>
            <h2 className="tp-section-title">
              Rentabilidade Estimada ao Custo Atual
            </h2>
          </div>
          <p className="tp-section-desc">
            Margem bruta estimada aplicando o custo atual cadastrado no TagPlus aos produtos vendidos no período.
          </p>
        </div>

        {/* Snapshot timestamp badge */}
        <div
          className={`tp-profit-snapshot-badge ${!costSnapshot?.completedAt ? "tp-snapshot-badge-muted" : ""}`}
          title={
            costSnapshot?.completedAt
              ? `Origem: ${costSnapshot.source === "PRODUCT_SYNC_RUN" ? "Sincronização de catálogo" : "Última atualização de produtos"}`
              : "Data de atualização indisponível"
          }
        >
          <span className={`tp-snapshot-dot ${!costSnapshot?.completedAt ? "tp-snapshot-dot-muted" : ""}`} />
          <span>{formatCostSnapshotDate(costSnapshot?.completedAt)}</span>
        </div>
      </div>

      {/* 2. Compact Methodology Premise Callout */}
      <div className="tp-profit-premise-box" role="note">
        <div className="tp-profit-premise-header">
          <div className="tp-profit-premise-main">
            <Info size={15} className="tp-profit-premise-icon" />
            <span className="tp-profit-premise-title">Sobre esta estimativa:</span>
            <span className="tp-profit-premise-text">
              Rentabilidade estimada com o custo atual dos produtos. Não representa o custo histórico na data da venda.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsPremiseExpanded((prev) => !prev)}
            className="tp-profit-premise-toggle"
            aria-expanded={isPremiseExpanded}
          >
            {isPremiseExpanded ? "Menos detalhes" : "Saiba mais"}
          </button>
        </div>
        {isPremiseExpanded && (
          <div className="tp-profit-premise-details">
            <p>
              Esta análise não representa o CMV histórico apurado no momento de cada venda, mas sim a rentabilidade estimada caso os produtos fossem repostos aos custos atuais cadastrados no catálogo do TagPlus. Itens sem custo cadastrado ou produtos históricos descontinuados têm sua receita realizada preservada na íntegra, mas são isolados do cálculo de margem para evitar distorções.
            </p>
          </div>
        )}
      </div>

      {/* 3. Subnavegação Interna do Módulo Rentabilidade (4 Visões) */}
      <div
        ref={tabListRef}
        className="tp-financial-nav-tabs tp-profit-nav-tabs"
        role="tablist"
        aria-label="Subnavegação do Módulo Rentabilidade"
        onKeyDown={handleKeyDownTabList}
      >
        <button
          type="button"
          role="tab"
          id="tab-profitability-overview"
          aria-selected={activeTab === "overview"}
          aria-controls="panel-profitability-overview"
          tabIndex={activeTab === "overview" ? 0 : -1}
          className={`tp-financial-tab-btn tp-profit-tab-btn ${
            activeTab === "overview" ? "is-active" : ""
          }`}
          onClick={() => setActiveTab("overview")}
        >
          <LayoutDashboard size={14} className="tp-tab-icon" />
          <span>Visão Geral</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-profitability-products"
          aria-selected={activeTab === "products"}
          aria-controls="panel-profitability-products"
          tabIndex={activeTab === "products" ? 0 : -1}
          className={`tp-financial-tab-btn tp-profit-tab-btn ${
            activeTab === "products" ? "is-active" : ""
          }`}
          onClick={() => setActiveTab("products")}
        >
          <Package size={14} className="tp-tab-icon" />
          <span>Produtos</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-profitability-sales"
          aria-selected={activeTab === "sales"}
          aria-controls="panel-profitability-sales"
          tabIndex={activeTab === "sales" ? 0 : -1}
          className={`tp-financial-tab-btn tp-profit-tab-btn ${
            activeTab === "sales" ? "is-active" : ""
          }`}
          onClick={() => setActiveTab("sales")}
        >
          <ShoppingCart size={14} className="tp-tab-icon" />
          <span>Vendas</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-profitability-customers"
          aria-selected={activeTab === "customers"}
          aria-controls="panel-profitability-customers"
          tabIndex={activeTab === "customers" ? 0 : -1}
          className={`tp-financial-tab-btn tp-profit-tab-btn ${
            activeTab === "customers" ? "is-active" : ""
          }`}
          onClick={() => setActiveTab("customers")}
        >
          <Users size={14} className="tp-tab-icon" />
          <span>Clientes</span>
        </button>
      </div>

      {/* 4. Conteúdo das Visões Internas */}
      <div className="tp-profit-tab-content">
        {activeTab === "overview" && (
          <ProfitabilityOverviewTab
            data={data}
            selectedChannel={selectedChannel}
            onSelectChannel={onSelectChannel}
            selectedCategorySourceId={selectedCategorySourceId}
            onSelectCategorySourceId={onSelectCategorySourceId}
            categoryTree={categoryTree}
          />
        )}

        {activeTab === "products" && (
          <ProfitabilityProductsTab
            from={effectiveFrom}
            to={effectiveTo}
            categoryTree={categoryTree}
            initialChannel={selectedChannel}
            initialCategorySourceId={selectedCategorySourceId}
          />
        )}

        {activeTab === "sales" && (
          <ProfitabilitySalesTab
            from={effectiveFrom}
            to={effectiveTo}
            initialChannel={selectedChannel}
          />
        )}

        {activeTab === "customers" && (
          <ProfitabilityCustomersTab
            from={effectiveFrom}
            to={effectiveTo}
            initialChannel={selectedChannel}
          />
        )}
      </div>
    </section>
  );
}
