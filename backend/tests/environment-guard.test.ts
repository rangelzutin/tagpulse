import { describe, it, expect } from "vitest";
import {
  assertSafeDatabaseUrl,
  extractDatabaseProject,
  getDatabaseMode,
  PRODUCTION_PROJECT_REF,
  DEV_PROJECT_REF,
  SAFETY_BLOCK_DEV_MESSAGE,
} from "../src/database/guard.js";

describe("Environment Safety Guard", () => {
  const prodUrl = `postgresql://postgres.${PRODUCTION_PROJECT_REF}:secret@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true`;
  const devUrl = `postgresql://postgres.${DEV_PROJECT_REF}:secret@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true`;
  const testUrl = "postgresql://tagpulse_test:test@localhost:5434/tagpulse_test";

  it("Teste A: dev environment with DEV URL is allowed", () => {
    expect(() => assertSafeDatabaseUrl(devUrl, "development")).not.toThrow();
    expect(extractDatabaseProject(devUrl)).toBe(DEV_PROJECT_REF);
    expect(getDatabaseMode(devUrl)).toBe("DEV");
  });

  it("Teste B: non-production environment with PROD URL throws SAFETY BLOCK error", () => {
    expect(() => assertSafeDatabaseUrl(prodUrl, "development")).toThrow(SAFETY_BLOCK_DEV_MESSAGE);
    expect(() => assertSafeDatabaseUrl(prodUrl, "test")).toThrow(SAFETY_BLOCK_DEV_MESSAGE);
    expect(() => assertSafeDatabaseUrl(prodUrl, undefined)).toThrow(SAFETY_BLOCK_DEV_MESSAGE);
  });

  it("Teste C: production environment with PROD URL is permitted exclusively in production context", () => {
    expect(() => assertSafeDatabaseUrl(prodUrl, "production")).not.toThrow();
    expect(extractDatabaseProject(prodUrl)).toBe(PRODUCTION_PROJECT_REF);
    expect(getDatabaseMode(prodUrl)).toBe("PROD");
  });

  it("Correctly identifies test environment", () => {
    expect(() => assertSafeDatabaseUrl(testUrl, "test")).not.toThrow();
    expect(getDatabaseMode(testUrl)).toBe("TEST");
  });
});

