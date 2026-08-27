import type { TagPlusClient } from "./tagplus-client.js";

export const TAGPLUS_CONNECTION_ENDPOINT = "/clientes?page=1&per_page=1";

export interface CompanyContext {
  companyId: string;
  companySlug: string;
}

export interface ConnectionInspectionEvidence {
  companySlug: string;
  apiVersion: string;
  endpoint: string;
  httpStatus: number;
  durationMs: number;
  timestamp: string;
  rootType: "array" | "null" | "object" | "string" | "number" | "boolean";
  itemCount: number | null;
}

export interface InspectConnectionOptions {
  company: CompanyContext;
  client: TagPlusClient;
  apiVersion: string;
  now?: () => number;
  timestamp?: () => string;
}

export async function inspectTagPlusConnection(
  options: InspectConnectionOptions,
): Promise<ConnectionInspectionEvidence> {
  const now = options.now ?? performance.now.bind(performance);
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  const startedAt = now();
  const response = await options.client.get(TAGPLUS_CONNECTION_ENDPOINT);
  const durationMs = Math.round(now() - startedAt);

  return {
    companySlug: options.company.companySlug,
    apiVersion: options.apiVersion,
    endpoint: TAGPLUS_CONNECTION_ENDPOINT,
    httpStatus: response.status,
    durationMs,
    timestamp: timestamp(),
    rootType: getRootType(response.data),
    itemCount: Array.isArray(response.data) ? response.data.length : null,
  };
}

function getRootType(
  value: unknown,
): ConnectionInspectionEvidence["rootType"] {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value as ConnectionInspectionEvidence["rootType"];
}
