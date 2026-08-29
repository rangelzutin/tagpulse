import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createDatabaseHealthChecker } from "./database/health.js";
import { prisma } from "./database/prisma.js";
import { createTagPlusOAuthTokenStore } from "./integrations/tagplus/oauth-token-store.js";
import { registerCustomerSyncConsole } from "./modules/customers/customer-sync-console.js";
import { createProductionCustomerSyncRunner } from "./modules/customers/production-customer-sync.js";

const env = loadEnv();
const tokenStore = createTagPlusOAuthTokenStore();
const app = await buildApp({
  databaseHealth: createDatabaseHealthChecker(prisma),
  frontendUrl: env.FRONTEND_URL,
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
  const runner = createProductionCustomerSyncRunner({
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
  registerCustomerSyncConsole(runner);
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
