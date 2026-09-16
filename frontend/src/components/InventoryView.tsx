import { useState, useCallback } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import type { CoverageBucket, InventoryOverviewResult } from "../api/bi";
import { InventoryKpiGrid } from "./InventoryKpiGrid";
import { InventoryProblemCards } from "./InventoryProblemCards";
import { InventoryCoverageCard } from "./InventoryCoverageCard";
import { InventoryCategoryCapitalCard } from "./InventoryCategoryCapitalCard";
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
  // Estado unificado e coordenado dos filtros da tabela
  const [statusFilter, setStatusFilter] = useState<TableStatusFilter>("ALL");
  const [coverageBucket, setCoverageBucket] = useState<CoverageBucket | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

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
    setSelectedCategory("ALL");
    scrollToTable();
  }, []);

  // 2. Clique em "Sem saída física na janela" do card Cobertura
  const handleSelectNoSalesCoverage = useCallback(() => {
    setStatusFilter("NO_SALES_IN_WINDOW");
    setCoverageBucket(null);
    setSelectedCategory("ALL");
    scrollToTable();
  }, []);

  // 3. Clique em indicador de Situação do Estoque
  const handleSelectContextFilter = useCallback((filter: TableStatusFilter) => {
    setStatusFilter(filter);
    setCoverageBucket(null);
    setSelectedCategory("ALL");
    scrollToTable();
  }, []);

  // 4. Clique no card de Capital por Categoria (geral ou somente sem saída)
  const handleSelectCategory = useCallback((category: string, onlyNoSales = false) => {
    setSelectedCategory(category);
    setCoverageBucket(null);
    setStatusFilter(onlyNoSales ? "NO_SALES_IN_WINDOW" : "ALL");
    scrollToTable();
  }, []);

  // 5. Callback para "Ver todos" dos cards de problemas
  const handleViewAll = useCallback((filter: "demand_without_stock" | "no_sales") => {
    setStatusFilter(filter === "demand_without_stock" ? "DEMAND_WITHOUT_STOCK" : "NO_SALES_IN_WINDOW");
    setCoverageBucket(null);
    setSelectedCategory("ALL");
    scrollToTable();
  }, []);

  // 6. Reset total de todos os filtros
  const handleResetAllFilters = useCallback(() => {
    setStatusFilter("ALL");
    setCoverageBucket(null);
    setSelectedCategory("ALL");
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
          {/* Skeleton KPIs */}
          <div className="tp-kpi-grid">
            {[1, 2, 3, 4].map((idx) => (
              <div key={idx} className="tp-kpi-card tp-skeleton-card">
                <div className="tp-skeleton-line tp-skeleton-short" />
                <div className="tp-skeleton-line tp-skeleton-long" />
              </div>
            ))}
          </div>

          {/* Skeleton Situação do Estoque */}
          <div className="tp-card tp-skeleton-card" style={{ height: 60 }}>
            <div className="tp-skeleton-line tp-skeleton-long" />
          </div>

          {/* Skeleton Problem Cards (2 colunas) */}
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

          {/* Skeleton Cobertura + Categorias */}
          <div className="tp-inventory-split-grid">
            <div className="tp-card tp-skeleton-card" style={{ minHeight: 260 }}>
              <div className="tp-skeleton-line tp-skeleton-short" />
              <div className="tp-skeleton-line tp-skeleton-chart-body" />
            </div>
            <div className="tp-card tp-skeleton-card" style={{ minHeight: 260 }}>
              <div className="tp-skeleton-line tp-skeleton-short" />
              <div className="tp-skeleton-line tp-skeleton-chart-body" />
            </div>
          </div>

          {/* Skeleton Tabela */}
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

      {/* 1. Grid com 4 KPIs Executivos + Situação do Estoque */}
      <InventoryKpiGrid
        summary={summary}
        dataQuality={dataQuality}
        activeFilter={selectedCategory === "ALL" && coverageBucket === null ? statusFilter : undefined}
        onSelectContextFilter={handleSelectContextFilter}
      />

      {/* 2. Bloco Central: As Duas Pontas do Problema */}
      <InventoryProblemCards products={products} onViewAll={handleViewAll} />

      {/* 3. Cobertura Estimada e Capital sem saída por Categoria lado a lado */}
      <div className="tp-inventory-split-grid">
        <InventoryCoverageCard
          distribution={coverageDistribution}
          activeBucket={coverageBucket}
          isNoSalesActive={selectedCategory === "ALL" && coverageBucket === null && statusFilter === "NO_SALES_IN_WINDOW"}
          onSelectBucket={handleSelectCoverageBucket}
          onSelectNoSales={handleSelectNoSalesCoverage}
        />
        <InventoryCategoryCapitalCard
          categories={categories}
          selectedCategory={selectedCategory}
          activeStatusFilter={statusFilter}
          onSelectCategory={handleSelectCategory}
        />
      </div>

      {/* 4. Tabela Operacional Full Width com Estado Unificado */}
      <InventoryProductsTable
        products={products}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        coverageBucket={coverageBucket}
        onCoverageBucketChange={setCoverageBucket}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        onResetAllFilters={handleResetAllFilters}
      />
    </section>
  );
}
