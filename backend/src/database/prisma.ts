import { PrismaClient } from "@prisma/client";
import { assertNotProductionDatabase } from "./guard.js";

const isTestEnv = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);
if (isTestEnv) {
  assertNotProductionDatabase(process.env.DATABASE_URL);
  assertNotProductionDatabase(process.env.TEST_DATABASE_URL);
}

export const prisma = new PrismaClient();
export { assertNotProductionDatabase };
