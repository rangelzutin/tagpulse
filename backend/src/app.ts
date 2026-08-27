import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import type { DatabaseHealthChecker } from "./database/health.js";
import {
  registerTagPlusOAuthRoutes,
  type RegisterTagPlusOAuthOptions,
} from "./integrations/tagplus/oauth-routes.js";

export interface BuildAppOptions {
  databaseHealth: DatabaseHealthChecker;
  frontendUrl: string;
  logger?: boolean;
  tagPlusOAuth?: RegisterTagPlusOAuthOptions;
}

export async function buildApp(
  options: BuildAppOptions,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            redact: {
              paths: ["req.url"],
              censor: "[redacted: query may contain OAuth credentials]",
            },
          },
  });

  await app.register(cors, { origin: options.frontendUrl });

  app.get("/health", async () => ({ status: "ok" }));

  if (options.tagPlusOAuth) {
    registerTagPlusOAuthRoutes(app, options.tagPlusOAuth);
  }

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
