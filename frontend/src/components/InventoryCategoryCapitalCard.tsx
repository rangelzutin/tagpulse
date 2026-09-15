import type { InventoryCategoryItem } from "../api/bi";
import { formatCurrency, formatNumber } from "../utils/formatters";

interface InventoryCategoryCapitalCardProps {
  categories: InventoryCategoryItem[];
}

export function InventoryCategoryCapitalCard({
  categories,
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
      aria-label="Capital por categoria"
    >
      <div className="tp-card-header">
        <div>
          <h3 className="tp-card-title">Capital por categoria</h3>
          <p className="tp-card-subtitle">
            Estoque a custo e parcela sem saída recente na janela
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

            return (
              <div key={cat.category} className="tp-cat-capital-item">
                <div className="tp-cat-capital-header">
                  {/* Coluna Esquerda: Categoria + SKUs */}
                  <div className="tp-cat-capital-left">
                    <span className="tp-cat-capital-name" title={cat.category || "Sem categoria"}>
                      {cat.category || "Sem categoria"}
                    </span>
                    <span className="tp-cat-capital-count">
                      {`${formatNumber(cat.productsWithStock)} SKUs com estoque`}
                    </span>
                  </div>

                  {/* Coluna Direita: Capital Total + Sem Saída */}
                  <div className="tp-cat-capital-right">
                    <strong className="tp-cat-capital-total">
                      {formatCurrency(cat.inventoryCostValue)}
                    </strong>
                    {cat.capitalWithoutSales > 0 && (
                      <span className="tp-cat-capital-idle">
                        {`${formatCurrency(cat.capitalWithoutSales)} sem saída (${noSalesShare.toFixed(1)}%)`}
                      </span>
                    )}
                  </div>
                </div>

                {/* Barra de progresso com subsegmento de capital sem saída */}
                <div className="tp-cat-progress-track">
                  <div
                    className="tp-cat-progress-fill"
                    style={{ width: `${widthPercent}%` }}
                  >
                    {/* Parcela sem saída visualmente destacada */}
                    {noSalesShare > 0 && (
                      <div
                        className="tp-cat-idle-fill"
                        style={{ width: `${noSalesShare}%` }}
                        title={`Sem saída: ${formatCurrency(cat.capitalWithoutSales)} (${noSalesShare.toFixed(1)}%)`}
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
