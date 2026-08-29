import { PrismaClient } from "@prisma/client";

const MISSING_TEST_DATABASE_URL =
  "TEST_DATABASE_URL is required for database integration tests";
const INVALID_TEST_DATABASE_URL =
  "TEST_DATABASE_URL must be a PostgreSQL connection URL";
const SHARED_DATABASE_URL = "TEST_DATABASE_URL must not match DATABASE_URL";

export function getTestDatabaseUrl(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const testDatabaseUrl = environment.TEST_DATABASE_URL?.trim();
  if (!testDatabaseUrl) throw new Error(MISSING_TEST_DATABASE_URL);

  let parsed: URL;
  try {
    parsed = new URL(testDatabaseUrl);
  } catch {
    throw new Error(INVALID_TEST_DATABASE_URL);
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(INVALID_TEST_DATABASE_URL);
  }

  const applicationDatabaseUrl = environment.DATABASE_URL?.trim();
  if (
    applicationDatabaseUrl &&
    normalizeUrl(applicationDatabaseUrl) === normalizeUrl(testDatabaseUrl)
  ) {
    throw new Error(SHARED_DATABASE_URL);
  }

  return testDatabaseUrl;
}

export function createTestPrismaClient(
  environment: NodeJS.ProcessEnv = process.env,
): PrismaClient {
  return new PrismaClient({ datasourceUrl: getTestDatabaseUrl(environment) });
}

function normalizeUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return value;
  }
}
