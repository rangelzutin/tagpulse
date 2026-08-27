import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createDatabaseHealthChecker } from "./database/health.js";
import { prisma } from "./database/prisma.js";

const env = loadEnv();
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
  },
});

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
