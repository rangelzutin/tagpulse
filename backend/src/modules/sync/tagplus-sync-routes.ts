import type { FastifyInstance, FastifyReply } from "fastify";
import { TagPlusSyncMode } from "@prisma/client";
import {
  TagPlusIncrementalBaselineRequiredError,
  TagPlusOAuthRequiredError,
  TagPlusSyncAlreadyRunningError,
  type createTagPlusSyncOrchestrator,
} from "./tagplus-sync-orchestrator.js";

export type TagPlusSyncOrchestrator = ReturnType<
  typeof createTagPlusSyncOrchestrator
>;

function handleSyncStartError(
  app: FastifyInstance,
  reply: FastifyReply,
  error: unknown,
) {
  if (error instanceof TagPlusOAuthRequiredError) {
    return reply.code(401).send({
      code: "TAGPLUS_OAUTH_REQUIRED",
      message: error.message,
      authorizeUrl: "/integrations/tagplus/authorize",
    });
  }

  if (error instanceof TagPlusSyncAlreadyRunningError) {
    return reply.code(409).send({
      code: "TAGPLUS_SYNC_ALREADY_RUNNING",
      message: "Uma sincronização TagPlus já está em andamento",
      activeRun: error.activeRun,
    });
  }

  if (error instanceof TagPlusIncrementalBaselineRequiredError) {
    return reply.code(409).send({
      code: "TAGPLUS_INCREMENTAL_BASELINE_REQUIRED",
      message: error.message,
    });
  }

  app.log.error({ err: error }, "Falha ao iniciar sincronização TagPlus");
  const message =
    error instanceof Error
      ? error.message
      : "Falha ao iniciar sincronização TagPlus";
  return reply.code(500).send({
    code: "TAGPLUS_SYNC_START_FAILED",
    message,
  });
}

export function registerTagPlusSyncRoutes(
  app: FastifyInstance,
  orchestrator: TagPlusSyncOrchestrator,
): void {
  /**
   * POST /api/sync/tagplus
   * Dispara a sincronização sequencial INCREMENTAL TagPlus:
   * Customers -> Products -> Sales.
   * Não bloqueia a requisição HTTP; retorna 202 Accepted imediatamente.
   */
  app.post("/api/sync/tagplus", async (_request, reply) => {
    try {
      const result = await orchestrator.startSync({
        mode: TagPlusSyncMode.INCREMENTAL,
      });
      return reply.code(202).send(result);
    } catch (error: unknown) {
      return handleSyncStartError(app, reply, error);
    }
  });

  /**
   * POST /api/sync/tagplus/full
   * Dispara a sincronização sequencial COMPLETA TagPlus (Reconciliação Completa):
   * Customers -> Products -> Sales (Full Scan com reconciliação destrutiva).
   * Não bloqueia a requisição HTTP; retorna 202 Accepted imediatamente.
   */
  app.post("/api/sync/tagplus/full", async (_request, reply) => {
    try {
      const result = await orchestrator.startSync({
        mode: TagPlusSyncMode.FULL,
      });
      return reply.code(202).send(result);
    } catch (error: unknown) {
      return handleSyncStartError(app, reply, error);
    }
  });

  /**
   * GET /api/sync/tagplus/status
   * Consulta o estado em tempo real da sincronização ativa e a data da última conclusão.
   */
  app.get("/api/sync/tagplus/status", async () => {
    return orchestrator.getStatus();
  });
}
