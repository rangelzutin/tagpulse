import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { loadEnv } from "../config/env.js";
import { createTagPlusClient } from "../integrations/tagplus/tagplus-client.js";
import { createTagPlusOAuthTokenStore } from "../integrations/tagplus/oauth-token-store.js";
import { refreshAccessToken } from "../integrations/tagplus/oauth.js";
import { ensureTagPlusConnection } from "./ensure-tagplus-connection.js";
import { createFinancialRecordRepository } from "../modules/financial/financial-record-repository.js";
import { createFinancialCatalogService } from "../modules/financial/financial-catalog-service.js";
import { createFinancialRecordWorker } from "../modules/financial/financial-record-worker.js";
import { runIncrementalSync } from "../modules/financial/financial-incremental-sync.js";

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
  const lookbackDaysRaw = options["lookback-days"] || options.lookbackDays;
  const lookbackDays = lookbackDaysRaw ? Number.parseInt(lookbackDaysRaw, 10) : 30;
  const since = options.since;
  const dryRun = options["dry-run"] === "true" || options.dryRun === "true";

  return { mode, limit, sourceId, lookbackDays, since, dryRun };
}

async function main() {
  const { mode, limit, sourceId, lookbackDays, since, dryRun } = parseArgs();
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

    const repository = createFinancialRecordRepository(prisma);

    if (mode === "status") {
      console.log("\n=== STATUS DO FINANCEIRO ===");
      const stats = await repository.getSyncStats(connection.id);
      console.log("\nSync Items (Checkpoint):");
      console.log(`  Total Catalogado : ${stats.syncItems.total}`);
      console.log(`  PENDING          : ${stats.syncItems.pending}`);
      console.log(`  PROCESSING       : ${stats.syncItems.processing}`);
      console.log(`  COMPLETED        : ${stats.syncItems.completed}`);
      console.log(`  FAILED           : ${stats.syncItems.failed}`);
      console.log(`  NOT_FOUND        : ${stats.syncItems.notFound}`);

      console.log("\nFinancial Records (Bruto):");
      console.log(`  Total Persistido : ${stats.records.total}`);
      console.log(`  Entradas         : ${stats.records.entradas}`);
      console.log(`  Saídas           : ${stats.records.saidas}`);
      console.log(`  Confirmados      : ${stats.records.confirmedTrue}`);
      console.log(`  Não Confirmados  : ${stats.records.confirmedFalse}`);
      return;
    }

    if (mode === "retry-failed") {
      console.log("\n=== RESETTING FAILED ITEMS TO PENDING ===");
      const resetCount = await repository.resetFailedItems(connection.id);
      console.log(`Reset ${resetCount} failed items back to PENDING.`);
      return;
    }

    if (mode === "catalog") {
      console.log("\n=== INICIANDO VARREDURA DE CATÁLOGO ===");
      console.log("Endpoint: GET /financeiros?page=N&per_page=100");
      console.log("Regra: Paginação prossegue até retorno explicitamente vazio []\n");

      const catalogService = createFinancialCatalogService(repository);
      const result = await catalogService.scanCatalog(connection.id, client, {
        onPageProgress: ({ page, pageCount, totalIdsSoFar, uniqueIdsSoFar }) => {
          if (page % 5 === 0 || pageCount === 0 || page === 1) {
            console.log(
              `  [Page ${page}] items: ${pageCount} | total: ${totalIdsSoFar} | unique: ${uniqueIdsSoFar}`,
            );
          }
        },
      });

      console.log("\n=== CATÁLOGO FINALIZADO COM SUCESSO ===");
      console.log(`  Pages scanned    : ${result.pages}`);
      console.log(`  IDs fetched      : ${result.idsFetched}`);
      console.log(`  Unique IDs       : ${result.uniqueIds}`);
      console.log(`  Duplicate IDs    : ${result.duplicateIds}`);
      console.log(`  Newly discovered : ${result.newlyDiscovered}`);
      console.log(`  Already known    : ${result.alreadyKnown}`);
      console.log(`  Unobserved marked: ${result.unobservedMarked}`);
      console.log(`  First sourceId   : ${result.firstSourceId}`);
      console.log(`  Last sourceId    : ${result.lastSourceId}`);
      console.log(`  Elapsed time     : ${(result.elapsedMs / 1000).toFixed(2)}s`);
      return;
    }

    if (mode === "backfill") {
      console.log("\n=== INICIANDO BACKFILL DE DETALHES ===");
      if (sourceId) {
        console.log(`Modo: ID Específico = ${sourceId}`);
      } else {
        console.log(`Modo: Fila de pendentes (limit: ${limit ?? "ilimitado"})`);
      }

      const worker = createFinancialRecordWorker({
        prisma,
        repository,
        getClient,
        updateClientToken,
        refreshToken: refreshTokenHandler,
      });

      const summary = await worker.processQueue(connection.id, {
        ...(limit !== undefined ? { limit } : {}),
        ...(sourceId ? { specificSourceId: sourceId } : {}),
        onProgress: ({ processed, completed, failed, notFound, lastSourceId, action }) => {
          console.log(
            `  [${action}] ID: ${lastSourceId} | processed: ${processed} (ok: ${completed}, fail: ${failed}, 404: ${notFound})`,
          );
        },
      });

      console.log("\n=== BACKFILL CONCLUÍDO ===");
      console.log(`  Processed : ${summary.processed}`);
      console.log(`  Completed : ${summary.completed}`);
      console.log(`  Failed    : ${summary.failed}`);
      console.log(`  Not Found : ${summary.notFound}`);
      console.log(`  Elapsed   : ${(summary.elapsedMs / 1000).toFixed(2)}s`);
      return;
    }

    if (mode === "incremental") {
      console.log("\n=== INCREMENTAL FINANCIAL SYNC ===");
      if (dryRun) {
        console.log("Modo: DRY RUN (somente descoberta e deduplicação, nenhuma alteração)");
      }

      const worker = createFinancialRecordWorker({
        prisma,
        repository,
        getClient,
        updateClientToken,
        refreshToken: refreshTokenHandler,
      });

      const report = await runIncrementalSync({
        prisma,
        repository,
        worker,
        getClient,
        connectionId: connection.id,
        lookbackDays,
        ...(since ? { since } : {}),
        dryRun,
        ...(limit !== undefined ? { limit } : {}),
        refreshToken: refreshTokenHandler,
        updateClientToken,
        onProgress: ({ processed, completed, failed, notFound, lastSourceId, action, recordAction }) => {
          const detailTag = recordAction ? ` (${recordAction})` : "";
          console.log(
            `  [${action}${detailTag}] ID: ${lastSourceId} | processed: ${processed} (completed: ${completed}, failed: ${failed}, 404: ${notFound})`,
          );
        },
      });

      console.log("\n==================================================");
      console.log("Incremental Financial Sync");
      console.log("==================================================");
      console.log(`Since: ${report.sinceDate}`);
      if (report.lookbackDays !== undefined) {
        console.log(`Lookback days: ${report.lookbackDays}`);
      }
      console.log("");
      console.log(`Recent candidates: ${report.candidates.recentCount}`);
      console.log(`Open candidates: ${report.candidates.openCount}`);
      console.log(`Undated candidates: ${report.candidates.undatedCount}`);
      console.log(`Unique candidates: ${report.candidates.uniqueCount}`);
      console.log(`Overlap deduplicated: ${report.candidates.overlapDeduplicated}`);

      if (report.dryRun) {
        console.log("\n[DRY RUN] Nenhuma alteração foi realizada.");
        console.log(`Duration: ${(report.durationMs / 1000).toFixed(2)}s`);
        return;
      }

      const ws = report.workerSummary!;
      console.log("");
      console.log(`Processed: ${ws.processed}`);
      console.log(`Completed: ${ws.completed}`);
      console.log(`Failed: ${ws.failed}`);
      console.log(`Not found: ${ws.notFound}`);
      console.log("");
      console.log(`New FinancialRecords: ${ws.inserted}`);
      console.log(`Updated FinancialRecords: ${ws.updated}`);
      console.log(`Unchanged FinancialRecords: ${ws.unchanged}`);
      console.log("");
      console.log(`Duration: ${(report.durationMs / 1000).toFixed(2)}s`);
      if (report.averageDetailRateMs) {
        console.log(`Average detail rate: ${report.averageDetailRateMs} ms/record`);
      }
      return;
    }

    console.error(`Modo desconhecido: ${mode}`);
    console.log("Opções válidas: --mode=incremental | --mode=catalog | --mode=backfill | --mode=status | --mode=retry-failed");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("\n❌ ERRO NA EXECUÇÃO:", msg);
  process.exitCode = 1;
});
