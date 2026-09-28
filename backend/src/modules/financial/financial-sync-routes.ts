import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { TagPlusOAuthRequiredError } from "../sync/tagplus-sync-orchestrator.js";
import {
  FinancialSyncAlreadyRunningError,
  FinancialSyncValidationError,
  sanitizeFinancialErrorMessage,
  type FinancialSyncOrchestrator,
  type StartFinancialSyncParams,
} from "./financial-sync-orchestrator.js";

function handleSyncError(
  app: FastifyInstance,
  reply: FastifyReply,
  error: unknown,
) {
  if (error instanceof FinancialSyncValidationError) {
    return reply.code(400).send({
      status: "error",
      code: "INVALID_PARAMETERS",
      message: error.message,
    });
  }

  if (error instanceof FinancialSyncAlreadyRunningError) {
    return reply.code(409).send({
      accepted: false,
      status: "RUNNING",
      message: "Uma sincronização financeira incremental já está em andamento",
      startedAt: error.activeRun.startedAt,
      since: error.activeRun.since,
      lookbackDays: error.activeRun.lookbackDays,
    });
  }

  if (error instanceof TagPlusOAuthRequiredError) {
    return reply.code(401).send({
      status: "error",
      code: "TAGPLUS_OAUTH_REQUIRED",
      message: error.message,
      authorizeUrl: "/integrations/tagplus/authorize",
    });
  }

  const sanitized = sanitizeFinancialErrorMessage(error);
  app.log.error({ err: sanitized }, "Falha ao iniciar sincronização financeira");

  return reply.code(500).send({
    status: "error",
    code: "FINANCIAL_SYNC_START_FAILED",
    message: sanitized,
  });
}

function parseSyncParams(request: FastifyRequest): StartFinancialSyncParams {
  const query = (request.query ?? {}) as Record<string, unknown>;
  const body = (request.body ?? {}) as Record<string, unknown>;

  const rawLookback = body.lookbackDays ?? query.lookbackDays;
  const rawSince = body.since ?? query.since;

  return {
    lookbackDays: rawLookback !== undefined ? (rawLookback as number | string) : undefined,
    since: rawSince !== undefined ? String(rawSince) : undefined,
  };
}

export function registerFinancialSyncRoutes(
  app: FastifyInstance,
  orchestrator: FinancialSyncOrchestrator,
): void {
  /**
   * POST /api/financial/sync/incremental (e alias /financial/sync/incremental)
   * Dispara a sincronização financeira incremental:
   * Descoberta de candidatos (Recent + Open + Undated) -> Deduplicação -> Detalhe -> Persistência.
   * Não bloqueia a requisição HTTP; retorna 202 Accepted imediatamente.
   */
  const handlePostIncremental = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = parseSyncParams(request);
      const result = await orchestrator.startSync(params);
      return reply.code(202).send(result);
    } catch (error: unknown) {
      return handleSyncError(app, reply, error);
    }
  };

  app.post("/api/financial/sync/incremental", handlePostIncremental);
  app.post("/financial/sync/incremental", handlePostIncremental);

  /**
   * GET /api/financial/sync/status (e alias /financial/sync/status)
   * Consulta o estado e progresso observável da sincronização financeira.
   * Somente leitura, sem efeitos colaterais.
   */
  const handleGetStatus = async (_request: FastifyRequest, reply: FastifyReply) => {
    const status = orchestrator.getStatus();
    return reply.code(200).send(status);
  };

  app.get("/api/financial/sync/status", handleGetStatus);
  app.get("/financial/sync/status", handleGetStatus);
}
