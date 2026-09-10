import type { PrismaClient } from "@prisma/client";
import { SaleAnchorType } from "@prisma/client";
import type {
  BiPeriodCustomerDoc,
  BiSaleRealizationRecord,
  BiSaleRecord,
} from "./bi-types.js";

export interface BiRepository {
  findRealizedSales(from: Date, toExclusive: Date): Promise<BiSaleRecord[]>;
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
