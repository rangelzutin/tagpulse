import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { createBiRepository } from "../../src/modules/bi/bi-repository.js";
import { createBiService } from "../../src/modules/bi/bi-service.js";
import { createTestPrismaClient } from "../helpers/test-prisma.js";

describe("Products BI V1 — Integration Database Reconciliation", () => {
  const prisma = createTestPrismaClient();

  it("reconcilia quantidade homologada: 2024 = 5.289", async () => {
    const repo = createBiRepository(prisma);
    if (!repo.findRealizedProductMovements) return;

    const { movements } = await repo.findRealizedProductMovements(
      new Date("2024-01-01T00:00:00.000Z"),
      new Date("2025-01-01T00:00:00.000Z"),
    );

    const totalQty = movements.reduce((acc, m) => acc + m.quantity, 0);
    expect(totalQty).toBe(5289);
  }, 15000);

  it("reconcilia quantidade homologada: 2025 = 4.646 (com ajuste da duplicidade #2806)", async () => {
    const repo = createBiRepository(prisma);
    if (!repo.findRealizedProductMovements) return;

    const { movements, adjustments } =
      await repo.findRealizedProductMovements(
        new Date("2025-01-01T00:00:00.000Z"),
        new Date("2026-01-01T00:00:00.000Z"),
      );

    const totalQty = movements.reduce((acc, m) => acc + m.quantity, 0);
    expect(totalQty).toBe(4646);

    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]).toMatchObject({
      type: "KNOWN_DUPLICATE_NFE",
      sourceId: "2806",
      amount: 5488.5,
    });
  });

  it("reconcilia quantidade homologada: 2026 >= 3.228 (atual: 3.271)", async () => {
    const repo = createBiRepository(prisma);
    if (!repo.findRealizedProductMovements) return;

    const { movements } = await repo.findRealizedProductMovements(
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2027-01-01T00:00:00.000Z"),
    );

    const totalQty = movements.reduce((acc, m) => acc + m.quantity, 0);
    expect(totalQty).toBeGreaterThanOrEqual(3228);
  });

  it("reconcilia Janeiro/2026: 23 realizações, R$ 53.766,28, ajuste zero", async () => {
    const repo = createBiRepository(prisma);
    const service = createBiService(repo);

    const result = await service.getProductsOverview(
      "2026-01-01",
      "2026-01-31",
    );
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.summary.realizedQuantity).toBe(413);
    expect(result.data.summary.realizedRevenue).toBe(53766.28);
    expect(result.data.reconciliation).toEqual({
      commercialRevenue: 53766.28,
      productsRevenue: 53766.28,
      adjustmentAmount: 0,
      adjustments: [],
    });
  });

  it("HTTP GET /bi/products/overview retorna contrato completo da V1", async () => {
    const repo = createBiRepository(prisma);
    const app = await buildApp({
      databaseHealth: { check: async () => {} },
      frontendUrl: "http://localhost:5173",
      biRepository: repo,
    });

    const response = await app.inject({
      method: "GET",
      url: "/bi/products/overview?from=2026-01-01&to=2026-01-31",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body).toHaveProperty("period");
    expect(body).toHaveProperty("summary");
    expect(body).toHaveProperty("topProducts");
    expect(body).toHaveProperty("categories");
    expect(body).toHaveProperty("channelMix");
    expect(body).toHaveProperty("reconciliation");

    expect(body.summary.realizedRevenue).toBe(53766.28);
    expect(body.summary.realizedQuantity).toBe(413);
    expect(body.topProducts.length).toBeGreaterThan(0);
    expect(body.categories.length).toBeGreaterThan(0);
    expect(body.channelMix.length).toBeGreaterThan(0);

    await app.close();
  });

  it("HTTP GET /bi/products/overview rejeita intervalo inválido com 400", async () => {
    const repo = createBiRepository(prisma);
    const app = await buildApp({
      databaseHealth: { check: async () => {} },
      frontendUrl: "http://localhost:5173",
      biRepository: repo,
    });

    const response = await app.inject({
      method: "GET",
      url: "/bi/products/overview?from=data-invalida&to=2026-01-31",
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.status).toBe("error");

    await app.close();
  });

  it("HTTP GET /bi/products/overview entrega contrato analítico V2 completo e retrocompatível", async () => {
    const repo = createBiRepository(prisma);
    const app = await buildApp({
      databaseHealth: { check: async () => {} },
      frontendUrl: "http://localhost:5173",
      biRepository: repo,
    });

    const response = await app.inject({
      method: "GET",
      url: "/bi/products/overview?from=2026-01-01&to=2026-01-31",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body).toHaveProperty("period");
    expect(body).toHaveProperty("summary");
    expect(body).toHaveProperty("topProducts");
    expect(body).toHaveProperty("categories");
    expect(body).toHaveProperty("categoryMix");
    expect(body).toHaveProperty("commercialLineMix");
    expect(body).toHaveProperty("shapeSizeMix");
    expect(body).toHaveProperty("channelMix");
    expect(body).toHaveProperty("stockOpportunities");
    expect(body).toHaveProperty("reconciliation");

    await app.close();
  });
});
