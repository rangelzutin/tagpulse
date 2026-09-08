import type { PrismaClient } from "@prisma/client";
import type { TagPlusOAuthTokenStore } from "../../integrations/tagplus/oauth-token-store.js";
import {
  createTagPlusClient,
  TagPlusHttpError,
} from "../../integrations/tagplus/tagplus-client.js";
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
  | "SALES_SYNC_SOURCE_ID_REQUIRED"
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

export interface NfeDiagnosticItem {
  index: number;
  sourceItemId: string;
  sourceProductId: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string | null;
  subtotal: string;
}

export interface NfeDuplicateItemId {
  sourceItemId: string;
  indexes: number[];
  count: number;
}

export interface NfeDiagnosticResult {
  status: "OK";
  nfeSourceId: string;
  numero: number | string | null;
  tipo: string | null;
  itemCount: number;
  duplicateSourceItemIds: NfeDuplicateItemId[];
  items: NfeDiagnosticItem[];
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
    async inspectNfe(
      targetConnectionId: string,
      sourceId: string,
    ): Promise<NfeDiagnosticResult> {
      if (
        !sourceId ||
        typeof sourceId !== "string" ||
        !sourceId.trim() ||
        !/^\d+$/.test(sourceId.trim())
      ) {
        throw new ProductionSalesSyncError(
          "SALES_SYNC_SOURCE_ID_REQUIRED",
          "Explicit numeric sourceId is required for NFe inspection",
        );
      }
      const cleanSourceId = sourceId.trim();

      const ready = await preflight(targetConnectionId);
      const tokens = input.tokenStore.get();
      if (!tokens?.accessToken) {
        throw new ProductionSalesSyncError("TAGPLUS_OAUTH_TOKEN_NOT_AVAILABLE");
      }

      const client = clientFactory({
        baseUrl: input.config.baseUrl,
        apiVersion: ready.apiVersion,
        accessToken: tokens.accessToken,
        timeoutMs: SALES_TAGPLUS_REQUEST_TIMEOUT_MS,
        ...(input.config.fetch ? { fetch: input.config.fetch } : {}),
      });

      let rawData: unknown;
      try {
        const response = await client.get<unknown>(
          `/nfes/${cleanSourceId}?fields=*`,
        );
        rawData = response.data;
      } catch (error: unknown) {
        if (error instanceof TagPlusHttpError && error.status === 404) {
          throw new ProductionSalesSyncError(
            "SALES_SYNC_ERROR",
            `NFe ${cleanSourceId} not found on TagPlus (HTTP 404)`,
          );
        }
        try {
          const fallback = await client.get<unknown>(`/nfes/${cleanSourceId}`);
          rawData = fallback.data;
        } catch {
          throw error;
        }
      }

      const recordCandidate =
        Array.isArray(rawData) && rawData.length === 1 ? rawData[0] : rawData;

      if (
        !recordCandidate ||
        typeof recordCandidate !== "object" ||
        Array.isArray(recordCandidate)
      ) {
        throw new ProductionSalesSyncError(
          "SALES_SYNC_ERROR",
          `Invalid response payload for NFe ${cleanSourceId}`,
        );
      }

      const record = recordCandidate as Record<string, unknown>;
      const rawItems = Array.isArray(record.itens) ? record.itens : [];

      const items: NfeDiagnosticItem[] = [];
      for (let i = 0; i < rawItems.length; i++) {
        const raw = rawItems[i];
        if (!raw || typeof raw !== "object") {
          items.push({
            index: i,
            sourceItemId: "INVALID_ITEM",
            sourceProductId: "UNKNOWN",
            quantity: "0",
            unitPrice: "0",
            discountAmount: null,
            subtotal: "0",
          });
          continue;
        }
        const item = raw as Record<string, unknown>;
        const sourceItemId = item.id != null ? String(item.id) : "MISSING_ID";
        const prodObj = item.produto_servico;
        let sourceProductId = "UNKNOWN";
        if (
          prodObj &&
          typeof prodObj === "object" &&
          (prodObj as Record<string, unknown>).id != null
        ) {
          sourceProductId = String((prodObj as Record<string, unknown>).id);
        } else if (item.produto_servico_id != null) {
          sourceProductId = String(item.produto_servico_id);
        }

        items.push({
          index: i,
          sourceItemId,
          sourceProductId,
          quantity: item.qtd != null ? String(item.qtd) : "0",
          unitPrice:
            item.valor_unitario != null ? String(item.valor_unitario) : "0",
          discountAmount:
            item.valor_desconto != null ? String(item.valor_desconto) : null,
          subtotal:
            item.valor_subtotal != null ? String(item.valor_subtotal) : "0",
        });
      }

      const occurrenceMap = new Map<string, number[]>();
      for (const item of items) {
        const existing = occurrenceMap.get(item.sourceItemId) ?? [];
        existing.push(item.index);
        occurrenceMap.set(item.sourceItemId, existing);
      }

      const duplicateSourceItemIds: NfeDuplicateItemId[] = [];
      for (const [sId, indexes] of occurrenceMap.entries()) {
        if (indexes.length > 1) {
          duplicateSourceItemIds.push({
            sourceItemId: sId,
            indexes,
            count: indexes.length,
          });
        }
      }
      duplicateSourceItemIds.sort(
        (a, b) => (a.indexes[0] ?? 0) - (b.indexes[0] ?? 0),
      );

      return {
        status: "OK",
        nfeSourceId: record.id != null ? String(record.id) : cleanSourceId,
        numero: record.numero != null ? Number(record.numero) : null,
        tipo: record.tipo != null ? String(record.tipo) : null,
        itemCount: items.length,
        duplicateSourceItemIds,
        items,
      };
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
