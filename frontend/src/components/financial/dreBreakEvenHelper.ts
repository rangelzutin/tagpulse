import type {
  DreBreakEvenDto,
  DreBreakEvenStatus,
} from "../../api/financial";

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

export const DRE_BREAK_EVEN_INCOMPLETE_TITLE =
  "Cobertura de custos parcial";

export const DRE_BREAK_EVEN_INCOMPLETE_MESSAGE =
  "Ponto de equilíbrio indisponível devido à cobertura parcial de custos no período selecionado.";

/**
 * Pure calculation function for break-even, matching the backend deterministic formula.
 * Returns INCOMPLETE_COST_COVERAGE when managerial result is not fully available.
 */
export function calculateBreakEven(
  realizedRevenue: number,
  contributionMargin: number,
  netResult: number | null,
  options?: { fullManagerialResultAvailable?: boolean },
): DreBreakEvenDto {
  const rev = r2(realizedRevenue);
  const cm = r2(contributionMargin);

  if (rev <= 0) {
    return {
      status: "NO_REVENUE",
      realizedRevenue: rev,
      contributionMargin: cm,
      contributionMarginRate: null,
      netResult: netResult !== null ? r2(netResult) : null,
      additionalRevenueNeeded: null,
      breakEvenRevenue: null,
      additionalRevenuePercent: null,
    };
  }

  const rate = cm / rev;

  if (netResult === null || options?.fullManagerialResultAvailable === false) {
    return {
      status: "INCOMPLETE_COST_COVERAGE",
      realizedRevenue: rev,
      contributionMargin: cm,
      contributionMarginRate: r4(rate),
      netResult: null,
      additionalRevenueNeeded: null,
      breakEvenRevenue: null,
      additionalRevenuePercent: null,
    };
  }

  const net = r2(netResult);

  if (rate <= 0) {
    return {
      status: "UNVIABLE_MARGIN",
      realizedRevenue: rev,
      contributionMargin: cm,
      contributionMarginRate: r4(rate),
      netResult: net,
      additionalRevenueNeeded: null,
      breakEvenRevenue: null,
      additionalRevenuePercent: null,
    };
  }

  if (net >= 0) {
    const implicitBreakEven = Math.max(0, r2(rev - net / rate));
    return {
      status: "ABOVE_BREAK_EVEN",
      realizedRevenue: rev,
      contributionMargin: cm,
      contributionMarginRate: r4(rate),
      netResult: net,
      additionalRevenueNeeded: 0,
      breakEvenRevenue: implicitBreakEven,
      additionalRevenuePercent: 0,
    };
  }

  const additionalRevenueNeeded = r2(Math.abs(net) / rate);
  const breakEvenRevenue = r2(rev + additionalRevenueNeeded);
  const additionalRevenuePercent = r4((additionalRevenueNeeded / rev) * 100);

  return {
    status: "BELOW_BREAK_EVEN",
    realizedRevenue: rev,
    contributionMargin: cm,
    contributionMarginRate: r4(rate),
    netResult: net,
    additionalRevenueNeeded,
    breakEvenRevenue,
    additionalRevenuePercent,
  };
}

/**
 * Returns the short narrative sentence for monthly charts and tooltips.
 */
export function formatMonthlyBreakEvenTooltip(
  breakEven: DreBreakEvenDto,
  formatCurrencyFn: (value: number) => string,
): string | null {
  if (breakEven.status === "BELOW_BREAK_EVEN" && breakEven.additionalRevenueNeeded !== null) {
    return `Faltou faturar aproximadamente ${formatCurrencyFn(breakEven.additionalRevenueNeeded)} para atingir o equilíbrio.`;
  }
  if (breakEven.status === "ABOVE_BREAK_EVEN") {
    return "Ponto de equilíbrio superado.";
  }
  if (breakEven.status === "UNVIABLE_MARGIN") {
    return "Margem insuficiente para estimar equilíbrio por aumento de vendas.";
  }
  if (breakEven.status === "INCOMPLETE_COST_COVERAGE") {
    return "Cobertura de custos parcial: equilíbrio indisponível.";
  }
  return null;
}
