import type { FastifyInstance } from "fastify";
import type { FinancialOperationalService } from "./financial-operational-service.js";
import type {
  FinancialListQueryParams,
  FinancialOverviewQueryParams,
} from "./financial-operational-types.js";

export function registerFinancialOperationalRoutes(
  app: FastifyInstance,
  service: FinancialOperationalService,
): void {
  // 1. Contas a Receber — Overview
  app.get("/financial/receivables/overview", async (request, reply) => {
    const query = (request.query ?? {}) as FinancialOverviewQueryParams;
    const result = await service.getReceivablesOverview(query);

    if (!result.success) {
      return reply.code(400).send({
        status: "error",
        message: result.error,
      });
    }

    return reply.code(200).send(result.data);
  });

  // 2. Contas a Receber — Listagem
  app.get("/financial/receivables", async (request, reply) => {
    const query = (request.query ?? {}) as FinancialListQueryParams;
    const result = await service.getReceivablesList(query);

    if (!result.success) {
      return reply.code(400).send({
        status: "error",
        message: result.error,
      });
    }

    return reply.code(200).send(result.data);
  });

  // 3. Contas a Pagar — Overview
  app.get("/financial/payables/overview", async (request, reply) => {
    const query = (request.query ?? {}) as FinancialOverviewQueryParams;
    const result = await service.getPayablesOverview(query);

    if (!result.success) {
      return reply.code(400).send({
        status: "error",
        message: result.error,
      });
    }

    return reply.code(200).send(result.data);
  });

  // 3b. Planos Orçamentários
  app.get("/financial/budget-plans", async (_request, reply) => {
    const result = await service.getBudgetPlans();

    if (!result.success) {
      return reply.code(400).send({
        status: "error",
        message: result.error,
      });
    }

    return reply.code(200).send(result.data);
  });

  app.get("/financial/payables/budget-plans", async (_request, reply) => {
    const result = await service.getBudgetPlans();

    if (!result.success) {
      return reply.code(400).send({
        status: "error",
        message: result.error,
      });
    }

    return reply.code(200).send(result.data);
  });

  // 4. Contas a Pagar — Listagem
  app.get("/financial/payables", async (request, reply) => {
    const query = (request.query ?? {}) as FinancialListQueryParams;
    const result = await service.getPayablesList(query);

    if (!result.success) {
      return reply.code(400).send({
        status: "error",
        message: result.error,
      });
    }

    return reply.code(200).send(result.data);
  });

  // 5. Fluxo de Caixa Realizado — Overview / Timeseries
  app.get("/financial/cash-flow/overview", async (request, reply) => {
    const query = (request.query ?? {}) as {
      from?: string;
      to?: string;
      granularity?: string;
    };
    const result = await service.getCashFlowOverview(query);

    if (!result.success) {
      return reply.code(400).send({
        status: "error",
        message: result.error,
      });
    }

    return reply.code(200).send(result.data);
  });

  // Alias /financial/cash-flow -> overview
  app.get("/financial/cash-flow", async (request, reply) => {
    const query = (request.query ?? {}) as {
      from?: string;
      to?: string;
      granularity?: string;
    };
    const result = await service.getCashFlowOverview(query);

    if (!result.success) {
      return reply.code(400).send({
        status: "error",
        message: result.error,
      });
    }

    return reply.code(200).send(result.data);
  });

  // 6. Confirmados sem Data — Auditoria / Avisos
  app.get("/financial/cash-flow/undated", async (_request, reply) => {
    const result = await service.getUndatedConfirmedCash();

    if (!result.success) {
      return reply.code(400).send({
        status: "error",
        message: result.error,
      });
    }

    return reply.code(200).send(result.data);
  });
}
