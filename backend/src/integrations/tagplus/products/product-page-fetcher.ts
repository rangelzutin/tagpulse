import type { TagPlusClient } from "../tagplus-client.js";

export interface ProductPageFetcherInput {
  page: number;
  perPage: number;
  since?: string | undefined;
  until?: string | undefined;
  dataFilter?: string | undefined;
}

export type ProductPageFetcher = (
  input: ProductPageFetcherInput,
) => Promise<unknown>;

export function createTagPlusProductPageFetcher(
  client: TagPlusClient,
): ProductPageFetcher {
  return async ({ page, perPage, since, until, dataFilter }) => {
    const query = new URLSearchParams({
      fields: "*",
      page: String(page),
      per_page: String(perPage),
    });
    if (since) query.set("since", since);
    if (until) query.set("until", until);

    const headers: Record<string, string> = {};
    if (dataFilter || since || until) {
      headers["X-Data-Filter"] = dataFilter ?? "data_alteracao";
    }

    const hasHeaders = Object.keys(headers).length > 0;
    const url = `/produtos?${query.toString()}`;
    const response = hasHeaders
      ? await client.get<unknown>(url, { headers })
      : await client.get<unknown>(url);
    return response.data;
  };
}
