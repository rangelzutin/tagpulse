import {
  normalizeTagPlusProduct,
  ProductNormalizationError,
  type ProductNormalizationDiagnostics,
  type ProductNormalizationErrorCategory,
} from "../../integrations/tagplus/products/product-normalizer.js";
import type { ProductPageFetcher } from "../../integrations/tagplus/products/product-page-fetcher.js";
import {
  ProductPersistenceError,
  type ProductPersistenceDiagnostics,
  type UpsertProductInput,
  type UpsertProductResult,
} from "./product-repository.js";
import type { ProductSyncRepository } from "./product-sync-repository.js";

const PER_PAGE = 100;

export type ProductSyncErrorCategory =
  | "PRODUCT_SYNC_ALREADY_RUNNING"
  | "PRODUCT_SYNC_INVALID_PAGE"
  | "PRODUCT_SYNC_FETCH_ERROR"
  | "PRODUCT_SYNC_NORMALIZATION_ERROR"
  | "PRODUCT_SYNC_PERSISTENCE_ERROR"
  | "PRODUCT_SYNC_RECONCILIATION_ERROR"
  | "PRODUCT_SYNC_ERROR";

export interface ProductSyncDiagnostics {
  syncFailureStage: "RUN_STATE" | "UNEXPECTED";
  syncErrorClass: "DATABASE" | "UNEXPECTED";
  page?: number;
}

export class ProductSyncError extends Error {
  constructor(
    public readonly category: ProductSyncErrorCategory,
    public readonly diagnostics?: ProductNormalizationDiagnostics,
    public readonly normalizationCategory?: ProductNormalizationErrorCategory,
    public readonly persistenceDiagnostics?: ProductPersistenceDiagnostics,
    public readonly syncDiagnostics?: ProductSyncDiagnostics,
  ) {
    super(category);
    this.name = "ProductSyncError";
  }
}

interface ProductWriter {
  upsertProduct(input: UpsertProductInput): Promise<UpsertProductResult>;
}

export interface ProductFullSyncDependencies {
  pageFetcher: ProductPageFetcher;
  productRepository: ProductWriter;
  syncRepository: ProductSyncRepository;
  now?: () => Date;
}

export interface ProductFullSyncResult {
  runId: string;
  status: "COMPLETED";
  pagesFetched: number;
  recordsFetched: number;
  recordsInserted: number;
  recordsUpdated: number;
  recordsUnchanged: number;
  recordsNoLongerObserved: number;
  lastCompletedPage: number;
  terminalEmptyPage: number;
  startedAt: Date;
  completedAt: Date;
}

export function createProductFullSync(
  dependencies: ProductFullSyncDependencies,
) {
  const now = dependencies.now ?? (() => new Date());
  return async function syncProducts(
    connectionId: string,
  ): Promise<ProductFullSyncResult> {
    let running: { id: string } | null;
    try {
      running = await dependencies.syncRepository.findRunning(connectionId);
    } catch {
      throw runStateError();
    }
    if (running) {
      throw new ProductSyncError("PRODUCT_SYNC_ALREADY_RUNNING");
    }

    let startedAt: Date;
    try {
      startedAt = now();
    } catch {
      throw unexpectedSyncFailure();
    }
    let run: Awaited<ReturnType<ProductSyncRepository["createRun"]>>;
    try {
      run = await dependencies.syncRepository.createRun(
        connectionId,
        startedAt,
      );
    } catch {
      throw runStateError();
    }

    let page = 1;
    let recordsFetched = 0;
    let recordsInserted = 0;
    let recordsUpdated = 0;
    let recordsUnchanged = 0;
    let lastCompletedPage = 0;

    try {
      for (; ; page += 1) {
        let rawPage: unknown;
        try {
          rawPage = await dependencies.pageFetcher({ page, perPage: PER_PAGE });
        } catch {
          throw new ProductSyncError("PRODUCT_SYNC_FETCH_ERROR");
        }

        if (!Array.isArray(rawPage)) {
          throw new ProductSyncError("PRODUCT_SYNC_INVALID_PAGE");
        }

        if (rawPage.length === 0) {
          const terminalEmptyPage = page;
          const pagesFetched = page;
          await dependencies.syncRepository.updateProgress(run.id, {
            pagesFetched,
            terminalEmptyPage,
          });
          let missingCount = 0;
          try {
            missingCount = await dependencies.syncRepository.reconcileMissing(
              connectionId,
              run.id,
            );
          } catch {
            throw new ProductSyncError("PRODUCT_SYNC_RECONCILIATION_ERROR");
          }
          const completedAt = now();
          await dependencies.syncRepository.completeRun(
            run.id,
            completedAt,
            missingCount,
          );
          return {
            runId: run.id,
            status: "COMPLETED",
            pagesFetched,
            recordsFetched,
            recordsInserted,
            recordsUpdated,
            recordsUnchanged,
            recordsNoLongerObserved: missingCount,
            lastCompletedPage,
            terminalEmptyPage,
            startedAt,
            completedAt,
          };
        }

        for (const item of rawPage) {
          let normalized;
          try {
            normalized = normalizeTagPlusProduct(item);
          } catch (error: unknown) {
            if (error instanceof ProductNormalizationError) {
              throw new ProductSyncError(
                "PRODUCT_SYNC_NORMALIZATION_ERROR",
                error.diagnostics,
                error.category,
              );
            }
            throw new ProductSyncError("PRODUCT_SYNC_NORMALIZATION_ERROR");
          }

          let result: UpsertProductResult;
          try {
            result = await dependencies.productRepository.upsertProduct({
              connectionId,
              syncRunId: run.id,
              observedAt: now(),
              product: normalized,
            });
          } catch (error: unknown) {
            if (error instanceof ProductPersistenceError) {
              throw new ProductSyncError(
                "PRODUCT_SYNC_PERSISTENCE_ERROR",
                undefined,
                undefined,
                error.diagnostics,
              );
            }
            throw new ProductSyncError("PRODUCT_SYNC_PERSISTENCE_ERROR");
          }

          recordsFetched += 1;
          if (result.outcome === "INSERTED") recordsInserted += 1;
          if (result.outcome === "UPDATED") recordsUpdated += 1;
          if (result.outcome === "UNCHANGED") recordsUnchanged += 1;
        }

        lastCompletedPage = page;
        await dependencies.syncRepository.updateProgress(run.id, {
          pagesFetched: page,
          recordsFetched,
          recordsInserted,
          recordsUpdated,
          recordsUnchanged,
          lastCompletedPage,
        });
      }
    } catch (error: unknown) {
      const category = isProductSyncError(error)
        ? error.category
        : "PRODUCT_SYNC_ERROR";
      try {
        await dependencies.syncRepository.failRun(run.id, now(), category);
      } catch {
        // preserve original error
      }
      throw error;
    }
  };
}

function runStateError(): ProductSyncError {
  return new ProductSyncError(
    "PRODUCT_SYNC_ERROR",
    undefined,
    undefined,
    undefined,
    {
      syncFailureStage: "RUN_STATE",
      syncErrorClass: "DATABASE",
    },
  );
}

function unexpectedSyncFailure(): ProductSyncError {
  return new ProductSyncError(
    "PRODUCT_SYNC_ERROR",
    undefined,
    undefined,
    undefined,
    {
      syncFailureStage: "UNEXPECTED",
      syncErrorClass: "UNEXPECTED",
    },
  );
}

function isProductSyncError(error: unknown): error is ProductSyncError {
  return error instanceof ProductSyncError;
}
