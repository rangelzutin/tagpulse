import { useState, useCallback, useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import {
  fetchCategoryTree,
  type CategoryTreeNode,
  type CoverageBucket,
  type InventoryOverviewResult,
} from "../api/bi";
import { InventoryKpiGrid } from "./InventoryKpiGrid";
import { InventoryProblemCards } from "./InventoryProblemCards";
import { InventoryCategorySalesCard } from "./InventoryCategorySalesCard";
import { InventoryCategoryCapitalCard } from "./InventoryCategoryCapitalCard";
import { InventoryCoverageCard } from "./InventoryCoverageCard";
import {
  InventoryProductsTable,
  type TableStatusFilter,
} from "./InventoryProductsTable";

interface InventoryViewProps {
  data: InventoryOverviewResult | null;
  isLoading: boolean;
  isRefreshing?: boolean;
  error: string | null;
  onRetry: () => void;
}

export function InventoryView({
  data,
  isLoading,
  isRefreshing = false,
  error,
  onRetry,
}: InventoryViewProps) {
  // Árvore de categorias carregada do backend
  const [categoryTree, setCategoryTree] = useState<CategoryTreeNode[]>([]);

  // Estado unificado e coordenado dos filtros da tabela
  const [statusFilter, setStatusFilter] = useState<TableStatusFilter>("ALL");
  const [coverageBucket, setCoverageBucket] = useState<CoverageBucket | null>(null);
  const [selectedCategorySourceId, setSelectedCategorySourceId] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    async function loadTree() {
      try {
        const res = await fetchCategoryTree();
        if (!isCancelled) {
          setCategoryTree(res.categories);
        }
      } catch {
        // Falha não-bloqueante na árvore
      }
    }
    loadTree();
    return () => {
      isCancelled = true;
    };
  }, [isRefreshing]);

  const scrollToTable = () => {
    const el = document.getElementById("tabela-estoque");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // 1. Clique em bucket de Cobertura (abre visão limpa daquele bucket)
  const handleSelectCoverageBucket = useCallback((bucket: CoverageBucket) => {
    setCoverageBucket(bucket);
    setStatusFilter("ALL");
    setSelectedCategorySourceId(null);
    scrollToTable();
  }, []);

  // 2. Clique em "Sem saída física na janela" do card Cobertura
  const handleSelectNoSalesCoverage = useCallback(() => {
    setStatusFilter("NO_SALES_IN_WINDOW");
    setCoverageBucket(null);
    setSelectedCategorySourceId(null);
    scrollToTable();
  }, []);

  // 3. Clique em indicador de Situação do Estoque
  const handleSelectContextFilter = useCallback((filter: TableStatusFilter) => {
    setStatusFilter(filter);
    setCoverageBucket(null);
    setSelectedCategorySourceId(null);
    scrollToTable();
  }, []);

  // 4a. Clique no card de Saída Recente por Categoria (categorySourceId + SOLD_IN_WINDOW)
  const handleSelectSalesCategory = useCallback((categorySourceId: string | null) => {
    setSelectedCategorySourceId(categorySourceId);
    setStatusFilter("SOLD_IN_WINDOW");
    setCoverageBucket(null);
    scrollToTable();
  }, []);

  // 4b. Clique no card de Capital por Categoria (geral ou somente sem saída)
  const handleSelectCategory = useCallback((categorySourceId: string | null, onlyNoSales = false) => {
    setSelectedCategorySourceId(categorySourceId);
    setCoverageBucket(null);
    setStatusFilter(onlyNoSales ? "NO_SALES_IN_WINDOW" : "ALL");
    scrollToTable();
  }, []);

  // 5. Callback para "Ver todos" dos cards de problemas
  const handleViewAll = useCallback((filter: "demand_without_stock" | "no_sales") => {
    setStatusFilter(filter === "demand_without_stock" ? "DEMAND_WITHOUT_STOCK" : "NO_SALES_IN_WINDOW");
    setCoverageBucket(null);
    setSelectedCategorySourceId(null);
    scrollToTable();
  }, []);

  // 6. Reset total de todos os filtros
  const handleResetAllFilters = useCallback(() => {
    setStatusFilter("ALL");
    setCoverageBucket(null);
    setSelectedCategorySourceId(null);
  }, []);

  // Estado de Erro sem dados em cache
  if (error && !data) {
    return (
      <section className="tp-dashboard-section" aria-label="Erro em Estoque e Giro">
        <div className="tp-state-card tp-state-error" role="alert">
          <div className="tp-state-icon">
            <AlertCircle size={20} />
          </div>
          <div className="tp-state-content">
            <h3 className="tp-state-title">
              Falha ao consultar indicadores de Estoque &amp; Giro
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

  // Estado de Skeleton Inicial (sem dados anteriores)
  if (isLoading && !data) {
    return (
      <section
        className="tp-dashboard-section tp-inventory-section"
        aria-label="Carregando Estoque e Giro"
      >
        <div className="tp-section-skeleton">
          {/* Skeleton LINHA 1: KPIs */}
          <div className="tp-kpi-grid">
            {[1, 2, 3, 4].map((idx) => (
              <div key={idx} className="tp-kpi-card tp-skeleton-card">
                <div className="tp-skeleton-line tp-skeleton-short" />
                <div className="tp-skeleton-line tp-skeleton-long" />
              </div>
            ))}
          </div>

          {/* Skeleton LINHA 2: 4 Cards Situação do Estoque */}
          <div className="tp-situation-cards-grid">
            {[1, 2, 3, 4].map((idx) => (
              <div key={idx} className="tp-situation-mini-card tp-skeleton-card" style={{ minHeight: 84 }}>
                <div className="tp-skeleton-line tp-skeleton-short" />
                <div className="tp-skeleton-line tp-skeleton-long" />
              </div>
            ))}
          </div>

          {/* Skeleton LINHA 3: Problem Cards (2 colunas) */}
          <div className="tp-inventory-problems-grid">
            <div className="tp-card tp-skeleton-card" style={{ minHeight: 320 }}>
              <div className="tp-skeleton-line tp-skeleton-short" />
              <div className="tp-skeleton-line tp-skeleton-chart-body" />
            </div>
            <div className="tp-card tp-skeleton-card" style={{ minHeight: 320 }}>
              <div className="tp-skeleton-line tp-skeleton-short" />
              <div className="tp-skeleton-line tp-skeleton-chart-body" />
            </div>
          </div>

          {/* Skeleton LINHA 4: Categorias (Saída Recente + Capital sem saída) */}
          <div className="tp-inventory-split-grid">
            <div className="tp-card tp-skeleton-card" style={{ minHeight: 300 }}>
              <div className="tp-skeleton-line tp-skeleton-short" />
              <div className="tp-skeleton-line tp-skeleton-chart-body" />
            </div>
            <div className="tp-card tp-skeleton-card" style={{ minHeight: 300 }}>
              <div className="tp-skeleton-line tp-skeleton-short" />
              <div className="tp-skeleton-line tp-skeleton-chart-body" />
            </div>
          </div>

          {/* Skeleton LINHA 5: Cobertura Estimada Full Width */}
          <div className="tp-card tp-skeleton-card" style={{ minHeight: 180 }}>
            <div className="tp-skeleton-line tp-skeleton-short" />
            <div className="tp-skeleton-line tp-skeleton-chart-body" />
          </div>

          {/* Skeleton LINHA 6: Tabela */}
          <div className="tp-card tp-skeleton-card" style={{ minHeight: 400 }}>
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

  const { summary, coverageDistribution, products, categories, dataQuality } = data;

  return (
    <section
      className={`tp-dashboard-section tp-inventory-section ${
        isRefreshing ? "is-refreshing" : ""
      }`}
      aria-label="Painel de Estoque e Giro"
    >
      {/* Alerta não impeditivo em caso de erro durante refresh em background */}
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

      {/* LINHA 1 & 2: 4 KPIs Principais + 4 Cards Situação do Estoque */}
      <InventoryKpiGrid
        summary={summary}
        dataQuality={dataQuality}
        activeFilter={selectedCategorySourceId === null && coverageBucket === null ? statusFilter : undefined}
        onSelectContextFilter={handleSelectContextFilter}
      />

      {/* LINHA 3: Demanda sem estoque | Capital sem saída */}
      <InventoryProblemCards products={products} onViewAll={handleViewAll} />

      {/* LINHA 4: Saída recente por categoria | Capital sem saída por categoria */}
      <div className="tp-inventory-split-grid">
        <InventoryCategorySalesCard
          categories={categories}
          selectedCategorySourceId={selectedCategorySourceId}
          activeStatusFilter={statusFilter}
          onSelectCategory={handleSelectSalesCategory}
        />
        <InventoryCategoryCapitalCard
          categories={categories}
          selectedCategorySourceId={selectedCategorySourceId}
          activeStatusFilter={statusFilter}
          onSelectCategory={handleSelectCategory}
        />
      </div>

      {/* LINHA 5: Cobertura estimada — FULL WIDTH */}
      <InventoryCoverageCard
        distribution={coverageDistribution}
        activeBucket={coverageBucket}
        isNoSalesActive={selectedCategorySourceId === null && coverageBucket === null && statusFilter === "NO_SALES_IN_WINDOW"}
        onSelectBucket={handleSelectCoverageBucket}
        onSelectNoSales={handleSelectNoSalesCoverage}
      />

      {/* LINHA 6: Saúde do estoque — FULL WIDTH */}
      <InventoryProductsTable
        products={products}
        categoryTree={categoryTree}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        coverageBucket={coverageBucket}
        onCoverageBucketChange={setCoverageBucket}
        selectedCategorySourceId={selectedCategorySourceId}
        onCategorySourceIdChange={setSelectedCategorySourceId}
        onResetAllFilters={handleResetAllFilters}
      />
    </section>
  );
}
