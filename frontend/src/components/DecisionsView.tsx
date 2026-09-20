import { useState, useEffect } from "react";
import { AlertCircle, RefreshCw, SlidersHorizontal } from "lucide-react";
import type {
  CategoryTreeNode,
  DecisionsOverviewResult,
  InventoryWindowDays,
} from "../api/bi";
import { DecisionsKpiGrid } from "./DecisionsKpiGrid";
import { DecisionsReplenishmentTable } from "./DecisionsReplenishmentTable";
import { DecisionsCapitalTable } from "./DecisionsCapitalTable";
import { InventoryCategoryTreeSelector } from "./InventoryCategoryTreeSelector";
import { InventoryWindowSelector } from "./InventoryWindowSelector";
import { formatDateBr } from "../utils/formatters";

interface DecisionsViewProps {
  data: DecisionsOverviewResult | null;
  isLoading: boolean;
  isRefreshing?: boolean;
  error: string | null;
  windowDays: InventoryWindowDays;
  onSelectWindowDays: (w: InventoryWindowDays) => void;
  categoryTree: CategoryTreeNode[];
  selectedCategorySourceId: string | null;
  onSelectCategorySourceId: (catId: string | null) => void;
  onRetry?: () => void;
  onRefresh?: () => void;
}

export function DecisionsView({
  data,
  isLoading,
  isRefreshing = false,
  error,
  windowDays,
  onSelectWindowDays,
  categoryTree,
  selectedCategorySourceId,
  onSelectCategorySourceId,
  onRetry,
  onRefresh,
}: DecisionsViewProps) {
  // Trigger para resetar paginação interna das tabelas quando filtros mudam
  const [filterResetTrigger, setFilterResetTrigger] = useState(0);

  useEffect(() => {
    setFilterResetTrigger((prev) => prev + 1);
  }, [windowDays, selectedCategorySourceId]);

  const handleAction = onRefresh ?? onRetry;

  return (
    <div className="tp-content-area" aria-label="Central de Decisões">
      {/* Top Controls Header */}
      <header className="tp-view-header">
        <div className="tp-view-header-main">
          <div className="tp-view-title-group">
            <div className="tp-view-icon-badge tp-badge-emerald">
              <SlidersHorizontal size={20} />
            </div>
            <div>
              <h1 className="tp-view-title">Central de Decisões</h1>
              <p className="tp-view-description">
                Decisões operacionais de compras e capital integrando vendas recentes, estoque atual e rentabilidade estimada ao custo atual
              </p>
            </div>
          </div>

          <div className="tp-view-actions">
            {data?.meta.asOfDate && (
              <div className="tp-asof-badge" title="Data de corte operacional">
                <span className="tp-asof-label">Posição de Estoque:</span>
                <span className="tp-asof-date">{formatDateBr(data.meta.asOfDate)}</span>
              </div>
            )}

            {handleAction && (
              <button
                type="button"
                className={`tp-action-btn ${isRefreshing ? "is-loading" : ""}`}
                onClick={handleAction}
                disabled={isLoading || isRefreshing}
                title="Atualizar dados"
                aria-label="Atualizar dados da Central de Decisões"
              >
                <RefreshCw size={15} className={isRefreshing ? "tp-spin" : ""} />
                <span>Atualizar</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Toolbar: Window selector & Category selector */}
        <div className="tp-decisions-filter-toolbar">
          <div className="tp-filter-group-item">
            <span className="tp-filter-label">Janela Móvel:</span>
            <InventoryWindowSelector
              value={windowDays}
              onChange={onSelectWindowDays}
              disabled={isLoading || isRefreshing}
            />
          </div>

          <div className="tp-filter-group-item tp-category-filter-item">
            <span className="tp-filter-label">Categoria / Família:</span>
            <InventoryCategoryTreeSelector
              categories={categoryTree}
              selectedCategorySourceId={selectedCategorySourceId}
              onSelectCategorySourceId={onSelectCategorySourceId}
            />
          </div>
        </div>
      </header>

      {/* Loading state */}
      {isLoading && (
        <div className="tp-loading-state" role="status">
          <div className="tp-spinner" />
          <p className="tp-loading-text">
            Cruzando movimentações recentes, estoque e rentabilidade...
          </p>
        </div>
      )}

      {/* Error state */}
      {!isLoading && error && (
        <div className="tp-error-card" role="alert">
          <div className="tp-error-content">
            <AlertCircle className="tp-error-icon" size={24} />
            <div>
              <h3 className="tp-error-title">Falha ao carregar a Central de Decisões</h3>
              <p className="tp-error-message">{error}</p>
            </div>
          </div>
          {handleAction && (
            <button type="button" className="tp-retry-btn" onClick={handleAction}>
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {/* Main Content */}
      {!isLoading && !error && data && (
        <div className="tp-decisions-content-stack">
          {/* Seção de KPIs Executivos */}
          <DecisionsKpiGrid kpis={data.kpis} windowDays={windowDays} />

          {/* Seção 1: Reposição — Onde Repor Primeiro */}
          <DecisionsReplenishmentTable
            replenishment={data.replenishment}
            windowDays={windowDays}
            onFilterResetTrigger={filterResetTrigger}
          />

          {/* Seção 2: Capital — Onde Evitar Compra & Otimizar Saldo */}
          <DecisionsCapitalTable
            capitalOptimization={data.capitalOptimization}
            windowDays={windowDays}
            onFilterResetTrigger={filterResetTrigger}
          />
        </div>
      )}
    </div>
  );
}
