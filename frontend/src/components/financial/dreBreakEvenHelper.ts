import type {
  DreBreakEvenDto,
  DreBreakEvenStatus,
  DreCostQualityStatus,
} from "../../api/financial";

export interface BreakEvenOptions {
  costCoveragePercent?: number | null;
  fullCoverage?: boolean;
  coveredRevenue?: number;
  coveredContributionMargin?: number;
  partialManagerialResult?: number | null;
  operatingExpenses?: number | null;
  financialResult?: number | null;
  isProvisional?: boolean;
  costQualityStatus?: DreCostQualityStatus;
  estimatedContributionMargin?: number | null;
  estimatedContributionMarginRate?: number | null;
  estimatedNetResult?: number | null;
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
  "O cálculo é liberado quando 100% da receita possui custo disponível.";

export const DRE_BREAK_EVEN_PARTIAL_COVERAGE_SUBTEXT =
  "No período selecionado, a cobertura de custo está abaixo de 80%. Complete os custos pendentes para liberar a projeção do ponto de equilíbrio.";

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

  let cov: number | null = null;
  if (options?.costCoveragePercent != null) {
    cov = options.costCoveragePercent;
  } else if (options?.fullCoverage === true) {
    cov = 100;
  }

  const costQualityStatus: DreCostQualityStatus =
    options?.costQualityStatus ??
    (cov !== null
      ? cov >= 100
        ? "FINAL"
        : cov >= 95
        ? "HIGH_CONFIDENCE_ESTIMATE"
        : cov >= 80
        ? "PROVISIONAL_ESTIMATE"
        : "INSUFFICIENT_COST_COVERAGE"
      : netResult !== null && options?.fullCoverage !== false
      ? "FINAL"
      : "INSUFFICIENT_COST_COVERAGE");

  const hasIncompleteCoverage =
    options?.fullCoverage === false ||
    (options?.costCoveragePercent != null && options.costCoveragePercent < 100) ||
    netResult === null;

  if (hasIncompleteCoverage) {
    const covRev = options?.coveredRevenue !== undefined ? r2(options.coveredRevenue) : null;
    const covCm = options?.coveredContributionMargin !== undefined ? r2(options.coveredContributionMargin) : null;
    const rawRate =
      covRev !== null
        ? (covRev > 0 && covCm !== null ? covCm / covRev : null)
        : (rev > 0 ? cm / rev : null);
    const covRate = rawRate !== null ? r4(rawRate) : null;

    const opExp =
      options?.operatingExpenses !== undefined && options.operatingExpenses !== null
        ? r2(options.operatingExpenses)
        : null;
    const finResult =
      options?.financialResult !== undefined && options.financialResult !== null
        ? r2(options.financialResult)
        : 0;

    const fixedBase =
      opExp !== null
        ? r2(opExp - finResult)
        : options?.partialManagerialResult != null && covCm !== null
        ? r2(covCm - options.partialManagerialResult)
        : netResult !== null
        ? r2(cm - netResult)
        : null;

    let provBreakEven: number | null = null;
    let provGap: number | null = null;
    let provCoverage: number | null = null;

    if (rawRate && rawRate > 0 && fixedBase !== null && fixedBase > 0) {
      provBreakEven = r2(fixedBase / rawRate);
      if (covRev !== null) {
        provGap = r2(provBreakEven - covRev);
        provCoverage = provBreakEven > 0 ? r2((covRev / provBreakEven) * 100) : null;
      }
    }

    if (costQualityStatus === "INSUFFICIENT_COST_COVERAGE") {
      return {
        status: "UNDETERMINED_PARTIAL_COST_COVERAGE",
        realizedRevenue: rev,
        contributionMargin: covCm !== null ? covCm : cm,
        contributionMarginRate: covRate,
        netResult: null,
        additionalRevenueNeeded: null,
        breakEvenRevenue: null,
        additionalRevenuePercent: null,
        safetyMarginPercent: null,
        currentCoveragePercent: null,
        coverageNotice: DRE_BREAK_EVEN_PARTIAL_COVERAGE_SUBTEXT,
        isProvisional: true,
        calculationBasis: "COVERED_REVENUE",
        costCoveragePercent: options?.costCoveragePercent ?? null,
        costQualityStatus: "INSUFFICIENT_COST_COVERAGE",
        isEstimated: true,
        ...(covRev !== null ? { coveredRevenue: covRev } : {}),
        ...(covCm !== null ? { coveredContributionMargin: covCm } : {}),
        ...(fixedBase !== null ? { provisionalFixedCostBase: fixedBase } : {}),
        ...(provBreakEven !== null ? { provisionalBreakEvenRevenue: provBreakEven } : {}),
        ...(provGap !== null ? { provisionalGap: provGap } : {}),
        ...(provCoverage !== null ? { provisionalCurrentCoveragePercent: provCoverage } : {}),
      };
    }

    const estCm = options?.estimatedContributionMargin ?? cm;
    const estRate = options?.estimatedContributionMarginRate ?? (rev > 0 ? estCm / rev : null);
    const estNet = options?.estimatedNetResult ?? netResult;

    let estBreakEven: number | null = null;
    let addRevNeeded: number | null = null;
    let addRevPct: number | null = null;
    let safetyMargin: number | null = null;
    let currentCoverage: number | null = null;

    if (estRate && estRate > 0 && fixedBase !== null && fixedBase > 0) {
      estBreakEven = r2(fixedBase / estRate);
      if (estNet !== null && estNet >= 0 && rev > 0) {
        safetyMargin = r2(((rev - estBreakEven) / rev) * 100);
      }
      addRevNeeded = Math.max(0, r2(estBreakEven - rev));
      addRevPct = rev > 0 ? r2((addRevNeeded / rev) * 100) : null;
      currentCoverage = estBreakEven > 0 ? r2((rev / estBreakEven) * 100) : null;
    }

    const status: DreBreakEvenStatus =
      estBreakEven === null
        ? "UNDETERMINED_PARTIAL_COST_COVERAGE"
        : (estNet !== null ? estNet >= 0 : rev >= estBreakEven)
        ? "PROFITABLE"
        : "UNREACHED";

    return {
      status,
      realizedRevenue: rev,
      contributionMargin: estCm,
      contributionMarginRate: estRate !== null ? r4(estRate) : null,
      netResult: estNet,
      additionalRevenueNeeded: addRevNeeded,
      breakEvenRevenue: estBreakEven,
      additionalRevenuePercent: addRevPct,
      safetyMarginPercent: safetyMargin,
      currentCoveragePercent: currentCoverage,
      coverageNotice:
        costQualityStatus === "HIGH_CONFIDENCE_ESTIMATE"
          ? "Estimativa de alta confiança baseada em cobertura de custos >= 95%."
          : "Estimativa provisória baseada em cobertura de custos entre 80% e 95%.",
      isProvisional: true,
      calculationBasis: "COVERED_REVENUE",
      costCoveragePercent: options?.costCoveragePercent ?? null,
      costQualityStatus,
      isEstimated: true,
      ...(covRev !== null ? { coveredRevenue: covRev } : {}),
      ...(covCm !== null ? { coveredContributionMargin: covCm } : {}),
      ...(fixedBase !== null ? { provisionalFixedCostBase: fixedBase } : {}),
      ...(provBreakEven !== null ? { provisionalBreakEvenRevenue: provBreakEven } : {}),
      ...(provGap !== null ? { provisionalGap: provGap } : {}),
      ...(provCoverage !== null ? { provisionalCurrentCoveragePercent: provCoverage } : {}),
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
      costQualityStatus: "FINAL",
      isEstimated: false,
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
      costQualityStatus: "FINAL",
      isEstimated: false,
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
      costQualityStatus: "FINAL",
      isEstimated: false,
    };
  }

  const additionalRevenueNeeded = r2(Math.abs(net) / rate);
  const breakEvenRevenue = r2(rev + additionalRevenueNeeded);
  const additionalRevenuePercent = r4((additionalRevenueNeeded / rev) * 100);
  const currentCoverage =
    breakEvenRevenue > 0 ? r2((rev / breakEvenRevenue) * 100) : null;

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
    costQualityStatus: "FINAL",
    isEstimated: false,
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
