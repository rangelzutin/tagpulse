import { useState } from "react";
import { ChevronDown, ChevronRight, Layers, FileText } from "lucide-react";
import type { DreBreakdownDto, DreBreakdownItemDto } from "../../api/financial";
import { formatCurrency, formatPercent } from "../../utils/formatters";

interface FinancialDreBreakdownCardProps {
  breakdown: DreBreakdownDto | null;
  isLoading?: boolean;
}

export function FinancialDreBreakdownCard({
  breakdown,
  isLoading,
}: FinancialDreBreakdownCardProps) {
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  if (!breakdown || breakdown.categories.length === 0) {
    return null;
  }

  // Filter out NON_DRE categories (like inventory purchase) for the expense breakdown display
  const relevantCategories = breakdown.categories
    .filter((c) => c.group !== "NON_DRE" && c.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const maxAmount = relevantCategories.length > 0 ? relevantCategories[0]!.amount : 1;

  const toggleExpand = (catId: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

  const getGroupBadge = (group: DreBreakdownItemDto["group"]) => {
    switch (group) {
      case "VARIABLE_EXPENSE":
        return <span className="tp-group-badge is-variable">Variável</span>;
      case "OPERATING_EXPENSE":
        return <span className="tp-group-badge is-operating">Operacional</span>;
      case "FINANCIAL_RESULT":
        return <span className="tp-group-badge is-financial">Financeiro</span>;
      default:
        return null;
    }
  };

  return (
    <div className="tp-dre-breakdown-card tp-card">
      <div className="tp-card-header tp-dre-breakdown-header">
        <div>
          <h3 className="tp-card-title">Composição das Despesas</h3>
          <p className="tp-card-subtitle">
            Ranking gerencial ordenado por valor e representatividade sobre a receita realizada.
          </p>
        </div>
      </div>

      <div className="tp-dre-breakdown-list">
        {relevantCategories.map((cat) => {
          const isExpanded = !!expandedCategories[cat.economicCategory];
          const hasDetails = cat.details && cat.details.length > 0;
          const barWidthPercent = Math.min(100, Math.max(4, (cat.amount / maxAmount) * 100));

          return (
            <div
              key={cat.economicCategory}
              className={`tp-breakdown-item ${isExpanded ? "is-expanded" : ""}`}
            >
              <div
                className={`tp-breakdown-main-row ${hasDetails ? "is-clickable" : ""}`}
                onClick={() => hasDetails && toggleExpand(cat.economicCategory)}
                role={hasDetails ? "button" : undefined}
                tabIndex={hasDetails ? 0 : undefined}
                aria-expanded={hasDetails ? isExpanded : undefined}
                onKeyDown={(e) => {
                  if (hasDetails && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    toggleExpand(cat.economicCategory);
                  }
                }}
              >
                <div className="tp-breakdown-left">
                  {hasDetails ? (
                    <span className="tp-breakdown-expand-icon">
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                  ) : (
                    <span className="tp-breakdown-bullet" />
                  )}
                  <div className="tp-breakdown-title-wrap">
                    <span className="tp-breakdown-label">{cat.label}</span>
                    {getGroupBadge(cat.group)}
                    <span className="tp-breakdown-count">
                      {`${cat.recordCount} ${cat.recordCount === 1 ? "registro" : "registros"}`}
                    </span>
                  </div>
                </div>

                <div className="tp-breakdown-right">
                  <div className="tp-breakdown-bar-wrap">
                    <div
                      className="tp-breakdown-bar-fill"
                      style={{ width: `${barWidthPercent}%` }}
                    />
                  </div>
                  <span className="tp-breakdown-amount">{formatCurrency(cat.amount)}</span>
                  <span className="tp-breakdown-share">
                    {cat.shareOfRevenuePercent !== null
                      ? formatPercent(cat.shareOfRevenuePercent, 2)
                      : "—"}
                  </span>
                </div>
              </div>

              {/* Sub-item details if expanded */}
              {isExpanded && hasDetails && (
                <div className="tp-breakdown-details-panel">
                  <table className="tp-breakdown-details-table">
                    <thead>
                      <tr>
                        <th>Histórico / Favorecido</th>
                        <th>Qtd.</th>
                        <th>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cat.details!.map((detail, idx) => (
                        <tr key={idx}>
                          <td className="tp-detail-desc">{detail.description}</td>
                          <td className="tp-detail-count">{detail.recordCount}</td>
                          <td className="tp-detail-amount">{formatCurrency(detail.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
