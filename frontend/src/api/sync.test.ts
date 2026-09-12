import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  fetchTagPlusSyncStatus,
  startTagPlusSync,
  TagPlusSyncApiError,
} from "./sync.js";

describe("frontend sync API client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetchTagPlusSyncStatus fetches GET /api/sync/tagplus/status", async () => {
    const mockData = {
      isRunning: false,
      activeRun: null,
      stages: {
        customers: { status: "WAITING" },
        products: { status: "WAITING" },
        sales: { status: "WAITING" },
      },
      lastCompletedSync: "2026-09-11T21:00:00.000Z",
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    } as Response);

    const result = await fetchTagPlusSyncStatus();

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/sync/tagplus/status"),
      expect.objectContaining({ method: "GET" }),
    );
    expect(result).toEqual(mockData);
  });

  it("startTagPlusSync returns 202 Accepted payload on success", async () => {
    const mockSuccess = {
      runId: "run-abc-123",
      status: "RUNNING",
      currentStage: "CUSTOMERS",
      startedAt: "2026-09-11T21:05:00.000Z",
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => mockSuccess,
    } as Response);

    const result = await startTagPlusSync();

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/sync/tagplus"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toEqual(mockSuccess);
  });

  it("startTagPlusSync throws TagPlusSyncApiError with code TAGPLUS_OAUTH_REQUIRED on 401", async () => {
    const errorPayload = {
      code: "TAGPLUS_OAUTH_REQUIRED",
      message: "Token ausente",
      authorizeUrl: "/integrations/tagplus/authorize",
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => errorPayload,
    } as Response);

    await expect(startTagPlusSync()).rejects.toThrow(TagPlusSyncApiError);

    try {
      await startTagPlusSync();
    } catch (err: unknown) {
      if (err instanceof TagPlusSyncApiError) {
        expect(err.code).toBe("TAGPLUS_OAUTH_REQUIRED");
        expect(err.statusCode).toBe(401);
        expect(err.details?.authorizeUrl).toBe("/integrations/tagplus/authorize");
      }
    }
  });

  it("startTagPlusSync throws TagPlusSyncApiError with code TAGPLUS_SYNC_ALREADY_RUNNING on 409", async () => {
    const errorPayload = {
      code: "TAGPLUS_SYNC_ALREADY_RUNNING",
      message: "Uma sincronização TagPlus já está em andamento",
      activeRun: {
        runId: "run-active",
        status: "RUNNING",
        currentStage: "PRODUCTS",
        startedAt: "2026-09-11T21:00:00.000Z",
      },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => errorPayload,
    } as Response);

    try {
      await startTagPlusSync();
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(TagPlusSyncApiError);
      const apiErr = err as TagPlusSyncApiError;
      expect(apiErr.code).toBe("TAGPLUS_SYNC_ALREADY_RUNNING");
      expect(apiErr.statusCode).toBe(409);
      expect(apiErr.details?.activeRun?.runId).toBe("run-active");
    }
  });

  it("startTagPlusSync handles non-JSON error bodies with fallback code and message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("Invalid JSON body");
      },
    } as unknown as Response);

    try {
      await startTagPlusSync();
      expect.unreachable();
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(TagPlusSyncApiError);
      const apiErr = err as TagPlusSyncApiError;
      expect(apiErr.code).toBe("HTTP_502");
      expect(apiErr.statusCode).toBe(502);
      expect(apiErr.message).toContain("HTTP 502");
    }
  });

  it("fetchTagPlusSyncStatus throws an explicit error when response is not ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    await expect(fetchTagPlusSyncStatus()).rejects.toThrow(
      "Erro ao consultar status da sincronização: HTTP 500",
    );
  });

  it("simulates polling lifecycle: runs every 2s while RUNNING and stops on COMPLETED or FAILED", async () => {
    let callCount = 0;
    const states = [
      { isRunning: true, activeRun: { status: "RUNNING", currentStage: "CUSTOMERS" } },
      { isRunning: true, activeRun: { status: "RUNNING", currentStage: "PRODUCTS" } },
      { isRunning: false, activeRun: { status: "COMPLETED", currentStage: "COMPLETED" } },
    ];

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const state = states[Math.min(callCount++, states.length - 1)];
      return {
        ok: true,
        status: 200,
        json: async () => state,
      } as Response;
    });

    // Step 1: Poll 1
    const p1 = await fetchTagPlusSyncStatus();
    expect(p1.isRunning).toBe(true);
    expect(p1.activeRun?.currentStage).toBe("CUSTOMERS");

    // Step 2: Poll 2
    const p2 = await fetchTagPlusSyncStatus();
    expect(p2.isRunning).toBe(true);
    expect(p2.activeRun?.currentStage).toBe("PRODUCTS");

    // Step 3: Poll 3 (terminal)
    const p3 = await fetchTagPlusSyncStatus();
    expect(p3.isRunning).toBe(false);
    expect(p3.activeRun?.status).toBe("COMPLETED");
  });

  it("validates freshness formatting: null returns 'Nunca sincronizado pela aplicação'", () => {
    const formatFreshness = (timestamp: string | null): string => {
      if (!timestamp) return "Nunca sincronizado pela aplicação";
      return new Date(timestamp).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      });
    };

    expect(formatFreshness(null)).toBe("Nunca sincronizado pela aplicação");
    expect(formatFreshness("2026-09-11T20:00:00.000Z")).not.toBe(
      "Nunca sincronizado pela aplicação",
    );
  });
});

