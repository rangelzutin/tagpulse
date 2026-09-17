import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import type { PrismaClient } from "@prisma/client";
import { TagPlusSyncMode, TagPlusSyncStage, TagPlusSyncStatus } from "@prisma/client";
import { createTagPlusOAuthTokenStore } from "../src/integrations/tagplus/oauth-token-store.js";
import {
  TagPlusHttpError,
  TagPlusNetworkError,
  TagPlusTimeoutError,
} from "../src/integrations/tagplus/tagplus-client.js";
import {
  createTagPlusSyncOrchestrator,
  isTagPlusAuthError,
  type CategoryRunnerLike,
  type CustomerRunnerLike,
  type ProductRunnerLike,
  type SalesRunnerLike,
} from "../src/modules/sync/tagplus-sync-orchestrator.js";
import type { TagPlusSyncRepository } from "../src/modules/sync/tagplus-sync-repository.js";
import { registerTagPlusSyncRoutes } from "../src/modules/sync/tagplus-sync-routes.js";
import { CustomerSyncError } from "../src/modules/customers/customer-full-sync.js";

const TEST_CONNECTION_ID = "00000000-0000-4000-8000-000000000001";

function createTestHarness(options?: {
  tokenAvailable?: boolean;
  pingError?: Error;
  categoryAuthError?: boolean;
  categoryError?: boolean;
  isLocalEnvironment?: boolean;
}) {
  const tokenStore = createTagPlusOAuthTokenStore({ filePath: null });
  if (options?.tokenAvailable !== false) {
    tokenStore.set({ accessToken: "synthetic-preflight-token" });
  }

  const categoryRunner: CategoryRunnerLike = {
    preflight: vi.fn().mockResolvedValue({ status: "READY" }),
    ping: vi.fn().mockImplementation(async () => {
      if (options?.categoryAuthError) {
        throw new Error("O aplicativo não possui permissão para realizar a operação 'read:categorias'");
      }
      if (options?.categoryError) {
        throw new Error("Category connection failed");
      }
    }),
    run: vi.fn().mockResolvedValue({
      pagesFetched: 1,
      recordsFetched: 71,
      recordsInserted: 71,
      recordsUpdated: 0,
      recordsUnchanged: 0,
    }),
  };

  const customerRunner: CustomerRunnerLike = {
    preflight: vi.fn().mockResolvedValue({ status: "READY" }),
    ping: vi.fn().mockImplementation(async () => {
      if (options?.pingError) {
        throw options.pingError;
      }
    }),
    run: vi.fn().mockResolvedValue({
      pagesFetched: 1,
      recordsFetched: 10,
      recordsInserted: 0,
      recordsUpdated: 0,
      recordsUnchanged: 10,
      recordsNoLongerObserved: 0,
    }),
  };

  const productRunner: ProductRunnerLike = {
    preflight: vi.fn().mockResolvedValue({ status: "READY" }),
    run: vi.fn().mockResolvedValue({
      pagesFetched: 1,
      recordsFetched: 10,
      recordsInserted: 0,
      recordsUpdated: 0,
      recordsUnchanged: 10,
      recordsNoLongerObserved: 0,
    }),
  };

  const salesRunner: SalesRunnerLike = {
    preflight: vi.fn().mockResolvedValue({ status: "READY" }),
    run: vi.fn().mockResolvedValue({
      pedidos: { pagesFetched: 1, recordsFetched: 10, reconciledAbsent: 0 },
      vendasSimples: { pagesFetched: 1, recordsFetched: 5, reconciledAbsent: 0 },
      nfes: { pagesFetched: 1, recordsFetched: 2, reconciledAbsent: 0 },
    }),
  };

  let savedRun: any = null;

  const syncRepository: TagPlusSyncRepository = {
    recoverStaleRuns: vi.fn().mockResolvedValue({ tagplus: 0, customers: 0, products: 0 }),
    findRunning: vi.fn().mockResolvedValue(null),
    findActiveRun: vi.fn().mockResolvedValue(null),
    findLastCompleted: vi.fn().mockResolvedValue(null),
    findLastCompletedIncremental: vi.fn().mockResolvedValue(null),
    findLastCompletedFull: vi.fn().mockResolvedValue({
      id: "full-run-1",
      startedAt: new Date("2026-09-12T00:00:00Z"),
      completedAt: new Date("2026-09-12T00:30:00Z"),
    } as any),
    getRunById: vi.fn().mockResolvedValue(null),
    createRun: vi.fn().mockImplementation(async (_connId, startedAt, mode, window) => {
      savedRun = {
        id: "run-preflight-1",
        connectionId: TEST_CONNECTION_ID,
        status: TagPlusSyncStatus.RUNNING,
        currentStage: TagPlusSyncStage.CUSTOMERS,
        mode,
        startedAt,
        windowSince: window?.since ?? null,
        windowUntil: window?.until ?? null,
        errorCategory: null,
        errorMessage: null,
        completedAt: null,
      };
      return savedRun;
    }),
    updateStage: vi.fn().mockImplementation(async (_id, stage) => {
      if (savedRun) savedRun.currentStage = stage;
    }),
    completeRun: vi.fn().mockImplementation(async (_id, completedAt) => {
      if (savedRun) {
        savedRun.status = TagPlusSyncStatus.COMPLETED;
        savedRun.completedAt = completedAt;
      }
    }),
    failRun: vi.fn().mockImplementation(async (_id, failedAt, stage, errorCategory, errorMessage) => {
      if (savedRun) {
        savedRun.status = TagPlusSyncStatus.FAILED;
        savedRun.completedAt = failedAt;
        savedRun.errorStage = stage;
        savedRun.errorCategory = errorCategory;
        savedRun.errorMessage = errorMessage;
      }
    }),
  };

  const prisma = {
    tagPlusConnection: {
      findUnique: vi.fn().mockResolvedValue({
        id: TEST_CONNECTION_ID,
        status: "ACTIVE",
        apiVersion: "2.0",
      }),
    },
    tagPlusSyncRun: {
      findFirst: vi.fn().mockImplementation(async () => savedRun),
    },
  } as unknown as PrismaClient;

  const orchestrator = createTagPlusSyncOrchestrator({
    prisma,
    syncRepository,
    tokenStore,
    categoryRunner,
    customerRunner,
    productRunner,
    salesRunner,
    targetConnectionId: TEST_CONNECTION_ID,
    isLocalEnvironment: options?.isLocalEnvironment ?? true,
  });

  const app = Fastify({ logger: false });
  registerTagPlusSyncRoutes(app, orchestrator);

  return { app, orchestrator, categoryRunner, customerRunner, tokenStore, syncRepository };
}

describe("TagPlus Preflight & Auth Error Handling", () => {
  it("returns AUTH_REQUIRED with TOKEN_MISSING when access token is not available", async () => {
    const { app } = createTestHarness({ tokenAvailable: false });

    const response = await app.inject({
      method: "GET",
      url: "/api/sync/tagplus/preflight",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toEqual({
      status: "AUTH_REQUIRED",
      reason: "TOKEN_MISSING",
      message: "Autorização do TagPlus necessária",
      description: "Sua sessão expirou ou ainda não foi autorizada.",
      authorizeUrl: "/integrations/tagplus/authorize",
      isLocalEnvironment: true,
    });
  });

  it("returns CONNECTED when token is present and ping succeeds (HTTP 200)", async () => {
    const { app, customerRunner } = createTestHarness();

    const response = await app.inject({
      method: "GET",
      url: "/api/sync/tagplus/preflight",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toEqual({
      status: "CONNECTED",
      message: "TagPlus conectado",
      authorizeUrl: "/integrations/tagplus/authorize",
      isLocalEnvironment: true,
    });
    expect(customerRunner.ping).toHaveBeenCalledWith(TEST_CONNECTION_ID);
  });

  it("returns AUTH_REQUIRED with TOKEN_EXPIRED when ping fails with HTTP 401", async () => {
    const { app } = createTestHarness({
      pingError: new TagPlusHttpError(401),
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/sync/tagplus/preflight",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toEqual({
      status: "AUTH_REQUIRED",
      reason: "TOKEN_EXPIRED",
      message: "Autorização do TagPlus necessária",
      description: "Sua sessão expirou ou ainda não foi autorizada.",
      authorizeUrl: "/integrations/tagplus/authorize",
      isLocalEnvironment: true,
    });
  });

  it("returns AUTH_REQUIRED when ping fails with HTTP 403 (authorization)", async () => {
    const { app } = createTestHarness({
      pingError: new TagPlusHttpError(403),
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/sync/tagplus/preflight",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toEqual({
      status: "AUTH_REQUIRED",
      reason: "TOKEN_EXPIRED",
      message: "Autorização do TagPlus necessária",
      description: "Sua sessão expirou ou ainda não foi autorizada.",
      authorizeUrl: "/integrations/tagplus/authorize",
      isLocalEnvironment: true,
    });
  });

  it("returns ERROR with CONNECTION_FAILED for timeout, network or 500 without converting to auth error", async () => {
    const timeoutHarness = createTestHarness({
      pingError: new TagPlusTimeoutError(),
    });
    const timeoutRes = await timeoutHarness.app.inject({
      method: "GET",
      url: "/api/sync/tagplus/preflight",
    });
    expect(timeoutRes.statusCode).toBe(200);
    expect(timeoutRes.json()).toEqual({
      status: "ERROR",
      reason: "CONNECTION_FAILED",
      message: "Não foi possível conectar ao TagPlus.",
      description: "Verifique sua conexão e tente novamente.",
      authorizeUrl: "/integrations/tagplus/authorize",
      isLocalEnvironment: true,
    });

    const networkHarness = createTestHarness({
      pingError: new TagPlusNetworkError(),
    });
    const networkRes = await networkHarness.app.inject({
      method: "GET",
      url: "/api/sync/tagplus/preflight",
    });
    expect(networkRes.statusCode).toBe(200);
    expect(networkRes.json().status).toBe("ERROR");

    const serverErrorHarness = createTestHarness({
      pingError: new TagPlusHttpError(502),
    });
    const serverErrorRes = await serverErrorHarness.app.inject({
      method: "GET",
      url: "/api/sync/tagplus/preflight",
    });
    expect(serverErrorRes.statusCode).toBe(200);
    expect(serverErrorRes.json().status).toBe("ERROR");
  });

  it("reflects isLocalEnvironment false when not on local tunnel", async () => {
    const { app } = createTestHarness({
      isLocalEnvironment: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/sync/tagplus/preflight",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.isLocalEnvironment).toBe(false);
  });

  it("preserves cause when Customers fails with HTTP 401 and marks sync run with TAGPLUS_AUTH_EXPIRED and isAuthError: true", async () => {
    const chained401 = new CustomerSyncError(
      "CUSTOMER_SYNC_FETCH_ERROR",
      undefined,
      undefined,
      undefined,
      undefined,
      { cause: new TagPlusHttpError(401) },
    );

    // Verify isTagPlusAuthError detects chained cause
    expect(isTagPlusAuthError(chained401)).toBe(true);

    const { orchestrator, customerRunner, syncRepository } = createTestHarness();
    customerRunner.run = vi.fn().mockRejectedValue(chained401);

    await orchestrator.startSync({ mode: TagPlusSyncMode.INCREMENTAL });

    // Allow asynchronous pipeline to finish
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(syncRepository.failRun).toHaveBeenCalledWith(
      "run-preflight-1",
      expect.any(Date),
      TagPlusSyncStage.CUSTOMERS,
      "TAGPLUS_AUTH_EXPIRED",
      expect.any(String),
    );

    const status = await orchestrator.getStatus();
    expect(status.isRunning).toBe(false);
    expect(status.activeRun?.status).toBe(TagPlusSyncStatus.FAILED);
    expect(status.activeRun?.errorCategory).toBe("TAGPLUS_AUTH_EXPIRED");
    expect(status.activeRun?.isAuthError).toBe(true);
  });

  it("returns AUTH_REQUIRED when category ping fails with missing read:categorias scope", async () => {
    const { app } = createTestHarness({ categoryAuthError: true });

    const response = await app.inject({
      method: "GET",
      url: "/api/sync/tagplus/preflight",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("AUTH_REQUIRED");
    expect(body.description).toBe(
      "É necessário reautorizar o TagPlus para habilitar acesso às categorias.",
    );
  });

  it("returns CONNECTED when both category and customer checks succeed", async () => {
    const { app } = createTestHarness();

    const response = await app.inject({
      method: "GET",
      url: "/api/sync/tagplus/preflight",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("CONNECTED");
    expect(body.message).toBe("TagPlus conectado");
  });
});
