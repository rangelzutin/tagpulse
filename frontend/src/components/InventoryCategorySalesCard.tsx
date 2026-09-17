import type { InventoryCategoryItem } from "../api/bi";
import { formatCurrency, formatNumber } from "../utils/formatters";

interface InventoryCategorySalesCardProps {
  categories: InventoryCategoryItem[];
  selectedCategorySourceId?: string | null;
  activeStatusFilter?: string;
  onSelectCategory?: (categorySourceId: string | null) => void;
}

export function InventoryCategorySalesCard({
  categories,
  selectedCategorySourceId,
  activeStatusFilter,
  onSelectCategory,
}: InventoryCategorySalesCardProps) {
  // Ordena por realizedRevenueInWindow DESC e pega Top 7
  const sortedCategories = [...categories]
    .sort((a, b) => b.realizedRevenueInWindow - a.realizedRevenueInWindow)
    .slice(0, 7);

  const maxRevenue =
    sortedCategories.length > 0 && sortedCategories[0].realizedRevenueInWindow > 0
      ? sortedCategories[0].realizedRevenueInWindow
      : 1;

  return (
    <section
      className="tp-card tp-inventory-category-card"
      aria-label="Saída recente por categoria"
    >
      <div className="tp-card-header">
        <div>
          <h3 className="tp-card-title">Saída recente por categoria</h3>
          <p className="tp-card-subtitle">
            Faturamento realizado e unidades vendidas na janela
          </p>
        </div>
      </div>

      {sortedCategories.length === 0 ? (
        <div className="tp-empty-message">
          Nenhuma categoria com vendas nesta janela.
        </div>
      ) : (
        <div className="tp-category-sales-list">
          {sortedCategories.map((cat) => {
            const widthPercent =
              maxRevenue > 0
                ? Math.min(
                    100,
                    Math.max(0, (cat.realizedRevenueInWindow / maxRevenue) * 100),
                  )
                : 0;

            const isCatSelected =
              Boolean(selectedCategorySourceId) &&
              selectedCategorySourceId === cat.categorySourceId &&
              activeStatusFilter === "SOLD_IN_WINDOW";

            return (
              <div
                key={cat.categorySourceId ?? cat.category}
                className={`tp-cat-sales-item ${
                  isCatSelected ? "is-category-active" : ""
                }`}
              >
                <div className="tp-cat-sales-header">
                  {/* Coluna Esquerda: Categoria + Vendas (Botão para filtrar) */}
                  <button
                    type="button"
                    className={`tp-cat-sales-left-btn ${
                      isCatSelected ? "is-active" : ""
                    }`}
                    onClick={() => onSelectCategory?.(cat.categorySourceId)}
                    title={`Filtrar produtos vendidos de ${
                      cat.category || "Sem categoria"
                    }`}
                  >
                    <span
                      className="tp-cat-sales-name"
                      title={cat.category || "Sem categoria"}
                    >
                      {cat.category || "Sem categoria"}
                    </span>
                    <span className="tp-cat-sales-count">
                      {`${formatNumber(cat.quantityInWindow)} un na janela`}
                    </span>
                  </button>

                  {/* Coluna Direita: Receita Realizada */}
                  <div className="tp-cat-sales-right">
                    <button
                      type="button"
                      className="tp-cat-sales-revenue-btn"
                      onClick={() => onSelectCategory?.(cat.category)}
                      title={`Filtrar produtos vendidos de ${
                        cat.category || "Sem categoria"
                      }`}
                    >
                      {formatCurrency(cat.realizedRevenueInWindow)}
                    </button>
                  </div>
                </div>

                {/* Barra de progresso proporcional */}
                <div
                  className="tp-cat-progress-track tp-clickable-bar"
                  onClick={() => onSelectCategory?.(cat.category)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectCategory?.(cat.category);
                    }
                  }}
                  title={`${cat.category || "Sem categoria"}: ${formatCurrency(
                    cat.realizedRevenueInWindow,
                  )} (${formatNumber(
                    cat.quantityInWindow,
                  )} un) — clique para filtrar`}
                >
                  <div
                    className="tp-cat-sales-progress-fill"
                    style={{ width: `${widthPercent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
