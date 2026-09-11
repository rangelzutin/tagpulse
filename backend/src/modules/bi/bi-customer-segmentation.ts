import { Prisma } from "@prisma/client";
import type {
  BiCustomerMetadata,
  BiSaleRealizationRecord,
  CustomerOverviewMetrics,
  CustomerLifetimeMetrics,
  CustomerSegmentItem,
  CustomerSegmentResult,
  CustomerSegmentSort,
  CustomerSegmentType,
} from "./bi-types.js";

/**
 * Exact approved financial realization check:
 * sourcePresent === true
 * AND docType IN [NFE, VENDA_SIMPLES]
 * AND realizedDate != null
 * AND netAmount != null
 */
export function isEligibleRealizedDoc(doc: {
  sourcePresent?: boolean | null;
  docType?: string | null;
  realizedDate?: Date | null;
  netAmount?: Prisma.Decimal | number | string | null;
}): boolean {
  if (doc.sourcePresent !== true) return false;
  if (doc.docType !== "NFE" && doc.docType !== "VENDA_SIMPLES") return false;
  if (!doc.realizedDate || !(doc.realizedDate instanceof Date) || isNaN(doc.realizedDate.getTime())) {
    return false;
  }
  if (doc.netAmount === null || doc.netAmount === undefined) return false;
  return true;
}

export function formatCpfCnpj(cpf?: string | null, cnpj?: string | null): string | null {
  if (cnpj) {
    const digits = cnpj.replace(/\D/g, "");
    if (digits.length === 14) {
      return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
    }
    return cnpj.trim() || null;
  }
  if (cpf) {
    const digits = cpf.replace(/\D/g, "");
    if (digits.length === 11) {
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    }
    return cpf.trim() || null;
  }
  return null;
}

export function computeDisplayName(
  metadata: Partial<BiCustomerMetadata> | null | undefined,
  fallbackCustomerId: string,
): string {
  if (!metadata) return fallbackCustomerId;
  const trade = metadata.tradeName?.trim();
  if (trade) return trade;
  const legal = metadata.legalName?.trim();
  if (legal) return legal;
  if (metadata.code?.trim()) return metadata.code.trim();
  if (metadata.sourceId?.trim()) return metadata.sourceId.trim();
  return fallbackCustomerId;
}

export interface CustomerSalesSummary {
  customerId: string;
  sales: { saleId: string; minRealizedDate: Date }[];
  periodSalesCount: number;
  priorSalesCount: number;
  lifetimeSalesCount: number;
  firstPurchaseDate: Date | null;
  lastPurchaseDate: Date | null;
  daysSinceLastPurchase: number | null;
}

export function buildCustomerBehavioralMap(
  salesRealizationRecords: BiSaleRealizationRecord[],
  fromDate: Date,
  toExclusiveDate: Date,
  asOfDateStr: string,
): Map<string, CustomerSalesSummary> {
  // 1. Group by saleId to find minRealizedDate
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
    } else if (rec.realizedDate < existing.minRealizedDate) {
      existing.minRealizedDate = rec.realizedDate;
    }
  }

  // 2. Group by customerId
  const customerMap = new Map<string, { saleId: string; minRealizedDate: Date }[]>();
  for (const [saleId, { customerId, minRealizedDate }] of saleMap.entries()) {
    let list = customerMap.get(customerId);
    if (!list) {
      list = [];
      customerMap.set(customerId, list);
    }
    list.push({ saleId, minRealizedDate });
  }

  const [yStr = "1970", mStr = "1", dStr = "1"] = asOfDateStr.split("-");
  const asOfUtcDay = Date.UTC(Number(yStr), Number(mStr) - 1, Number(dStr));

  const result = new Map<string, CustomerSalesSummary>();

  for (const [customerId, sales] of customerMap.entries()) {
    sales.sort((a, b) => a.minRealizedDate.getTime() - b.minRealizedDate.getTime());

    let periodSalesCount = 0;
    let priorSalesCount = 0;

    for (const s of sales) {
      if (s.minRealizedDate >= fromDate && s.minRealizedDate < toExclusiveDate) {
        periodSalesCount++;
      }
      if (s.minRealizedDate < fromDate) {
        priorSalesCount++;
      }
    }

    const firstPurchaseDate = sales.length > 0 ? sales[0]!.minRealizedDate : null;
    const lastPurchaseDate = sales.length > 0 ? sales[sales.length - 1]!.minRealizedDate : null;

    let daysSinceLastPurchase: number | null = null;
    if (lastPurchaseDate) {
      const lastUtcDay = Date.UTC(
        lastPurchaseDate.getUTCFullYear(),
        lastPurchaseDate.getUTCMonth(),
        lastPurchaseDate.getUTCDate(),
      );
      daysSinceLastPurchase = Math.round((asOfUtcDay - lastUtcDay) / 86400000);
    }

    result.set(customerId, {
      customerId,
      sales,
      periodSalesCount,
      priorSalesCount,
      lifetimeSalesCount: sales.length,
      firstPurchaseDate,
      lastPurchaseDate,
      daysSinceLastPurchase,
    });
  }

  return result;
}

export function classifyCustomerOverviewMetrics(
  customerBehavioralMap: Map<string, CustomerSalesSummary>,
): { overview: CustomerOverviewMetrics; lifetime: CustomerLifetimeMetrics } {
  let buyingCustomers = 0;
  let newCustomers = 0;
  let returningCustomers = 0;

  let lifetimeCustomers = 0;
  let singlePurchaseCustomers = 0;
  let repeatCustomers = 0;

  for (const summary of customerBehavioralMap.values()) {
    if (summary.periodSalesCount > 0) {
      buyingCustomers++;
      if (summary.priorSalesCount > 0) {
        returningCustomers++;
      } else {
        newCustomers++;
      }
    }

    if (summary.lifetimeSalesCount > 0) {
      lifetimeCustomers++;
      if (summary.lifetimeSalesCount === 1) {
        singlePurchaseCustomers++;
      } else {
        repeatCustomers++;
      }
    }
  }

  const recurrenceRate =
    buyingCustomers === 0
      ? 0
      : Number(((returningCustomers / buyingCustomers) * 100).toFixed(2));

  const repeatRate =
    lifetimeCustomers === 0
      ? 0
      : Number(((repeatCustomers / lifetimeCustomers) * 100).toFixed(2));

  return {
    overview: {
      buyingCustomers,
      newCustomers,
      returningCustomers,
      recurrenceRate,
    },
    lifetime: {
      customers: lifetimeCustomers,
      singlePurchaseCustomers,
      repeatCustomers,
      repeatRate,
    },
  };
}

export function isCustomerInSegment(
  summary: CustomerSalesSummary,
  segment: CustomerSegmentType,
): boolean {
  switch (segment) {
    case "buyers":
      return summary.periodSalesCount >= 1;
    case "new":
      return summary.periodSalesCount >= 1 && summary.priorSalesCount === 0;
    case "returning":
      return summary.periodSalesCount >= 1 && summary.priorSalesCount >= 1;
    case "historical":
      return summary.lifetimeSalesCount >= 1;
    case "single":
      return summary.lifetimeSalesCount === 1;
    case "repeat":
      return summary.lifetimeSalesCount >= 2;
    default:
      return false;
  }
}

function formatDateUtc(d: Date | null): string | null {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s]/gi, "")
    .trim();
}

export function filterAndPaginateSegment(params: {
  segment: CustomerSegmentType;
  fromStr: string;
  toStr: string;
  customerBehavioralMap: Map<string, CustomerSalesSummary>;
  customerRevenues: Map<
    string,
    { periodRevenue: Prisma.Decimal; lifetimeRevenue: Prisma.Decimal }
  >;
  metadataMap: Map<string, BiCustomerMetadata>;
  page: number;
  pageSize: number;
  search?: string | undefined;
  sort?: CustomerSegmentSort | undefined;
}): CustomerSegmentResult {
  const {
    segment,
    fromStr,
    toStr,
    customerBehavioralMap,
    customerRevenues,
    metadataMap,
    page,
    pageSize,
    search,
    sort = "revenue_desc",
  } = params;

  // 1. Identify all customers belonging to the segment
  const allSegmentItems: CustomerSegmentItem[] = [];

  for (const [customerId, summary] of customerBehavioralMap.entries()) {
    if (!isCustomerInSegment(summary, segment)) continue;

    const rev = customerRevenues.get(customerId);
    const meta = metadataMap.get(customerId);

    const displayName = computeDisplayName(meta, customerId);
    const cpfCnpj = formatCpfCnpj(meta?.cpf, meta?.cnpj);

    const purchasesInPeriod = summary.periodSalesCount;
    const revenueInPeriod = rev ? Number(rev.periodRevenue.toFixed(2)) : 0;
    const averageTicketInPeriod =
      purchasesInPeriod > 0
        ? Number((revenueInPeriod / purchasesInPeriod).toFixed(2))
        : 0;

    const lifetimePurchaseCount = summary.lifetimeSalesCount;
    const lifetimeRevenue = rev ? Number(rev.lifetimeRevenue.toFixed(2)) : 0;

    allSegmentItems.push({
      customerId,
      code: meta?.code ?? null,
      legalName: meta?.legalName ?? null,
      tradeName: meta?.tradeName ?? null,
      displayName,
      cpfCnpj,
      purchasesInPeriod,
      revenueInPeriod,
      averageTicketInPeriod,
      firstPurchaseDate: formatDateUtc(summary.firstPurchaseDate),
      lastPurchaseDate: formatDateUtc(summary.lastPurchaseDate),
      lifetimePurchaseCount,
      lifetimeRevenue,
      daysSinceLastPurchase: summary.daysSinceLastPurchase,
    });
  }

  // Summary (unfiltered segment totals)
  const segmentCustomerCount = allSegmentItems.length;
  let totalRevenueDecimal = new Prisma.Decimal(0);
  for (const item of allSegmentItems) {
    totalRevenueDecimal = totalRevenueDecimal.plus(item.revenueInPeriod);
  }
  const segmentTotalRevenueInPeriod = Number(totalRevenueDecimal.toFixed(2));

  // 2. Filter by search if provided
  let filteredItems = allSegmentItems;
  if (search && search.trim()) {
    const rawTerm = search.trim();
    const cleanDigits = rawTerm.replace(/\D/g, "");
    const normalizedTerm = normalizeSearch(rawTerm);

    filteredItems = allSegmentItems.filter((item) => {
      if (normalizedTerm && normalizeSearch(item.displayName).includes(normalizedTerm)) {
        return true;
      }
      if (item.legalName && normalizedTerm && normalizeSearch(item.legalName).includes(normalizedTerm)) {
        return true;
      }
      if (item.tradeName && normalizedTerm && normalizeSearch(item.tradeName).includes(normalizedTerm)) {
        return true;
      }
      if (item.code && item.code.toLowerCase().includes(rawTerm.toLowerCase())) {
        return true;
      }
      if (cleanDigits && item.cpfCnpj) {
        const itemDigits = item.cpfCnpj.replace(/\D/g, "");
        if (itemDigits.includes(cleanDigits)) {
          return true;
        }
      }
      return false;
    });
  }

  // 3. Sort
  filteredItems.sort((a, b) => {
    switch (sort) {
      case "purchases_desc": {
        const pDiff = b.purchasesInPeriod - a.purchasesInPeriod;
        if (pDiff !== 0) return pDiff;
        const rDiff = b.revenueInPeriod - a.revenueInPeriod;
        if (rDiff !== 0) return rDiff;
        return a.customerId.localeCompare(b.customerId);
      }
      case "last_purchase_desc": {
        const aDate = a.lastPurchaseDate ?? "";
        const bDate = b.lastPurchaseDate ?? "";
        const dDiff = bDate.localeCompare(aDate);
        if (dDiff !== 0) return dDiff;
        return a.customerId.localeCompare(b.customerId);
      }
      case "name_asc": {
        const nDiff = a.displayName.localeCompare(b.displayName, "pt-BR");
        if (nDiff !== 0) return nDiff;
        return a.customerId.localeCompare(b.customerId);
      }
      case "revenue_desc":
      default: {
        const rDiff = b.revenueInPeriod - a.revenueInPeriod;
        if (rDiff !== 0) return rDiff;
        return a.customerId.localeCompare(b.customerId);
      }
    }
  });

  // 4. Pagination
  const totalRecords = filteredItems.length;
  const totalPages = totalRecords === 0 ? 0 : Math.ceil(totalRecords / pageSize);
  const safePage = Math.max(1, page);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedCustomers = filteredItems.slice(startIndex, startIndex + pageSize);

  return {
    segment,
    period: {
      from: fromStr,
      to: toStr,
    },
    pagination: {
      page: safePage,
      pageSize,
      totalRecords,
      totalPages,
    },
    summary: {
      segmentCustomerCount,
      segmentTotalRevenueInPeriod,
    },
    customers: paginatedCustomers,
  };
}
