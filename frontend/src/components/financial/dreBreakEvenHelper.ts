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
 * When cost coverage is partial (costCoveragePercent < 100%), computes a provisional
 * break-even based on the economically covered revenue and margin, setting
 * calculationBasis: "COVERED_REVENUE" and isProvisional: true.
 */
export function calculateBreakEven(
  realizedRevenue: number,
  contributionMargin: number,
  netResult: number | null,
  options?: {
    fullManagerialResultAvailable?: boolean;
    costCoveragePercent?: number | null;
    coveredRevenue?: number;
    coveredContributionMargin?: number;
    partialManagerialResult?: number | null;
    isProvisional?: boolean;
  },
): DreBreakEvenDto {
  const rev = r2(realizedRevenue);
  const cm = r2(contributionMargin);
  const isFull = (options?.fullManagerialResultAvailable ?? true) && netResult !== null;

  if (isFull) {
    if (rev <= 0) {
      return {
        status: "NO_REVENUE",
        realizedRevenue: rev,
        contributionMargin: cm,
        contributionMarginRate: null,
        netResult: r2(netResult),
        additionalRevenueNeeded: null,
        breakEvenRevenue: null,
        additionalRevenuePercent: null,
        isProvisional: options?.isProvisional ?? false,
        calculationBasis: "FULL",
        costCoveragePercent: options?.costCoveragePercent ?? 100,
      };
    }

    const rate = cm / rev;

    if (rate <= 0) {
      return {
        status: "UNVIABLE_MARGIN",
        realizedRevenue: rev,
        contributionMargin: cm,
        contributionMarginRate: r4(rate),
        netResult: r2(netResult),
        additionalRevenueNeeded: null,
        breakEvenRevenue: null,
        additionalRevenuePercent: null,
        isProvisional: options?.isProvisional ?? false,
        calculationBasis: "FULL",
        costCoveragePercent: options?.costCoveragePercent ?? 100,
      };
    }

    const net = r2(netResult);

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
        isProvisional: options?.isProvisional ?? false,
        calculationBasis: "FULL",
        costCoveragePercent: options?.costCoveragePercent ?? 100,
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
      isProvisional: options?.isProvisional ?? false,
      calculationBasis: "FULL",
      costCoveragePercent: options?.costCoveragePercent ?? 100,
    };
  }

  // Cobertura Parcial de Custos (Cálculo Provisório sobre a parcela coberta)
  const covRev = options?.coveredRevenue !== undefined ? r2(options.coveredRevenue) : null;
  const covCm = options?.coveredContributionMargin !== undefined ? r2(options.coveredContributionMargin) : null;
  const covNet = options?.partialManagerialResult !== undefined && options.partialManagerialResult !== null
    ? r2(options.partialManagerialResult)
    : (netResult !== null ? r2(netResult) : null);
  const costCoveragePercent = options?.costCoveragePercent ?? null;

  if (rev <= 0 || (covRev !== null && covRev <= 0)) {
    return {
      status: "NO_REVENUE",
      realizedRevenue: rev,
      contributionMargin: cm,
      contributionMarginRate: null,
      netResult: covNet,
      additionalRevenueNeeded: null,
      breakEvenRevenue: null,
      additionalRevenuePercent: null,
      isProvisional: true,
      calculationBasis: "COVERED_REVENUE",
      ...(covRev !== null ? { coveredRevenue: covRev } : {}),
      ...(covCm !== null ? { coveredContributionMargin: covCm } : {}),
      costCoveragePercent,
    };
  }

  if (covRev === null || covCm === null || covNet === null) {
    return {
      status: "INCOMPLETE_COST_COVERAGE",
      realizedRevenue: rev,
      contributionMargin: cm,
      contributionMarginRate: rev > 0 ? r4(cm / rev) : null,
      netResult: null,
      additionalRevenueNeeded: null,
      breakEvenRevenue: null,
      additionalRevenuePercent: null,
      isProvisional: true,
      calculationBasis: "COVERED_REVENUE",
      ...(covRev !== null ? { coveredRevenue: covRev } : {}),
      ...(covCm !== null ? { coveredContributionMargin: covCm } : {}),
      costCoveragePercent,
    };
  }

  const rate = covCm / covRev;

  if (rate <= 0) {
    return {
      status: "UNVIABLE_MARGIN",
      realizedRevenue: rev,
      contributionMargin: covCm,
      contributionMarginRate: r4(rate),
      netResult: covNet,
      additionalRevenueNeeded: null,
      breakEvenRevenue: null,
      additionalRevenuePercent: null,
      isProvisional: true,
      calculationBasis: "COVERED_REVENUE",
      coveredRevenue: covRev,
      coveredContributionMargin: covCm,
      costCoveragePercent,
    };
  }

  if (covNet >= 0) {
    const implicitBreakEven = Math.max(0, r2(covRev - covNet / rate));
    return {
      status: "INCOMPLETE_COST_COVERAGE",
      realizedRevenue: rev,
      contributionMargin: covCm,
      contributionMarginRate: r4(rate),
      netResult: covNet,
      additionalRevenueNeeded: 0,
      breakEvenRevenue: implicitBreakEven,
      additionalRevenuePercent: 0,
      isProvisional: true,
      calculationBasis: "COVERED_REVENUE",
      coveredRevenue: covRev,
      coveredContributionMargin: covCm,
      costCoveragePercent,
    };
  }

  const additionalRevenueNeeded = r2(Math.abs(covNet) / rate);
  const breakEvenRevenue = r2(covRev + additionalRevenueNeeded);
  const additionalRevenuePercent = r4((additionalRevenueNeeded / covRev) * 100);

  return {
    status: "INCOMPLETE_COST_COVERAGE",
    realizedRevenue: rev,
    contributionMargin: covCm,
    contributionMarginRate: r4(rate),
    netResult: covNet,
    additionalRevenueNeeded,
    breakEvenRevenue,
    additionalRevenuePercent,
    isProvisional: true,
    calculationBasis: "COVERED_REVENUE",
    coveredRevenue: covRev,
    coveredContributionMargin: covCm,
    costCoveragePercent,
  };
}

/**
 * Returns the short narrative sentence for monthly charts and tooltips.
 */
export function formatMonthlyBreakEvenTooltip(
  breakEven: DreBreakEvenDto,
  formatCurrencyFn: (value: number) => string,
): string | null {
  if (breakEven.calculationBasis === "COVERED_REVENUE") {
    if (breakEven.breakEvenRevenue !== null) {
      const covPctStr = breakEven.costCoveragePercent !== null && breakEven.costCoveragePercent !== undefined
        ? ` (${breakEven.costCoveragePercent.toFixed(1).replace(".", ",")}% de cobertura)`
        : "";
      if (breakEven.additionalRevenueNeeded === 0) {
        return `Estimativa provisória: ponto de equilíbrio superado sobre a parcela coberta${covPctStr}.`;
      }
      return `Estimativa provisória: faltou faturar aproximadamente ${formatCurrencyFn(breakEven.additionalRevenueNeeded!)} sobre a receita coberta${covPctStr}.`;
    }
    return "Cobertura de custos parcial: equilíbrio indisponível.";
  }

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
