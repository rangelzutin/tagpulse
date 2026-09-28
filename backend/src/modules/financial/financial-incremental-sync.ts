import type { PrismaClient } from "@prisma/client";
import {
  TagPlusHttpError,
  type TagPlusClient,
  type TagPlusResponse,
} from "../../integrations/tagplus/tagplus-client.js";
import type { FinancialRecordRepository } from "./financial-record-repository.js";
import type { FinancialRecordWorker, WorkerProgress, WorkerSummary } from "./financial-record-worker.js";

export interface TagPlusFinancialListItem {
  id?: number | string | null;
}

export interface IncrementalCandidateResult {
  sinceDate: string;
  lookbackDays?: number | undefined;
  recentCandidates: string[];
  openCandidates: string[];
  undatedCandidates: string[];
  uniqueCandidates: string[];
  overlapDeduplicated: number;
}

export interface IncrementalSyncReport {
  sinceDate: string;
  lookbackDays?: number | undefined;
  dryRun: boolean;
  candidates: {
    recentCount: number;
    openCount: number;
    undatedCount: number;
    uniqueCount: number;
    overlapDeduplicated: number;
  };
  prepResult?: {
    total: number;
    newlyCreated: number;
    refreshed: number;
  } | undefined;
  workerSummary?: WorkerSummary | undefined;
  durationMs: number;
  averageDetailRateMs?: number | undefined;
}

export interface RunIncrementalSyncOptions {
  prisma: PrismaClient;
  repository: FinancialRecordRepository;
  worker: FinancialRecordWorker;
  getClient: () => TagPlusClient;
  connectionId: string;
  lookbackDays?: number | undefined;
  since?: string | undefined;
  dryRun?: boolean | undefined;
  limit?: number | undefined;
  rateLimitDelayMs?: number | undefined;
  pageDelayMs?: number | undefined;
  onProgress?: ((progress: WorkerProgress) => void) | undefined;
  refreshToken?: (() => Promise<string | null>) | undefined;
  updateClientToken?: ((newToken: string) => void) | undefined;
  now?: Date | undefined;
}

export function resolveSinceDate(options?: {
  since?: string | undefined;
  lookbackDays?: number | undefined;
  now?: Date | undefined;
}): { sinceDate: string; lookbackDays?: number | undefined } {
  if (options?.since) {
    const trimmed = options.since.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      throw new Error(`Invalid --since date format: "${options.since}". Expected YYYY-MM-DD.`);
    }
    return { sinceDate: trimmed };
  }

  const lookbackDays = options?.lookbackDays ?? 30;
  if (lookbackDays < 0) {
    throw new Error(`Invalid lookbackDays: ${lookbackDays}. Must be non-negative.`);
  }

  const now = options?.now ?? new Date();
  const pastTime = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const sinceDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(pastTime);

  return { sinceDate, lookbackDays };
}

export async function fetchRecentSourceIds(
  getClient: () => TagPlusClient,
  sinceDate: string,
  options?: {
    pageDelayMs?: number | undefined;
    refreshToken?: (() => Promise<string | null>) | undefined;
    updateClientToken?: ((newToken: string) => void) | undefined;
  },
): Promise<string[]> {
  const pageDelayMs = options?.pageDelayMs ?? 300;
  const ids: string[] = [];
  let page = 1;

  while (true) {
    let client = getClient();
    let res: TagPlusResponse<TagPlusFinancialListItem[]>;

    try {
      res = await client.get<TagPlusFinancialListItem[]>(
        `/financeiros?since=${sinceDate}&page=${page}&per_page=100`,
      );
    } catch (err: unknown) {
      if (err instanceof TagPlusHttpError && err.status === 401 && options?.refreshToken) {
        const newToken = await options.refreshToken();
        if (newToken && options.updateClientToken) {
          options.updateClientToken(newToken);
          client = getClient();
          res = await client.get<TagPlusFinancialListItem[]>(
            `/financeiros?since=${sinceDate}&page=${page}&per_page=100`,
          );
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }

    const items = res.data;
    if (!Array.isArray(items)) {
      throw new Error(`Invalid TagPlus response at page ${page}: expected array, got ${typeof items}`);
    }

    // CRITICAL: Stop condition is strictly empty array []
    // Short pages (e.g. 20 items) do NOT terminate pagination!
    if (items.length === 0) {
      break;
    }

    for (const item of items) {
      if (item && item.id != null) {
        const idStr = String(item.id).trim();
        if (idStr) {
          ids.push(idStr);
        }
      }
    }

    page++;
    if (pageDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, pageDelayMs));
    }
  }

  return Array.from(new Set(ids));
}

export async function fetchOpenSourceIds(
  prisma: PrismaClient,
  connectionId: string,
): Promise<string[]> {
  const records = await prisma.financialRecord.findMany({
    where: {
      connectionId,
      sourcePresent: true,
      isConfirmed: false,
    },
    select: { sourceId: true },
  });

  return records.map((r) => r.sourceId);
}

export async function fetchUndatedConfirmedSourceIds(
  prisma: PrismaClient,
  connectionId: string,
): Promise<string[]> {
  const records = await prisma.financialRecord.findMany({
    where: {
      connectionId,
      sourcePresent: true,
      isConfirmed: true,
      confirmationDate: null,
    },
    select: { sourceId: true },
  });

  return records.map((r) => r.sourceId);
}

export async function collectIncrementalCandidates(options: {
  prisma: PrismaClient;
  getClient: () => TagPlusClient;
  connectionId: string;
  lookbackDays?: number | undefined;
  since?: string | undefined;
  now?: Date | undefined;
  pageDelayMs?: number | undefined;
  refreshToken?: (() => Promise<string | null>) | undefined;
  updateClientToken?: ((newToken: string) => void) | undefined;
}): Promise<IncrementalCandidateResult> {
  const { sinceDate, lookbackDays } = resolveSinceDate({
    since: options.since,
    lookbackDays: options.lookbackDays,
    now: options.now,
  });

  // Source A: RECENT
  const recentCandidates = await fetchRecentSourceIds(
    options.getClient,
    sinceDate,
    {
      pageDelayMs: options.pageDelayMs,
      refreshToken: options.refreshToken,
      updateClientToken: options.updateClientToken,
    },
  );

  // Source B: OPEN RECONCILIATION
  const openCandidates = await fetchOpenSourceIds(options.prisma, options.connectionId);

  // Source C: UNDATED CONFIRMED
  const undatedCandidates = await fetchUndatedConfirmedSourceIds(
    options.prisma,
    options.connectionId,
  );

  // Deduplicated UNION
  const candidateSet = new Set<string>();
  for (const id of recentCandidates) candidateSet.add(id);
  for (const id of openCandidates) candidateSet.add(id);
  for (const id of undatedCandidates) candidateSet.add(id);

  const uniqueCandidates = Array.from(candidateSet);
  const totalCandidateEntries =
    recentCandidates.length + openCandidates.length + undatedCandidates.length;
  const overlapDeduplicated = totalCandidateEntries - uniqueCandidates.length;

  return {
    sinceDate,
    lookbackDays,
    recentCandidates,
    openCandidates,
    undatedCandidates,
    uniqueCandidates,
    overlapDeduplicated,
  };
}

export async function runIncrementalSync(
  options: RunIncrementalSyncOptions,
): Promise<IncrementalSyncReport> {
  const startTime = performance.now();
  const dryRun = options.dryRun ?? false;

  // 1. Discover and deduplicate candidates
  const candidates = await collectIncrementalCandidates({
    prisma: options.prisma,
    getClient: options.getClient,
    connectionId: options.connectionId,
    lookbackDays: options.lookbackDays,
    since: options.since,
    now: options.now,
    pageDelayMs: options.pageDelayMs,
    refreshToken: options.refreshToken,
    updateClientToken: options.updateClientToken,
  });

  if (dryRun) {
    const durationMs = Math.round(performance.now() - startTime);
    return {
      sinceDate: candidates.sinceDate,
      lookbackDays: candidates.lookbackDays,
      dryRun: true,
      candidates: {
        recentCount: candidates.recentCandidates.length,
        openCount: candidates.openCandidates.length,
        undatedCount: candidates.undatedCandidates.length,
        uniqueCount: candidates.uniqueCandidates.length,
        overlapDeduplicated: candidates.overlapDeduplicated,
      },
      durationMs,
    };
  }

  // 2. Prepare / refresh sync items for candidate IDs
  const prepResult = await options.repository.prepareIncrementalCandidates(
    options.connectionId,
    candidates.uniqueCandidates,
  );

  // 3. Process candidates through existing worker infrastructure
  const workerSummary = await options.worker.processQueue(options.connectionId, {
    candidateSourceIds: candidates.uniqueCandidates,
    limit: options.limit,
    rateLimitDelayMs: options.rateLimitDelayMs,
    onProgress: options.onProgress,
  });

  const durationMs = Math.round(performance.now() - startTime);
  const averageDetailRateMs =
    workerSummary.processed > 0
      ? Math.round(workerSummary.elapsedMs / workerSummary.processed)
      : undefined;

  return {
    sinceDate: candidates.sinceDate,
    lookbackDays: candidates.lookbackDays,
    dryRun: false,
    candidates: {
      recentCount: candidates.recentCandidates.length,
      openCount: candidates.openCandidates.length,
      undatedCount: candidates.undatedCandidates.length,
      uniqueCount: candidates.uniqueCandidates.length,
      overlapDeduplicated: candidates.overlapDeduplicated,
    },
    prepResult,
    workerSummary,
    durationMs,
    averageDetailRateMs,
  };
}
