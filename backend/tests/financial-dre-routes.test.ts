import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/database/prisma.js";
import { createDatabaseHealthChecker } from "../src/database/health.js";
import { createBiRepository } from "../src/modules/bi/bi-repository.js";

describe("Financial DRE HTTP Routes", () => {
  it("serves /financial/dre/summary, monthly, and breakdown with status 200", async () => {
    const biRepository = createBiRepository(prisma);
    const app = await buildApp({
      databaseHealth: createDatabaseHealthChecker(prisma),
      frontendUrl: "http://localhost:5173",
      logger: false,
      prisma,
      biRepository,
    });

    // 1. GET /financial/dre/summary
    const summaryResponse = await app.inject({
      method: "GET",
      url: "/financial/dre/summary?from=2026-01-01&to=2026-10-13",
    });
    expect(summaryResponse.statusCode).toBe(200);
    const summaryData = JSON.parse(summaryResponse.body);
    expect(summaryData.totals).toBeDefined();
    expect(summaryData.totals.realizedRevenue).toBe(322465.68);
    expect(summaryData.disclaimer).toContain("O DRE Gerencial do TagPulse");

    // 2. GET /financial/dre/monthly
    const monthlyResponse = await app.inject({
      method: "GET",
      url: "/financial/dre/monthly?year=2026",
    });
    expect(monthlyResponse.statusCode).toBe(200);
    const monthlyData = JSON.parse(monthlyResponse.body);
    expect(Array.isArray(monthlyData)).toBe(true);
    expect(monthlyData.length).toBeGreaterThanOrEqual(10);

    // 3. GET /financial/dre/breakdown
    const breakdownResponse = await app.inject({
      method: "GET",
      url: "/financial/dre/breakdown?from=2026-01-01&to=2026-10-13",
    });
    expect(breakdownResponse.statusCode).toBe(200);
    const breakdownData = JSON.parse(breakdownResponse.body);
    expect(breakdownData.categories).toBeDefined();
    expect(Array.isArray(breakdownData.categories)).toBe(true);

    await app.close();
  }, 30000);
});
