import type { FinancialRecordType } from "@prisma/client";

export type DueDateStatus = "OVERDUE" | "DUE_TODAY" | "FUTURE";

export type FinancialRecordOperationalStatus =
  | DueDateStatus
  | "CONFIRMED";

export type FinancialListStatusFilter =
  | "OPEN"
  | "OVERDUE"
  | "DUE_TODAY"
  | "FUTURE"
  | "CONFIRMED"
  | "ALL";

export interface AgingBucket {
  count: number;
  total: number;
}

export interface AgingSummary {
  d1_30: AgingBucket;
  d31_60: AgingBucket;
  d61_90: AgingBucket;
  d90_plus: AgingBucket;
}

export interface OperationalSummaryResponse {
  referenceDate: string; // YYYY-MM-DD
  openCount: number;
  openTotal: number;
  overdueCount: number;
  overdueTotal: number;
  dueTodayCount: number;
  dueTodayTotal: number;
  futureCount: number;
  futureTotal: number;
  aging: AgingSummary;
}

export interface ReceivablesOverviewResponse extends OperationalSummaryResponse {
  type: "ENTRADA";
}

export interface PayablesOverviewResponse extends OperationalSummaryResponse {
  type: "SAIDA";
}

export interface FinancialInstallmentInfo {
  number: number | null;
  count: number | null;
}

export interface ReceivablesListItem {
  sourceId: string;
  description: string | null;
  documentNumber: string | null;
  entitySourceId: string | null;
  entityName: string | null;
  dueDate: string;
  confirmationDate: string | null;
  totalAmount: number;
  effectiveCashAmount: number | null;
  status: FinancialRecordOperationalStatus;
  installmentNumber: number | null;
  installmentCount: number | null;
  paymentMethodSourceId: string | null;
  budgetPlanSourceId: string | null;
}

export interface PayablesListItem {
  sourceId: string;
  description: string | null;
  documentNumber: string | null;
  entitySourceId: string | null;
  entityName: string | null;
  dueDate: string;
  confirmationDate: string | null;
  totalAmount: number;
  effectiveCashAmount: number | null;
  status: FinancialRecordOperationalStatus;
  budgetPlanSourceId: string | null;
  budgetPlanDescription: string | null;
  paymentMethodSourceId: string | null;
  departmentSourceId: string | null;
  installmentNumber: number | null;
  installmentCount: number | null;
  installments: FinancialInstallmentInfo;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface FinancialBudgetPlanItem {
  sourceId: string;
  description: string;
}

export interface FinancialOverviewQueryParams {
  referenceDate?: string;
  dueFrom?: string;
  dueTo?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  budgetPlanSourceId?: string;
}

export interface FinancialListQueryParams {
  status?: FinancialListStatusFilter;
  search?: string;
  referenceDate?: string;
  dueFrom?: string;
  dueTo?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  budgetPlanSourceId?: string;
  confirmationDateFrom?: string;
  confirmationDateTo?: string;
  page?: number | string;
  pageSize?: number | string;
  sort?:
    | "dueDate_asc"
    | "dueDate_desc"
    | "totalAmount_asc"
    | "totalAmount_desc"
    | "confirmationDate_asc"
    | "confirmationDate_desc";
}

export interface CashFlowTimeseriesPoint {
  period: string; // "YYYY-MM" or "YYYY-MM-DD"
  inflows: number;
  outflows: number;
  netCashFlow: number;
  inflowCount: number;
  outflowCount: number;
  totalCount: number;
}

export interface UndatedConfirmedCashSummary {
  undatedConfirmedCount: number;
  undatedConfirmedInflows: number;
  undatedConfirmedOutflows: number;
  undatedConfirmedNet: number;
}

export type FinancialRecordCashClassification =
  | "CASH"
  | "NON_CASH_STOCK_ADJUSTMENT_OUTFLOW";

export interface ExcludedNonCashStockAdjustmentsSummary {
  count: number;
  amount: number;
}

export interface BankReconciliationSummary {
  matchedEventCount: number;
  reconciledAmount: number;
  nominalTitleAmount: number;
  deltaAmount: number;
  ambiguousCount: number;
  unmatchedCount: number;
}

export interface CashFlowOverviewResponse {
  from: string | null;
  to: string | null;
  granularity: "day" | "month";
  totals: {
    inflows: number;
    outflows: number;
    netCashFlow: number;
    inflowCount: number;
    outflowCount: number;
    totalCount: number;
  };
  series: CashFlowTimeseriesPoint[];
  undated: UndatedConfirmedCashSummary;
  excludedNonCashStockAdjustments: ExcludedNonCashStockAdjustmentsSummary;
  bankReconciliation?: BankReconciliationSummary;
}

export interface UndatedConfirmedCashRecordItem {
  sourceId: string;
  type: FinancialRecordType;
  description: string | null;
  documentNumber: string | null;
  entityName: string | null;
  dueDate: string;
  totalAmount: number;
  effectiveCashAmount: number;
  paidAmount: number | null;
}

export interface UndatedConfirmedCashResponse {
  summary: UndatedConfirmedCashSummary;
  records: UndatedConfirmedCashRecordItem[];
}
