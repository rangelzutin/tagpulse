import type { TagPlusClient } from "../tagplus-client.js";

export interface SalesPageFetcherInput {
  page: number;
  perPage: number;
}

export type SalesPageFetcher = (
  input: SalesPageFetcherInput,
) => Promise<unknown>;

export function createTagPlusPedidosPageFetcher(
  client: TagPlusClient,
): SalesPageFetcher {
  return async ({ page, perPage }) => {
    const query = new URLSearchParams({
      fields: "*",
      page: String(page),
      per_page: String(perPage),
    });
    const response = await client.get<unknown>(`/pedidos?${query.toString()}`);
    return response.data;
  };
}

export function createTagPlusVendasSimplesPageFetcher(
  client: TagPlusClient,
): SalesPageFetcher {
  return async ({ page, perPage }) => {
    const query = new URLSearchParams({
      fields: "*",
      page: String(page),
      per_page: String(perPage),
    });
    const response = await client.get<unknown>(
      `/vendas_simples?${query.toString()}`,
    );
    return response.data;
  };
}

export function createTagPlusNfesPageFetcher(
  client: TagPlusClient,
): SalesPageFetcher {
  return async ({ page, perPage }) => {
    const query = new URLSearchParams({
      fields: "*",
      page: String(page),
      per_page: String(perPage),
    });
    const response = await client.get<unknown>(`/nfes?${query.toString()}`);
    return response.data;
  };
}
