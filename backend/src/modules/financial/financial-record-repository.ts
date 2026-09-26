import { Prisma, type PrismaClient } from "@prisma/client";
import type { NormalizedFinancialRecord } from "../../integrations/tagplus/financial/financial-record-normalizer.js";

export interface SaveFinancialRecordResult {
  action: "inserted" | "updated" | "unchanged";
  id: string;
}

export interface CatalogUpsertResult {
  total: number;
  newlyDiscovered: number;
  alreadyKnown: number;
}

export interface FinancialSyncStats {
  syncItems: {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    notFound: number;
  };
  records: {
    total: number;
    entradas: number;
    saidas: number;
    confirmedTrue: number;
    confirmedFalse: number;
  };
}

export interface FinancialRecordRepository {
  saveFinancialRecord(
    connectionId: string,
    record: NormalizedFinancialRecord,
    now?: Date,
  ): Promise<SaveFinancialRecordResult>;

  saveFinancialRecordWithTx(
    tx: Prisma.TransactionClient,
    connectionId: string,
    record: NormalizedFinancialRecord,
    now?: Date,
  ): Promise<SaveFinancialRecordResult>;

  markUnobservedFinancialRecords(
    connectionId: string,
    observedSourceIds: Set<string>,
    now?: Date,
  ): Promise<number>;

  upsertCatalogItems(
    connectionId: string,
    sourceIds: string[],
    catalogSeenAt?: Date,
  ): Promise<CatalogUpsertResult>;

  claimNextPendingItem(
    connectionId: string,
    options?: { specificSourceId?: string; staleMinutes?: number; now?: Date },
  ): Promise<{ sourceId: string; attemptCount: number } | null>;

  markItemCompleted(
    connectionId: string,
    sourceId: string,
    completedAt?: Date,
  ): Promise<void>;

  markItemCompletedWithTx(
    tx: Prisma.TransactionClient,
    connectionId: string,
    sourceId: string,
    completedAt?: Date,
  ): Promise<void>;

  markItemFailed(
    connectionId: string,
    sourceId: string,
    error: string,
    httpStatus?: number,
  ): Promise<void>;

  markItemNotFound(
    connectionId: string,
    sourceId: string,
    httpStatus?: number,
  ): Promise<void>;

  resetFailedItems(connectionId: string): Promise<number>;

  getSyncStats(connectionId: string): Promise<FinancialSyncStats>;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a === Prisma.JsonNull && b == null) return true;
  if (b === Prisma.JsonNull && a == null) return true;
  if (a == null || b == null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const recordA = a as Record<string, unknown>;
  const recordB = b as Record<string, unknown>;
  const keysA = Object.keys(recordA);
  const keysB = Object.keys(recordB);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(recordB, key)) return false;
    if (!deepEqual(recordA[key], recordB[key])) return false;
  }
  return true;
}

function decimalEquals(
  a: Prisma.Decimal | null | undefined,
  b: Prisma.Decimal | null | undefined,
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return a.equals(b);
}

function dateEquals(
  a: Date | null | undefined,
  b: Date | null | undefined,
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return a.getTime() === b.getTime();
}

export function createFinancialRecordRepository(
  prisma: PrismaClient,
): FinancialRecordRepository {
  async function saveWithClient(
    client: Prisma.TransactionClient,
    connectionId: string,
    record: NormalizedFinancialRecord,
    now = new Date(),
  ): Promise<SaveFinancialRecordResult> {
    const existing = await client.financialRecord.findUnique({
      where: {
        connectionId_sourceId: {
          connectionId,
          sourceId: record.sourceId,
        },
      },
    });

    if (!existing) {
      const created = await client.financialRecord.create({
        data: {
          connectionId,
          sourceId: record.sourceId,
          type: record.type,
          isConfirmed: record.isConfirmed,
          isTransfer: record.isTransfer,
          description: record.description,
          documentNumber: record.documentNumber,
          linkedMovementNumber: record.linkedMovementNumber,
          dueDate: record.dueDate,
          confirmationDate: record.confirmationDate,
          sourceCompetenceDate: record.sourceCompetenceDate,
          postingDate: record.postingDate,
          sourceUpdatedAt: record.sourceUpdatedAt,
          originalAmount: record.originalAmount,
          grossAmount: record.grossAmount,
          paidAmount: record.paidAmount,
          totalAmount: record.totalAmount,
          discountAmount: record.discountAmount,
          surchargeAmount: record.surchargeAmount,
          lateInterestAmount: record.lateInterestAmount,
          dailyInterestRate: record.dailyInterestRate,
          installmentNumber: record.installmentNumber,
          installmentCount: record.installmentCount,
          budgetPlanSourceId: record.budgetPlanSourceId,
          bankAccountSourceId: record.bankAccountSourceId,
          paymentMethodSourceId: record.paymentMethodSourceId,
          departmentSourceId: record.departmentSourceId,
          entitySourceId: record.entitySourceId,
          entityType: record.entityType,
          entityName: record.entityName,
          linkedInvoiceInstallmentSourceId: record.linkedInvoiceInstallmentSourceId,
          sourcePayload: (record.sourcePayload as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          sourcePresent: true,
          noLongerObservedAt: null,
          lastSeenAt: now,
        },
        select: { id: true },
      });
      return { action: "inserted", id: created.id };
    }

    const hasChanges =
      existing.type !== record.type ||
      existing.isConfirmed !== record.isConfirmed ||
      existing.isTransfer !== record.isTransfer ||
      existing.description !== record.description ||
      existing.documentNumber !== record.documentNumber ||
      existing.linkedMovementNumber !== record.linkedMovementNumber ||
      !dateEquals(existing.dueDate, record.dueDate) ||
      !dateEquals(existing.confirmationDate, record.confirmationDate) ||
      !dateEquals(existing.sourceCompetenceDate, record.sourceCompetenceDate) ||
      !dateEquals(existing.postingDate, record.postingDate) ||
      !dateEquals(existing.sourceUpdatedAt, record.sourceUpdatedAt) ||
      !decimalEquals(existing.originalAmount, record.originalAmount) ||
      !decimalEquals(existing.grossAmount, record.grossAmount) ||
      !decimalEquals(existing.paidAmount, record.paidAmount) ||
      !decimalEquals(existing.totalAmount, record.totalAmount) ||
      !decimalEquals(existing.discountAmount, record.discountAmount) ||
      !decimalEquals(existing.surchargeAmount, record.surchargeAmount) ||
      !decimalEquals(existing.lateInterestAmount, record.lateInterestAmount) ||
      !decimalEquals(existing.dailyInterestRate, record.dailyInterestRate) ||
      existing.installmentNumber !== record.installmentNumber ||
      existing.installmentCount !== record.installmentCount ||
      existing.budgetPlanSourceId !== record.budgetPlanSourceId ||
      existing.bankAccountSourceId !== record.bankAccountSourceId ||
      existing.paymentMethodSourceId !== record.paymentMethodSourceId ||
      existing.departmentSourceId !== record.departmentSourceId ||
      existing.entitySourceId !== record.entitySourceId ||
      existing.entityType !== record.entityType ||
      existing.entityName !== record.entityName ||
      existing.linkedInvoiceInstallmentSourceId !== record.linkedInvoiceInstallmentSourceId ||
      existing.sourcePresent !== true ||
      existing.noLongerObservedAt !== null ||
      !deepEqual(existing.sourcePayload, record.sourcePayload);

    if (hasChanges) {
      await client.financialRecord.update({
        where: { id: existing.id },
        data: {
          type: record.type,
          isConfirmed: record.isConfirmed,
          isTransfer: record.isTransfer,
          description: record.description,
          documentNumber: record.documentNumber,
          linkedMovementNumber: record.linkedMovementNumber,
          dueDate: record.dueDate,
          confirmationDate: record.confirmationDate,
          sourceCompetenceDate: record.sourceCompetenceDate,
          postingDate: record.postingDate,
          sourceUpdatedAt: record.sourceUpdatedAt,
          originalAmount: record.originalAmount,
          grossAmount: record.grossAmount,
          paidAmount: record.paidAmount,
          totalAmount: record.totalAmount,
          discountAmount: record.discountAmount,
          surchargeAmount: record.surchargeAmount,
          lateInterestAmount: record.lateInterestAmount,
          dailyInterestRate: record.dailyInterestRate,
          installmentNumber: record.installmentNumber,
          installmentCount: record.installmentCount,
          budgetPlanSourceId: record.budgetPlanSourceId,
          bankAccountSourceId: record.bankAccountSourceId,
          paymentMethodSourceId: record.paymentMethodSourceId,
          departmentSourceId: record.departmentSourceId,
          entitySourceId: record.entitySourceId,
          entityType: record.entityType,
          entityName: record.entityName,
          linkedInvoiceInstallmentSourceId: record.linkedInvoiceInstallmentSourceId,
          sourcePayload: (record.sourcePayload as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          sourcePresent: true,
          noLongerObservedAt: null,
          lastSeenAt: now,
        },
      });
      return { action: "updated", id: existing.id };
    }

    await client.financialRecord.update({
      where: { id: existing.id },
      data: { lastSeenAt: now },
    });
    return { action: "unchanged", id: existing.id };
  }

  return {
    async saveFinancialRecord(connectionId, record, now = new Date()) {
      return saveWithClient(prisma, connectionId, record, now);
    },

    async saveFinancialRecordWithTx(tx, connectionId, record, now = new Date()) {
      return saveWithClient(tx, connectionId, record, now);
    },

    async markUnobservedFinancialRecords(connectionId, observedSourceIds, now = new Date()) {
      const recordsToMark = await prisma.financialRecord.findMany({
        where: {
          connectionId,
          sourcePresent: true,
          sourceId: { notIn: Array.from(observedSourceIds) },
        },
        select: { id: true },
      });

      if (recordsToMark.length === 0) return 0;

      await prisma.financialRecord.updateMany({
        where: {
          id: { in: recordsToMark.map((r) => r.id) },
        },
        data: {
          sourcePresent: false,
          noLongerObservedAt: now,
        },
      });

      return recordsToMark.length;
    },

    async upsertCatalogItems(connectionId, sourceIds, catalogSeenAt = new Date()) {
      const uniqueIds = Array.from(new Set(sourceIds.map((id) => String(id).trim())));
      let newlyDiscovered = 0;
      let alreadyKnown = 0;

      const BATCH_SIZE = 500;
      for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
        const batch = uniqueIds.slice(i, i + BATCH_SIZE);

        const existingItems = await prisma.financialRecordSyncItem.findMany({
          where: {
            connectionId,
            sourceId: { in: batch },
          },
          select: { sourceId: true },
        });

        const existingSet = new Set(existingItems.map((item) => item.sourceId));
        const newIds = batch.filter((id) => !existingSet.has(id));
        const knownIds = batch.filter((id) => existingSet.has(id));

        if (newIds.length > 0) {
          await prisma.financialRecordSyncItem.createMany({
            data: newIds.map((sourceId) => ({
              connectionId,
              sourceId,
              status: "PENDING",
              attemptCount: 0,
              catalogSeenAt,
            })),
            skipDuplicates: true,
          });
          newlyDiscovered += newIds.length;
        }

        if (knownIds.length > 0) {
          await prisma.financialRecordSyncItem.updateMany({
            where: {
              connectionId,
              sourceId: { in: knownIds },
            },
            data: {
              catalogSeenAt,
            },
          });
          alreadyKnown += knownIds.length;
        }
      }

      return {
        total: uniqueIds.length,
        newlyDiscovered,
        alreadyKnown,
      };
    },

    async claimNextPendingItem(connectionId, options = {}) {
      const now = options.now ?? new Date();
      const staleMinutes = options.staleMinutes ?? 15;
      const staleThreshold = new Date(now.getTime() - staleMinutes * 60 * 1000);

      // Reclaim stale processing items
      await prisma.financialRecordSyncItem.updateMany({
        where: {
          connectionId,
          status: "PROCESSING",
          lastAttemptAt: { lt: staleThreshold },
        },
        data: {
          status: "PENDING",
        },
      });

      // Claim target item
      if (options.specificSourceId) {
        const item = await prisma.financialRecordSyncItem.findUnique({
          where: {
            connectionId_sourceId: {
              connectionId,
              sourceId: options.specificSourceId,
            },
          },
        });
        if (!item) return null;

        await prisma.financialRecordSyncItem.update({
          where: { id: item.id },
          data: {
            status: "PROCESSING",
            lastAttemptAt: now,
            attemptCount: { increment: 1 },
          },
        });

        return { sourceId: item.sourceId, attemptCount: item.attemptCount + 1 };
      }

      // Claim first pending item (order by ascending numeric/lexical ID or creation)
      const nextPending = await prisma.financialRecordSyncItem.findFirst({
        where: {
          connectionId,
          status: "PENDING",
        },
        orderBy: [
          { catalogSeenAt: "asc" },
          { createdAt: "asc" },
        ],
      });

      if (!nextPending) return null;

      await prisma.financialRecordSyncItem.update({
        where: { id: nextPending.id },
        data: {
          status: "PROCESSING",
          lastAttemptAt: now,
          attemptCount: { increment: 1 },
        },
      });

      return { sourceId: nextPending.sourceId, attemptCount: nextPending.attemptCount + 1 };
    },

    async markItemCompleted(connectionId, sourceId, completedAt = new Date()) {
      await prisma.financialRecordSyncItem.update({
        where: {
          connectionId_sourceId: {
            connectionId,
            sourceId,
          },
        },
        data: {
          status: "COMPLETED",
          completedAt,
          lastError: null,
          lastHttpStatus: 200,
        },
      });
    },

    async markItemCompletedWithTx(tx, connectionId, sourceId, completedAt = new Date()) {
      await tx.financialRecordSyncItem.update({
        where: {
          connectionId_sourceId: {
            connectionId,
            sourceId,
          },
        },
        data: {
          status: "COMPLETED",
          completedAt,
          lastError: null,
          lastHttpStatus: 200,
        },
      });
    },

    async markItemFailed(connectionId, sourceId, error, httpStatus) {
      await prisma.financialRecordSyncItem.update({
        where: {
          connectionId_sourceId: {
            connectionId,
            sourceId,
          },
        },
        data: {
          status: "FAILED",
          lastError: error.slice(0, 1000),
          lastHttpStatus: httpStatus ?? null,
        },
      });
    },

    async markItemNotFound(connectionId, sourceId, httpStatus = 404) {
      await prisma.financialRecordSyncItem.update({
        where: {
          connectionId_sourceId: {
            connectionId,
            sourceId,
          },
        },
        data: {
          status: "NOT_FOUND",
          lastError: `Resource not found (${httpStatus})`,
          lastHttpStatus: httpStatus,
        },
      });
    },

    async resetFailedItems(connectionId) {
      const res = await prisma.financialRecordSyncItem.updateMany({
        where: {
          connectionId,
          status: "FAILED",
        },
        data: {
          status: "PENDING",
        },
      });
      return res.count;
    },

    async getSyncStats(connectionId) {
      const [
        totalSyncItems,
        pending,
        processing,
        completed,
        failed,
        notFound,
        totalRecords,
        entradas,
        saidas,
        confirmedTrue,
        confirmedFalse,
      ] = await Promise.all([
        prisma.financialRecordSyncItem.count({ where: { connectionId } }),
        prisma.financialRecordSyncItem.count({ where: { connectionId, status: "PENDING" } }),
        prisma.financialRecordSyncItem.count({ where: { connectionId, status: "PROCESSING" } }),
        prisma.financialRecordSyncItem.count({ where: { connectionId, status: "COMPLETED" } }),
        prisma.financialRecordSyncItem.count({ where: { connectionId, status: "FAILED" } }),
        prisma.financialRecordSyncItem.count({ where: { connectionId, status: "NOT_FOUND" } }),
        prisma.financialRecord.count({ where: { connectionId } }),
        prisma.financialRecord.count({ where: { connectionId, type: "ENTRADA" } }),
        prisma.financialRecord.count({ where: { connectionId, type: "SAIDA" } }),
        prisma.financialRecord.count({ where: { connectionId, isConfirmed: true } }),
        prisma.financialRecord.count({ where: { connectionId, isConfirmed: false } }),
      ]);

      return {
        syncItems: {
          total: totalSyncItems,
          pending,
          processing,
          completed,
          failed,
          notFound,
        },
        records: {
          total: totalRecords,
          entradas,
          saidas,
          confirmedTrue,
          confirmedFalse,
        },
      };
    },
  };
}
