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
  SalesTrend,
  SalesTrendGranularity,
  SalesTrendPoint,
} from "./bi-types.js";
import {
  buildCustomerBehavioralMap,
  classifyCustomerOverviewMetrics,
} from "./bi-customer-segmentation.js";

function formatUtcIso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDayMonth(iso: string): string {
  const parts = iso.split("-");
  return `${parts[2]}/${parts[1]}`;
}

const MONTH_SHORT_NAMES = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

function formatMonthLabel(monthKey: string): string {
  const parts = monthKey.split("-");
  const p0 = parts[0];
  const p1 = parts[1];
  if (p0 && p1) {
    const mIdx = parseInt(p1, 10) - 1;
    const yShort = p0.slice(-2);
    if (mIdx >= 0 && mIdx < 12) {
      return `${MONTH_SHORT_NAMES[mIdx]}/${yShort}`;
    }
  }
  return monthKey;
}

function getMonday(d: Date): Date {
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff),
  );
}

export function calculateSalesTrend(
  sales: BiSaleRecord[],
  fromDate: Date,
  toExclusiveDate: Date,
  overrideGranularity?: SalesTrendGranularity,
): SalesTrend {
  const inclusiveDays = Math.round(
    (toExclusiveDate.getTime() - fromDate.getTime()) / 86400000,
  );

  let granularity: SalesTrendGranularity;
  if (overrideGranularity) {
    granularity = overrideGranularity;
  } else if (inclusiveDays <= 45) {
    granularity = "daily";
  } else if (inclusiveDays <= 180) {
    granularity = "weekly";
  } else {
    granularity = "monthly";
  }

  if (granularity === "daily") {
    interface DailyBucket {
      key: string;
      label: string;
      periodStart: string;
      periodEnd: string;
      revenue: Prisma.Decimal;
      sales: number;
      customers: Set<string>;
    }
    const bucketMap = new Map<string, DailyBucket>();
    let cur = new Date(fromDate.getTime());
    while (cur.getTime() < toExclusiveDate.getTime()) {
      const iso = formatUtcIso(cur);
      const label = formatDayMonth(iso);
      bucketMap.set(iso, {
        key: iso,
        label,
        periodStart: iso,
        periodEnd: iso,
        revenue: new Prisma.Decimal(0),
        sales: 0,
        customers: new Set<string>(),
      });
      cur = new Date(
        Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate() + 1),
      );
    }

    for (const sale of sales) {
      const sIso = formatUtcIso(sale.commercialDate);
      const b = bucketMap.get(sIso);
      if (b) {
        b.revenue = b.revenue.plus(sale.netAmount);
        b.sales++;
        if (sale.customerId) b.customers.add(sale.customerId);
      }
    }

    const points: SalesTrendPoint[] = Array.from(bucketMap.values()).map(
      (b) => ({
        key: b.key,
        label: b.label,
        periodStart: b.periodStart,
        periodEnd: b.periodEnd,
        revenue: Number(b.revenue.toFixed(2)),
        sales: b.sales,
        averageTicket:
          b.sales === 0 ? 0 : Number(b.revenue.dividedBy(b.sales).toFixed(2)),
        customers: b.customers.size,
      }),
    );

    return { granularity, points };
  }

  if (granularity === "weekly") {
    interface WeeklyBucket {
      key: string;
      label: string;
      periodStart: string;
      periodEnd: string;
      revenue: Prisma.Decimal;
      sales: number;
      customers: Set<string>;
    }
    const bucketMap = new Map<string, WeeklyBucket>();

    const startMonday = getMonday(fromDate);
    let curMonday = new Date(startMonday.getTime());

    while (curMonday.getTime() < toExclusiveDate.getTime()) {
      const mondayIso = formatUtcIso(curMonday);

      const pStartDate =
        curMonday.getTime() < fromDate.getTime() ? fromDate : curMonday;
      const lastDayOfWeekExclusive = new Date(
        curMonday.getTime() + 7 * 86400000,
      );
      const weekEndExclusive =
        lastDayOfWeekExclusive.getTime() > toExclusiveDate.getTime()
          ? toExclusiveDate
          : lastDayOfWeekExclusive;
      const pEndDate = new Date(weekEndExclusive.getTime() - 86400000);

      const periodStart = formatUtcIso(pStartDate);
      const periodEnd = formatUtcIso(pEndDate);
      const label = `${formatDayMonth(periodStart)} - ${formatDayMonth(periodEnd)}`;

      bucketMap.set(mondayIso, {
        key: mondayIso,
        label,
        periodStart,
        periodEnd,
        revenue: new Prisma.Decimal(0),
        sales: 0,
        customers: new Set<string>(),
      });

      curMonday = new Date(curMonday.getTime() + 7 * 86400000);
    }

    for (const sale of sales) {
      const saleMonday = getMonday(sale.commercialDate);
      const mondayIso = formatUtcIso(saleMonday);
      const b = bucketMap.get(mondayIso);
      if (b) {
        b.revenue = b.revenue.plus(sale.netAmount);
        b.sales++;
        if (sale.customerId) b.customers.add(sale.customerId);
      }
    }

    const points: SalesTrendPoint[] = Array.from(bucketMap.values()).map(
      (b) => ({
        key: b.key,
        label: b.label,
        periodStart: b.periodStart,
        periodEnd: b.periodEnd,
        revenue: Number(b.revenue.toFixed(2)),
        sales: b.sales,
        averageTicket:
          b.sales === 0 ? 0 : Number(b.revenue.dividedBy(b.sales).toFixed(2)),
        customers: b.customers.size,
      }),
    );

    return { granularity, points };
  }

  // Monthly
  interface MonthlyBucket {
    key: string;
    label: string;
    periodStart: string;
    periodEnd: string;
    revenue: Prisma.Decimal;
    sales: number;
    customers: Set<string>;
  }
  const bucketMap = new Map<string, MonthlyBucket>();

  const fromY = fromDate.getUTCFullYear();
  const fromM = fromDate.getUTCMonth();
  const toInc = new Date(toExclusiveDate.getTime() - 86400000);
  const toY = toInc.getUTCFullYear();
  const toM = toInc.getUTCMonth();

  let curY = fromY;
  let curM = fromM;

  while (curY < toY || (curY === toY && curM <= toM)) {
    const monthKey = `${curY}-${String(curM + 1).padStart(2, "0")}`;
    const firstDayOfMonth = new Date(Date.UTC(curY, curM, 1));
    const lastDayOfMonth = new Date(Date.UTC(curY, curM + 1, 0));

    const pStartDate =
      firstDayOfMonth.getTime() < fromDate.getTime()
        ? fromDate
        : firstDayOfMonth;
    const pEndDate =
      lastDayOfMonth.getTime() > toInc.getTime() ? toInc : lastDayOfMonth;

    const periodStart = formatUtcIso(pStartDate);
    const periodEnd = formatUtcIso(pEndDate);
    const label = formatMonthLabel(monthKey);

    bucketMap.set(monthKey, {
      key: monthKey,
      label,
      periodStart,
      periodEnd,
      revenue: new Prisma.Decimal(0),
      sales: 0,
      customers: new Set<string>(),
    });

    curM++;
    if (curM > 11) {
      curM = 0;
      curY++;
    }
  }

  for (const sale of sales) {
    const sy = sale.commercialDate.getUTCFullYear();
    const sm = String(sale.commercialDate.getUTCMonth() + 1).padStart(2, "0");
    const mKey = `${sy}-${sm}`;
    const b = bucketMap.get(mKey);
    if (b) {
      b.revenue = b.revenue.plus(sale.netAmount);
      b.sales++;
      if (sale.customerId) b.customers.add(sale.customerId);
    }
  }

  const points: SalesTrendPoint[] = Array.from(bucketMap.values()).map(
    (b) => ({
      key: b.key,
      label: b.label,
      periodStart: b.periodStart,
      periodEnd: b.periodEnd,
      revenue: Number(b.revenue.toFixed(2)),
      sales: b.sales,
      averageTicket:
        b.sales === 0 ? 0 : Number(b.revenue.dividedBy(b.sales).toFixed(2)),
      customers: b.customers.size,
    }),
  );

  return { granularity, points };
}

export function calculateSalesOverview(
  sales: BiSaleRecord[],
  period: SalesOverviewPeriod,
  fromDate?: Date,
  toExclusiveDate?: Date,
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

  let fDate = fromDate;
  let tExcDate = toExclusiveDate;
  if (!fDate || !tExcDate) {
    const fromParts = period.from.split("-").map(Number);
    const toParts = period.to.split("-").map(Number);
    const fy = fromParts[0] ?? 1970;
    const fm = fromParts[1] ?? 1;
    const fd = fromParts[2] ?? 1;
    const ty = toParts[0] ?? 1970;
    const tm = toParts[1] ?? 1;
    const td = toParts[2] ?? 1;
    fDate = new Date(Date.UTC(fy, fm - 1, fd));
    tExcDate = new Date(Date.UTC(ty, tm - 1, td + 1));
  }

  const trend = calculateSalesTrend(sales, fDate, tExcDate);

  return {
    period,
    summary,
    monthly,
    trend,
  };
}

export function calculateCustomerOverview(
  periodDocs: BiPeriodCustomerDoc[],
  salesRealizationRecords: BiSaleRealizationRecord[],
  period: CustomerOverviewPeriod,
  fromDate: Date,
  toExclusiveDate: Date,
): CustomerOverviewResult {
  // 1 & 2. Behavioral Sales & Classification using shared helper
  const behavioralMap = buildCustomerBehavioralMap(
    salesRealizationRecords,
    fromDate,
    toExclusiveDate,
    period.asOfDate,
  );
  const { overview: customers, lifetime } =
    classifyCustomerOverviewMetrics(behavioralMap);

  // 3. Financial Ranking (Top 10)
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

  // 4. Recency / Inactivity (Calendar days)
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
  let c181_365 = 0;
  let c366_730 = 0;
  let c731_plus = 0;

  for (const summary of behavioralMap.values()) {
    if (!summary.lastPurchaseDate) continue;

    const saleUtcDay = Date.UTC(
      summary.lastPurchaseDate.getUTCFullYear(),
      summary.lastPurchaseDate.getUTCMonth(),
      summary.lastPurchaseDate.getUTCDate(),
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
    } else if (daysInactive <= 365) {
      c181_365++;
    } else if (daysInactive <= 730) {
      c366_730++;
    } else {
      c731_plus++;
    }
  }

  const totalRecencyCustomers =
    c0_30 + c31_60 + c61_90 + c91_180 + c181_365 + c366_730 + c731_plus;
  const calcPercent = (count: number) =>
    totalRecencyCustomers === 0
      ? 0
      : Number(((count / totalRecencyCustomers) * 100).toFixed(2));

  const recency: CustomerRecencySegment[] = [
    {
      key: "0-30",
      label: "Até 30 dias",
      customerCount: c0_30,
      percentage: calcPercent(c0_30),
    },
    {
      key: "31-60",
      label: "31–60 dias",
      customerCount: c31_60,
      percentage: calcPercent(c31_60),
    },
    {
      key: "61-90",
      label: "61–90 dias",
      customerCount: c61_90,
      percentage: calcPercent(c61_90),
    },
    {
      key: "91-180",
      label: "3–6 meses",
      customerCount: c91_180,
      percentage: calcPercent(c91_180),
    },
    {
      key: "181-365",
      label: "6–12 meses",
      customerCount: c181_365,
      percentage: calcPercent(c181_365),
    },
    {
      key: "366-730",
      label: "1–2 anos",
      customerCount: c366_730,
      percentage: calcPercent(c366_730),
    },
    {
      key: "731+",
      label: "Mais de 2 anos",
      customerCount: c731_plus,
      percentage: calcPercent(c731_plus),
    },
  ];

  return {
    period,
    customers,
    lifetime,
    ranking,
    recency,
  };
}
