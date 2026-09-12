import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createDatabaseHealthChecker } from "./database/health.js";
import { prisma } from "./database/prisma.js";
import { createTagPlusOAuthTokenStore } from "./integrations/tagplus/oauth-token-store.js";
import { createBiRepository } from "./modules/bi/bi-repository.js";
import { registerCustomerSyncConsole } from "./modules/customers/customer-sync-console.js";
import { createProductionCustomerSyncRunner } from "./modules/customers/production-customer-sync.js";
import { registerProductSyncConsole } from "./modules/products/product-sync-console.js";
import { createProductionProductSyncRunner } from "./modules/products/production-product-sync.js";
import { registerSalesSyncConsole } from "./modules/sales/sales-sync-console.js";
import { createProductionSalesSyncRunner } from "./modules/sales/production-sales-sync.js";
import {
  createTagPlusSyncOrchestrator,
  createTagPlusSyncRepository,
} from "./modules/sync/index.js";

const env = loadEnv();
const tokenStore = createTagPlusOAuthTokenStore();

// Instanciação dos runners de produção
const customerRunner = createProductionCustomerSyncRunner({
  prisma,
  tokenStore,
  config: {
    baseUrl: env.TAGPLUS_BASE_URL,
    databaseUrl: env.DATABASE_URL,
    ...(env.TEST_DATABASE_URL
      ? { testDatabaseUrl: env.TEST_DATABASE_URL }
      : {}),
  },
});

const productRunner = createProductionProductSyncRunner({
  prisma,
  tokenStore,
  config: {
    baseUrl: env.TAGPLUS_BASE_URL,
    databaseUrl: env.DATABASE_URL,
    ...(env.TEST_DATABASE_URL
      ? { testDatabaseUrl: env.TEST_DATABASE_URL }
      : {}),
  },
});

const salesRunner = createProductionSalesSyncRunner({
  prisma,
  tokenStore,
  config: {
    baseUrl: env.TAGPLUS_BASE_URL,
    databaseUrl: env.DATABASE_URL,
    scopes: env.TAGPLUS_SCOPES,
    ...(env.TEST_DATABASE_URL
      ? { testDatabaseUrl: env.TEST_DATABASE_URL }
      : {}),
  },
});

// Repositório e Recuperação de Runs Órfãs (V1 Single Instance Premise)
const syncRepository = createTagPlusSyncRepository(prisma);
const staleRecovered = await syncRepository.recoverStaleRuns();
if (
  staleRecovered.tagplus > 0 ||
  staleRecovered.customers > 0 ||
  staleRecovered.products > 0
) {
  console.info(
    `[Startup Recovery] Runs órfãs anteriores recuperadas: ${staleRecovered.tagplus} TagPlus, ${staleRecovered.customers} Customers, ${staleRecovered.products} Products`,
  );
}

// Orquestrador TagPlus
const tagPlusSyncOrchestrator = createTagPlusSyncOrchestrator({
  prisma,
  syncRepository,
  tokenStore,
  customerRunner,
  productRunner,
  salesRunner,
});

const app = await buildApp({
  databaseHealth: createDatabaseHealthChecker(prisma),
  frontendUrl: env.FRONTEND_URL,
  biRepository: createBiRepository(prisma),
  tagPlusSyncOrchestrator,
  tagPlusOAuth: {
    config: {
      authUrl: env.TAGPLUS_AUTH_URL,
      baseUrl: env.TAGPLUS_BASE_URL,
      clientId: env.TAGPLUS_CLIENT_ID,
      clientSecret: env.TAGPLUS_CLIENT_SECRET,
      scopes: env.TAGPLUS_SCOPES,
      apiVersion: env.TAGPLUS_API_VERSION,
    },
    tokenStore,
  },
});

if (process.argv.includes("--customer-sync-console")) {
  registerCustomerSyncConsole(customerRunner);
}

if (process.argv.includes("--product-sync-console")) {
  registerProductSyncConsole(productRunner);
}

if (process.argv.includes("--sales-sync-console")) {
  registerSalesSyncConsole(salesRunner);
}

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "Application shutdown started");

  try {
    await app.close();
    await prisma.$disconnect();
    app.log.info("Application shutdown completed");
    process.exitCode = 0;
  } catch (error: unknown) {
    app.log.error({ err: error }, "Application shutdown failed");
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info({ port: env.PORT }, "TagPulse backend started");
} catch (error: unknown) {
  app.log.error({ err: error }, "TagPulse backend failed to start");
  await prisma.$disconnect();
  process.exitCode = 1;
}
