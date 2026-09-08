import type { FastifyInstance } from "fastify";
import type { BiRepository } from "./bi-repository.js";
import { createBiService } from "./bi-service.js";

export function registerBiRoutes(
  app: FastifyInstance,
  repository: BiRepository,
): void {
  const service = createBiService(repository);

  app.get("/bi/sales/overview", async (request, reply) => {
    const query = (request.query ?? {}) as Record<string, unknown>;
    const result = await service.getSalesOverview(query.from, query.to);

    if (!result.success) {
      return reply.code(400).send({
        status: "error",
        message: result.error,
      });
    }

    return reply.code(200).send(result.data);
  });
}
