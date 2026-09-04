import type { createProductionProductSyncRunner } from "./production-product-sync.js";

type Runner = ReturnType<typeof createProductionProductSyncRunner>;

export function registerProductSyncConsole(runner: Runner): void {
  if (!process.stdin.isTTY) {
    throw new Error("PRODUCT_SYNC_CONSOLE_REQUIRES_TTY");
  }
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (raw: string) => {
    const [command, connectionId, extra] = raw.trim().split(/\s+/);
    if (extra || !connectionId || !isUuid(connectionId)) return;
    if (command === "preflight:products") {
      void runner.preflight(connectionId).then(report).catch(reportError);
    }
    if (command === "sync:products") {
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
  process.stderr.write(`${formatProductSyncConsoleError(error)}\n`);
}

export function formatProductSyncConsoleError(error: unknown): string {
  const candidateCategory =
    typeof error === "object" && error !== null && "category" in error
      ? String(error.category)
      : "PRODUCT_SYNC_ERROR";
  const category = isSafeSyncCategory(candidateCategory)
    ? candidateCategory
    : "PRODUCT_SYNC_ERROR";
  const diagnostics = safeDiagnostics(error);
  const persistenceDiagnostics = safePersistenceDiagnostics(error);
  const syncDiagnostics = safeSyncDiagnostics(error);
  const safeNormalizationCategory =
    typeof error === "object" &&
    error !== null &&
    "normalizationCategory" in error &&
    isSafeNormalizationCategory(error.normalizationCategory)
      ? { safeNormalizationCategory: error.normalizationCategory }
      : {};
  return JSON.stringify({
    status: "ERROR",
    category,
    ...safeNormalizationCategory,
    ...diagnostics,
    ...persistenceDiagnostics,
    ...syncDiagnostics,
  });
}

function safeSyncDiagnostics(error: unknown): Record<string, string | number> {
  if (
    typeof error !== "object" ||
    error === null ||
    !("syncDiagnostics" in error) ||
    typeof error.syncDiagnostics !== "object" ||
    error.syncDiagnostics === null
  ) {
    return {};
  }
  const diagnostics = error.syncDiagnostics as Record<string, unknown>;
  if (
    !isSyncFailureStage(diagnostics.syncFailureStage) ||
    !isSyncErrorClass(diagnostics.syncErrorClass) ||
    (diagnostics.page !== undefined && !isSafePage(diagnostics.page))
  ) {
    return {};
  }
  return {
    syncFailureStage: diagnostics.syncFailureStage,
    syncErrorClass: diagnostics.syncErrorClass,
    ...(isSafePage(diagnostics.page) ? { page: diagnostics.page } : {}),
  };
}

function isSyncFailureStage(value: unknown): value is string {
  return value === "RUN_STATE" || value === "UNEXPECTED";
}

function isSyncErrorClass(value: unknown): value is string {
  return value === "DATABASE" || value === "UNEXPECTED";
}

function isSafePage(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isSafeSyncCategory(value: unknown): value is string {
  return [
    "PRODUCT_SYNC_CONNECTION_NOT_FOUND",
    "PRODUCT_SYNC_CONNECTION_INACTIVE",
    "PRODUCT_SYNC_ALREADY_RUNNING",
    "TAGPLUS_OAUTH_TOKEN_NOT_AVAILABLE",
    "PRODUCT_SYNC_UNSAFE_DATABASE",
    "PRODUCT_SYNC_INVALID_PAGE",
    "PRODUCT_SYNC_FETCH_ERROR",
    "PRODUCT_SYNC_NORMALIZATION_ERROR",
    "PRODUCT_SYNC_PERSISTENCE_ERROR",
    "PRODUCT_SYNC_RECONCILIATION_ERROR",
    "PRODUCT_SYNC_ERROR",
  ].includes(String(value));
}

function safePersistenceDiagnostics(error: unknown): Record<string, string> {
  if (
    typeof error !== "object" ||
    error === null ||
    !("persistenceDiagnostics" in error) ||
    typeof error.persistenceDiagnostics !== "object" ||
    error.persistenceDiagnostics === null
  ) {
    return {};
  }
  const diagnostics = error.persistenceDiagnostics as Record<string, unknown>;
  if (
    !isPersistenceStage(diagnostics.persistenceStage) ||
    !isPersistenceOperation(diagnostics.persistenceOperation) ||
    !isPersistenceErrorClass(diagnostics.persistenceErrorClass)
  ) {
    return {};
  }
  const reason = isTransactionReason(diagnostics.transactionReason)
    ? { transactionReason: diagnostics.transactionReason }
    : {};
  return {
    persistenceStage: diagnostics.persistenceStage,
    persistenceOperation: diagnostics.persistenceOperation,
    persistenceErrorClass: diagnostics.persistenceErrorClass,
    ...reason,
  };
}

function isPersistenceStage(value: unknown): value is string {
  return value === "PRODUCT" || value === "TRANSACTION" || value === "UNKNOWN";
}

function isPersistenceOperation(value: unknown): value is string {
  return value === "UPSERT" || value === "COMMIT" || value === "UNKNOWN";
}

function isPersistenceErrorClass(value: unknown): value is string {
  return [
    "UNIQUE_CONSTRAINT",
    "FOREIGN_KEY_CONSTRAINT",
    "NOT_NULL_CONSTRAINT",
    "VALUE_TOO_LONG",
    "INVALID_DATABASE_VALUE",
    "TRANSACTION_ERROR",
    "DATABASE_UNAVAILABLE",
    "UNKNOWN_DATABASE_ERROR",
  ].includes(String(value));
}

function isTransactionReason(value: unknown): value is string {
  return (
    value === "TRANSACTION_EXPIRED" ||
    value === "TRANSACTION_ALREADY_CLOSED" ||
    value === "UNKNOWN_TRANSACTION_ERROR"
  );
}

function safeDiagnostics(error: unknown): Record<string, string> {
  if (
    typeof error !== "object" ||
    error === null ||
    !("diagnostics" in error) ||
    typeof error.diagnostics !== "object" ||
    error.diagnostics === null
  ) {
    return {};
  }
  const diagnostics = error.diagnostics as Record<string, unknown>;
  const path =
    typeof diagnostics.path === "string" ? diagnostics.path : undefined;
  const observedType =
    typeof diagnostics.observedType === "string"
      ? diagnostics.observedType
      : undefined;
  if (!path || !observedType) return {};
  return { path, observedType };
}

function isSafeNormalizationCategory(value: unknown): value is string {
  return [
    "PRODUCT_INVALID_SOURCE_ID",
    "PRODUCT_INVALID_DATE",
    "PRODUCT_INVALID_TYPE",
    "PRODUCT_INVALID_STRUCTURE",
    "PRODUCT_NORMALIZATION_ERROR",
  ].includes(String(value));
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
