import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { FinancialDreService } from "./financial-dre-service.js";
import type {
  DreBreakdownQueryParams,
  DreMonthlyQueryParams,
  DreSummaryQueryParams,
} from "./financial-dre-types.js";
import {
  createProductCost,
  getCostQualitySummary,
  getMissingCosts,
  getProductCostHistory,
  type CreateProductCostInput,
} from "../products/product-cost-history-service.js";

export function registerFinancialDreRoutes(
  app: FastifyInstance,
  service: FinancialDreService,
  prisma?: PrismaClient,
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

  // 4. Cost Quality Summary (GET /financial/cost-quality & /financial/dre/cost-quality)
  const handleCostQuality = async (request: any, reply: any) => {
    if (!prisma) {
      return reply.code(503).send({ status: "error", message: "Database not available" });
    }
    const query = (request.query ?? {}) as { from?: string; to?: string; operationUnit?: string };
    try {
      const summary = await getCostQualitySummary(prisma, {
        ...(query.from ? { from: query.from } : {}),
        ...(query.to ? { to: query.to } : {}),
        ...(query.operationUnit ? { operationUnit: query.operationUnit } : {}),
      });
      return reply.code(200).send(summary);
    } catch (err: any) {
      return reply.code(500).send({ status: "error", message: err.message });
    }
  };
  app.get("/financial/cost-quality", handleCostQuality);
  app.get("/financial/dre/cost-quality", handleCostQuality);

  // 5. Missing Costs Inspector (GET /financial/cost-quality/missing & /financial/dre/cost-quality/missing)
  const handleMissingCosts = async (request: any, reply: any) => {
    if (!prisma) {
      return reply.code(503).send({ status: "error", message: "Database not available" });
    }
    const query = (request.query ?? {}) as {
      from?: string;
      to?: string;
      operationUnit?: string;
      page?: string;
      pageSize?: string;
    };
    try {
      const result = await getMissingCosts(prisma, {
        ...(query.from ? { from: query.from } : {}),
        ...(query.to ? { to: query.to } : {}),
        ...(query.operationUnit ? { operationUnit: query.operationUnit } : {}),
        page: query.page ? parseInt(query.page, 10) : 1,
        pageSize: query.pageSize ? parseInt(query.pageSize, 10) : 50,
      });
      return reply.code(200).send(result);
    } catch (err: any) {
      return reply.code(500).send({ status: "error", message: err.message });
    }
  };
  app.get("/financial/cost-quality/missing", handleMissingCosts);
  app.get("/financial/dre/cost-quality/missing", handleMissingCosts);

  // 6. Cadastrar Custo Manual (POST /financial/product-costs)
  app.post("/financial/product-costs", async (request, reply) => {
    if (!prisma) {
      return reply.code(503).send({ status: "error", message: "Database not available" });
    }
    const body = (request.body ?? {}) as CreateProductCostInput;
    try {
      const created = await createProductCost(prisma, body);
      return reply.code(201).send(created);
    } catch (err: any) {
      return reply.code(400).send({ status: "error", message: err.message });
    }
  });

  // 7. Histórico de Custo do Produto (GET /financial/product-costs/:productId)
  app.get("/financial/product-costs/:productId", async (request, reply) => {
    if (!prisma) {
      return reply.code(503).send({ status: "error", message: "Database not available" });
    }
    const { productId } = (request.params ?? {}) as { productId: string };
    try {
      const history = await getProductCostHistory(prisma, productId);
      return reply.code(200).send(history);
    } catch (err: any) {
      return reply.code(500).send({ status: "error", message: err.message });
    }
  });
}
