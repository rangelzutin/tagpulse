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

export interface SalesOverviewResult {
  period: SalesOverviewPeriod;
  summary: SalesOverviewSummary;
  monthly: SalesOverviewMonthly[];
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
  key: "0-30" | "31-60" | "61-90" | "91-180" | "181+";
  label: string;
  customerCount: number;
  percentage: number;
}

export interface CustomerOverviewResult {
  period: CustomerOverviewPeriod;
  customers: CustomerOverviewMetrics;
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
}
