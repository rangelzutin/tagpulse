import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { TagPlusSyncMode, TagPlusSyncStage, TagPlusSyncStatus } from "@prisma/client";
import { buildApp } from "../src/app.js";
import {
  TagPlusIncrementalBaselineRequiredError,
  TagPlusOAuthRequiredError,
  TagPlusSyncAlreadyRunningError,
  type TagPlusSyncOrchestrator,
} from "../src/modules/sync/tagplus-sync-orchestrator.js";

const apps: FastifyInstance[] = [];

afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

function createMockOrchestrator(overrides?: Partial<TagPlusSyncOrchestrator>): TagPlusSyncOrchestrator {
  return {
    preflight: vi.fn().mockResolvedValue({ connectionId: "conn-123", status: "READY" }),
    startSync: vi.fn().mockResolvedValue({
      runId: "run-test-1",
      mode: TagPlusSyncMode.INCREMENTAL,
      status: TagPlusSyncStatus.RUNNING,
      currentStage: TagPlusSyncStage.CUSTOMERS,
      startedAt: new Date("2026-09-11T21:00:00Z"),
      windowSince: new Date("2026-09-11T20:00:00Z"),
      windowUntil: new Date("2026-09-11T21:00:00Z"),
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
      lastCompletedIncrementalSync: new Date("2026-09-11T18:00:00Z"),
      lastCompletedFullSync: new Date("2026-09-10T18:00:00Z"),
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
  it("POST /api/sync/tagplus triggers INCREMENTAL sync and returns 202 Accepted", async () => {
    const orchestrator = createMockOrchestrator();
    const app = await createApp(orchestrator);

    const response = await app.inject({
      method: "POST",
      url: "/api/sync/tagplus",
    });

    expect(response.statusCode).toBe(202);
    expect(orchestrator.startSync).toHaveBeenCalledWith({
      mode: TagPlusSyncMode.INCREMENTAL,
    });
    const body = response.json();
    expect(body).toEqual(
      expect.objectContaining({
        runId: "run-test-1",
        mode: "INCREMENTAL",
        status: "RUNNING",
        currentStage: "CUSTOMERS",
      }),
    );
  });

  it("POST /api/sync/tagplus/full triggers FULL sync and returns 202 Accepted", async () => {
    const orchestrator = createMockOrchestrator({
      startSync: vi.fn().mockResolvedValue({
        runId: "run-full-1",
        mode: TagPlusSyncMode.FULL,
        status: TagPlusSyncStatus.RUNNING,
        currentStage: TagPlusSyncStage.CUSTOMERS,
        startedAt: new Date("2026-09-11T21:00:00Z"),
      }),
    });
    const app = await createApp(orchestrator);

    const response = await app.inject({
      method: "POST",
      url: "/api/sync/tagplus/full",
    });

    expect(response.statusCode).toBe(202);
    expect(orchestrator.startSync).toHaveBeenCalledWith({
      mode: TagPlusSyncMode.FULL,
    });
    const body = response.json();
    expect(body).toEqual(
      expect.objectContaining({
        runId: "run-full-1",
        mode: "FULL",
        status: "RUNNING",
      }),
    );
  });

  it("POST /api/sync/tagplus returns 409 when baseline full run is missing", async () => {
    const orchestrator = createMockOrchestrator({
      startSync: vi.fn().mockRejectedValue(new TagPlusIncrementalBaselineRequiredError()),
    });
    const app = await createApp(orchestrator);

    const response = await app.inject({
      method: "POST",
      url: "/api/sync/tagplus",
    });

    expect(response.statusCode).toBe(409);
    const body = response.json();
    expect(body.code).toBe("TAGPLUS_INCREMENTAL_BASELINE_REQUIRED");
    expect(body.message).toContain("Reconciliação Completa");
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
          mode: TagPlusSyncMode.FULL,
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
    expect(body.activeRun.mode).toBe("FULL");
  });

  it("GET /api/sync/tagplus/status returns current orchestrator status", async () => {
    const orchestrator = createMockOrchestrator({
      getStatus: vi.fn().mockResolvedValue({
        isRunning: true,
        activeRun: {
          runId: "run-123",
          mode: TagPlusSyncMode.INCREMENTAL,
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
    expect(body.activeRun.mode).toBe("INCREMENTAL");
    expect(body.activeRun.currentStage).toBe("PRODUCTS");
    expect(body.stages.customers.status).toBe("COMPLETED");
  });
});
