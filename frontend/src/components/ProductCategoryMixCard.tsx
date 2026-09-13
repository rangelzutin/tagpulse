import { Tag } from "lucide-react";
import type { ProductCategoryItem } from "../api/bi";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
} from "../utils/formatters";

interface ProductCategoryMixCardProps {
  categories: ProductCategoryItem[];
  totalRevenue: number;
}

export function ProductCategoryMixCard({
  categories,
  totalRevenue,
}: ProductCategoryMixCardProps) {
  if (!categories || categories.length === 0) {
    return (
      <section className="tp-card tp-category-mix-card" aria-label="Mix por Categoria">
        <div className="tp-card-header">
          <div>
            <h3 className="tp-card-title">Mix por categoria</h3>
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

  return (
    <section className="tp-card tp-category-mix-card" aria-label="Mix por Categoria">
      <div className="tp-card-header">
        <div>
          <div className="tp-title-with-badge">
            <h3 className="tp-card-title">Mix por categoria</h3>
            <span className="tp-badge-count">{sortedCategories.length} categorias</span>
          </div>
          <p className="tp-card-subtitle">
            Participação de receita e volume físico por linha de produtos
          </p>
        </div>
      </div>

      <div className="tp-category-ranking-list">
        {sortedCategories.map((cat, idx) => {
          const share =
            cat.shareOfRevenue ??
            (totalRevenue > 0
              ? (cat.realizedRevenue / totalRevenue) * 100
              : 0);

          return (
            <div key={cat.category || idx} className="tp-category-item-row">
              <div className="tp-category-meta-line">
                <div className="tp-category-name-wrap">
                  <Tag size={12} className="tp-category-icon" />
                  <span className="tp-category-name" title={cat.category}>
                    {cat.category}
                  </span>
                </div>
                <div className="tp-category-figures">
                  <span className="tp-category-revenue">
                    {formatCurrency(cat.realizedRevenue)}
                  </span>
                  <span className="tp-category-share">
                    {formatPercent(share)}
                  </span>
                </div>
              </div>

              {/* Barra horizontal proporcional */}
              <div className="tp-category-bar-track">
                <div
                  className="tp-category-bar-fill"
                  style={{ width: `${Math.min(100, Math.max(0, share))}%` }}
                />
              </div>

              <div className="tp-category-sub-stats">
                <span>{formatNumber(cat.quantity)} un vendidas</span>
                <span className="tp-bullet">•</span>
                <span>{formatNumber(cat.distinctProducts)} SKUs distintos</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
