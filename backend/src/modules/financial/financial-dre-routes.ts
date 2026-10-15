import type { FastifyInstance } from "fastify";
import type { FinancialDreService } from "./financial-dre-service.js";
import type {
  DreBreakdownQueryParams,
  DreMonthlyQueryParams,
  DreSummaryQueryParams,
} from "./financial-dre-types.js";

export function registerFinancialDreRoutes(
  app: FastifyInstance,
  service: FinancialDreService,
): void {
  // 1. DRE Consolidado — Resumo do Período
  app.get("/financial/dre/summary", async (request, reply) => {
    const query = (request.query ?? {}) as DreSummaryQueryParams;
    const result = await service.getDreSummary(query);

    if (!result.success) {
      return reply.code(400).send({
        status: "error",
        message: result.error,
      });
    }

    return reply.code(200).send(result.data);
  });

  // 2. DRE Mensal — Série Histórica do Ano
  app.get("/financial/dre/monthly", async (request, reply) => {
    const query = (request.query ?? {}) as DreMonthlyQueryParams;
    const result = await service.getDreMonthly(query);

    if (!result.success) {
      return reply.code(400).send({
        status: "error",
        message: result.error,
      });
    }

    return reply.code(200).send(result.data);
  });

  // 3. DRE Detalhamento — Breakdown por Categoria Econômica
  app.get("/financial/dre/breakdown", async (request, reply) => {
    const query = (request.query ?? {}) as DreBreakdownQueryParams;
    const result = await service.getDreBreakdown(query);

    if (!result.success) {
      return reply.code(400).send({
        status: "error",
        message: result.error,
      });
    }

    return reply.code(200).send(result.data);
  });
}
