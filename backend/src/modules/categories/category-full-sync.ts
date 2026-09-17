import {
  normalizeTagPlusCategory,
  type NormalizedCategory,
  type RawTagPlusCategory,
} from "../../integrations/tagplus/categories/category-normalizer.js";
import type { CategoryPageFetcher } from "../../integrations/tagplus/categories/category-page-fetcher.js";
import type { CategoryRepository } from "./category-repository.js";

export interface CategorySyncResult {
  pagesFetched: number;
  recordsFetched: number;
  recordsInserted: number;
  recordsUpdated: number;
  recordsUnchanged: number;
  recordsNoLongerObserved: number;
}

export interface CategoryFullSyncOptions {
  perPage?: number;
  now?: () => Date;
  mode?: unknown;
  window?: { since: string; until: string };
}

export function createCategoryFullSync(input: {
  fetcher: CategoryPageFetcher;
  repository: CategoryRepository;
}) {
  return async function run(
    connectionId: string,
    options: CategoryFullSyncOptions = {},
  ): Promise<CategorySyncResult> {
    const perPage = options.perPage ?? 100;
    const now = options.now ? options.now() : new Date();

    let page = 1;
    let pagesFetched = 0;
    const allNormalized: NormalizedCategory[] = [];

    while (true) {
      pagesFetched++;
      const rawData = await input.fetcher({ page, perPage });

      if (!Array.isArray(rawData) || rawData.length === 0) {
        break;
      }

      for (const item of rawData) {
        if (item && typeof item === "object") {
          const normalized = normalizeTagPlusCategory(item as RawTagPlusCategory);
          allNormalized.push(normalized);
        }
      }

      // Se a página retornou menos que o limite, não há mais páginas
      if (rawData.length < perPage) {
        break;
      }

      page++;
    }

    const saveResult = await input.repository.saveCategories(
      connectionId,
      allNormalized,
      now,
    );

    return {
      pagesFetched,
      recordsFetched: saveResult.fetched,
      recordsInserted: saveResult.inserted,
      recordsUpdated: saveResult.updated,
      recordsUnchanged: saveResult.unchanged,
      recordsNoLongerObserved: saveResult.noLongerObserved,
    };
  };
}
