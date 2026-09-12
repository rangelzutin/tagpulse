import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import {
  TagPlusOAuthRequiredError,
  TagPlusSyncAlreadyRunningError,
  type TagPlusSyncOrchestrator,
} from "../src/modules/sync/tagplus-sync-orchestrator.js";
import { TagPlusSyncStage, TagPlusSyncStatus } from "@prisma/client";

const apps: FastifyInstance[] = [];

afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

function createMockOrchestrator(overrides?: Partial<TagPlusSyncOrchestrator>): TagPlusSyncOrchestrator {
  return {
    preflight: vi.fn().mockResolvedValue({ connectionId: "conn-123", status: "READY" }),
    startSync: vi.fn().mockResolvedValue({
      runId: "run-test-1",
      status: TagPlusSyncStatus.RUNNING,
      currentStage: TagPlusSyncStage.CUSTOMERS,
      startedAt: new Date("2026-09-11T21:00:00Z"),
    }),
    getStatus: vi.fn().mockResolvedValue({
      isRunning: false,
      activeRun: null,
      stages: {
        customers: { status: "WAITING" },
        products: { status: "WAITING" },
        sales: { status: "WAITING" },
      },
      lastCompletedSync: new Date("2026-09-11T18:00:00Z"),
    }),
    ...overrides,
  };
}

async function createApp(orchestrator: TagPlusSyncOrchestrator) {
  const app = await buildApp({
    databaseHealth: { check: vi.fn().mockResolvedValue(undefined) },
    frontendUrl: "http://localhost:5173",
    logger: false,
    tagPlusSyncOrchestrator: orchestrator,
  });
  apps.push(app);
  return app;
}

describe("TagPlus Sync Routes", () => {
  it("POST /api/sync/tagplus returns 202 Accepted with run details", async () => {
    const orchestrator = createMockOrchestrator();
    const app = await createApp(orchestrator);

    const response = await app.inject({
      method: "POST",
      url: "/api/sync/tagplus",
    });

    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(body).toEqual(
      expect.objectContaining({
        runId: "run-test-1",
        status: "RUNNING",
        currentStage: "CUSTOMERS",
      }),
    );
  });

  it("POST /api/sync/tagplus returns 401 when OAuth is missing", async () => {
    const orchestrator = createMockOrchestrator({
      startSync: vi.fn().mockRejectedValue(new TagPlusOAuthRequiredError("Token ausente")),
    });
    const app = await createApp(orchestrator);

    const response = await app.inject({
      method: "POST",
      url: "/api/sync/tagplus",
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.code).toBe("TAGPLUS_OAUTH_REQUIRED");
    expect(body.authorizeUrl).toBe("/integrations/tagplus/authorize");
  });

  it("POST /api/sync/tagplus returns 409 Conflict when sync is already running", async () => {
    const orchestrator = createMockOrchestrator({
      startSync: vi.fn().mockRejectedValue(
        new TagPlusSyncAlreadyRunningError({
          runId: "run-active",
          status: TagPlusSyncStatus.RUNNING,
          currentStage: TagPlusSyncStage.PRODUCTS,
          startedAt: new Date("2026-09-11T21:00:00Z"),
        }),
      ),
    });
    const app = await createApp(orchestrator);

    const response = await app.inject({
      method: "POST",
      url: "/api/sync/tagplus",
    });

    expect(response.statusCode).toBe(409);
    const body = response.json();
    expect(body.code).toBe("TAGPLUS_SYNC_ALREADY_RUNNING");
    expect(body.activeRun.runId).toBe("run-active");
  });

  it("GET /api/sync/tagplus/status returns current orchestrator status", async () => {
    const orchestrator = createMockOrchestrator({
      getStatus: vi.fn().mockResolvedValue({
        isRunning: true,
        activeRun: {
          runId: "run-123",
          status: TagPlusSyncStatus.RUNNING,
          currentStage: TagPlusSyncStage.PRODUCTS,
          startedAt: new Date("2026-09-11T21:00:00Z"),
          elapsedSeconds: 45,
        },
        stages: {
          customers: { status: "COMPLETED", summary: { recordsFetched: 100 } },
          products: { status: "RUNNING" },
          sales: { status: "WAITING" },
        },
        lastCompletedSync: new Date("2026-09-11T18:00:00Z"),
      }),
    });
    const app = await createApp(orchestrator);

    const response = await app.inject({
      method: "GET",
      url: "/api/sync/tagplus/status",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.isRunning).toBe(true);
    expect(body.activeRun.currentStage).toBe("PRODUCTS");
    expect(body.stages.customers.status).toBe("COMPLETED");
  });
});
