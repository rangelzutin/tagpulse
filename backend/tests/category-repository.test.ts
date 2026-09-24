import { describe, expect, it } from "vitest";
import { createCategoryRepository } from "../src/modules/categories/category-repository.js";
import type { NormalizedCategory } from "../src/integrations/tagplus/categories/category-normalizer.js";

function createInMemoryCategoryPrismaMock() {
  const table = new Map<string, any>();

  const tx = {
    category: {
      async findMany({ where }: { where: { connectionId: string } }) {
        return Array.from(table.values()).filter(
          (c) => c.connectionId === where.connectionId,
        );
      },
      async create({ data }: { data: any }) {
        const key = `${data.connectionId}:${data.sourceId}`;
        const record = { ...data, id: `cat-${data.sourceId}` };
        table.set(key, record);
        return record;
      },
      async update({ where, data }: { where: { connectionId_sourceId: any }; data: any }) {
        const key = `${where.connectionId_sourceId.connectionId}:${where.connectionId_sourceId.sourceId}`;
        const existing = table.get(key);
        if (!existing) throw new Error("Not found");
        const updated = { ...existing, ...data };
        table.set(key, updated);
        return updated;
      },
      async updateMany({ where, data }: { where: any; data: any }) {
        let count = 0;
        for (const [key, item] of table.entries()) {
          if (
            item.connectionId === where.connectionId &&
            where.sourceId.in.includes(item.sourceId)
          ) {
            table.set(key, { ...item, ...data });
            count++;
          }
        }
        return { count };
      },
    },
  };

  let lastTransactionOptions: any;

  return {
    category: tx.category,
    async $transaction<T>(fn: (txParam: any) => Promise<T>, options?: any): Promise<T> {
      lastTransactionOptions = options;
      return fn(tx);
    },
    getLastTransactionOptions: () => lastTransactionOptions,
    _table: table,
  };
}

describe("Category Repository", () => {
  const connectionId = "conn-123";

  it("handles child before parent in payload (two-pass safe upsert)", async () => {
    const mockPrisma = createInMemoryCategoryPrismaMock();
    const repo = createCategoryRepository(mockPrisma as any);

    // Child is listed FIRST in array
    const categories: NormalizedCategory[] = [
      {
        sourceId: "50",
        description: "Shapes Nineclouds",
        parentSourceId: "49", // Points to 49 which comes AFTER
        type: "P",
        location: null,
      },
      {
        sourceId: "49",
        description: "1 - NINECLOUDS",
        parentSourceId: null, // Root
        type: "P",
        location: null,
      },
    ];

    const result = await repo.saveCategories(connectionId, categories);

    expect(result.fetched).toBe(2);
    expect(result.inserted).toBe(2);
    expect(result.noLongerObserved).toBe(0);

    const rows = await repo.findCategoriesByConnection(connectionId);
    const parentRow = rows.find((r) => r.sourceId === "49");
    const childRow = rows.find((r) => r.sourceId === "50");

    expect(parentRow?.parentSourceId).toBeNull();
    expect(childRow?.parentSourceId).toBe("49");
    expect(childRow?.sourcePresent).toBe(true);
    expect(parentRow?.sourcePresent).toBe(true);
  });

  it("marks missing categories as sourcePresent=false and increments noLongerObserved", async () => {
    const mockPrisma = createInMemoryCategoryPrismaMock();
    const repo = createCategoryRepository(mockPrisma as any);

    // First scan has 2 categories
    await repo.saveCategories(connectionId, [
      { sourceId: "49", description: "1 - NINECLOUDS", parentSourceId: null, type: "P", location: null },
      { sourceId: "78", description: "2- DESTRUX", parentSourceId: null, type: "P", location: null },
    ]);

    // Second scan: category 78 disappears from TagPlus API
    const secondScan = await repo.saveCategories(connectionId, [
      { sourceId: "49", description: "1 - NINECLOUDS", parentSourceId: null, type: "P", location: null },
    ]);

    expect(secondScan.fetched).toBe(1);
    expect(secondScan.unchanged).toBe(1);
    expect(secondScan.noLongerObserved).toBe(1);

    const rows = await repo.findCategoriesByConnection(connectionId);
    const cat49 = rows.find((r) => r.sourceId === "49");
    const cat78 = rows.find((r) => r.sourceId === "78");

    expect(cat49?.sourcePresent).toBe(true);
    expect(cat78?.sourcePresent).toBe(false);
  });

  it("reactivates a category when it reappears in a future scan", async () => {
    const mockPrisma = createInMemoryCategoryPrismaMock();
    const repo = createCategoryRepository(mockPrisma as any);

    // Initial scan
    await repo.saveCategories(connectionId, [
      { sourceId: "77", description: "3 - HUSTLER", parentSourceId: null, type: "P", location: null },
    ]);

    // Disappears
    await repo.saveCategories(connectionId, []);

    let rows = await repo.findCategoriesByConnection(connectionId);
    expect(rows.find((r) => r.sourceId === "77")?.sourcePresent).toBe(false);

    // Reappears
    const thirdScan = await repo.saveCategories(connectionId, [
      { sourceId: "77", description: "3 - HUSTLER", parentSourceId: null, type: "P", location: null },
    ]);

    expect(thirdScan.updated).toBe(1); // sourcePresent changed from false to true
    rows = await repo.findCategoriesByConnection(connectionId);
    expect(rows.find((r) => r.sourceId === "77")?.sourcePresent).toBe(true);
  });

  it("configures interactive transaction with maxWait: 5000 and timeout: 30000", async () => {
    const mockPrisma = createInMemoryCategoryPrismaMock();
    const repo = createCategoryRepository(mockPrisma as any);

    await repo.saveCategories(connectionId, []);

    expect(mockPrisma.getLastTransactionOptions()).toEqual({
      maxWait: 5000,
      timeout: 30000,
    });
  });
});
