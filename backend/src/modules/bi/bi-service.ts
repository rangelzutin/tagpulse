import {
  calculateCustomerOverview,
  calculateSalesOverview,
} from "./bi-calculator.js";
import { parseOverviewDateRange } from "./bi-date-utils.js";
import type { BiRepository } from "./bi-repository.js";
import type {
  BiDataRangeResult,
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

export interface BiService {
  getDataRange(): Promise<BiDataRangeServiceResult>;
  getSalesOverview(from: unknown, to: unknown): Promise<BiSalesOverviewResult>;
  getCustomerOverview(
    from: unknown,
    to: unknown,
  ): Promise<BiCustomerOverviewResult>;
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
  };
}
