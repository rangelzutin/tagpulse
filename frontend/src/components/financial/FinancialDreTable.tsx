import { useState } from "react";
import { ChevronDown, ChevronRight, HelpCircle } from "lucide-react";
import type { DreSummaryTotalsDto } from "../../api/financial";
import { formatCurrency, formatPercent } from "../../utils/formatters";

interface FinancialDreTableProps {
  totals: DreSummaryTotalsDto;
  realizedRevenue: number;
}

export function FinancialDreTable({ totals, realizedRevenue }: FinancialDreTableProps) {
  const [expandVariables, setExpandVariables] = useState(true);
  const [expandOperating, setExpandOperating] = useState(true);
  const [expandFinancial, setExpandFinancial] = useState(false);
  const [expandOther, setExpandOther] = useState(false);

  const safeRevenue = realizedRevenue > 0 ? realizedRevenue : 1;

  const calcShare = (val: number) => {
    if (realizedRevenue <= 0) return "—";
    return formatPercent((val / safeRevenue) * 100, 2);
  };

  const isNetPositive = totals.netManagerialResult > 0;
  const isNetNegative = totals.netManagerialResult < 0;

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
                <span className="tp-dre-item-count">(5 itens)</span>
              </td>
              <td className="tp-cell-amount tp-text-deduction">
                -{formatCurrency(totals.variableExpenses.total)}
              </td>
              <td className="tp-cell-percent">{calcShare(totals.variableExpenses.total)}</td>
            </tr>

            {/* Despesas Variáveis Subitens */}
            {expandVariables && (
              <>
                <tr className="tp-dre-row-subitem">
                  <td className="tp-cell-name tp-indent-1">Taxas de Pagamento</td>
                  <td className="tp-cell-amount">
                    {formatCurrency(totals.variableExpenses.paymentFees)}
                  </td>
                  <td className="tp-cell-percent">{calcShare(totals.variableExpenses.paymentFees)}</td>
                </tr>
                <tr className="tp-dre-row-subitem">
                  <td className="tp-cell-name tp-indent-1">Impostos sobre Vendas</td>
                  <td className="tp-cell-amount">
                    {formatCurrency(totals.variableExpenses.taxesOnRevenue)}
                  </td>
                  <td className="tp-cell-percent">{calcShare(totals.variableExpenses.taxesOnRevenue)}</td>
                </tr>
                <tr className="tp-dre-row-subitem">
                  <td className="tp-cell-name tp-indent-1">Fretes / Logística</td>
                  <td className="tp-cell-amount">
                    {formatCurrency(totals.variableExpenses.freightLogistics)}
                  </td>
                  <td className="tp-cell-percent">{calcShare(totals.variableExpenses.freightLogistics)}</td>
                </tr>
                <tr className="tp-dre-row-subitem">
                  <td className="tp-cell-name tp-indent-1">Comissões</td>
                  <td className="tp-cell-amount">
                    {formatCurrency(totals.variableExpenses.salesCommissions)}
                  </td>
                  <td className="tp-cell-percent">{calcShare(totals.variableExpenses.salesCommissions)}</td>
                </tr>
                <tr className="tp-dre-row-subitem">
                  <td className="tp-cell-name tp-indent-1">Outras Despesas Variáveis</td>
                  <td className="tp-cell-amount">
                    {formatCurrency(totals.variableExpenses.other)}
                  </td>
                  <td className="tp-cell-percent">{calcShare(totals.variableExpenses.other)}</td>
                </tr>
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
                <span className="tp-dre-item-count">(10 categorias)</span>
              </td>
              <td className="tp-cell-amount tp-text-deduction">
                -{formatCurrency(totals.operatingExpenses.total)}
              </td>
              <td className="tp-cell-percent">{calcShare(totals.operatingExpenses.total)}</td>
            </tr>

            {/* Despesas Operacionais Subitens */}
            {expandOperating && (
              <>
                <tr className="tp-dre-row-subitem">
                  <td className="tp-cell-name tp-indent-1">Pessoal / Encargos</td>
                  <td className="tp-cell-amount">
                    {formatCurrency(totals.operatingExpenses.personnel)}
                  </td>
                  <td className="tp-cell-percent">{calcShare(totals.operatingExpenses.personnel)}</td>
                </tr>
                <tr className="tp-dre-row-subitem">
                  <td className="tp-cell-name tp-indent-1">Pró-labore</td>
                  <td className="tp-cell-amount">
                    {formatCurrency(totals.operatingExpenses.partnerCompensation)}
                  </td>
                  <td className="tp-cell-percent">{calcShare(totals.operatingExpenses.partnerCompensation)}</td>
                </tr>
                <tr className="tp-dre-row-subitem">
                  <td className="tp-cell-name tp-indent-1">Marketing</td>
                  <td className="tp-cell-amount">
                    {formatCurrency(totals.operatingExpenses.marketing)}
                  </td>
                  <td className="tp-cell-percent">{calcShare(totals.operatingExpenses.marketing)}</td>
                </tr>
                <tr className="tp-dre-row-subitem">
                  <td className="tp-cell-name tp-indent-1">Ocupação</td>
                  <td className="tp-cell-amount">
                    {formatCurrency(totals.operatingExpenses.occupancy)}
                  </td>
                  <td className="tp-cell-percent">{calcShare(totals.operatingExpenses.occupancy)}</td>
                </tr>
                <tr className="tp-dre-row-subitem">
                  <td className="tp-cell-name tp-indent-1">Utilidades</td>
                  <td className="tp-cell-amount">
                    {formatCurrency(totals.operatingExpenses.utilities)}
                  </td>
                  <td className="tp-cell-percent">{calcShare(totals.operatingExpenses.utilities)}</td>
                </tr>
                <tr className="tp-dre-row-subitem">
                  <td className="tp-cell-name tp-indent-1">Software</td>
                  <td className="tp-cell-amount">
                    {formatCurrency(totals.operatingExpenses.software)}
                  </td>
                  <td className="tp-cell-percent">{calcShare(totals.operatingExpenses.software)}</td>
                </tr>
                <tr className="tp-dre-row-subitem">
                  <td className="tp-cell-name tp-indent-1">Contabilidade</td>
                  <td className="tp-cell-amount">
                    {formatCurrency(totals.operatingExpenses.accounting)}
                  </td>
                  <td className="tp-cell-percent">{calcShare(totals.operatingExpenses.accounting)}</td>
                </tr>
                <tr className="tp-dre-row-subitem">
                  <td className="tp-cell-name tp-indent-1">Infraestrutura</td>
                  <td className="tp-cell-amount">
                    {formatCurrency(totals.operatingExpenses.infrastructure)}
                  </td>
                  <td className="tp-cell-percent">{calcShare(totals.operatingExpenses.infrastructure)}</td>
                </tr>
                <tr className="tp-dre-row-subitem">
                  <td className="tp-cell-name tp-indent-1">Administrativo</td>
                  <td className="tp-cell-amount">
                    {formatCurrency(totals.operatingExpenses.administrative)}
                  </td>
                  <td className="tp-cell-percent">{calcShare(totals.operatingExpenses.administrative)}</td>
                </tr>
                <tr className="tp-dre-row-subitem">
                  <td className="tp-cell-name tp-indent-1">Outros</td>
                  <td className="tp-cell-amount">
                    {formatCurrency(totals.operatingExpenses.other)}
                  </td>
                  <td className="tp-cell-percent">{calcShare(totals.operatingExpenses.other)}</td>
                </tr>
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
                <tr className="tp-dre-row-subitem">
                  <td className="tp-cell-name tp-indent-1">(+) Receitas Financeiras</td>
                  <td className="tp-cell-amount tp-text-positive">
                    {formatCurrency(totals.financialResult.financialIncome)}
                  </td>
                  <td className="tp-cell-percent">{calcShare(totals.financialResult.financialIncome)}</td>
                </tr>
                <tr className="tp-dre-row-subitem">
                  <td className="tp-cell-name tp-indent-1">(-) Despesas Financeiras</td>
                  <td className="tp-cell-amount tp-text-deduction">
                    -{formatCurrency(totals.financialResult.financialExpenses)}
                  </td>
                  <td className="tp-cell-percent">{calcShare(totals.financialResult.financialExpenses)}</td>
                </tr>
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
                    {totals.status === "PROFIT"
                      ? "Lucro"
                      : totals.status === "LOSS"
                      ? "Prejuízo"
                      : "Equilíbrio"}
                  </span>
                </div>
              </td>
              <td className="tp-cell-amount">
                <strong className="tp-final-amount">
                  {formatCurrency(totals.netManagerialResult)}
                </strong>
              </td>
              <td className="tp-cell-percent">
                <strong className="tp-final-percent">
                  {totals.netManagerialMarginPercent !== null
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
