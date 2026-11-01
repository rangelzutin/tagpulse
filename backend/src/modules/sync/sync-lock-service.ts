export type SyncLockType = "GLOBAL_SYNC" | "FINANCIAL_INCREMENTAL";

export interface SyncLockFinancialSnapshot {
  status: "IDLE" | "RUNNING" | "SUCCEEDED" | "FAILED";
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  since: string | null;
  lookbackDays: number | null;
  recentCandidates: number;
  openCandidates: number;
  undatedCandidates: number;
  uniqueCandidates: number;
  totalCandidates: number;
  overlapDeduplicated: number;
  processed: number;
  completed: number;
  failed: number;
  notFound: number;
  inserted: number;
  updated: number;
  unchanged: number;
  lastError: string | null;
}

export interface SyncLockInfo {
  type: SyncLockType;
  connectionId: string;
  runId?: string | undefined;
  startedAt: Date;
  stage?: string | undefined;
  details?: Record<string, unknown> | undefined;
  financialSnapshot?: SyncLockFinancialSnapshot | undefined;
}

export class SyncLockConflictError extends Error {
  constructor(public readonly activeLock: SyncLockInfo) {
    super("SYNC_ALREADY_RUNNING");
    this.name = "SyncLockConflictError";
  }
}

export interface SyncLockHandle {
  info: SyncLockInfo;
  updateStage: (stage: string) => void;
  updateFinancialSnapshot: (snapshot: Partial<SyncLockFinancialSnapshot>) => void;
  release: () => void;
}

export interface SyncLockService {
  acquire(params: {
    type: SyncLockType;
    connectionId: string;
    runId?: string | undefined;
    stage?: string | undefined;
    details?: Record<string, unknown> | undefined;
  }): SyncLockHandle;
  getActive(connectionId: string): SyncLockInfo | null;
  isLocked(connectionId: string): boolean;
  forceRelease(connectionId: string): void;
  getFinancialSnapshot(connectionId: string): SyncLockFinancialSnapshot | null;
}

export function createDefaultFinancialSnapshot(): SyncLockFinancialSnapshot {
  return {
    status: "IDLE",
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    since: null,
    lookbackDays: null,
    recentCandidates: 0,
    openCandidates: 0,
    undatedCandidates: 0,
    uniqueCandidates: 0,
    totalCandidates: 0,
    overlapDeduplicated: 0,
    processed: 0,
    completed: 0,
    failed: 0,
    notFound: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    lastError: null,
  };
}

export function createSyncLockService(): SyncLockService {
  const activeLocks = new Map<string, SyncLockInfo>();
  const lastFinancialSnapshots = new Map<string, SyncLockFinancialSnapshot>();

  return {
    acquire(params: {
      type: SyncLockType;
      connectionId: string;
      runId?: string | undefined;
      stage?: string | undefined;
      details?: Record<string, unknown> | undefined;
    }): SyncLockHandle {
      const existing = activeLocks.get(params.connectionId);
      if (existing) {
        throw new SyncLockConflictError(existing);
      }

      const info: SyncLockInfo = {
        type: params.type,
        connectionId: params.connectionId,
        runId: params.runId,
        startedAt: new Date(),
        stage: params.stage,
        details: params.details,
      };

      activeLocks.set(params.connectionId, info);

      let released = false;
      return {
        info,
        updateStage: (stage: string) => {
          if (!released) {
            info.stage = stage;
          }
        },
        updateFinancialSnapshot: (partial: Partial<SyncLockFinancialSnapshot>) => {
          const base =
            info.financialSnapshot ??
            createDefaultFinancialSnapshot();
          const next: SyncLockFinancialSnapshot = {
            ...base,
            ...partial,
          };
          info.financialSnapshot = next;
          lastFinancialSnapshots.set(params.connectionId, next);
        },
        release: () => {
          if (!released) {
            released = true;
            const current = activeLocks.get(params.connectionId);
            if (current === info) {
              activeLocks.delete(params.connectionId);
            }
          }
        },
      };
    },

    getActive(connectionId: string): SyncLockInfo | null {
      return activeLocks.get(connectionId) ?? null;
    },

    isLocked(connectionId: string): boolean {
      return activeLocks.has(connectionId);
    },

    forceRelease(connectionId: string): void {
      activeLocks.delete(connectionId);
    },

    getFinancialSnapshot(connectionId: string): SyncLockFinancialSnapshot | null {
      const active = activeLocks.get(connectionId);
      if (active) {
        const snap = active.financialSnapshot;
        return {
          ...(snap ?? createDefaultFinancialSnapshot()),
          status: "RUNNING",
          startedAt: snap?.startedAt ?? active.startedAt.toISOString(),
          finishedAt: null,
        };
      }
      return lastFinancialSnapshots.get(connectionId) ?? null;
    },
  };
}
