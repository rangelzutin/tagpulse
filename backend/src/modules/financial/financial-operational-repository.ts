import { Prisma, type FinancialRecordType, type PrismaClient } from "@prisma/client";
import type {
  ExcludedNonCashStockAdjustmentsSummary,
  FinancialListQueryParams,
  PaginatedResult,
  PayablesListItem,
  ReceivablesListItem,
  UndatedConfirmedCashRecordItem,
} from "./financial-operational-types.js";
import {
  calculateEffectiveCashAmount,
  deriveOperationalStatus,
} from "./financial-operational-calculator.js";

export interface OperationalSummaryDbRecord {
  dueDate: Date;
  totalAmount: Prisma.Decimal | null;
  isConfirmed: boolean;
}

export interface ConfirmedCashDbRecord {
  sourceId: string;
  type: FinancialRecordType;
  confirmationDate: Date | null;
  paidAmount: Prisma.Decimal | null;
  totalAmount: Prisma.Decimal | null;
  isConfirmed: boolean;
  isTransfer: boolean;
  sourcePresent: boolean;
}

export interface FinancialOperationalRepository {
  findOpenRecordsForSummary(
    type: FinancialRecordType,
  ): Promise<OperationalSummaryDbRecord[]>;

  findReceivablesList(
    params: FinancialListQueryParams,
    referenceDate: string,
  ): Promise<PaginatedResult<ReceivablesListItem>>;

  findPayablesList(
    params: FinancialListQueryParams,
    referenceDate: string,
  ): Promise<PaginatedResult<PayablesListItem>>;

  findConfirmedCashRecords(options?: {
    fromDate?: Date | undefined;
    toExclusiveDate?: Date | undefined;
  }): Promise<ConfirmedCashDbRecord[]>;

  findUndatedConfirmedCashRecords(): Promise<UndatedConfirmedCashRecordItem[]>;

  findExcludedNonCashStockAdjustmentSummary(options?: {
    fromDate?: Date | undefined;
    toExclusiveDate?: Date | undefined;
    from?: string | undefined;
    to?: string | undefined;
  }): Promise<ExcludedNonCashStockAdjustmentsSummary>;

  findBudgetPlanMap(sourceIds: string[]): Promise<Map<string, string>>;
}

export function createPrismaFinancialOperationalRepository(
  prisma: PrismaClient,
): FinancialOperationalRepository {
  function buildStatusWhere(
    status: string | undefined,
    referenceDate: string,
  ): Prisma.FinancialRecordWhereInput {
    const parts = referenceDate.split("-").map(Number);
    const y = parts[0]!;
    const m = parts[1]!;
    const d = parts[2]!;
    const refStart = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    const refEnd = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0));

    switch (status) {
      case "OVERDUE":
        return {
          isConfirmed: false,
          dueDate: { lt: refStart },
        };
      case "DUE_TODAY":
        return {
          isConfirmed: false,
          dueDate: { gte: refStart, lt: refEnd },
        };
      case "FUTURE":
        return {
          isConfirmed: false,
          dueDate: { gte: refEnd },
        };
      case "CONFIRMED":
        return {
          isConfirmed: true,
        };
      case "ALL":
        return {};
      case "OPEN":
      default:
        return {
          isConfirmed: false,
        };
    }
  }

  function buildDateFilter(
    from?: string,
    to?: string,
  ): Prisma.DateTimeFilter | undefined {
    if (!from && !to) return undefined;
    const filter: Prisma.DateTimeFilter = {};
    if (from) {
      const parts = from.split("-").map(Number);
      const y = parts[0]!;
      const m = parts[1]!;
      const d = parts[2]!;
      filter.gte = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    }
    if (to) {
      const parts = to.split("-").map(Number);
      const y = parts[0]!;
      const m = parts[1]!;
      const d = parts[2]!;
      filter.lt = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0));
    }
    return filter;
  }

  function buildSearchFilter(
    search?: string,
  ): Prisma.FinancialRecordWhereInput[] | undefined {
    if (!search || !search.trim()) return undefined;
    const trimmed = search.trim();
    return [
      { entityName: { contains: trimmed, mode: "insensitive" } },
      { description: { contains: trimmed, mode: "insensitive" } },
      { documentNumber: { contains: trimmed, mode: "insensitive" } },
      { sourceId: { contains: trimmed } },
    ];
  }

  function buildOrderBy(
    sort?: string,
  ): Prisma.FinancialRecordOrderByWithRelationInput {
    switch (sort) {
      case "dueDate_desc":
        return { dueDate: "desc" };
      case "totalAmount_asc":
        return { totalAmount: "asc" };
      case "totalAmount_desc":
        return { totalAmount: "desc" };
      case "confirmationDate_asc":
        return { confirmationDate: "asc" };
      case "confirmationDate_desc":
        return { confirmationDate: "desc" };
      case "dueDate_asc":
      default:
        return { dueDate: "asc" };
    }
  }

  return {
    async findOpenRecordsForSummary(
      type: FinancialRecordType,
    ): Promise<OperationalSummaryDbRecord[]> {
      const rows = await prisma.financialRecord.findMany({
        where: {
          type,
          isTransfer: false,
          sourcePresent: true,
          isConfirmed: false,
        },
        select: {
          dueDate: true,
          totalAmount: true,
          isConfirmed: true,
        },
      });
      return rows;
    },

    async findReceivablesList(
      params: FinancialListQueryParams,
      referenceDate: string,
    ): Promise<PaginatedResult<ReceivablesListItem>> {
      const page = Math.max(1, Number(params.page) || 1);
      const pageSize = Math.min(200, Math.max(1, Number(params.pageSize) || 50));
      const skip = (page - 1) * pageSize;

      const statusWhere = buildStatusWhere(params.status, referenceDate);
      const dueDateWhere = buildDateFilter(
        params.dueDateFrom,
        params.dueDateTo,
      );
      const confirmationDateWhere = buildDateFilter(
        params.confirmationDateFrom,
        params.confirmationDateTo,
      );
      const searchOR = buildSearchFilter(params.search);

      const where: Prisma.FinancialRecordWhereInput = {
        type: "ENTRADA",
        isTransfer: false,
        sourcePresent: true,
        ...statusWhere,
        ...(dueDateWhere ? { dueDate: dueDateWhere } : {}),
        ...(confirmationDateWhere ? { confirmationDate: confirmationDateWhere } : {}),
        ...(searchOR ? { OR: searchOR } : {}),
      };

      const [total, rows] = await Promise.all([
        prisma.financialRecord.count({ where }),
        prisma.financialRecord.findMany({
          where,
          select: {
            sourceId: true,
            description: true,
            documentNumber: true,
            entitySourceId: true,
            entityName: true,
            dueDate: true,
            confirmationDate: true,
            totalAmount: true,
            paidAmount: true,
            isConfirmed: true,
            installmentNumber: true,
            installmentCount: true,
            paymentMethodSourceId: true,
            budgetPlanSourceId: true,
          },
          orderBy: buildOrderBy(params.sort),
          skip,
          take: pageSize,
        }),
      ]);

      const items: ReceivablesListItem[] = rows.map((row) => {
        let effCash: number | null = null;
        if (row.isConfirmed) {
          try {
            effCash = Number(calculateEffectiveCashAmount(row).toFixed(2));
          } catch {
            effCash = null;
          }
        }

        return {
          sourceId: row.sourceId,
          description: row.description,
          documentNumber: row.documentNumber,
          entitySourceId: row.entitySourceId,
          entityName: row.entityName,
          dueDate: row.dueDate.toISOString().slice(0, 10),
          confirmationDate: row.confirmationDate
            ? row.confirmationDate.toISOString().slice(0, 10)
            : null,
          totalAmount: Number(Number(row.totalAmount ?? 0).toFixed(2)),
          effectiveCashAmount: effCash,
          status: deriveOperationalStatus(row, referenceDate),
          installmentNumber: row.installmentNumber,
          installmentCount: row.installmentCount,
          paymentMethodSourceId: row.paymentMethodSourceId,
          budgetPlanSourceId: row.budgetPlanSourceId,
        };
      });

      return {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    },

    async findPayablesList(
      params: FinancialListQueryParams,
      referenceDate: string,
    ): Promise<PaginatedResult<PayablesListItem>> {
      const page = Math.max(1, Number(params.page) || 1);
      const pageSize = Math.min(200, Math.max(1, Number(params.pageSize) || 50));
      const skip = (page - 1) * pageSize;

      const statusWhere = buildStatusWhere(params.status, referenceDate);
      const dueDateWhere = buildDateFilter(
        params.dueDateFrom,
        params.dueDateTo,
      );
      const confirmationDateWhere = buildDateFilter(
        params.confirmationDateFrom,
        params.confirmationDateTo,
      );
      const searchOR = buildSearchFilter(params.search);

      const where: Prisma.FinancialRecordWhereInput = {
        type: "SAIDA",
        isTransfer: false,
        sourcePresent: true,
        ...statusWhere,
        ...(dueDateWhere ? { dueDate: dueDateWhere } : {}),
        ...(confirmationDateWhere ? { confirmationDate: confirmationDateWhere } : {}),
        ...(searchOR ? { OR: searchOR } : {}),
      };

      const [total, rows] = await Promise.all([
        prisma.financialRecord.count({ where }),
        prisma.financialRecord.findMany({
          where,
          select: {
            sourceId: true,
            description: true,
            documentNumber: true,
            entitySourceId: true,
            entityName: true,
            dueDate: true,
            confirmationDate: true,
            totalAmount: true,
            paidAmount: true,
            isConfirmed: true,
            budgetPlanSourceId: true,
            paymentMethodSourceId: true,
            departmentSourceId: true,
            installmentNumber: true,
            installmentCount: true,
          },
          orderBy: buildOrderBy(params.sort),
          skip,
          take: pageSize,
        }),
      ]);

      // Batch fetch budget plan descriptions
      const budgetSourceIds = Array.from(
        new Set(
          rows
            .map((r) => r.budgetPlanSourceId)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      const budgetMap = await this.findBudgetPlanMap(budgetSourceIds);

      const items: PayablesListItem[] = rows.map((row) => {
        let effCash: number | null = null;
        if (row.isConfirmed) {
          try {
            effCash = Number(calculateEffectiveCashAmount(row).toFixed(2));
          } catch {
            effCash = null;
          }
        }

        return {
          sourceId: row.sourceId,
          description: row.description,
          documentNumber: row.documentNumber,
          entitySourceId: row.entitySourceId,
          entityName: row.entityName,
          dueDate: row.dueDate.toISOString().slice(0, 10),
          confirmationDate: row.confirmationDate
            ? row.confirmationDate.toISOString().slice(0, 10)
            : null,
          totalAmount: Number(Number(row.totalAmount ?? 0).toFixed(2)),
          effectiveCashAmount: effCash,
          status: deriveOperationalStatus(row, referenceDate),
          budgetPlanSourceId: row.budgetPlanSourceId,
          budgetPlanDescription: row.budgetPlanSourceId
            ? budgetMap.get(row.budgetPlanSourceId) ?? null
            : null,
          paymentMethodSourceId: row.paymentMethodSourceId,
          departmentSourceId: row.departmentSourceId,
          installmentNumber: row.installmentNumber,
          installmentCount: row.installmentCount,
          installments: {
            number: row.installmentNumber,
            count: row.installmentCount,
          },
        };
      });

      return {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    },

    async findConfirmedCashRecords(options?: {
      fromDate?: Date;
      toExclusiveDate?: Date;
    }): Promise<ConfirmedCashDbRecord[]> {
      const where: Prisma.FinancialRecordWhereInput = {
        isConfirmed: true,
        isTransfer: false,
        sourcePresent: true,
        NOT: {
          type: "SAIDA",
          stockAdjustmentFinancialLinks: {
            some: {
              stockAdjustment: {
                type: "S",
              },
            },
          },
        },
      };

      if (options?.fromDate || options?.toExclusiveDate) {
        where.confirmationDate = {
          ...(options.fromDate ? { gte: options.fromDate } : {}),
          ...(options.toExclusiveDate ? { lt: options.toExclusiveDate } : {}),
        };
      }

      return prisma.financialRecord.findMany({
        where,
        select: {
          sourceId: true,
          type: true,
          confirmationDate: true,
          paidAmount: true,
          totalAmount: true,
          isConfirmed: true,
          isTransfer: true,
          sourcePresent: true,
        },
      });
    },

    async findUndatedConfirmedCashRecords(): Promise<
      UndatedConfirmedCashRecordItem[]
    > {
      const rows = await prisma.financialRecord.findMany({
        where: {
          isConfirmed: true,
          confirmationDate: null,
          isTransfer: false,
          sourcePresent: true,
          NOT: {
            type: "SAIDA",
            stockAdjustmentFinancialLinks: {
              some: {
                stockAdjustment: {
                  type: "S",
                },
              },
            },
          },
        },
        select: {
          sourceId: true,
          type: true,
          description: true,
          documentNumber: true,
          entityName: true,
          dueDate: true,
          totalAmount: true,
          paidAmount: true,
          isConfirmed: true,
        },
        orderBy: { dueDate: "asc" },
      });

      return rows.map((row) => ({
        sourceId: row.sourceId,
        type: row.type,
        description: row.description,
        documentNumber: row.documentNumber,
        entityName: row.entityName,
        dueDate: row.dueDate.toISOString().slice(0, 10),
        totalAmount: Number(Number(row.totalAmount ?? 0).toFixed(2)),
        effectiveCashAmount: Number(calculateEffectiveCashAmount(row).toFixed(2)),
        paidAmount: row.paidAmount != null ? Number(row.paidAmount) : null,
      }));
    },

    async findExcludedNonCashStockAdjustmentSummary(options?: {
      fromDate?: Date | undefined;
      toExclusiveDate?: Date | undefined;
      from?: string | undefined;
      to?: string | undefined;
    }): Promise<ExcludedNonCashStockAdjustmentsSummary> {
      const where: Prisma.FinancialRecordWhereInput = {
        type: "SAIDA",
        isConfirmed: true,
        isTransfer: false,
        sourcePresent: true,
        stockAdjustmentFinancialLinks: {
          some: {
            stockAdjustment: {
              type: "S",
            },
          },
        },
      };

      if (options?.from || options?.to) {
        const dateFilter = buildDateFilter(options.from, options.to);
        if (dateFilter) {
          where.confirmationDate = dateFilter;
        }
      } else if (options?.fromDate || options?.toExclusiveDate) {
        where.confirmationDate = {
          ...(options.fromDate ? { gte: options.fromDate } : {}),
          ...(options.toExclusiveDate ? { lt: options.toExclusiveDate } : {}),
        };
      }

      const rows = await prisma.financialRecord.findMany({
        where,
        select: {
          paidAmount: true,
          totalAmount: true,
          isConfirmed: true,
        },
      });

      let totalAmount = new Prisma.Decimal(0);
      for (const row of rows) {
        totalAmount = totalAmount.plus(calculateEffectiveCashAmount(row));
      }

      return {
        count: rows.length,
        amount: Number(totalAmount.toFixed(2)),
      };
    },

    async findBudgetPlanMap(sourceIds: string[]): Promise<Map<string, string>> {
      if (sourceIds.length === 0) return new Map();
      const plans = await prisma.financialBudgetPlan.findMany({
        where: { sourceId: { in: sourceIds } },
        select: { sourceId: true, description: true },
      });
      const map = new Map<string, string>();
      for (const p of plans) {
        map.set(p.sourceId, p.description);
      }
      return map;
    },
  };
}
