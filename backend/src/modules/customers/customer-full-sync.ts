import {
  CustomerNormalizationError,
  normalizeTagPlusCustomer,
  type CustomerNormalizationDiagnostics,
  type CustomerNormalizationErrorCategory,
} from "../../integrations/tagplus/customers/customer-normalizer.js";
import type { CustomerPageFetcher } from "../../integrations/tagplus/customers/customer-page-fetcher.js";
import type {
  CustomerPersistenceDiagnostics,
  UpsertCustomerInput,
  UpsertCustomerResult,
} from "./customer-repository.js";
import { CustomerPersistenceError } from "./customer-repository.js";
import type { CustomerSyncRepository } from "./customer-sync-repository.js";

const PER_PAGE = 100;

export type CustomerSyncErrorCategory =
  | "CUSTOMER_SYNC_ALREADY_RUNNING"
  | "CUSTOMER_SYNC_INVALID_PAGE"
  | "CUSTOMER_SYNC_FETCH_ERROR"
  | "CUSTOMER_SYNC_NORMALIZATION_ERROR"
  | "CUSTOMER_SYNC_PERSISTENCE_ERROR"
  | "CUSTOMER_SYNC_RECONCILIATION_ERROR"
  | "CUSTOMER_SYNC_ERROR";

export class CustomerSyncError extends Error {
  constructor(
    public readonly category: CustomerSyncErrorCategory,
    public readonly diagnostics?: CustomerNormalizationDiagnostics,
    public readonly normalizationCategory?: CustomerNormalizationErrorCategory,
    public readonly persistenceDiagnostics?: CustomerPersistenceDiagnostics,
  ) {
    super(category);
    this.name = "CustomerSyncError";
  }
}

interface CustomerWriter {
  upsertCustomer(input: UpsertCustomerInput): Promise<UpsertCustomerResult>;
}

export interface CustomerFullSyncDependencies {
  pageFetcher: CustomerPageFetcher;
  customerRepository: CustomerWriter;
  syncRepository: CustomerSyncRepository;
  now?: () => Date;
}

export interface CustomerFullSyncResult {
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

export function createCustomerFullSync(
  dependencies: CustomerFullSyncDependencies,
) {
  const now = dependencies.now ?? (() => new Date());
  return async function syncCustomers(
    connectionId: string,
  ): Promise<CustomerFullSyncResult> {
    if (await dependencies.syncRepository.findRunning(connectionId)) {
      throw new CustomerSyncError("CUSTOMER_SYNC_ALREADY_RUNNING");
    }

    const startedAt = now();
    const run = await dependencies.syncRepository.createRun(
      connectionId,
      startedAt,
    );
    const counters = {
      pagesFetched: 0,
      recordsFetched: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      recordsUnchanged: 0,
      lastCompletedPage: 0,
    };
    let stage: "FETCH" | "NORMALIZE" | "PERSIST" | "RECONCILE" = "FETCH";

    try {
      for (let page = 1; ; page += 1) {
        stage = "FETCH";
        const payload = await dependencies.pageFetcher({
          page,
          perPage: PER_PAGE,
        });
        if (!Array.isArray(payload)) {
          throw new CustomerSyncError("CUSTOMER_SYNC_INVALID_PAGE");
        }
        counters.pagesFetched += 1;
        await dependencies.syncRepository.updateProgress(run.id, {
          pagesFetched: counters.pagesFetched,
        });

        if (payload.length === 0) {
          await dependencies.syncRepository.updateProgress(run.id, {
            terminalEmptyPage: page,
          });
          stage = "RECONCILE";
          const missing = await dependencies.syncRepository.reconcileMissing(
            connectionId,
            run.id,
          );
          const completedAt = now();
          await dependencies.syncRepository.completeRun(
            run.id,
            completedAt,
            missing,
          );
          return {
            runId: run.id,
            status: "COMPLETED",
            ...counters,
            recordsNoLongerObserved: missing,
            terminalEmptyPage: page,
            startedAt,
            completedAt,
          };
        }

        for (const sourceCustomer of payload) {
          stage = "NORMALIZE";
          const customer = normalizeTagPlusCustomer(sourceCustomer);
          stage = "PERSIST";
          const outcome = await dependencies.customerRepository.upsertCustomer({
            connectionId,
            syncRunId: run.id,
            observedAt: now(),
            customer,
          });
          counters.recordsFetched += 1;
          if (outcome.outcome === "INSERTED") counters.recordsInserted += 1;
          if (outcome.outcome === "UPDATED") counters.recordsUpdated += 1;
          if (outcome.outcome === "UNCHANGED") counters.recordsUnchanged += 1;
          await dependencies.syncRepository.updateProgress(run.id, {
            recordsFetched: counters.recordsFetched,
            recordsInserted: counters.recordsInserted,
            recordsUpdated: counters.recordsUpdated,
            recordsUnchanged: counters.recordsUnchanged,
          });
        }
        counters.lastCompletedPage = page;
        await dependencies.syncRepository.updateProgress(run.id, {
          lastCompletedPage: page,
        });
      }
    } catch (error: unknown) {
      const category = categorize(error, stage);
      const normalizationCategory =
        error instanceof CustomerNormalizationError
          ? error.category
          : category === "CUSTOMER_SYNC_NORMALIZATION_ERROR"
            ? "CUSTOMER_NORMALIZATION_UNEXPECTED"
            : undefined;
      const persistedCategory = normalizationCategory ?? category;
      try {
        await dependencies.syncRepository.failRun(
          run.id,
          now(),
          persistedCategory,
        );
      } catch {
        throw new CustomerSyncError("CUSTOMER_SYNC_ERROR");
      }
      throw new CustomerSyncError(
        category,
        error instanceof CustomerNormalizationError
          ? error.diagnostics
          : undefined,
        normalizationCategory,
        error instanceof CustomerPersistenceError
          ? error.diagnostics
          : undefined,
      );
    }
  };
}

function categorize(
  error: unknown,
  stage: "FETCH" | "NORMALIZE" | "PERSIST" | "RECONCILE",
): CustomerSyncErrorCategory {
  if (error instanceof CustomerSyncError) return error.category;
  if (stage === "FETCH") return "CUSTOMER_SYNC_FETCH_ERROR";
  if (stage === "NORMALIZE" || error instanceof CustomerNormalizationError)
    return "CUSTOMER_SYNC_NORMALIZATION_ERROR";
  if (stage === "PERSIST" || error instanceof CustomerPersistenceError)
    return "CUSTOMER_SYNC_PERSISTENCE_ERROR";
  if (stage === "RECONCILE") return "CUSTOMER_SYNC_RECONCILIATION_ERROR";
  return "CUSTOMER_SYNC_ERROR";
}
