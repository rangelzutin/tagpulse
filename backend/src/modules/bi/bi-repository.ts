import type { PrismaClient } from "@prisma/client";
import { SaleAnchorType } from "@prisma/client";
import type {
  BiDataRangeResult,
  BiPeriodCustomerDoc,
  BiSaleRealizationRecord,
  BiSaleRecord,
} from "./bi-types.js";

export interface BiRepository {
  findRealizedSales(from: Date, toExclusive: Date): Promise<BiSaleRecord[]>;
  findDataRange?(): Promise<BiDataRangeResult>;
  findPeriodCustomerDocuments?(
    from: Date,
    toExclusive: Date,
  ): Promise<BiPeriodCustomerDoc[]>;
  findSalesRealizationRecordsUntil?(
    toExclusive: Date,
  ): Promise<BiSaleRealizationRecord[]>;
}

export function createBiRepository(prisma: PrismaClient): BiRepository {
  return {
    async findDataRange(): Promise<BiDataRangeResult> {
      const agg = await prisma.saleSourceDocument.aggregate({
        where: {
          sourcePresent: true,
          docType: {
            in: [SaleAnchorType.NFE, SaleAnchorType.VENDA_SIMPLES],
          },
          realizedDate: {
            not: null,
          },
          netAmount: {
            not: null,
          },
        },
        _min: {
          realizedDate: true,
        },
        _max: {
          realizedDate: true,
        },
      });

      const formatDate = (d: Date | null): string | null => {
        if (!d || !(d instanceof Date) || isNaN(d.getTime())) return null;
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, "0");
        const day = String(d.getUTCDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      };

      return {
        firstRealizedDate: formatDate(agg._min.realizedDate),
        lastRealizedDate: formatDate(agg._max.realizedDate),
      };
    },

    async findRealizedSales(from: Date, toExclusive: Date): Promise<BiSaleRecord[]> {
      const records = await prisma.saleSourceDocument.findMany({
        where: {
          sourcePresent: true,
          docType: {
            in: [SaleAnchorType.NFE, SaleAnchorType.VENDA_SIMPLES],
          },
          realizedDate: {
            gte: from,
            lt: toExclusive,
          },
          netAmount: {
            not: null,
          },
        },
        select: {
          id: true,
          netAmount: true,
          realizedDate: true,
          sale: {
            select: {
              customerId: true,
            },
          },
        },
        orderBy: {
          realizedDate: "asc",
        },
      });

      const validRecords: BiSaleRecord[] = [];
      for (const record of records) {
        if (record.realizedDate instanceof Date && record.netAmount !== null) {
          validRecords.push({
            id: record.id,
            netAmount: record.netAmount,
            customerId: record.sale.customerId,
            commercialDate: record.realizedDate,
          });
        }
      }

      return validRecords;
    },

    async findPeriodCustomerDocuments(
      from: Date,
      toExclusive: Date,
    ): Promise<BiPeriodCustomerDoc[]> {
      const records = await prisma.saleSourceDocument.findMany({
        where: {
          sourcePresent: true,
          docType: {
            in: [SaleAnchorType.NFE, SaleAnchorType.VENDA_SIMPLES],
          },
          realizedDate: {
            gte: from,
            lt: toExclusive,
          },
          netAmount: {
            not: null,
          },
          sale: {
            customerId: {
              not: null,
            },
          },
        },
        select: {
          id: true,
          saleId: true,
          netAmount: true,
          realizedDate: true,
          sale: {
            select: {
              customerId: true,
              customer: {
                select: {
                  id: true,
                  sourceId: true,
                  code: true,
                  legalName: true,
                  tradeName: true,
                },
              },
            },
          },
        },
        orderBy: {
          realizedDate: "asc",
        },
      });

      const validRecords: BiPeriodCustomerDoc[] = [];
      for (const record of records) {
        if (
          record.realizedDate instanceof Date &&
          record.netAmount !== null &&
          record.sale.customerId !== null
        ) {
          validRecords.push({
            id: record.id,
            saleId: record.saleId,
            customerId: record.sale.customerId,
            netAmount: record.netAmount,
            realizedDate: record.realizedDate,
            customer: record.sale.customer ?? {
              id: record.sale.customerId,
              sourceId: record.sale.customerId,
              code: null,
              legalName: null,
              tradeName: null,
            },
          });
        }
      }

      return validRecords;
    },

    async findSalesRealizationRecordsUntil(
      toExclusive: Date,
    ): Promise<BiSaleRealizationRecord[]> {
      const records = await prisma.saleSourceDocument.findMany({
        where: {
          sourcePresent: true,
          docType: {
            in: [SaleAnchorType.NFE, SaleAnchorType.VENDA_SIMPLES],
          },
          realizedDate: {
            lt: toExclusive,
          },
          netAmount: {
            not: null,
          },
          sale: {
            customerId: {
              not: null,
            },
          },
        },
        select: {
          saleId: true,
          realizedDate: true,
          sale: {
            select: {
              customerId: true,
            },
          },
        },
      });

      const validRecords: BiSaleRealizationRecord[] = [];
      for (const record of records) {
        if (
          record.realizedDate instanceof Date &&
          record.sale.customerId !== null
        ) {
          validRecords.push({
            saleId: record.saleId,
            customerId: record.sale.customerId,
            realizedDate: record.realizedDate,
          });
        }
      }

      return validRecords;
    },
  };
}
