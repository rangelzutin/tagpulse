import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { loadEnv } from "../config/env.js";
import { createTagPlusClient } from "../integrations/tagplus/tagplus-client.js";
import { createTagPlusOAuthTokenStore } from "../integrations/tagplus/oauth-token-store.js";
import { refreshAccessToken } from "../integrations/tagplus/oauth.js";
import { ensureTagPlusConnection } from "./ensure-tagplus-connection.js";
import {
  createStockAdjustmentRepository,
  createStockAdjustmentSyncRunner,
} from "../modules/stock-adjustments/index.js";

function parseArgs() {
  const args = process.argv.slice(2);
  const options: Record<string, string> = {};

  for (const arg of args) {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      if (key) {
        options[key] = value ?? "true";
      }
    }
  }

  const mode = options.mode || "status";
  const limit = options.limit ? Number.parseInt(options.limit, 10) : undefined;
  const sourceId = options["source-id"] || options.sourceId;
  const rateLimitDelayMs = options["delay-ms"] ? Number.parseInt(options["delay-ms"], 10) : 1200;

  return { mode, limit, sourceId, rateLimitDelayMs };
}

async function main() {
  const { mode, limit, sourceId, rateLimitDelayMs } = parseArgs();
  const env = loadEnv();
  const prisma = new PrismaClient();

  try {
    const connection = await ensureTagPlusConnection(prisma);
    console.log(`Connection resolved: id: ${connection.id}`);

    const tokenStore = createTagPlusOAuthTokenStore();
    const currentTokens = tokenStore.get();
    let accessToken = currentTokens?.accessToken || env.TAGPLUS_ACCESS_TOKEN;

    if (!accessToken) {
      throw new Error("No TagPlus OAuth access token available");
    }

    let client = createTagPlusClient({
      baseUrl: env.TAGPLUS_BASE_URL,
      apiVersion: connection.apiVersion,
      accessToken,
    });

    const getClient = () => client;
    const updateClientToken = (newToken: string) => {
      accessToken = newToken;
      client = createTagPlusClient({
        baseUrl: env.TAGPLUS_BASE_URL,
        apiVersion: connection.apiVersion,
        accessToken,
      });
    };

    const refreshTokenHandler = async (): Promise<string | null> => {
      const tokens = tokenStore.get();
      if (!tokens?.refreshToken) {
        console.warn("[AUTH] No refresh token available in token store.");
        return null;
      }
      console.log("[AUTH] Refreshing access token via refresh token...");
      try {
        const refreshed = await refreshAccessToken(
          {
            baseUrl: env.TAGPLUS_BASE_URL,
            clientId: env.TAGPLUS_CLIENT_ID,
            clientSecret: env.TAGPLUS_CLIENT_SECRET,
          },
          tokens.refreshToken,
        );
        tokenStore.set(refreshed);
        console.log("[AUTH] Token successfully refreshed.");
        return refreshed.accessToken;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[AUTH] Failed to refresh token:", msg);
        return null;
      }
    };

    const repository = createStockAdjustmentRepository(prisma);
    const runner = createStockAdjustmentSyncRunner({
      prisma,
      repository,
      getClient,
      updateClientToken,
      refreshToken: refreshTokenHandler,
    });

    if (mode === "status") {
      console.log("\n=== STATUS DOS AJUSTES DE ESTOQUE ===");
      const stats = await repository.getStats(connection.id);
      console.log("Fila de sincronização (SyncItems):", stats.syncItems);
      console.log("Ajustes de estoque (StockAdjustments):", {
        total: stats.adjustments.total,
        porTipo: stats.adjustments.byType,
        sourcePresentTrue: stats.adjustments.sourcePresentTrue,
        sourcePresentFalse: stats.adjustments.sourcePresentFalse,
        hasInvoiceTrue: stats.adjustments.hasInvoiceTrue,
        hasInvoiceFalse: stats.adjustments.hasInvoiceFalse,
      });
      console.log("Itens de ajuste (StockAdjustmentItems):", stats.items);
      console.log("Vínculos com financeiro (FinancialLinks):", stats.financialLinks);
      return;
    }

    if (mode === "catalog") {
      console.log("\n=== CATALOG SCAN DE AJUSTES DE ESTOQUE ===");
      const result = await runner.scanCatalog(connection.id, {
        onPageFetched: (page, count, total) => {
          console.log(`  Page ${page}: +${count} adjustments (Total so far: ${total})`);
        },
      });
      console.log("\n=== CATALOG SCAN CONCLUÍDO ===");
      console.log(`  Total descobertos   : ${result.totalDiscovered}`);
      console.log(`  Novos descobertos   : ${result.newlyDiscovered}`);
      console.log(`  Já conhecidos       : ${result.alreadyKnown}`);
      console.log(`  Páginas requisitadas: ${result.pagesFetched}`);
      console.log(`  Tempo decorrido     : ${(result.elapsedMs / 1000).toFixed(2)}s`);
      return;
    }

    if (mode === "backfill") {
      console.log("\n=== INICIANDO BACKFILL DE DETALHES DE AJUSTES ===");
      if (sourceId) {
        console.log(`Modo: ID Específico = ${sourceId}`);
      } else {
        console.log(`Modo: Fila de pendentes (limit: ${limit ?? "ilimitado"}, delay: ${rateLimitDelayMs}ms)`);
      }

      const summary = await runner.runBackfill(connection.id, {
        ...(limit !== undefined ? { limit } : {}),
        ...(sourceId ? { specificSourceId: sourceId } : {}),
        rateLimitDelayMs,
        onProgress: ({ processed, completed, failed, notFound, lastSourceId, action, recordAction }) => {
          console.log(
            `  [${action}${recordAction ? `:${recordAction}` : ""}] ID: ${lastSourceId} | processed: ${processed} (ok: ${completed}, fail: ${failed}, 404: ${notFound})`,
          );
        },
      });

      console.log("\n=== BACKFILL CONCLUÍDO ===");
      console.log(`  Processed : ${summary.processed}`);
      console.log(`  Completed : ${summary.completed}`);
      console.log(`  Failed    : ${summary.failed}`);
      console.log(`  Not Found : ${summary.notFound}`);
      console.log(`  Inserted  : ${summary.inserted}`);
      console.log(`  Updated   : ${summary.updated}`);
      console.log(`  Unchanged : ${summary.unchanged}`);
      console.log(`  Elapsed   : ${(summary.elapsedMs / 1000).toFixed(2)}s`);
      return;
    }

    if (mode === "full") {
      console.log("\n=== INICIANDO FULL SYNC DE AJUSTES DE ESTOQUE ===");
      const result = await runner.runFullSync(connection.id, {
        workerOptions: {
          ...(limit !== undefined ? { limit } : {}),
          rateLimitDelayMs,
          onProgress: ({ processed, completed, failed, notFound, lastSourceId, action, recordAction }) => {
            console.log(
              `  [${action}${recordAction ? `:${recordAction}` : ""}] ID: ${lastSourceId} | processed: ${processed} (ok: ${completed}, fail: ${failed}, 404: ${notFound})`,
            );
          },
        },
        onPageFetched: (page, count, total) => {
          console.log(`  Catalog Page ${page}: +${count} adjustments (Total so far: ${total})`);
        },
      });

      console.log("\n=== FULL SYNC CONCLUÍDO ===");
      console.log(`  Catalog Total : ${result.catalog.totalDiscovered} (${result.catalog.pagesFetched} páginas)`);
      console.log(`  Backfill Ok   : ${result.backfill.completed}`);
      console.log(`  Backfill Fail : ${result.backfill.failed}`);
      console.log(`  Reconciled    : ${result.unobservedReconciled} registros descontinuados`);
      console.log(`  Tempo total   : ${(result.elapsedMs / 1000).toFixed(2)}s`);
      return;
    }

    console.log(`Modo desconhecido: ${mode}`);
    console.log("Opções válidas: --mode=status | --mode=catalog | --mode=backfill | --mode=full");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
