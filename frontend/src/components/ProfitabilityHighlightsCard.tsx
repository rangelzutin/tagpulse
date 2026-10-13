import { Award, AlertOctagon, TrendingDown } from "lucide-react";
import type { ProfitabilityOverviewHighlights } from "../api/bi";
import { formatCurrency, formatNumber } from "../utils/formatters";

interface ProfitabilityHighlightsCardProps {
  highlights?: ProfitabilityOverviewHighlights;
}

export function ProfitabilityHighlightsCard({
  highlights,
}: ProfitabilityHighlightsCardProps) {
  if (!highlights) {
    return null;
  }

  const { topProfitProducts, negativeMarginProductsCount, worstMarginProducts } =
    highlights;

  return (
    <div className="tp-card tp-profit-highlights-card">
      <div className="tp-card-header">
        <div className="tp-card-title-wrap">
          <Award size={16} className="tp-icon-teal" />
          <h3 className="tp-card-title">Destaques de Rentabilidade</h3>
        </div>
        {negativeMarginProductsCount > 0 && (
          <span
            className="tp-badge tp-badge-danger"
            title={`${negativeMarginProductsCount} produtos com margem negativa`}
          >
            {`${negativeMarginProductsCount} com margem negativa`}
          </span>
        )}
      </div>

      <div className="tp-profit-highlights-body">
        {/* Top Lucro */}
        <div className="tp-highlight-section">
          <div className="tp-highlight-section-title">
            <span className="tp-dot tp-dot-teal" />
            <span>Top Lucro Bruto</span>
          </div>
          {topProfitProducts.length === 0 ? (
            <p className="tp-text-muted tp-text-sm">Nenhum produto com lucro no período.</p>
          ) : (
            <ul className="tp-highlight-list">
              {topProfitProducts.slice(0, 3).map((p, idx) => (
                <li key={p.productSourceId} className="tp-highlight-item">
                  <span className="tp-highlight-rank">#{idx + 1}</span>
                  <div className="tp-highlight-info">
                    <span className="tp-highlight-name" title={p.productName}>
                      {p.productName}
                    </span>
                    {p.sku && <span className="tp-highlight-sku">{p.sku}</span>}
                  </div>
                  <div className="tp-highlight-metric">
                    <span className="tp-highlight-profit tp-color-teal">
                      {p.estimatedGrossProfit !== null
                        ? formatCurrency(p.estimatedGrossProfit)
                        : "—"}
                    </span>
                    <span className="tp-highlight-margin">
                      {p.estimatedGrossMarginPercent !== null
                        ? `${formatNumber(p.estimatedGrossMarginPercent)}%`
                        : "—"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Piores Margens / Margem Negativa */}
        <div className="tp-highlight-section">
          <div className="tp-highlight-section-title">
            <span className="tp-dot tp-dot-magenta" />
            <span>Menores Margens</span>
          </div>
          {worstMarginProducts.length === 0 ? (
            <p className="tp-text-muted tp-text-sm">Sem produtos com margem apurada.</p>
          ) : (
            <ul className="tp-highlight-list">
              {worstMarginProducts.slice(0, 3).map((p, idx) => {
                const isNegative =
                  p.estimatedGrossMarginPercent !== null &&
                  p.estimatedGrossMarginPercent < 0;

                return (
                  <li key={p.productSourceId} className="tp-highlight-item">
                    <span className="tp-highlight-rank">#{idx + 1}</span>
                    <div className="tp-highlight-info">
                      <span className="tp-highlight-name" title={p.productName}>
                        {p.productName}
                      </span>
                      {p.sku && <span className="tp-highlight-sku">{p.sku}</span>}
                    </div>
                    <div className="tp-highlight-metric">
                      <span
                        className={`tp-highlight-margin ${isNegative ? "tp-color-magenta tp-font-bold" : "tp-text-muted"}`}
                      >
                        {p.estimatedGrossMarginPercent !== null
                          ? `${formatNumber(p.estimatedGrossMarginPercent)}%`
                          : "—"}
                      </span>
                      <span className="tp-highlight-profit">
                        {p.estimatedGrossProfit !== null
                          ? formatCurrency(p.estimatedGrossProfit)
                          : "—"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
