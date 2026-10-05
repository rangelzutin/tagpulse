export type SyncLockType = "GLOBAL_SYNC" | "FINANCIAL_INCREMENTAL";

export interface SyncLockInfo {
  type: SyncLockType;
  connectionId: string;
  runId?: string | undefined;
  startedAt: Date;
  details?: Record<string, unknown> | undefined;
}

export class SyncLockConflictError extends Error {
  constructor(public readonly activeLock: SyncLockInfo) {
    super("SYNC_ALREADY_RUNNING");
    this.name = "SyncLockConflictError";
  }
}

export interface SyncLockHandle {
  info: SyncLockInfo;
  release: () => void;
}

export interface SyncLockService {
  acquire(params: {
    type: SyncLockType;
    connectionId: string;
    runId?: string | undefined;
    details?: Record<string, unknown> | undefined;
  }): SyncLockHandle;
  getActive(connectionId: string): SyncLockInfo | null;
  isLocked(connectionId: string): boolean;
  forceRelease(connectionId: string): void;
}

export function createSyncLockService(): SyncLockService {
  const activeLocks = new Map<string, SyncLockInfo>();

  return {
    acquire(params: {
      type: SyncLockType;
      connectionId: string;
      runId?: string | undefined;
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
        details: params.details,
      };

      activeLocks.set(params.connectionId, info);

      let released = false;
      return {
        info,
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
  };
}
