import { Layers, Warehouse, CheckCircle2 } from "lucide-react";
import type { ProductsOverviewSummary } from "../api/bi";
import { formatNumber } from "../utils/formatters";

interface CatalogContextCardProps {
  summary: ProductsOverviewSummary;
}

export function CatalogContextCard({ summary }: CatalogContextCardProps) {
  return (
    <section
      className="tp-card tp-catalog-context-card"
      aria-label="Contexto Operacional do Catálogo e Estoque"
    >
      <div className="tp-catalog-context-header">
        <span className="tp-catalog-context-title">
          Contexto do Catálogo & Estoque
        </span>
        <span className="tp-catalog-context-badge">Posição Atual</span>
      </div>

      <div className="tp-catalog-context-grid">
        <div className="tp-catalog-context-item">
          <div className="tp-catalog-item-header">
            <span className="tp-catalog-item-icon tp-icon-cyan">
              <Layers size={14} />
            </span>
            <span className="tp-catalog-item-label">Catálogo ativo</span>
          </div>
          <div className="tp-catalog-item-value">
            {formatNumber(summary.activeCatalogProducts)}
          </div>
          <span className="tp-catalog-item-desc">
            Produtos cadastrados ativos
          </span>
        </div>

        <div className="tp-catalog-context-item">
          <div className="tp-catalog-item-header">
            <span className="tp-catalog-item-icon tp-icon-teal">
              <Warehouse size={14} />
            </span>
            <span className="tp-catalog-item-label">Com estoque atualmente</span>
          </div>
          <div className="tp-catalog-item-value">
            {formatNumber(summary.productsWithStock)}
          </div>
          <span className="tp-catalog-item-desc">
            Itens com saldo físico em estoque
          </span>
        </div>

        <div className="tp-catalog-context-item">
          <div className="tp-catalog-item-header">
            <span className="tp-catalog-item-icon tp-icon-indigo">
              <CheckCircle2 size={14} />
            </span>
            <span className="tp-catalog-item-label">Vendidos no período</span>
          </div>
          <div className="tp-catalog-item-value">
            {formatNumber(summary.distinctProductsSold)}
          </div>
          <span className="tp-catalog-item-desc">
            SKUs com saída física nas datas
          </span>
        </div>
      </div>
    </section>
  );
}
