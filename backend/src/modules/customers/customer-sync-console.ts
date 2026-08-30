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
  process.stderr.write(`${formatCustomerSyncConsoleError(error)}\n`);
}

export function formatCustomerSyncConsoleError(error: unknown): string {
  const category =
    typeof error === "object" && error !== null && "category" in error
      ? String(error.category)
      : "CUSTOMER_SYNC_ERROR";
  const diagnostics = safeDiagnostics(error);
  const persistenceDiagnostics = safePersistenceDiagnostics(error);
  const safeNormalizationCategory =
    typeof error === "object" &&
    error !== null &&
    "normalizationCategory" in error &&
    error.normalizationCategory === "CUSTOMER_INVALID_DATE"
      ? { safeNormalizationCategory: "CUSTOMER_INVALID_DATE" }
      : {};
  return JSON.stringify({
    status: "ERROR",
    category,
    ...safeNormalizationCategory,
    ...diagnostics,
    ...persistenceDiagnostics,
  });
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
  return {
    persistenceStage: diagnostics.persistenceStage,
    persistenceOperation: diagnostics.persistenceOperation,
    persistenceErrorClass: diagnostics.persistenceErrorClass,
  };
}

function isPersistenceStage(value: unknown): value is string {
  return [
    "CUSTOMER",
    "CONTACTS",
    "ADDRESSES",
    "TRANSACTION",
    "UNKNOWN",
  ].includes(String(value));
}

function isPersistenceOperation(value: unknown): value is string {
  return ["UPSERT", "DELETE_MISSING_CHILDREN", "COMMIT", "UNKNOWN"].includes(
    String(value),
  );
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
  if (
    !isSafePath(diagnostics.path) ||
    !isSafeObservedType(diagnostics.observedType) ||
    !isSafeExpectedFormat(diagnostics.expectedFormat)
  ) {
    return {};
  }
  return {
    path: diagnostics.path,
    observedType: diagnostics.observedType,
    expectedFormat: diagnostics.expectedFormat,
    ...(isSafeDateFormatClass(diagnostics.dateFormatClass)
      ? { dateFormatClass: diagnostics.dateFormatClass }
      : {}),
    ...(diagnostics.observedType === "string" &&
    diagnostics.dateFormatClass === "INVALID_OR_UNCLASSIFIED" &&
    isSafeDateStructuralPattern(diagnostics.dateStructuralPattern)
      ? { dateStructuralPattern: diagnostics.dateStructuralPattern }
      : {}),
  };
}

function isSafeDateStructuralPattern(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Array.from(value).every(
      (character) =>
        !/\p{Number}/u.test(character) &&
        (!/\p{Letter}/u.test(character) ||
          character === "A" ||
          character === "T" ||
          character === "Z"),
    )
  );
}

function isSafePath(value: unknown): value is string {
  return (
    value === "$.data_cadastro" ||
    value === "$.data_alteracao" ||
    value === "$.data_nascimento"
  );
}

function isSafeObservedType(value: unknown): value is string {
  return (
    value === "null" ||
    value === "string" ||
    value === "number" ||
    value === "boolean" ||
    value === "object" ||
    value === "array"
  );
}

function isSafeExpectedFormat(value: unknown): value is string {
  return value === "timezone-qualified-datetime" || value === "YYYY-MM-DD";
}

function isSafeDateFormatClass(value: unknown): value is string {
  return (
    value === "DATE_ONLY" ||
    value === "DATETIME_WITH_TIMEZONE" ||
    value === "DATETIME_WITHOUT_TIMEZONE" ||
    value === "EMPTY" ||
    value === "INVALID_OR_UNCLASSIFIED"
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
