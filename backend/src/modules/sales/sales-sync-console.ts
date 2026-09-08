import {
  type NfeDiagnosticResult,
  ProductionSalesSyncError,
  type createProductionSalesSyncRunner,
  type ProductionSalesSyncRunResult,
} from "./production-sales-sync.js";

type Runner = ReturnType<typeof createProductionSalesSyncRunner>;

export function registerSalesSyncConsole(runner: Runner): void {
  if (!process.stdin.isTTY && process.env.ALLOW_NON_TTY_CONSOLE?.trim() !== "true") {
    throw new Error("SALES_SYNC_CONSOLE_REQUIRES_TTY");
  }
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (raw: string) => {
    const parts = raw.trim().split(/\s+/);
    const command = parts[0];

    if (command === "preflight:sales" || command === "sync:sales") {
      const rawConnectionId = parts[1];
      const extra = parts.slice(2).join(" ");

      if (extra) return;

      if (!rawConnectionId || !isUuid(rawConnectionId)) {
        reportError(
          new ProductionSalesSyncError(
            "SALES_SYNC_CONNECTION_ID_REQUIRED",
            `Explicit connectionId is required. Usage: ${command} <connectionId>`,
          ),
        );
        return;
      }

      if (command === "preflight:sales") {
        void runner.preflight(rawConnectionId).then(report).catch(reportError);
      } else {
        void runner.run(rawConnectionId).then(report).catch(reportError);
      }
      return;
    }

    if (command === "inspect:nfe") {
      const rawConnectionId = parts[1];
      const rawSourceId = parts[2];
      const extra = parts.slice(3).join(" ");

      if (extra) return;

      if (!rawConnectionId || !isUuid(rawConnectionId)) {
        reportError(
          new ProductionSalesSyncError(
            "SALES_SYNC_CONNECTION_ID_REQUIRED",
            "Explicit connectionId is required. Usage: inspect:nfe <connectionId> <sourceId>",
          ),
        );
        return;
      }

      if (!rawSourceId || !/^\d+$/.test(rawSourceId.trim())) {
        reportError(
          new ProductionSalesSyncError(
            "SALES_SYNC_SOURCE_ID_REQUIRED",
            "Explicit numeric sourceId is required. Usage: inspect:nfe <connectionId> <sourceId>",
          ),
        );
        return;
      }

      void runner
        .inspectNfe(rawConnectionId, rawSourceId.trim())
        .then(report)
        .catch(reportError);
      return;
    }
  });
}

function report(
  result:
    | { status: string }
    | ProductionSalesSyncRunResult
    | NfeDiagnosticResult,
): void {
  if ("pedidos" in result) {
    const runResult = result as ProductionSalesSyncRunResult;
    const output = {
      connectionId: runResult.connectionId,
      status: runResult.status,
      startedAt: runResult.startedAt,
      completedAt: runResult.completedAt,
      pedidos: {
        pagesFetched: runResult.pedidos.pagesFetched,
        recordsFetched: runResult.pedidos.recordsFetched,
        reconciledAbsent: runResult.pedidos.reconciledAbsent,
        endpointExhausted: runResult.pedidos.status === "COMPLETED",
        status: runResult.pedidos.status,
      },
      vendasSimples: {
        pagesFetched: runResult.vendasSimples.pagesFetched,
        recordsFetched: runResult.vendasSimples.recordsFetched,
        reconciledAbsent: runResult.vendasSimples.reconciledAbsent,
        endpointExhausted: runResult.vendasSimples.status === "COMPLETED",
        status: runResult.vendasSimples.status,
      },
      nfes: {
        pagesFetched: runResult.nfes.pagesFetched,
        recordsFetched: runResult.nfes.recordsFetched,
        reconciledAbsent: runResult.nfes.reconciledAbsent,
        endpointExhausted: runResult.nfes.status === "COMPLETED",
        status: runResult.nfes.status,
      },
    };
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
}

function reportError(error: unknown): void {
  process.stderr.write(`${formatSalesSyncConsoleError(error)}\n`);
}

export function formatSalesSyncConsoleError(error: unknown): string {
  const candidateCategory =
    typeof error === "object" && error !== null && "category" in error
      ? String(error.category)
      : "SALES_SYNC_ERROR";
  const category = isSafeSalesSyncCategory(candidateCategory)
    ? candidateCategory
    : "SALES_SYNC_ERROR";

  const message =
    error instanceof Error ? error.message : "Sales synchronization failed";

  return JSON.stringify({
    status: "ERROR",
    category,
    message,
  });
}

function isSafeSalesSyncCategory(value: unknown): value is string {
  return [
    "SALES_SYNC_CONNECTION_NOT_FOUND",
    "SALES_SYNC_CONNECTION_INACTIVE",
    "SALES_SYNC_ALREADY_RUNNING",
    "TAGPLUS_OAUTH_TOKEN_NOT_AVAILABLE",
    "TAGPLUS_SCOPES_MISSING_REQUIRED_SALES_SCOPES",
    "SALES_SYNC_UNSAFE_DATABASE",
    "SALES_SYNC_CONNECTION_ID_REQUIRED",
    "SALES_SYNC_SOURCE_ID_REQUIRED",
    "SALES_SYNC_ERROR",
  ].includes(String(value));
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
