import type { PrismaClient } from "@prisma/client";
import type { TagPlusOAuthTokenStore } from "../../integrations/tagplus/oauth-token-store.js";
import { createTagPlusCategoryPageFetcher } from "../../integrations/tagplus/categories/category-page-fetcher.js";
import { createTagPlusClient } from "../../integrations/tagplus/tagplus-client.js";
import {
  createCategoryFullSync,
  type CategoryFullSyncOptions,
  type CategorySyncResult,
} from "./category-full-sync.js";
import { createCategoryRepository } from "./category-repository.js";

export type ProductionCategorySyncErrorCategory =
  | "CATEGORY_SYNC_CONNECTION_NOT_FOUND"
  | "CATEGORY_SYNC_CONNECTION_INACTIVE"
  | "TAGPLUS_OAUTH_TOKEN_NOT_AVAILABLE"
  | "TAGPLUS_AUTH_SCOPE_REQUIRED"
  | "TAGPLUS_AUTH_EXPIRED"
  | "CATEGORY_SYNC_FETCH_ERROR";

export class ProductionCategorySyncError extends Error {
  constructor(
    public readonly category: ProductionCategorySyncErrorCategory,
    message?: string,
    public readonly cause?: unknown,
  ) {
    super(message ?? category);
    this.name = "ProductionCategorySyncError";
  }
}

export interface ProductionCategorySyncConfig {
  baseUrl: string;
  databaseUrl: string;
  testDatabaseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export function createProductionCategorySyncRunner(input: {
  prisma: PrismaClient;
  tokenStore: TagPlusOAuthTokenStore;
  config: ProductionCategorySyncConfig;
}) {
  const repository = createCategoryRepository(input.prisma);

  async function resolveConnection(connectionId: string) {
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
      throw new ProductionCategorySyncError(
        "CATEGORY_SYNC_CONNECTION_NOT_FOUND",
      );
    }
    if (connection.status !== "ACTIVE") {
      throw new ProductionCategorySyncError(
        "CATEGORY_SYNC_CONNECTION_INACTIVE",
      );
    }

    const tokens = input.tokenStore.get();
    if (!tokens?.accessToken) {
      throw new ProductionCategorySyncError(
        "TAGPLUS_OAUTH_TOKEN_NOT_AVAILABLE",
      );
    }

    return { connection, tokens };
  }

  async function ping(connectionId: string): Promise<void> {
    const { connection, tokens } = await resolveConnection(connectionId);

    const client = createTagPlusClient({
      baseUrl: input.config.baseUrl,
      apiVersion: connection.apiVersion,
      accessToken: tokens.accessToken,
      ...(input.config.fetch ? { fetch: input.config.fetch } : {}),
    });

    try {
      await client.get("/categorias?page=1&per_page=1");
    } catch (error: any) {
      const msg = error?.message?.toLowerCase() ?? "";
      const status = error?.status ?? error?.statusCode;
      if (
        status === 401 ||
        status === 403 ||
        msg.includes("read:categorias") ||
        msg.includes("permiss") ||
        msg.includes("escopo") ||
        msg.includes("scope")
      ) {
        throw new ProductionCategorySyncError(
          "TAGPLUS_AUTH_SCOPE_REQUIRED",
          "É necessário reautorizar o TagPlus para habilitar acesso às categorias.",
          error,
        );
      }
      throw error;
    }
  }

  async function preflight(connectionId: string): Promise<{
    status: "READY";
    connectionId: string;
    apiVersion: string;
    accessTokenAvailable: true;
  }> {
    const { connection } = await resolveConnection(connectionId);
    await ping(connectionId);
    return {
      status: "READY",
      connectionId: connection.id,
      apiVersion: connection.apiVersion,
      accessTokenAvailable: true,
    };
  }

  async function run(
    connectionId: string,
    options?: CategoryFullSyncOptions,
  ): Promise<CategorySyncResult> {
    const { connection, tokens } = await resolveConnection(connectionId);

    const client = createTagPlusClient({
      baseUrl: input.config.baseUrl,
      apiVersion: connection.apiVersion,
      accessToken: tokens.accessToken,
      ...(input.config.fetch ? { fetch: input.config.fetch } : {}),
    });

    const fetcher = createTagPlusCategoryPageFetcher(client);
    const sync = createCategoryFullSync({ fetcher, repository });

    try {
      return await sync(connectionId, options);
    } catch (error: any) {
      const msg = error?.message?.toLowerCase() ?? "";
      const status = error?.status ?? error?.statusCode;
      if (
        status === 401 ||
        status === 403 ||
        msg.includes("read:categorias") ||
        msg.includes("permiss") ||
        msg.includes("escopo") ||
        msg.includes("scope")
      ) {
        throw new ProductionCategorySyncError(
          "TAGPLUS_AUTH_SCOPE_REQUIRED",
          "É necessário reautorizar o TagPlus para habilitar acesso às categorias.",
          error,
        );
      }
      throw error;
    }
  }

  return {
    ping,
    preflight,
    run,
    repository,
  };
}
