import type { PrismaClient } from "@prisma/client";
import type { TagPlusOAuthTokenStore } from "../../integrations/tagplus/oauth-token-store.js";
import { createTagPlusCustomerPageFetcher } from "../../integrations/tagplus/customers/customer-page-fetcher.js";
import { createTagPlusClient } from "../../integrations/tagplus/tagplus-client.js";
import { createCustomerFullSync } from "./customer-full-sync.js";
import { createCustomerRepository } from "./customer-repository.js";
import { createCustomerSyncRepository } from "./customer-sync-repository.js";

export type ProductionCustomerSyncErrorCategory =
  | "CUSTOMER_SYNC_CONNECTION_NOT_FOUND"
  | "CUSTOMER_SYNC_CONNECTION_INACTIVE"
  | "CUSTOMER_SYNC_ALREADY_RUNNING"
  | "TAGPLUS_OAUTH_TOKEN_NOT_AVAILABLE"
  | "CUSTOMER_SYNC_UNSAFE_DATABASE";

export class ProductionCustomerSyncError extends Error {
  constructor(public readonly category: ProductionCustomerSyncErrorCategory) {
    super(category);
    this.name = "ProductionCustomerSyncError";
  }
}

export interface ProductionCustomerSyncConfig {
  baseUrl: string;
  databaseUrl: string;
  testDatabaseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export interface CustomerSyncPreflightResult {
  status: "READY";
  connectionId: string;
  companyId: string;
  apiVersion: string;
  runningSyncExists: false;
  accessTokenAvailable: true;
}

export function createProductionCustomerSyncRunner(input: {
  prisma: PrismaClient;
  tokenStore: TagPlusOAuthTokenStore;
  config: ProductionCustomerSyncConfig;
}) {
  async function preflight(
    connectionId: string,
  ): Promise<CustomerSyncPreflightResult> {
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
    if (!connection)
      throw new ProductionCustomerSyncError(
        "CUSTOMER_SYNC_CONNECTION_NOT_FOUND",
      );
    if (connection.status !== "ACTIVE")
      throw new ProductionCustomerSyncError(
        "CUSTOMER_SYNC_CONNECTION_INACTIVE",
      );
    const running = await input.prisma.customerSyncRun.findFirst({
      where: { connectionId, status: "RUNNING" },
      select: { id: true },
    });
    if (running)
      throw new ProductionCustomerSyncError("CUSTOMER_SYNC_ALREADY_RUNNING");
    if (!input.tokenStore.get()?.accessToken)
      throw new ProductionCustomerSyncError(
        "TAGPLUS_OAUTH_TOKEN_NOT_AVAILABLE",
      );
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
      if (!tokens?.accessToken)
        throw new ProductionCustomerSyncError(
          "TAGPLUS_OAUTH_TOKEN_NOT_AVAILABLE",
        );
      const client = createTagPlusClient({
        baseUrl: input.config.baseUrl,
        apiVersion: ready.apiVersion,
        accessToken: tokens.accessToken,
        ...(input.config.fetch ? { fetch: input.config.fetch } : {}),
      });
      return createCustomerFullSync({
        pageFetcher: createTagPlusCustomerPageFetcher(client),
        customerRepository: createCustomerRepository(input.prisma),
        syncRepository: createCustomerSyncRepository(input.prisma),
      })(connectionId);
    },
  };
}

function assertApplicationDatabase(config: ProductionCustomerSyncConfig): void {
  let application: URL;
  try {
    application = new URL(config.databaseUrl);
  } catch {
    throw new ProductionCustomerSyncError("CUSTOMER_SYNC_UNSAFE_DATABASE");
  }
  const testName = application.pathname.toLowerCase().includes("tagpulse_test");
  const localTestPort =
    application.hostname === "localhost" && application.port === "5434";
  const sameAsTest = config.testDatabaseUrl
    ? sanitizeUrl(config.databaseUrl) === sanitizeUrl(config.testDatabaseUrl)
    : false;
  if (testName || localTestPort || sameAsTest)
    throw new ProductionCustomerSyncError("CUSTOMER_SYNC_UNSAFE_DATABASE");
}

function sanitizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}
