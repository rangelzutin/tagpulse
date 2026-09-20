import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import type { BiRepository } from "../src/modules/bi/index.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function createApp(repository: BiRepository) {
  const app = await buildApp({
    databaseHealth: { check: vi.fn() },
    frontendUrl: "http://localhost:5173",
    logger: false,
    biRepository: repository,
  });
  apps.push(app);
  return app;
}

describe("GET /bi/decisions/overview", () => {
  const mockRepo: BiRepository = {
    async findRealizedSales() {
      return [];
    },
    async findCategoryTree() {
      return { categories: [] };
    },
    async findFlatCategories() {
      return [
        { sourceId: "cat-1", description: "Nineclouds", parentSourceId: null },
      ];
    },
    async findCatalogInventoryProducts() {
      return [
        {
          id: "p1",
          sourceId: "s1",
          code: "SKU1",
          description: "Shape Nineclouds",
          categoryDescription: "Nineclouds",
          categorySourceId: "cat-1",
          active: true,
          sourcePresent: true,
          stockQuantity: 10,
          effectiveCost: 80,
          averageCost: 80,
          retailSalePrice: 150,
          stockMinQuantity: null,
          stockMaxQuantity: null,
        },
      ];
    },
    async findRealizedProductMovements() {
      return { movements: [], adjustments: [] };
    },
    async findHistoricalLastPhysicalSales() {
      return new Map();
    },
  };

  it("returns 200 with default windowDays = 90", async () => {
    const app = await createApp(mockRepo);
    const res = await app.inject({
      method: "GET",
      url: "/bi/decisions/overview",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.meta.windowDays).toBe(90);
    expect(body.meta.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.kpis).toBeDefined();
    expect(body.kpis.currentInventoryCapital).toBe(800); // 10 * 80
    expect(body.replenishment).toBeDefined();
    expect(body.capitalOptimization).toBeDefined();
  });

  it("accepts valid windowDays 30 and 180", async () => {
    const app = await createApp(mockRepo);
    const res30 = await app.inject({
      method: "GET",
      url: "/bi/decisions/overview?windowDays=30",
    });
    expect(res30.statusCode).toBe(200);
    expect(res30.json().meta.windowDays).toBe(30);

    const res180 = await app.inject({
      method: "GET",
      url: "/bi/decisions/overview?windowDays=180",
    });
    expect(res180.statusCode).toBe(200);
    expect(res180.json().meta.windowDays).toBe(180);
  });

  it("returns 400 for invalid windowDays", async () => {
    const app = await createApp(mockRepo);
    const res = await app.inject({
      method: "GET",
      url: "/bi/decisions/overview?windowDays=45",
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().status).toBe("error");
    expect(res.json().message).toContain("windowDays");
  });

  it("accepts categorySourceId query param", async () => {
    const app = await createApp(mockRepo);
    const res = await app.inject({
      method: "GET",
      url: "/bi/decisions/overview?categorySourceId=cat-1",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().meta.appliedFilters.categorySourceId).toBe("cat-1");
  });
});
