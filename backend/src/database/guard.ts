export const PRODUCTION_PROJECT_REF = "szahricoqxzckjytpnmg";
export const BLOCKED_PRODUCTION_MESSAGE =
  "TEST EXECUTION BLOCKED: production database detected.";

export function assertNotProductionDatabase(url?: string | null): void {
  if (!url) return;
  if (url.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error(BLOCKED_PRODUCTION_MESSAGE);
  }
}

