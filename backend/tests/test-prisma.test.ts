import { describe, expect, it } from "vitest";
import {
  createTestPrismaClient,
  getTestDatabaseUrl,
} from "./helpers/test-prisma.js";
import { assertNotProductionDatabase } from "../src/database/guard.js";

describe("isolated Prisma test database configuration", () => {
  it("fails before creating a client when TEST_DATABASE_URL is missing", () => {
    const applicationUrl = "postgresql://application.invalid/shared";

    expect(() =>
      createTestPrismaClient({ DATABASE_URL: applicationUrl }),
    ).toThrow("TEST_DATABASE_URL is required for database integration tests");
  });

  it("selects TEST_DATABASE_URL without falling back to DATABASE_URL", () => {
    const testUrl = "postgresql://test.invalid/tagpulse_test";

    expect(
      getTestDatabaseUrl({
        DATABASE_URL: "postgresql://application.invalid/shared",
        TEST_DATABASE_URL: testUrl,
      }),
    ).toBe(testUrl);
  });

  it("never falls back to production DATABASE_URL when TEST_DATABASE_URL is absent", () => {
    const prodUrl =
      "postgresql://postgres.szahricoqxzckjytpnmg:secret@aws-0-sa-east-1.pooler.supabase.com:6543/postgres";

    expect(() =>
      getTestDatabaseUrl({
        DATABASE_URL: prodUrl,
      }),
    ).toThrow("TEST_DATABASE_URL is required for database integration tests");
  });

  it("rejects TEST_DATABASE_URL containing production project ref", () => {
    const prodTestUrl =
      "postgresql://postgres.szahricoqxzckjytpnmg:secret@aws-0-sa-east-1.pooler.supabase.com:6543/postgres";

    expect(() =>
      getTestDatabaseUrl({
        TEST_DATABASE_URL: prodTestUrl,
      }),
    ).toThrow("TEST EXECUTION BLOCKED: production database detected.");
  });

  it("assertNotProductionDatabase blocks production URL without echoing credentials", () => {
    const prodUrl =
      "postgresql://postgres.szahricoqxzckjytpnmg:supersecret@aws-0-sa-east-1.pooler.supabase.com:6543/postgres";

    expect(() => assertNotProductionDatabase(prodUrl)).toThrow(
      "TEST EXECUTION BLOCKED: production database detected.",
    );
    try {
      assertNotProductionDatabase(prodUrl);
    } catch (err) {
      expect(String(err)).not.toContain("supersecret");
      expect(String(err)).not.toContain("aws-0-sa-east-1");
    }
  });

  it("assertNotProductionDatabase allows safe test/local URLs", () => {
    expect(() =>
      assertNotProductionDatabase("postgresql://localhost:5434/tagpulse_test"),
    ).not.toThrow();
  });

  it("rejects the application database URL as the test database", () => {
    const sharedUrl = "postgresql://shared.invalid/postgres";

    expect(() =>
      getTestDatabaseUrl({
        DATABASE_URL: sharedUrl,
        TEST_DATABASE_URL: sharedUrl,
      }),
    ).toThrow("TEST_DATABASE_URL must not match DATABASE_URL");
  });

  it("rejects non-PostgreSQL test URLs without echoing their value", () => {
    const unsafeValue = "https://secret.invalid/database";

    try {
      getTestDatabaseUrl({ TEST_DATABASE_URL: unsafeValue });
      throw new Error("Expected test database validation to fail");
    } catch (error: unknown) {
      expect(String(error)).toContain(
        "TEST_DATABASE_URL must be a PostgreSQL connection URL",
      );
      expect(String(error)).not.toContain(unsafeValue);
    }
  });
});
