import type {
  DreMonthlyItemDto,
  DreEconomicStatus,
} from "../../api/financial";
import { formatMonthLabel, getLocalDateString } from "../../utils/formatters";

export type DreChartGranularity = "monthly" | "quarterly" | "yearly";

export interface DreEvolutionPeriod {
  from: string; // "YYYY-MM-DD" or "YYYY-MM"
  to: string; // "YYYY-MM-DD" or "YYYY-MM"
}

export interface DreChartBucket {
  /** Key identifier: "YYYY-MM", "YYYY-Q1", or "YYYY" */
  key: string;
  /** Formatted axis/tooltip label: "Set/26", "T3/26", or "2026" */
  label: string;
  /** Alias kept for Recharts XAxis compatibility */
  formattedMonth: string;
  /** Granularity of this bucket */
  granularity: DreChartGranularity;
  /** True when the bucket belongs to the user-selected range */
  isSelected: boolean;
  /** True when the bucket is part of the 6-month context outside the selected range */
  isContext: boolean;
  /** Constituent months ("YYYY-MM") aggregated in this bucket */
  months: string[];
  realizedRevenue: number;
  estimatedCOGS: number;
  estimatedGrossProfit: number;
  estimatedGrossMarginPercent: number | null;
  variableExpensesTotal: number;
  contributionMargin: number;
  contributionMarginPercent: number | null;
  operatingExpensesTotal: number;
  financialResultTotal: number;
  otherResultTotal: number;
  netManagerialResult: number;
  netManagerialMarginPercent: number | null;
  status: DreEconomicStatus;
  dataQuality: {
    isProvisional: boolean;
    financiallyClosed: boolean;
    pendingAccruals: string[];
  };
}

export interface AdaptiveDreEvolutionResult {
  granularity: DreChartGranularity;
  selectedMonths: string[];
  chartContextMonths: string[];
  hasContextWindow: boolean;
  contextNotice: string | null;
  chartBuckets: DreChartBucket[];
  tableRows: DreMonthlyItemDto[];
  hasProvisionalInVisibleChart: boolean;
}

const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const toCents = (n: number): number => Math.round(n * 100);
const fromCents = (c: number): number => c / 100;

export function toYearMonth(dateOrMonth: string): string {
  return dateOrMonth.trim().slice(0, 7);
}

export function parseYearMonth(ym: string): { year: number; month: number } {
  const [yStr, mStr] = ym.split("-");
  const year = parseInt(yStr || "0", 10);
  const month = parseInt(mStr || "1", 10);
  return { year, month };
}

export function formatYearMonthKey(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export function shiftYearMonth(ym: string, deltaMonths: number): string {
  const { year, month } = parseYearMonth(ym);
  const totalMonths = year * 12 + (month - 1) + deltaMonths;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;
  return formatYearMonthKey(targetYear, targetMonth);
}

export function listYearMonthsBetween(startYm: string, endYm: string): string[] {
  const start = toYearMonth(startYm);
  const end = toYearMonth(endYm);
  if (!start || !end || start > end) {
    return [];
  }

  const result: string[] = [];
  let cursor = start;
  let guard = 0;
  while (cursor <= end && guard < 1200) {
    result.push(cursor);
    cursor = shiftYearMonth(cursor, 1);
    guard += 1;
  }
  return result;
}

/**
 * Resolve the effective upper-bound month ("YYYY-MM") for a period,
 * excluding future months beyond the selected `to` date and excluding
 * future zero-revenue months beyond the reference calendar month.
 */
export function resolveEffectiveToMonth(
  periodTo: string,
  monthlyData?: DreMonthlyItemDto[],
  referenceDate: Date = new Date(),
): string {
  const rawToMonth = toYearMonth(periodTo);
  const currentCalendarMonth = getLocalDateString(referenceDate).slice(0, 7);

  if (rawToMonth <= currentCalendarMonth) {
    return rawToMonth;
  }

  if (monthlyData && monthlyData.length > 0) {
    const hasRealizedAfterRef = monthlyData.some(
      (m) => m.month > currentCalendarMonth && m.month <= rawToMonth && m.realizedRevenue > 0,
    );
    if (!hasRealizedAfterRef) {
      return currentCalendarMonth;
    }
  }

  return currentCalendarMonth;
}

/**
 * Remove months after `period.to` and future zero-revenue months beyond the reference date.
 */
export function removeFutureMonths(
  monthlyData: DreMonthlyItemDto[],
  periodTo: string,
  referenceDate: Date = new Date(),
): DreMonthlyItemDto[] {
  const effectiveTo = resolveEffectiveToMonth(periodTo, monthlyData, referenceDate);
  const currentCalendarMonth = getLocalDateString(referenceDate).slice(0, 7);

  return [...monthlyData]
    .filter((item) => {
      if (item.month > effectiveTo) {
        return false;
      }
      if (item.month > currentCalendarMonth && item.realizedRevenue === 0) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Compute the list of selected months ("YYYY-MM") for the global period,
 * excluding future months.
 */
export function getSelectedMonths(
  period: DreEvolutionPeriod,
  monthlyData?: DreMonthlyItemDto[],
  referenceDate: Date = new Date(),
): string[] {
  const fromMonth = toYearMonth(period.from);
  const effectiveToMonth = resolveEffectiveToMonth(period.to, monthlyData, referenceDate);
  if (fromMonth > effectiveToMonth) {
    return [fromMonth];
  }
  return listYearMonthsBetween(fromMonth, effectiveToMonth);
}

/**
 * For 1 or 2 selected months, return the 6-month context window ending on the last selected month.
 * For 3 or more selected months, return `selectedMonths` without extra context.
 */
export function getChartContextMonths(selectedMonths: string[]): string[] {
  if (selectedMonths.length === 0) {
    return [];
  }
  if (selectedMonths.length === 1 || selectedMonths.length === 2) {
    const lastSelectedMonth = selectedMonths[selectedMonths.length - 1]!;
    const contextStart = shiftYearMonth(lastSelectedMonth, -5);
    return listYearMonthsBetween(contextStart, lastSelectedMonth);
  }
  return [...selectedMonths];
}

/**
 * Decide chart granularity based on the number of selected months:
 * - 1..24 months -> "monthly"
 * - 25..60 months -> "quarterly"
 * - >60 months -> "yearly"
 */
export function getChartGranularity(selectedMonthsCount: number): DreChartGranularity {
  if (selectedMonthsCount > 60) {
    return "yearly";
  }
  if (selectedMonthsCount >= 25) {
    return "quarterly";
  }
  return "monthly";
}

/**
 * Build the short context notice for 1-month or 2-month selections.
 */
export function getContextNoticeText(selectedMonths: string[]): string | null {
  if (selectedMonths.length === 1) {
    return `Contexto de 6 meses — período selecionado: ${formatMonthLabel(selectedMonths[0]!)}`;
  }
  if (selectedMonths.length === 2) {
    return `Contexto de 6 meses — período selecionado: ${formatMonthLabel(selectedMonths[0]!)}–${formatMonthLabel(selectedMonths[1]!)}`;
  }
  return null;
}

/**
 * Determine which calendar years ("YYYY") must be fetched from `/financial/dre/monthly`
 * to cover both the selected period and any 6-month chart context window.
 */
export function getRequiredYearsForPeriod(
  period: DreEvolutionPeriod,
  referenceDate: Date = new Date(),
): string[] {
  const selectedMonths = getSelectedMonths(period, undefined, referenceDate);
  const contextMonths = getChartContextMonths(selectedMonths);
  const allMonths = [...selectedMonths, ...contextMonths];

  const yearSet = new Set<string>();
  for (const ym of allMonths) {
    const year = ym.slice(0, 4);
    if (year.length === 4) {
      yearSet.add(year);
    }
  }

  return Array.from(yearSet).sort();
}

function createZeroMonthlyItem(month: string): DreMonthlyItemDto {
  return {
    month,
    realizedRevenue: 0,
    estimatedCOGS: 0,
    estimatedGrossProfit: 0,
    estimatedGrossMarginPercent: null,
    variableExpenses: {
      paymentFees: 0,
      taxesOnRevenue: 0,
      freightLogistics: 0,
      salesCommissions: 0,
      other: 0,
      total: 0,
    },
    contributionMargin: 0,
    contributionMarginPercent: null,
    operatingExpenses: {
      personnel: 0,
      partnerCompensation: 0,
      marketing: 0,
      occupancy: 0,
      utilities: 0,
      software: 0,
      accounting: 0,
      infrastructure: 0,
      administrative: 0,
      other: 0,
      total: 0,
    },
    financialResult: {
      financialIncome: 0,
      financialExpenses: 0,
      total: 0,
    },
    otherResult: {
      otherIncome: 0,
      otherExpenses: 0,
      total: 0,
    },
    netManagerialResult: 0,
    netManagerialMarginPercent: null,
    status: "BREAK_EVEN",
    dataQuality: {
      isProvisional: false,
      financiallyClosed: true,
      pendingAccruals: [],
      dreClassificationCoveragePercent: 100,
      unknownAmount: 0,
    },
  };
}

function toMonthlyChartBucket(
  item: DreMonthlyItemDto,
  isSelected: boolean,
  isContext: boolean,
): DreChartBucket {
  const label = formatMonthLabel(item.month);
  return {
    key: item.month,
    label,
    formattedMonth: label,
    granularity: "monthly",
    isSelected,
    isContext,
    months: [item.month],
    realizedRevenue: item.realizedRevenue,
    estimatedCOGS: item.estimatedCOGS,
    estimatedGrossProfit: item.estimatedGrossProfit,
    estimatedGrossMarginPercent: item.estimatedGrossMarginPercent,
    variableExpensesTotal: item.variableExpenses.total,
    contributionMargin: item.contributionMargin,
    contributionMarginPercent: item.contributionMarginPercent,
    operatingExpensesTotal: item.operatingExpenses.total,
    financialResultTotal: item.financialResult.total,
    otherResultTotal: item.otherResult.total,
    netManagerialResult: item.netManagerialResult,
    netManagerialMarginPercent: item.netManagerialMarginPercent,
    status: item.status,
    dataQuality: {
      isProvisional: item.dataQuality.isProvisional,
      financiallyClosed: item.dataQuality.financiallyClosed,
      pendingAccruals: [...item.dataQuality.pendingAccruals],
    },
  };
}

/**
 * Aggregate a group of monthly items into a single bucket (quarter or year).
 * Additive metrics are summed in integer cents; percentage margins are recalculated
 * over the aggregated realizedRevenue:
 *   marginPercent = realizedRevenue > 0 ? round2((margin / realizedRevenue) * 100) : null
 * Simple average of monthly percentages is NEVER used.
 */
function aggregateMonthlyGroup(
  key: string,
  label: string,
  granularity: "quarterly" | "yearly",
  items: DreMonthlyItemDto[],
): DreChartBucket {
  let revCents = 0;
  let cogsCents = 0;
  let grossCents = 0;
  let varTotalCents = 0;
  let cmCents = 0;
  let opTotalCents = 0;
  let finTotalCents = 0;
  let otherTotalCents = 0;
  let netCents = 0;

  const pendingSet = new Set<string>();
  let anyProvisional = false;
  let allClosed = items.length > 0;

  for (const item of items) {
    revCents += toCents(item.realizedRevenue);
    cogsCents += toCents(item.estimatedCOGS);
    grossCents += toCents(item.estimatedGrossProfit);
    varTotalCents += toCents(item.variableExpenses.total);
    cmCents += toCents(item.contributionMargin);
    opTotalCents += toCents(item.operatingExpenses.total);
    finTotalCents += toCents(item.financialResult.total);
    otherTotalCents += toCents(item.otherResult.total);
    netCents += toCents(item.netManagerialResult);

    if (item.dataQuality.isProvisional) {
      anyProvisional = true;
    }
    if (!item.dataQuality.financiallyClosed) {
      allClosed = false;
    }
    for (const code of item.dataQuality.pendingAccruals) {
      pendingSet.add(code);
    }
  }

  const realizedRevenue = fromCents(revCents);
  const estimatedCOGS = fromCents(cogsCents);
  const estimatedGrossProfit = fromCents(grossCents);
  const variableExpensesTotal = fromCents(varTotalCents);
  const contributionMargin = fromCents(cmCents);
  const operatingExpensesTotal = fromCents(opTotalCents);
  const financialResultTotal = fromCents(finTotalCents);
  const otherResultTotal = fromCents(otherTotalCents);
  const netManagerialResult = fromCents(netCents);

  const estimatedGrossMarginPercent =
    revCents > 0 ? r2((estimatedGrossProfit / realizedRevenue) * 100) : null;
  const contributionMarginPercent =
    revCents > 0 ? r2((contributionMargin / realizedRevenue) * 100) : null;
  const netManagerialMarginPercent =
    revCents > 0 ? r2((netManagerialResult / realizedRevenue) * 100) : null;

  const status: DreEconomicStatus =
    netCents > 0 ? "PROFIT" : netCents < 0 ? "LOSS" : "BREAK_EVEN";

  return {
    key,
    label,
    formattedMonth: label,
    granularity,
    isSelected: true,
    isContext: false,
    months: items.map((i) => i.month),
    realizedRevenue,
    estimatedCOGS,
    estimatedGrossProfit,
    estimatedGrossMarginPercent,
    variableExpensesTotal,
    contributionMargin,
    contributionMarginPercent,
    operatingExpensesTotal,
    financialResultTotal,
    otherResultTotal,
    netManagerialResult,
    netManagerialMarginPercent,
    status,
    dataQuality: {
      isProvisional: anyProvisional,
      financiallyClosed: allClosed,
      pendingAccruals: Array.from(pendingSet),
    },
  };
}

/**
 * Aggregate monthly items by quarter ("T1/24", "T2/24", ...).
 */
export function aggregateByQuarter(items: DreMonthlyItemDto[]): DreChartBucket[] {
  const sorted = [...items].sort((a, b) => a.month.localeCompare(b.month));
  const groups = new Map<string, { label: string; items: DreMonthlyItemDto[] }>();

  for (const item of sorted) {
    const { year, month } = parseYearMonth(item.month);
    const quarter = Math.ceil(month / 3);
    const yearShort = String(year).slice(-2);
    const key = `${year}-Q${quarter}`;
    const label = `T${quarter}/${yearShort}`;

    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(key, { label, items: [item] });
    }
  }

  return Array.from(groups.entries()).map(([key, group]) =>
    aggregateMonthlyGroup(key, group.label, "quarterly", group.items),
  );
}

/**
 * Aggregate monthly items by year ("2022", "2023", ...).
 */
export function aggregateByYear(items: DreMonthlyItemDto[]): DreChartBucket[] {
  const sorted = [...items].sort((a, b) => a.month.localeCompare(b.month));
  const groups = new Map<string, DreMonthlyItemDto[]>();

  for (const item of sorted) {
    const year = item.month.slice(0, 4);
    const existing = groups.get(year);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(year, [item]);
    }
  }

  return Array.from(groups.entries()).map(([year, groupItems]) =>
    aggregateMonthlyGroup(year, year, "yearly", groupItems),
  );
}

/**
 * Filter monthly items for the table: strictly monthly, strictly matching the selected period
 * (no 6-month context, no quarterly/yearly aggregation, no future zeroed months).
 */
export function filterTableMonths(
  monthlyData: DreMonthlyItemDto[],
  selectedMonths: string[],
): DreMonthlyItemDto[] {
  if (monthlyData.length === 0 || selectedMonths.length === 0) {
    return [];
  }
  const byMonth = new Map<string, DreMonthlyItemDto>();
  for (const item of monthlyData) {
    byMonth.set(item.month, item);
  }

  const rows: DreMonthlyItemDto[] = [];
  for (const ym of selectedMonths) {
    const found = byMonth.get(ym);
    if (found) {
      rows.push(found);
    }
  }
  return rows;
}

/**
 * Master deterministic builder for the DRE Evolution card (chart + table).
 */
export function buildAdaptiveDreEvolution(
  monthlyData: DreMonthlyItemDto[],
  period?: DreEvolutionPeriod,
  referenceDate: Date = new Date(),
): AdaptiveDreEvolutionResult {
  const effectivePeriod: DreEvolutionPeriod | null =
    period && period.from && period.to
      ? period
      : monthlyData.length > 0
      ? {
          from: `${monthlyData[0]!.month}-01`,
          to: `${monthlyData[monthlyData.length - 1]!.month}-28`,
        }
      : null;

  if (!effectivePeriod) {
    return {
      granularity: "monthly",
      selectedMonths: [],
      chartContextMonths: [],
      hasContextWindow: false,
      contextNotice: null,
      chartBuckets: [],
      tableRows: [],
      hasProvisionalInVisibleChart: false,
    };
  }

  const cleanedData = removeFutureMonths(monthlyData, effectivePeriod.to, referenceDate);
  const selectedMonths = getSelectedMonths(effectivePeriod, cleanedData, referenceDate);
  const chartContextMonths = getChartContextMonths(selectedMonths);
  const granularity = getChartGranularity(selectedMonths.length);
  const hasContextWindow = selectedMonths.length === 1 || selectedMonths.length === 2;
  const contextNotice = getContextNoticeText(selectedMonths);

  const byMonth = new Map<string, DreMonthlyItemDto>();
  for (const item of cleanedData) {
    byMonth.set(item.month, item);
  }

  const selectedSet = new Set(selectedMonths);
  const tableRows = filterTableMonths(cleanedData, selectedMonths);

  let chartBuckets: DreChartBucket[] = [];

  if (cleanedData.length > 0) {
    if (granularity === "monthly") {
      chartBuckets = chartContextMonths.map((ym) => {
        const item = byMonth.get(ym) ?? createZeroMonthlyItem(ym);
        const isSelected = selectedSet.has(ym);
        const isContext = hasContextWindow && !isSelected;
        return toMonthlyChartBucket(item, isSelected, isContext);
      });
    } else if (granularity === "quarterly") {
      chartBuckets = aggregateByQuarter(tableRows);
    } else {
      chartBuckets = aggregateByYear(tableRows);
    }
  }

  const hasProvisionalInVisibleChart = chartBuckets.some(
    (b) => b.dataQuality.isProvisional,
  );

  return {
    granularity,
    selectedMonths,
    chartContextMonths,
    hasContextWindow,
    contextNotice,
    chartBuckets,
    tableRows,
    hasProvisionalInVisibleChart,
  };
}

