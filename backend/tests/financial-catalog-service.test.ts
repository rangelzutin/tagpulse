import { describe, it, expect, vi } from "vitest";
import type { TagPlusClient } from "../src/integrations/tagplus/tagplus-client.js";
import type { FinancialRecordRepository } from "../src/modules/financial/financial-record-repository.js";
import { createFinancialCatalogService } from "../src/modules/financial/financial-catalog-service.js";

describe("financial-catalog-service", () => {
  it("does not terminate on a short page and continues until explicitly empty []", async () => {
    // Page 1: 100 items (1..100)
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i + 1 }));
    // Page 2: 40 items (101..140) - SHORT PAGE!
    const page2 = Array.from({ length: 40 }, (_, i) => ({ id: i + 101 }));
    // Page 3: 20 items (141..160) - SHORT PAGE!
    const page3 = Array.from({ length: 20 }, (_, i) => ({ id: i + 141 }));
    // Page 4: [] - TERMINAL PAGE!
    const page4: Array<{ id: number }> = [];

    const pagesRequested: string[] = [];
    const client: TagPlusClient = {
      get: vi.fn().mockImplementation(async (path: string) => {
        pagesRequested.push(path);
        if (path.includes("page=1")) return { status: 200, data: page1, paginationHeaders: {} };
        if (path.includes("page=2")) return { status: 200, data: page2, paginationHeaders: {} };
        if (path.includes("page=3")) return { status: 200, data: page3, paginationHeaders: {} };
        if (path.includes("page=4")) return { status: 200, data: page4, paginationHeaders: {} };
        return { status: 200, data: [], paginationHeaders: {} };
      }),
    };

    const upsertedPages: string[][] = [];
    const mockRepo: Partial<FinancialRecordRepository> = {
      upsertCatalogItems: vi.fn().mockImplementation(async (_connId, ids) => {
        upsertedPages.push(ids);
        return { total: ids.length, newlyDiscovered: ids.length, alreadyKnown: 0 };
      }),
      markUnobservedFinancialRecords: vi.fn().mockResolvedValue(0),
    };

    const service = createFinancialCatalogService(mockRepo as FinancialRecordRepository);
    const result = await service.scanCatalog("conn-123", client, {
      perPage: 100,
      pageDelayMs: 0,
    });

    // Verify all 4 pages were requested!
    expect(pagesRequested).toEqual([
      "/financeiros?page=1&per_page=100",
      "/financeiros?page=2&per_page=100",
      "/financeiros?page=3&per_page=100",
      "/financeiros?page=4&per_page=100",
    ]);

    expect(result.pages).toBe(4); // 4 pages scanned before terminal break
    expect(result.idsFetched).toBe(160);
    expect(result.uniqueIds).toBe(160);
    expect(result.firstSourceId).toBe("1");
    expect(result.lastSourceId).toBe("160");
    expect(result.completed).toBe(true);

    // Verify repository was called for each non-empty page
    expect(upsertedPages).toHaveLength(3);
    expect(upsertedPages[0]).toHaveLength(100);
    expect(upsertedPages[1]).toHaveLength(40);
    expect(upsertedPages[2]).toHaveLength(20);

    // Verify unobserved reconciliation was called only once at the end
    expect(mockRepo.markUnobservedFinancialRecords).toHaveBeenCalledTimes(1);
  });

  it("handles duplicate IDs properly across pages", async () => {
    const page1 = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const page2 = [{ id: 3 }, { id: 4 }]; // id 3 duplicated
    const page3: Array<{ id: number }> = [];

    const client: TagPlusClient = {
      get: vi.fn().mockImplementation(async (path: string) => {
        if (path.includes("page=1")) return { status: 200, data: page1, paginationHeaders: {} };
        if (path.includes("page=2")) return { status: 200, data: page2, paginationHeaders: {} };
        return { status: 200, data: page3, paginationHeaders: {} };
      }),
    };

    const mockRepo: Partial<FinancialRecordRepository> = {
      upsertCatalogItems: vi.fn().mockResolvedValue({ total: 3, newlyDiscovered: 3, alreadyKnown: 0 }),
      markUnobservedFinancialRecords: vi.fn().mockResolvedValue(0),
    };

    const service = createFinancialCatalogService(mockRepo as FinancialRecordRepository);
    const result = await service.scanCatalog("conn-123", client, {
      perPage: 100,
      pageDelayMs: 0,
    });

    expect(result.idsFetched).toBe(5);
    expect(result.uniqueIds).toBe(4);
    expect(result.duplicateIds).toBe(1);
    expect(result.completed).toBe(true);
  });
});
