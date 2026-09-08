import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { createTagPlusOAuthTokenStore } from "../src/integrations/tagplus/oauth-token-store.js";
import { createTagPlusClient } from "../src/integrations/tagplus/tagplus-client.js";
import {
  createProductionSalesSyncRunner,
  NINECLOUDS_CONNECTION_ID,
  SALES_TAGPLUS_REQUEST_TIMEOUT_MS,
  type ProductionSalesSyncConfig,
} from "../src/modules/sales/production-sales-sync.js";
import type { SalesFullSyncResult } from "../src/modules/sales/sales-full-sync.js";

const connectionId = NINECLOUDS_CONNECTION_ID;
const companyId = "00000000-0000-4000-8000-000000000002";

const activeConnection = {
  id: connectionId,
  companyId,
  status: "ACTIVE",
  apiVersion: "2.0",
  company: { id: companyId },
};

const validScopes =
  "read:clientes read:produtos read:pedidos read:vendas_simples read:nfes";

function createHarness(options?: {
  connection?: object | null;
  withToken?: boolean;
  scopes?: string;
  syncResult?: SalesFullSyncResult;
  configOverrides?: Partial<ProductionSalesSyncConfig>;
  clientFactory?: typeof createTagPlusClient;
}) {
  const connection =
    options?.connection !== undefined ? options.connection : activeConnection;
  const withToken = options?.withToken ?? true;
  const scopes = options?.scopes ?? validScopes;

  const fetch = vi.fn<typeof globalThis.fetch>();
  const tokenStore = createTagPlusOAuthTokenStore();
  if (withToken) tokenStore.set({ accessToken: "synthetic-preflight-token" });

  const prisma = {
    tagPlusConnection: { findUnique: vi.fn().mockResolvedValue(connection) },
  } as unknown as PrismaClient;

  const mockSyncFn = vi.fn().mockResolvedValue(
    options?.syncResult ?? {
      status: "COMPLETED",
      startedAt: new Date("2026-09-07T12:00:00.000Z"),
      completedAt: new Date("2026-09-07T12:01:00.000Z"),
      pedidos: {
        resource: "pedidos",
        pagesFetched: 1,
        recordsFetched: 25,
        reconciledAbsent: 0,
        status: "COMPLETED",
      },
      vendasSimples: {
        resource: "vendas_simples",
        pagesFetched: 1,
        recordsFetched: 1,
        reconciledAbsent: 0,
        status: "COMPLETED",
      },
      nfes: {
        resource: "nfes",
        pagesFetched: 1,
        recordsFetched: 1,
        reconciledAbsent: 0,
        status: "COMPLETED",
      },
    },
  );

  const mockSyncFactory = vi.fn().mockReturnValue(mockSyncFn);
  const mockClientFactory =
    options?.clientFactory ?? vi.fn(createTagPlusClient);

  const runner = createProductionSalesSyncRunner({
    prisma,
    tokenStore,
    syncFactory: mockSyncFactory,
    clientFactory: mockClientFactory,
    config: {
      baseUrl: "https://api.example.invalid",
      databaseUrl: "postgresql://application.invalid/tagpulse",
      testDatabaseUrl: "postgresql://localhost:5434/tagpulse_test",
      scopes,
      fetch,
      ...options?.configOverrides,
    },
  });

  return {
    runner,
    fetch,
    prisma,
    tokenStore,
    mockSyncFn,
    mockSyncFactory,
    mockClientFactory,
  };
}

describe("production sales sync launcher", () => {
  describe("safety & preflight checks", () => {
    it("A. missing required sales scope prevents execution before any fetch or DB query", async () => {
      // Config missing read:pedidos, read:vendas_simples, read:nfes
      const h = createHarness({ scopes: "read:clientes read:produtos" });
      await expect(h.runner.preflight(connectionId)).rejects.toMatchObject({
        category: "TAGPLUS_SCOPES_MISSING_REQUIRED_SALES_SCOPES",
      });
      expect(h.fetch).not.toHaveBeenCalled();
      expect(h.prisma.tagPlusConnection.findUnique).not.toHaveBeenCalled();
    });

    it("A. partial sales scopes missing read:nfes also prevents execution", async () => {
      const h = createHarness({
        scopes: "read:clientes read:produtos read:pedidos read:vendas_simples",
      });
      await expect(h.runner.preflight(connectionId)).rejects.toMatchObject({
        category: "TAGPLUS_SCOPES_MISSING_REQUIRED_SALES_SCOPES",
      });
      expect(h.fetch).not.toHaveBeenCalled();
    });

    it("B. missing TagPlus connection prevents execution", async () => {
      const h = createHarness({ connection: null });
      await expect(h.runner.preflight(connectionId)).rejects.toMatchObject({
        category: "SALES_SYNC_CONNECTION_NOT_FOUND",
      });
      expect(h.fetch).not.toHaveBeenCalled();
    });

    it("B. inactive TagPlus connection prevents execution", async () => {
      const h = createHarness({
        connection: { ...activeConnection, status: "DISABLED" },
      });
      await expect(h.runner.preflight(connectionId)).rejects.toMatchObject({
        category: "SALES_SYNC_CONNECTION_INACTIVE",
      });
      expect(h.fetch).not.toHaveBeenCalled();
    });

    it("B. missing OAuth token prevents execution", async () => {
      const h = createHarness({ withToken: false });
      await expect(h.runner.preflight(connectionId)).rejects.toMatchObject({
        category: "TAGPLUS_OAUTH_TOKEN_NOT_AVAILABLE",
      });
      expect(h.fetch).not.toHaveBeenCalled();
    });

    it("rejects test database targets before querying", async () => {
      const h = createHarness({
        configOverrides: {
          databaseUrl: "postgresql://localhost:5434/tagpulse_test",
        },
      });
      await expect(h.runner.preflight(connectionId)).rejects.toMatchObject({
        category: "SALES_SYNC_UNSAFE_DATABASE",
      });
      expect(h.fetch).not.toHaveBeenCalled();
    });

    it("rejects missing/empty connectionId with SALES_SYNC_CONNECTION_ID_REQUIRED", async () => {
      const h = createHarness();
      await expect(h.runner.preflight("")).rejects.toMatchObject({
        category: "SALES_SYNC_CONNECTION_ID_REQUIRED",
      });
      expect(h.fetch).not.toHaveBeenCalled();
    });

    it("enforces expected Nineclouds connection and rejects unauthorized connections", async () => {
      const h = createHarness();
      const unauthorizedId = "11111111-2222-3333-4444-555555555555";
      await expect(h.runner.preflight(unauthorizedId)).rejects.toMatchObject({
        category: "SALES_SYNC_CONNECTION_NOT_FOUND",
      });
      expect(h.fetch).not.toHaveBeenCalled();
    });

    it("preflight succeeds when all checks pass", async () => {
      const h = createHarness();
      const ready = await h.runner.preflight(connectionId);
      expect(ready).toEqual({
        status: "READY",
        connectionId,
        companyId,
        apiVersion: "2.0",
        runningSyncExists: false,
        accessTokenAvailable: true,
      });
      expect(h.fetch).not.toHaveBeenCalled();
    });
  });

  describe("execution delegation & factual result preservation", () => {
    it("C. successful launcher calls the approved sales sync exactly once for the explicit connection", async () => {
      const h = createHarness();
      const result = await h.runner.run(connectionId);

      expect(h.mockSyncFactory).toHaveBeenCalledTimes(1);
      expect(h.mockSyncFn).toHaveBeenCalledTimes(1);
      expect(h.mockSyncFn).toHaveBeenCalledWith(connectionId);
      expect(result.connectionId).toBe(connectionId);
      expect(result.status).toBe("COMPLETED");
    });

    it("D. result output preserves factual per-resource completion metrics", async () => {
      const h = createHarness();
      const result = await h.runner.run(connectionId);

      expect(result.pedidos).toEqual({
        resource: "pedidos",
        pagesFetched: 1,
        recordsFetched: 25,
        reconciledAbsent: 0,
        status: "COMPLETED",
      });
      expect(result.vendasSimples).toEqual({
        resource: "vendas_simples",
        pagesFetched: 1,
        recordsFetched: 1,
        reconciledAbsent: 0,
        status: "COMPLETED",
      });
      expect(result.nfes).toEqual({
        resource: "nfes",
        pagesFetched: 1,
        recordsFetched: 1,
        reconciledAbsent: 0,
        status: "COMPLETED",
      });
    });

    it("E. launcher does not contain or reimplement pagination/convergence logic; delegates to syncFactory", async () => {
      const h = createHarness();
      await h.runner.run(connectionId);

      // Verify syncFactory received fetchers and repository
      expect(h.mockSyncFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          pedidosFetcher: expect.any(Function),
          vendasSimplesFetcher: expect.any(Function),
          nfesFetcher: expect.any(Function),
          salesRepository: expect.any(Object),
        }),
      );
    });

    it("F. passes explicit 30s HTTP timeout (SALES_TAGPLUS_REQUEST_TIMEOUT_MS) to createTagPlusClient", async () => {
      const h = createHarness();
      await h.runner.run(connectionId);

      expect(SALES_TAGPLUS_REQUEST_TIMEOUT_MS).toBe(30_000);
      expect(h.mockClientFactory).toHaveBeenCalledWith({
        baseUrl: "https://api.example.invalid",
        apiVersion: "2.0",
        accessToken: "synthetic-preflight-token",
        timeoutMs: 30_000,
        fetch: h.fetch,
      });
    });

    it("F. client created by default runner enforces 30s timeout without aborting at 10s", async () => {
      vi.useFakeTimers();
      try {
        let capturedSignal: AbortSignal | undefined;
        const delayedFetch = vi.fn<typeof globalThis.fetch>((_input, init) => {
          capturedSignal = init?.signal ?? undefined;
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          });
        });

        let capturedPedidosFetcher:
          | ((connectionId: string, page: number) => Promise<unknown>)
          | undefined;
        const customSyncFactory = vi.fn().mockImplementation(
          (deps: {
            pedidosFetcher: (c: string, page: number) => Promise<unknown>;
          }) => {
            capturedPedidosFetcher = deps.pedidosFetcher;
            return vi.fn().mockResolvedValue({ status: "COMPLETED" });
          },
        );

        const prisma = {
          tagPlusConnection: {
            findUnique: vi.fn().mockResolvedValue(activeConnection),
          },
        } as unknown as PrismaClient;
        const tokenStore = createTagPlusOAuthTokenStore();
        tokenStore.set({ accessToken: "synthetic-preflight-token" });

        // Runner without clientFactory option, exercising default createTagPlusClient
        const runner = createProductionSalesSyncRunner({
          prisma,
          tokenStore,
          syncFactory: customSyncFactory as unknown as typeof createSalesFullSync,
          config: {
            baseUrl: "https://api.example.invalid",
            databaseUrl: "postgresql://application.invalid/tagpulse",
            scopes: validScopes,
            fetch: delayedFetch,
          },
        });

        await runner.run(connectionId);
        expect(capturedPedidosFetcher).toBeDefined();

        // Initiate request via fetcher built with default client
        const fetchPromise = capturedPedidosFetcher!(connectionId, 1);

        // Advance 10s: default client timeout of 10s has passed, but this client must still be pending
        vi.advanceTimersByTime(10_000);
        expect(capturedSignal?.aborted).toBe(false);

        // Advance another 20s to reach 30s: now it aborts
        vi.advanceTimersByTime(20_000);
        expect(capturedSignal?.aborted).toBe(true);

        await expect(fetchPromise).rejects.toThrow("TagPlus request timed out");
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
