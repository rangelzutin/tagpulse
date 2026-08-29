import type { TagPlusClient } from "../tagplus-client.js";

export interface CustomerPageFetcherInput {
  page: number;
  perPage: number;
}

export type CustomerPageFetcher = (
  input: CustomerPageFetcherInput,
) => Promise<unknown>;

export function createTagPlusCustomerPageFetcher(
  client: TagPlusClient,
): CustomerPageFetcher {
  return async ({ page, perPage }) => {
    const query = new URLSearchParams({
      fields: "*",
      page: String(page),
      per_page: String(perPage),
    });
    const response = await client.get<unknown>(`/clientes?${query.toString()}`);
    return response.data;
  };
}
