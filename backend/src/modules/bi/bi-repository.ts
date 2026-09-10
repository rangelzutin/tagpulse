import type { PrismaClient } from "@prisma/client";
import { SaleAnchorType } from "@prisma/client";
import type { BiSaleRecord } from "./bi-types.js";

export interface BiRepository {
  findRealizedSales(from: Date, toExclusive: Date): Promise<BiSaleRecord[]>;
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
  };
}
