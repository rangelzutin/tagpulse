import type {
  DreBreakdownDto,
  DreBreakdownQueryParams,
  DreMonthlyItemDto,
  DreMonthlyQueryParams,
  DreSummaryDto,
  DreSummaryQueryParams,
  MonthlyOperationalBreakEvenDto,
  OperationalBreakEvenQueryParams,
} from "./financial-dre-types.js";
import type { FinancialDreRepository } from "./financial-dre-repository.js";
import { classifyFinancialRecordForDre } from "./financial-dre-classifier.js";
import {
  calculateDreBreakdown,
  calculateDreMonthly,
  calculateDreSummary,
  calculateMonthlyOperationalBreakEven,
} from "./financial-dre-calculator.js";
import {
  parseOperationUnit,
  parseSourceSystem,
  type FilterOptions,
} from "../../shared/filters/filter-options.js";

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
  getOperationalBreakEven(
    query?: OperationalBreakEvenQueryParams,
  ): Promise<FinancialDreServiceResult<MonthlyOperationalBreakEvenDto>>;
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

function extractFilterOptions(query?: {
  operationUnit?: unknown;
  sourceSystem?: unknown;
}): { options?: FilterOptions; error?: string } {
  if (!query) return {};
  const opParsed = parseOperationUnit(query.operationUnit);
  if (!opParsed.valid) {
    return { error: opParsed.error };
  }
  const srcParsed = parseSourceSystem(query.sourceSystem);
  if (!srcParsed.valid) {
    return { error: srcParsed.error };
  }
  if (!opParsed.value && !srcParsed.value) {
    return {};
  }
  return {
    options: {
      ...(opParsed.value ? { operationUnit: opParsed.value } : {}),
      ...(srcParsed.value ? { sourceSystem: srcParsed.value } : {}),
    },
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
        const filterRes = extractFilterOptions(query);
        if (filterRes.error) {
          return { success: false, error: filterRes.error };
        }

        const { from, toExclusive, fromFormatted, toFormatted } = parseDateRange(
          query?.from,
          query?.to,
        );

        const data = await repository.findDreData(from, toExclusive, filterRes.options);
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
        const filterRes = extractFilterOptions(query);
        if (filterRes.error) {
          return { success: false, error: filterRes.error };
        }

        const year = query?.year ? String(query.year).trim() : String(new Date().getUTCFullYear());
        const fromFormatted = `${year}-01-01`;
        const toFormatted = `${year}-12-31`;

        const from = new Date(`${fromFormatted}T00:00:00.000Z`);
        const toExclusive = new Date(`${parseInt(year, 10) + 1}-01-01T00:00:00.000Z`);

        const data = await repository.findDreData(from, toExclusive, filterRes.options);
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
        const filterRes = extractFilterOptions(query);
        if (filterRes.error) {
          return { success: false, error: filterRes.error };
        }

        const { from, toExclusive, fromFormatted, toFormatted } = parseDateRange(
          query?.from,
          query?.to,
        );

        const data = await repository.findDreData(from, toExclusive, filterRes.options);
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

    async getOperationalBreakEven(
      query?: OperationalBreakEvenQueryParams,
    ): Promise<FinancialDreServiceResult<MonthlyOperationalBreakEvenDto>> {
      try {
        const filterRes = extractFilterOptions(query);
        if (filterRes.error) {
          return { success: false, error: filterRes.error };
        }

        const now = new Date();
        const defaultMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
        let targetMonth = defaultMonth;

        if (query?.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month.trim())) {
          targetMonth = query.month.trim();
        } else if (query?.to && /^\d{4}-(0[1-9]|1[0-2])/.test(query.to.trim())) {
          targetMonth = query.to.trim().slice(0, 7);
        } else if (query?.from && /^\d{4}-(0[1-9]|1[0-2])/.test(query.from.trim())) {
          targetMonth = query.from.trim().slice(0, 7);
        }

        const [yearStr = "2026", monthStr = "01"] = targetMonth.split("-");
        const yearNum = Number.parseInt(yearStr, 10);
        const monthNum = Number.parseInt(monthStr, 10);

        // Sempre buscar desde 2026 (ou ano anterior em rolling 12m) até o final do mês completo
        const startYearNum = Math.min(yearNum, Math.max(2026, yearNum - 1));
        const yearStart = new Date(Date.UTC(startYearNum, 0, 1, 0, 0, 0));
        const targetMonthEndExclusive = new Date(Date.UTC(yearNum, monthNum, 1, 0, 0, 0));

        const data = await repository.findDreData(
          yearStart,
          targetMonthEndExclusive,
          filterRes.options,
        );

        const result = calculateMonthlyOperationalBreakEven(
          data.commercialTrend,
          data.recordsForClassifier,
          {
            targetMonth,
            referenceDate: now,
          },
        );

        return { success: true, data: result };
      } catch (err: unknown) {
        return {
          success: false,
          error:
            err instanceof Error
              ? err.message
              : "Erro ao calcular ponto de equilíbrio operacional do mês",
        };
      }
    },
  };
}
