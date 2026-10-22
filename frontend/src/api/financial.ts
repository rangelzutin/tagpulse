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

export interface ExcludedNonCashStockAdjustmentsSummary {
  count: number;
  amount: number;
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
}

export interface UndatedConfirmedCashRecordItem {
  sourceId: string;
  type: "ENTRADA" | "SAIDA";
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

export type FinancialSyncStatus = "IDLE" | "RUNNING" | "SUCCEEDED" | "FAILED";

export interface FinancialSyncStatusResponse {
  status: FinancialSyncStatus;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  since: string | null;
  lookbackDays: number | null;
  recentCandidates: number;
  openCandidates: number;
  undatedCandidates: number;
  uniqueCandidates: number;
  totalCandidates: number;
  overlapDeduplicated: number;
  processed: number;
  completed: number;
  failed: number;
  notFound: number;
  inserted: number;
  updated: number;
  unchanged: number;
  lastError: string | null;
}

export interface StartFinancialSyncResult {
  accepted: boolean;
  status: "RUNNING";
  startedAt: string;
  mode: "incremental";
  since: string;
  lookbackDays?: number;
}

export interface StartFinancialSyncConflictResponse {
  statusCode: 409;
  error: string;
  message: string;
  activeRun: {
    status: "RUNNING";
    startedAt: string;
    since?: string | null;
    lookbackDays?: number | null;
  };
}

function getBaseUrl(): string {
  const rawBaseUrl = import.meta.env.VITE_API_URL || "";
  return rawBaseUrl.endsWith("/") ? rawBaseUrl.slice(0, -1) : rawBaseUrl;
}

function buildFinancialUrl(
  path: string,
  params?: Record<string, string | number | undefined | null>,
): string {
  const rawBaseUrl = getBaseUrl();
  const base =
    rawBaseUrl ||
    (typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "http://localhost:3001");

  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(cleanPath, base);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

export async function fetchReceivablesOverview(
  query?: string | FinancialOverviewQueryParams,
): Promise<ReceivablesOverviewResponse> {
  const params: FinancialOverviewQueryParams =
    typeof query === "string" ? { referenceDate: query } : (query ?? {});
  const url = buildFinancialUrl("/financial/receivables/overview", {
    referenceDate: params.referenceDate,
    dueFrom: params.dueFrom ?? params.dueDateFrom,
    dueTo: params.dueTo ?? params.dueDateTo,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
  } catch (err: unknown) {
    const details = err instanceof Error ? err.message : String(err);
    console.error(`[financial API] Connection failure at ${url}:`, err);
    throw new Error(`Não foi possível conectar ao servidor para carregar o resumo de contas a receber: ${details}`);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || "Erro ao consultar o resumo de contas a receber.");
  }

  return (await response.json()) as ReceivablesOverviewResponse;
}

export async function fetchReceivablesList(
  params: FinancialListQueryParams = {},
): Promise<PaginatedResult<ReceivablesListItem>> {
  const url = buildFinancialUrl("/financial/receivables", {
    status: params.status,
    search: params.search,
    referenceDate: params.referenceDate,
    dueFrom: params.dueFrom ?? params.dueDateFrom,
    dueTo: params.dueTo ?? params.dueDateTo,
    confirmationDateFrom: params.confirmationDateFrom,
    confirmationDateTo: params.confirmationDateTo,
    page: params.page,
    pageSize: params.pageSize,
    sort: params.sort,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
  } catch (err: unknown) {
    const details = err instanceof Error ? err.message : String(err);
    console.error(`[financial API] Connection failure at ${url}:`, err);
    throw new Error(`Não foi possível conectar ao servidor para listar contas a receber: ${details}`);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || "Erro ao consultar a lista de contas a receber.");
  }

  return (await response.json()) as PaginatedResult<ReceivablesListItem>;
}

export async function fetchPayablesOverview(
  query?: string | FinancialOverviewQueryParams,
): Promise<PayablesOverviewResponse> {
  const params: FinancialOverviewQueryParams =
    typeof query === "string" ? { referenceDate: query } : (query ?? {});
  const url = buildFinancialUrl("/financial/payables/overview", {
    referenceDate: params.referenceDate,
    dueFrom: params.dueFrom ?? params.dueDateFrom,
    dueTo: params.dueTo ?? params.dueDateTo,
    budgetPlanSourceId: params.budgetPlanSourceId,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
  } catch (err: unknown) {
    const details = err instanceof Error ? err.message : String(err);
    console.error(`[financial API] Connection failure at ${url}:`, err);
    throw new Error(`Não foi possível conectar ao servidor para carregar o resumo de contas a pagar: ${details}`);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || "Erro ao consultar o resumo de contas a pagar.");
  }

  return (await response.json()) as PayablesOverviewResponse;
}

export async function fetchPayablesList(
  params: FinancialListQueryParams = {},
): Promise<PaginatedResult<PayablesListItem>> {
  const url = buildFinancialUrl("/financial/payables", {
    status: params.status,
    search: params.search,
    referenceDate: params.referenceDate,
    dueFrom: params.dueFrom ?? params.dueDateFrom,
    dueTo: params.dueTo ?? params.dueDateTo,
    budgetPlanSourceId: params.budgetPlanSourceId,
    confirmationDateFrom: params.confirmationDateFrom,
    confirmationDateTo: params.confirmationDateTo,
    page: params.page,
    pageSize: params.pageSize,
    sort: params.sort,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
  } catch (err: unknown) {
    const details = err instanceof Error ? err.message : String(err);
    console.error(`[financial API] Connection failure at ${url}:`, err);
    throw new Error(`Não foi possível conectar ao servidor para listar contas a pagar: ${details}`);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || "Erro ao consultar a lista de contas a pagar.");
  }

  return (await response.json()) as PaginatedResult<PayablesListItem>;
}

export async function fetchBudgetPlans(): Promise<FinancialBudgetPlanItem[]> {
  const url = buildFinancialUrl("/financial/budget-plans");

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
  } catch (err: unknown) {
    const details = err instanceof Error ? err.message : String(err);
    console.error(`[financial API] Connection failure at ${url}:`, err);
    throw new Error(`Não foi possível conectar ao servidor para listar planos orçamentários: ${details}`);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || "Erro ao consultar planos orçamentários.");
  }

  return (await response.json()) as FinancialBudgetPlanItem[];
}

export async function fetchCashFlowOverview(query?: {
  from?: string;
  to?: string;
  granularity?: "day" | "month";
}): Promise<CashFlowOverviewResponse> {
  const url = buildFinancialUrl("/financial/cash-flow/overview", {
    from: query?.from,
    to: query?.to,
    granularity: query?.granularity,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
  } catch (err: unknown) {
    const details = err instanceof Error ? err.message : String(err);
    console.error(`[financial API] Connection failure at ${url}:`, err);
    throw new Error(`Não foi possível conectar ao servidor para carregar o fluxo de caixa: ${details}`);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || "Erro ao consultar o fluxo de caixa.");
  }

  return (await response.json()) as CashFlowOverviewResponse;
}

export async function fetchUndatedConfirmedCash(): Promise<UndatedConfirmedCashResponse> {
  const url = buildFinancialUrl("/financial/cash-flow/undated");

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
  } catch (err: unknown) {
    const details = err instanceof Error ? err.message : String(err);
    console.error(`[financial API] Connection failure at ${url}:`, err);
    throw new Error(`Não foi possível conectar ao servidor para consultar lançamentos sem data: ${details}`);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || "Erro ao consultar lançamentos confirmados sem data.");
  }

  return (await response.json()) as UndatedConfirmedCashResponse;
}

export class FinancialSyncConflictError extends Error {
  constructor(
    message: string,
    public readonly activeRun?: StartFinancialSyncConflictResponse["activeRun"],
  ) {
    super(message);
    this.name = "FinancialSyncConflictError";
  }
}

export async function triggerFinancialIncrementalSync(params?: {
  lookbackDays?: number;
  since?: string;
}): Promise<StartFinancialSyncResult> {
  const url = buildFinancialUrl("/api/financial/sync/incremental");

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(params || {}),
    });
  } catch (err: unknown) {
    const details = err instanceof Error ? err.message : String(err);
    console.error(`[financial API] Connection failure at ${url}:`, err);
    throw new Error(`Não foi possível conectar ao servidor para iniciar a sincronização: ${details}`);
  }

  if (response.status === 409) {
    const data = (await response.json().catch(() => ({}))) as StartFinancialSyncConflictResponse;
    throw new FinancialSyncConflictError(
      "Já existe uma sincronização financeira em andamento.",
      data.activeRun,
    );
  }

  if (!response.ok && response.status !== 202) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || "Erro ao disparar sincronização financeira.");
  }

  return (await response.json()) as StartFinancialSyncResult;
}

export async function fetchFinancialSyncStatus(): Promise<FinancialSyncStatusResponse> {
  const url = buildFinancialUrl("/api/financial/sync/status");

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
  } catch (err: unknown) {
    const details = err instanceof Error ? err.message : String(err);
    console.error(`[financial API] Connection failure at ${url}:`, err);
    throw new Error(`Não foi possível conectar ao servidor para obter status de sincronização: ${details}`);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || "Erro ao obter status de sincronização financeira.");
  }

  return (await response.json()) as FinancialSyncStatusResponse;
}

// ============================================================================
// DRE Gerencial Types & Endpoints (Phase 5D)
// ============================================================================

export type DreEconomicCategory =
  | "INVENTORY_PURCHASE"
  | "VARIABLE_PAYMENT_FEE"
  | "VARIABLE_TAX_ON_REVENUE"
  | "VARIABLE_FREIGHT_LOGISTICS"
  | "VARIABLE_SALES_COMMISSION"
  | "VARIABLE_OTHER"
  | "OPERATING_PERSONNEL"
  | "OPERATING_PARTNER_COMPENSATION"
  | "OPERATING_MARKETING"
  | "OPERATING_OCCUPANCY"
  | "OPERATING_UTILITIES"
  | "OPERATING_SOFTWARE"
  | "OPERATING_ACCOUNTING"
  | "OPERATING_INFRASTRUCTURE"
  | "OPERATING_ADMINISTRATIVE"
  | "OPERATING_OTHER"
  | "FINANCIAL_EXPENSE"
  | "FINANCIAL_INCOME"
  | "OTHER_OPERATING_INCOME"
  | "OTHER_OPERATING_EXPENSE"
  | "CAPITAL_MOVEMENT"
  | "TRANSFER"
  | "UNKNOWN";

export type DreEconomicStatus = "PROFIT" | "LOSS" | "BREAK_EVEN";

export interface DreVariableExpensesDto {
  paymentFees: number;
  taxesOnRevenue: number;
  freightLogistics: number;
  salesCommissions: number;
  other: number;
  total: number;
}

export interface DreOperatingExpensesDto {
  personnel: number;
  partnerCompensation: number;
  marketing: number;
  occupancy: number;
  utilities: number;
  software: number;
  accounting: number;
  infrastructure: number;
  administrative: number;
  other: number;
  total: number;
}

export interface DreFinancialResultDto {
  financialIncome: number;
  financialExpenses: number;
  total: number;
}

export interface DreOtherResultDto {
  otherIncome: number;
  otherExpenses: number;
  total: number;
}

export interface DreDataQualityDto {
  isProvisional: boolean;
  financiallyClosed: boolean;
  pendingAccruals: string[];
  pendingReview?: string[];
  dreClassificationCoveragePercent: number;
  unknownAmount: number;
}

export interface DreMonthlyItemDto {
  month: string; // "YYYY-MM"
  realizedRevenue: number;
  estimatedCOGS: number;
  estimatedGrossProfit: number;
  estimatedGrossMarginPercent: number | null;
  variableExpenses: DreVariableExpensesDto;
  contributionMargin: number;
  contributionMarginPercent: number | null;
  operatingExpenses: DreOperatingExpensesDto;
  financialResult: DreFinancialResultDto;
  otherResult: DreOtherResultDto;
  netManagerialResult: number;
  netManagerialMarginPercent: number | null;
  status: DreEconomicStatus;
  dataQuality: DreDataQualityDto;
}

export interface DreSummaryTotalsDto {
  realizedRevenue: number;
  estimatedCOGS: number;
  estimatedGrossProfit: number;
  estimatedGrossMarginPercent: number | null;
  variableExpenses: DreVariableExpensesDto;
  contributionMargin: number;
  contributionMarginPercent: number | null;
  operatingExpenses: DreOperatingExpensesDto;
  financialResult: DreFinancialResultDto;
  otherResult: DreOtherResultDto;
  netManagerialResult: number;
  netManagerialMarginPercent: number | null;
  status: DreEconomicStatus;
}

export interface DreSummaryDto {
  period: {
    from: string;
    to: string;
  };
  totals: DreSummaryTotalsDto;
  months: DreMonthlyItemDto[];
  lastClosedMonth: string | null;
  dataQuality: DreDataQualityDto;
  disclaimer: string;
}

export interface DreBreakdownCategoryDetail {
  description: string;
  amount: number;
  recordCount: number;
}

export interface DreBreakdownItemDto {
  economicCategory: DreEconomicCategory;
  label: string;
  group:
    | "VARIABLE_EXPENSE"
    | "OPERATING_EXPENSE"
    | "FINANCIAL_RESULT"
    | "OTHER_RESULT"
    | "NON_DRE";
  amount: number;
  shareOfRevenuePercent: number | null;
  recordCount: number;
  details?: DreBreakdownCategoryDetail[];
}

export interface DreBreakdownDto {
  period: {
    from: string;
    to: string;
  };
  realizedRevenue: number;
  categories: DreBreakdownItemDto[];
  disclaimer: string;
}

export interface DreSummaryQueryParams {
  from?: string;
  to?: string;
}

export interface DreMonthlyQueryParams {
  year?: string | number;
}

export interface DreBreakdownQueryParams {
  from?: string;
  to?: string;
}

export const DRE_DISCLAIMER =
  "DRE Gerencial do TagPulse: utiliza o custo atual dos produtos como estimativa de CMV e classificações gerenciais das despesas. Não substitui a contabilidade oficial.";

export async function fetchFinancialDreSummary(
  params?: DreSummaryQueryParams,
): Promise<DreSummaryDto> {
  const url = buildFinancialUrl("/financial/dre/summary", {
    from: params?.from,
    to: params?.to,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
  } catch (err: unknown) {
    const details = err instanceof Error ? err.message : String(err);
    console.error(`[financial API] Connection failure at ${url}:`, err);
    throw new Error(`Não foi possível conectar ao servidor para obter o DRE consolidado: ${details}`);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || "Erro ao consultar o resumo do DRE Gerencial.");
  }

  return (await response.json()) as DreSummaryDto;
}

export async function fetchFinancialDreMonthly(
  params?: DreMonthlyQueryParams,
): Promise<DreMonthlyItemDto[]> {
  const url = buildFinancialUrl("/financial/dre/monthly", {
    year: params?.year,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
  } catch (err: unknown) {
    const details = err instanceof Error ? err.message : String(err);
    console.error(`[financial API] Connection failure at ${url}:`, err);
    throw new Error(`Não foi possível conectar ao servidor para obter o DRE mensal: ${details}`);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || "Erro ao consultar a série mensal do DRE Gerencial.");
  }

  return (await response.json()) as DreMonthlyItemDto[];
}

export async function fetchFinancialDreBreakdown(
  params?: DreBreakdownQueryParams,
): Promise<DreBreakdownDto> {
  const url = buildFinancialUrl("/financial/dre/breakdown", {
    from: params?.from,
    to: params?.to,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
  } catch (err: unknown) {
    const details = err instanceof Error ? err.message : String(err);
    console.error(`[financial API] Connection failure at ${url}:`, err);
    throw new Error(`Não foi possível conectar ao servidor para obter o detalhamento do DRE: ${details}`);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || "Erro ao consultar o detalhamento de categorias do DRE.");
  }

  return (await response.json()) as DreBreakdownDto;
}
