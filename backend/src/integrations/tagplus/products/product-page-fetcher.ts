import type { TagPlusClient } from "../tagplus-client.js";

export interface ProductPageFetcherInput {
  page: number;
  perPage: number;
}

export type ProductPageFetcher = (
  input: ProductPageFetcherInput,
) => Promise<unknown>;

export function createTagPlusProductPageFetcher(
  client: TagPlusClient,
): ProductPageFetcher {
  return async ({ page, perPage }) => {
    const query = new URLSearchParams({
      fields: "*",
      page: String(page),
      per_page: String(perPage),
    });
    const response = await client.get<unknown>(`/produtos?${query.toString()}`);
    return response.data;
  };
}
