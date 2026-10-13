import type {
  CategoryTreeNode,
  CommercialChannel,
  ProfitabilityOverviewResult,
} from "../api/bi";
import { ProfitabilityKpiGrid } from "./ProfitabilityKpiGrid";
import { ProfitabilityTrendChart } from "./ProfitabilityTrendChart";
import { ProfitabilityHighlightsCard } from "./ProfitabilityHighlightsCard";
import { ProfitabilityBreakdowns } from "./ProfitabilityBreakdowns";
import { formatCurrency, formatNumber } from "../utils/formatters";

interface ProfitabilityOverviewTabProps {
  data: ProfitabilityOverviewResult;
  selectedChannel: CommercialChannel | null;
  onSelectChannel: (channel: CommercialChannel | null) => void;
  selectedCategorySourceId: string | null;
  onSelectCategorySourceId: (sourceId: string | null) => void;
  categoryTree: CategoryTreeNode[];
}

export function ProfitabilityOverviewTab({
  data,
  selectedChannel,
  onSelectChannel,
  selectedCategorySourceId,
  onSelectCategorySourceId,
}: ProfitabilityOverviewTabProps) {
  const { summary, trend, trendGranularity, channels, rootCategories, highlights } = data;

  return (
    <div className="tp-profit-overview-container" role="tabpanel" id="panel-profitability-overview" aria-labelledby="tab-profitability-overview">
      {/* ROW 1: 4 KPIs */}
      <ProfitabilityKpiGrid summary={summary} />

      {/* Indicador Secundário Compacto de Cobertura de Custo */}
      <div className="tp-profit-overview-coverage-bar">
        <span className="tp-coverage-bar-label">Cobertura de custo atual:</span>
        <strong className="tp-coverage-bar-value">
          {summary.costCoveragePercent !== null
            ? `${formatNumber(summary.costCoveragePercent)}%`
            : "—"}
        </strong>
        <span className="tp-coverage-bar-sub">
          ({formatCurrency(summary.revenueWithCurrentCost)} de {formatCurrency(summary.realizedRevenue)} da receita com custo cadastrado)
        </span>
        {data.dataQuality && data.dataQuality.movementsWithoutCurrentProduct > 0 && (
          <span className="tp-coverage-bar-orphan">
            • {data.dataQuality.movementsWithoutCurrentProduct} movimentações históricas sem produto atual ({formatCurrency(data.dataQuality.revenueWithoutCurrentProduct)})
          </span>
        )}
      </div>

      {/* ROW 2: Evolução Temporal + Destaques & Alertas */}
      <div className="tp-profit-overview-row2">
        <div className="tp-profit-overview-chart-col">
          <ProfitabilityTrendChart trend={trend} granularity={trendGranularity} />
        </div>
        <div className="tp-profit-overview-highlights-col">
          <ProfitabilityHighlightsCard highlights={highlights} />
        </div>
      </div>

      {/* ROW 3: Canais e Famílias de Categorias */}
      <div className="tp-profit-overview-row3">
        <ProfitabilityBreakdowns
          channels={channels}
          rootCategories={rootCategories}
          selectedChannel={selectedChannel}
          onSelectChannel={onSelectChannel}
          selectedCategorySourceId={selectedCategorySourceId}
          onSelectCategorySourceId={onSelectCategorySourceId}
        />
      </div>
    </div>
  );
}
