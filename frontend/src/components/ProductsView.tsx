import { useState } from "react";
import {
  AlertCircle,
  RefreshCw,
  LayoutDashboard,
  ListOrdered,
  Layers,
  AlertTriangle,
} from "lucide-react";
import type { ProductsOverviewResult } from "../api/bi";
import { ProductKpiGrid } from "./ProductKpiGrid";
import { ProductReconciliationBanner } from "./ProductReconciliationBanner";
import { ProductHighlightsCard } from "./ProductHighlightsCard";
import { ProductCommercialLineMixCard } from "./ProductCommercialLineMixCard";
import { ProductCategoryMixCard } from "./ProductCategoryMixCard";
import { ProductShapeSizeMixCard } from "./ProductShapeSizeMixCard";
import { ProductChannelMixCard } from "./ProductChannelMixCard";
import { TopProductsCard } from "./TopProductsCard";
import { ProductStockOpportunitiesCard } from "./ProductStockOpportunitiesCard";

export type ProductsViewTab = "overview" | "ranking" | "mix" | "opportunities";

interface ProductsViewProps {
  data: ProductsOverviewResult | null;
  isLoading: boolean;
  isRefreshing?: boolean;
  error: string | null;
  onRetry: () => void;
  initialTab?: ProductsViewTab;
}

export function ProductsView({
  data,
  isLoading,
  isRefreshing,
  error,
  onRetry,
  initialTab = "overview",
}: ProductsViewProps) {
  const [activeTab, setActiveTab] = useState<ProductsViewTab>(initialTab);

  // Estado de Erro sem dados em cache
  if (error && !data) {
    return (
      <section className="tp-dashboard-section" aria-label="Erro no BI de Produtos">
        <div className="tp-state-card tp-state-error" role="alert">
          <div className="tp-state-icon">
            <AlertCircle size={20} />
          </div>
          <div className="tp-state-content">
            <h3 className="tp-state-title">
              Falha ao consultar indicadores de produtos
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
      <section className="tp-dashboard-section" aria-label="Carregando produtos">
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

          {/* Skeleton Compact Highlights */}
          <div className="tp-card tp-skeleton-card" style={{ minHeight: 180 }}>
            <div className="tp-skeleton-line tp-skeleton-short" />
            <div className="tp-skeleton-line tp-skeleton-long" />
          </div>
        </div>
      </section>
    );
  }

  if (!data) {
    return null;
  }

  const {
    summary,
    topProducts,
    categories,
    categoryMix,
    commercialLineMix,
    shapeSizeMix,
    channelMix,
    stockOpportunities,
    reconciliation,
  } = data;

  const totalOpportunities =
    (stockOpportunities?.zeroStockWithSales?.length ?? 0) +
    (stockOpportunities?.stockWithoutSales?.length ?? 0);

  return (
    <section
      className={`tp-dashboard-section tp-products-section ${isRefreshing ? "is-refreshing" : ""}`}
      aria-label="Painel de Produtos"
    >
      {/* Alerta não impeditivo em caso de erro durante refresh */}
      {error && (
        <div className="tp-state-card tp-state-error tp-state-inline" role="alert">
          <div className="tp-state-icon">
            <AlertCircle size={16} />
          </div>
          <div className="tp-state-content">
            <p className="tp-state-message">
              Não foi possível atualizar os dados: {error}
            </p>
          </div>
        </div>
      )}

      {/* Banner de Reconciliação (exibido apenas quando houver ajuste > 0 no nível global do módulo) */}
      <ProductReconciliationBanner reconciliation={reconciliation} />

      {/* Subnavegação Interna do Módulo Produtos */}
      <nav
        className="tp-financial-nav-tabs tp-products-nav-tabs"
        role="tablist"
        aria-label="Subnavegação do Módulo Produtos"
      >
        <button
          type="button"
          role="tab"
          id="tab-products-overview"
          aria-selected={activeTab === "overview"}
          aria-controls="panel-products-overview"
          className={`tp-financial-tab-btn tp-products-tab-btn ${activeTab === "overview" ? "is-active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          <LayoutDashboard size={14} className="tp-tab-icon" />
          <span>Visão Geral</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-products-ranking"
          aria-selected={activeTab === "ranking"}
          aria-controls="panel-products-ranking"
          className={`tp-financial-tab-btn tp-products-tab-btn ${activeTab === "ranking" ? "is-active" : ""}`}
          onClick={() => setActiveTab("ranking")}
        >
          <ListOrdered size={14} className="tp-tab-icon" />
          <span>Ranking</span>
          {topProducts && topProducts.length > 0 && (
            <span className="tp-tab-pill-badge" title={`${topProducts.length} produtos classificados`}>
              {topProducts.length}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          id="tab-products-mix"
          aria-selected={activeTab === "mix"}
          aria-controls="panel-products-mix"
          className={`tp-financial-tab-btn tp-products-tab-btn ${activeTab === "mix" ? "is-active" : ""}`}
          onClick={() => setActiveTab("mix")}
        >
          <Layers size={14} className="tp-tab-icon" />
          <span>Mix</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-products-opportunities"
          aria-selected={activeTab === "opportunities"}
          aria-controls="panel-products-opportunities"
          className={`tp-financial-tab-btn tp-products-tab-btn ${activeTab === "opportunities" ? "is-active" : ""}`}
          onClick={() => setActiveTab("opportunities")}
        >
          <AlertTriangle size={14} className="tp-tab-icon" />
          <span>Oportunidades</span>
          {totalOpportunities > 0 && (
            <span
              className="tp-tab-pill-badge is-amber"
              title={`${totalOpportunities} oportunidades de estoque`}
            >
              {totalOpportunities}
            </span>
          )}
        </button>
      </nav>

      {/* Conteúdo das Visões Internas */}
      <div className="tp-financial-tab-content tp-products-tab-content">
        {/* VISÃO 1: Visão Geral (Executiva e Curta) */}
        {activeTab === "overview" && (
          <div
            id="panel-products-overview"
            role="tabpanel"
            aria-labelledby="tab-products-overview"
            className="tp-financial-tab-panel tp-products-tab-panel"
          >
            {/* KPIs Comerciais + Faixa Compacta de Catálogo */}
            <ProductKpiGrid summary={summary} />

            {/* Destaques Compactos do Mix */}
            <ProductHighlightsCard
              commercialLineMix={commercialLineMix}
              categories={categoryMix ?? categories}
              shapeSizeMix={shapeSizeMix}
              channelMix={channelMix}
              onViewMix={() => setActiveTab("mix")}
            />
          </div>
        )}

        {/* VISÃO 2: Ranking Analítico Completo */}
        {activeTab === "ranking" && (
          <div
            id="panel-products-ranking"
            role="tabpanel"
            aria-labelledby="tab-products-ranking"
            className="tp-financial-tab-panel tp-products-tab-panel"
          >
            <section className="tp-products-ranking-section" aria-label="Ranking Analítico de Produtos">
              <TopProductsCard
                products={topProducts}
                totalRevenue={summary.realizedRevenue}
                totalQuantity={summary.realizedQuantity}
              />
            </section>
          </div>
        )}

        {/* VISÃO 3: Mix Completo (3 Colunas Polidas 3B.5) */}
        {activeTab === "mix" && (
          <div
            id="panel-products-mix"
            role="tabpanel"
            aria-labelledby="tab-products-mix"
            className="tp-financial-tab-panel tp-products-tab-panel"
          >
            <section className="tp-products-mix-section" aria-label="Diagnóstico do Mix de Produtos">
              <div className="tp-products-mix-grid">
                <div className="tp-mix-col tp-mix-col-stack">
                  <ProductCommercialLineMixCard
                    commercialLineMix={commercialLineMix}
                    totalRevenue={summary.realizedRevenue}
                  />

                  <ProductChannelMixCard
                    channelMix={channelMix}
                    totalRevenue={summary.realizedRevenue}
                  />
                </div>

                <div className="tp-mix-col tp-mix-col-category">
                  <ProductCategoryMixCard
                    categories={categoryMix ?? categories}
                    totalRevenue={summary.realizedRevenue}
                  />
                </div>

                <div className="tp-mix-col tp-mix-col-shapes">
                  <ProductShapeSizeMixCard
                    shapeSizeMix={shapeSizeMix}
                  />
                </div>
              </div>
            </section>
          </div>
        )}

        {/* VISÃO 4: Oportunidades de Estoque */}
        {activeTab === "opportunities" && (
          <div
            id="panel-products-opportunities"
            role="tabpanel"
            aria-labelledby="tab-products-opportunities"
            className="tp-financial-tab-panel tp-products-tab-panel"
          >
            {stockOpportunities && (
              <section className="tp-products-opportunities-section" aria-label="Oportunidades de Estoque">
                <ProductStockOpportunitiesCard
                  opportunities={stockOpportunities}
                />
              </section>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
