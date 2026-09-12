import type { FastifyInstance } from "fastify";
import {
  TagPlusOAuthRequiredError,
  TagPlusSyncAlreadyRunningError,
  type createTagPlusSyncOrchestrator,
} from "./tagplus-sync-orchestrator.js";

export type TagPlusSyncOrchestrator = ReturnType<
  typeof createTagPlusSyncOrchestrator
>;

export function registerTagPlusSyncRoutes(
  app: FastifyInstance,
  orchestrator: TagPlusSyncOrchestrator,
): void {
  /**
   * POST /api/sync/tagplus
   * Dispara a sincronização sequencial completa TagPlus:
   * Customers -> Products -> Sales.
   * Não bloqueia a requisição HTTP; retorna 202 Accepted imediatamente.
   */
  app.post("/api/sync/tagplus", async (_request, reply) => {
    try {
      const result = await orchestrator.startSync();
      return reply.code(202).send(result);
    } catch (error: unknown) {
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
  });

  /**
   * GET /api/sync/tagplus/status
   * Consulta o estado em tempo real da sincronização ativa e a data da última conclusão.
   */
  app.get("/api/sync/tagplus/status", async () => {
    return orchestrator.getStatus();
  });
}
