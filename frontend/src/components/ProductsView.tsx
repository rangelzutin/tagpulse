import { AlertCircle, RefreshCw } from "lucide-react";
import type { ProductsOverviewResult } from "../api/bi";
import { ProductKpiGrid } from "./ProductKpiGrid";
import { ProductReconciliationBanner } from "./ProductReconciliationBanner";
import { ProductCommercialLineMixCard } from "./ProductCommercialLineMixCard";
import { ProductCategoryMixCard } from "./ProductCategoryMixCard";
import { ProductShapeSizeMixCard } from "./ProductShapeSizeMixCard";
import { ProductChannelMixCard } from "./ProductChannelMixCard";
import { TopProductsCard } from "./TopProductsCard";
import { ProductStockOpportunitiesCard } from "./ProductStockOpportunitiesCard";

interface ProductsViewProps {
  data: ProductsOverviewResult | null;
  isLoading: boolean;
  isRefreshing?: boolean;
  error: string | null;
  onRetry: () => void;
}

export function ProductsView({
  data,
  isLoading,
  isRefreshing,
  error,
  onRetry,
}: ProductsViewProps) {
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
          {/* Skeleton KPIs */}
          <div className="tp-kpi-grid">
            {[1, 2, 3, 4].map((idx) => (
              <div key={idx} className="tp-kpi-card tp-skeleton-card">
                <div className="tp-skeleton-line tp-skeleton-short" />
                <div className="tp-skeleton-line tp-skeleton-long" />
              </div>
            ))}
          </div>

          {/* Skeleton Mix Grid */}
          <div className="tp-products-mix-grid">
            {[1, 2, 3, 4].map((idx) => (
              <div key={idx} className="tp-card tp-skeleton-card" style={{ minHeight: 220 }}>
                <div className="tp-skeleton-line tp-skeleton-short" />
                <div className="tp-skeleton-line tp-skeleton-long" />
              </div>
            ))}
          </div>

          {/* Skeleton Ranking Table */}
          <div className="tp-card tp-skeleton-card" style={{ minHeight: 380 }}>
            <div className="tp-skeleton-line tp-skeleton-short" />
            <div className="tp-skeleton-line tp-skeleton-chart-body" />
          </div>

          {/* Skeleton Opportunities Grid */}
          <div className="tp-stock-opportunities-grid">
            {[1, 2].map((idx) => (
              <div key={idx} className="tp-card tp-skeleton-card" style={{ minHeight: 200 }}>
                <div className="tp-skeleton-line tp-skeleton-short" />
                <div className="tp-skeleton-line tp-skeleton-long" />
              </div>
            ))}
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

      {/* Banner de Reconciliação (exibido apenas quando houver ajuste > 0) */}
      <ProductReconciliationBanner reconciliation={reconciliation} />

      {/* BLOCO 1: KPIs Executivos + Contexto do Catálogo Integrado */}
      <ProductKpiGrid summary={summary} />

      {/* BLOCO 2: Diagnóstico do Mix (4 cards em grid responsivo) */}
      <section className="tp-products-mix-section" aria-label="Diagnóstico do Mix de Produtos">
        <div className="tp-products-mix-grid">
          <ProductCommercialLineMixCard
            commercialLineMix={commercialLineMix}
            totalRevenue={summary.realizedRevenue}
          />

          <ProductCategoryMixCard
            categories={categoryMix ?? categories}
            totalRevenue={summary.realizedRevenue}
          />

          <ProductShapeSizeMixCard
            shapeSizeMix={shapeSizeMix}
          />

          <ProductChannelMixCard
            channelMix={channelMix}
            totalRevenue={summary.realizedRevenue}
          />
        </div>
      </section>

      {/* BLOCO 3: Ranking Analítico de Produtos (Largura Total com filtros locais) */}
      <section className="tp-products-ranking-section" aria-label="Ranking Analítico de Produtos">
        <TopProductsCard
          products={topProducts}
          totalRevenue={summary.realizedRevenue}
          totalQuantity={summary.realizedQuantity}
        />
      </section>

      {/* BLOCO 4: Oportunidades de Estoque (2 cards lado a lado) */}
      {stockOpportunities && (
        <section className="tp-products-opportunities-section" aria-label="Oportunidades de Estoque">
          <ProductStockOpportunitiesCard
            opportunities={stockOpportunities}
          />
        </section>
      )}
    </section>
  );
}
