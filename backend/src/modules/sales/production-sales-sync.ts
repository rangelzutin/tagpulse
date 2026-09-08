import type { PrismaClient } from "@prisma/client";
import type { TagPlusOAuthTokenStore } from "../../integrations/tagplus/oauth-token-store.js";
import { createTagPlusClient } from "../../integrations/tagplus/tagplus-client.js";
import {
  createTagPlusNfesPageFetcher,
  createTagPlusPedidosPageFetcher,
  createTagPlusVendasSimplesPageFetcher,
} from "../../integrations/tagplus/sales/sales-page-fetchers.js";
import {
  createSalesFullSync,
  type SalesFullSyncResult,
} from "./sales-full-sync.js";
import { createSalesRepository } from "./sales-repository.js";

export const NINECLOUDS_CONNECTION_ID = "8e1d662c-c9f3-4fee-9618-bb984573fa2a";

export const REQUIRED_SALES_SCOPES = [
  "read:pedidos",
  "read:vendas_simples",
  "read:nfes",
] as const;

export const SALES_TAGPLUS_REQUEST_TIMEOUT_MS = 30_000;

export type ProductionSalesSyncErrorCategory =
  | "SALES_SYNC_CONNECTION_NOT_FOUND"
  | "SALES_SYNC_CONNECTION_INACTIVE"
  | "SALES_SYNC_ALREADY_RUNNING"
  | "TAGPLUS_OAUTH_TOKEN_NOT_AVAILABLE"
  | "TAGPLUS_SCOPES_MISSING_REQUIRED_SALES_SCOPES"
  | "SALES_SYNC_UNSAFE_DATABASE"
  | "SALES_SYNC_CONNECTION_ID_REQUIRED"
  | "SALES_SYNC_ERROR";

export class ProductionSalesSyncError extends Error {
  constructor(
    public readonly category: ProductionSalesSyncErrorCategory,
    message?: string,
  ) {
    super(message ?? category);
    this.name = "ProductionSalesSyncError";
  }
}

export interface ProductionSalesSyncConfig {
  baseUrl: string;
  databaseUrl: string;
  scopes?: string;
  testDatabaseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export interface SalesSyncPreflightResult {
  status: "READY";
  connectionId: string;
  companyId: string;
  apiVersion: string;
  runningSyncExists: false;
  accessTokenAvailable: true;
}

export interface ProductionSalesSyncRunResult extends SalesFullSyncResult {
  connectionId: string;
}

export function createProductionSalesSyncRunner(input: {
  prisma: PrismaClient;
  tokenStore: TagPlusOAuthTokenStore;
  config: ProductionSalesSyncConfig;
  syncFactory?: typeof createSalesFullSync;
  clientFactory?: typeof createTagPlusClient;
}) {
  let isRunning = false;
  const syncFactory = input.syncFactory ?? createSalesFullSync;
  const clientFactory = input.clientFactory ?? createTagPlusClient;

  async function preflight(
    targetConnectionId: string,
  ): Promise<SalesSyncPreflightResult> {
    assertApplicationDatabase(input.config);
    assertRequiredScopes(input.config.scopes);

    if (!targetConnectionId || typeof targetConnectionId !== "string" || !targetConnectionId.trim()) {
      throw new ProductionSalesSyncError("SALES_SYNC_CONNECTION_ID_REQUIRED");
    }

    if (targetConnectionId !== NINECLOUDS_CONNECTION_ID) {
      throw new ProductionSalesSyncError(
        "SALES_SYNC_CONNECTION_NOT_FOUND",
        `Only Nineclouds connection is authorized for sales sync: ${NINECLOUDS_CONNECTION_ID}`,
      );
    }

    const connection = await input.prisma.tagPlusConnection.findUnique({
      where: { id: targetConnectionId },
      select: {
        id: true,
        companyId: true,
        status: true,
        apiVersion: true,
        company: { select: { id: true } },
      },
    });

    if (!connection) {
      throw new ProductionSalesSyncError("SALES_SYNC_CONNECTION_NOT_FOUND");
    }
    if (connection.status !== "ACTIVE") {
      throw new ProductionSalesSyncError("SALES_SYNC_CONNECTION_INACTIVE");
    }
    if (isRunning) {
      throw new ProductionSalesSyncError("SALES_SYNC_ALREADY_RUNNING");
    }
    if (!input.tokenStore.get()?.accessToken) {
      throw new ProductionSalesSyncError("TAGPLUS_OAUTH_TOKEN_NOT_AVAILABLE");
    }

    return {
      status: "READY",
      connectionId: connection.id,
      companyId: connection.company.id,
      apiVersion: connection.apiVersion,
      runningSyncExists: false,
      accessTokenAvailable: true,
    };
  }

  return {
    preflight,
    async run(
      targetConnectionId: string,
    ): Promise<ProductionSalesSyncRunResult> {
      const ready = await preflight(targetConnectionId);
      const tokens = input.tokenStore.get();
      if (!tokens?.accessToken) {
        throw new ProductionSalesSyncError("TAGPLUS_OAUTH_TOKEN_NOT_AVAILABLE");
      }

      isRunning = true;
      try {
        const client = clientFactory({
          baseUrl: input.config.baseUrl,
          apiVersion: ready.apiVersion,
          accessToken: tokens.accessToken,
          timeoutMs: SALES_TAGPLUS_REQUEST_TIMEOUT_MS,
          ...(input.config.fetch ? { fetch: input.config.fetch } : {}),
        });

        const sync = syncFactory({
          pedidosFetcher: createTagPlusPedidosPageFetcher(client),
          vendasSimplesFetcher: createTagPlusVendasSimplesPageFetcher(client),
          nfesFetcher: createTagPlusNfesPageFetcher(client),
          salesRepository: createSalesRepository(input.prisma),
        });

        const result = await sync(ready.connectionId);
        return {
          connectionId: ready.connectionId,
          ...result,
        };
      } finally {
        isRunning = false;
      }
    },
  };
}

function assertRequiredScopes(configuredScopesRaw?: string): void {
  const configuredScopes = (configuredScopesRaw ?? "")
    .split(/\s+/)
    .filter(Boolean);
  const missing = REQUIRED_SALES_SCOPES.filter(
    (s) => !configuredScopes.includes(s),
  );
  if (missing.length > 0) {
    throw new ProductionSalesSyncError(
      "TAGPLUS_SCOPES_MISSING_REQUIRED_SALES_SCOPES",
      `Configured TAGPLUS_SCOPES missing required sales scopes: ${missing.join(", ")}`,
    );
  }
}

function assertApplicationDatabase(config: ProductionSalesSyncConfig): void {
  let application: URL;
  try {
    application = new URL(config.databaseUrl);
  } catch {
    throw new ProductionSalesSyncError("SALES_SYNC_UNSAFE_DATABASE");
  }
  const testName = application.pathname.toLowerCase().includes("tagpulse_test");
  const localTestPort =
    application.hostname === "localhost" && application.port === "5434";
  const sameAsTest = config.testDatabaseUrl
    ? sanitizeUrl(config.databaseUrl) === sanitizeUrl(config.testDatabaseUrl)
    : false;
  if (testName || localTestPort || sameAsTest) {
    throw new ProductionSalesSyncError("SALES_SYNC_UNSAFE_DATABASE");
  }
}

function sanitizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}
