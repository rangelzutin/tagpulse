import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type {
  DreBreakdownDto,
  DreBreakdownEntryDto,
  DreBreakdownItemDto,
} from "../../api/financial";
import { formatCurrency, formatDateBr, formatPercent } from "../../utils/formatters";

interface FinancialDreBreakdownCardProps {
  breakdown: DreBreakdownDto | null;
  isLoading?: boolean;
}

export function FinancialDreBreakdownCard({
  breakdown,
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

  const formatPlanLabel = (entry: DreBreakdownEntryDto) => {
    if (entry.budgetPlanSourceId && entry.budgetPlanName) {
      return `${entry.budgetPlanSourceId} — ${entry.budgetPlanName}`;
    }
    if (entry.budgetPlanName) return entry.budgetPlanName;
    if (entry.budgetPlanSourceId) return `Plano ${entry.budgetPlanSourceId}`;
    return "—";
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
          const hasEntries = !!(cat.entries && cat.entries.length > 0);
          const hasDetails = hasEntries || !!(cat.details && cat.details.length > 0);
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
                    <span className="tp-breakdown-label" title={cat.label}>{cat.label}</span>
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
                  {hasEntries ? (
                    <table className="tp-breakdown-details-table">
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Descrição</th>
                          <th>Plano TagPlus</th>
                          <th>Valor</th>
                          <th>Origem</th>
                          <th>Categoria TagPulse</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cat.entries!.map((entry) => (
                          <tr key={entry.recordId}>
                            <td>{formatDateBr(entry.date)}</td>
                            <td className="tp-detail-desc">{entry.description}</td>
                            <td>{formatPlanLabel(entry)}</td>
                            <td className="tp-detail-amount">{formatCurrency(entry.amount)}</td>
                            <td>{entry.operationUnit || entry.sourceSystem || "—"}</td>
                            <td>{entry.categoryLabel}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
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
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
