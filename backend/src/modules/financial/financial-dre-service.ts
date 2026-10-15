import type {
  DreBreakdownDto,
  DreBreakdownQueryParams,
  DreMonthlyItemDto,
  DreMonthlyQueryParams,
  DreSummaryDto,
  DreSummaryQueryParams,
} from "./financial-dre-types.js";
import type { FinancialDreRepository } from "./financial-dre-repository.js";
import { classifyFinancialRecordForDre } from "./financial-dre-classifier.js";
import {
  calculateDreBreakdown,
  calculateDreMonthly,
  calculateDreSummary,
} from "./financial-dre-calculator.js";

export interface FinancialDreServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface FinancialDreService {
  getDreSummary(
    query?: DreSummaryQueryParams,
  ): Promise<FinancialDreServiceResult<DreSummaryDto>>;
  getDreMonthly(
    query?: DreMonthlyQueryParams,
  ): Promise<FinancialDreServiceResult<DreMonthlyItemDto[]>>;
  getDreBreakdown(
    query?: DreBreakdownQueryParams,
  ): Promise<FinancialDreServiceResult<DreBreakdownDto>>;
}

function parseDateRange(
  fromStr?: string,
  toStr?: string,
): { from: Date; toExclusive: Date; fromFormatted: string; toFormatted: string } {
  const now = new Date();
  const currentYear = now.getUTCFullYear();

  let f = fromStr?.trim();
  let t = toStr?.trim();

  if (!f) f = `${currentYear}-01-01`;
  if (!t) t = `${currentYear}-12-31`;

  const fromDate = new Date(`${f}T00:00:00.000Z`);
  // toExclusive é o início do dia seguinte em UTC
  const toDateBase = new Date(`${t}T00:00:00.000Z`);
  const toExclusive = new Date(toDateBase.getTime() + 24 * 60 * 60 * 1000);

  return {
    from: fromDate,
    toExclusive,
    fromFormatted: f,
    toFormatted: t,
  };
}

export function createFinancialDreService(
  repository: FinancialDreRepository,
): FinancialDreService {
  return {
    async getDreSummary(
      query?: DreSummaryQueryParams,
    ): Promise<FinancialDreServiceResult<DreSummaryDto>> {
      try {
        const { from, toExclusive, fromFormatted, toFormatted } = parseDateRange(
          query?.from,
          query?.to,
        );

        const data = await repository.findDreData(from, toExclusive);
        const classified = data.recordsForClassifier.map((r) =>
          classifyFinancialRecordForDre(r),
        );

        const monthlyItems = calculateDreMonthly(data.commercialTrend, classified, {
          period: { from: fromFormatted, to: toFormatted },
          fromDate: from,
          toExclusiveDate: toExclusive,
        });
        const summary = calculateDreSummary(monthlyItems, {
          from: fromFormatted,
          to: toFormatted,
        });

        return { success: true, data: summary };
      } catch (err: unknown) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Erro ao calcular DRE consolidado",
        };
      }
    },

    async getDreMonthly(
      query?: DreMonthlyQueryParams,
    ): Promise<FinancialDreServiceResult<DreMonthlyItemDto[]>> {
      try {
        const year = query?.year ? String(query.year).trim() : String(new Date().getUTCFullYear());
        const fromFormatted = `${year}-01-01`;
        const toFormatted = `${year}-12-31`;

        const from = new Date(`${fromFormatted}T00:00:00.000Z`);
        const toExclusive = new Date(`${parseInt(year, 10) + 1}-01-01T00:00:00.000Z`);

        const data = await repository.findDreData(from, toExclusive);
        const classified = data.recordsForClassifier.map((r) =>
          classifyFinancialRecordForDre(r),
        );

        const monthlyItems = calculateDreMonthly(data.commercialTrend, classified, {
          period: { from: fromFormatted, to: toFormatted },
          fromDate: from,
          toExclusiveDate: toExclusive,
        });
        return { success: true, data: monthlyItems };
      } catch (err: unknown) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Erro ao calcular DRE mensal",
        };
      }
    },

    async getDreBreakdown(
      query?: DreBreakdownQueryParams,
    ): Promise<FinancialDreServiceResult<DreBreakdownDto>> {
      try {
        const { from, toExclusive, fromFormatted, toFormatted } = parseDateRange(
          query?.from,
          query?.to,
        );

        const data = await repository.findDreData(from, toExclusive);
        const classified = data.recordsForClassifier.map((r) =>
          classifyFinancialRecordForDre(r),
        );

        const breakdown = calculateDreBreakdown(
          classified,
          { from: fromFormatted, to: toFormatted },
          data.totalRealizedRevenue,
          {
            fromDate: from,
            toExclusiveDate: toExclusive,
          },
        );

        return { success: true, data: breakdown };
      } catch (err: unknown) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Erro ao calcular detalhamento do DRE",
        };
      }
    },
  };
}
