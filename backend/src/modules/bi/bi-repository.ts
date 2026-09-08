import type { PrismaClient } from "@prisma/client";
import { SaleAnchorType } from "@prisma/client";
import type { BiSaleRecord } from "./bi-types.js";

export interface BiRepository {
  findRealizedSales(from: Date, toExclusive: Date): Promise<BiSaleRecord[]>;
}

export function createBiRepository(prisma: PrismaClient): BiRepository {
  return {
    async findRealizedSales(from: Date, toExclusive: Date): Promise<BiSaleRecord[]> {
      const records = await prisma.sale.findMany({
        where: {
          commercialDate: {
            gte: from,
            lt: toExclusive,
          },
          sourceDocs: {
            some: {
              sourcePresent: true,
              docType: {
                in: [SaleAnchorType.NFE, SaleAnchorType.VENDA_SIMPLES],
              },
            },
          },
        },
        select: {
          id: true,
          netAmount: true,
          customerId: true,
          commercialDate: true,
        },
        orderBy: {
          commercialDate: "asc",
        },
      });

      const validRecords: BiSaleRecord[] = [];
      for (const record of records) {
        if (record.commercialDate instanceof Date) {
          validRecords.push({
            id: record.id,
            netAmount: record.netAmount,
            customerId: record.customerId,
            commercialDate: record.commercialDate,
          });
        }
      }

      return validRecords;
    },
  };
}
