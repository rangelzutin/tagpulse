import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import {
  FinancialSyncAlreadyRunningError,
  FinancialSyncValidationError,
  type FinancialSyncOrchestrator,
} from "../src/modules/financial/financial-sync-orchestrator.js";
import { TagPlusOAuthRequiredError } from "../src/modules/sync/tagplus-sync-orchestrator.js";

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function createMockOrchestrator(
  overrides?: Partial<FinancialSyncOrchestrator>,
): FinancialSyncOrchestrator {
  return {
    startSync: vi.fn().mockResolvedValue({
      accepted: true,
      status: "RUNNING",
      startedAt: "2026-09-28T14:00:00.000Z",
      mode: "incremental",
      since: "2026-08-29",
      lookbackDays: 30,
    }),
    getStatus: vi.fn().mockReturnValue({
      status: "IDLE",
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      since: null,
      lookbackDays: null,
      recentCandidates: 0,
      openCandidates: 0,
      undatedCandidates: 0,
      uniqueCandidates: 0,
      totalCandidates: 0,
      overlapDeduplicated: 0,
      processed: 0,
      completed: 0,
      failed: 0,
      notFound: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      lastError: null,
    }),
    ...overrides,
  };
}

async function createApp(orchestrator: FinancialSyncOrchestrator) {
  const app = await buildApp({
    databaseHealth: { check: vi.fn().mockResolvedValue(undefined) },
    frontendUrl: "http://localhost:5173",
    logger: false,
    financialSyncOrchestrator: orchestrator,
  });
  apps.push(app);
  return app;
}

describe("Financial Sync Routes (Fase 5G)", () => {
  describe("POST /api/financial/sync/incremental", () => {
    it("returns 202 Accepted and starts incremental financial sync with default lookbackDays=30", async () => {
      const orchestrator = createMockOrchestrator();
      const app = await createApp(orchestrator);

      const response = await app.inject({
        method: "POST",
        url: "/api/financial/sync/incremental",
      });

      expect(response.statusCode).toBe(202);
      expect(orchestrator.startSync).toHaveBeenCalledWith({
        lookbackDays: undefined,
        since: undefined,
      });

      const body = response.json();
      expect(body).toEqual({
        accepted: true,
        status: "RUNNING",
        startedAt: "2026-09-28T14:00:00.000Z",
        mode: "incremental",
        since: "2026-08-29",
        lookbackDays: 30,
      });
    });

    it("accepts lookbackDays and since in JSON body", async () => {
      const orchestrator = createMockOrchestrator({
        startSync: vi.fn().mockResolvedValue({
          accepted: true,
          status: "RUNNING",
          startedAt: "2026-09-28T14:00:00.000Z",
          mode: "incremental",
          since: "2026-08-01",
        }),
      });
      const app = await createApp(orchestrator);

      const response = await app.inject({
        method: "POST",
        url: "/api/financial/sync/incremental",
        payload: {
          since: "2026-08-01",
          lookbackDays: 60,
        },
      });

      expect(response.statusCode).toBe(202);
      expect(orchestrator.startSync).toHaveBeenCalledWith({
        lookbackDays: 60,
        since: "2026-08-01",
      });
      const body = response.json();
      expect(body.since).toBe("2026-08-01");
    });

    it("accepts query string parameters as fallback", async () => {
      const orchestrator = createMockOrchestrator();
      const app = await createApp(orchestrator);

      const response = await app.inject({
        method: "POST",
        url: "/api/financial/sync/incremental?lookbackDays=45",
      });

      expect(response.statusCode).toBe(202);
      expect(orchestrator.startSync).toHaveBeenCalledWith({
        lookbackDays: "45",
        since: undefined,
      });
    });

    it("works via alias /financial/sync/incremental", async () => {
      const orchestrator = createMockOrchestrator();
      const app = await createApp(orchestrator);

      const response = await app.inject({
        method: "POST",
        url: "/financial/sync/incremental",
      });

      expect(response.statusCode).toBe(202);
      expect(orchestrator.startSync).toHaveBeenCalled();
    });

    it("returns 400 Bad Request when validation fails", async () => {
      const orchestrator = createMockOrchestrator({
        startSync: vi.fn().mockRejectedValue(
          new FinancialSyncValidationError(
            'Formato inválido para parâmetro "since": "invalid-date". Esperado formato YYYY-MM-DD.',
          ),
        ),
      });
      const app = await createApp(orchestrator);

      const response = await app.inject({
        method: "POST",
        url: "/api/financial/sync/incremental",
        payload: { since: "invalid-date" },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.code).toBe("INVALID_PARAMETERS");
      expect(body.message).toContain("invalid-date");
    });

    it("returns 409 Conflict when a sync is already running", async () => {
      const orchestrator = createMockOrchestrator({
        startSync: vi.fn().mockRejectedValue(
          new FinancialSyncAlreadyRunningError({
            status: "RUNNING",
            startedAt: "2026-09-28T14:00:00.000Z",
            since: "2026-08-29",
            lookbackDays: 30,
          }),
        ),
      });
      const app = await createApp(orchestrator);

      const response = await app.inject({
        method: "POST",
        url: "/api/financial/sync/incremental",
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body).toEqual({
        accepted: false,
        status: "RUNNING",
        message: "Uma sincronização financeira incremental já está em andamento",
        startedAt: "2026-09-28T14:00:00.000Z",
        since: "2026-08-29",
        lookbackDays: 30,
      });
    });

    it("returns 401 Unauthorized when TagPlus OAuth token is missing", async () => {
      const orchestrator = createMockOrchestrator({
        startSync: vi.fn().mockRejectedValue(
          new TagPlusOAuthRequiredError(
            "Token de acesso OAuth do TagPlus não disponível. É necessário autorizar a aplicação.",
          ),
        ),
      });
      const app = await createApp(orchestrator);

      const response = await app.inject({
        method: "POST",
        url: "/api/financial/sync/incremental",
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.code).toBe("TAGPLUS_OAUTH_REQUIRED");
      expect(body.authorizeUrl).toBe("/integrations/tagplus/authorize");
    });
  });

  describe("GET /api/financial/sync/status", () => {
    it("returns 200 with IDLE status when no sync has been run", async () => {
      const orchestrator = createMockOrchestrator();
      const app = await createApp(orchestrator);

      const response = await app.inject({
        method: "GET",
        url: "/api/financial/sync/status",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe("IDLE");
      expect(body.startedAt).toBeNull();
      expect(body.processed).toBe(0);
    });

    it("returns 200 with RUNNING status during execution", async () => {
      const orchestrator = createMockOrchestrator({
        getStatus: vi.fn().mockReturnValue({
          status: "RUNNING",
          startedAt: "2026-09-28T14:00:00.000Z",
          finishedAt: null,
          durationMs: 45000,
          since: "2026-08-29",
          lookbackDays: 30,
          recentCandidates: 50,
          openCandidates: 25,
          undatedCandidates: 2,
          uniqueCandidates: 75,
          totalCandidates: 75,
          overlapDeduplicated: 2,
          processed: 20,
          completed: 20,
          failed: 0,
          notFound: 0,
          inserted: 1,
          updated: 2,
          unchanged: 17,
          lastError: null,
        }),
      });
      const app = await createApp(orchestrator);

      const response = await app.inject({
        method: "GET",
        url: "/api/financial/sync/status",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe("RUNNING");
      expect(body.processed).toBe(20);
      expect(body.totalCandidates).toBe(75);
    });

    it("works via alias /financial/sync/status", async () => {
      const orchestrator = createMockOrchestrator();
      const app = await createApp(orchestrator);

      const response = await app.inject({
        method: "GET",
        url: "/financial/sync/status",
      });

      expect(response.statusCode).toBe(200);
      expect(orchestrator.getStatus).toHaveBeenCalled();
    });
  });
});
