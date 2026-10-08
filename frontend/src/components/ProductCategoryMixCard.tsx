import { useState } from "react";
import { Tag, ChevronDown, ChevronUp } from "lucide-react";
import type { ProductCategoryItem } from "../api/bi";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
} from "../utils/formatters";

interface ProductCategoryMixCardProps {
  categories?: ProductCategoryItem[];
  totalRevenue: number;
}

const DEFAULT_VISIBLE_CATEGORIES = 8;

export function ProductCategoryMixCard({
  categories = [],
  totalRevenue,
}: ProductCategoryMixCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!categories || categories.length === 0) {
    return (
      <section className="tp-card tp-mix-card" aria-label="Mix por Categoria">
        <div className="tp-card-header">
          <div>
            <h3 className="tp-card-title">Mix por Categoria</h3>
            <p className="tp-card-subtitle">
              Distribuição de receita e volume pelas categorias cadastradas
            </p>
          </div>
        </div>
        <div className="tp-empty-message">
          Nenhuma categoria com realização no período selecionado.
        </div>
      </section>
    );
  }

  // Ordena por faturamento decrescente
  const sortedCategories = [...categories].sort(
    (a, b) => b.realizedRevenue - a.realizedRevenue,
  );

  const visibleCategories = isExpanded
    ? sortedCategories
    : sortedCategories.slice(0, DEFAULT_VISIBLE_CATEGORIES);

  const hasMore = sortedCategories.length > DEFAULT_VISIBLE_CATEGORIES;

  return (
    <section className="tp-card tp-mix-card" aria-label="Mix por Categoria">
      <div className="tp-card-header">
        <div>
          <div className="tp-title-with-badge">
            <h3 className="tp-card-title">Mix por Categoria</h3>
            <span className="tp-badge-count">
              {hasMore && !isExpanded
                ? `Top ${DEFAULT_VISIBLE_CATEGORIES} de ${sortedCategories.length}`
                : `${sortedCategories.length} categorias`}
            </span>
          </div>
          <p className="tp-card-subtitle">
            Participação de faturamento e volume por categoria
          </p>
        </div>
      </div>

      <div className={`tp-mix-ranking-list ${isExpanded ? "is-expanded" : ""}`}>
        {visibleCategories.map((cat, idx) => {
          const share =
            cat.revenueShare ??
            cat.shareOfRevenue ??
            (totalRevenue > 0
              ? (cat.realizedRevenue / totalRevenue) * 100
              : 0);

          const qty = cat.realizedQuantity ?? cat.quantity;

          return (
            <div key={cat.category || idx} className="tp-mix-item-row">
              <div className="tp-mix-meta-line">
                <div className="tp-mix-name-wrap">
                  <Tag size={11} className="tp-mix-icon" />
                  <span className="tp-mix-name" title={cat.label || cat.category}>
                    {cat.label || cat.category}
                  </span>
                </div>
                <div className="tp-mix-figures">
                  <span className="tp-mix-revenue">
                    {formatCurrency(cat.realizedRevenue)}
                  </span>
                  <span className="tp-mix-share">
                    {formatPercent(share)}
                  </span>
                </div>
              </div>

              {/* Barra horizontal proporcional */}
              <div className="tp-mix-bar-track">
                <div
                  className="tp-mix-bar-fill tp-mix-bar-fill-teal"
                  style={{ width: `${Math.min(100, Math.max(0, share))}%` }}
                />
              </div>

              <div className="tp-mix-sub-stats">
                <span>{formatNumber(qty)} un vendidas</span>
                <span className="tp-bullet">•</span>
                <span>{formatNumber(cat.distinctProducts)} SKUs distintos</span>
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
              <span>Recolher para Top {DEFAULT_VISIBLE_CATEGORIES}</span>
            </>
          ) : (
            <>
              <ChevronDown size={13} />
              <span>Ver todas as {sortedCategories.length} categorias</span>
            </>
          )}
        </button>
      )}
    </section>
  );
}
