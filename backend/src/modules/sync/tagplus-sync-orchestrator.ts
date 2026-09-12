import type { PrismaClient, TagPlusSyncRun } from "@prisma/client";
import { TagPlusSyncMode, TagPlusSyncStage, TagPlusSyncStatus } from "@prisma/client";
import type { TagPlusOAuthTokenStore } from "../../integrations/tagplus/oauth-token-store.js";
import {
  formatTagPlusDateSaoPaulo,
  truncateToSeconds,
} from "../../integrations/tagplus/tagplus-date-formatter.js";
import { NINECLOUDS_CONNECTION_ID } from "../sales/production-sales-sync.js";
import type { TagPlusSyncRepository } from "./tagplus-sync-repository.js";

export class TagPlusSyncAlreadyRunningError extends Error {
  constructor(
    public readonly activeRun: {
      runId: string;
      mode?: TagPlusSyncMode;
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

export class TagPlusIncrementalBaselineRequiredError extends Error {
  constructor(
    message = "Nenhuma sincronização completa prévia foi encontrada para esta conexão. Execute uma Reconciliação Completa primeiro.",
  ) {
    super(message);
    this.name = "TagPlusIncrementalBaselineRequiredError";
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
    mode: TagPlusSyncMode;
    status: TagPlusSyncStatus;
    currentStage: TagPlusSyncStage;
    startedAt: Date;
    completedAt?: Date | null;
    elapsedSeconds: number;
    windowSince?: Date | null;
    windowUntil?: Date | null;
    errorStage?: TagPlusSyncStage | null;
    errorMessage?: string | null;
  } | null;
  stages: {
    customers: SyncStepProgress;
    products: SyncStepProgress;
    sales: SyncStepProgress;
  };
  lastCompletedSync: Date | null;
  lastCompletedIncrementalSync?: Date | null;
  lastCompletedFullSync?: Date | null;
}

export interface CustomerRunnerLike {
  preflight(connectionId: string): Promise<unknown>;
  run(
    connectionId: string,
    options?: {
      mode?: TagPlusSyncMode;
      window?: { since: string; until: string };
    },
  ): Promise<{
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
  run(
    connectionId: string,
    options?: {
      mode?: TagPlusSyncMode;
      window?: { since: string; until: string };
    },
  ): Promise<{
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
  run(
    connectionId: string,
    options?: {
      mode?: TagPlusSyncMode;
      window?: { since: string; until: string };
    },
  ): Promise<{
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
  let activeMode: TagPlusSyncMode = TagPlusSyncMode.INCREMENTAL;
  let currentStage: TagPlusSyncStage = TagPlusSyncStage.CUSTOMERS;
  let runStartedAt: Date | null = null;
  let activeWindowSince: Date | null = null;
  let activeWindowUntil: Date | null = null;
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
        mode: activeMode,
        status: TagPlusSyncStatus.RUNNING,
        currentStage,
        startedAt: runStartedAt,
      });
    }

    const dbRunning = await dependencies.syncRepository.findActiveRun();
    if (dbRunning) {
      throw new TagPlusSyncAlreadyRunningError({
        runId: dbRunning.id,
        mode: dbRunning.mode,
        status: dbRunning.status,
        currentStage: dbRunning.currentStage,
        startedAt: dbRunning.startedAt,
      });
    }

    await dependencies.customerRunner.preflight(connectionId);
    await dependencies.productRunner.preflight(connectionId);
    await dependencies.salesRunner.preflight(connectionId);
  }

  async function executePipeline(
    connectionId: string,
    run: TagPlusSyncRun,
    runnerOptions: {
      mode: TagPlusSyncMode;
      window?: { since: string; until: string };
    },
  ): Promise<void> {
    const stageSummaries: Record<string, unknown> = {};

    try {
      // 1. Customers
      currentStage = TagPlusSyncStage.CUSTOMERS;
      inMemoryStages.customers = { status: "RUNNING" };
      await dependencies.syncRepository.updateStage(run.id, TagPlusSyncStage.CUSTOMERS);

      const customerResult = await dependencies.customerRunner.run(connectionId, runnerOptions);
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

      const productResult = await dependencies.productRunner.run(connectionId, runnerOptions);
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

      const salesResult = await dependencies.salesRunner.run(connectionId, runnerOptions);
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
        mode: run.mode,
        windowSince: run.windowSince?.toISOString() ?? null,
        windowUntil: run.windowUntil?.toISOString() ?? null,
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
      activeWindowSince = null;
      activeWindowUntil = null;
      runStartedAt = null;
    }
  }

  return {
    async preflight(): Promise<{ connectionId: string; status: "READY" }> {
      const connectionId = await resolveConnectionId();
      await preflightCheck(connectionId);
      return { connectionId, status: "READY" };
    },

    async startSync(options?: {
      mode?: TagPlusSyncMode;
    }): Promise<{
      runId: string;
      mode: TagPlusSyncMode;
      status: TagPlusSyncStatus;
      currentStage: TagPlusSyncStage;
      startedAt: Date;
      windowSince?: Date | null;
      windowUntil?: Date | null;
    }> {
      const mode = options?.mode ?? TagPlusSyncMode.INCREMENTAL;

      // 1. Aquisição SÍNCRONA da trava em memória ANTES de qualquer await
      // Bloqueia qualquer concorrência antes de haver yield no event loop
      if (isRunning) {
        throw new TagPlusSyncAlreadyRunningError({
          runId: activeRunId ?? "in-flight",
          mode: activeMode,
          status: TagPlusSyncStatus.RUNNING,
          currentStage,
          startedAt: runStartedAt ?? now(),
        });
      }
      isRunning = true;
      activeMode = mode;
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
        activeMode = TagPlusSyncMode.INCREMENTAL;
        throw preflightErr;
      }

      let windowSince: Date | null = null;
      let windowUntil: Date | null = null;
      let runnerOptions: {
        mode: TagPlusSyncMode;
        window?: { since: string; until: string };
      };

      try {
        if (mode === TagPlusSyncMode.INCREMENTAL) {
          const lastIncremental =
            await dependencies.syncRepository.findLastCompletedIncremental(connectionId);

          if (lastIncremental && lastIncremental.windowUntil) {
            windowSince = lastIncremental.windowUntil;
          } else {
            const lastFull =
              await dependencies.syncRepository.findLastCompletedFull(connectionId);
            if (!lastFull) {
              throw new TagPlusIncrementalBaselineRequiredError();
            }
            windowSince = truncateToSeconds(lastFull.startedAt);
          }

          windowUntil = truncateToSeconds(startedAt);

          runnerOptions = {
            mode: TagPlusSyncMode.INCREMENTAL,
            window: {
              since: formatTagPlusDateSaoPaulo(windowSince),
              until: formatTagPlusDateSaoPaulo(windowUntil),
            },
          };
        } else {
          runnerOptions = {
            mode: TagPlusSyncMode.FULL,
          };
        }
      } catch (watermarkErr) {
        isRunning = false;
        runStartedAt = null;
        activeMode = TagPlusSyncMode.INCREMENTAL;
        throw watermarkErr;
      }

      let run: TagPlusSyncRun;
      try {
        run = await dependencies.syncRepository.createRun(
          connectionId,
          startedAt,
          mode,
          mode === TagPlusSyncMode.INCREMENTAL
            ? { since: windowSince, until: windowUntil }
            : undefined,
        );
        activeRunId = run.id;
        activeWindowSince = windowSince;
        activeWindowUntil = windowUntil;
        inMemoryStages = resetStages();
      } catch (err) {
        isRunning = false;
        runStartedAt = null;
        activeMode = TagPlusSyncMode.INCREMENTAL;
        activeWindowSince = null;
        activeWindowUntil = null;
        throw err;
      }

      // Executa pipeline em background (desacoplado da resposta HTTP)
      // com captura explícita para NUNCA gerar unhandled rejection no Node.js
      executePipeline(connectionId, run, runnerOptions).catch((unhandledErr) => {
        console.error(
          "[TagPlusSyncOrchestrator] Erro não tratado na pipeline de sync:",
          unhandledErr,
        );
      });

      return {
        runId: run.id,
        mode: run.mode,
        status: TagPlusSyncStatus.RUNNING,
        currentStage: TagPlusSyncStage.CUSTOMERS,
        startedAt,
        windowSince: run.windowSince,
        windowUntil: run.windowUntil,
      };
    },

    async getStatus(): Promise<TagPlusSyncStatusResponse> {
      const targetId =
        dependencies.targetConnectionId ?? NINECLOUDS_CONNECTION_ID;

      const [lastCompleted, lastCompletedIncremental, lastCompletedFull] =
        await Promise.all([
          dependencies.syncRepository.findLastCompleted(),
          dependencies.syncRepository.findLastCompletedIncremental(targetId),
          dependencies.syncRepository.findLastCompletedFull(targetId),
        ]);

      if (isRunning && activeRunId && runStartedAt) {
        const elapsedSeconds = Math.max(
          0,
          Math.floor((now().getTime() - runStartedAt.getTime()) / 1000),
        );
        return {
          isRunning: true,
          activeRun: {
            runId: activeRunId,
            mode: activeMode,
            status: TagPlusSyncStatus.RUNNING,
            currentStage,
            startedAt: runStartedAt,
            elapsedSeconds,
            windowSince: activeWindowSince,
            windowUntil: activeWindowUntil,
          },
          stages: { ...inMemoryStages },
          lastCompletedSync: lastCompleted?.completedAt ?? null,
          lastCompletedIncrementalSync: lastCompletedIncremental?.completedAt ?? null,
          lastCompletedFullSync: lastCompletedFull?.completedAt ?? null,
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
              mode: latestRun.mode,
              status: latestRun.status,
              currentStage: latestRun.currentStage,
              startedAt: latestRun.startedAt,
              completedAt: latestRun.completedAt,
              elapsedSeconds: elapsed,
              windowSince: latestRun.windowSince,
              windowUntil: latestRun.windowUntil,
              errorStage: latestRun.errorStage,
              errorMessage: latestRun.errorMessage,
            }
          : null,
        stages: stagesResult,
        lastCompletedSync: lastCompleted?.completedAt ?? null,
        lastCompletedIncrementalSync: lastCompletedIncremental?.completedAt ?? null,
        lastCompletedFullSync: lastCompletedFull?.completedAt ?? null,
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
