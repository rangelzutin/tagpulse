import type { PrismaClient, TagPlusSyncRun } from "@prisma/client";
import { TagPlusSyncStage, TagPlusSyncStatus } from "@prisma/client";
import type { TagPlusOAuthTokenStore } from "../../integrations/tagplus/oauth-token-store.js";
import { NINECLOUDS_CONNECTION_ID } from "../sales/production-sales-sync.js";
import type { TagPlusSyncRepository } from "./tagplus-sync-repository.js";

export class TagPlusSyncAlreadyRunningError extends Error {
  constructor(
    public readonly activeRun: {
      runId: string;
      status: TagPlusSyncStatus;
      currentStage: TagPlusSyncStage;
      startedAt: Date;
    },
  ) {
    super("TAGPLUS_SYNC_ALREADY_RUNNING");
    this.name = "TagPlusSyncAlreadyRunningError";
  }
}

export class TagPlusOAuthRequiredError extends Error {
  constructor(message = "Autenticação OAuth do TagPlus necessária") {
    super(message);
    this.name = "TagPlusOAuthRequiredError";
  }
}

export interface SyncStepProgress {
  status: "WAITING" | "RUNNING" | "COMPLETED" | "FAILED";
  summary?: Record<string, unknown>;
  error?: string;
}

export interface TagPlusSyncStatusResponse {
  isRunning: boolean;
  activeRun: {
    runId: string;
    status: TagPlusSyncStatus;
    currentStage: TagPlusSyncStage;
    startedAt: Date;
    completedAt?: Date | null;
    elapsedSeconds: number;
    errorStage?: TagPlusSyncStage | null;
    errorMessage?: string | null;
  } | null;
  stages: {
    customers: SyncStepProgress;
    products: SyncStepProgress;
    sales: SyncStepProgress;
  };
  lastCompletedSync: Date | null;
}

export interface CustomerRunnerLike {
  preflight(connectionId: string): Promise<unknown>;
  run(connectionId: string): Promise<{
    pagesFetched: number;
    recordsFetched: number;
    recordsInserted: number;
    recordsUpdated: number;
    recordsUnchanged: number;
    recordsNoLongerObserved: number;
  }>;
}

export interface ProductRunnerLike {
  preflight(connectionId: string): Promise<unknown>;
  run(connectionId: string): Promise<{
    pagesFetched: number;
    recordsFetched: number;
    recordsInserted: number;
    recordsUpdated: number;
    recordsUnchanged: number;
    recordsNoLongerObserved: number;
  }>;
}

export interface SalesRunnerLike {
  preflight(connectionId: string): Promise<unknown>;
  run(connectionId: string): Promise<{
    pedidos: {
      pagesFetched: number;
      recordsFetched: number;
      reconciledAbsent: number;
    };
    vendasSimples: {
      pagesFetched: number;
      recordsFetched: number;
      reconciledAbsent: number;
    };
    nfes: {
      pagesFetched: number;
      recordsFetched: number;
      reconciledAbsent: number;
    };
  }>;
}

export interface TagPlusSyncOrchestratorDependencies {
  prisma: PrismaClient;
  syncRepository: TagPlusSyncRepository;
  tokenStore: TagPlusOAuthTokenStore;
  customerRunner: CustomerRunnerLike;
  productRunner: ProductRunnerLike;
  salesRunner: SalesRunnerLike;
  targetConnectionId?: string;
  now?: () => Date;
}

export function createTagPlusSyncOrchestrator(
  dependencies: TagPlusSyncOrchestratorDependencies,
) {
  let isRunning = false;
  let activeRunId: string | null = null;
  let currentStage: TagPlusSyncStage = TagPlusSyncStage.CUSTOMERS;
  let runStartedAt: Date | null = null;
  let inMemoryStages: {
    customers: SyncStepProgress;
    products: SyncStepProgress;
    sales: SyncStepProgress;
  } = resetStages();

  const now = dependencies.now ?? (() => new Date());

  function resetStages() {
    return {
      customers: { status: "WAITING" } as SyncStepProgress,
      products: { status: "WAITING" } as SyncStepProgress,
      sales: { status: "WAITING" } as SyncStepProgress,
    };
  }

  async function resolveConnectionId(): Promise<string> {
    const targetId =
      dependencies.targetConnectionId ?? NINECLOUDS_CONNECTION_ID;

    const connection = await dependencies.prisma.tagPlusConnection.findUnique({
      where: { id: targetId },
      select: { id: true, status: true },
    });
    if (!connection) {
      throw new Error(`NINECLOUDS_CONNECTION_NOT_FOUND: ${targetId}`);
    }
    if (connection.status !== "ACTIVE") {
      throw new Error(`NINECLOUDS_CONNECTION_INACTIVE: ${targetId}`);
    }
    return connection.id;
  }

  async function preflightCheck(connectionId: string): Promise<void> {
    const tokens = dependencies.tokenStore.get();
    if (!tokens?.accessToken) {
      throw new TagPlusOAuthRequiredError(
        "Token de acesso OAuth do TagPlus não disponível. É necessário autorizar a aplicação.",
      );
    }

    if (isRunning && activeRunId && runStartedAt) {
      throw new TagPlusSyncAlreadyRunningError({
        runId: activeRunId,
        status: TagPlusSyncStatus.RUNNING,
        currentStage,
        startedAt: runStartedAt,
      });
    }

    const dbRunning = await dependencies.syncRepository.findActiveRun();
    if (dbRunning) {
      throw new TagPlusSyncAlreadyRunningError({
        runId: dbRunning.id,
        status: dbRunning.status,
        currentStage: dbRunning.currentStage,
        startedAt: dbRunning.startedAt,
      });
    }

    await dependencies.customerRunner.preflight(connectionId);
    await dependencies.productRunner.preflight(connectionId);
    await dependencies.salesRunner.preflight(connectionId);
  }

  async function executePipeline(connectionId: string, run: TagPlusSyncRun): Promise<void> {
    const stageSummaries: Record<string, unknown> = {};

    try {
      // 1. Customers
      currentStage = TagPlusSyncStage.CUSTOMERS;
      inMemoryStages.customers = { status: "RUNNING" };
      await dependencies.syncRepository.updateStage(run.id, TagPlusSyncStage.CUSTOMERS);

      const customerResult = await dependencies.customerRunner.run(connectionId);
      stageSummaries.customers = {
        pagesFetched: customerResult.pagesFetched,
        recordsFetched: customerResult.recordsFetched,
        recordsInserted: customerResult.recordsInserted,
        recordsUpdated: customerResult.recordsUpdated,
        recordsUnchanged: customerResult.recordsUnchanged,
        recordsNoLongerObserved: customerResult.recordsNoLongerObserved,
      };
      inMemoryStages.customers = {
        status: "COMPLETED",
        summary: stageSummaries.customers as Record<string, unknown>,
      };

      // 2. Products
      currentStage = TagPlusSyncStage.PRODUCTS;
      inMemoryStages.products = { status: "RUNNING" };
      await dependencies.syncRepository.updateStage(run.id, TagPlusSyncStage.PRODUCTS);

      const productResult = await dependencies.productRunner.run(connectionId);
      stageSummaries.products = {
        pagesFetched: productResult.pagesFetched,
        recordsFetched: productResult.recordsFetched,
        recordsInserted: productResult.recordsInserted,
        recordsUpdated: productResult.recordsUpdated,
        recordsUnchanged: productResult.recordsUnchanged,
        recordsNoLongerObserved: productResult.recordsNoLongerObserved,
      };
      inMemoryStages.products = {
        status: "COMPLETED",
        summary: stageSummaries.products as Record<string, unknown>,
      };

      // 3. Sales
      currentStage = TagPlusSyncStage.SALES;
      inMemoryStages.sales = { status: "RUNNING" };
      await dependencies.syncRepository.updateStage(run.id, TagPlusSyncStage.SALES);

      const salesResult = await dependencies.salesRunner.run(connectionId);
      stageSummaries.sales = {
        pedidos: salesResult.pedidos,
        vendasSimples: salesResult.vendasSimples,
        nfes: salesResult.nfes,
      };
      inMemoryStages.sales = {
        status: "COMPLETED",
        summary: stageSummaries.sales as Record<string, unknown>,
      };

      // Conclusão total - Summary normalizado para JSON válido (ISO strings em datas)
      const completedAt = now();
      currentStage = TagPlusSyncStage.COMPLETED;
      const finalSummary: Record<string, unknown> = toJsonSafe({
        startedAt: run.startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        ...stageSummaries,
      });
      await dependencies.syncRepository.completeRun(run.id, completedAt, finalSummary);
    } catch (error: unknown) {
      const sanitizedCategory = sanitizeErrorCategory(error);
      const sanitizedMessage = sanitizeErrorMessage(error);

      // Marca erro na etapa atual em memória
      if (currentStage === TagPlusSyncStage.CUSTOMERS) {
        inMemoryStages.customers = { status: "FAILED", error: sanitizedMessage };
      } else if (currentStage === TagPlusSyncStage.PRODUCTS) {
        inMemoryStages.products = { status: "FAILED", error: sanitizedMessage };
      } else if (currentStage === TagPlusSyncStage.SALES) {
        inMemoryStages.sales = { status: "FAILED", error: sanitizedMessage };
      }

      await dependencies.syncRepository.failRun(
        run.id,
        now(),
        currentStage,
        sanitizedCategory,
        sanitizedMessage,
      );
    } finally {
      isRunning = false;
      activeRunId = null;
      runStartedAt = null;
    }
  }

  return {
    async preflight(): Promise<{ connectionId: string; status: "READY" }> {
      const connectionId = await resolveConnectionId();
      await preflightCheck(connectionId);
      return { connectionId, status: "READY" };
    },

    async startSync(): Promise<{
      runId: string;
      status: TagPlusSyncStatus;
      currentStage: TagPlusSyncStage;
      startedAt: Date;
    }> {
      // 1. Aquisição SÍNCRONA da trava em memória ANTES de qualquer await
      // Bloqueia qualquer concorrência antes de haver yield no event loop
      if (isRunning) {
        throw new TagPlusSyncAlreadyRunningError({
          runId: activeRunId ?? "in-flight",
          status: TagPlusSyncStatus.RUNNING,
          currentStage,
          startedAt: runStartedAt ?? now(),
        });
      }
      isRunning = true;
      const startedAt = now();
      runStartedAt = startedAt;
      currentStage = TagPlusSyncStage.CUSTOMERS;

      let connectionId: string;
      try {
        connectionId = await resolveConnectionId();
        await preflightCheck(connectionId);
      } catch (preflightErr) {
        isRunning = false;
        runStartedAt = null;
        throw preflightErr;
      }

      let run: TagPlusSyncRun;
      try {
        run = await dependencies.syncRepository.createRun(connectionId, startedAt);
        activeRunId = run.id;
        inMemoryStages = resetStages();
      } catch (err) {
        isRunning = false;
        runStartedAt = null;
        throw err;
      }

      // Executa pipeline em background (desacoplado da resposta HTTP)
      // com captura explícita para NUNCA gerar unhandled rejection no Node.js
      executePipeline(connectionId, run).catch((unhandledErr) => {
        console.error(
          "[TagPlusSyncOrchestrator] Erro não tratado na pipeline de sync:",
          unhandledErr,
        );
      });

      return {
        runId: run.id,
        status: TagPlusSyncStatus.RUNNING,
        currentStage: TagPlusSyncStage.CUSTOMERS,
        startedAt,
      };
    },

    async getStatus(): Promise<TagPlusSyncStatusResponse> {
      const lastCompleted = await dependencies.syncRepository.findLastCompleted();

      if (isRunning && activeRunId && runStartedAt) {
        const elapsedSeconds = Math.max(
          0,
          Math.floor((now().getTime() - runStartedAt.getTime()) / 1000),
        );
        return {
          isRunning: true,
          activeRun: {
            runId: activeRunId,
            status: TagPlusSyncStatus.RUNNING,
            currentStage,
            startedAt: runStartedAt,
            elapsedSeconds,
          },
          stages: { ...inMemoryStages },
          lastCompletedSync: lastCompleted?.completedAt ?? null,
        };
      }

      // Se não estiver rodando na memória, consulta se há algum registro recente no banco
      const latestRun = await dependencies.prisma.tagPlusSyncRun.findFirst({
        orderBy: { createdAt: "desc" },
      });

      let stagesResult = resetStages();
      if (latestRun?.summary && typeof latestRun.summary === "object") {
        const sum = latestRun.summary as Record<string, unknown>;
        stagesResult = {
          customers: sum.customers
            ? { status: "COMPLETED", summary: sum.customers as Record<string, unknown> }
            : { status: latestRun.errorStage === TagPlusSyncStage.CUSTOMERS ? "FAILED" : "WAITING" },
          products: sum.products
            ? { status: "COMPLETED", summary: sum.products as Record<string, unknown> }
            : { status: latestRun.errorStage === TagPlusSyncStage.PRODUCTS ? "FAILED" : "WAITING" },
          sales: sum.sales
            ? { status: "COMPLETED", summary: sum.sales as Record<string, unknown> }
            : { status: latestRun.errorStage === TagPlusSyncStage.SALES ? "FAILED" : "WAITING" },
        };
      }

      const elapsed =
        latestRun?.completedAt && latestRun.startedAt
          ? Math.max(0, Math.floor((latestRun.completedAt.getTime() - latestRun.startedAt.getTime()) / 1000))
          : 0;

      return {
        isRunning: false,
        activeRun: latestRun
          ? {
              runId: latestRun.id,
              status: latestRun.status,
              currentStage: latestRun.currentStage,
              startedAt: latestRun.startedAt,
              completedAt: latestRun.completedAt,
              elapsedSeconds: elapsed,
              errorStage: latestRun.errorStage,
              errorMessage: latestRun.errorMessage,
            }
          : null,
        stages: stagesResult,
        lastCompletedSync: lastCompleted?.completedAt ?? null,
      };
    },
  };
}

function sanitizeErrorCategory(error: unknown): string {
  if (typeof error === "object" && error !== null && "category" in error) {
    return String((error as { category: unknown }).category);
  }
  if (error instanceof Error) {
    return error.name;
  }
  return "UNKNOWN_SYNC_ERROR";
}

function sanitizeErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const raw = String((error as { message: unknown }).message);
    // Remove qualquer indício de segredos, tokens ou query strings
    return raw.replace(/Bearer\s+[A-Za-z0-9_-]+/gi, "[REDACTED_TOKEN]");
  }
  return "Ocorreu um erro durante a sincronização";
}

export function toJsonSafe<T = Record<string, unknown>>(value: unknown): T {
  if (value === null || value === undefined) {
    return {} as T;
  }
  return JSON.parse(
    JSON.stringify(value, (_key, val) => {
      if (val instanceof Date) {
        return val.toISOString();
      }
      return val;
    }),
  ) as T;
}
