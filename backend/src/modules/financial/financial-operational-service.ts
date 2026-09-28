import type {
  CashFlowOverviewResponse,
  FinancialListQueryParams,
  PaginatedResult,
  PayablesListItem,
  PayablesOverviewResponse,
  ReceivablesListItem,
  ReceivablesOverviewResponse,
  UndatedConfirmedCashResponse,
} from "./financial-operational-types.js";
import type { FinancialOperationalRepository } from "./financial-operational-repository.js";
import {
  aggregateCashFlowSeries,
  aggregateOperationalSummary,
  aggregateUndatedConfirmedCash,
} from "./financial-operational-calculator.js";

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export function getCurrentBusinessDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function isValidCivilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = value.split("-").map(Number);
  const y = parts[0]!;
  const m = parts[1]!;
  const d = parts[2]!;
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

export interface FinancialOperationalService {
  getReceivablesOverview(
    referenceDate?: string,
  ): Promise<ServiceResult<ReceivablesOverviewResponse>>;

  getReceivablesList(
    params: FinancialListQueryParams,
  ): Promise<ServiceResult<PaginatedResult<ReceivablesListItem>>>;

  getPayablesOverview(
    referenceDate?: string,
  ): Promise<ServiceResult<PayablesOverviewResponse>>;

  getPayablesList(
    params: FinancialListQueryParams,
  ): Promise<ServiceResult<PaginatedResult<PayablesListItem>>>;

  getCashFlowOverview(query?: {
    from?: string;
    to?: string;
    granularity?: string;
  }): Promise<ServiceResult<CashFlowOverviewResponse>>;

  getUndatedConfirmedCash(): Promise<
    ServiceResult<UndatedConfirmedCashResponse>
  >;
}

export function createFinancialOperationalService(
  repository: FinancialOperationalRepository,
  options?: { getNow?: () => Date },
): FinancialOperationalService {
  function resolveReferenceDate(override?: string): string {
    if (override && override.trim()) {
      const trimmed = override.trim();
      if (isValidCivilDate(trimmed)) {
        return trimmed;
      }
    }
    const now = options?.getNow ? options.getNow() : new Date();
    return getCurrentBusinessDate(now);
  }

  return {
    async getReceivablesOverview(
      referenceDate?: string,
    ): Promise<ServiceResult<ReceivablesOverviewResponse>> {
      try {
        const refDate = resolveReferenceDate(referenceDate);
        if (referenceDate && !isValidCivilDate(referenceDate.trim())) {
          return {
            success: false,
            error: "Data de referência inválida. Use o formato YYYY-MM-DD.",
          };
        }

        const openRecords =
          await repository.findOpenRecordsForSummary("ENTRADA");
        const summary = aggregateOperationalSummary(openRecords, refDate);

        return {
          success: true,
          data: {
            type: "ENTRADA",
            ...summary,
          },
        };
      } catch (err: unknown) {
        return {
          success: false,
          error:
            err instanceof Error
              ? err.message
              : "Erro ao gerar resumo de contas a receber.",
        };
      }
    },

    async getReceivablesList(
      params: FinancialListQueryParams,
    ): Promise<ServiceResult<PaginatedResult<ReceivablesListItem>>> {
      try {
        const refDate = resolveReferenceDate(params.referenceDate);
        if (
          params.referenceDate &&
          !isValidCivilDate(params.referenceDate.trim())
        ) {
          return {
            success: false,
            error: "Data de referência inválida. Use o formato YYYY-MM-DD.",
          };
        }

        const result = await repository.findReceivablesList(params, refDate);
        return {
          success: true,
          data: result,
        };
      } catch (err: unknown) {
        return {
          success: false,
          error:
            err instanceof Error
              ? err.message
              : "Erro ao listar contas a receber.",
        };
      }
    },

    async getPayablesOverview(
      referenceDate?: string,
    ): Promise<ServiceResult<PayablesOverviewResponse>> {
      try {
        const refDate = resolveReferenceDate(referenceDate);
        if (referenceDate && !isValidCivilDate(referenceDate.trim())) {
          return {
            success: false,
            error: "Data de referência inválida. Use o formato YYYY-MM-DD.",
          };
        }

        const openRecords = await repository.findOpenRecordsForSummary("SAIDA");
        const summary = aggregateOperationalSummary(openRecords, refDate);

        return {
          success: true,
          data: {
            type: "SAIDA",
            ...summary,
          },
        };
      } catch (err: unknown) {
        return {
          success: false,
          error:
            err instanceof Error
              ? err.message
              : "Erro ao gerar resumo de contas a pagar.",
        };
      }
    },

    async getPayablesList(
      params: FinancialListQueryParams,
    ): Promise<ServiceResult<PaginatedResult<PayablesListItem>>> {
      try {
        const refDate = resolveReferenceDate(params.referenceDate);
        if (
          params.referenceDate &&
          !isValidCivilDate(params.referenceDate.trim())
        ) {
          return {
            success: false,
            error: "Data de referência inválida. Use o formato YYYY-MM-DD.",
          };
        }

        const result = await repository.findPayablesList(params, refDate);
        return {
          success: true,
          data: result,
        };
      } catch (err: unknown) {
        return {
          success: false,
          error:
            err instanceof Error ? err.message : "Erro ao listar contas a pagar.",
        };
      }
    },

    async getCashFlowOverview(query: {
      from?: string;
      to?: string;
      granularity?: string;
    } = {}): Promise<ServiceResult<CashFlowOverviewResponse>> {
      try {
        const fromStr = query.from?.trim() || null;
        const toStr = query.to?.trim() || null;

        if (fromStr && !isValidCivilDate(fromStr)) {
          return {
            success: false,
            error: "Parâmetro 'from' inválido. Use o formato YYYY-MM-DD.",
          };
        }

        if (toStr && !isValidCivilDate(toStr)) {
          return {
            success: false,
            error: "Parâmetro 'to' inválido. Use o formato YYYY-MM-DD.",
          };
        }

        if (fromStr && toStr && fromStr > toStr) {
          return {
            success: false,
            error: "A data inicial 'from' deve ser anterior ou igual à data final 'to'.",
          };
        }

        let granularity: "day" | "month" = "month";
        if (query.granularity) {
          const g = query.granularity.trim().toLowerCase();
          if (g === "day" || g === "month") {
            granularity = g;
          } else {
            return {
              success: false,
              error: "Parâmetro 'granularity' inválido. Valores permitidos: 'day', 'month'.",
            };
          }
        }

        const records = await repository.findConfirmedCashRecords();

        const { totals, series } = aggregateCashFlowSeries(records, {
          granularity,
          from: fromStr,
          to: toStr,
        });

        const undated = aggregateUndatedConfirmedCash(records);

        return {
          success: true,
          data: {
            from: fromStr,
            to: toStr,
            granularity,
            totals,
            series,
            undated,
          },
        };
      } catch (err: unknown) {
        return {
          success: false,
          error:
            err instanceof Error
              ? err.message
              : "Erro ao gerar fluxo de caixa realizado.",
        };
      }
    },

    async getUndatedConfirmedCash(): Promise<
      ServiceResult<UndatedConfirmedCashResponse>
    > {
      try {
        const records = await repository.findUndatedConfirmedCashRecords();
        const allConfirmed = await repository.findConfirmedCashRecords();
        const summary = aggregateUndatedConfirmedCash(allConfirmed);

        return {
          success: true,
          data: {
            summary,
            records,
          },
        };
      } catch (err: unknown) {
        return {
          success: false,
          error:
            err instanceof Error
              ? err.message
              : "Erro ao buscar caixa confirmado sem data.",
        };
      }
    },
  };
}
