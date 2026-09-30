import type { Prisma, PrismaClient } from "@prisma/client";
import type { NormalizedStockAdjustment } from "../../integrations/tagplus/stock-adjustments/stock-adjustment-normalizer.js";

export interface SaveStockAdjustmentResult {
  action: "inserted" | "updated" | "unchanged";
  id: string;
}

export interface CatalogUpsertResult {
  total: number;
  newlyDiscovered: number;
  alreadyKnown: number;
}

export interface StockAdjustmentSyncStats {
  syncItems: {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    notFound: number;
  };
  adjustments: {
    total: number;
    byType: Record<string, { count: number; totalAmount: number }>;
    sourcePresentTrue: number;
    sourcePresentFalse: number;
    hasInvoiceTrue: number;
    hasInvoiceFalse: number;
  };
  items: {
    total: number;
  };
  financialLinks: {
    total: number;
    linkedToFinancialRecord: number;
    unlinked: number;
    sourcePresentTrue: number;
    sourcePresentFalse: number;
  };
}

export interface StockAdjustmentRepository {
  upsertCatalogItems(
    connectionId: string,
    sourceIds: string[],
    catalogSeenAt?: Date,
  ): Promise<CatalogUpsertResult>;

  claimNextPendingItem(
    connectionId: string,
    options?: {
      specificSourceId?: string | undefined;
      staleMinutes?: number | undefined;
      now?: Date | undefined;
    } | undefined,
  ): Promise<{ sourceId: string; attemptCount: number } | null>;

  saveStockAdjustment(
    connectionId: string,
    record: NormalizedStockAdjustment,
    now?: Date,
  ): Promise<SaveStockAdjustmentResult>;

  saveStockAdjustmentWithTx(
    tx: Prisma.TransactionClient,
    connectionId: string,
    record: NormalizedStockAdjustment,
    now?: Date,
  ): Promise<SaveStockAdjustmentResult>;

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
  ): Promise<void>;

  reconcileGlobalPresence(
    connectionId: string,
    catalogSeenSince: Date,
    now?: Date,
  ): Promise<number>;

  getStats(connectionId: string): Promise<StockAdjustmentSyncStats>;
}

export function createStockAdjustmentRepository(
  prisma: PrismaClient,
): StockAdjustmentRepository {
  function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null || a === undefined || b === undefined) return a === b;
    if (typeof a !== "object" || typeof b !== "object") return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!deepEqual(a[i], b[i])) return false;
      }
      return true;
    }
    const keysA = Object.keys(a as object);
    const keysB = Object.keys(b as object);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
    }
    return true;
  }

  function hasChanges(
    existing: Record<string, unknown>,
    incoming: NormalizedStockAdjustment,
  ): boolean {
    if (existing.number !== incoming.number) return true;
    if (existing.externalCode !== incoming.externalCode) return true;
    if (existing.type !== incoming.type) return true;
    if (existing.status !== incoming.status) return true;
    if (existing.entitySourceId !== incoming.entitySourceId) return true;
    if (existing.entityName !== incoming.entityName) return true;
    if (existing.entityCpf !== incoming.entityCpf) return true;
    if (existing.entityCnpj !== incoming.entityCnpj) return true;

    const existingCreatedAt = existing.sourceCreatedAt instanceof Date ? existing.sourceCreatedAt.getTime() : null;
    const incomingCreatedAt = incoming.sourceCreatedAt instanceof Date ? incoming.sourceCreatedAt.getTime() : null;
    if (existingCreatedAt !== incomingCreatedAt) return true;

    const existingUpdatedAt = existing.sourceUpdatedAt instanceof Date ? existing.sourceUpdatedAt.getTime() : null;
    const incomingUpdatedAt = incoming.sourceUpdatedAt instanceof Date ? incoming.sourceUpdatedAt.getTime() : null;
    if (existingUpdatedAt !== incomingUpdatedAt) return true;

    const existingConfDate = existing.confirmationDate instanceof Date ? existing.confirmationDate.getTime() : null;
    const incomingConfDate = incoming.confirmationDate instanceof Date ? incoming.confirmationDate.getTime() : null;
    if (existingConfDate !== incomingConfDate) return true;

    if (existing.notes !== incoming.notes) return true;
    if (existing.employeeSourceId !== incoming.employeeSourceId) return true;
    if (existing.employeeName !== incoming.employeeName) return true;

    if (Number(existing.freightAmount) !== Number(incoming.freightAmount)) return true;
    if (Number(existing.otherAmount) !== Number(incoming.otherAmount)) return true;
    if (Number(existing.totalAmount) !== Number(incoming.totalAmount)) return true;
    if (existing.hasInvoice !== incoming.hasInvoice) return true;

    if (!deepEqual(existing.sourcePayload, incoming.sourcePayload)) return true;

    return false;
  }

  async function saveWithTx(
    tx: Prisma.TransactionClient,
    connectionId: string,
    record: NormalizedStockAdjustment,
    now: Date = new Date(),
  ): Promise<SaveStockAdjustmentResult> {
    const existing = await tx.stockAdjustment.findUnique({
      where: {
        connectionId_sourceId: {
          connectionId,
          sourceId: record.sourceId,
        },
      },
      include: {
        items: true,
        financialLinks: true,
      },
    });

    let action: "inserted" | "updated" | "unchanged" = "inserted";
    let adjustmentId: string;

    if (!existing) {
      action = "inserted";
      const created = await tx.stockAdjustment.create({
        data: {
          connectionId,
          sourceId: record.sourceId,
          number: record.number,
          externalCode: record.externalCode,
          type: record.type,
          status: record.status,
          entitySourceId: record.entitySourceId,
          entityName: record.entityName,
          entityCpf: record.entityCpf,
          entityCnpj: record.entityCnpj,
          sourceCreatedAt: record.sourceCreatedAt,
          sourceUpdatedAt: record.sourceUpdatedAt,
          confirmationDate: record.confirmationDate,
          notes: record.notes,
          employeeSourceId: record.employeeSourceId,
          employeeName: record.employeeName,
          freightAmount: record.freightAmount,
          otherAmount: record.otherAmount,
          totalAmount: record.totalAmount,
          hasInvoice: record.hasInvoice,
          sourcePayload: record.sourcePayload as Prisma.InputJsonValue,
          sourcePresent: true,
          lastSeenAt: now,
        },
      });
      adjustmentId = created.id;
    } else {
      adjustmentId = existing.id;
      const changed = hasChanges(existing, record);

      if (changed || !existing.sourcePresent) {
        action = "updated";
        await tx.stockAdjustment.update({
          where: { id: existing.id },
          data: {
            number: record.number,
            externalCode: record.externalCode,
            type: record.type,
            status: record.status,
            entitySourceId: record.entitySourceId,
            entityName: record.entityName,
            entityCpf: record.entityCpf,
            entityCnpj: record.entityCnpj,
            sourceCreatedAt: record.sourceCreatedAt,
            sourceUpdatedAt: record.sourceUpdatedAt,
            confirmationDate: record.confirmationDate,
            notes: record.notes,
            employeeSourceId: record.employeeSourceId,
            employeeName: record.employeeName,
            freightAmount: record.freightAmount,
            otherAmount: record.otherAmount,
            totalAmount: record.totalAmount,
            hasInvoice: record.hasInvoice,
            sourcePayload: record.sourcePayload as Prisma.InputJsonValue,
            sourcePresent: true,
            lastSeenAt: now,
          },
        });
      } else {
        action = "unchanged";
        await tx.stockAdjustment.update({
          where: { id: existing.id },
          data: {
            lastSeenAt: now,
            sourcePresent: true,
          },
        });
      }
    }

    // Persist items
    for (const item of record.items) {
      await tx.stockAdjustmentItem.upsert({
        where: {
          stockAdjustmentId_sourceItemId: {
            stockAdjustmentId: adjustmentId,
            sourceItemId: item.sourceItemId,
          },
        },
        create: {
          stockAdjustmentId: adjustmentId,
          sourceItemId: item.sourceItemId,
          itemNumber: item.itemNumber,
          productSourceId: item.productSourceId,
          productCode: item.productCode,
          productDescription: item.productDescription,
          quantity: item.quantity,
          outputUnit: item.outputUnit,
          unitAmount: item.unitAmount,
          surchargeAmount: item.surchargeAmount,
          discountAmount: item.discountAmount,
          subtotalAmount: item.subtotalAmount,
          cfop: item.cfop,
          details: item.details,
          unitType: item.unitType,
          remainingUnit: item.remainingUnit,
          categorySourceId: item.categorySourceId,
          categoryDescription: item.categoryDescription,
        },
        update: {
          itemNumber: item.itemNumber,
          productSourceId: item.productSourceId,
          productCode: item.productCode,
          productDescription: item.productDescription,
          quantity: item.quantity,
          outputUnit: item.outputUnit,
          unitAmount: item.unitAmount,
          surchargeAmount: item.surchargeAmount,
          discountAmount: item.discountAmount,
          subtotalAmount: item.subtotalAmount,
          cfop: item.cfop,
          details: item.details,
          unitType: item.unitType,
          remainingUnit: item.remainingUnit,
          categorySourceId: item.categorySourceId,
          categoryDescription: item.categoryDescription,
        },
      });
    }

    // Persist financial links
    const incomingLinkSourceIds = new Set(record.financialLinks.map((l) => l.financialRecordSourceId));

    for (const link of record.financialLinks) {
      // Find corresponding financial record if present
      const fr = await tx.financialRecord.findUnique({
        where: {
          connectionId_sourceId: {
            connectionId,
            sourceId: link.financialRecordSourceId,
          },
        },
        select: { id: true },
      });

      await tx.stockAdjustmentFinancialLink.upsert({
        where: {
          stockAdjustmentId_financialRecordSourceId: {
            stockAdjustmentId: adjustmentId,
            financialRecordSourceId: link.financialRecordSourceId,
          },
        },
        create: {
          stockAdjustmentId: adjustmentId,
          financialRecordSourceId: link.financialRecordSourceId,
          financialRecordId: fr?.id ?? null,
          invoiceNumber: link.invoiceNumber,
          installmentNumber: link.installmentNumber,
          firstSeenAt: now,
          lastSeenAt: now,
          sourcePresent: true,
        },
        update: {
          financialRecordId: fr?.id ?? null,
          invoiceNumber: link.invoiceNumber,
          installmentNumber: link.installmentNumber,
          lastSeenAt: now,
          sourcePresent: true,
        },
      });
    }

    // If an existing link is no longer in the payload, preserve with sourcePresent = false (Requirement 7)
    if (existing && existing.financialLinks.length > 0) {
      for (const exLink of existing.financialLinks) {
        if (!incomingLinkSourceIds.has(exLink.financialRecordSourceId) && exLink.sourcePresent) {
          await tx.stockAdjustmentFinancialLink.update({
            where: { id: exLink.id },
            data: { sourcePresent: false },
          });
        }
      }
    }

    return { action, id: adjustmentId };
  }

  return {
    async upsertCatalogItems(
      connectionId: string,
      sourceIds: string[],
      catalogSeenAt: Date = new Date(),
    ): Promise<CatalogUpsertResult> {
      let newlyDiscovered = 0;
      let alreadyKnown = 0;

      for (const sourceId of sourceIds) {
        const existing = await prisma.stockAdjustmentSyncItem.findUnique({
          where: {
            connectionId_sourceId: { connectionId, sourceId },
          },
          select: { status: true },
        });

        if (!existing) {
          newlyDiscovered++;
          await prisma.stockAdjustmentSyncItem.create({
            data: {
              connectionId,
              sourceId,
              status: "PENDING",
              catalogSeenAt,
            },
          });
        } else {
          alreadyKnown++;
          await prisma.stockAdjustmentSyncItem.update({
            where: {
              connectionId_sourceId: { connectionId, sourceId },
            },
            data: {
              catalogSeenAt,
            },
          });
        }
      }

      return {
        total: sourceIds.length,
        newlyDiscovered,
        alreadyKnown,
      };
    },

    async claimNextPendingItem(
      connectionId: string,
      options: {
        specificSourceId?: string | undefined;
        staleMinutes?: number | undefined;
        now?: Date | undefined;
      } = {},
    ): Promise<{ sourceId: string; attemptCount: number } | null> {
      const now = options.now ?? new Date();
      const staleMinutes = options.staleMinutes ?? 15;
      const staleThreshold = new Date(now.getTime() - staleMinutes * 60 * 1000);

      const whereClause: Prisma.StockAdjustmentSyncItemWhereInput = options.specificSourceId
        ? {
            connectionId,
            sourceId: options.specificSourceId,
          }
        : {
            connectionId,
            OR: [
              { status: "PENDING" },
              {
                status: "PROCESSING",
                updatedAt: { lt: staleThreshold },
              },
            ],
          };

      const candidate = await prisma.stockAdjustmentSyncItem.findFirst({
        where: whereClause,
        orderBy: [{ attemptCount: "asc" }, { createdAt: "asc" }],
        select: { id: true, sourceId: true, attemptCount: true },
      });

      if (!candidate) return null;

      const updated = await prisma.stockAdjustmentSyncItem.updateMany({
        where: {
          id: candidate.id,
          status: { in: ["PENDING", "PROCESSING", "FAILED"] },
        },
        data: {
          status: "PROCESSING",
          attemptCount: { increment: 1 },
          lastAttemptAt: now,
        },
      });

      if (updated.count === 0) return null;

      return {
        sourceId: candidate.sourceId,
        attemptCount: candidate.attemptCount + 1,
      };
    },

    async saveStockAdjustment(
      connectionId: string,
      record: NormalizedStockAdjustment,
      now: Date = new Date(),
    ): Promise<SaveStockAdjustmentResult> {
      return prisma.$transaction((tx) => saveWithTx(tx, connectionId, record, now));
    },

    async saveStockAdjustmentWithTx(
      tx: Prisma.TransactionClient,
      connectionId: string,
      record: NormalizedStockAdjustment,
      now: Date = new Date(),
    ): Promise<SaveStockAdjustmentResult> {
      return saveWithTx(tx, connectionId, record, now);
    },

    async markItemCompleted(
      connectionId: string,
      sourceId: string,
      completedAt: Date = new Date(),
    ): Promise<void> {
      await prisma.stockAdjustmentSyncItem.update({
        where: {
          connectionId_sourceId: { connectionId, sourceId },
        },
        data: {
          status: "COMPLETED",
          completedAt,
        },
      });
    },

    async markItemCompletedWithTx(
      tx: Prisma.TransactionClient,
      connectionId: string,
      sourceId: string,
      completedAt: Date = new Date(),
    ): Promise<void> {
      await tx.stockAdjustmentSyncItem.update({
        where: {
          connectionId_sourceId: { connectionId, sourceId },
        },
        data: {
          status: "COMPLETED",
          completedAt,
        },
      });
    },

    async markItemFailed(
      connectionId: string,
      sourceId: string,
      error: string,
      httpStatus?: number,
    ): Promise<void> {
      await prisma.stockAdjustmentSyncItem.update({
        where: {
          connectionId_sourceId: { connectionId, sourceId },
        },
        data: {
          status: "FAILED",
          lastError: error,
          lastHttpStatus: httpStatus ?? null,
        },
      });
    },

    async markItemNotFound(
      connectionId: string,
      sourceId: string,
    ): Promise<void> {
      await prisma.stockAdjustmentSyncItem.update({
        where: {
          connectionId_sourceId: { connectionId, sourceId },
        },
        data: {
          status: "NOT_FOUND",
          lastHttpStatus: 404,
        },
      });
    },

    async reconcileGlobalPresence(
      connectionId: string,
      catalogSeenSince: Date,
      now: Date = new Date(),
    ): Promise<number> {
      const result = await prisma.stockAdjustment.updateMany({
        where: {
          connectionId,
          sourcePresent: true,
          lastSeenAt: { lt: catalogSeenSince },
        },
        data: {
          sourcePresent: false,
          noLongerObservedAt: now,
        },
      });
      return result.count;
    },

    async getStats(connectionId: string): Promise<StockAdjustmentSyncStats> {
      const syncItems = await prisma.stockAdjustmentSyncItem.groupBy({
        by: ["status"],
        where: { connectionId },
        _count: true,
      });

      const syncStats = {
        total: 0,
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        notFound: 0,
      };

      for (const item of syncItems) {
        syncStats.total += item._count;
        if (item.status === "PENDING") syncStats.pending = item._count;
        else if (item.status === "PROCESSING") syncStats.processing = item._count;
        else if (item.status === "COMPLETED") syncStats.completed = item._count;
        else if (item.status === "FAILED") syncStats.failed = item._count;
        else if (item.status === "NOT_FOUND") syncStats.notFound = item._count;
      }

      const adjustmentsByType = await prisma.stockAdjustment.groupBy({
        by: ["type"],
        where: { connectionId },
        _count: true,
        _sum: { totalAmount: true },
      });

      const byType: Record<string, { count: number; totalAmount: number }> = {};
      let totalAdjustments = 0;
      for (const t of adjustmentsByType) {
        totalAdjustments += t._count;
        byType[t.type] = {
          count: t._count,
          totalAmount: Number(t._sum.totalAmount ?? 0),
        };
      }

      const sourcePresentTrue = await prisma.stockAdjustment.count({
        where: { connectionId, sourcePresent: true },
      });
      const sourcePresentFalse = await prisma.stockAdjustment.count({
        where: { connectionId, sourcePresent: false },
      });

      const hasInvoiceTrue = await prisma.stockAdjustment.count({
        where: { connectionId, hasInvoice: true },
      });
      const hasInvoiceFalse = await prisma.stockAdjustment.count({
        where: { connectionId, hasInvoice: false },
      });

      const totalItems = await prisma.stockAdjustmentItem.count({
        where: {
          stockAdjustment: { connectionId },
        },
      });

      const totalLinks = await prisma.stockAdjustmentFinancialLink.count({
        where: {
          stockAdjustment: { connectionId },
        },
      });

      const linkedToFinancialRecord = await prisma.stockAdjustmentFinancialLink.count({
        where: {
          stockAdjustment: { connectionId },
          financialRecordId: { not: null },
        },
      });

      const unlinked = totalLinks - linkedToFinancialRecord;

      const linksPresentTrue = await prisma.stockAdjustmentFinancialLink.count({
        where: {
          stockAdjustment: { connectionId },
          sourcePresent: true,
        },
      });

      const linksPresentFalse = await prisma.stockAdjustmentFinancialLink.count({
        where: {
          stockAdjustment: { connectionId },
          sourcePresent: false,
        },
      });

      return {
        syncItems: syncStats,
        adjustments: {
          total: totalAdjustments,
          byType,
          sourcePresentTrue,
          sourcePresentFalse,
          hasInvoiceTrue,
          hasInvoiceFalse,
        },
        items: {
          total: totalItems,
        },
        financialLinks: {
          total: totalLinks,
          linkedToFinancialRecord,
          unlinked,
          sourcePresentTrue: linksPresentTrue,
          sourcePresentFalse: linksPresentFalse,
        },
      };
    },
  };
}
