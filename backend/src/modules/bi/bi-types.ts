import type { Prisma } from "@prisma/client";

export interface SalesOverviewPeriod {
  from: string;
  to: string;
}

export interface SalesOverviewSummary {
  sales: number;
  revenue: number;
  avgTicket: number;
  customers: number;
  salesWithoutCustomer: number;
}

export interface SalesOverviewMonthly {
  month: string;
  sales: number;
  revenue: number;
  avgTicket: number;
  customers: number;
}

export type SalesTrendGranularity = "daily" | "weekly" | "monthly";

export interface SalesTrendPoint {
  key: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  revenue: number;
  sales: number;
  averageTicket: number;
  customers: number;
}

export interface SalesTrend {
  granularity: SalesTrendGranularity;
  points: SalesTrendPoint[];
}

export interface SalesOverviewResult {
  period: SalesOverviewPeriod;
  summary: SalesOverviewSummary;
  monthly: SalesOverviewMonthly[];
  trend: SalesTrend;
}

export interface BiDataRangeResult {
  firstRealizedDate: string | null;
  lastRealizedDate: string | null;
}

export interface BiSaleRecord {
  id: string;
  netAmount: Prisma.Decimal;
  customerId: string | null;
  commercialDate: Date;
}

export interface CustomerOverviewPeriod {
  from: string;
  to: string;
  asOfDate: string;
}

export interface CustomerOverviewMetrics {
  buyingCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  recurrenceRate: number;
}

export interface CustomerLifetimeMetrics {
  customers: number;
  singlePurchaseCustomers: number;
  repeatCustomers: number;
  repeatRate: number;
}

export interface CustomerRankingItem {
  customerId: string;
  code: string | null;
  displayName: string;
  revenue: number;
  purchaseCount: number;
  averageTicket: number;
  revenueSharePercent: number;
  cumulativeRevenueSharePercent: number;
}

export interface CustomerRecencySegment {
  key:
    | "0-30"
    | "31-60"
    | "61-90"
    | "91-180"
    | "181-365"
    | "366-730"
    | "731-1095"
    | "1096+";
  label: string;
  customerCount: number;
  percentage: number;
}

export interface CustomerOverviewResult {
  period: CustomerOverviewPeriod;
  customers: CustomerOverviewMetrics;
  lifetime: CustomerLifetimeMetrics;
  ranking: CustomerRankingItem[];
  recency: CustomerRecencySegment[];
}

export interface BiPeriodCustomerDoc {
  id: string;
  saleId: string;
  customerId: string;
  netAmount: Prisma.Decimal;
  realizedDate: Date;
  customer: {
    id: string;
    sourceId: string;
    code: string | null;
    legalName: string | null;
    tradeName: string | null;
  };
}

export interface BiSaleRealizationRecord {
  saleId: string;
  customerId: string;
  realizedDate: Date;
  netAmount?: Prisma.Decimal | undefined;
}

export type CustomerRecencyBucket =
  | "0-30"
  | "31-60"
  | "61-90"
  | "91-180"
  | "181-365"
  | "366-730"
  | "731-1095"
  | "1096+";

export type CustomerSegmentType =
  | "buyers"
  | "new"
  | "returning"
  | "historical"
  | "single"
  | "repeat"
  | "risk"
  | "inactive"
  | "recency";

export type CustomerSegmentSort =
  | "revenue_desc"
  | "purchases_desc"
  | "last_purchase_desc"
  | "name_asc";

export interface CustomerSegmentItem {
  customerId: string;
  code: string | null;
  legalName: string | null;
  tradeName: string | null;
  displayName: string;
  cpfCnpj: string | null;
  purchasesInPeriod: number;
  revenueInPeriod: number;
  averageTicketInPeriod: number;
  firstPurchaseDate: string | null;
  lastPurchaseDate: string | null;
  lifetimePurchaseCount: number;
  lifetimeRevenue: number;
  daysSinceLastPurchase: number | null;
}

export interface CustomerSegmentResult {
  segment: CustomerSegmentType;
  recencyBucket?: CustomerRecencyBucket | null;
  period: {
    from: string;
    to: string;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalRecords: number;
    totalPages: number;
  };
  summary: {
    segmentCustomerCount: number;
    segmentTotalRevenueInPeriod: number;
  };
  customers: CustomerSegmentItem[];
}

export interface CustomerDetailOverviewResult {
  identity: {
    customerId: string;
    sourceId: string;
    code: string | null;
    legalName: string | null;
    tradeName: string | null;
    displayName: string;
    cpfCnpj: string | null;
    city: string | null;
    state: string | null;
  };
  classification: {
    isNewInPeriod: boolean;
    isReturningInPeriod: boolean;
    hasPeriodActivity: boolean;
  };
  period: {
    from: string;
    to: string;
    revenue: number;
    purchaseCount: number;
    averageTicket: number;
    revenueSharePercent: number;
  };
  lifetime: {
    asOfDate: string;
    firstPurchaseDate: string | null;
    lastPurchaseDate: string | null;
    purchaseCount: number;
    revenue: number;
    averageTicket: number;
    daysSinceLastPurchase: number | null;
  };
}

export type CustomerSalesScope = "period" | "history";

export interface CustomerSaleDocument {
  id: string;
  docType: string;
  sourceId: string;
  status: string | null;
  netAmount: number | null;
  realizedDate: string | null;
  sourceConfirmedAt: string | null;
  sourceEmissaoAt: string | null;
  isRealizedDoc: boolean;
}

export interface CustomerSaleItem {
  saleId: string;
  anchorType: string;
  anchorSourceId: string;
  hasPedido: boolean;
  pedidoSourceId: string | null;
  commercialDate: string | null;
  saleRealizedDate: string;
  totalRealizedAmount: number;
  realizedDocCount: number;
  documents: CustomerSaleDocument[];
}

export interface CustomerSalesResult {
  customerId: string;
  pagination: {
    page: number;
    pageSize: number;
    totalRecords: number;
    totalPages: number;
  };
  sales: CustomerSaleItem[];
}

export interface BiCustomerMetadata {
  id: string;
  sourceId: string;
  code: string | null;
  legalName: string | null;
  tradeName: string | null;
  cpf: string | null;
  cnpj: string | null;
  city: string | null;
  state: string | null;
}

export interface BiCustomerSaleRawDoc {
  id: string;
  docType: string;
  sourceId: string;
  status: string | null;
  netAmount: Prisma.Decimal | null;
  realizedDate: Date | null;
  sourceConfirmedAt: Date | null;
  sourceEmissaoAt: Date | null;
  sourcePresent: boolean;
}

export interface BiCustomerSaleRawRecord {
  id: string;
  anchorType: string;
  anchorSourceId: string;
  commercialDate: Date | null;
  sourceDocs: BiCustomerSaleRawDoc[];
}
