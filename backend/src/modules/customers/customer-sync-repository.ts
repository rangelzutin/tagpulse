import type { CustomerSyncRun, PrismaClient } from "@prisma/client";

export interface CustomerSyncProgress {
  pagesFetched?: number;
  recordsFetched?: number;
  recordsInserted?: number;
  recordsUpdated?: number;
  recordsUnchanged?: number;
  lastCompletedPage?: number;
  terminalEmptyPage?: number;
}

export interface CustomerSyncRepository {
  findRunning(connectionId: string): Promise<{ id: string } | null>;
  createRun(connectionId: string, startedAt: Date): Promise<CustomerSyncRun>;
  updateProgress(runId: string, progress: CustomerSyncProgress): Promise<void>;
  reconcileMissing(connectionId: string, runId: string): Promise<number>;
  completeRun(runId: string, completedAt: Date, missing: number): Promise<void>;
  failRun(runId: string, completedAt: Date, category: string): Promise<void>;
}

export function createCustomerSyncRepository(
  prisma: PrismaClient,
): CustomerSyncRepository {
  return {
    findRunning: (connectionId) =>
      prisma.customerSyncRun.findFirst({
        where: { connectionId, status: "RUNNING" },
        select: { id: true },
      }),
    createRun: (connectionId, startedAt) =>
      prisma.customerSyncRun.create({
        data: { connectionId, status: "RUNNING", startedAt },
      }),
    async updateProgress(runId, progress) {
      await prisma.customerSyncRun.update({
        where: { id: runId },
        data: progress,
      });
    },
    async reconcileMissing(connectionId, runId) {
      const result = await prisma.customer.updateMany({
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
      await prisma.customerSyncRun.update({
        where: { id: runId },
        data: {
          status: "COMPLETED",
          completedAt,
          recordsNoLongerObserved: missing,
        },
      });
    },
    async failRun(runId, completedAt, category) {
      await prisma.customerSyncRun.update({
        where: { id: runId },
        data: { status: "FAILED", completedAt, errorCategory: category },
      });
    },
  };
}
