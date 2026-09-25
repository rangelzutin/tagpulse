import { useState, useEffect } from "react";
import { AlertCircle } from "lucide-react";
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
    <div className="tp-content-area" aria-label="Decisões">
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
