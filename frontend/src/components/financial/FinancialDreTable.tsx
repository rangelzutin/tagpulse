import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type {
  DreBreakdownDto,
  DreBreakdownEntryDto,
  DreEconomicCategory,
  DreSummaryTotalsDto,
} from "../../api/financial";
import { formatCurrency, formatDateBr, formatPercent } from "../../utils/formatters";

interface FinancialDreTableProps {
  totals: DreSummaryTotalsDto;
  realizedRevenue: number;
  breakdown?: DreBreakdownDto | null;
}

export function FinancialDreTable({
  totals,
  realizedRevenue,
  breakdown,
}: FinancialDreTableProps) {
  const [expandVariables, setExpandVariables] = useState(true);
  const [expandOperating, setExpandOperating] = useState(true);
  const [expandFinancial, setExpandFinancial] = useState(false);
  const [expandOther, setExpandOther] = useState(false);
  const [expandedCategoryRows, setExpandedCategoryRows] = useState<
    Record<string, boolean>
  >({});

  const safeRevenue = realizedRevenue > 0 ? realizedRevenue : 1;

  const calcShare = (val: number) => {
    if (realizedRevenue <= 0) return "—";
    return formatPercent((val / safeRevenue) * 100, 2);
  };

  const getEntriesForCategory = (
    cat: DreEconomicCategory,
  ): DreBreakdownEntryDto[] => {
    if (!breakdown || !breakdown.categories) return [];
    const found = breakdown.categories.find((c) => c.economicCategory === cat);
    return found?.entries ?? [];
  };

  const toggleCategoryDrilldown = (cat: DreEconomicCategory) => {
    setExpandedCategoryRows((prev) => ({
      ...prev,
      [cat]: !prev[cat],
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

  const renderSubitemRow = (
    label: string,
    amount: number,
    category: DreEconomicCategory,
    amountClassName = "",
    prefix = "",
  ) => {
    const entries = getEntriesForCategory(category);
    const isClickable = entries.length > 0;
    const isRowExpanded = !!expandedCategoryRows[category];

    return (
      <Fragment key={category}>
        <tr
          className={`tp-dre-row-subitem ${isClickable ? "is-clickable" : ""}`}
          onClick={() => isClickable && toggleCategoryDrilldown(category)}
          role={isClickable ? "button" : undefined}
          tabIndex={isClickable ? 0 : undefined}
          aria-expanded={isClickable ? isRowExpanded : undefined}
          style={isClickable ? { cursor: "pointer" } : undefined}
          onKeyDown={(e) => {
            if (isClickable && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              toggleCategoryDrilldown(category);
            }
          }}
        >
          <td className="tp-cell-name tp-indent-1">
            {isClickable && (
              <span
                className="tp-dre-toggle-icon"
                style={{ marginRight: "6px", display: "inline-flex", verticalAlign: "middle" }}
              >
                {isRowExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </span>
            )}
            <span>{label}</span>
          </td>
          <td className={`tp-cell-amount ${amountClassName}`}>
            {prefix}
            {formatCurrency(amount)}
          </td>
          <td className="tp-cell-percent">{calcShare(amount)}</td>
        </tr>
        {isRowExpanded && entries.length > 0 && (
          <tr className="tp-dre-row-drilldown">
            <td colSpan={3} style={{ padding: "8px 16px 12px 32px", background: "rgba(15, 23, 42, 0.55)" }}>
              <table
                className="tp-breakdown-details-table"
                style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}
              >
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Data</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Descrição</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Plano TagPlus</th>
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>Valor</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Origem</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Categoria TagPulse</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.recordId}>
                      <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>
                        {formatDateBr(entry.date)}
                      </td>
                      <td style={{ padding: "5px 8px" }}>{entry.description}</td>
                      <td style={{ padding: "5px 8px" }}>{formatPlanLabel(entry)}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600 }}>
                        {formatCurrency(entry.amount)}
                      </td>
                      <td style={{ padding: "5px 8px" }}>
                        {entry.operationUnit || entry.sourceSystem || "—"}
                      </td>
                      <td style={{ padding: "5px 8px" }}>{entry.categoryLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  const packagingVal = totals.variableExpenses.packaging ?? 0;
  const athletesVal = totals.operatingExpenses.athletes ?? 0;
  const lossesVal = totals.operatingExpenses.losses ?? 0;

  const variableItemsCount = 5 + (packagingVal > 0 ? 1 : 0);
  const operatingItemsCount =
    10 + (athletesVal > 0 ? 1 : 0) + (lossesVal > 0 ? 1 : 0);

  const hasNetResult = totals.netManagerialResult !== null;
  const isNetPositive = hasNetResult && (totals.netManagerialResult ?? 0) > 0;
  const isNetNegative = hasNetResult && (totals.netManagerialResult ?? 0) < 0;

  return (
    <div className="tp-dre-table-card tp-card">
      <div className="tp-card-header tp-dre-table-header">
        <div>
          <h3 className="tp-card-title">Demonstrativo do Resultado do Exercício (DRE)</h3>
          <p className="tp-card-subtitle">
            Estrutura vertical gerencial por competência com percentuais sobre a receita realizada.
          </p>
        </div>
      </div>

      <div className="tp-dre-table-container">
        <table className="tp-dre-table" aria-label="Tabela do DRE Gerencial">
          <thead>
            <tr>
              <th scope="col" className="tp-col-account">Linha Econômica</th>
              <th scope="col" className="tp-col-amount">Valor (R$)</th>
              <th scope="col" className="tp-col-percent">% da Receita</th>
            </tr>
          </thead>
          <tbody>
            {/* 1. Receita Realizada */}
            <tr className="tp-dre-row-main tp-row-revenue">
              <td className="tp-cell-name">
                <span className="tp-dre-badge-math is-base">R</span>
                <strong>Receita Realizada</strong>
              </td>
              <td className="tp-cell-amount">{formatCurrency(totals.realizedRevenue)}</td>
              <td className="tp-cell-percent">100,00%</td>
            </tr>

            {/* 2. CMV Estimado ao Custo Atual */}
            <tr className="tp-dre-row-deduction">
              <td className="tp-cell-name">
                <span className="tp-dre-badge-math is-minus">(-)</span>
                <span>CMV Estimado ao Custo Atual</span>
              </td>
              <td className="tp-cell-amount tp-text-deduction">
                -{formatCurrency(totals.estimatedCOGS)}
              </td>
              <td className="tp-cell-percent">{calcShare(totals.estimatedCOGS)}</td>
            </tr>

            {/* 3. Lucro Bruto Estimado */}
            <tr className="tp-dre-row-subtotal tp-row-gross-profit">
              <td className="tp-cell-name">
                <span className="tp-dre-badge-math is-equals">(=)</span>
                <strong>Lucro Bruto Estimado</strong>
              </td>
              <td className="tp-cell-amount">
                <strong>{formatCurrency(totals.estimatedGrossProfit)}</strong>
              </td>
              <td className="tp-cell-percent">
                <strong>
                  {totals.estimatedGrossMarginPercent !== null
                    ? formatPercent(totals.estimatedGrossMarginPercent, 2)
                    : "—"}
                </strong>
              </td>
            </tr>

            {/* 4. Despesas Variáveis Header */}
            <tr
              className="tp-dre-row-group-header"
              onClick={() => setExpandVariables(!expandVariables)}
              role="button"
              tabIndex={0}
              aria-expanded={expandVariables}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpandVariables(!expandVariables);
                }
              }}
            >
              <td className="tp-cell-name">
                <span className="tp-dre-toggle-icon">
                  {expandVariables ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
                <span className="tp-dre-badge-math is-minus">(-)</span>
                <strong>Despesas Variáveis</strong>
                <span className="tp-dre-item-count">({variableItemsCount} itens)</span>
              </td>
              <td className="tp-cell-amount tp-text-deduction">
                -{formatCurrency(totals.variableExpenses.total)}
              </td>
              <td className="tp-cell-percent">{calcShare(totals.variableExpenses.total)}</td>
            </tr>

            {/* Despesas Variáveis Subitens */}
            {expandVariables && (
              <>
                {renderSubitemRow(
                  "Taxas de Pagamento",
                  totals.variableExpenses.paymentFees,
                  "VARIABLE_PAYMENT_FEE",
                )}
                {renderSubitemRow(
                  "Impostos sobre Vendas",
                  totals.variableExpenses.taxesOnRevenue,
                  "VARIABLE_TAX_ON_REVENUE",
                )}
                {renderSubitemRow(
                  "Fretes / Logística",
                  totals.variableExpenses.freightLogistics,
                  "VARIABLE_FREIGHT_LOGISTICS",
                )}
                {renderSubitemRow(
                  "Comissões",
                  totals.variableExpenses.salesCommissions,
                  "VARIABLE_SALES_COMMISSION",
                )}
                {packagingVal > 0 &&
                  renderSubitemRow(
                    "Embalagens / Expedição",
                    packagingVal,
                    "VARIABLE_PACKAGING",
                  )}
                {renderSubitemRow(
                  "Outras Despesas Variáveis",
                  totals.variableExpenses.other,
                  "VARIABLE_OTHER",
                )}
              </>
            )}

            {/* 5. Margem de Contribuição (Highlighted) */}
            <tr className="tp-dre-row-highlight tp-row-contribution">
              <td className="tp-cell-name">
                <span className="tp-dre-badge-math is-equals">(=)</span>
                <strong>Margem de Contribuição</strong>
              </td>
              <td className="tp-cell-amount">
                <strong className="tp-contribution-amount">
                  {formatCurrency(totals.contributionMargin)}
                </strong>
              </td>
              <td className="tp-cell-percent">
                <strong className="tp-contribution-percent">
                  {totals.contributionMarginPercent !== null
                    ? formatPercent(totals.contributionMarginPercent, 2)
                    : "—"}
                </strong>
              </td>
            </tr>

            {/* 6. Despesas Operacionais Header */}
            <tr
              className="tp-dre-row-group-header"
              onClick={() => setExpandOperating(!expandOperating)}
              role="button"
              tabIndex={0}
              aria-expanded={expandOperating}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpandOperating(!expandOperating);
                }
              }}
            >
              <td className="tp-cell-name">
                <span className="tp-dre-toggle-icon">
                  {expandOperating ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
                <span className="tp-dre-badge-math is-minus">(-)</span>
                <strong>Despesas Operacionais</strong>
                <span className="tp-dre-item-count">({operatingItemsCount} categorias)</span>
              </td>
              <td className="tp-cell-amount tp-text-deduction">
                -{formatCurrency(totals.operatingExpenses.total)}
              </td>
              <td className="tp-cell-percent">{calcShare(totals.operatingExpenses.total)}</td>
            </tr>

            {/* Despesas Operacionais Subitens */}
            {expandOperating && (
              <>
                {renderSubitemRow(
                  "Encargos sobre Pró-labore / Pessoal",
                  totals.operatingExpenses.personnel,
                  "OPERATING_PERSONNEL",
                )}
                {renderSubitemRow(
                  "Pró-labore dos Sócios",
                  totals.operatingExpenses.partnerCompensation,
                  "OPERATING_PARTNER_COMPENSATION",
                )}
                {renderSubitemRow(
                  "Marketing e Publicidade",
                  totals.operatingExpenses.marketing,
                  "OPERATING_MARKETING",
                )}
                {athletesVal > 0 &&
                  renderSubitemRow(
                    "Atletas / Patrocínios",
                    athletesVal,
                    "OPERATING_ATHLETES",
                  )}
                {renderSubitemRow(
                  "Aluguel e Espaço Físico",
                  totals.operatingExpenses.occupancy,
                  "OPERATING_OCCUPANCY",
                )}
                {renderSubitemRow(
                  "Serviços Operacionais",
                  totals.operatingExpenses.utilities,
                  "OPERATING_UTILITIES",
                )}
                {renderSubitemRow(
                  "Software e Assinaturas",
                  totals.operatingExpenses.software,
                  "OPERATING_SOFTWARE",
                )}
                {renderSubitemRow(
                  "Contabilidade / Jurídico",
                  totals.operatingExpenses.accounting,
                  "OPERATING_ACCOUNTING",
                )}
                {renderSubitemRow(
                  "Infraestrutura / Manutenção",
                  totals.operatingExpenses.infrastructure,
                  "OPERATING_INFRASTRUCTURE",
                )}
                {renderSubitemRow(
                  "Administrativo",
                  totals.operatingExpenses.administrative,
                  "OPERATING_ADMINISTRATIVE",
                )}
                {lossesVal > 0 &&
                  renderSubitemRow(
                    "Perdas / Inadimplência",
                    lossesVal,
                    "OPERATING_LOSSES",
                  )}
                {renderSubitemRow(
                  "Outros",
                  totals.operatingExpenses.other,
                  "OPERATING_OTHER",
                )}
              </>
            )}

            {/* 7. Resultado Financeiro Header */}
            <tr
              className="tp-dre-row-group-header"
              onClick={() => setExpandFinancial(!expandFinancial)}
              role="button"
              tabIndex={0}
              aria-expanded={expandFinancial}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpandFinancial(!expandFinancial);
                }
              }}
            >
              <td className="tp-cell-name">
                <span className="tp-dre-toggle-icon">
                  {expandFinancial ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
                <span className="tp-dre-badge-math is-plus-minus">(+/-)</span>
                <strong>Resultado Financeiro</strong>
              </td>
              <td
                className={`tp-cell-amount ${
                  totals.financialResult.total < 0
                    ? "tp-text-negative"
                    : totals.financialResult.total > 0
                    ? "tp-text-positive"
                    : ""
                }`}
              >
                {formatCurrency(totals.financialResult.total)}
              </td>
              <td className="tp-cell-percent">{calcShare(Math.abs(totals.financialResult.total))}</td>
            </tr>

            {expandFinancial && (
              <>
                {renderSubitemRow(
                  "(+) Receitas Financeiras",
                  totals.financialResult.financialIncome,
                  "FINANCIAL_INCOME",
                  "tp-text-positive",
                )}
                {renderSubitemRow(
                  "(-) Despesas Financeiras",
                  totals.financialResult.financialExpenses,
                  "FINANCIAL_EXPENSE",
                  "tp-text-deduction",
                  "-",
                )}
              </>
            )}

            {/* 8. Outros Resultados Header */}
            <tr
              className="tp-dre-row-group-header"
              onClick={() => setExpandOther(!expandOther)}
              role="button"
              tabIndex={0}
              aria-expanded={expandOther}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpandOther(!expandOther);
                }
              }}
            >
              <td className="tp-cell-name">
                <span className="tp-dre-toggle-icon">
                  {expandOther ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
                <span className="tp-dre-badge-math is-plus-minus">(+/-)</span>
                <strong>Outros Resultados</strong>
              </td>
              <td className="tp-cell-amount">{formatCurrency(totals.otherResult.total)}</td>
              <td className="tp-cell-percent">{calcShare(Math.abs(totals.otherResult.total))}</td>
            </tr>

            {expandOther && (
              <>
                <tr className="tp-dre-row-subitem">
                  <td className="tp-cell-name tp-indent-1">(+) Outras Receitas Operacionais</td>
                  <td className="tp-cell-amount">
                    {formatCurrency(totals.otherResult.otherIncome)}
                  </td>
                  <td className="tp-cell-percent">{calcShare(totals.otherResult.otherIncome)}</td>
                </tr>
                <tr className="tp-dre-row-subitem">
                  <td className="tp-cell-name tp-indent-1">(-) Outras Despesas Operacionais</td>
                  <td className="tp-cell-amount">
                    -{formatCurrency(totals.otherResult.otherExpenses)}
                  </td>
                  <td className="tp-cell-percent">{calcShare(totals.otherResult.otherExpenses)}</td>
                </tr>
              </>
            )}

            {/* 9. Resultado Líquido Gerencial Estimado (Prominent Final Line) */}
            <tr
              className={`tp-dre-row-final ${
                isNetPositive
                  ? "is-profit"
                  : isNetNegative
                  ? "is-loss"
                  : "is-even"
              }`}
            >
              <td className="tp-cell-name">
                <span className="tp-dre-badge-math is-equals">(=)</span>
                <div>
                  <strong className="tp-final-label">
                    Resultado Líquido Gerencial Estimado
                  </strong>
                  <span className="tp-final-status-pill">
                    {!hasNetResult
                      ? "Cobertura insuficiente"
                      : totals.status === "PROFIT"
                      ? "Lucro"
                      : totals.status === "LOSS"
                      ? "Prejuízo"
                      : "Equilíbrio"}
                  </span>
                  {totals.isEstimated && hasNetResult && (
                    <span
                      style={{
                        background: "rgba(56, 189, 248, 0.15)",
                        color: "#38bdf8",
                        border: "1px solid rgba(56, 189, 248, 0.3)",
                        borderRadius: "999px",
                        padding: "2px 8px",
                        fontSize: "10.5px",
                        fontWeight: 700,
                        marginLeft: "6px",
                      }}
                    >
                      {totals.costQualityStatus === "HIGH_CONFIDENCE_ESTIMATE"
                        ? `Alta confiança (${totals.costCoveragePercent ? `${totals.costCoveragePercent.toFixed(1)}%` : "97.9%"})`
                        : "Estimativa provisória"}
                    </span>
                  )}
                </div>
              </td>
              <td className="tp-cell-amount">
                <strong className="tp-final-amount">
                  {hasNetResult
                    ? formatCurrency(totals.netManagerialResult as number)
                    : "Indisponível (cobertura insuficiente)"}
                </strong>
              </td>
              <td className="tp-cell-percent">
                <strong className="tp-final-percent">
                  {hasNetResult && totals.netManagerialMarginPercent !== null
                    ? formatPercent(totals.netManagerialMarginPercent, 2)
                    : "—"}
                </strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
