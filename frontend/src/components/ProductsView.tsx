import { AlertCircle, RefreshCw } from "lucide-react";
import type { ProductsOverviewResult } from "../api/bi";
import { ProductKpiGrid } from "./ProductKpiGrid";
import { CatalogContextCard } from "./CatalogContextCard";
import { ProductReconciliationBanner } from "./ProductReconciliationBanner";
import { TopProductsCard } from "./TopProductsCard";
import { ProductCategoryMixCard } from "./ProductCategoryMixCard";
import { ProductChannelMixCard } from "./ProductChannelMixCard";

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

          {/* Skeleton Context */}
          <div className="tp-card tp-skeleton-card" style={{ height: 80 }}>
            <div className="tp-skeleton-line tp-skeleton-short" />
          </div>

          {/* Skeleton Split */}
          <div className="tp-products-split-grid">
            <div className="tp-card tp-skeleton-card" style={{ minHeight: 400 }}>
              <div className="tp-skeleton-line tp-skeleton-short" />
              <div className="tp-skeleton-line tp-skeleton-chart-body" />
            </div>
            <div className="tp-products-side-col">
              <div className="tp-card tp-skeleton-card" style={{ minHeight: 200 }}>
                <div className="tp-skeleton-line tp-skeleton-short" />
              </div>
              <div className="tp-card tp-skeleton-card" style={{ minHeight: 180 }}>
                <div className="tp-skeleton-line tp-skeleton-short" />
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!data) {
    return null;
  }

  const { summary, topProducts, categories, channelMix, reconciliation } = data;

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

      {/* 1. Primeira Linha — 4 KPIs */}
      <ProductKpiGrid summary={summary} />

      {/* 2. Bloco Contextual de Catálogo & Estoque */}
      <CatalogContextCard summary={summary} />

      {/* 3. Seção Principal: Mais Vendidos (Largura Total) */}
      <section className="tp-products-full-section" aria-label="Ranking de Produtos">
        <TopProductsCard
          products={topProducts}
          totalRevenue={summary.realizedRevenue}
          totalQuantity={summary.realizedQuantity}
        />
      </section>

      {/* 4. Seção Complementar: Mix por Categoria e Mix por Canal lado a lado */}
      <div className="tp-products-complementary-grid">
        <ProductCategoryMixCard
          categories={categories}
          totalRevenue={summary.realizedRevenue}
        />

        <ProductChannelMixCard
          channelMix={channelMix}
          totalRevenue={summary.realizedRevenue}
        />
      </div>
    </section>
  );
}
