import type { createProductionCustomerSyncRunner } from "./production-customer-sync.js";

type Runner = ReturnType<typeof createProductionCustomerSyncRunner>;

export function registerCustomerSyncConsole(runner: Runner): void {
  if (!process.stdin.isTTY) {
    throw new Error("CUSTOMER_SYNC_CONSOLE_REQUIRES_TTY");
  }
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (raw: string) => {
    const [command, connectionId, extra] = raw.trim().split(/\s+/);
    if (extra || !connectionId || !isUuid(connectionId)) return;
    if (command === "preflight:customers") {
      void runner.preflight(connectionId).then(report).catch(reportError);
    }
    if (command === "sync:customers") {
      void runner.run(connectionId).then(report).catch(reportError);
    }
  });
}

function report(result: { status: string; runId?: string }): void {
  process.stdout.write(
    `${JSON.stringify({ status: result.status, ...(result.runId ? { runId: result.runId } : {}) })}\n`,
  );
}

function reportError(error: unknown): void {
  const category =
    typeof error === "object" && error !== null && "category" in error
      ? String(error.category)
      : "CUSTOMER_SYNC_ERROR";
  process.stderr.write(`${JSON.stringify({ status: "ERROR", category })}\n`);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
