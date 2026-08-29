import { describe, expect, it, vi } from "vitest";
import { createTagPlusCustomerPageFetcher } from "../src/integrations/tagplus/customers/customer-page-fetcher.js";

describe("TagPlus customer page fetcher", () => {
  it("uses fields=* and the explicit sequential pagination parameters", async () => {
    const get = vi
      .fn()
      .mockResolvedValue({ data: [], status: 200, paginationHeaders: {} });
    const fetchPage = createTagPlusCustomerPageFetcher({ get });
    await expect(fetchPage({ page: 7, perPage: 100 })).resolves.toEqual([]);
    expect(get).toHaveBeenCalledWith("/clientes?fields=*&page=7&per_page=100");
  });
});
