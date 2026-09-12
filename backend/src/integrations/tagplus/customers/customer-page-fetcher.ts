import type { TagPlusClient } from "../tagplus-client.js";

export interface CustomerPageFetcherInput {
  page: number;
  perPage: number;
  since?: string | undefined;
  until?: string | undefined;
  dataFilter?: string | undefined;
}

export type CustomerPageFetcher = (
  input: CustomerPageFetcherInput,
) => Promise<unknown>;

export function createTagPlusCustomerPageFetcher(
  client: TagPlusClient,
): CustomerPageFetcher {
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
    const url = `/clientes?${query.toString()}`;
    const response = hasHeaders
      ? await client.get<unknown>(url, { headers })
      : await client.get<unknown>(url);
    return response.data;
  };
}
