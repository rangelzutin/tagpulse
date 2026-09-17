import type { InventoryCategoryItem } from "../api/bi";
import { formatCurrency, formatNumber } from "../utils/formatters";

interface InventoryCategoryCapitalCardProps {
  categories: InventoryCategoryItem[];
  selectedCategorySourceId?: string | null;
  activeStatusFilter?: string;
  onSelectCategory?: (categorySourceId: string | null, onlyNoSales?: boolean) => void;
}

export function InventoryCategoryCapitalCard({
  categories,
  selectedCategorySourceId,
  activeStatusFilter,
  onSelectCategory,
}: InventoryCategoryCapitalCardProps) {
  // Ordena por capital a custo DESC e pega Top 7
  const sortedCategories = [...categories]
    .sort((a, b) => b.inventoryCostValue - a.inventoryCostValue)
    .slice(0, 7);

  const maxCapital =
    sortedCategories.length > 0 ? sortedCategories[0].inventoryCostValue : 1;

  return (
    <section
      className="tp-card tp-inventory-category-card"
      aria-label="Capital sem saída por categoria"
    >
      <div className="tp-card-header">
        <div>
          <h3 className="tp-card-title">Capital sem saída por categoria</h3>
          <p className="tp-card-subtitle">
            Capital atual em estoque e parcela sem saída recente na janela
          </p>
        </div>
      </div>

      {sortedCategories.length === 0 ? (
        <div className="tp-empty-message">Nenhuma categoria com estoque.</div>
      ) : (
        <div className="tp-category-capital-list">
          {sortedCategories.map((cat) => {
            const widthPercent =
              maxCapital > 0 ? (cat.inventoryCostValue / maxCapital) * 100 : 0;
            const noSalesShare = Math.min(100, Math.max(0, cat.capitalWithoutSalesShare));
            const isCatSelected =
              Boolean(selectedCategorySourceId) &&
              selectedCategorySourceId === cat.categorySourceId;
            const isIdleSelected = isCatSelected && activeStatusFilter === "NO_SALES_IN_WINDOW";
            const isAllCatSelected = isCatSelected && activeStatusFilter !== "NO_SALES_IN_WINDOW";

            return (
              <div
                key={cat.categorySourceId ?? cat.category}
                className={`tp-cat-capital-item ${isCatSelected ? "is-category-active" : ""}`}
              >
                <div className="tp-cat-capital-header">
                  {/* Coluna Esquerda: Categoria + SKUs (Botão para ver todos da categoria) */}
                  <button
                    type="button"
                    className={`tp-cat-capital-left-btn ${isAllCatSelected ? "is-active" : ""}`}
                    onClick={() => onSelectCategory?.(cat.categorySourceId, false)}
                    title={`Filtrar todos os produtos de ${cat.category || "Sem categoria"}`}
                  >
                    <span className="tp-cat-capital-name" title={cat.category || "Sem categoria"}>
                      {cat.category || "Sem categoria"}
                    </span>
                    <span className="tp-cat-capital-count">
                      {`${formatNumber(cat.productsWithStock)} SKUs com estoque`}
                    </span>
                  </button>

                  {/* Coluna Direita: Capital Total + Botão de Parcela Sem Saída */}
                  <div className="tp-cat-capital-right">
                    <button
                      type="button"
                      className="tp-cat-capital-total-btn"
                      onClick={() => onSelectCategory?.(cat.categorySourceId, false)}
                      title={`Filtrar categoria ${cat.category || "Sem categoria"}`}
                    >
                      {formatCurrency(cat.inventoryCostValue)}
                    </button>
                    {cat.capitalWithoutSales > 0 && (
                      <button
                        type="button"
                        className={`tp-cat-capital-idle-btn ${isIdleSelected ? "is-active" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectCategory?.(cat.categorySourceId, true);
                        }}
                        title={`Filtrar apenas produtos de ${cat.category || "Sem categoria"} sem saída na janela`}
                      >
                        {`${formatCurrency(cat.capitalWithoutSales)} sem saída (${noSalesShare.toFixed(1)}%)`}
                      </button>
                    )}
                  </div>
                </div>

                {/* Barra de progresso interativa */}
                <div className="tp-cat-progress-track">
                  <div
                    className="tp-cat-progress-fill tp-clickable-bar"
                    style={{ width: `${widthPercent}%` }}
                    onClick={() => onSelectCategory?.(cat.category, false)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectCategory?.(cat.category, false);
                      }
                    }}
                    title={`${cat.category || "Sem categoria"}: ${formatCurrency(cat.inventoryCostValue)} — clique para ver produtos`}
                  >
                    {/* Parcela sem saída visualmente destacada e clicável */}
                    {noSalesShare > 0 && (
                      <div
                        className={`tp-cat-idle-fill tp-clickable-idle ${isIdleSelected ? "is-selected-fill" : ""}`}
                        style={{ width: `${noSalesShare}%` }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectCategory?.(cat.category, true);
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                            e.preventDefault();
                            onSelectCategory?.(cat.category, true);
                          }
                        }}
                        title={`${noSalesShare.toFixed(1).replace(".", ",")}% do capital sem saída — clique para filtrar apenas sem saída`}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
