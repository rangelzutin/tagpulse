import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { createTagPlusOAuthTokenStore } from "../src/integrations/tagplus/oauth-token-store.js";
import { createProductionCustomerSyncRunner } from "../src/modules/customers/production-customer-sync.js";

const connectionId = "00000000-0000-4000-8000-000000000001";
const companyId = "00000000-0000-4000-8000-000000000002";

function harness(connection: object | null, withToken = true) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  const tokenStore = createTagPlusOAuthTokenStore();
  if (withToken) tokenStore.set({ accessToken: "synthetic-preflight-token" });
  const prisma = {
    tagPlusConnection: { findUnique: vi.fn().mockResolvedValue(connection) },
    customerSyncRun: { findFirst: vi.fn().mockResolvedValue(null) },
  } as unknown as PrismaClient;
  const runner = createProductionCustomerSyncRunner({
    prisma,
    tokenStore,
    config: {
      baseUrl: "https://api.example.invalid",
      databaseUrl: "postgresql://application.invalid/tagpulse",
      testDatabaseUrl: "postgresql://localhost:5434/tagpulse_test",
      fetch,
    },
  });
  return { runner, fetch, prisma, tokenStore };
}

const activeConnection = {
  id: connectionId,
  companyId,
  status: "ACTIVE",
  apiVersion: "2.0",
  company: { id: companyId },
};

describe("production customer sync preflight", () => {
  it("rejects a missing connection before fetch", async () => {
    const h = harness(null);
    await expect(h.runner.preflight(connectionId)).rejects.toMatchObject({
      category: "CUSTOMER_SYNC_CONNECTION_NOT_FOUND",
    });
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("rejects an inactive connection before fetch", async () => {
    const h = harness({ ...activeConnection, status: "DISABLED" });
    await expect(h.runner.preflight(connectionId)).rejects.toMatchObject({
      category: "CUSTOMER_SYNC_CONNECTION_INACTIVE",
    });
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("rejects a missing access token with a sanitized error", async () => {
    const h = harness(activeConnection, false);
    const error = await h.runner
      .preflight(connectionId)
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      category: "TAGPLUS_OAUTH_TOKEN_NOT_AVAILABLE",
    });
    expect(JSON.stringify(error)).not.toContain("synthetic-preflight-token");
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("validates composition without starting a sync or fetch", async () => {
    const h = harness(activeConnection);
    await expect(h.runner.preflight(connectionId)).resolves.toEqual({
      status: "READY",
      connectionId,
      companyId,
      apiVersion: "2.0",
      runningSyncExists: false,
      accessTokenAvailable: true,
    });
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("rejects test database targets before querying or fetching", async () => {
    const h = harness(activeConnection);
    const unsafe = createProductionCustomerSyncRunner({
      prisma: h.prisma,
      tokenStore: h.tokenStore,
      config: {
        baseUrl: "https://api.example.invalid",
        databaseUrl: "postgresql://localhost:5434/tagpulse_test",
        fetch: h.fetch,
      },
    });
    await expect(unsafe.preflight(connectionId)).rejects.toMatchObject({
      category: "CUSTOMER_SYNC_UNSAFE_DATABASE",
    });
    expect(h.fetch).not.toHaveBeenCalled();
  });
});
