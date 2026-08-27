import {
  TagPlusHttpError,
  TagPlusInvalidResponseError,
  TagPlusNetworkError,
  TagPlusTimeoutError,
  type TagPlusClient,
} from "../tagplus-client.js";
import { createFieldProfiler, type FieldProfile } from "./field-profiler.js";

type WarningCategory =
  | "HTTP_ERROR"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "INVALID_JSON"
  | "UNEXPECTED_ROOT";

export interface ClientesFieldCharacterizationResult {
  resource: "clientes";
  apiVersion: string;
  startedAt: string;
  completedAt: string;
  scan: {
    firstPage: 1;
    perPage: 100;
    recordsFetched: number;
    nonEmptyPages: number;
    lastNonEmptyPage: number | null;
    lastPageRecords: number | null;
    emptyTerminationPage: number | null;
    endpointExhausted: boolean;
  };
  execution: {
    executionComplete: boolean;
    status: "COMPLETE_ENDPOINT_EXHAUSTED" | "PARTIAL_NOT_EXHAUSTED";
    stoppedAtPage: number | null;
    warnings: Array<{
      category: WarningCategory;
      page: number;
      httpStatus?: number;
    }>;
  };
  profile: FieldProfile;
  privacy: {
    rawPayloadPersisted: false;
    realFixtureCreated: false;
    customerValuesPersisted: false;
    customerIdsPersisted: false;
    piiLogged: false;
    tokenPersisted: false;
    authorizationHeaderPersisted: false;
    fingerprintOrHashPersisted: false;
  };
}

export async function characterizeClientesFields(
  client: TagPlusClient,
  apiVersion: string,
  options: { now?: () => string } = {},
): Promise<ClientesFieldCharacterizationResult> {
  const now = options.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const profiler = createFieldProfiler();
  const warnings: ClientesFieldCharacterizationResult["execution"]["warnings"] =
    [];
  let page = 1;
  let nonEmptyPages = 0;
  let lastNonEmptyPage: number | null = null;
  let lastPageRecords: number | null = null;
  let emptyTerminationPage: number | null = null;
  let endpointExhausted = false;
  let stoppedAtPage: number | null = null;

  while (true) {
    let data: unknown;
    try {
      data = (await client.get<unknown>(`/clientes?page=${page}&per_page=100`))
        .data;
    } catch (error: unknown) {
      warnings.push(toSafeWarning(error, page));
      stoppedAtPage = page;
      break;
    }
    if (!Array.isArray(data)) {
      warnings.push({ category: "UNEXPECTED_ROOT", page });
      stoppedAtPage = page;
      break;
    }
    if (data.length === 0) {
      endpointExhausted = true;
      emptyTerminationPage = page;
      break;
    }
    for (const record of data) profiler.inspectRecord(record);
    nonEmptyPages += 1;
    lastNonEmptyPage = page;
    lastPageRecords = data.length;
    page += 1;
  }

  const profile = profiler.getProfile();
  return {
    resource: "clientes",
    apiVersion,
    startedAt,
    completedAt: now(),
    scan: {
      firstPage: 1,
      perPage: 100,
      recordsFetched: profile.recordsObserved,
      nonEmptyPages,
      lastNonEmptyPage,
      lastPageRecords,
      emptyTerminationPage,
      endpointExhausted,
    },
    execution: {
      executionComplete: endpointExhausted,
      status: endpointExhausted
        ? "COMPLETE_ENDPOINT_EXHAUSTED"
        : "PARTIAL_NOT_EXHAUSTED",
      stoppedAtPage,
      warnings,
    },
    profile,
    privacy: {
      rawPayloadPersisted: false,
      realFixtureCreated: false,
      customerValuesPersisted: false,
      customerIdsPersisted: false,
      piiLogged: false,
      tokenPersisted: false,
      authorizationHeaderPersisted: false,
      fingerprintOrHashPersisted: false,
    },
  };
}

function toSafeWarning(
  error: unknown,
  page: number,
): ClientesFieldCharacterizationResult["execution"]["warnings"][number] {
  if (error instanceof TagPlusHttpError)
    return { category: "HTTP_ERROR", page, httpStatus: error.status };
  if (error instanceof TagPlusTimeoutError)
    return { category: "TIMEOUT", page };
  if (error instanceof TagPlusNetworkError)
    return { category: "NETWORK_ERROR", page };
  if (error instanceof TagPlusInvalidResponseError)
    return { category: "INVALID_JSON", page };
  return { category: "NETWORK_ERROR", page };
}
