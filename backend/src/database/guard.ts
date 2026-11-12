export const PRODUCTION_PROJECT_REF = "szahricoqxzckjytpnmg";
export const DEV_PROJECT_REF = "pkjdzlfxsxulfkzksrow";

export const BLOCKED_PRODUCTION_MESSAGE =
  "TEST EXECUTION BLOCKED: production database detected.";

export const SAFETY_BLOCK_DEV_MESSAGE =
  "SAFETY BLOCK: local/development environment cannot connect to production database.";

export function assertNotProductionDatabase(url?: string | null): void {
  if (!url) return;
  if (url.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error(BLOCKED_PRODUCTION_MESSAGE);
  }
}

export function assertSafeDatabaseUrl(url?: string | null, nodeEnv?: string): void {
  if (!url) return;
  const isProd = nodeEnv === "production";
  if (!isProd && url.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error(SAFETY_BLOCK_DEV_MESSAGE);
  }
}

export function extractDatabaseProject(url?: string | null): string {
  if (!url) return "UNKNOWN";
  if (url.includes(PRODUCTION_PROJECT_REF)) return PRODUCTION_PROJECT_REF;
  if (url.includes(DEV_PROJECT_REF)) return DEV_PROJECT_REF;
  try {
    const match = url.match(/postgres\.([a-z0-9_-]+):/i);
    if (match?.[1]) return match[1];
    const parsed = new URL(url);
    if (parsed.username && parsed.username.includes(".")) {
      return parsed.username.split(".")[1] || parsed.username;
    }
    return parsed.hostname;
  } catch {
    const match = url.match(/postgres\.([a-z0-9_-]+):/i);
    if (match?.[1]) return match[1];
    return "UNKNOWN";
  }
}

export function getDatabaseMode(url?: string | null): "PROD" | "DEV" | "TEST" | "UNKNOWN" {
  if (!url) return "UNKNOWN";
  if (url.includes(PRODUCTION_PROJECT_REF)) return "PROD";
  if (url.includes(DEV_PROJECT_REF)) return "DEV";
  if (url.includes("test") || url.includes("5434")) return "TEST";
  return "UNKNOWN";
}

