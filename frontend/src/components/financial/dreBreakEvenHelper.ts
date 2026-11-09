import type {
  DreBreakEvenDto,
  DreBreakEvenStatus,
} from "../../api/financial";

export interface BreakEvenOptions {
  costCoveragePercent?: number | null;
  fullCoverage?: boolean;
}

const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number): number => Math.round((n + Number.EPSILON) * 10000) / 10000;

export const DRE_BREAK_EVEN_HELP_TEXT =
  "Estimativa de quanto seria necessário faturar, mantendo a margem de contribuição atual, para que o resultado gerencial do período chegasse a zero.";

export const DRE_BREAK_EVEN_UNVIABLE_TITLE =
  "Margem de contribuição insuficiente";

export const DRE_BREAK_EVEN_UNVIABLE_MESSAGE =
  "Com a margem atual, vender mais não é suficiente para atingir o equilíbrio.";

export const DRE_BREAK_EVEN_UNVIABLE_SUBTEXT =
  "Nas condições atuais, aumento de faturamento isoladamente não elimina o prejuízo.";

export const DRE_BREAK_EVEN_PARTIAL_COVERAGE_TITLE =
  "Ponto de equilíbrio indisponível por cobertura parcial de custos";

export const DRE_BREAK_EVEN_PARTIAL_COVERAGE_MESSAGE =
  "Para calcular o ponto de equilíbrio de forma fidedigna, é necessário 100% de cobertura de custos dos produtos vendidos.";

export const DRE_BREAK_EVEN_PARTIAL_COVERAGE_SUBTEXT =
  "No período selecionado, parte das vendas não possui custo histórico cadastrado. Exibir uma estimativa sem o CMV completo geraria uma meta artificialmente baixa e incorreta.";

/**
 * Pure calculation function for break-even, matching the backend deterministic formula.
 * Strictly respects cost coverage semantics: when cost coverage is incomplete or netResult is null,
 * returns UNDETERMINED_PARTIAL_COST_COVERAGE to prevent false projections.
 */
export function calculateBreakEven(
  realizedRevenue: number,
  contributionMargin: number,
  netResult: number | null,
  options?: BreakEvenOptions,
): DreBreakEvenDto {
  const rev = r2(realizedRevenue);
  const cm = r2(contributionMargin);

  const hasIncompleteCoverage =
    options?.fullCoverage === false ||
    (options?.costCoveragePercent != null && options.costCoveragePercent < 100) ||
    netResult === null;

  if (hasIncompleteCoverage) {
    return {
      status: "UNDETERMINED_PARTIAL_COST_COVERAGE",
      realizedRevenue: rev,
      contributionMargin: cm,
      contributionMarginRate: rev > 0 ? r4(cm / rev) : null,
      netResult: null,
      additionalRevenueNeeded: null,
      breakEvenRevenue: null,
      additionalRevenuePercent: null,
      safetyMarginPercent: null,
      currentCoveragePercent: null,
      coverageNotice: DRE_BREAK_EVEN_PARTIAL_COVERAGE_SUBTEXT,
    };
  }

  const net = r2(netResult);

  if (rev <= 0) {
    const status: DreBreakEvenStatus =
      net < 0 ? "UNDETERMINED_NO_REVENUE_WITH_COSTS" : "UNDETERMINED_ZERO_REVENUE";
    return {
      status,
      realizedRevenue: rev,
      contributionMargin: cm,
      contributionMarginRate: null,
      netResult: net,
      additionalRevenueNeeded: null,
      breakEvenRevenue: null,
      additionalRevenuePercent: null,
      safetyMarginPercent: null,
      currentCoveragePercent: null,
    };
  }

  const rate = cm / rev;

  if (rate <= 0) {
    return {
      status: "UNDETERMINED_ZERO_MARGIN",
      realizedRevenue: rev,
      contributionMargin: cm,
      contributionMarginRate: r4(rate),
      netResult: net,
      additionalRevenueNeeded: null,
      breakEvenRevenue: null,
      additionalRevenuePercent: null,
      safetyMarginPercent: null,
      currentCoveragePercent: null,
    };
  }

  if (net >= 0) {
    const implicitBreakEven = Math.max(0, r2(rev - net / rate));
    const safetyMargin = rev > 0 ? r2(((rev - implicitBreakEven) / rev) * 100) : null;
    const currentCoverage = implicitBreakEven > 0 ? r2((rev / implicitBreakEven) * 100) : null;
    return {
      status: "PROFITABLE",
      realizedRevenue: rev,
      contributionMargin: cm,
      contributionMarginRate: r4(rate),
      netResult: net,
      additionalRevenueNeeded: 0,
      breakEvenRevenue: implicitBreakEven,
      additionalRevenuePercent: 0,
      safetyMarginPercent: safetyMargin,
      currentCoveragePercent: currentCoverage,
    };
  }

  const additionalRevenueNeeded = r2(Math.abs(net) / rate);
  const breakEvenRevenue = r2(rev + additionalRevenueNeeded);
  const additionalRevenuePercent = r4((additionalRevenueNeeded / rev) * 100);
  const currentCoverage = breakEvenRevenue > 0 ? r2((rev / breakEvenRevenue) * 100) : null;

  return {
    status: "UNREACHED",
    realizedRevenue: rev,
    contributionMargin: cm,
    contributionMarginRate: r4(rate),
    netResult: net,
    additionalRevenueNeeded,
    breakEvenRevenue,
    additionalRevenuePercent,
    safetyMarginPercent: null,
    currentCoveragePercent: currentCoverage,
  };
}

/**
 * Returns the short narrative sentence for monthly charts and tooltips.
 */
export function formatMonthlyBreakEvenTooltip(
  breakEven: DreBreakEvenDto,
  formatCurrencyFn: (value: number) => string,
): string | null {
  const isBelow =
    breakEven.status === "UNREACHED" || breakEven.status === "BELOW_BREAK_EVEN";
  const isAbove =
    breakEven.status === "PROFITABLE" || breakEven.status === "ABOVE_BREAK_EVEN";
  const isUnviable =
    breakEven.status === "UNDETERMINED_ZERO_MARGIN" ||
    breakEven.status === "UNVIABLE_MARGIN";
  const isPartial = breakEven.status === "UNDETERMINED_PARTIAL_COST_COVERAGE";

  if (isBelow && breakEven.additionalRevenueNeeded !== null) {
    return `Faltou faturar aproximadamente ${formatCurrencyFn(breakEven.additionalRevenueNeeded)} para atingir o equilíbrio.`;
  }
  if (isAbove) {
    return "Ponto de equilíbrio superado.";
  }
  if (isUnviable) {
    return "Margem insuficiente para estimar equilíbrio por aumento de vendas.";
  }
  if (isPartial) {
    return "Cobertura parcial de CMV: ponto de equilíbrio não projetado para evitar metas irreais.";
  }
  return null;
}
