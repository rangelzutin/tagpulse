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
