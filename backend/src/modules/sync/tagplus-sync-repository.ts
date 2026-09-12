import type { PrismaClient, TagPlusSyncRun } from "@prisma/client";
import {
  TagPlusSyncMode,
  TagPlusSyncStage,
  TagPlusSyncStatus,
} from "@prisma/client";

export interface RecoverStaleRunsResult {
  tagplus: number;
  customers: number;
  products: number;
}

export interface TagPlusSyncRepository {
  /**
   * Premissa V1: Instância única de backend TagPulse.
   * Ao inicializar, qualquer execução marcada como RUNNING pertence a um processo
   * anterior encerrado de forma não limpa. Marca como FAILED/ABORTED liberando
   * os preflights e o estado do sistema para novas execuções.
   */
  recoverStaleRuns(): Promise<RecoverStaleRunsResult>;
  findRunning(connectionId?: string): Promise<TagPlusSyncRun | null>;
  findActiveRun(): Promise<TagPlusSyncRun | null>;
  findLastCompleted(connectionId?: string): Promise<TagPlusSyncRun | null>;
  findLastCompletedIncremental(connectionId: string): Promise<TagPlusSyncRun | null>;
  findLastCompletedFull(connectionId: string): Promise<TagPlusSyncRun | null>;
  getRunById(runId: string): Promise<TagPlusSyncRun | null>;
  createRun(
    connectionId: string,
    startedAt?: Date,
    mode?: TagPlusSyncMode,
    window?: { since?: Date | null; until?: Date | null } | null,
  ): Promise<TagPlusSyncRun>;
  updateStage(runId: string, stage: TagPlusSyncStage): Promise<void>;
  completeRun(
    runId: string,
    completedAt: Date,
    summary: Record<string, unknown>,
  ): Promise<void>;
  failRun(
    runId: string,
    failedAt: Date,
    stage: TagPlusSyncStage,
    errorCategory: string,
    errorMessage?: string,
  ): Promise<void>;
}

export function createTagPlusSyncRepository(
  prisma: PrismaClient,
): TagPlusSyncRepository {
  return {
    async recoverStaleRuns(): Promise<RecoverStaleRunsResult> {
      const now = new Date();

      // 1. TagPlusSyncRun órfãs
      const staleTagPlus = await prisma.tagPlusSyncRun.updateMany({
        where: { status: TagPlusSyncStatus.RUNNING },
        data: {
          status: TagPlusSyncStatus.FAILED,
          completedAt: now,
          errorCategory: "STALE_ABORTED_ON_RESTART",
          errorMessage:
            "Sincronização abortada devido ao reinício do processo do backend (Single Instance Recovery)",
        },
      });

      // 2. CustomerSyncRun órfãs
      const staleCustomers = await prisma.customerSyncRun.updateMany({
        where: { status: "RUNNING" },
        data: {
          status: "FAILED",
          completedAt: now,
          errorCategory: "STALE_ABORTED_ON_RESTART",
        },
      });

      // 3. ProductSyncRun órfãs
      const staleProducts = await prisma.productSyncRun.updateMany({
        where: { status: "RUNNING" },
        data: {
          status: "FAILED",
          completedAt: now,
          errorCategory: "STALE_ABORTED_ON_RESTART",
        },
      });

      return {
        tagplus: staleTagPlus.count,
        customers: staleCustomers.count,
        products: staleProducts.count,
      };
    },

    async findRunning(connectionId?: string): Promise<TagPlusSyncRun | null> {
      return prisma.tagPlusSyncRun.findFirst({
        where: {
          status: TagPlusSyncStatus.RUNNING,
          ...(connectionId ? { connectionId } : {}),
        },
        orderBy: { startedAt: "desc" },
      });
    },

    async findActiveRun(): Promise<TagPlusSyncRun | null> {
      return prisma.tagPlusSyncRun.findFirst({
        where: { status: TagPlusSyncStatus.RUNNING },
        orderBy: { startedAt: "desc" },
      });
    },

    async findLastCompleted(
      connectionId?: string,
    ): Promise<TagPlusSyncRun | null> {
      return prisma.tagPlusSyncRun.findFirst({
        where: {
          status: TagPlusSyncStatus.COMPLETED,
          ...(connectionId ? { connectionId } : {}),
        },
        orderBy: { completedAt: "desc" },
      });
    },

    async findLastCompletedIncremental(
      connectionId: string,
    ): Promise<TagPlusSyncRun | null> {
      return prisma.tagPlusSyncRun.findFirst({
        where: {
          connectionId,
          status: TagPlusSyncStatus.COMPLETED,
          mode: TagPlusSyncMode.INCREMENTAL,
        },
        orderBy: { completedAt: "desc" },
      });
    },

    async findLastCompletedFull(
      connectionId: string,
    ): Promise<TagPlusSyncRun | null> {
      return prisma.tagPlusSyncRun.findFirst({
        where: {
          connectionId,
          status: TagPlusSyncStatus.COMPLETED,
          mode: TagPlusSyncMode.FULL,
        },
        orderBy: { completedAt: "desc" },
      });
    },

    async getRunById(runId: string): Promise<TagPlusSyncRun | null> {
      return prisma.tagPlusSyncRun.findUnique({
        where: { id: runId },
      });
    },

    async createRun(
      connectionId: string,
      startedAt = new Date(),
      mode: TagPlusSyncMode = TagPlusSyncMode.INCREMENTAL,
      window?: { since?: Date | null; until?: Date | null } | null,
    ): Promise<TagPlusSyncRun> {
      return prisma.tagPlusSyncRun.create({
        data: {
          connectionId,
          status: TagPlusSyncStatus.RUNNING,
          currentStage: TagPlusSyncStage.CUSTOMERS,
          mode,
          startedAt,
          windowSince: window?.since ?? null,
          windowUntil: window?.until ?? null,
        },
      });
    },

    async updateStage(
      runId: string,
      stage: TagPlusSyncStage,
    ): Promise<void> {
      await prisma.tagPlusSyncRun.update({
        where: { id: runId },
        data: { currentStage: stage },
      });
    },

    async completeRun(
      runId: string,
      completedAt: Date,
      summary: Record<string, unknown>,
    ): Promise<void> {
      const safeSummary = JSON.parse(
        JSON.stringify(summary, (_key, val) => {
          if (val instanceof Date) {
            return val.toISOString();
          }
          return val;
        }),
      );

      await prisma.tagPlusSyncRun.update({
        where: { id: runId },
        data: {
          status: TagPlusSyncStatus.COMPLETED,
          currentStage: TagPlusSyncStage.COMPLETED,
          completedAt,
          summary: safeSummary,
        },
      });
    },

    async failRun(
      runId: string,
      failedAt: Date,
      stage: TagPlusSyncStage,
      errorCategory: string,
      errorMessage?: string,
    ): Promise<void> {
      await prisma.tagPlusSyncRun.update({
        where: { id: runId },
        data: {
          status: TagPlusSyncStatus.FAILED,
          currentStage: TagPlusSyncStage.FAILED,
          errorStage: stage,
          completedAt: failedAt,
          errorCategory,
          errorMessage: errorMessage ?? errorCategory,
        },
      });
    },
  };
}
