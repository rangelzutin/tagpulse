import { PrismaClient } from "@prisma/client";
import {
  assertNotProductionDatabase,
  assertSafeDatabaseUrl,
} from "./guard.js";

const isTestEnv = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);
if (isTestEnv) {
  assertNotProductionDatabase(process.env.DATABASE_URL);
  assertNotProductionDatabase(process.env.TEST_DATABASE_URL);
} else {
  assertSafeDatabaseUrl(process.env.DATABASE_URL, process.env.NODE_ENV);
  assertSafeDatabaseUrl(process.env.DIRECT_URL, process.env.NODE_ENV);
}

export const prisma = new PrismaClient();
export { assertNotProductionDatabase, assertSafeDatabaseUrl };

