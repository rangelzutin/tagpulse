import type {
  CommercialChannel,
  ProfitabilityChannelItem,
  ProfitabilityRootCategoryItem,
} from "../api/bi";
import { formatChannelLabel, formatCurrency, formatNumber } from "../utils/formatters";

interface ProfitabilityBreakdownsProps {
  channels: ProfitabilityChannelItem[];
  rootCategories: ProfitabilityRootCategoryItem[];
  selectedChannel: CommercialChannel | null;
  onSelectChannel: (channel: CommercialChannel | null) => void;
  selectedCategorySourceId: string | null;
  onSelectCategorySourceId: (sourceId: string | null) => void;
}

function getChannelBadgeClass(channel: CommercialChannel): string {
  switch (channel) {
    case "ATACADO":
      return "tp-channel-badge-atacado";
    case "VAREJO":
      return "tp-channel-badge-varejo";
    case "CONFLITO":
      return "tp-channel-badge-conflito";
    case "INDETERMINADO":
    default:
      return "tp-channel-badge-indeterminado";
  }
}

export function ProfitabilityBreakdowns({
  channels,
  rootCategories,
  selectedChannel,
  onSelectChannel,
  selectedCategorySourceId,
  onSelectCategorySourceId,
}: ProfitabilityBreakdownsProps) {
  const primaryChannels = channels
    .filter((c) => c.channel === "ATACADO" || c.channel === "VAREJO")
    .sort((a, b) => (a.channel === "ATACADO" ? -1 : 1));

  const secondaryChannels = channels.filter(
    (c) => c.channel !== "ATACADO" && c.channel !== "VAREJO",
  );

  const renderChannelCard = (c: ProfitabilityChannelItem, isSecondary = false) => {
    const isSelected = selectedChannel === c.channel;
    const isNegative =
      c.estimatedGrossMarginPercent !== null &&
      c.estimatedGrossMarginPercent < 0;

    return (
      <div
        key={c.channel}
        className={`tp-profit-channel-card ${isSecondary ? "tp-profit-channel-card-secondary" : ""} ${isSelected ? "is-selected" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => onSelectChannel(isSelected ? null : c.channel)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelectChannel(isSelected ? null : c.channel);
          }
        }}
      >
        <div className="tp-profit-channel-card-header">
          <span className={`tp-channel-badge ${getChannelBadgeClass(c.channel)}`}>
            {formatChannelLabel(c.channel)}
          </span>
          {isSelected && (
            <span className="tp-profit-channel-selected-badge">Filtrado</span>
          )}
        </div>

        <div className="tp-profit-channel-metrics">
          <div className="tp-profit-channel-metric-row">
            <span className="tp-profit-channel-metric-label">Receita realizada:</span>
            <span className="tp-profit-channel-metric-value tp-font-mono">
              {formatCurrency(c.realizedRevenue)}
            </span>
          </div>
          <div className="tp-profit-channel-metric-row">
            <span className="tp-profit-channel-metric-label">Lucro bruto estimado:</span>
            <span
              className={`tp-profit-channel-metric-value tp-font-mono ${
                c.estimatedGrossProfit < 0
                  ? "tp-value-negative"
                  : "tp-color-teal"
              }`}
            >
              {formatCurrency(c.estimatedGrossProfit)}
            </span>
          </div>
          <div className="tp-profit-channel-metric-row">
            <span className="tp-profit-channel-metric-label">Margem bruta estimada:</span>
            <span
              className={`tp-profit-channel-metric-value tp-font-mono tp-font-bold ${
                isNegative ? "tp-profit-negative" : "tp-color-teal"
              }`}
            >
              {c.estimatedGrossMarginPercent !== null
                ? `${formatNumber(c.estimatedGrossMarginPercent)}%`
                : "—"}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="tp-profit-split-grid">
      {/* Card 1 — Rentabilidade por canal */}
      <div className="tp-card tp-profit-card">
        <div className="tp-card-header">
          <div>
            <h3 className="tp-card-title">Rentabilidade por Canal</h3>
            <p className="tp-card-subtitle">
              Comparação direta de receita, lucro e margem entre canais
            </p>
          </div>
          {selectedChannel && (
            <button
              type="button"
              className="tp-btn-clear-inline"
              onClick={() => onSelectChannel(null)}
            >
              Ver todos
            </button>
          )}
        </div>

        <div className="tp-profit-channel-cards-wrapper">
          {channels.length === 0 ? (
            <div className="tp-empty-message">
              Nenhuma movimentação para os canais no período.
            </div>
          ) : (
            <>
              {primaryChannels.length > 0 && (
                <div className="tp-profit-channel-cards-grid">
                  {primaryChannels.map((c) => renderChannelCard(c, false))}
                </div>
              )}

              {primaryChannels.length === 0 && secondaryChannels.length > 0 && (
                <div className="tp-profit-channel-cards-grid">
                  {secondaryChannels.map((c) => renderChannelCard(c, false))}
                </div>
              )}

              {primaryChannels.length > 0 && secondaryChannels.length > 0 && (
                <div className="tp-profit-channel-secondary-wrapper">
                  <div className="tp-profit-channel-secondary-title">
                    Canais Secundários
                  </div>
                  <div className="tp-profit-channel-secondary-grid">
                    {secondaryChannels.map((c) => renderChannelCard(c, true))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Card 2 — Rentabilidade por família / categoria mãe */}
      <div className="tp-card tp-profit-card">
        <div className="tp-card-header">
          <div>
            <h3 className="tp-card-title">
              Rentabilidade por Família / Categoria Mãe
            </h3>
            <p className="tp-card-subtitle">
              Agrupamento pelas categorias raízes do catálogo TagPlus
            </p>
          </div>
          {selectedCategorySourceId && (
            <button
              type="button"
              className="tp-btn-clear-inline"
              onClick={() => onSelectCategorySourceId(null)}
            >
              Ver todas
            </button>
          )}
        </div>

        <div className="tp-breakdown-table-wrapper">
          <table className="tp-breakdown-table">
            <thead>
              <tr>
                <th>Família / Categoria Mãe</th>
                <th className="tp-text-right">Receita</th>
                <th className="tp-text-right">CMV Est.</th>
                <th className="tp-text-right">Lucro Est.</th>
                <th className="tp-text-right">Margem %</th>
                <th className="tp-text-right">Cobertura</th>
              </tr>
            </thead>
            <tbody>
              {rootCategories.length === 0 ? (
                <tr>
                  <td colSpan={6} className="tp-table-empty">
                    Nenhuma categoria encontrada no período.
                  </td>
                </tr>
              ) : (
                rootCategories.map((rc) => {
                  const isSelected =
                    selectedCategorySourceId === rc.categorySourceId;
                  const isNegative =
                    rc.estimatedGrossMarginPercent !== null &&
                    rc.estimatedGrossMarginPercent < 0;

                  return (
                    <tr
                      key={rc.categorySourceId}
                      className={`tp-clickable-row ${isSelected ? "is-selected" : ""}`}
                      onClick={() =>
                        onSelectCategorySourceId(
                          isSelected ? null : rc.categorySourceId,
                        )
                      }
                    >
                      <td>
                        <div className="tp-breakdown-name-cell">
                          <span className="tp-breakdown-title">
                            {rc.category}
                          </span>
                        </div>
                      </td>
                      <td className="tp-text-right tp-font-mono">
                        {formatCurrency(rc.realizedRevenue)}
                      </td>
                      <td className="tp-text-right tp-font-mono tp-color-blue">
                        {formatCurrency(rc.estimatedCOGS)}
                      </td>
                      <td className="tp-text-right tp-font-mono tp-color-teal">
                        {formatCurrency(rc.estimatedGrossProfit)}
                      </td>
                      <td className="tp-text-right tp-font-mono">
                        <span
                          className={
                            isNegative
                              ? "tp-profit-negative"
                              : "tp-color-teal"
                          }
                        >
                          {rc.estimatedGrossMarginPercent !== null
                            ? `${formatNumber(rc.estimatedGrossMarginPercent)}%`
                            : "—"}
                        </span>
                      </td>
                      <td className="tp-text-right tp-font-mono tp-text-muted">
                        {rc.costCoveragePercent !== null
                          ? `${formatNumber(rc.costCoveragePercent)}%`
                          : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
