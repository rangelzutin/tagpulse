import { describe, expect, it } from "vitest";
import {
  createTestPrismaClient,
  getTestDatabaseUrl,
} from "./helpers/test-prisma.js";

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
