import { describe, expect, it, vi } from "vitest";
import { createTagPlusCategoryPageFetcher } from "../src/integrations/tagplus/categories/category-page-fetcher.js";
import type { TagPlusClient } from "../src/integrations/tagplus/tagplus-client.js";

describe("TagPlus Category Page Fetcher", () => {
  it("fetches categories with fields=*, page and per_page", async () => {
    const mockGet = vi.fn().mockResolvedValue({
      status: 200,
      data: [{ id: 49, descricao: "1 - NINECLOUDS" }],
    });

    const mockClient = {
      get: mockGet,
    } as unknown as TagPlusClient;

    const fetcher = createTagPlusCategoryPageFetcher(mockClient);
    const result = await fetcher({ page: 2, perPage: 50 });

    expect(mockGet).toHaveBeenCalledWith(
      "/categorias?fields=*&page=2&per_page=50",
    );
    expect(result).toEqual([{ id: 49, descricao: "1 - NINECLOUDS" }]);
  });
});
