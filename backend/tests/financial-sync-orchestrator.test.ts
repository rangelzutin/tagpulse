/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import {
  createFinancialSyncOrchestrator,
  FinancialSyncAlreadyRunningError,
  FinancialSyncValidationError,
  sanitizeFinancialErrorMessage,
} from "../src/modules/financial/financial-sync-orchestrator.js";
import type { IncrementalSyncReport } from "../src/modules/financial/financial-incremental-sync.js";

describe("FinancialSyncOrchestrator (Fase 5G)", () => {
  const dummyConnection = {
    id: "conn-test-123",
    status: "ACTIVE",
    apiVersion: "2.0",
  };

  function createMockPrisma() {
    return {
      tagPlusConnection: {
        findUnique: vi.fn().mockResolvedValue(dummyConnection),
        findFirst: vi.fn().mockResolvedValue(dummyConnection),
      },
    } as any;
  }

  function createMockTokenStore() {
    return {
      get: vi.fn().mockReturnValue({
        accessToken: "test-access-token",
        refreshToken: "test-refresh-token",
      }),
      set: vi.fn(),
    } as any;
  }

  it("sanitizes sensitive tokens, secrets and authorization headers", () => {
    const errorWithBearer = new Error("Failed with Bearer my_secret_token_12345 in header");
    expect(sanitizeFinancialErrorMessage(errorWithBearer)).toBe(
      "Failed with [REDACTED_TOKEN] in header",
    );

    const errorWithQuery = new Error(
      "Query param access_token=secret_abc123 and refresh_token=ref_xyz789 failed with client_secret=top_secret_999",
    );
    expect(sanitizeFinancialErrorMessage(errorWithQuery)).toBe(
      "Query param access_token=[REDACTED_TOKEN] and refresh_token=[REDACTED_TOKEN] failed with client_secret=[REDACTED_SECRET]",
    );
  });

  describe("Status before any execution (IDLE)", () => {
    it("returns initial IDLE status with 0 counters and null timestamps", () => {
      const orchestrator = createFinancialSyncOrchestrator({
        prisma: createMockPrisma(),
        tokenStore: createMockTokenStore(),
      });

      const status = orchestrator.getStatus();
      expect(status).toEqual({
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
      });
    });
  });

  describe("Parameters validation", () => {
    it("uses default lookbackDays=30 when no params provided", async () => {
      const mockRunSync = vi.fn().mockResolvedValue({
        sinceDate: "2026-08-29",
        lookbackDays: 30,
        dryRun: false,
        candidates: {
          recentCount: 1,
          openCount: 0,
          undatedCount: 0,
          uniqueCount: 1,
          overlapDeduplicated: 0,
        },
        workerSummary: {
          processed: 1,
          completed: 1,
          failed: 0,
          notFound: 0,
          elapsedMs: 100,
          inserted: 1,
          updated: 0,
          unchanged: 0,
        },
        durationMs: 100,
      } as IncrementalSyncReport);

      const fixedNow = new Date("2026-09-28T12:00:00Z");
      const orchestrator = createFinancialSyncOrchestrator({
        prisma: createMockPrisma(),
        tokenStore: createMockTokenStore(),
        runIncrementalSyncFn: mockRunSync,
        now: () => fixedNow,
      });

      const result = await orchestrator.startSync({});
      expect(result.accepted).toBe(true);
      expect(result.status).toBe("RUNNING");
      expect(result.lookbackDays).toBe(30);
      expect(result.since).toBe("2026-08-29");
    });

    it("supports custom lookbackDays", async () => {
      const mockRunSync = vi.fn().mockResolvedValue({
        sinceDate: "2026-09-18",
        lookbackDays: 10,
        dryRun: false,
        candidates: { recentCount: 0, openCount: 0, undatedCount: 0, uniqueCount: 0, overlapDeduplicated: 0 },
        durationMs: 50,
      } as IncrementalSyncReport);

      const fixedNow = new Date("2026-09-28T12:00:00Z");
      const orchestrator = createFinancialSyncOrchestrator({
        prisma: createMockPrisma(),
        tokenStore: createMockTokenStore(),
        runIncrementalSyncFn: mockRunSync,
        now: () => fixedNow,
      });

      const result = await orchestrator.startSync({ lookbackDays: 10 });
      expect(result.accepted).toBe(true);
      expect(result.lookbackDays).toBe(10);
      expect(result.since).toBe("2026-09-18");
    });

    it("since prevails over lookbackDays when both are provided", async () => {
      const mockRunSync = vi.fn().mockResolvedValue({
        sinceDate: "2026-08-01",
        lookbackDays: undefined,
        dryRun: false,
        candidates: { recentCount: 0, openCount: 0, undatedCount: 0, uniqueCount: 0, overlapDeduplicated: 0 },
        durationMs: 50,
      } as IncrementalSyncReport);

      const fixedNow = new Date("2026-09-28T12:00:00Z");
      const orchestrator = createFinancialSyncOrchestrator({
        prisma: createMockPrisma(),
        tokenStore: createMockTokenStore(),
        runIncrementalSyncFn: mockRunSync,
        now: () => fixedNow,
      });

      const result = await orchestrator.startSync({ since: "2026-08-01", lookbackDays: 15 });
      expect(result.accepted).toBe(true);
      expect(result.since).toBe("2026-08-01");
      expect(result.lookbackDays).toBeUndefined();
    });

    it("rejects invalid since format before starting execution", async () => {
      const orchestrator = createFinancialSyncOrchestrator({
        prisma: createMockPrisma(),
        tokenStore: createMockTokenStore(),
      });

      await expect(orchestrator.startSync({ since: "01/08/2026" })).rejects.toThrow(
        FinancialSyncValidationError,
      );
      await expect(orchestrator.startSync({ since: "2026-02-30" })).rejects.toThrow(
        FinancialSyncValidationError,
      );
    });

    it("rejects invalid lookbackDays before starting execution", async () => {
      const orchestrator = createFinancialSyncOrchestrator({
        prisma: createMockPrisma(),
        tokenStore: createMockTokenStore(),
      });

      await expect(orchestrator.startSync({ lookbackDays: 0 })).rejects.toThrow(
        FinancialSyncValidationError,
      );
      await expect(orchestrator.startSync({ lookbackDays: -5 })).rejects.toThrow(
        FinancialSyncValidationError,
      );
      await expect(orchestrator.startSync({ lookbackDays: 5000 })).rejects.toThrow(
        FinancialSyncValidationError,
      );
      await expect(orchestrator.startSync({ lookbackDays: 2.5 })).rejects.toThrow(
        FinancialSyncValidationError,
      );
    });
  });

  describe("Deterministic Concurrency Control & State Progression", () => {
    it("handles full lifecycle: start -> 409 conflict during RUNNING -> SUCCEEDED -> can start next run", async () => {
      let resolveSync!: (value: IncrementalSyncReport) => void;
      const controlledPromise = new Promise<IncrementalSyncReport>((resolve) => {
        resolveSync = resolve;
      });

      let onCandidatesDiscoveredCb: any;
      let onProgressCb: any;

      const mockRunSync = vi.fn().mockImplementation((opts: any) => {
        onCandidatesDiscoveredCb = opts.onCandidatesDiscovered;
        onProgressCb = opts.onProgress;
        return controlledPromise;
      });

      const startTime = new Date("2026-09-28T14:00:00Z");
      let currentTime = startTime;

      const orchestrator = createFinancialSyncOrchestrator({
        prisma: createMockPrisma(),
        tokenStore: createMockTokenStore(),
        runIncrementalSyncFn: mockRunSync,
        now: () => currentTime,
      });

      // 1. First POST starts execution
      const startResult = await orchestrator.startSync({ lookbackDays: 30 });
      expect(startResult.accepted).toBe(true);
      expect(startResult.status).toBe("RUNNING");
      expect(startResult.startedAt).toBe("2026-09-28T14:00:00.000Z");

      // Verify status is RUNNING
      let status = orchestrator.getStatus();
      expect(status.status).toBe("RUNNING");
      expect(status.finishedAt).toBeNull();

      // Simulate candidates discovered
      onCandidatesDiscoveredCb({
        sinceDate: "2026-08-29",
        lookbackDays: 30,
        recentCandidates: ["1", "2"],
        openCandidates: ["3"],
        undatedCandidates: [],
        uniqueCandidates: ["1", "2", "3"],
        overlapDeduplicated: 0,
      });

      status = orchestrator.getStatus();
      expect(status.totalCandidates).toBe(3);
      expect(status.uniqueCandidates).toBe(3);
      expect(status.recentCandidates).toBe(2);
      expect(status.openCandidates).toBe(1);

      // Simulate progress updates: 1/3, 2/3
      onProgressCb({
        processed: 1,
        completed: 1,
        failed: 0,
        notFound: 0,
        lastSourceId: "1",
        action: "COMPLETED",
        recordAction: "inserted",
      });
      status = orchestrator.getStatus();
      expect(status.processed).toBe(1);
      expect(status.completed).toBe(1);
      expect(status.inserted).toBe(1);

      // 2. Second POST during RUNNING must be rejected with 409 FinancialSyncAlreadyRunningError
      await expect(orchestrator.startSync({ lookbackDays: 30 })).rejects.toThrow(
        FinancialSyncAlreadyRunningError,
      );
      // Ensure sync was NOT called a second time
      expect(mockRunSync).toHaveBeenCalledTimes(1);

      // Advance time and complete run
      currentTime = new Date("2026-09-28T14:02:30Z"); // 150 seconds later
      resolveSync({
        sinceDate: "2026-08-29",
        lookbackDays: 30,
        dryRun: false,
        candidates: {
          recentCount: 2,
          openCount: 1,
          undatedCount: 0,
          uniqueCount: 3,
          overlapDeduplicated: 0,
        },
        workerSummary: {
          processed: 3,
          completed: 3,
          failed: 0,
          notFound: 0,
          elapsedMs: 150000,
          inserted: 1,
          updated: 2,
          unchanged: 0,
        },
        durationMs: 150000,
      });

      // Wait a tick for microtask resolution
      await new Promise((r) => setTimeout(r, 10));

      // 3. Status must now be SUCCEEDED
      status = orchestrator.getStatus();
      expect(status.status).toBe("SUCCEEDED");
      expect(status.finishedAt).toBe("2026-09-28T14:02:30.000Z");
      expect(status.durationMs).toBe(150000);
      expect(status.processed).toBe(3);
      expect(status.completed).toBe(3);
      expect(status.inserted).toBe(1);
      expect(status.updated).toBe(2);
      expect(status.lastError).toBeNull();

      // 4. Third POST can now start a new run
      currentTime = new Date("2026-09-28T14:10:00Z");
      const nextRunPromise = Promise.resolve({
        sinceDate: "2026-08-29",
        lookbackDays: 30,
        dryRun: false,
        candidates: { recentCount: 0, openCount: 0, undatedCount: 0, uniqueCount: 0, overlapDeduplicated: 0 },
        durationMs: 10,
      } as IncrementalSyncReport);
      mockRunSync.mockReturnValueOnce(nextRunPromise);

      const nextStartResult = await orchestrator.startSync({ lookbackDays: 30 });
      expect(nextStartResult.accepted).toBe(true);
      expect(mockRunSync).toHaveBeenCalledTimes(2);
    });

    it("handles error in background execution: sets status FAILED, sanitizes error, and releases lock", async () => {
      let rejectSync!: (reason: unknown) => void;
      const controlledPromise = new Promise<IncrementalSyncReport>((_, reject) => {
        rejectSync = reject;
      });

      const mockRunSync = vi.fn().mockImplementation(() => controlledPromise);

      const startTime = new Date("2026-09-28T15:00:00Z");
      let currentTime = startTime;

      const orchestrator = createFinancialSyncOrchestrator({
        prisma: createMockPrisma(),
        tokenStore: createMockTokenStore(),
        runIncrementalSyncFn: mockRunSync,
        now: () => currentTime,
      });

      await orchestrator.startSync({});

      expect(orchestrator.getStatus().status).toBe("RUNNING");

      // Reject with error containing token
      currentTime = new Date("2026-09-28T15:00:05Z");
      rejectSync(new Error("Network failed with Bearer secret-token-xyz at gateway"));

      // Wait a tick for microtask resolution
      await new Promise((r) => setTimeout(r, 10));

      const status = orchestrator.getStatus();
      expect(status.status).toBe("FAILED");
      expect(status.finishedAt).toBe("2026-09-28T15:00:05.000Z");
      expect(status.lastError).toBe("Network failed with [REDACTED_TOKEN] at gateway");
      expect(status.durationMs).toBe(5000);

      // Lock must be released: can start new run
      mockRunSync.mockResolvedValueOnce({
        sinceDate: "2026-08-29",
        lookbackDays: 30,
        dryRun: false,
        candidates: { recentCount: 0, openCount: 0, undatedCount: 0, uniqueCount: 0, overlapDeduplicated: 0 },
        durationMs: 5,
      } as IncrementalSyncReport);

      const retryResult = await orchestrator.startSync({});
      expect(retryResult.accepted).toBe(true);
    });
  });
});
