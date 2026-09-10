import { Prisma } from "@prisma/client";
import type {
  BiPeriodCustomerDoc,
  BiSaleRealizationRecord,
  BiSaleRecord,
  CustomerOverviewPeriod,
  CustomerOverviewResult,
  CustomerRankingItem,
  CustomerRecencySegment,
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

export function calculateCustomerOverview(
  periodDocs: BiPeriodCustomerDoc[],
  salesRealizationRecords: BiSaleRealizationRecord[],
  period: CustomerOverviewPeriod,
  fromDate: Date,
  toExclusiveDate: Date,
): CustomerOverviewResult {
  // 1. Behavioral Sales: saleRealizedDate = MIN(realizedDate) per saleId
  const saleMap = new Map<
    string,
    { customerId: string; minRealizedDate: Date }
  >();
  for (const rec of salesRealizationRecords) {
    if (!rec.customerId) continue;
    const existing = saleMap.get(rec.saleId);
    if (!existing) {
      saleMap.set(rec.saleId, {
        customerId: rec.customerId,
        minRealizedDate: rec.realizedDate,
      });
    } else {
      if (rec.realizedDate < existing.minRealizedDate) {
        existing.minRealizedDate = rec.realizedDate;
      }
    }
  }

  // 2. Group behavioral sales by customer
  const customerSalesMap = new Map<string, Date[]>();
  for (const { customerId, minRealizedDate } of saleMap.values()) {
    let list = customerSalesMap.get(customerId);
    if (!list) {
      list = [];
      customerSalesMap.set(customerId, list);
    }
    list.push(minRealizedDate);
  }

  // 3. Buying, New, Returning customers & Recurrence Rate
  let buyingCustomers = 0;
  let newCustomers = 0;
  let returningCustomers = 0;

  for (const dates of customerSalesMap.values()) {
    const hasPeriodSale = dates.some(
      (d) => d >= fromDate && d < toExclusiveDate,
    );
    if (!hasPeriodSale) continue;

    buyingCustomers++;

    const hasPriorSale = dates.some((d) => d < fromDate);
    if (hasPriorSale) {
      returningCustomers++;
    } else {
      newCustomers++;
    }
  }

  const recurrenceRate =
    buyingCustomers === 0
      ? 0
      : Number(((returningCustomers / buyingCustomers) * 100).toFixed(2));

  // 4. Financial Ranking (Top 10)
  interface CustomerRankingAgg {
    customerId: string;
    code: string | null;
    displayName: string;
    revenue: Prisma.Decimal;
    saleIds: Set<string>;
  }

  const rankingMap = new Map<string, CustomerRankingAgg>();
  let totalIdentifiedRevenueDecimal = new Prisma.Decimal(0);

  for (const doc of periodDocs) {
    if (!doc.customerId) continue;

    totalIdentifiedRevenueDecimal = totalIdentifiedRevenueDecimal.plus(
      doc.netAmount,
    );

    let entry = rankingMap.get(doc.customerId);
    if (!entry) {
      const c = doc.customer;
      const displayName =
        (c.tradeName && c.tradeName.trim()) ||
        (c.legalName && c.legalName.trim()) ||
        c.code ||
        c.sourceId ||
        doc.customerId;

      entry = {
        customerId: doc.customerId,
        code: c.code || null,
        displayName,
        revenue: new Prisma.Decimal(0),
        saleIds: new Set<string>(),
      };
      rankingMap.set(doc.customerId, entry);
    }

    entry.revenue = entry.revenue.plus(doc.netAmount);
    entry.saleIds.add(doc.saleId);
  }

  const sortedRankingEntries = Array.from(rankingMap.values()).sort((a, b) => {
    const revDiff = b.revenue.comparedTo(a.revenue);
    if (revDiff !== 0) {
      return revDiff;
    }
    return a.customerId.localeCompare(b.customerId);
  });

  let runningCumulativeRevenue = new Prisma.Decimal(0);
  const ranking: CustomerRankingItem[] = [];

  for (const entry of sortedRankingEntries.slice(0, 10)) {
    const purchaseCount = entry.saleIds.size;
    const revNum = Number(entry.revenue.toFixed(2));
    const avgTicket =
      purchaseCount === 0
        ? 0
        : Number(entry.revenue.dividedBy(purchaseCount).toFixed(2));

    const revenueSharePercent = totalIdentifiedRevenueDecimal.isZero()
      ? 0
      : Number(
          entry.revenue
            .dividedBy(totalIdentifiedRevenueDecimal)
            .times(100)
            .toFixed(2),
        );

    runningCumulativeRevenue = runningCumulativeRevenue.plus(entry.revenue);
    const cumulativeRevenueSharePercent = totalIdentifiedRevenueDecimal.isZero()
      ? 0
      : Number(
          runningCumulativeRevenue
            .dividedBy(totalIdentifiedRevenueDecimal)
            .times(100)
            .toFixed(2),
        );

    ranking.push({
      customerId: entry.customerId,
      code: entry.code,
      displayName: entry.displayName,
      revenue: revNum,
      purchaseCount,
      averageTicket: avgTicket,
      revenueSharePercent,
      cumulativeRevenueSharePercent,
    });
  }

  // 5. Recency / Inactivity (Calendar days)
  const [yearStr = "1970", monthStr = "1", dayStr = "1"] =
    period.asOfDate.split("-");
  const asOfYear = Number(yearStr);
  const asOfMonth = Number(monthStr);
  const asOfDay = Number(dayStr);
  const asOfUtcDay = Date.UTC(asOfYear, asOfMonth - 1, asOfDay);

  let c0_30 = 0;
  let c31_60 = 0;
  let c61_90 = 0;
  let c91_180 = 0;
  let c181_plus = 0;

  for (const dates of customerSalesMap.values()) {
    if (!dates || dates.length === 0) continue;

    let maxDate = dates[0]!;
    for (let i = 1; i < dates.length; i++) {
      const d = dates[i];
      if (d && d > maxDate) {
        maxDate = d;
      }
    }

    const saleUtcDay = Date.UTC(
      maxDate.getUTCFullYear(),
      maxDate.getUTCMonth(),
      maxDate.getUTCDate(),
    );

    const diffMs = asOfUtcDay - saleUtcDay;
    const daysInactive = Math.max(0, Math.round(diffMs / 86400000));

    if (daysInactive <= 30) {
      c0_30++;
    } else if (daysInactive <= 60) {
      c31_60++;
    } else if (daysInactive <= 90) {
      c61_90++;
    } else if (daysInactive <= 180) {
      c91_180++;
    } else {
      c181_plus++;
    }
  }

  const totalRecencyCustomers = c0_30 + c31_60 + c61_90 + c91_180 + c181_plus;
  const calcPercent = (count: number) =>
    totalRecencyCustomers === 0
      ? 0
      : Number(((count / totalRecencyCustomers) * 100).toFixed(2));

  const recency: CustomerRecencySegment[] = [
    {
      key: "0-30",
      label: "0 a 30 dias",
      customerCount: c0_30,
      percentage: calcPercent(c0_30),
    },
    {
      key: "31-60",
      label: "31 a 60 dias",
      customerCount: c31_60,
      percentage: calcPercent(c31_60),
    },
    {
      key: "61-90",
      label: "61 a 90 dias",
      customerCount: c61_90,
      percentage: calcPercent(c61_90),
    },
    {
      key: "91-180",
      label: "91 a 180 dias",
      customerCount: c91_180,
      percentage: calcPercent(c91_180),
    },
    {
      key: "181+",
      label: "181+ dias",
      customerCount: c181_plus,
      percentage: calcPercent(c181_plus),
    },
  ];

  return {
    period,
    customers: {
      buyingCustomers,
      newCustomers,
      returningCustomers,
      recurrenceRate,
    },
    ranking,
    recency,
  };
}
