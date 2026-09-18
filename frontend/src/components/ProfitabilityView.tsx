import { useState, useCallback } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import type {
  CategoryTreeNode,
  CommercialChannel,
  ProfitabilityOverviewResult,
} from "../api/bi";
import { formatCurrency, formatDateBr, formatNumber } from "../utils/formatters";
import { ProfitabilityKpiGrid } from "./ProfitabilityKpiGrid";
import { ProfitabilityTrendChart } from "./ProfitabilityTrendChart";
import { ProfitabilityBreakdowns } from "./ProfitabilityBreakdowns";
import { ProfitabilityProductsTable } from "./ProfitabilityProductsTable";

interface ProfitabilityViewProps {
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
}

function formatSnapshotDate(isoString: string | null | undefined): string {
  if (!isoString) return "Não disponível";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return isoString;
  }
}

export function ProfitabilityView({
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
}: ProfitabilityViewProps) {
  // Estado de Erro sem dados em cache
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
          {/* Skeleton KPIs */}
          <div className="tp-kpi-grid">
            {[1, 2, 3, 4].map((idx) => (
              <div key={idx} className="tp-kpi-card tp-skeleton-card">
                <div className="tp-skeleton-line tp-skeleton-short" />
                <div className="tp-skeleton-line tp-skeleton-long" />
              </div>
            ))}
          </div>

          {/* Skeleton Disclaimer & Coverage */}
          <div className="tp-card tp-skeleton-card" style={{ height: 90 }}>
            <div className="tp-skeleton-line tp-skeleton-short" />
            <div className="tp-skeleton-line tp-skeleton-long" />
          </div>

          {/* Skeleton Chart */}
          <div className="tp-card tp-skeleton-card" style={{ height: 320 }}>
            <div className="tp-skeleton-line tp-skeleton-short" />
            <div className="tp-skeleton-line tp-skeleton-chart-body" />
          </div>

          {/* Skeleton Breakdowns */}
          <div className="tp-profit-split-grid">
            <div className="tp-card tp-skeleton-card" style={{ height: 260 }}>
              <div className="tp-skeleton-line tp-skeleton-short" />
              <div className="tp-skeleton-line tp-skeleton-chart-body" />
            </div>
            <div className="tp-card tp-skeleton-card" style={{ height: 260 }}>
              <div className="tp-skeleton-line tp-skeleton-short" />
              <div className="tp-skeleton-line tp-skeleton-chart-body" />
            </div>
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
    costSnapshot,
    dataQuality,
    trendGranularity,
    trend,
    channels,
    rootCategories,
    products,
  } = data;

  const handleResetFilters = () => {
    onSelectChannel(null);
    onSelectCategorySourceId(null);
  };

  const isFullCostCoverage =
    summary.costCoveragePercent !== null && summary.costCoveragePercent >= 99.9;

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
        <div className="tp-profit-snapshot-badge" title="Timestamp do catálogo ERP">
          <span className="tp-snapshot-dot" />
          <span>
            Catálogo TagPlus: {formatSnapshotDate(costSnapshot.asOf)}
          </span>
        </div>
      </div>

      {/* 2. Canonical Disclaimer Callout */}
      <div className="tp-profit-disclaimer-box" role="note">
        <div className="tp-disclaimer-icon">
          <Info size={18} />
        </div>
        <div className="tp-disclaimer-content">
          <span className="tp-disclaimer-title">
            Premissa Canônica de Custo Atual de Catálogo
          </span>
          <p className="tp-disclaimer-text">
            Esta análise não representa o CMV histórico apurado no momento de cada venda, mas sim a rentabilidade estimada caso os produtos fossem repostos aos custos atuais cadastrados no catálogo do TagPlus. Itens sem custo cadastrado ou produtos históricos descontinuados têm sua receita realizada preservada na íntegra, mas são isolados do cálculo de margem para evitar distorções.
          </p>
        </div>
      </div>

      {/* 3. Primary KPI Grid */}
      <ProfitabilityKpiGrid summary={summary} />

      {/* 4. Coverage & Data Quality Bar */}
      <div className="tp-card tp-profit-coverage-card">
        <div className="tp-coverage-card-inner">
          <div className="tp-coverage-primary-stat">
            <div className="tp-coverage-stat-header">
              {isFullCostCoverage ? (
                <CheckCircle2 size={16} className="tp-color-teal" />
              ) : (
                <AlertTriangle size={16} className="tp-color-amber" />
              )}
              <span className="tp-coverage-stat-label">
                Cobertura de Custo Atual
              </span>
            </div>
            <div className="tp-coverage-stat-val">
              {summary.costCoveragePercent !== null
                ? `${formatNumber(summary.costCoveragePercent)}%`
                : "—"}
            </div>
            <span className="tp-coverage-stat-sub">
              da receita realizada com custo cadastrado
            </span>
          </div>

          <div className="tp-coverage-details-grid">
            <div className="tp-coverage-detail-item">
              <span className="tp-detail-label">Receita com custo atual:</span>
              <span className="tp-detail-value tp-font-mono tp-color-teal">
                {formatCurrency(summary.revenueWithCurrentCost)}
              </span>
            </div>

            <div className="tp-coverage-detail-item">
              <span className="tp-detail-label">Receita sem custo atual:</span>
              <span
                className={`tp-detail-value tp-font-mono ${
                  summary.revenueWithoutCurrentCost > 0
                    ? "tp-color-magenta"
                    : "tp-text-muted"
                }`}
              >
                {formatCurrency(summary.revenueWithoutCurrentCost)}
              </span>
            </div>

            <div className="tp-coverage-detail-item">
              <span className="tp-detail-label">Produtos no catálogo ERP:</span>
              <span className="tp-detail-value tp-font-mono">
                {formatNumber(costSnapshot.productsWithCostCount)} com custo /{" "}
                {formatNumber(costSnapshot.totalCatalogProducts)} total
              </span>
            </div>

            <div className="tp-coverage-detail-item">
              <span className="tp-detail-label">Classificação de categoria:</span>
              <span className="tp-detail-value tp-font-mono">
                {dataQuality.currentCategoryCoveragePercent !== null
                  ? `${formatNumber(dataQuality.currentCategoryCoveragePercent)}% da receita`
                  : "—"}
              </span>
            </div>
          </div>
        </div>

        {dataQuality.movementsWithoutCurrentProduct > 0 && (
          <div className="tp-coverage-orphan-note">
            <Info size={13} />
            <span>
              {dataQuality.movementsWithoutCurrentProduct} movimentações (
              {formatCurrency(dataQuality.revenueWithoutCurrentProduct)}) pertencem a produtos históricos descontinuados e ausentes do catálogo atual do TagPlus. A receita está 100% preservada nos totais.
            </span>
          </div>
        )}
      </div>

      {/* 5. Temporal Evolution Chart */}
      <ProfitabilityTrendChart
        trend={trend}
        granularity={trendGranularity}
      />

      {/* 6. Channel and Category Family Breakdowns */}
      <ProfitabilityBreakdowns
        channels={channels}
        rootCategories={rootCategories}
        selectedChannel={selectedChannel}
        onSelectChannel={onSelectChannel}
        selectedCategorySourceId={selectedCategorySourceId}
        onSelectCategorySourceId={onSelectCategorySourceId}
      />

      {/* 7. Product Breakdown Table */}
      <ProfitabilityProductsTable
        products={products}
        categoryTree={categoryTree}
        selectedChannel={selectedChannel}
        onSelectChannel={onSelectChannel}
        selectedCategorySourceId={selectedCategorySourceId}
        onSelectCategorySourceId={onSelectCategorySourceId}
        onResetFilters={handleResetFilters}
      />
    </section>
  );
}
