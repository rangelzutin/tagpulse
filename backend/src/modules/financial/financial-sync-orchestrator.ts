import type { PrismaClient } from "@prisma/client";
import {
  createTagPlusClient,
  type TagPlusClient,
} from "../../integrations/tagplus/tagplus-client.js";
import {
  createTagPlusOAuthTokenStore,
  type TagPlusOAuthTokenStore,
} from "../../integrations/tagplus/oauth-token-store.js";
import { refreshAccessToken } from "../../integrations/tagplus/oauth.js";
import { TagPlusOAuthRequiredError, defaultGlobalSyncLockService } from "../sync/tagplus-sync-orchestrator.js";
import {
  type SyncLockHandle,
  type SyncLockService,
  SyncLockConflictError,
} from "../sync/sync-lock-service.js";
import {
  createFinancialRecordRepository,
  type FinancialRecordRepository,
} from "./financial-record-repository.js";
import {
  createFinancialRecordWorker,
  type FinancialRecordWorker,
} from "./financial-record-worker.js";
import {
  runIncrementalSync,
  resolveSinceDate,
  type IncrementalCandidateResult,
} from "./financial-incremental-sync.js";
import { ensureTagPlusConnection } from "../../scripts/ensure-tagplus-connection.js";

export type FinancialSyncStatus = "IDLE" | "RUNNING" | "SUCCEEDED" | "FAILED";

export class FinancialSyncAlreadyRunningError extends Error {
  constructor(
    public readonly activeRun: {
      status: "RUNNING";
      startedAt: string;
      since?: string | null;
      lookbackDays?: number | null;
    },
  ) {
    super("FINANCIAL_SYNC_ALREADY_RUNNING");
    this.name = "FinancialSyncAlreadyRunningError";
  }
}

export class FinancialSyncValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinancialSyncValidationError";
  }
}

export function sanitizeFinancialErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const raw = String((error as { message: unknown }).message);
    return raw
      .replace(/Bearer\s+[A-Za-z0-9_.-]+/gi, "[REDACTED_TOKEN]")
      .replace(/access_token=[A-Za-z0-9_.-]+/gi, "access_token=[REDACTED_TOKEN]")
      .replace(/refresh_token=[A-Za-z0-9_.-]+/gi, "refresh_token=[REDACTED_TOKEN]")
      .replace(/client_secret=[A-Za-z0-9_.-]+/gi, "client_secret=[REDACTED_SECRET]");
  }
  return "Ocorreu um erro durante a sincronização financeira";
}

export interface FinancialSyncStatusResponse {
  status: FinancialSyncStatus;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  since: string | null;
  lookbackDays: number | null;
  recentCandidates: number;
  openCandidates: number;
  undatedCandidates: number;
  uniqueCandidates: number;
  totalCandidates: number;
  overlapDeduplicated: number;
  processed: number;
  completed: number;
  failed: number;
  notFound: number;
  inserted: number;
  updated: number;
  unchanged: number;
  lastError: string | null;
}

export interface StartFinancialSyncParams {
  lookbackDays?: number | string | undefined;
  since?: string | undefined;
}

export interface StartFinancialSyncResult {
  accepted: boolean;
  status: "RUNNING";
  startedAt: string;
  mode: "incremental";
  since: string;
  lookbackDays?: number | undefined;
}

export interface FinancialSyncOrchestratorDependencies {
  prisma: PrismaClient;
  repository?: FinancialRecordRepository | undefined;
  worker?: FinancialRecordWorker | undefined;
  tokenStore?: TagPlusOAuthTokenStore | undefined;
  getClient?: (() => TagPlusClient) | undefined;
  updateClientToken?: ((newToken: string) => void) | undefined;
  refreshToken?: (() => Promise<string | null>) | undefined;
  targetConnectionId?: string | undefined;
  now?: (() => Date) | undefined;
  runIncrementalSyncFn?: typeof runIncrementalSync | undefined;
  syncLockService?: SyncLockService | undefined;
  env?: {
    baseUrl?: string | undefined;
    clientId?: string | undefined;
    clientSecret?: string | undefined;
    accessToken?: string | undefined;
  } | undefined;
}

export interface FinancialSyncOrchestrator {
  startSync(params?: StartFinancialSyncParams): Promise<StartFinancialSyncResult>;
  getStatus(): FinancialSyncStatusResponse;
}

export function createFinancialSyncOrchestrator(
  dependencies: FinancialSyncOrchestratorDependencies,
): FinancialSyncOrchestrator {
  const nowFn = dependencies.now ?? (() => new Date());
  const runSync = dependencies.runIncrementalSyncFn ?? runIncrementalSync;

  let isRunning = false;
  let startedAtDate: Date | null = null;
  let activeLockHandle: SyncLockHandle | null = null;

  let state: FinancialSyncStatusResponse = {
    status: "IDLE",
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    since: null,
    lookbackDays: null,
    recentCandidates: 0,
    openCandidates: 0,
    undatedCandidates: 0,
    uniqueCandidates: 0,
    totalCandidates: 0,
    overlapDeduplicated: 0,
    processed: 0,
    completed: 0,
    failed: 0,
    notFound: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    lastError: null,
  };

  function validateParams(params?: StartFinancialSyncParams): {
    sinceDate: string;
    resolvedLookbackDays?: number | undefined;
  } {
    let resolvedLookbackDays: number | undefined;

    if (params?.since !== undefined && params.since !== null && String(params.since).trim() !== "") {
      const trimmedSince = String(params.since).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedSince)) {
        throw new FinancialSyncValidationError(
          `Formato inválido para parâmetro "since": "${params.since}". Esperado formato YYYY-MM-DD.`,
        );
      }
      const parts = trimmedSince.split("-").map(Number);
      const year = parts[0] as number;
      const month = parts[1] as number;
      const day = parts[2] as number;
      const parsedDate = new Date(Date.UTC(year, month - 1, day));
      if (
        isNaN(parsedDate.getTime()) ||
        parsedDate.getUTCFullYear() !== year ||
        parsedDate.getUTCMonth() !== month - 1 ||
        parsedDate.getUTCDate() !== day
      ) {
        throw new FinancialSyncValidationError(
          `Data inválida para parâmetro "since": "${params.since}". Não corresponde a uma data de calendário válida.`,
        );
      }
      return { sinceDate: trimmedSince };
    }

    if (params?.lookbackDays !== undefined && params.lookbackDays !== null && String(params.lookbackDays).trim() !== "") {
      const raw = Number(params.lookbackDays);
      if (!Number.isInteger(raw) || raw <= 0 || raw > 3650) {
        throw new FinancialSyncValidationError(
          `Valor inválido para parâmetro "lookbackDays": "${params.lookbackDays}". Deve ser um número inteiro entre 1 e 3650.`,
        );
      }
      resolvedLookbackDays = raw;
    } else {
      resolvedLookbackDays = 30;
    }

    const res = resolveSinceDate({ lookbackDays: resolvedLookbackDays, now: nowFn() });
    return { sinceDate: res.sinceDate, resolvedLookbackDays: res.lookbackDays };
  }

  async function resolveConnection(): Promise<{ id: string; apiVersion: string }> {
    if (dependencies.targetConnectionId) {
      const connection = await dependencies.prisma.tagPlusConnection.findUnique({
        where: { id: dependencies.targetConnectionId },
        select: { id: true, status: true, apiVersion: true },
      });
      if (!connection) {
        throw new Error(`TAGPLUS_CONNECTION_NOT_FOUND: ${dependencies.targetConnectionId}`);
      }
      if (connection.status !== "ACTIVE") {
        throw new Error(`TAGPLUS_CONNECTION_INACTIVE: ${dependencies.targetConnectionId}`);
      }
      return connection;
    }

    const connection = await dependencies.prisma.tagPlusConnection.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      select: { id: true, status: true, apiVersion: true },
    });
    if (connection) {
      return connection;
    }

    return ensureTagPlusConnection(dependencies.prisma);
  }

  async function executePipeline(
    connection: { id: string; apiVersion: string },
    options: {
      sinceDate: string;
      resolvedLookbackDays?: number | undefined;
      explicitSince?: string | undefined;
      startTimeMs: number;
      startedAtDate: Date;
    },
  ): Promise<void> {
    const repository =
      dependencies.repository ?? createFinancialRecordRepository(dependencies.prisma);
    const tokenStore = dependencies.tokenStore ?? createTagPlusOAuthTokenStore();
    const env = dependencies.env ?? {};

    let accessToken =
      tokenStore.get()?.accessToken || env.accessToken || process.env.TAGPLUS_ACCESS_TOKEN;

    if (!accessToken && !dependencies.getClient) {
      throw new TagPlusOAuthRequiredError(
        "Token de acesso OAuth do TagPlus não disponível. É necessário autorizar a aplicação.",
      );
    }

    let client =
      dependencies.getClient?.() ??
      createTagPlusClient({
        baseUrl: env.baseUrl ?? process.env.TAGPLUS_BASE_URL ?? "https://api.tagplus.com.br",
        apiVersion: connection.apiVersion,
        accessToken: accessToken ?? "",
      });

    const getClient = () => (dependencies.getClient ? dependencies.getClient() : client);

    const updateClientToken = (newToken: string) => {
      if (dependencies.updateClientToken) {
        dependencies.updateClientToken(newToken);
      } else {
        accessToken = newToken;
        client = createTagPlusClient({
          baseUrl: env.baseUrl ?? process.env.TAGPLUS_BASE_URL ?? "https://api.tagplus.com.br",
          apiVersion: connection.apiVersion,
          accessToken: newToken,
        });
      }
    };

    const refreshTokenHandler =
      dependencies.refreshToken ??
      (async (): Promise<string | null> => {
        const tokens = tokenStore.get();
        if (!tokens?.refreshToken) {
          return null;
        }
        try {
          const refreshed = await refreshAccessToken(
            {
              baseUrl: env.baseUrl ?? process.env.TAGPLUS_BASE_URL ?? "https://api.tagplus.com.br",
              clientId: env.clientId ?? process.env.TAGPLUS_CLIENT_ID ?? "",
              clientSecret: env.clientSecret ?? process.env.TAGPLUS_CLIENT_SECRET ?? "",
            },
            tokens.refreshToken,
          );
          tokenStore.set(refreshed);
          return refreshed.accessToken;
        } catch {
          return null;
        }
      });

    const worker =
      dependencies.worker ??
      createFinancialRecordWorker({
        prisma: dependencies.prisma,
        repository,
        getClient,
        updateClientToken,
        refreshToken: refreshTokenHandler,
      });

    try {
      const report = await runSync({
        prisma: dependencies.prisma,
        repository,
        worker,
        getClient,
        connectionId: connection.id,
        lookbackDays: options.resolvedLookbackDays,
        since: options.explicitSince ? options.sinceDate : undefined,
        now: options.startedAtDate,
        refreshToken: refreshTokenHandler,
        updateClientToken,
        onCandidatesDiscovered: (cand: IncrementalCandidateResult) => {
          state.recentCandidates = cand.recentCandidates.length;
          state.openCandidates = cand.openCandidates.length;
          state.undatedCandidates = cand.undatedCandidates.length;
          state.uniqueCandidates = cand.uniqueCandidates.length;
          state.totalCandidates = cand.uniqueCandidates.length;
          state.overlapDeduplicated = cand.overlapDeduplicated;
        },
        onProgress: (prog) => {
          state.processed = prog.processed;
          state.completed = prog.completed;
          state.failed = prog.failed;
          state.notFound = prog.notFound;
          if (prog.recordAction === "inserted") state.inserted++;
          else if (prog.recordAction === "updated") state.updated++;
          else if (prog.recordAction === "unchanged") state.unchanged++;
          state.durationMs = Math.max(0, nowFn().getTime() - options.startTimeMs);
        },
      });

      const finishedAtDate = nowFn();
      const durationMs = Math.max(0, finishedAtDate.getTime() - options.startTimeMs);

      state = {
        status: "SUCCEEDED",
        startedAt: options.startedAtDate.toISOString(),
        finishedAt: finishedAtDate.toISOString(),
        durationMs,
        since: report.sinceDate,
        lookbackDays: report.lookbackDays ?? null,
        recentCandidates: report.candidates.recentCount,
        openCandidates: report.candidates.openCount,
        undatedCandidates: report.candidates.undatedCount,
        uniqueCandidates: report.candidates.uniqueCount,
        totalCandidates: report.candidates.uniqueCount,
        overlapDeduplicated: report.candidates.overlapDeduplicated,
        processed: report.workerSummary?.processed ?? state.processed,
        completed: report.workerSummary?.completed ?? state.completed,
        failed: report.workerSummary?.failed ?? state.failed,
        notFound: report.workerSummary?.notFound ?? state.notFound,
        inserted: report.workerSummary?.inserted ?? state.inserted,
        updated: report.workerSummary?.updated ?? state.updated,
        unchanged: report.workerSummary?.unchanged ?? state.unchanged,
        lastError: null,
      };
    } catch (err: unknown) {
      const finishedAtDate = nowFn();
      const durationMs = Math.max(0, finishedAtDate.getTime() - options.startTimeMs);

      state = {
        ...state,
        status: "FAILED",
        finishedAt: finishedAtDate.toISOString(),
        durationMs,
        lastError: sanitizeFinancialErrorMessage(err),
      };
    } finally {
      isRunning = false;
      startedAtDate = null;
      activeLockHandle?.release();
      activeLockHandle = null;
    }
  }

  return {
    async startSync(params?: StartFinancialSyncParams): Promise<StartFinancialSyncResult> {
      // 1. Validação de parâmetros ANTES de qualquer alteração de estado
      const { sinceDate, resolvedLookbackDays } = validateParams(params);

      const targetConnId = dependencies.targetConnectionId ?? "8e1d662c-c9f3-4fee-9618-bb984573fa2a";
      const lockService = dependencies.syncLockService ?? defaultGlobalSyncLockService;

      // Aquisição da trava compartilhada única (bloqueia concorrência com global sync e financial sync)
      let lockHandle: SyncLockHandle;
      try {
        lockHandle = lockService.acquire({
          type: "FINANCIAL_INCREMENTAL",
          connectionId: targetConnId,
          details: { lookbackDays: resolvedLookbackDays, since: sinceDate },
        });
      } catch (err) {
        if (err instanceof SyncLockConflictError) {
          throw new FinancialSyncAlreadyRunningError({
            status: "RUNNING",
            startedAt: err.activeLock.startedAt.toISOString(),
            since: sinceDate,
            lookbackDays: resolvedLookbackDays ?? null,
          });
        }
        throw err;
      }

      // 2. Aquisição SÍNCRONA da trava em memória ANTES de qualquer await
      if (isRunning) {
        lockHandle.release();
        throw new FinancialSyncAlreadyRunningError({
          status: "RUNNING",
          startedAt: state.startedAt ?? nowFn().toISOString(),
          since: state.since,
          lookbackDays: state.lookbackDays,
        });
      }

      activeLockHandle = lockHandle;
      isRunning = true;

      const startedAt = nowFn();
      startedAtDate = startedAt;
      const startTimeMs = startedAt.getTime();

      // 3. Resolução da conexão (síncrona/prévia à chamada em background)
      let connection: { id: string; apiVersion: string };
      try {
        // Validação de token disponível
        const tokenStore = dependencies.tokenStore ?? createTagPlusOAuthTokenStore();
        const env = dependencies.env ?? {};
        const availableToken =
          tokenStore.get()?.accessToken || env.accessToken || process.env.TAGPLUS_ACCESS_TOKEN;
        if (!availableToken && !dependencies.getClient) {
          throw new TagPlusOAuthRequiredError(
            "Token de acesso OAuth do TagPlus não disponível. É necessário autorizar a aplicação.",
          );
        }

        connection = await resolveConnection();
      } catch (initErr) {
        isRunning = false;
        startedAtDate = null;
        activeLockHandle?.release();
        activeLockHandle = null;
        throw initErr;
      }

      // 4. Inicialização de estado RUNNING observável
      state = {
        status: "RUNNING",
        startedAt: startedAt.toISOString(),
        finishedAt: null,
        durationMs: 0,
        since: sinceDate,
        lookbackDays: resolvedLookbackDays ?? null,
        recentCandidates: 0,
        openCandidates: 0,
        undatedCandidates: 0,
        uniqueCandidates: 0,
        totalCandidates: 0,
        overlapDeduplicated: 0,
        processed: 0,
        completed: 0,
        failed: 0,
        notFound: 0,
        inserted: 0,
        updated: 0,
        unchanged: 0,
        lastError: null,
      };

      // 5. Disparo em background com proteção de unhandled rejection
      executePipeline(connection, {
        sinceDate,
        resolvedLookbackDays,
        explicitSince: params?.since ? sinceDate : undefined,
        startTimeMs,
        startedAtDate: startedAt,
      }).catch((unhandledErr) => {
        // Log seguro sem vazar segredos
        console.error(
          "[FinancialSyncOrchestrator] Erro não tratado na pipeline financeira:",
          sanitizeFinancialErrorMessage(unhandledErr),
        );
      });

      // 6. Resposta rápida HTTP 202
      return {
        accepted: true,
        status: "RUNNING",
        startedAt: startedAt.toISOString(),
        mode: "incremental",
        since: sinceDate,
        ...(resolvedLookbackDays !== undefined ? { lookbackDays: resolvedLookbackDays } : {}),
      };
    },

    getStatus(): FinancialSyncStatusResponse {
      if (isRunning && startedAtDate) {
        const liveDurationMs = Math.max(0, nowFn().getTime() - startedAtDate.getTime());
        return {
          ...state,
          durationMs: liveDurationMs,
        };
      }
      return { ...state };
    },
  };
}
