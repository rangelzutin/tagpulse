import { describe, expect, it, vi } from "vitest";
import { createTagPlusProductPageFetcher } from "../src/integrations/tagplus/products/product-page-fetcher.js";

describe("TagPlus product page fetcher", () => {
  it("uses fields=* and explicit sequential pagination parameters", async () => {
    const get = vi
      .fn()
      .mockResolvedValue({ data: [], status: 200, paginationHeaders: {} });
    const fetchPage = createTagPlusProductPageFetcher({ get });
    await expect(fetchPage({ page: 3, perPage: 100 })).resolves.toEqual([]);
    expect(get).toHaveBeenCalledWith("/produtos?fields=*&page=3&per_page=100");
  });
});
