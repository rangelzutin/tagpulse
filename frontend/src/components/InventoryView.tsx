import { useState, useCallback } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import type { InventoryOverviewResult } from "../api/bi";
import { InventoryKpiGrid } from "./InventoryKpiGrid";
import { InventoryProblemCards } from "./InventoryProblemCards";
import { InventoryCoverageCard } from "./InventoryCoverageCard";
import { InventoryCategoryCapitalCard } from "./InventoryCategoryCapitalCard";
import {
  InventoryProductsTable,
  type TableFilterChip,
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
  const [tableChip, setTableChip] = useState<TableFilterChip>("ALL");

  // Callback para "Ver todos" dos cards centrais
  const handleViewAll = useCallback((filter: "demand_without_stock" | "no_sales") => {
    if (filter === "demand_without_stock") {
      setTableChip("DEMAND_WITHOUT_STOCK");
    } else {
      setTableChip("NO_SALES_IN_WINDOW");
    }

    // Scroll suave para a tabela
    const el = document.getElementById("tabela-estoque");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  // 1. Estado de Erro sem dados em cache
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

  // 2. Estado de Skeleton Inicial (sem dados anteriores)
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

          {/* Skeleton Context Strip */}
          <div className="tp-card tp-skeleton-card" style={{ height: 42 }}>
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

      {/* 1. Grid com 4 KPIs Executivos + Faixa de Contexto */}
      <InventoryKpiGrid summary={summary} dataQuality={dataQuality} />

      {/* 2. Bloco Central: As Duas Pontas do Problema */}
      <InventoryProblemCards products={products} onViewAll={handleViewAll} />

      {/* 3. Cobertura Estimada e Capital sem saída por Categoria lado a lado */}
      <div className="tp-inventory-split-grid">
        <InventoryCoverageCard distribution={coverageDistribution} />
        <InventoryCategoryCapitalCard categories={categories} />
      </div>

      {/* 4. Tabela Operacional Full Width */}
      <InventoryProductsTable
        products={products}
        activeChip={tableChip}
        onChipChange={setTableChip}
      />
    </section>
  );
}
