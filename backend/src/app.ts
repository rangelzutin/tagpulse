import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import type { DatabaseHealthChecker } from "./database/health.js";

export interface BuildAppOptions {
  databaseHealth: DatabaseHealthChecker;
  frontendUrl: string;
  logger?: boolean;
}

export async function buildApp(
  options: BuildAppOptions,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });

  await app.register(cors, { origin: options.frontendUrl });

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/health/database", async (_request, reply) => {
    try {
      await options.databaseHealth.check();
      return { status: "ok", database: "connected" };
    } catch (error: unknown) {
      app.log.error({ err: error }, "Database health check failed");
      return reply.code(503).send({ status: "error", database: "unavailable" });
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    app.log.error({ err: error }, "Request failed");
    void reply
      .code(500)
      .send({ status: "error", message: "Internal server error" });
  });

  return app;
}
