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
  tailCandidates?: string[] | undefined;
  openCandidates: string[];
  undatedCandidates: string[];
  additionalCandidates?: string[] | undefined;
  uniqueCandidates: string[];
  overlapDeduplicated: number;
}

export interface IncrementalSyncReport {
  sinceDate: string;
  lookbackDays?: number | undefined;
  dryRun: boolean;
  candidates: {
    recentCount: number;
    tailCount?: number | undefined;
    openCount: number;
    undatedCount: number;
    additionalCount?: number | undefined;
    uniqueCount: number;
    overlapDeduplicated: number;
  };
  candidateSourceIds?: string[] | undefined;
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
  enableTailScan?: boolean | undefined;
  tailLookbackPages?: number | undefined;
  knownMaxSourceId?: number | undefined;
  additionalCandidateIds?: string[] | undefined;
  candidateSourceIds?: string[] | undefined;
  onCandidatesDiscovered?: ((candidates: IncrementalCandidateResult) => void) | undefined;
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

export async function getKnownMaxSourceId(
  prisma: PrismaClient,
  connectionId: string,
): Promise<number> {
  if (!prisma) return 0;
  try {
    if ((prisma as any).financialRecordSyncItem?.findMany) {
      const items = await (prisma as any).financialRecordSyncItem.findMany({
        where: { connectionId },
        select: { sourceId: true },
        orderBy: { createdAt: "desc" },
        take: 500,
      });
      let max = 0;
      if (Array.isArray(items)) {
        for (const item of items) {
          const num = Number.parseInt(String(item.sourceId).trim(), 10);
          if (!Number.isNaN(num) && num > max) max = num;
        }
      }
      return max;
    }
    return 0;
  } catch {
    return 0;
  }
}

export async function fetchCatalogTailSourceIds(
  getClient: () => TagPlusClient,
  prisma: PrismaClient,
  connectionId: string,
  options?: {
    pageDelayMs?: number | undefined;
    refreshToken?: (() => Promise<string | null>) | undefined;
    updateClientToken?: ((newToken: string) => void) | undefined;
    tailLookbackPages?: number | undefined;
    knownMaxSourceId?: number | undefined;
    maxScanPages?: number | undefined;
  },
): Promise<string[]> {
  const pageDelayMs = options?.pageDelayMs ?? 300;
  const tailLookbackPages = options?.tailLookbackPages ?? 3;
  const perPage = 100;

  let knownMaxId = options?.knownMaxSourceId ?? 0;
  if (knownMaxId <= 0 && prisma) {
    knownMaxId = await getKnownMaxSourceId(prisma, connectionId);
  }

  let knownCount = 0;
  if (prisma && (prisma as any).financialRecordSyncItem?.count) {
    try {
      knownCount = await (prisma as any).financialRecordSyncItem.count({
        where: { connectionId },
      });
    } catch {
      knownCount = 0;
    }
  }

  if (knownCount === 0 && knownMaxId === 0) {
    return [];
  }

  let startPage = 1;
  if (knownCount > 0) {
    startPage = Math.max(1, Math.floor(knownCount / perPage) - tailLookbackPages);
  } else if (knownMaxId > 0) {
    startPage = Math.max(1, Math.floor(knownMaxId / perPage) - tailLookbackPages);
  }

  const ids: string[] = [];
  let page = startPage;
  let steppedBack = false;
  let scannedPagesCount = 0;
  const maxScanPages = options?.maxScanPages ?? 200;

  while (scannedPagesCount < maxScanPages) {
    let client = getClient();
    let res: TagPlusResponse<TagPlusFinancialListItem[]>;

    try {
      res = await client.get<TagPlusFinancialListItem[]>(
        `/financeiros?page=${page}&per_page=${perPage}`,
      );
    } catch (err: unknown) {
      if (err instanceof TagPlusHttpError && err.status === 401 && options?.refreshToken) {
        const newToken = await options.refreshToken();
        if (newToken && options.updateClientToken) {
          options.updateClientToken(newToken);
          client = getClient();
          res = await client.get<TagPlusFinancialListItem[]>(
            `/financeiros?page=${page}&per_page=${perPage}`,
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
      throw new Error(
        `Invalid TagPlus response at page ${page}: expected array, got ${typeof items}`,
      );
    }

    if (items.length === 0) {
      if (page === startPage && startPage > 1) {
        startPage = Math.max(1, startPage - 5);
        page = startPage;
        continue;
      }
      break;
    }

    if (knownMaxId > 0 && startPage > 1 && !steppedBack) {
      const firstItem = items[0];
      const firstId = firstItem && firstItem.id != null ? Number(firstItem.id) : null;
      if (firstId != null && !Number.isNaN(firstId) && firstId > knownMaxId) {
        startPage = Math.max(1, startPage - 5);
        page = startPage;
        continue;
      }
      steppedBack = true;
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
    scannedPagesCount++;
    if (pageDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, pageDelayMs));
    }
  }

  return Array.from(new Set(ids));
}

export async function collectIncrementalCandidates(options: {
  prisma: PrismaClient;
  getClient: () => TagPlusClient;
  connectionId: string;
  lookbackDays?: number | undefined;
  since?: string | undefined;
  now?: Date | undefined;
  pageDelayMs?: number | undefined;
  enableTailScan?: boolean | undefined;
  tailLookbackPages?: number | undefined;
  knownMaxSourceId?: number | undefined;
  additionalCandidateIds?: string[] | undefined;
  candidateSourceIds?: string[] | undefined;
  refreshToken?: (() => Promise<string | null>) | undefined;
  updateClientToken?: ((newToken: string) => void) | undefined;
}): Promise<IncrementalCandidateResult> {
  const { sinceDate, lookbackDays } = resolveSinceDate({
    since: options.since,
    lookbackDays: options.lookbackDays,
    now: options.now,
  });

  // Source A: RECENT (filtro por data_vencimento na API TagPlus)
  const recentCandidates = await fetchRecentSourceIds(
    options.getClient,
    sinceDate,
    {
      pageDelayMs: options.pageDelayMs,
      refreshToken: options.refreshToken,
      updateClientToken: options.updateClientToken,
    },
  );

  // Source B: CATALOG TAIL (novos lançamentos criados no TagPlus com qualquer vencimento)
  const enableTailScan = options.enableTailScan ?? true;
  const tailCandidates = enableTailScan
    ? await fetchCatalogTailSourceIds(
        options.getClient,
        options.prisma,
        options.connectionId,
        {
          pageDelayMs: options.pageDelayMs,
          refreshToken: options.refreshToken,
          updateClientToken: options.updateClientToken,
          tailLookbackPages: options.tailLookbackPages,
          knownMaxSourceId: options.knownMaxSourceId,
        },
      )
    : [];

  // Source C: OPEN RECONCILIATION
  const openCandidates = await fetchOpenSourceIds(options.prisma, options.connectionId);

  // Source D: UNDATED CONFIRMED
  const undatedCandidates = await fetchUndatedConfirmedSourceIds(
    options.prisma,
    options.connectionId,
  );

  // Source E: ADDITIONAL CANDIDATES (backfill controlado / IDs explícitos)
  const explicitIds = [
    ...(options.additionalCandidateIds ?? []),
    ...(options.candidateSourceIds ?? []),
  ];
  const additionalCandidates = Array.from(
    new Set(explicitIds.map((id) => String(id).trim())),
  ).filter(Boolean);

  // Deduplicated UNION
  const candidateSet = new Set<string>();
  for (const id of recentCandidates) candidateSet.add(id);
  for (const id of tailCandidates) candidateSet.add(id);
  for (const id of openCandidates) candidateSet.add(id);
  for (const id of undatedCandidates) candidateSet.add(id);
  for (const id of additionalCandidates) candidateSet.add(id);

  const uniqueCandidates = Array.from(candidateSet);
  const totalCandidateEntries =
    recentCandidates.length +
    tailCandidates.length +
    openCandidates.length +
    undatedCandidates.length +
    additionalCandidates.length;
  const overlapDeduplicated = totalCandidateEntries - uniqueCandidates.length;

  return {
    sinceDate,
    lookbackDays,
    recentCandidates,
    tailCandidates,
    openCandidates,
    undatedCandidates,
    additionalCandidates,
    uniqueCandidates,
    overlapDeduplicated,
  };
}

export async function runIncrementalSync(
  options: RunIncrementalSyncOptions,
): Promise<IncrementalSyncReport> {
  const startTime = performance.now();
  const dryRun = options.dryRun ?? false;

  // 1. Discover and deduplicate candidates across all vectors
  const candidates = await collectIncrementalCandidates({
    prisma: options.prisma,
    getClient: options.getClient,
    connectionId: options.connectionId,
    lookbackDays: options.lookbackDays,
    since: options.since,
    now: options.now,
    pageDelayMs: options.pageDelayMs,
    enableTailScan: options.enableTailScan,
    tailLookbackPages: options.tailLookbackPages,
    knownMaxSourceId: options.knownMaxSourceId,
    additionalCandidateIds: options.additionalCandidateIds,
    candidateSourceIds: options.candidateSourceIds,
    refreshToken: options.refreshToken,
    updateClientToken: options.updateClientToken,
  });

  options.onCandidatesDiscovered?.(candidates);

  if (dryRun) {
    const durationMs = Math.round(performance.now() - startTime);
    return {
      sinceDate: candidates.sinceDate,
      lookbackDays: candidates.lookbackDays,
      dryRun: true,
      candidates: {
        recentCount: candidates.recentCandidates.length,
        tailCount: candidates.tailCandidates?.length ?? 0,
        openCount: candidates.openCandidates.length,
        undatedCount: candidates.undatedCandidates.length,
        additionalCount: candidates.additionalCandidates?.length ?? 0,
        uniqueCount: candidates.uniqueCandidates.length,
        overlapDeduplicated: candidates.overlapDeduplicated,
      },
      candidateSourceIds: candidates.uniqueCandidates,
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
      tailCount: candidates.tailCandidates?.length ?? 0,
      openCount: candidates.openCandidates.length,
      undatedCount: candidates.undatedCandidates.length,
      additionalCount: candidates.additionalCandidates?.length ?? 0,
      uniqueCount: candidates.uniqueCandidates.length,
      overlapDeduplicated: candidates.overlapDeduplicated,
    },
    candidateSourceIds: candidates.uniqueCandidates,
    prepResult,
    workerSummary,
    durationMs,
    averageDetailRateMs,
  };
}
