import type { PrismaClient } from "@prisma/client";
import {
  TagPlusHttpError,
  type TagPlusClient,
} from "../../integrations/tagplus/tagplus-client.js";
import { normalizeTagPlusFinancialRecord } from "../../integrations/tagplus/financial/financial-record-normalizer.js";
import type { FinancialRecordRepository } from "./financial-record-repository.js";

export interface WorkerProgress {
  processed: number;
  completed: number;
  failed: number;
  notFound: number;
  lastSourceId: string;
  action: "COMPLETED" | "FAILED" | "NOT_FOUND";
  recordAction?: "inserted" | "updated" | "unchanged" | undefined;
}

export interface WorkerOptions {
  limit?: number | undefined;
  specificSourceId?: string | undefined;
  candidateSourceIds?: string[] | undefined;
  rateLimitDelayMs?: number | undefined; // default 2150ms (~28 req/min)
  maxRetries?: number | undefined; // default 3 for 5xx/network
  staleMinutes?: number | undefined; // default 15
  onProgress?: ((progress: WorkerProgress) => void) | undefined;
}

export interface WorkerSummary {
  processed: number;
  completed: number;
  failed: number;
  notFound: number;
  elapsedMs: number;
  inserted: number;
  updated: number;
  unchanged: number;
}

export interface FinancialRecordWorkerDeps {
  prisma: PrismaClient;
  repository: FinancialRecordRepository;
  getClient: () => TagPlusClient;
  updateClientToken?: ((newToken: string) => void) | undefined;
  refreshToken?: (() => Promise<string | null>) | undefined;
}

export interface FinancialRecordWorker {
  processQueue(connectionId: string, options?: WorkerOptions | undefined): Promise<WorkerSummary>;
}

export function createFinancialRecordWorker(
  deps: FinancialRecordWorkerDeps,
): FinancialRecordWorker {
  const { prisma, repository } = deps;

  return {
    async processQueue(
      connectionId: string,
      options: WorkerOptions = {},
    ): Promise<WorkerSummary> {
      const startTime = performance.now();
      const limit = options.limit ?? Number.POSITIVE_INFINITY;
      const rateLimitDelayMs = options.rateLimitDelayMs ?? 2150;
      const maxRetries = options.maxRetries ?? 3;
      const staleMinutes = options.staleMinutes ?? 15;

      let processed = 0;
      let completed = 0;
      let failed = 0;
      let notFound = 0;
      let inserted = 0;
      let updated = 0;
      let unchanged = 0;

      const candidateQueue = options.candidateSourceIds
        ? [...options.candidateSourceIds]
        : null;
      let candidateIndex = 0;

      while (processed < limit) {
        let item: { sourceId: string; attemptCount: number } | null = null;

        if (candidateQueue) {
          if (candidateIndex >= candidateQueue.length) {
            break;
          }
          const nextCandidateId = candidateQueue[candidateIndex++];
          item = await repository.claimNextPendingItem(connectionId, {
            specificSourceId: nextCandidateId,
            staleMinutes,
          });
        } else {
          item = await repository.claimNextPendingItem(connectionId, {
            specificSourceId: options.specificSourceId,
            staleMinutes,
          });
        }

        if (!item) {
          if (candidateQueue) {
            continue;
          }
          break;
        }

        const { sourceId } = item;
        let attempt = 0;
        let success = false;
        let item429Retries = 0;
        const max429Retries = 3;

        while (!success && attempt <= maxRetries) {
          try {
            const client = deps.getClient();
            const response = await client.get(`/financeiros/${sourceId}`);

            // Normalize payload
            const normalized = normalizeTagPlusFinancialRecord(response.data);

            // Persist record & checkpoint in a short, atomic Prisma transaction
            const now = new Date();
            let saveResult: { action: "inserted" | "updated" | "unchanged"; id: string } | undefined;
            await prisma.$transaction(async (tx) => {
              saveResult = await repository.saveFinancialRecordWithTx(tx, connectionId, normalized, now);
              await repository.markItemCompletedWithTx(tx, connectionId, sourceId, now);
            });

            if (saveResult?.action === "inserted") inserted++;
            else if (saveResult?.action === "updated") updated++;
            else if (saveResult?.action === "unchanged") unchanged++;

            completed++;
            processed++;
            success = true;

            if (options.onProgress) {
              options.onProgress({
                processed,
                completed,
                failed,
                notFound,
                lastSourceId: sourceId,
                action: "COMPLETED",
                recordAction: saveResult?.action,
              });
            }
          } catch (error: unknown) {
            // Check HTTP 401 (token expiration)
            if (error instanceof TagPlusHttpError && error.status === 401 && deps.refreshToken) {
              try {
                const newToken = await deps.refreshToken();
                if (newToken && deps.updateClientToken) {
                  deps.updateClientToken(newToken);
                  // Retry once immediately with new token
                  continue;
                }
              } catch (refreshErr: unknown) {
                // Refresh failed
                const refreshMsg = refreshErr instanceof Error ? refreshErr.message : "Unknown error";
                await repository.markItemFailed(
                  connectionId,
                  sourceId,
                  `OAuth token refresh failed: ${refreshMsg}`,
                  401,
                );
                failed++;
                processed++;
                if (options.onProgress) {
                  options.onProgress({
                    processed,
                    completed,
                    failed,
                    notFound,
                    lastSourceId: sourceId,
                    action: "FAILED",
                  });
                }
                break;
              }
            }

            // Check HTTP 429 (rate limit)
            if (error instanceof TagPlusHttpError && error.status === 429) {
              item429Retries++;
              if (item429Retries <= max429Retries) {
                let waitMs = 30_000 * Math.pow(2, item429Retries - 1); // 30s, 60s, 120s
                const retryAfterHeader = error.headers?.get("retry-after");
                if (retryAfterHeader) {
                  const parsedSeconds = Number.parseInt(retryAfterHeader, 10);
                  if (!Number.isNaN(parsedSeconds) && parsedSeconds > 0) {
                    waitMs = parsedSeconds * 1000;
                  }
                }
                await new Promise((resolve) => setTimeout(resolve, waitMs));
                continue;
              }
            }

            // Check HTTP 404 (not found)
            if (error instanceof TagPlusHttpError && error.status === 404) {
              await repository.markItemNotFound(connectionId, sourceId, 404);
              notFound++;
              processed++;
              if (options.onProgress) {
                options.onProgress({
                  processed,
                  completed,
                  failed,
                  notFound,
                  lastSourceId: sourceId,
                  action: "NOT_FOUND",
                });
              }
              break;
            }

            // 5xx / timeout / network retry
            attempt++;
            if (attempt <= maxRetries) {
              const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10_000);
              await new Promise((resolve) => setTimeout(resolve, backoffMs));
            } else {
              const status = error instanceof TagPlusHttpError ? error.status : undefined;
              const errorMsg = error instanceof Error ? error.message : "Unknown error";
              await repository.markItemFailed(connectionId, sourceId, errorMsg, status);
              failed++;
              processed++;
              if (options.onProgress) {
                options.onProgress({
                  processed,
                  completed,
                  failed,
                  notFound,
                  lastSourceId: sourceId,
                  action: "FAILED",
                });
              }
            }
          }
        }

        // If specific sourceId was requested, stop after this single item
        if (options.specificSourceId) {
          break;
        }

        // Respect conservative rate limit interval between requests
        if (rateLimitDelayMs > 0 && processed < limit) {
          await new Promise((resolve) => setTimeout(resolve, rateLimitDelayMs));
        }
      }

      const elapsedMs = Math.round(performance.now() - startTime);

      return {
        processed,
        completed,
        failed,
        notFound,
        elapsedMs,
        inserted,
        updated,
        unchanged,
      };
    },
  };
}
