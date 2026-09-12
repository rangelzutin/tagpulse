export type TagPlusSyncStatus = "RUNNING" | "COMPLETED" | "FAILED";
export type TagPlusSyncStage =
  | "CUSTOMERS"
  | "PRODUCTS"
  | "SALES"
  | "COMPLETED"
  | "FAILED";

export interface SyncStepProgress {
  status: "WAITING" | "RUNNING" | "COMPLETED" | "FAILED";
  summary?: Record<string, unknown>;
  error?: string;
}

export interface TagPlusSyncStatusResponse {
  isRunning: boolean;
  activeRun: {
    runId: string;
    status: TagPlusSyncStatus;
    currentStage: TagPlusSyncStage;
    startedAt: string;
    completedAt?: string | null;
    elapsedSeconds: number;
    errorStage?: TagPlusSyncStage | null;
    errorMessage?: string | null;
  } | null;
  stages: {
    customers: SyncStepProgress;
    products: SyncStepProgress;
    sales: SyncStepProgress;
  };
  lastCompletedSync: string | null;
}

export interface StartSyncSuccessResponse {
  runId: string;
  status: TagPlusSyncStatus;
  currentStage: TagPlusSyncStage;
  startedAt: string;
}

export interface StartSyncErrorResponse {
  code: string;
  message: string;
  authorizeUrl?: string;
  activeRun?: {
    runId: string;
    status: TagPlusSyncStatus;
    currentStage: TagPlusSyncStage;
    startedAt: string;
  };
}

export class TagPlusSyncApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
    public readonly details?: StartSyncErrorResponse,
  ) {
    super(message);
    this.name = "TagPlusSyncApiError";
  }
}

export function getBaseUrl(): string {
  const rawBaseUrl = import.meta.env.VITE_API_URL || "";
  return rawBaseUrl.endsWith("/") ? rawBaseUrl.slice(0, -1) : rawBaseUrl;
}

export async function fetchTagPlusSyncStatus(): Promise<TagPlusSyncStatusResponse> {
  const url = `${getBaseUrl()}/api/sync/tagplus/status`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Erro ao consultar status da sincronização: HTTP ${response.status}`);
  }

  return response.json() as Promise<TagPlusSyncStatusResponse>;
}

export async function startTagPlusSync(): Promise<StartSyncSuccessResponse> {
  const url = `${getBaseUrl()}/api/sync/tagplus`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json" },
  });

  if (response.status === 202) {
    return response.json() as Promise<StartSyncSuccessResponse>;
  }

  let errorPayload: StartSyncErrorResponse | undefined;
  try {
    errorPayload = (await response.json()) as StartSyncErrorResponse;
  } catch {
    // payload não JSON
  }

  const code = errorPayload?.code ?? `HTTP_${response.status}`;
  const message = errorPayload?.message ?? `Falha ao iniciar sincronização: HTTP ${response.status}`;

  throw new TagPlusSyncApiError(code, message, response.status, errorPayload);
}
