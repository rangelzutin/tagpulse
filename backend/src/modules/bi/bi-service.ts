import { Prisma } from "@prisma/client";
import {
  calculateCustomerOverview,
  calculateSalesOverview,
} from "./bi-calculator.js";
import {
  buildCustomerBehavioralMap,
  computeDisplayName,
  filterAndPaginateSegment,
  formatCpfCnpj,
  isEligibleRealizedDoc,
} from "./bi-customer-segmentation.js";
import { parseOverviewDateRange } from "./bi-date-utils.js";
import type { BiRepository } from "./bi-repository.js";
import type {
  BiCustomerMetadata,
  BiDataRangeResult,
  CustomerDetailOverviewResult,
  CustomerSalesResult,
  CustomerSalesScope,
  CustomerSegmentResult,
  CustomerSegmentSort,
  CustomerSegmentType,
  CustomerOverviewResult,
  SalesOverviewResult,
} from "./bi-types.js";

export type BiSalesOverviewResult =
  | { success: true; data: SalesOverviewResult }
  | { success: false; error: string };

export type BiCustomerOverviewResult =
  | { success: true; data: CustomerOverviewResult }
  | { success: false; error: string };

export type BiDataRangeServiceResult =
  | { success: true; data: BiDataRangeResult }
  | { success: false; error: string };

export type BiCustomerSegmentServiceResult =
  | { success: true; data: CustomerSegmentResult }
  | { success: false; error: string };

export type BiCustomerDetailOverviewServiceResult =
  | { success: true; data: CustomerDetailOverviewResult }
  | { success: false; notFound?: boolean; error: string };

export type BiCustomerSalesServiceResult =
  | { success: true; data: CustomerSalesResult }
  | { success: false; notFound?: boolean; error: string };

export interface BiService {
  getDataRange(): Promise<BiDataRangeServiceResult>;
  getSalesOverview(from: unknown, to: unknown): Promise<BiSalesOverviewResult>;
  getCustomerOverview(
    from: unknown,
    to: unknown,
  ): Promise<BiCustomerOverviewResult>;
  getCustomerSegment(
    query: Record<string, unknown>,
  ): Promise<BiCustomerSegmentServiceResult>;
  getCustomerDetailOverview(
    customerId: unknown,
    from: unknown,
    to: unknown,
  ): Promise<BiCustomerDetailOverviewServiceResult>;
  getCustomerSales(
    customerId: unknown,
    query: Record<string, unknown>,
  ): Promise<BiCustomerSalesServiceResult>;
}

const VALID_SEGMENTS: Set<CustomerSegmentType> = new Set([
  "buyers",
  "new",
  "returning",
  "historical",
  "single",
  "repeat",
]);

const VALID_SORTS: Set<CustomerSegmentSort> = new Set([
  "revenue_desc",
  "purchases_desc",
  "last_purchase_desc",
  "name_asc",
]);

function formatDateUtcIso(d: Date | null): string | null {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function createBiService(repository: BiRepository): BiService {
  return {
    async getDataRange(): Promise<BiDataRangeServiceResult> {
      if (!repository.findDataRange) {
        return {
          success: true,
          data: {
            firstRealizedDate: null,
            lastRealizedDate: null,
          },
        };
      }
      const data = await repository.findDataRange();
      return { success: true, data };
    },

    async getSalesOverview(
      from: unknown,
      to: unknown,
    ): Promise<BiSalesOverviewResult> {
      const parsedRange = parseOverviewDateRange(from, to);
      if (!parsedRange.success) {
        return { success: false, error: parsedRange.error };
      }

      const { from: fromStr, to: toStr, fromDate, toExclusiveDate } =
        parsedRange.range;

      const sales = await repository.findRealizedSales(
        fromDate,
        toExclusiveDate,
      );

      const data = calculateSalesOverview(
        sales,
        {
          from: fromStr,
          to: toStr,
        },
        fromDate,
        toExclusiveDate,
      );

      return { success: true, data };
    },

    async getCustomerOverview(
      from: unknown,
      to: unknown,
    ): Promise<BiCustomerOverviewResult> {
      const parsedRange = parseOverviewDateRange(from, to);
      if (!parsedRange.success) {
        return { success: false, error: parsedRange.error };
      }

      const { from: fromStr, to: toStr, fromDate, toExclusiveDate } =
        parsedRange.range;

      if (
        !repository.findPeriodCustomerDocuments ||
        !repository.findSalesRealizationRecordsUntil
      ) {
        return {
          success: false,
          error: "Repositório não suporta inteligência de clientes.",
        };
      }

      const [periodDocs, salesRealizationRecords] = await Promise.all([
        repository.findPeriodCustomerDocuments(fromDate, toExclusiveDate),
        repository.findSalesRealizationRecordsUntil(toExclusiveDate),
      ]);

      const data = calculateCustomerOverview(
        periodDocs,
        salesRealizationRecords,
        {
          from: fromStr,
          to: toStr,
          asOfDate: toStr,
        },
        fromDate,
        toExclusiveDate,
      );

      return { success: true, data };
    },

    async getCustomerSegment(
      query: Record<string, unknown>,
    ): Promise<BiCustomerSegmentServiceResult> {
      const parsedRange = parseOverviewDateRange(query.from, query.to);
      if (!parsedRange.success) {
        return { success: false, error: parsedRange.error };
      }

      const { from: fromStr, to: toStr, fromDate, toExclusiveDate } =
        parsedRange.range;

      const segmentParam = typeof query.segment === "string" ? query.segment.toLowerCase() : "";
      if (!VALID_SEGMENTS.has(segmentParam as CustomerSegmentType)) {
        return {
          success: false,
          error: "Segmento inválido. Valores permitidos: buyers, new, returning, historical, single, repeat.",
        };
      }
      const segment = segmentParam as CustomerSegmentType;

      let page = 1;
      if (query.page !== undefined) {
        const parsedPage = Number(query.page);
        if (!isNaN(parsedPage) && parsedPage >= 1) {
          page = Math.floor(parsedPage);
        }
      }

      let pageSize = 20;
      if (query.pageSize !== undefined) {
        const parsedPageSize = Number(query.pageSize);
        if (!isNaN(parsedPageSize) && parsedPageSize >= 1) {
          pageSize = Math.min(50, Math.floor(parsedPageSize));
        }
      }

      let sort: CustomerSegmentSort = "revenue_desc";
      if (typeof query.sort === "string" && VALID_SORTS.has(query.sort as CustomerSegmentSort)) {
        sort = query.sort as CustomerSegmentSort;
      }

      const search = typeof query.search === "string" ? query.search : undefined;

      if (
        !repository.findPeriodCustomerDocuments ||
        !repository.findSalesRealizationRecordsUntil
      ) {
        return {
          success: false,
          error: "Repositório não suporta inteligência de clientes.",
        };
      }

      const [periodDocs, salesRealizationRecords, metadataList] = await Promise.all([
        repository.findPeriodCustomerDocuments(fromDate, toExclusiveDate),
        repository.findSalesRealizationRecordsUntil(toExclusiveDate),
        repository.findCustomersMetadata ? repository.findCustomersMetadata() : Promise.resolve([]),
      ]);

      // Map metadata
      const metadataMap = new Map<string, BiCustomerMetadata>();
      for (const m of metadataList) {
        metadataMap.set(m.id, m);
      }
      // Fallback from periodDocs if not found in metadata
      for (const d of periodDocs) {
        if (!metadataMap.has(d.customerId)) {
          metadataMap.set(d.customerId, {
            id: d.customerId,
            sourceId: d.customer.sourceId,
            code: d.customer.code,
            legalName: d.customer.legalName,
            tradeName: d.customer.tradeName,
            cpf: null,
            cnpj: null,
            city: null,
            state: null,
          });
        }
      }

      // Map revenues per customer:
      // periodRevenue from periodDocs
      // lifetimeRevenue from salesRealizationRecords (or periodDocs)
      const customerRevenues = new Map<
        string,
        { periodRevenue: Prisma.Decimal; lifetimeRevenue: Prisma.Decimal }
      >();

      for (const doc of periodDocs) {
        if (!doc.customerId) continue;
        let entry = customerRevenues.get(doc.customerId);
        if (!entry) {
          entry = {
            periodRevenue: new Prisma.Decimal(0),
            lifetimeRevenue: new Prisma.Decimal(0),
          };
          customerRevenues.set(doc.customerId, entry);
        }
        entry.periodRevenue = entry.periodRevenue.plus(doc.netAmount);
      }

      for (const rec of salesRealizationRecords) {
        if (!rec.customerId) continue;
        let entry = customerRevenues.get(rec.customerId);
        if (!entry) {
          entry = {
            periodRevenue: new Prisma.Decimal(0),
            lifetimeRevenue: new Prisma.Decimal(0),
          };
          customerRevenues.set(rec.customerId, entry);
        }
        if (rec.netAmount) {
          entry.lifetimeRevenue = entry.lifetimeRevenue.plus(rec.netAmount);
        }
      }

      // If salesRealizationRecords had no netAmount (e.g. basic mock), fallback lifetimeRevenue to periodRevenue
      for (const entry of customerRevenues.values()) {
        if (entry.lifetimeRevenue.isZero() && !entry.periodRevenue.isZero()) {
          entry.lifetimeRevenue = entry.periodRevenue;
        }
      }

      const behavioralMap = buildCustomerBehavioralMap(
        salesRealizationRecords,
        fromDate,
        toExclusiveDate,
        toStr,
      );

      const result = filterAndPaginateSegment({
        segment,
        fromStr,
        toStr,
        customerBehavioralMap: behavioralMap,
        customerRevenues,
        metadataMap,
        page,
        pageSize,
        search,
        sort,
      });

      return { success: true, data: result };
    },

    async getCustomerDetailOverview(
      customerId: unknown,
      from: unknown,
      to: unknown,
    ): Promise<BiCustomerDetailOverviewServiceResult> {
      if (typeof customerId !== "string" || !customerId.trim()) {
        return { success: false, notFound: true, error: "Cliente não informado." };
      }
      const customerIdStr = customerId.trim();

      const parsedRange = parseOverviewDateRange(from, to);
      if (!parsedRange.success) {
        return { success: false, error: parsedRange.error };
      }

      const { from: fromStr, to: toStr, fromDate, toExclusiveDate } =
        parsedRange.range;

      if (
        !repository.findPeriodCustomerDocuments ||
        !repository.findSalesRealizationRecordsUntil
      ) {
        return {
          success: false,
          error: "Repositório não suporta inteligência de clientes.",
        };
      }

      let customerMeta: BiCustomerMetadata | null = null;
      if (repository.findCustomerDetail) {
        customerMeta = await repository.findCustomerDetail(customerIdStr);
      } else if (repository.findCustomersMetadata) {
        const list = await repository.findCustomersMetadata([customerIdStr]);
        customerMeta = list[0] ?? null;
      }

      const [periodDocs, salesRealizationRecords] = await Promise.all([
        repository.findPeriodCustomerDocuments(fromDate, toExclusiveDate),
        repository.findSalesRealizationRecordsUntil(toExclusiveDate),
      ]);

      // If customerMeta was not retrieved by repository method, check periodDocs
      if (!customerMeta) {
        const docWithCustomer = periodDocs.find((d) => d.customerId === customerIdStr);
        if (docWithCustomer) {
          customerMeta = {
            id: docWithCustomer.customerId,
            sourceId: docWithCustomer.customer.sourceId,
            code: docWithCustomer.customer.code,
            legalName: docWithCustomer.customer.legalName,
            tradeName: docWithCustomer.customer.tradeName,
            cpf: null,
            cnpj: null,
            city: null,
            state: null,
          };
        } else {
          // Check if customer exists in salesRealizationRecords
          const hasRecord = salesRealizationRecords.some((r) => r.customerId === customerIdStr);
          if (hasRecord) {
            customerMeta = {
              id: customerIdStr,
              sourceId: customerIdStr,
              code: null,
              legalName: null,
              tradeName: null,
              cpf: null,
              cnpj: null,
              city: null,
              state: null,
            };
          }
        }
      }

      if (!customerMeta) {
        return { success: false, notFound: true, error: "Cliente não encontrado." };
      }

      const behavioralMap = buildCustomerBehavioralMap(
        salesRealizationRecords,
        fromDate,
        toExclusiveDate,
        toStr,
      );

      const summary = behavioralMap.get(customerIdStr);

      // Period revenue & total identified period revenue
      let totalIdentifiedRevenueDecimal = new Prisma.Decimal(0);
      let customerPeriodRevenueDecimal = new Prisma.Decimal(0);

      for (const doc of periodDocs) {
        if (!doc.customerId) continue;
        totalIdentifiedRevenueDecimal = totalIdentifiedRevenueDecimal.plus(doc.netAmount);
        if (doc.customerId === customerIdStr) {
          customerPeriodRevenueDecimal = customerPeriodRevenueDecimal.plus(doc.netAmount);
        }
      }

      // Lifetime revenue
      let customerLifetimeRevenueDecimal = new Prisma.Decimal(0);
      for (const rec of salesRealizationRecords) {
        if (rec.customerId === customerIdStr && rec.netAmount) {
          customerLifetimeRevenueDecimal = customerLifetimeRevenueDecimal.plus(rec.netAmount);
        }
      }
      if (customerLifetimeRevenueDecimal.isZero() && !customerPeriodRevenueDecimal.isZero()) {
        customerLifetimeRevenueDecimal = customerPeriodRevenueDecimal;
      }

      const purchaseCount = summary?.periodSalesCount ?? 0;
      const revenue = Number(customerPeriodRevenueDecimal.toFixed(2));
      const averageTicket =
        purchaseCount > 0
          ? Number(customerPeriodRevenueDecimal.dividedBy(purchaseCount).toFixed(2))
          : 0;

      const revenueSharePercent = totalIdentifiedRevenueDecimal.isZero()
        ? 0
        : Number(
            customerPeriodRevenueDecimal
              .dividedBy(totalIdentifiedRevenueDecimal)
              .times(100)
              .toFixed(2),
          );

      const lifetimePurchaseCount = summary?.lifetimeSalesCount ?? 0;
      const lifetimeRevenue = Number(customerLifetimeRevenueDecimal.toFixed(2));
      const lifetimeAverageTicket =
        lifetimePurchaseCount > 0
          ? Number(customerLifetimeRevenueDecimal.dividedBy(lifetimePurchaseCount).toFixed(2))
          : 0;

      const displayName = computeDisplayName(customerMeta, customerIdStr);
      const cpfCnpj = formatCpfCnpj(customerMeta.cpf, customerMeta.cnpj);

      const isNewInPeriod = purchaseCount > 0 && (summary?.priorSalesCount ?? 0) === 0;
      const isReturningInPeriod = purchaseCount > 0 && (summary?.priorSalesCount ?? 0) > 0;
      const hasPeriodActivity = purchaseCount > 0;

      return {
        success: true,
        data: {
          identity: {
            customerId: customerMeta.id,
            sourceId: customerMeta.sourceId,
            code: customerMeta.code,
            legalName: customerMeta.legalName,
            tradeName: customerMeta.tradeName,
            displayName,
            cpfCnpj,
            city: customerMeta.city ?? null,
            state: customerMeta.state ?? null,
          },
          classification: {
            isNewInPeriod,
            isReturningInPeriod,
            hasPeriodActivity,
          },
          period: {
            from: fromStr,
            to: toStr,
            revenue,
            purchaseCount,
            averageTicket,
            revenueSharePercent,
          },
          lifetime: {
            asOfDate: toStr,
            firstPurchaseDate: formatDateUtcIso(summary?.firstPurchaseDate ?? null),
            lastPurchaseDate: formatDateUtcIso(summary?.lastPurchaseDate ?? null),
            purchaseCount: lifetimePurchaseCount,
            revenue: lifetimeRevenue,
            averageTicket: lifetimeAverageTicket,
            daysSinceLastPurchase: summary?.daysSinceLastPurchase ?? null,
          },
        },
      };
    },

    async getCustomerSales(
      customerId: unknown,
      query: Record<string, unknown>,
    ): Promise<BiCustomerSalesServiceResult> {
      if (typeof customerId !== "string" || !customerId.trim()) {
        return { success: false, notFound: true, error: "Cliente não informado." };
      }
      const customerIdStr = customerId.trim();

      const parsedRange = parseOverviewDateRange(query.from, query.to);
      if (!parsedRange.success) {
        return { success: false, error: parsedRange.error };
      }

      const { fromDate, toExclusiveDate } = parsedRange.range;

      if (!repository.findCustomerSales) {
        return {
          success: false,
          error: "Repositório não suporta consulta de negociações.",
        };
      }

      // Check customer existence
      if (repository.findCustomerDetail) {
        const cust = await repository.findCustomerDetail(customerIdStr);
        if (!cust) {
          return { success: false, notFound: true, error: "Cliente não encontrado." };
        }
      }

      const rawSales = await repository.findCustomerSales(customerIdStr);

      const scopeParam = typeof query.scope === "string" ? query.scope.toLowerCase() : "history";
      const scope: CustomerSalesScope = scopeParam === "period" ? "period" : "history";

      let page = 1;
      if (query.page !== undefined) {
        const parsedPage = Number(query.page);
        if (!isNaN(parsedPage) && parsedPage >= 1) {
          page = Math.floor(parsedPage);
        }
      }

      let pageSize = 20;
      if (query.pageSize !== undefined) {
        const parsedPageSize = Number(query.pageSize);
        if (!isNaN(parsedPageSize) && parsedPageSize >= 1) {
          pageSize = Math.min(50, Math.floor(parsedPageSize));
        }
      }

      // Process each sale according to the 3 mandatory adjustments
      interface ProcessedSale {
        saleId: string;
        anchorType: string;
        anchorSourceId: string;
        hasPedido: boolean;
        pedidoSourceId: string | null;
        commercialDate: string | null;
        saleRealizedDate: string;
        saleRealizedDateObj: Date;
        totalRealizedAmount: number;
        realizedDocCount: number;
        documents: {
          id: string;
          docType: string;
          sourceId: string;
          status: string | null;
          netAmount: number | null;
          realizedDate: string | null;
          sourceConfirmedAt: string | null;
          sourceEmissaoAt: string | null;
          isRealizedDoc: boolean;
        }[];
      }

      const validSales: ProcessedSale[] = [];

      for (const rawSale of rawSales) {
        // Find eligible realized docs up to toExclusiveDate
        const eligibleDocs = rawSale.sourceDocs.filter(
          (d) => isEligibleRealizedDoc(d) && d.realizedDate! < toExclusiveDate,
        );

        // Adjustment 2: ONLY include Sales with at least one eligible financial doc
        if (eligibleDocs.length === 0) {
          continue;
        }

        // Behavioral saleRealizedDate = MIN(realizedDate) of eligible docs
        let minRealizedDate = eligibleDocs[0]!.realizedDate!;
        for (let i = 1; i < eligibleDocs.length; i++) {
          if (eligibleDocs[i]!.realizedDate! < minRealizedDate) {
            minRealizedDate = eligibleDocs[i]!.realizedDate!;
          }
        }

        // Scope filter:
        // scope === "period" => saleRealizedDate IN [from, toExclusive)
        if (scope === "period") {
          if (minRealizedDate < fromDate || minRealizedDate >= toExclusiveDate) {
            continue;
          }
        }

        // Adjustment 3: totalRealizedAmount is the total realized value of the negotiation
        // summing all eligible financial docs linked to the Sale up to toExclusiveDate
        let totalRealizedDecimal = new Prisma.Decimal(0);
        for (const doc of eligibleDocs) {
          if (doc.netAmount) {
            totalRealizedDecimal = totalRealizedDecimal.plus(doc.netAmount);
          }
        }

        const hasPedido =
          rawSale.anchorType === "PEDIDO" ||
          rawSale.sourceDocs.some((d) => d.docType === "PEDIDO");

        const pedidoDoc = rawSale.sourceDocs.find((d) => d.docType === "PEDIDO");
        const pedidoSourceId =
          rawSale.anchorType === "PEDIDO"
            ? rawSale.anchorSourceId
            : (pedidoDoc?.sourceId ?? null);

        const documents = rawSale.sourceDocs.map((d) => {
          const isRealized = isEligibleRealizedDoc(d) && d.realizedDate! < toExclusiveDate;
          return {
            id: d.id,
            docType: d.docType,
            sourceId: d.sourceId,
            status: d.status,
            netAmount: d.netAmount ? Number(d.netAmount.toFixed(2)) : null,
            realizedDate: d.realizedDate ? d.realizedDate.toISOString() : null,
            sourceConfirmedAt: d.sourceConfirmedAt ? d.sourceConfirmedAt.toISOString() : null,
            sourceEmissaoAt: d.sourceEmissaoAt ? d.sourceEmissaoAt.toISOString() : null,
            isRealizedDoc: isRealized,
          };
        });

        validSales.push({
          saleId: rawSale.id,
          anchorType: rawSale.anchorType,
          anchorSourceId: rawSale.anchorSourceId,
          hasPedido,
          pedidoSourceId,
          commercialDate: rawSale.commercialDate ? rawSale.commercialDate.toISOString() : null,
          saleRealizedDate: minRealizedDate.toISOString(),
          saleRealizedDateObj: minRealizedDate,
          totalRealizedAmount: Number(totalRealizedDecimal.toFixed(2)),
          realizedDocCount: eligibleDocs.length,
          documents,
        });
      }

      // Order most recent first (saleRealizedDate desc, then saleId desc)
      validSales.sort((a, b) => {
        const timeDiff = b.saleRealizedDateObj.getTime() - a.saleRealizedDateObj.getTime();
        if (timeDiff !== 0) return timeDiff;
        return b.saleId.localeCompare(a.saleId);
      });

      const totalRecords = validSales.length;
      const totalPages = totalRecords === 0 ? 0 : Math.ceil(totalRecords / pageSize);
      const safePage = Math.max(1, page);
      const startIndex = (safePage - 1) * pageSize;
      const paginatedSales = validSales.slice(startIndex, startIndex + pageSize).map((s) => ({
        saleId: s.saleId,
        anchorType: s.anchorType,
        anchorSourceId: s.anchorSourceId,
        hasPedido: s.hasPedido,
        pedidoSourceId: s.pedidoSourceId,
        commercialDate: s.commercialDate,
        saleRealizedDate: s.saleRealizedDate,
        totalRealizedAmount: s.totalRealizedAmount,
        realizedDocCount: s.realizedDocCount,
        documents: s.documents,
      }));

      return {
        success: true,
        data: {
          customerId: customerIdStr,
          pagination: {
            page: safePage,
            pageSize,
            totalRecords,
            totalPages,
          },
          sales: paginatedSales,
        },
      };
    },
  };
}
