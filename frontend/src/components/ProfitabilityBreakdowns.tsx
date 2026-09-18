import type {
  CommercialChannel,
  ProfitabilityChannelItem,
  ProfitabilityRootCategoryItem,
} from "../api/bi";
import { formatCurrency, formatNumber } from "../utils/formatters";

interface ProfitabilityBreakdownsProps {
  channels: ProfitabilityChannelItem[];
  rootCategories: ProfitabilityRootCategoryItem[];
  selectedChannel: CommercialChannel | null;
  onSelectChannel: (channel: CommercialChannel | null) => void;
  selectedCategorySourceId: string | null;
  onSelectCategorySourceId: (sourceId: string | null) => void;
}

export function ProfitabilityBreakdowns({
  channels,
  rootCategories,
  selectedChannel,
  onSelectChannel,
  selectedCategorySourceId,
  onSelectCategorySourceId,
}: ProfitabilityBreakdownsProps) {
  return (
    <div className="tp-profit-split-grid">
      {/* Card 1 — Rentabilidade por canal */}
      <div className="tp-card tp-profit-card">
        <div className="tp-card-header">
          <div>
            <h3 className="tp-card-title">Rentabilidade por Canal</h3>
            <p className="tp-card-subtitle">
              Desempenho de margem estimada entre Atacado e Varejo
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

        <div className="tp-breakdown-table-wrapper">
          <table className="tp-breakdown-table">
            <thead>
              <tr>
                <th>Canal</th>
                <th className="tp-text-right">Receita</th>
                <th className="tp-text-right">CMV Est.</th>
                <th className="tp-text-right">Lucro Est.</th>
                <th className="tp-text-right">Margem %</th>
                <th className="tp-text-right">Cobertura</th>
              </tr>
            </thead>
            <tbody>
              {channels.length === 0 ? (
                <tr>
                  <td colSpan={6} className="tp-table-empty">
                    Nenhuma movimentação para o canal selecionado.
                  </td>
                </tr>
              ) : (
                channels.map((c) => {
                  const isSelected = selectedChannel === c.channel;
                  const isNegative =
                    c.estimatedGrossMarginPercent !== null &&
                    c.estimatedGrossMarginPercent < 0;

                  return (
                    <tr
                      key={c.channel}
                      className={`tp-clickable-row ${isSelected ? "is-selected" : ""}`}
                      onClick={() =>
                        onSelectChannel(isSelected ? null : c.channel)
                      }
                    >
                      <td>
                        <div className="tp-breakdown-name-cell">
                          <span className="tp-breakdown-title">
                            {c.channel === "ATACADO"
                              ? "Atacado"
                              : c.channel === "VAREJO"
                              ? "Varejo"
                              : c.channel}
                          </span>
                        </div>
                      </td>
                      <td className="tp-text-right tp-font-mono">
                        {formatCurrency(c.realizedRevenue)}
                      </td>
                      <td className="tp-text-right tp-font-mono tp-color-blue">
                        {formatCurrency(c.estimatedCOGS)}
                      </td>
                      <td className="tp-text-right tp-font-mono tp-color-teal">
                        {formatCurrency(c.estimatedGrossProfit)}
                      </td>
                      <td className="tp-text-right tp-font-mono">
                        <span
                          className={
                            isNegative
                              ? "tp-profit-negative"
                              : "tp-color-teal"
                          }
                        >
                          {c.estimatedGrossMarginPercent !== null
                            ? `${formatNumber(c.estimatedGrossMarginPercent)}%`
                            : "—"}
                        </span>
                      </td>
                      <td className="tp-text-right tp-font-mono tp-text-muted">
                        {c.costCoveragePercent !== null
                          ? `${formatNumber(c.costCoveragePercent)}%`
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
