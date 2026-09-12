import type { TagPlusClient } from "../tagplus-client.js";

export interface SalesPageFetcherInput {
  page: number;
  perPage: number;
  since?: string | undefined;
  until?: string | undefined;
  dataFilter?: string | undefined;
}

export type SalesPageFetcher = (
  input: SalesPageFetcherInput,
) => Promise<unknown>;

function buildSalesQueryParams(input: SalesPageFetcherInput): {
  query: URLSearchParams;
  headers?: Record<string, string> | undefined;
} {
  const query = new URLSearchParams({
    fields: "*",
    page: String(input.page),
    per_page: String(input.perPage),
  });
  if (input.since) query.set("since", input.since);
  if (input.until) query.set("until", input.until);

  const headers: Record<string, string> = {};
  if (input.dataFilter || input.since || input.until) {
    headers["X-Data-Filter"] = input.dataFilter ?? "data_alteracao";
  }

  return {
    query,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  };
}

export function createTagPlusPedidosPageFetcher(
  client: TagPlusClient,
): SalesPageFetcher {
  return async (input) => {
    const { query, headers } = buildSalesQueryParams(input);
    const url = `/pedidos?${query.toString()}`;
    const response = headers
      ? await client.get<unknown>(url, { headers })
      : await client.get<unknown>(url);
    return response.data;
  };
}

export function createTagPlusVendasSimplesPageFetcher(
  client: TagPlusClient,
): SalesPageFetcher {
  return async (input) => {
    const { query, headers } = buildSalesQueryParams(input);
    const url = `/vendas_simples?${query.toString()}`;
    const response = headers
      ? await client.get<unknown>(url, { headers })
      : await client.get<unknown>(url);
    return response.data;
  };
}

export function createTagPlusNfesPageFetcher(
  client: TagPlusClient,
): SalesPageFetcher {
  return async (input) => {
    const { query, headers } = buildSalesQueryParams(input);
    const url = `/nfes?${query.toString()}`;
    const response = headers
      ? await client.get<unknown>(url, { headers })
      : await client.get<unknown>(url);
    return response.data;
  };
}
