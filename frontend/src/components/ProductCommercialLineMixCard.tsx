import { useState } from "react";
import { Layers, ChevronDown, ChevronUp } from "lucide-react";
import type { ProductMixItem } from "../api/bi";
import { formatCurrency, formatNumber, formatPercent } from "../utils/formatters";

interface ProductCommercialLineMixCardProps {
  commercialLineMix?: ProductMixItem[];
  totalRevenue: number;
}

const DEFAULT_VISIBLE_LINES = 8;

export function ProductCommercialLineMixCard({
  commercialLineMix = [],
  totalRevenue,
}: ProductCommercialLineMixCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!commercialLineMix || commercialLineMix.length === 0) {
    return (
      <section className="tp-card tp-mix-card" aria-label="Mix por Marca / Linha">
        <div className="tp-card-header">
          <div>
            <h3 className="tp-card-title">Mix por Marca / Linha</h3>
            <p className="tp-card-subtitle">
              Distribuição do faturamento e volume por linha comercial
            </p>
          </div>
        </div>
        <div className="tp-empty-message">
          Nenhuma marca ou linha com realização no período selecionado.
        </div>
      </section>
    );
  }

  // Ordena por receita decrescente
  const sortedLines = [...commercialLineMix].sort(
    (a, b) => b.realizedRevenue - a.realizedRevenue,
  );

  const visibleLines = isExpanded
    ? sortedLines
    : sortedLines.slice(0, DEFAULT_VISIBLE_LINES);

  const hasMore = sortedLines.length > DEFAULT_VISIBLE_LINES;

  return (
    <section className="tp-card tp-mix-card" aria-label="Mix por Marca / Linha">
      <div className="tp-card-header">
        <div>
          <div className="tp-title-with-badge">
            <h3 className="tp-card-title">Mix por Marca / Linha</h3>
            <span className="tp-badge-count">
              {hasMore && !isExpanded
                ? `Top ${DEFAULT_VISIBLE_LINES} de ${sortedLines.length}`
                : `${sortedLines.length} linhas`}
            </span>
          </div>
          <p className="tp-card-subtitle">
            Participação de faturamento e volume por linha comercial
          </p>
        </div>
      </div>

      <div className={`tp-mix-ranking-list ${isExpanded ? "is-expanded" : ""}`}>
        {visibleLines.map((line, idx) => {
          const share =
            line.revenueShare ??
            (totalRevenue > 0
              ? (line.realizedRevenue / totalRevenue) * 100
              : 0);

          return (
            <div key={line.label || idx} className="tp-mix-item-row">
              <div className="tp-mix-meta-line">
                <div className="tp-mix-name-wrap">
                  <Layers size={11} className="tp-mix-icon" />
                  <span className="tp-mix-name" title={line.label}>
                    {line.label}
                  </span>
                </div>
                <div className="tp-mix-figures">
                  <span className="tp-mix-revenue">
                    {formatCurrency(line.realizedRevenue)}
                  </span>
                  <span className="tp-mix-share">
                    {formatPercent(share)}
                  </span>
                </div>
              </div>

              {/* Barra horizontal proporcional */}
              <div className="tp-mix-bar-track">
                <div
                  className="tp-mix-bar-fill tp-mix-bar-fill-cyan"
                  style={{ width: `${Math.min(100, Math.max(0, share))}%` }}
                />
              </div>

              <div className="tp-mix-sub-stats">
                <span>{formatNumber(line.realizedQuantity)} un vendidas</span>
                <span className="tp-bullet">•</span>
                <span>{formatNumber(line.distinctProducts)} SKUs distintos</span>
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button
          type="button"
          className="tp-category-expand-btn"
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          {isExpanded ? (
            <>
              <ChevronUp size={13} />
              <span>Recolher para Top {DEFAULT_VISIBLE_LINES}</span>
            </>
          ) : (
            <>
              <ChevronDown size={13} />
              <span>Ver todas as {sortedLines.length} marcas/linhas</span>
            </>
          )}
        </button>
      )}
    </section>
  );
}
