import { Prisma } from "@prisma/client";
import type {
  BiSaleRecord,
  SalesOverviewMonthly,
  SalesOverviewPeriod,
  SalesOverviewResult,
  SalesOverviewSummary,
} from "./bi-types.js";

export function calculateSalesOverview(
  sales: BiSaleRecord[],
  period: SalesOverviewPeriod,
): SalesOverviewResult {
  let totalRevenueDecimal = new Prisma.Decimal(0);
  const distinctCustomers = new Set<string>();
  let salesWithoutCustomer = 0;

  const monthlyMap = new Map<
    string,
    {
      sales: number;
      revenue: Prisma.Decimal;
      customers: Set<string>;
    }
  >();

  for (const sale of sales) {
    totalRevenueDecimal = totalRevenueDecimal.plus(sale.netAmount);

    if (sale.customerId) {
      distinctCustomers.add(sale.customerId);
    } else {
      salesWithoutCustomer++;
    }

    const year = sale.commercialDate.getUTCFullYear();
    const month = String(sale.commercialDate.getUTCMonth() + 1).padStart(2, "0");
    const monthKey = `${year}-${month}`;

    let monthData = monthlyMap.get(monthKey);
    if (!monthData) {
      monthData = {
        sales: 0,
        revenue: new Prisma.Decimal(0),
        customers: new Set<string>(),
      };
      monthlyMap.set(monthKey, monthData);
    }

    monthData.sales++;
    monthData.revenue = monthData.revenue.plus(sale.netAmount);
    if (sale.customerId) {
      monthData.customers.add(sale.customerId);
    }
  }

  const totalSalesCount = sales.length;
  const summaryRevenueNumber = Number(totalRevenueDecimal.toFixed(2));
  const summaryAvgTicket =
    totalSalesCount === 0
      ? 0
      : Number(totalRevenueDecimal.dividedBy(totalSalesCount).toFixed(2));

  const summary: SalesOverviewSummary = {
    sales: totalSalesCount,
    revenue: summaryRevenueNumber,
    avgTicket: summaryAvgTicket,
    customers: distinctCustomers.size,
    salesWithoutCustomer,
  };

  const sortedMonths = Array.from(monthlyMap.keys()).sort();
  const monthly: SalesOverviewMonthly[] = sortedMonths.map((monthKey) => {
    const monthData = monthlyMap.get(monthKey)!;
    const monthRevenueNumber = Number(monthData.revenue.toFixed(2));
    const monthAvgTicket =
      monthData.sales === 0
        ? 0
        : Number(monthData.revenue.dividedBy(monthData.sales).toFixed(2));

    return {
      month: monthKey,
      sales: monthData.sales,
      revenue: monthRevenueNumber,
      avgTicket: monthAvgTicket,
      customers: monthData.customers.size,
    };
  });

  return {
    period,
    summary,
    monthly,
  };
}
