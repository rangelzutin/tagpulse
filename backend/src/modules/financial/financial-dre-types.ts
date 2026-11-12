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

export type DreCostQualityStatus =
  | "FINAL"
  | "HIGH_CONFIDENCE_ESTIMATE"
  | "PROVISIONAL_ESTIMATE"
  | "INSUFFICIENT_COST_COVERAGE";

export type DreResultStatus =
  | "FINAL"
  | "HIGH_CONFIDENCE_ESTIMATE"
  | "PROVISIONAL_ESTIMATE"
  | "UNAVAILABLE";

export type DreBreakEvenStatus =
  | "PROFITABLE"
  | "UNREACHED"
  | "UNDETERMINED_ZERO_MARGIN"
  | "UNDETERMINED_ZERO_REVENUE"
  | "UNDETERMINED_NO_REVENUE_WITH_COSTS"
  | "UNDETERMINED_PARTIAL_COST_COVERAGE"
  | "ABOVE_BREAK_EVEN"
  | "BELOW_BREAK_EVEN"
  | "UNVIABLE_MARGIN"
  | "NO_REVENUE"
  | "INCOMPLETE_COST_COVERAGE";

export interface DreBreakEvenDto {
  status: DreBreakEvenStatus;
  realizedRevenue: number;
  contributionMargin: number;
  contributionMarginRate: number | null;
  netResult: number | null;
  additionalRevenueNeeded: number | null;
  breakEvenRevenue: number | null;
  gapToBreakEven?: number | null;
  surplusRevenue?: number | null;
  additionalRevenuePercent: number | null;
  safetyMarginPercent?: number | null;
  currentCoveragePercent?: number | null;
  coverageNotice?: string | null;
  isProvisional?: boolean;
  calculationBasis?: "FULL" | "COVERED_REVENUE";
  coveredRevenue?: number;
  coveredContributionMargin?: number;
  costCoveragePercent?: number | null;
  provisionalFixedCostBase?: number | null;
  provisionalBreakEvenRevenue?: number | null;
  provisionalGap?: number | null;
  provisionalCurrentCoveragePercent?: number | null;
  costQualityStatus?: DreCostQualityStatus;
  isEstimated?: boolean;
}

export interface DreFinancialAdjustment {
  type: "FINANCIAL_EXPENSE" | "FINANCIAL_INCOME";
  amount: number;
  date: Date;
  description: string;
}

export interface DreClassificationResult {
  recordId: string;
  sourceId: string;
  category: DreEconomicCategory;
  baseAmount: number;
  financialAdjustment?: DreFinancialAdjustment | null;
  competenceDate?: Date | null;
  referenceMonth?: string | null; // "YYYY-MM"
  isDeductibleInDre: boolean;
  notes?: string;
  requiresReview?: boolean;
}

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

  coveredRevenue: number;
  uncoveredRevenue: number;
  costCoveragePercent: number | null;
  coveredGrossProfit: number;
  coveredGrossMarginPercent: number | null;
  coveredContributionMargin?: number;
  coveredVariableExpenses?: number;
  fullGrossProfitAvailable: boolean;
  fullManagerialResultAvailable: boolean;
  partialManagerialResultOnCoveredRevenue: number | null;

  knownCOGS?: number;
  estimatedUnknownCOGS?: number;
  estimatedTotalCOGS?: number;
  knownGrossProfit?: number;
  estimatedContributionMargin?: number;
  costQualityStatus?: DreCostQualityStatus;
  resultStatus?: DreResultStatus;
  isEstimated?: boolean;
  estimationMethod?: "COVERED_REVENUE_COGS_RATE" | null;

  variableExpenses: DreVariableExpensesDto;

  contributionMargin: number;
  contributionMarginPercent: number | null;

  operatingExpenses: DreOperatingExpensesDto;

  financialResult: DreFinancialResultDto;

  otherResult: DreOtherResultDto;

  netManagerialResult: number | null;
  netManagerialMarginPercent: number | null;

  status: DreEconomicStatus;
  breakEven?: DreBreakEvenDto;

  dataQuality: DreDataQualityDto;
}

export interface DreSummaryTotalsDto {
  realizedRevenue: number;
  estimatedCOGS: number;
  estimatedGrossProfit: number;
  estimatedGrossMarginPercent: number | null;

  coveredRevenue: number;
  uncoveredRevenue: number;
  costCoveragePercent: number | null;
  coveredGrossProfit: number;
  coveredGrossMarginPercent: number | null;
  coveredContributionMargin?: number;
  coveredVariableExpenses?: number;
  fullGrossProfitAvailable: boolean;
  fullManagerialResultAvailable: boolean;
  partialManagerialResultOnCoveredRevenue: number | null;

  knownCOGS?: number;
  estimatedUnknownCOGS?: number;
  estimatedTotalCOGS?: number;
  knownGrossProfit?: number;
  estimatedContributionMargin?: number;
  costQualityStatus?: DreCostQualityStatus;
  resultStatus?: DreResultStatus;
  isEstimated?: boolean;
  estimationMethod?: "COVERED_REVENUE_COGS_RATE" | null;

  variableExpenses: DreVariableExpensesDto;

  contributionMargin: number;
  contributionMarginPercent: number | null;

  operatingExpenses: DreOperatingExpensesDto;

  financialResult: DreFinancialResultDto;

  otherResult: DreOtherResultDto;

  netManagerialResult: number | null;
  netManagerialMarginPercent: number | null;

  status: DreEconomicStatus;
  breakEven?: DreBreakEvenDto;
}

export interface DreSummaryDto {
  period: {
    from: string;
    to: string;
  };
  totals: DreSummaryTotalsDto;
  months: DreMonthlyItemDto[];
  breakEven?: DreBreakEvenDto;
  lastClosedMonth: string | null;
  dataQuality: {
    isProvisional: boolean;
    financiallyClosed: boolean;
    pendingAccruals: string[];
    dreClassificationCoveragePercent: number;
    unknownAmount: number;
  };
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
  operationUnit?: string;
  sourceSystem?: string;
}

export interface DreMonthlyQueryParams {
  year?: string | number;
  operationUnit?: string;
  sourceSystem?: string;
}

export interface DreBreakdownQueryParams {
  from?: string;
  to?: string;
  operationUnit?: string;
  sourceSystem?: string;
}

export const DRE_DISCLAIMER =
  "O DRE Gerencial do TagPulse utiliza o custo atual dos produtos como estimativa de CMV e classificações gerenciais das despesas. Não substitui a contabilidade oficial.";
