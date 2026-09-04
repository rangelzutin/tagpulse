import type { PrismaClient, ProductSyncRun } from "@prisma/client";

export interface ProductSyncProgress {
  pagesFetched?: number;
  recordsFetched?: number;
  recordsInserted?: number;
  recordsUpdated?: number;
  recordsUnchanged?: number;
  lastCompletedPage?: number;
  terminalEmptyPage?: number;
}

export interface ProductSyncRepository {
  findRunning(connectionId: string): Promise<{ id: string } | null>;
  createRun(connectionId: string, startedAt: Date): Promise<ProductSyncRun>;
  updateProgress(runId: string, progress: ProductSyncProgress): Promise<void>;
  reconcileMissing(connectionId: string, runId: string): Promise<number>;
  completeRun(runId: string, completedAt: Date, missing: number): Promise<void>;
  failRun(runId: string, completedAt: Date, category: string): Promise<void>;
}

export function createProductSyncRepository(
  prisma: PrismaClient,
): ProductSyncRepository {
  return {
    findRunning: (connectionId) =>
      prisma.productSyncRun.findFirst({
        where: { connectionId, status: "RUNNING" },
        select: { id: true },
      }),
    createRun: (connectionId, startedAt) =>
      prisma.productSyncRun.create({
        data: { connectionId, status: "RUNNING", startedAt },
      }),
    async updateProgress(runId, progress) {
      await prisma.productSyncRun.update({
        where: { id: runId },
        data: progress,
      });
    },
    async reconcileMissing(connectionId, runId) {
      const result = await prisma.product.updateMany({
        where: {
          connectionId,
          sourcePresent: true,
          OR: [
            { lastSeenSyncRunId: null },
            { lastSeenSyncRunId: { not: runId } },
          ],
        },
        data: { sourcePresent: false },
      });
      return result.count;
    },
    async completeRun(runId, completedAt, missing) {
      await prisma.productSyncRun.update({
        where: { id: runId },
        data: {
          status: "COMPLETED",
          completedAt,
          recordsNoLongerObserved: missing,
        },
      });
    },
    async failRun(runId, completedAt, category) {
      await prisma.productSyncRun.update({
        where: { id: runId },
        data: { status: "FAILED", completedAt, errorCategory: category },
      });
    },
  };
}
