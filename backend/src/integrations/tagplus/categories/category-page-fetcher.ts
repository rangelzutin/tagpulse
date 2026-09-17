import type { TagPlusClient } from "../tagplus-client.js";

export interface CategoryPageFetcherInput {
  page: number;
  perPage: number;
}

export type CategoryPageFetcher = (
  input: CategoryPageFetcherInput,
) => Promise<unknown>;

export function createTagPlusCategoryPageFetcher(
  client: TagPlusClient,
): CategoryPageFetcher {
  return async ({ page, perPage }) => {
    const query = new URLSearchParams({
      fields: "*",
      page: String(page),
      per_page: String(perPage),
    });

    const url = `/categorias?${query.toString()}`;
    const response = await client.get<unknown>(url);
    return response.data;
  };
}
