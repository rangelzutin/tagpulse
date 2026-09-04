import type { PrismaClient } from "@prisma/client";
import type { TagPlusOAuthTokenStore } from "../../integrations/tagplus/oauth-token-store.js";
import { createTagPlusProductPageFetcher } from "../../integrations/tagplus/products/product-page-fetcher.js";
import { createTagPlusClient } from "../../integrations/tagplus/tagplus-client.js";
import { createProductFullSync } from "./product-full-sync.js";
import { createProductRepository } from "./product-repository.js";
import { createProductSyncRepository } from "./product-sync-repository.js";

export type ProductionProductSyncErrorCategory =
  | "PRODUCT_SYNC_CONNECTION_NOT_FOUND"
  | "PRODUCT_SYNC_CONNECTION_INACTIVE"
  | "PRODUCT_SYNC_ALREADY_RUNNING"
  | "TAGPLUS_OAUTH_TOKEN_NOT_AVAILABLE"
  | "PRODUCT_SYNC_UNSAFE_DATABASE";

export class ProductionProductSyncError extends Error {
  constructor(public readonly category: ProductionProductSyncErrorCategory) {
    super(category);
    this.name = "ProductionProductSyncError";
  }
}

export interface ProductionProductSyncConfig {
  baseUrl: string;
  databaseUrl: string;
  testDatabaseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export interface ProductSyncPreflightResult {
  status: "READY";
  connectionId: string;
  companyId: string;
  apiVersion: string;
  runningSyncExists: false;
  accessTokenAvailable: true;
}

export function createProductionProductSyncRunner(input: {
  prisma: PrismaClient;
  tokenStore: TagPlusOAuthTokenStore;
  config: ProductionProductSyncConfig;
}) {
  async function preflight(
    connectionId: string,
  ): Promise<ProductSyncPreflightResult> {
    assertApplicationDatabase(input.config);
    const connection = await input.prisma.tagPlusConnection.findUnique({
      where: { id: connectionId },
      select: {
        id: true,
        companyId: true,
        status: true,
        apiVersion: true,
        company: { select: { id: true } },
      },
    });
    if (!connection) {
      throw new ProductionProductSyncError("PRODUCT_SYNC_CONNECTION_NOT_FOUND");
    }
    if (connection.status !== "ACTIVE") {
      throw new ProductionProductSyncError("PRODUCT_SYNC_CONNECTION_INACTIVE");
    }
    const running = await input.prisma.productSyncRun.findFirst({
      where: { connectionId, status: "RUNNING" },
      select: { id: true },
    });
    if (running) {
      throw new ProductionProductSyncError("PRODUCT_SYNC_ALREADY_RUNNING");
    }
    if (!input.tokenStore.get()?.accessToken) {
      throw new ProductionProductSyncError("TAGPLUS_OAUTH_TOKEN_NOT_AVAILABLE");
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
    async run(connectionId: string) {
      const ready = await preflight(connectionId);
      const tokens = input.tokenStore.get();
      if (!tokens?.accessToken) {
        throw new ProductionProductSyncError(
          "TAGPLUS_OAUTH_TOKEN_NOT_AVAILABLE",
        );
      }
      const client = createTagPlusClient({
        baseUrl: input.config.baseUrl,
        apiVersion: ready.apiVersion,
        accessToken: tokens.accessToken,
        ...(input.config.fetch ? { fetch: input.config.fetch } : {}),
      });
      return createProductFullSync({
        pageFetcher: createTagPlusProductPageFetcher(client),
        productRepository: createProductRepository(input.prisma),
        syncRepository: createProductSyncRepository(input.prisma),
      })(connectionId);
    },
  };
}

function assertApplicationDatabase(config: ProductionProductSyncConfig): void {
  let application: URL;
  try {
    application = new URL(config.databaseUrl);
  } catch {
    throw new ProductionProductSyncError("PRODUCT_SYNC_UNSAFE_DATABASE");
  }
  const testName = application.pathname.toLowerCase().includes("tagpulse_test");
  const localTestPort =
    application.hostname === "localhost" && application.port === "5434";
  const sameAsTest = config.testDatabaseUrl
    ? sanitizeUrl(config.databaseUrl) === sanitizeUrl(config.testDatabaseUrl)
    : false;
  if (testName || localTestPort || sameAsTest) {
    throw new ProductionProductSyncError("PRODUCT_SYNC_UNSAFE_DATABASE");
  }
}

function sanitizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}
