import { Prisma, type FinancialRecordType } from "@prisma/client";
import type {
  AgingSummary,
  BankReconciliationSummary,
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

export interface BancoInterClassifierRecordInput {
  type?: FinancialRecordType | string;
  paymentMethodSourceId?: string | null;
  bankAccountSourceId?: string | null;
  installmentNumber?: number | null;
  installmentCount?: number | null;
  documentNumber?: string | null;
  linkedInvoiceInstallmentSourceId?: string | null;
  description?: string | null;
  sourcePayload?: any;
}

/**
 * Pure function determining whether a record is an auxiliary Banco Inter reconciliation event.
 *
 * Conservative composite signature:
 * - type = ENTRADA (or "E")
 * - paymentMethodSourceId = "24" (Boleto Banco Inter)
 * - bankAccountSourceId = "8" (Banco Inter)
 * - installmentNumber = 0 or null
 * - installmentCount = 0 or null
 * - documentNumber is null or empty/whitespace
 * - linkedInvoiceInstallmentSourceId is null
 * - description starts with "Pagamento confirmado via Banco Inter"
 * - payload boleto present (if sourcePayload is provided, boleto array/object must not be empty)
 *
 * Normal commercial titles are NEVER classified as auxiliary events.
 */
export function isBancoInterReconciliationEvent(
  record: BancoInterClassifierRecordInput,
): boolean {
  const isEntrada = record.type === "ENTRADA" || record.type === "E";
  if (!isEntrada) return false;
  if (record.paymentMethodSourceId !== "24") return false;
  if (record.bankAccountSourceId !== "8") return false;
  if (record.installmentNumber != null && record.installmentNumber > 0) return false;
  if (record.installmentCount != null && record.installmentCount > 0) return false;
  if (record.documentNumber != null && record.documentNumber.trim() !== "") return false;
  if (record.linkedInvoiceInstallmentSourceId != null) return false;

  const desc = record.description || "";
  if (!desc.startsWith("Pagamento confirmado via Banco Inter")) return false;

  if (record.sourcePayload != null) {
    const payload = record.sourcePayload;
    if (typeof payload === "object") {
      const boleto = payload.boleto;
      if (boleto === undefined || boleto === null) return false;
      if (Array.isArray(boleto) && boleto.length === 0) return false;
    }
  }

  return true;
}

/**
 * Extracts the effective collected bank amount from a Banco Inter reconciliation event.
 *
 * Preference:
 * 1. boleto.valor_cobrado valid
 * 2. event.totalAmount valid
 * Validates consistency between both. Logs warning if they diverge.
 */
export function extractBancoInterEventAmount(event: {
  totalAmount?: Prisma.Decimal | number | string | null;
  paidAmount?: Prisma.Decimal | number | string | null;
  sourcePayload?: any;
  sourceId?: string;
}): Prisma.Decimal {
  let boletoAmount: Prisma.Decimal | null = null;
  const payload = event.sourcePayload;
  if (payload && typeof payload === "object") {
    let boletoItem: any = null;
    if (Array.isArray(payload.boleto) && payload.boleto.length > 0) {
      boletoItem = payload.boleto[0];
    } else if (payload.boleto && typeof payload.boleto === "object") {
      boletoItem = payload.boleto;
    }
    if (boletoItem && boletoItem.valor_cobrado != null && boletoItem.valor_cobrado !== "") {
      const num = Number(boletoItem.valor_cobrado);
      if (!isNaN(num) && num > 0) {
        boletoAmount = new Prisma.Decimal(boletoItem.valor_cobrado);
      }
    }
  }

  let eventAmount: Prisma.Decimal | null = null;
  if (event.totalAmount != null && event.totalAmount !== "") {
    eventAmount = new Prisma.Decimal(event.totalAmount);
  } else if (event.paidAmount != null && event.paidAmount !== "") {
    eventAmount = new Prisma.Decimal(event.paidAmount);
  }

  if (boletoAmount !== null && eventAmount !== null) {
    if (!boletoAmount.equals(eventAmount)) {
      console.warn(
        `[BancoInterReconciliation] Anomaly: boleto.valor_cobrado (${boletoAmount.toString()}) diverges from event amount (${eventAmount.toString()}) for sourceId ${event.sourceId ?? "unknown"}`,
      );
    }
    return boletoAmount;
  }

  if (boletoAmount !== null) return boletoAmount;
  if (eventAmount !== null) return eventAmount;

  throw new FinancialDataAnomalyError(
    `Banco Inter event ${event.sourceId ?? "unknown"} has no valid valor_cobrado or totalAmount`,
    { sourceId: event.sourceId },
  );
}

export type ReconciliationMatchStatus =
  | "MATCH_UNIQUE"
  | "MATCH_AMBIGUOUS"
  | "NO_MATCH";

export interface BancoInterMatchResult<T> {
  status: ReconciliationMatchStatus;
  matchedTitle?: T | undefined;
  candidatesCount: number;
}

/**
 * Pure function to match a Banco Inter auxiliary event against candidate commercial titles.
 *
 * Match only when exactly ONE candidate meets:
 * - type = ENTRADA
 * - same entitySourceId
 * - same dueDate civil (YYYY-MM-DD)
 * - same paymentMethodSourceId
 * - same bankAccountSourceId
 * - documentNumber is present and non-empty
 * - installmentNumber > 0
 * - is NOT a Banco Inter auxiliary event itself
 *
 * Never silently chooses the first candidate.
 */
export function findBancoInterMatchedTitle<
  T extends CashFlowRecordInput,
>(
  event: {
    entitySourceId?: string | null | undefined;
    dueDate: Date | string;
    paymentMethodSourceId?: string | null | undefined;
    bankAccountSourceId?: string | null | undefined;
  },
  candidates: T[],
): BancoInterMatchResult<T> {
  const eventDueCivil = toCivilDateString(event.dueDate);

  const matched = candidates.filter((candidate) => {
    const isEntrada = candidate.type === "ENTRADA" || (candidate.type as string) === "E";
    if (!isEntrada) return false;

    if (!candidate.entitySourceId || candidate.entitySourceId !== event.entitySourceId) {
      return false;
    }

    if (!candidate.dueDate || toCivilDateString(candidate.dueDate) !== eventDueCivil) {
      return false;
    }

    if (
      event.paymentMethodSourceId &&
      candidate.paymentMethodSourceId !== event.paymentMethodSourceId
    ) {
      return false;
    }

    if (
      event.bankAccountSourceId &&
      candidate.bankAccountSourceId !== event.bankAccountSourceId
    ) {
      return false;
    }

    if (!candidate.documentNumber || candidate.documentNumber.trim() === "") {
      return false;
    }

    if (candidate.installmentNumber == null || candidate.installmentNumber <= 0) {
      return false;
    }

    if (isBancoInterReconciliationEvent(candidate)) {
      return false;
    }

    return true;
  });

  const first = matched[0];
  if (matched.length === 1 && first !== undefined) {
    return {
      status: "MATCH_UNIQUE",
      matchedTitle: first,
      candidatesCount: 1,
    };
  }

  if (matched.length > 1) {
    return {
      status: "MATCH_AMBIGUOUS",
      candidatesCount: matched.length,
    };
  }

  return {
    status: "NO_MATCH",
    candidatesCount: 0,
  };
}

export interface ReconciledTitleMatch {
  titleSourceId: string;
  eventSourceId: string;
  bankAmount: Prisma.Decimal;
  titleCanonicalAmount: Prisma.Decimal;
  bankDelta: Prisma.Decimal;
}

export interface BancoInterReconciliationExecutionResult {
  reconciledTitleMap: Map<string, ReconciledTitleMatch>;
  matchedEventCount: number;
  reconciledAmount: Prisma.Decimal;
  nominalTitleAmount: Prisma.Decimal;
  deltaAmount: Prisma.Decimal;
  ambiguousCount: number;
  unmatchedCount: number;
}

/**
 * Reconciles Banco Inter auxiliary events against candidate commercial titles in memory.
 * Uses a composite key index for O(N) performance instead of O(N^2).
 */
export function reconcileBancoInterEvents<
  T extends CashFlowRecordInput,
>(records: T[]): BancoInterReconciliationExecutionResult {
  const bankEvents: T[] = [];
  // Composite key map: entitySourceId|dueCivil|paymentMethod|bankAccount -> T[]
  const candidateIndex = new Map<string, T[]>();

  for (const record of records) {
    if (isBancoInterReconciliationEvent(record)) {
      bankEvents.push(record);
    } else {
      const isEntrada = record.type === "ENTRADA" || (record.type as string) === "E";
      if (
        isEntrada &&
        record.documentNumber &&
        record.documentNumber.trim() !== "" &&
        record.installmentNumber != null &&
        record.installmentNumber > 0 &&
        record.dueDate != null
      ) {
        const dueCivil = toCivilDateString(record.dueDate);
        const key = `${record.entitySourceId ?? ""}|${dueCivil}|${record.paymentMethodSourceId ?? ""}|${record.bankAccountSourceId ?? ""}`;
        let list = candidateIndex.get(key);
        if (!list) {
          list = [];
          candidateIndex.set(key, list);
        }
        list.push(record);
      }
    }
  }

  const reconciledTitleMap = new Map<string, ReconciledTitleMatch>();
  let matchedEventCount = 0;
  let reconciledAmount = new Prisma.Decimal(0);
  let nominalTitleAmount = new Prisma.Decimal(0);
  let deltaAmount = new Prisma.Decimal(0);
  let ambiguousCount = 0;
  let unmatchedCount = 0;

  for (const event of bankEvents) {
    if (event.dueDate == null) {
      unmatchedCount++;
      continue;
    }
    const dueCivil = toCivilDateString(event.dueDate);
    const key = `${event.entitySourceId ?? ""}|${dueCivil}|${event.paymentMethodSourceId ?? ""}|${event.bankAccountSourceId ?? ""}`;
    const candidates = candidateIndex.get(key) ?? [];

    const matchResult = findBancoInterMatchedTitle(
      {
        entitySourceId: event.entitySourceId,
        dueDate: event.dueDate,
        paymentMethodSourceId: event.paymentMethodSourceId,
        bankAccountSourceId: event.bankAccountSourceId,
      },
      candidates,
    );

    if (matchResult.status === "MATCH_UNIQUE" && matchResult.matchedTitle) {
      const matched = matchResult.matchedTitle;
      const titleSourceId = matched.sourceId;

      if (!titleSourceId) {
        unmatchedCount++;
        continue;
      }

      // Detect collision: if title already matched by another event, treat as ambiguous
      if (reconciledTitleMap.has(titleSourceId)) {
        console.warn(
          `[BancoInterReconciliation] Conflict: title ${titleSourceId} already matched; marking ambiguous`,
        );
        ambiguousCount++;
        continue;
      }

      const bankAmount = extractBancoInterEventAmount(event);
      const titleCanonicalAmount = calculateEffectiveCashAmount(matched);
      const bankDelta = bankAmount.minus(titleCanonicalAmount);

      reconciledTitleMap.set(titleSourceId, {
        titleSourceId,
        eventSourceId: event.sourceId ?? "unknown",
        bankAmount,
        titleCanonicalAmount,
        bankDelta,
      });

      matchedEventCount++;
      reconciledAmount = reconciledAmount.plus(bankAmount);
      nominalTitleAmount = nominalTitleAmount.plus(titleCanonicalAmount);
      deltaAmount = deltaAmount.plus(bankDelta);
    } else if (matchResult.status === "MATCH_AMBIGUOUS") {
      ambiguousCount++;
      console.warn(
        `[BancoInterReconciliation] Ambiguous match for event ${event.sourceId ?? "unknown"} (${matchResult.candidatesCount} candidates)`,
      );
    } else {
      unmatchedCount++;
      console.warn(
        `[BancoInterReconciliation] No match found for event ${event.sourceId ?? "unknown"}`,
      );
    }
  }

  return {
    reconciledTitleMap,
    matchedEventCount,
    reconciledAmount,
    nominalTitleAmount,
    deltaAmount,
    ambiguousCount,
    unmatchedCount,
  };
}

export interface CashEligibilityInput extends BancoInterClassifierRecordInput {
  isConfirmed: boolean;
  isTransfer?: boolean;
  sourcePresent?: boolean;
  hasStockAdjustmentOutflowLink?: boolean;
}

/**
 * Derives the canonical cash classification of a FinancialRecord.
 *
 * Rules:
 * - A record with FinancialRecord.type = "SAIDA" (or "S") AND a deterministic link
 *   to a StockAdjustment of type 'S' (saída de estoque) is classified as
 *   NON_CASH_STOCK_ADJUSTMENT_OUTFLOW.
 *   These records were created historically in the ERP to value inventory withdrawals
 *   and do not represent real monetary disbursements.
 * - All other operational records (including ENTRADA records, even if linked to a StockAdjustment)
 *   are classified as CASH.
 */
export function classifyFinancialRecordCash(
  record: { type?: FinancialRecordType | string; hasStockAdjustmentOutflowLink?: boolean },
): FinancialRecordCashClassification {
  const isSaida = record.type === "SAIDA" || record.type === "S";
  if (isSaida && record.hasStockAdjustmentOutflowLink === true) {
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
 * 4. Must NOT be an auxiliary Banco Inter reconciliation event (structural protection)
 * 5. Must NOT be classified as NON_CASH_STOCK_ADJUSTMENT_OUTFLOW
 */
export function isEligibleForCashFlow(
  record: CashEligibilityInput,
): boolean {
  if (record.sourcePresent === false) return false;
  if (record.isTransfer === true) return false;
  if (!record.isConfirmed) return false;
  if (isBancoInterReconciliationEvent(record)) return false;
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

export interface OperationalSummaryInputRecord extends BancoInterClassifierRecordInput {
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
    if (isBancoInterReconciliationEvent(record)) {
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

export interface CashFlowRecordInput extends BancoInterClassifierRecordInput {
  sourceId?: string;
  type: FinancialRecordType;
  confirmationDate: Date | string | null;
  paidAmount?: Prisma.Decimal | number | string | null;
  totalAmount?: Prisma.Decimal | number | string | null;
  isConfirmed: boolean;
  isTransfer?: boolean;
  sourcePresent?: boolean;
  hasStockAdjustmentOutflowLink?: boolean;
  dueDate?: Date | string;
  entitySourceId?: string | null;
}

export interface AggregateCashFlowOptions {
  granularity?: "day" | "month";
  from?: string | null;
  to?: string | null;
}

/**
 * Aggregates realized cash flow timeseries and totals for dated confirmed records.
 * UNDATED records are explicitly excluded from the timeseries.
 * Auxiliary Banco Inter events are reconciled with commercial titles and NEVER enter the timeseries directly.
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
  bankReconciliation: BankReconciliationSummary;
} {
  const granularity = options.granularity ?? "month";
  const fromStr = options.from?.trim() || null;
  const toStr = options.to?.trim() || null;

  // Reconcile Banco Inter events across the records universe
  const reconciliation = reconcileBancoInterEvents(records);
  const { reconciledTitleMap } = reconciliation;

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
    // Structural protection: auxiliary Banco Inter events NEVER directly enter timeseries
    if (isBancoInterReconciliationEvent(record)) continue;
    if (!isEligibleForCashFlow(record)) continue;
    if (record.confirmationDate == null) continue; // Undated excluded from timeseries

    const dateStr = toCivilDateString(record.confirmationDate);
    if (fromStr && dateStr < fromStr) continue;
    if (toStr && dateStr > toStr) continue;

    const periodKey =
      granularity === "month" ? dateStr.slice(0, 7) : dateStr;

    // Use bank reconciled amount if commercial title was matched
    let effectiveAmount: Prisma.Decimal;
    if (record.sourceId && reconciledTitleMap.has(record.sourceId)) {
      effectiveAmount = reconciledTitleMap.get(record.sourceId)!.bankAmount;
    } else {
      effectiveAmount = calculateEffectiveCashAmount(record);
    }

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
    bankReconciliation: {
      matchedEventCount: reconciliation.matchedEventCount,
      reconciledAmount: Number(reconciliation.reconciledAmount.toFixed(2)),
      nominalTitleAmount: Number(reconciliation.nominalTitleAmount.toFixed(2)),
      deltaAmount: Number(reconciliation.deltaAmount.toFixed(2)),
      ambiguousCount: reconciliation.ambiguousCount,
      unmatchedCount: reconciliation.unmatchedCount,
    },
  };
}

/**
 * Aggregates undated confirmed cash summary (isConfirmed=true, confirmationDate=null).
 * Auxiliary Banco Inter events are excluded from undated confirmed cash.
 */
export function aggregateUndatedConfirmedCash(
  records: CashFlowRecordInput[],
): UndatedConfirmedCashSummary {
  let count = 0;
  let inflows = new Prisma.Decimal(0);
  let outflows = new Prisma.Decimal(0);

  for (const record of records) {
    if (isBancoInterReconciliationEvent(record)) continue;
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
