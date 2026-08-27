import {
  TagPlusHttpError,
  TagPlusInvalidResponseError,
  TagPlusNetworkError,
  TagPlusTimeoutError,
  type TagPlusClient,
} from "../tagplus-client.js";
import {
  createStructuralProfiler,
  type StructuralProfile,
} from "./structural-profiler.js";

export interface DiscoveryPoint {
  page: number;
  recordsInPage: number;
  recordsCumulative: number;
  newPaths: number;
  pathsCumulative: number;
  newTypeEvents: number;
  newArrayElementTypeEvents: number;
  structuralNoveltyEvents: number;
  lastNoveltyAtRecord: number | null;
  lastNoveltyAtPage: number | null;
}

export type InspectionWarningCategory =
  | "HTTP_ERROR"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "INVALID_JSON"
  | "UNEXPECTED_ROOT"
  | "DUPLICATE_DETECTION_UNAVAILABLE";

export interface SafeInspectionWarning {
  category: InspectionWarningCategory;
  page: number | null;
  httpStatus?: number;
}

export interface ClientesStructuralInspectionResult {
  resource: "clientes";
  apiVersion: string;
  startedAt: string;
  completedAt: string;
  scan: {
    firstPage: 1;
    perPage: 100;
    lastNonEmptyPage: number | null;
    emptyTerminationPage: number | null;
    endpointExhausted: boolean;
  };
  execution: {
    executionComplete: boolean;
    status:
      | "COMPLETE_ENDPOINT_EXHAUSTED"
      | "PARTIAL_STRUCTURALLY_SATURATED"
      | "PARTIAL_NOT_SATURATED";
    stoppedAtPage: number | null;
    warnings: SafeInspectionWarning[];
  };
  records: {
    recordsFetched: number;
    uniqueRecordsObserved: null;
    duplicateOccurrences: null;
    duplicateDetection: "unavailable_without_assuming_identity_field";
  };
  discoveryCurve: DiscoveryPoint[];
  profile: StructuralProfile;
  privacy: {
    rawPayloadPersisted: false;
    realFixtureCreated: false;
    piiValuesPersisted: false;
    piiValuesLogged: false;
    tokenPersisted: false;
  };
}

interface InspectionOptions {
  now?: () => string;
}

export async function inspectClientesStructure(
  client: TagPlusClient,
  apiVersion: string,
  options: InspectionOptions = {},
): Promise<ClientesStructuralInspectionResult> {
  const now = options.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const profiler = createStructuralProfiler();
  const discoveryCurve: DiscoveryPoint[] = [];
  const warnings: SafeInspectionWarning[] = [
    { category: "DUPLICATE_DETECTION_UNAVAILABLE", page: null },
  ];
  let page = 1;
  let lastNonEmptyPage: number | null = null;
  let emptyTerminationPage: number | null = null;
  let endpointExhausted = false;
  let stoppedAtPage: number | null = null;

  while (true) {
    let data: unknown;
    try {
      const response = await client.get<unknown>(
        `/clientes?page=${page}&per_page=100`,
      );
      data = response.data;
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

    let newPaths = 0;
    let newTypeEvents = 0;
    let newArrayElementTypeEvents = 0;
    let structuralNoveltyEvents = 0;
    for (const record of data) {
      const inspection = profiler.inspectRecord(record, page);
      newPaths += inspection.newPaths;
      newTypeEvents += inspection.newTypeEvents;
      newArrayElementTypeEvents += inspection.newArrayElementTypeEvents;
      structuralNoveltyEvents += inspection.noveltyEvents.length;
    }
    const profile = profiler.getProfile();
    discoveryCurve.push({
      page,
      recordsInPage: data.length,
      recordsCumulative: profile.recordsObserved,
      newPaths,
      pathsCumulative: profile.uniquePaths,
      newTypeEvents,
      newArrayElementTypeEvents,
      structuralNoveltyEvents,
      lastNoveltyAtRecord: profile.saturation.lastNoveltyAtRecord,
      lastNoveltyAtPage: profile.saturation.lastNoveltyAtPage,
    });
    lastNonEmptyPage = page;
    page += 1;
  }

  const profile = profiler.getProfile();
  const executionComplete = endpointExhausted;
  return {
    resource: "clientes",
    apiVersion,
    startedAt,
    completedAt: now(),
    scan: {
      firstPage: 1,
      perPage: 100,
      lastNonEmptyPage,
      emptyTerminationPage,
      endpointExhausted,
    },
    execution: {
      executionComplete,
      status: executionComplete
        ? "COMPLETE_ENDPOINT_EXHAUSTED"
        : profile.saturation.saturationReached
          ? "PARTIAL_STRUCTURALLY_SATURATED"
          : "PARTIAL_NOT_SATURATED",
      stoppedAtPage,
      warnings,
    },
    records: {
      recordsFetched: profile.recordsObserved,
      uniqueRecordsObserved: null,
      duplicateOccurrences: null,
      duplicateDetection: "unavailable_without_assuming_identity_field",
    },
    discoveryCurve,
    profile,
    privacy: {
      rawPayloadPersisted: false,
      realFixtureCreated: false,
      piiValuesPersisted: false,
      piiValuesLogged: false,
      tokenPersisted: false,
    },
  };
}

function toSafeWarning(error: unknown, page: number): SafeInspectionWarning {
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
