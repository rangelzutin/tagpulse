import { useState } from "react";
import { Info, ChevronDown, ChevronUp } from "lucide-react";
import type { ProductReconciliation } from "../api/bi";
import { formatCurrency } from "../utils/formatters";

interface ProductReconciliationBannerProps {
  reconciliation: ProductReconciliation;
}

export function ProductReconciliationBanner({
  reconciliation,
}: ProductReconciliationBannerProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (reconciliation.adjustmentAmount <= 0) {
    return null;
  }

  return (
    <div
      className="tp-reconciliation-banner"
      role="region"
      aria-label="Aviso de Reconciliação Histórica"
    >
      <div className="tp-reconciliation-banner-main">
        <div className="tp-reconciliation-left">
          <span className="tp-reconciliation-icon-wrap">
            <Info size={16} />
          </span>
          <div className="tp-reconciliation-summary">
            <div className="tp-reconciliation-title-row">
              <span className="tp-reconciliation-badge">
                Ajuste histórico identificado
              </span>
              <span className="tp-reconciliation-formula">
                Comercial ({formatCurrency(reconciliation.commercialRevenue)}) −
                Ajuste de exclusão ({formatCurrency(reconciliation.adjustmentAmount)}) =
                Produtos ({formatCurrency(reconciliation.productsRevenue)})
              </span>
            </div>
            <p className="tp-reconciliation-desc">
              O BI de Produtos exclui documento com duplicidade comprovada para
              garantir a autoridade material exata dos itens.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="tp-reconciliation-toggle-btn"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
          aria-label={
            isExpanded
              ? "Ocultar detalhes do ajuste"
              : "Ver detalhes do ajuste"
          }
        >
          <span>{isExpanded ? "Menos detalhes" : "Ver detalhe"}</span>
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {isExpanded && (
        <div className="tp-reconciliation-details">
          <div className="tp-reconciliation-equation-box">
            <div className="tp-equation-col">
              <span className="tp-equation-label">Faturamento Comercial</span>
              <span className="tp-equation-val">
                {formatCurrency(reconciliation.commercialRevenue)}
              </span>
            </div>
            <span className="tp-equation-op">−</span>
            <div className="tp-equation-col tp-equation-adjustment">
              <span className="tp-equation-label">Ajuste de exclusão</span>
              <span className="tp-equation-val">
                {formatCurrency(reconciliation.adjustmentAmount)}
              </span>
            </div>
            <span className="tp-equation-op">=</span>
            <div className="tp-equation-col tp-equation-result">
              <span className="tp-equation-label">Faturamento de Produtos</span>
              <span className="tp-equation-val">
                {formatCurrency(reconciliation.productsRevenue)}
              </span>
            </div>
          </div>

          {reconciliation.adjustments.map((adj, idx) => (
            <div key={adj.sourceDocumentId || idx} className="tp-reconciliation-item">
              <div className="tp-reconciliation-item-header">
                <span className="tp-reconciliation-item-type">
                  Documento: NF-e {adj.sourceId ? `#${adj.sourceId}` : adj.sourceDocumentId}
                </span>
                <span className="tp-reconciliation-item-amount">
                  − {formatCurrency(adj.amount)}
                </span>
              </div>
              <p className="tp-reconciliation-item-reason">{adj.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
