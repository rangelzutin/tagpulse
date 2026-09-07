import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  formatSalesSyncConsoleError,
  registerSalesSyncConsole,
} from "../src/modules/sales/sales-sync-console.js";
import {
  NINECLOUDS_CONNECTION_ID,
  ProductionSalesSyncError,
  type createProductionSalesSyncRunner,
} from "../src/modules/sales/production-sales-sync.js";

type Runner = ReturnType<typeof createProductionSalesSyncRunner>;

describe("sales sync console", () => {
  describe("formatSalesSyncConsoleError", () => {
    it("formats known ProductionSalesSyncError category safely", () => {
      const error = new ProductionSalesSyncError(
        "TAGPLUS_SCOPES_MISSING_REQUIRED_SALES_SCOPES",
        "Configured TAGPLUS_SCOPES missing required sales scopes: read:pedidos",
      );
      const json = JSON.parse(formatSalesSyncConsoleError(error));
      expect(json).toEqual({
        status: "ERROR",
        category: "TAGPLUS_SCOPES_MISSING_REQUIRED_SALES_SCOPES",
        message:
          "Configured TAGPLUS_SCOPES missing required sales scopes: read:pedidos",
      });
    });

    it("falls back to SALES_SYNC_ERROR for arbitrary unexpected errors", () => {
      const json = JSON.parse(formatSalesSyncConsoleError(new Error("unexpected crash")));
      expect(json).toEqual({
        status: "ERROR",
        category: "SALES_SYNC_ERROR",
        message: "unexpected crash",
      });
    });
  });

  describe("registerSalesSyncConsole", () => {
    it("throws when process.stdin is not a TTY and ALLOW_NON_TTY_CONSOLE is not enabled", () => {
      const originalIsTTY = process.stdin.isTTY;
      const originalEnv = process.env.ALLOW_NON_TTY_CONSOLE;
      delete process.env.ALLOW_NON_TTY_CONSOLE;
      Object.defineProperty(process.stdin, "isTTY", {
        value: false,
        configurable: true,
      });

      try {
        const mockRunner = {} as Runner;
        expect(() => registerSalesSyncConsole(mockRunner)).toThrow(
          "SALES_SYNC_CONSOLE_REQUIRES_TTY",
        );
      } finally {
        Object.defineProperty(process.stdin, "isTTY", {
          value: originalIsTTY,
          configurable: true,
        });
        if (originalEnv !== undefined) {
          process.env.ALLOW_NON_TTY_CONSOLE = originalEnv;
        }
      }
    });

    it("allows non-TTY when ALLOW_NON_TTY_CONSOLE=true is explicitly set", () => {
      const originalIsTTY = process.stdin.isTTY;
      const originalEnv = process.env.ALLOW_NON_TTY_CONSOLE;
      process.env.ALLOW_NON_TTY_CONSOLE = "true";
      Object.defineProperty(process.stdin, "isTTY", {
        value: false,
        configurable: true,
      });

      try {
        const mockRunner = {} as Runner;
        expect(() => registerSalesSyncConsole(mockRunner)).not.toThrow();
      } finally {
        Object.defineProperty(process.stdin, "isTTY", {
          value: originalIsTTY,
          configurable: true,
        });
        if (originalEnv !== undefined) {
          process.env.ALLOW_NON_TTY_CONSOLE = originalEnv;
        } else {
          delete process.env.ALLOW_NON_TTY_CONSOLE;
        }
      }
    });

    it("rejects preflight:sales without connectionId with SALES_SYNC_CONNECTION_ID_REQUIRED", async () => {
      const fakeStdin = new EventEmitter() as unknown as NodeJS.ReadStream;
      Object.assign(fakeStdin, { isTTY: true, setEncoding: vi.fn() });

      const preflightMock = vi.fn();
      const mockRunner = { preflight: preflightMock, run: vi.fn() } as unknown as Runner;

      const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);

      const originalStdin = process.stdin;
      Object.defineProperty(process, "stdin", {
        value: fakeStdin,
        configurable: true,
      });

      try {
        registerSalesSyncConsole(mockRunner);

        fakeStdin.emit("data", "preflight:sales\n");
        await vi.waitFor(() => {
          expect(stderrSpy).toHaveBeenCalledWith(
            expect.stringContaining('"category":"SALES_SYNC_CONNECTION_ID_REQUIRED"'),
          );
        });

        expect(preflightMock).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(process, "stdin", {
          value: originalStdin,
          configurable: true,
        });
        stderrSpy.mockRestore();
      }
    });

    it("rejects sync:sales without connectionId with SALES_SYNC_CONNECTION_ID_REQUIRED", async () => {
      const fakeStdin = new EventEmitter() as unknown as NodeJS.ReadStream;
      Object.assign(fakeStdin, { isTTY: true, setEncoding: vi.fn() });

      const runMock = vi.fn();
      const mockRunner = { preflight: vi.fn(), run: runMock } as unknown as Runner;

      const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);

      const originalStdin = process.stdin;
      Object.defineProperty(process, "stdin", {
        value: fakeStdin,
        configurable: true,
      });

      try {
        registerSalesSyncConsole(mockRunner);

        fakeStdin.emit("data", "sync:sales\n");
        await vi.waitFor(() => {
          expect(stderrSpy).toHaveBeenCalledWith(
            expect.stringContaining('"category":"SALES_SYNC_CONNECTION_ID_REQUIRED"'),
          );
        });

        expect(runMock).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(process, "stdin", {
          value: originalStdin,
          configurable: true,
        });
        stderrSpy.mockRestore();
      }
    });

    it("handles preflight:sales command with explicit Nineclouds connection", async () => {
      const fakeStdin = new EventEmitter() as unknown as NodeJS.ReadStream;
      Object.assign(fakeStdin, { isTTY: true, setEncoding: vi.fn() });

      const preflightMock = vi.fn().mockResolvedValue({
        status: "READY",
        connectionId: NINECLOUDS_CONNECTION_ID,
      });
      const runMock = vi.fn();
      const mockRunner = { preflight: preflightMock, run: runMock } as unknown as Runner;

      const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

      const originalStdin = process.stdin;
      Object.defineProperty(process, "stdin", {
        value: fakeStdin,
        configurable: true,
      });

      try {
        registerSalesSyncConsole(mockRunner);

        fakeStdin.emit("data", `preflight:sales ${NINECLOUDS_CONNECTION_ID}\n`);
        await vi.waitFor(() => {
          expect(preflightMock).toHaveBeenCalledWith(NINECLOUDS_CONNECTION_ID);
        });

        expect(stdoutSpy).toHaveBeenCalledWith(
          expect.stringContaining('"status":"READY"'),
        );
      } finally {
        Object.defineProperty(process, "stdin", {
          value: originalStdin,
          configurable: true,
        });
        stdoutSpy.mockRestore();
      }
    });

    it("handles sync:sales command with explicit Nineclouds connection and outputs factual metrics", async () => {
      const fakeStdin = new EventEmitter() as unknown as NodeJS.ReadStream;
      Object.assign(fakeStdin, { isTTY: true, setEncoding: vi.fn() });

      const runMock = vi.fn().mockResolvedValue({
        connectionId: NINECLOUDS_CONNECTION_ID,
        status: "COMPLETED",
        startedAt: new Date("2026-09-07T12:00:00.000Z"),
        completedAt: new Date("2026-09-07T12:01:00.000Z"),
        pedidos: {
          resource: "pedidos",
          pagesFetched: 2,
          recordsFetched: 150,
          reconciledAbsent: 3,
          status: "COMPLETED",
        },
        vendasSimples: {
          resource: "vendas_simples",
          pagesFetched: 1,
          recordsFetched: 10,
          reconciledAbsent: 0,
          status: "COMPLETED",
        },
        nfes: {
          resource: "nfes",
          pagesFetched: 1,
          recordsFetched: 5,
          reconciledAbsent: 0,
          status: "COMPLETED",
        },
      });

      const mockRunner = {
        preflight: vi.fn(),
        run: runMock,
      } as unknown as Runner;

      const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

      const originalStdin = process.stdin;
      Object.defineProperty(process, "stdin", {
        value: fakeStdin,
        configurable: true,
      });

      try {
        registerSalesSyncConsole(mockRunner);

        fakeStdin.emit("data", `sync:sales ${NINECLOUDS_CONNECTION_ID}\n`);
        await vi.waitFor(() => {
          expect(runMock).toHaveBeenCalledWith(NINECLOUDS_CONNECTION_ID);
        });

        expect(stdoutSpy).toHaveBeenCalledWith(
          expect.stringContaining('"endpointExhausted":true'),
        );
        expect(stdoutSpy).toHaveBeenCalledWith(
          expect.stringContaining('"recordsFetched":150'),
        );
      } finally {
        Object.defineProperty(process, "stdin", {
          value: originalStdin,
          configurable: true,
        });
        stdoutSpy.mockRestore();
      }
    });
  });
});
