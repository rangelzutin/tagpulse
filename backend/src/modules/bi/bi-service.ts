import { calculateSalesOverview } from "./bi-calculator.js";
import { parseOverviewDateRange } from "./bi-date-utils.js";
import type { BiRepository } from "./bi-repository.js";
import type { SalesOverviewResult } from "./bi-types.js";

export type BiSalesOverviewResult =
  | { success: true; data: SalesOverviewResult }
  | { success: false; error: string };

export interface BiService {
  getSalesOverview(from: unknown, to: unknown): Promise<BiSalesOverviewResult>;
}

export function createBiService(repository: BiRepository): BiService {
  return {
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

      const data = calculateSalesOverview(sales, {
        from: fromStr,
        to: toStr,
      });

      return { success: true, data };
    },
  };
}
