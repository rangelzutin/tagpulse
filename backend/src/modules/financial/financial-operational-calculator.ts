import { Prisma, type FinancialRecordType } from "@prisma/client";
import type {
  AgingSummary,
  CashFlowTimeseriesPoint,
  DueDateStatus,
  FinancialRecordCashClassification,
  FinancialRecordOperationalStatus,
  OperationalSummaryResponse,
  UndatedConfirmedCashSummary,
} from "./financial-operational-types.js";

export class FinancialDataAnomalyError extends Error {
  constructor(
    message: string,
    public readonly recordDetails?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "FinancialDataAnomalyError";
  }
}

export interface CashEligibilityInput {
  type?: FinancialRecordType;
  isConfirmed: boolean;
  isTransfer?: boolean;
  sourcePresent?: boolean;
  hasStockAdjustmentOutflowLink?: boolean;
}

/**
 * Derives the canonical cash classification of a FinancialRecord.
 *
 * Rules:
 * - A record with a deterministic link to a StockAdjustment of type 'S' (saída de estoque)
 *   is classified as NON_CASH_STOCK_ADJUSTMENT_OUTFLOW.
 *   These records were created historically in the ERP to value inventory withdrawals
 *   and do not represent real monetary disbursements.
 * - All other operational records are classified as CASH.
 */
export function classifyFinancialRecordCash(
  record: { hasStockAdjustmentOutflowLink?: boolean },
): FinancialRecordCashClassification {
  if (record.hasStockAdjustmentOutflowLink === true) {
    return "NON_CASH_STOCK_ADJUSTMENT_OUTFLOW";
  }
  return "CASH";
}

/**
 * Pure function determining whether a FinancialRecord is eligible for Cash Flow.
 *
 * Rules:
 * 1. Must have sourcePresent !== false
 * 2. Must not be a transfer (isTransfer !== true)
 * 3. Must be confirmed (isConfirmed === true)
 * 4. Must NOT be classified as NON_CASH_STOCK_ADJUSTMENT_OUTFLOW
 */
export function isEligibleForCashFlow(
  record: CashEligibilityInput,
): boolean {
  if (record.sourcePresent === false) return false;
  if (record.isTransfer === true) return false;
  if (!record.isConfirmed) return false;
  if (classifyFinancialRecordCash(record) === "NON_CASH_STOCK_ADJUSTMENT_OUTFLOW") {
    return false;
  }
  return true;
}

export interface EffectiveCashInput {
  isConfirmed: boolean;
  paidAmount?: Prisma.Decimal | number | string | null;
  totalAmount?: Prisma.Decimal | number | string | null;
  sourceId?: string;
}

/**
 * Pure canonical function to compute effectiveCashAmount for a FinancialRecord.
 *
 * Rules:
 * 1. If !record.isConfirmed -> 0
 * 2. If record.paidAmount != null and record.paidAmount > 0 -> record.paidAmount
 * 3. Fallback to record.totalAmount
 * 4. If confirmed and paidAmount <= 0 and totalAmount == null -> throw FinancialDataAnomalyError.
 */
export function calculateEffectiveCashAmount(
  record: EffectiveCashInput,
): Prisma.Decimal {
  if (!record.isConfirmed) {
    return new Prisma.Decimal(0);
  }

  const paidDec =
    record.paidAmount != null && record.paidAmount !== ""
      ? new Prisma.Decimal(record.paidAmount)
      : null;

  if (paidDec !== null && paidDec.greaterThan(0)) {
    return paidDec;
  }

  const totalDec =
    record.totalAmount != null && record.totalAmount !== ""
      ? new Prisma.Decimal(record.totalAmount)
      : null;

  if (totalDec !== null) {
    return totalDec;
  }

  throw new FinancialDataAnomalyError(
    `FinancialRecord confirmed without valid cash amount (sourceId: ${record.sourceId ?? "unknown"}, paidAmount: ${record.paidAmount}, totalAmount: ${record.totalAmount})`,
    {
      sourceId: record.sourceId,
      isConfirmed: record.isConfirmed,
      paidAmount: record.paidAmount,
      totalAmount: record.totalAmount,
    },
  );
}

/**
 * Extracts a civil date string (YYYY-MM-DD) from a Date or ISO string without timezone drift.
 */
export function toCivilDateString(date: Date | string): string {
  if (date instanceof Date) {
    return date.toISOString().slice(0, 10);
  }
  return date.slice(0, 10);
}

/**
 * Derives operational status (OVERDUE, DUE_TODAY, FUTURE) comparing dueDate to referenceDate.
 *
 * referenceDate must be YYYY-MM-DD.
 */
export function deriveDueDateStatus(
  dueDate: Date | string,
  referenceDate: string,
): DueDateStatus {
  const dueStr = toCivilDateString(dueDate);
  if (dueStr < referenceDate) {
    return "OVERDUE";
  }
  if (dueStr === referenceDate) {
    return "DUE_TODAY";
  }
  return "FUTURE";
}

/**
 * Derives full operational status for any record (including CONFIRMED).
 */
export function deriveOperationalStatus(
  record: { isConfirmed: boolean; dueDate: Date | string },
  referenceDate: string,
): FinancialRecordOperationalStatus {
  if (record.isConfirmed) {
    return "CONFIRMED";
  }
  return deriveDueDateStatus(record.dueDate, referenceDate);
}

/**
 * Calculates aging bucket for overdue titles:
 * - 1-30 days
 * - 31-60 days
 * - 61-90 days
 * - >90 days
 */
export function calculateAgingBucket(
  dueDate: Date | string,
  referenceDate: string,
): "d1_30" | "d31_60" | "d61_90" | "d90_plus" {
  const dueStr = toCivilDateString(dueDate);
  const dueMs = Date.parse(`${dueStr}T00:00:00.000Z`);
  const refMs = Date.parse(`${referenceDate}T00:00:00.000Z`);
  const diffDays = Math.floor((refMs - dueMs) / (1000 * 60 * 60 * 24));

  if (diffDays <= 30) {
    return "d1_30";
  }
  if (diffDays <= 60) {
    return "d31_60";
  }
  if (diffDays <= 90) {
    return "d61_90";
  }
  return "d90_plus";
}

export interface OperationalSummaryInputRecord {
  dueDate: Date | string;
  totalAmount: Prisma.Decimal | number | string | null;
  isConfirmed: boolean;
}

/**
 * Aggregates receivables or payables open summary and aging.
 */
export function aggregateOperationalSummary(
  records: OperationalSummaryInputRecord[],
  referenceDate: string,
): OperationalSummaryResponse {
  let openCount = 0;
  let openTotal = new Prisma.Decimal(0);

  let overdueCount = 0;
  let overdueTotal = new Prisma.Decimal(0);

  let dueTodayCount = 0;
  let dueTodayTotal = new Prisma.Decimal(0);

  let futureCount = 0;
  let futureTotal = new Prisma.Decimal(0);

  const agingDecimals = {
    d1_30: { count: 0, total: new Prisma.Decimal(0) },
    d31_60: { count: 0, total: new Prisma.Decimal(0) },
    d61_90: { count: 0, total: new Prisma.Decimal(0) },
    d90_plus: { count: 0, total: new Prisma.Decimal(0) },
  };

  for (const record of records) {
    if (record.isConfirmed) {
      continue;
    }

    const amount =
      record.totalAmount != null && record.totalAmount !== ""
        ? new Prisma.Decimal(record.totalAmount)
        : new Prisma.Decimal(0);

    openCount++;
    openTotal = openTotal.plus(amount);

    const status = deriveDueDateStatus(record.dueDate, referenceDate);
    if (status === "OVERDUE") {
      overdueCount++;
      overdueTotal = overdueTotal.plus(amount);

      const bucket = calculateAgingBucket(record.dueDate, referenceDate);
      agingDecimals[bucket].count++;
      agingDecimals[bucket].total = agingDecimals[bucket].total.plus(amount);
    } else if (status === "DUE_TODAY") {
      dueTodayCount++;
      dueTodayTotal = dueTodayTotal.plus(amount);
    } else {
      futureCount++;
      futureTotal = futureTotal.plus(amount);
    }
  }

  const aging: AgingSummary = {
    d1_30: {
      count: agingDecimals.d1_30.count,
      total: Number(agingDecimals.d1_30.total.toFixed(2)),
    },
    d31_60: {
      count: agingDecimals.d31_60.count,
      total: Number(agingDecimals.d31_60.total.toFixed(2)),
    },
    d61_90: {
      count: agingDecimals.d61_90.count,
      total: Number(agingDecimals.d61_90.total.toFixed(2)),
    },
    d90_plus: {
      count: agingDecimals.d90_plus.count,
      total: Number(agingDecimals.d90_plus.total.toFixed(2)),
    },
  };

  return {
    referenceDate,
    openCount,
    openTotal: Number(openTotal.toFixed(2)),
    overdueCount,
    overdueTotal: Number(overdueTotal.toFixed(2)),
    dueTodayCount,
    dueTodayTotal: Number(dueTodayTotal.toFixed(2)),
    futureCount,
    futureTotal: Number(futureTotal.toFixed(2)),
    aging,
  };
}

export interface CashFlowRecordInput {
  type: FinancialRecordType;
  confirmationDate: Date | string | null;
  paidAmount?: Prisma.Decimal | number | string | null;
  totalAmount?: Prisma.Decimal | number | string | null;
  isConfirmed: boolean;
  isTransfer?: boolean;
  sourcePresent?: boolean;
  sourceId?: string;
  hasStockAdjustmentOutflowLink?: boolean;
}

export interface AggregateCashFlowOptions {
  granularity?: "day" | "month";
  from?: string | null;
  to?: string | null;
}

/**
 * Aggregates realized cash flow timeseries and totals for dated confirmed records.
 * UNDATED records are explicitly excluded from the timeseries.
 */
export function aggregateCashFlowSeries(
  records: CashFlowRecordInput[],
  options: AggregateCashFlowOptions = {},
): {
  totals: {
    inflows: number;
    outflows: number;
    netCashFlow: number;
    inflowCount: number;
    outflowCount: number;
    totalCount: number;
  };
  series: CashFlowTimeseriesPoint[];
} {
  const granularity = options.granularity ?? "month";
  const fromStr = options.from?.trim() || null;
  const toStr = options.to?.trim() || null;

  interface PeriodAccumulator {
    inflows: Prisma.Decimal;
    outflows: Prisma.Decimal;
    inflowCount: number;
    outflowCount: number;
  }

  const periodMap = new Map<string, PeriodAccumulator>();

  let totalInflows = new Prisma.Decimal(0);
  let totalOutflows = new Prisma.Decimal(0);
  let totalInflowCount = 0;
  let totalOutflowCount = 0;

  for (const record of records) {
    if (!isEligibleForCashFlow(record)) continue;
    if (record.confirmationDate == null) continue; // Undated excluded from timeseries

    const dateStr = toCivilDateString(record.confirmationDate);
    if (fromStr && dateStr < fromStr) continue;
    if (toStr && dateStr > toStr) continue;

    const periodKey =
      granularity === "month" ? dateStr.slice(0, 7) : dateStr;

    const effectiveAmount = calculateEffectiveCashAmount(record);

    let periodAcc = periodMap.get(periodKey);
    if (!periodAcc) {
      periodAcc = {
        inflows: new Prisma.Decimal(0),
        outflows: new Prisma.Decimal(0),
        inflowCount: 0,
        outflowCount: 0,
      };
      periodMap.set(periodKey, periodAcc);
    }

    if (record.type === "ENTRADA") {
      periodAcc.inflows = periodAcc.inflows.plus(effectiveAmount);
      periodAcc.inflowCount++;
      totalInflows = totalInflows.plus(effectiveAmount);
      totalInflowCount++;
    } else if (record.type === "SAIDA") {
      periodAcc.outflows = periodAcc.outflows.plus(effectiveAmount);
      periodAcc.outflowCount++;
      totalOutflows = totalOutflows.plus(effectiveAmount);
      totalOutflowCount++;
    }
  }

  const sortedPeriods = Array.from(periodMap.keys()).sort();

  const series: CashFlowTimeseriesPoint[] = sortedPeriods.map((period) => {
    const acc = periodMap.get(period)!;
    const net = acc.inflows.minus(acc.outflows);
    return {
      period,
      inflows: Number(acc.inflows.toFixed(2)),
      outflows: Number(acc.outflows.toFixed(2)),
      netCashFlow: Number(net.toFixed(2)),
      inflowCount: acc.inflowCount,
      outflowCount: acc.outflowCount,
      totalCount: acc.inflowCount + acc.outflowCount,
    };
  });

  const overallNet = totalInflows.minus(totalOutflows);

  return {
    totals: {
      inflows: Number(totalInflows.toFixed(2)),
      outflows: Number(totalOutflows.toFixed(2)),
      netCashFlow: Number(overallNet.toFixed(2)),
      inflowCount: totalInflowCount,
      outflowCount: totalOutflowCount,
      totalCount: totalInflowCount + totalOutflowCount,
    },
    series,
  };
}

/**
 * Aggregates undated confirmed cash summary (isConfirmed=true, confirmationDate=null).
 */
export function aggregateUndatedConfirmedCash(
  records: CashFlowRecordInput[],
): UndatedConfirmedCashSummary {
  let count = 0;
  let inflows = new Prisma.Decimal(0);
  let outflows = new Prisma.Decimal(0);

  for (const record of records) {
    if (!isEligibleForCashFlow(record)) continue;
    if (record.confirmationDate != null) continue;

    count++;
    const effectiveAmount = calculateEffectiveCashAmount(record);

    if (record.type === "ENTRADA") {
      inflows = inflows.plus(effectiveAmount);
    } else if (record.type === "SAIDA") {
      outflows = outflows.plus(effectiveAmount);
    }
  }

  const net = inflows.minus(outflows);

  return {
    undatedConfirmedCount: count,
    undatedConfirmedInflows: Number(inflows.toFixed(2)),
    undatedConfirmedOutflows: Number(outflows.toFixed(2)),
    undatedConfirmedNet: Number(net.toFixed(2)),
  };
}
