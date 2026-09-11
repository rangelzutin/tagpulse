import type { FastifyInstance } from "fastify";
import type { BiRepository } from "./bi-repository.js";
import { createBiService } from "./bi-service.js";

export function registerBiRoutes(
  app: FastifyInstance,
  repository: BiRepository,
): void {
  const service = createBiService(repository);

  app.get("/bi/data-range", async (_request, reply) => {
    const result = await service.getDataRange();

    if (!result.success) {
      return reply.code(400).send({
        status: "error",
        message: result.error,
      });
    }

    return reply.code(200).send(result.data);
  });

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

  app.get("/bi/customers/overview", async (request, reply) => {
    const query = (request.query ?? {}) as Record<string, unknown>;
    const result = await service.getCustomerOverview(query.from, query.to);

    if (!result.success) {
      return reply.code(400).send({
        status: "error",
        message: result.error,
      });
    }

    return reply.code(200).send(result.data);
  });

  app.get("/bi/customers/segment", async (request, reply) => {
    const query = (request.query ?? {}) as Record<string, unknown>;
    const result = await service.getCustomerSegment(query);

    if (!result.success) {
      return reply.code(400).send({
        status: "error",
        message: result.error,
      });
    }

    return reply.code(200).send(result.data);
  });

  app.get("/bi/customers/:customerId/overview", async (request, reply) => {
    const params = (request.params ?? {}) as { customerId?: string };
    const query = (request.query ?? {}) as Record<string, unknown>;
    const result = await service.getCustomerDetailOverview(
      params.customerId,
      query.from,
      query.to,
    );

    if (!result.success) {
      const code = result.notFound ? 404 : 400;
      return reply.code(code).send({
        status: "error",
        message: result.error,
      });
    }

    return reply.code(200).send(result.data);
  });

  app.get("/bi/customers/:customerId/sales", async (request, reply) => {
    const params = (request.params ?? {}) as { customerId?: string };
    const query = (request.query ?? {}) as Record<string, unknown>;
    const result = await service.getCustomerSales(params.customerId, query);

    if (!result.success) {
      const code = result.notFound ? 404 : 400;
      return reply.code(code).send({
        status: "error",
        message: result.error,
      });
    }

    return reply.code(200).send(result.data);
  });
}
