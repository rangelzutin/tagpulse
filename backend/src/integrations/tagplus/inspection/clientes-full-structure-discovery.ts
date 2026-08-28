import {
  TagPlusHttpError,
  TagPlusInvalidResponseError,
  TagPlusNetworkError,
  TagPlusTimeoutError,
  type TagPlusClient,
} from "../tagplus-client.js";
import {
  compareStructuralProfiles,
  DISCOVERY_MODES,
  summarizeStructuralProfile,
  type DiscoveryMode,
  type SafeStructuralSummary,
  type StructuralComparison,
} from "./structural-profile-comparison.js";
import { createStructuralProfiler } from "./structural-profiler.js";

type FailureCategory =
  | "HTTP_ERROR"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "INVALID_JSON"
  | "UNEXPECTED_ROOT"
  | "EMPTY_COLLECTION"
  | "MISSING_ID"
  | "UNEXPECTED_ID_TYPE"
  | "SKIPPED_DEPENDENCY";

export interface DiscoveryModeResult {
  mode: DiscoveryMode;
  success: boolean;
  httpStatus: number | null;
  profileComplete: boolean;
  failureCategory?: FailureCategory;
  profile?: SafeStructuralSummary;
}

export interface ClientesFullStructureDiscoveryResult {
  resource: "clientes";
  apiVersion: string;
  execution: {
    status: "COMPLETE" | "PARTIAL" | "FAILED";
    sameRecordAcrossCollections: boolean | null;
    itemMatchesDefault: boolean | null;
  };
  modes: DiscoveryModeResult[];
  comparison: StructuralComparison;
  privacy: {
    rawPayloadPersisted: false;
    realFixtureCreated: false;
    customerValuesPersisted: false;
    customerIdsPersisted: false;
    piiLogged: false;
    tokenPersisted: false;
    refreshTokenPersisted: false;
    authorizationHeaderPersisted: false;
    fingerprintOrHashPersisted: false;
    individualExamplesPersisted: false;
    concreteItemUrlPersistedOrExposed: false;
  };
}

export async function discoverClientesFullStructure(
  client: TagPlusClient,
  apiVersion: string,
): Promise<ClientesFullStructureDiscoveryResult> {
  const results = new Map<DiscoveryMode, DiscoveryModeResult>();
  const profiles: Partial<Record<DiscoveryMode, SafeStructuralSummary>> = {};

  const defaultResponse = await request(client, "COLLECTION_DEFAULT", () =>
    client.get<unknown>("/clientes?page=1&per_page=1"),
  );
  if (!defaultResponse.ok) {
    results.set("COLLECTION_DEFAULT", defaultResponse.result);
    markSkipped(results, "COLLECTION_FIELDS_ALL");
    markSkipped(results, "ITEM_DETAIL");
    return buildResult(apiVersion, results, profiles, null, null);
  }

  const defaultCollection = validateCollection(
    "COLLECTION_DEFAULT",
    defaultResponse.data,
    defaultResponse.httpStatus,
  );
  if (!defaultCollection.ok) {
    results.set("COLLECTION_DEFAULT", defaultCollection.result);
    markSkipped(results, "COLLECTION_FIELDS_ALL");
    markSkipped(results, "ITEM_DETAIL");
    return buildResult(apiVersion, results, profiles, null, null);
  }

  const defaultRecord = defaultCollection.record;
  const identifier = extractIdentifier(defaultRecord);
  if (!identifier.ok) {
    results.set("COLLECTION_DEFAULT", {
      mode: "COLLECTION_DEFAULT",
      success: false,
      httpStatus: defaultResponse.httpStatus,
      profileComplete: false,
      failureCategory: identifier.category,
    });
    markSkipped(results, "COLLECTION_FIELDS_ALL");
    markSkipped(results, "ITEM_DETAIL");
    return buildResult(apiVersion, results, profiles, null, null);
  }

  const defaultProfile = profileRecord(defaultRecord);
  profiles.COLLECTION_DEFAULT = defaultProfile;
  results.set(
    "COLLECTION_DEFAULT",
    successResult(
      "COLLECTION_DEFAULT",
      defaultResponse.httpStatus,
      defaultProfile,
    ),
  );

  let sameRecordAcrossCollections: boolean | null = null;
  const fieldsResponse = await request(client, "COLLECTION_FIELDS_ALL", () =>
    client.get<unknown>("/clientes?fields=*&page=1&per_page=1"),
  );
  if (!fieldsResponse.ok) {
    results.set("COLLECTION_FIELDS_ALL", fieldsResponse.result);
  } else {
    const fieldsCollection = validateCollection(
      "COLLECTION_FIELDS_ALL",
      fieldsResponse.data,
      fieldsResponse.httpStatus,
    );
    if (!fieldsCollection.ok) {
      results.set("COLLECTION_FIELDS_ALL", fieldsCollection.result);
    } else {
      const fieldsProfile = profileRecord(fieldsCollection.record);
      profiles.COLLECTION_FIELDS_ALL = fieldsProfile;
      results.set(
        "COLLECTION_FIELDS_ALL",
        successResult(
          "COLLECTION_FIELDS_ALL",
          fieldsResponse.httpStatus,
          fieldsProfile,
        ),
      );
      const fieldsIdentifier = extractIdentifier(fieldsCollection.record);
      sameRecordAcrossCollections =
        fieldsIdentifier.ok &&
        sameIdentifier(identifier.value, fieldsIdentifier.value);
    }
  }

  let itemMatchesDefault: boolean | null = null;
  const itemResponse = await request(client, "ITEM_DETAIL", () =>
    client.get<unknown>(
      `/clientes/${encodeURIComponent(String(identifier.value))}`,
    ),
  );
  if (!itemResponse.ok) {
    results.set("ITEM_DETAIL", itemResponse.result);
  } else if (!isObject(itemResponse.data)) {
    results.set("ITEM_DETAIL", {
      mode: "ITEM_DETAIL",
      success: false,
      httpStatus: itemResponse.httpStatus,
      profileComplete: false,
      failureCategory: "UNEXPECTED_ROOT",
    });
  } else {
    const itemProfile = profileRecord(itemResponse.data);
    profiles.ITEM_DETAIL = itemProfile;
    results.set(
      "ITEM_DETAIL",
      successResult("ITEM_DETAIL", itemResponse.httpStatus, itemProfile),
    );
    const itemIdentifier = extractIdentifier(itemResponse.data);
    itemMatchesDefault =
      itemIdentifier.ok &&
      sameIdentifier(identifier.value, itemIdentifier.value);
  }

  return buildResult(
    apiVersion,
    results,
    profiles,
    sameRecordAcrossCollections,
    itemMatchesDefault,
  );
}

function profileRecord(record: Record<string, unknown>): SafeStructuralSummary {
  const profiler = createStructuralProfiler();
  profiler.inspectRecord(record, 1);
  return summarizeStructuralProfile(profiler.getProfile());
}

async function request(
  _client: TagPlusClient,
  mode: DiscoveryMode,
  execute: () => ReturnType<TagPlusClient["get"]>,
): Promise<
  | { ok: true; data: unknown; httpStatus: number }
  | { ok: false; result: DiscoveryModeResult }
> {
  try {
    const response = await execute();
    return { ok: true, data: response.data, httpStatus: response.status };
  } catch (error: unknown) {
    return {
      ok: false,
      result: {
        mode,
        success: false,
        httpStatus: error instanceof TagPlusHttpError ? error.status : null,
        profileComplete: false,
        failureCategory: safeFailureCategory(error),
      },
    };
  }
}

function validateCollection(
  mode: "COLLECTION_DEFAULT" | "COLLECTION_FIELDS_ALL",
  data: unknown,
  httpStatus: number,
):
  | { ok: true; record: Record<string, unknown> }
  | { ok: false; result: DiscoveryModeResult } {
  if (!Array.isArray(data))
    return {
      ok: false,
      result: failureResult(mode, httpStatus, "UNEXPECTED_ROOT"),
    };
  if (data.length === 0)
    return {
      ok: false,
      result: failureResult(mode, httpStatus, "EMPTY_COLLECTION"),
    };
  if (!isObject(data[0]))
    return {
      ok: false,
      result: failureResult(mode, httpStatus, "UNEXPECTED_ROOT"),
    };
  return { ok: true, record: data[0] };
}

function extractIdentifier(
  record: Record<string, unknown>,
):
  | { ok: true; value: string | number }
  | { ok: false; category: "MISSING_ID" | "UNEXPECTED_ID_TYPE" } {
  if (!Object.prototype.hasOwnProperty.call(record, "id"))
    return { ok: false, category: "MISSING_ID" };
  const value = record.id;
  if (
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && value.length > 0)
  )
    return { ok: true, value };
  return { ok: false, category: "UNEXPECTED_ID_TYPE" };
}

function sameIdentifier(
  left: string | number,
  right: string | number,
): boolean {
  return typeof left === typeof right && left === right;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeFailureCategory(error: unknown): FailureCategory {
  if (error instanceof TagPlusHttpError) return "HTTP_ERROR";
  if (error instanceof TagPlusTimeoutError) return "TIMEOUT";
  if (error instanceof TagPlusInvalidResponseError) return "INVALID_JSON";
  if (error instanceof TagPlusNetworkError) return "NETWORK_ERROR";
  return "NETWORK_ERROR";
}

function successResult(
  mode: DiscoveryMode,
  httpStatus: number,
  profile: SafeStructuralSummary,
): DiscoveryModeResult {
  return { mode, success: true, httpStatus, profileComplete: true, profile };
}

function failureResult(
  mode: DiscoveryMode,
  httpStatus: number,
  failureCategory: FailureCategory,
): DiscoveryModeResult {
  return {
    mode,
    success: false,
    httpStatus,
    profileComplete: false,
    failureCategory,
  };
}

function markSkipped(
  results: Map<DiscoveryMode, DiscoveryModeResult>,
  mode: DiscoveryMode,
): void {
  results.set(mode, {
    mode,
    success: false,
    httpStatus: null,
    profileComplete: false,
    failureCategory: "SKIPPED_DEPENDENCY",
  });
}

function buildResult(
  apiVersion: string,
  results: Map<DiscoveryMode, DiscoveryModeResult>,
  profiles: Partial<Record<DiscoveryMode, SafeStructuralSummary>>,
  sameRecordAcrossCollections: boolean | null,
  itemMatchesDefault: boolean | null,
): ClientesFullStructureDiscoveryResult {
  const modes = DISCOVERY_MODES.map((mode) => results.get(mode)!);
  const successes = modes.filter((mode) => mode.success).length;
  const allComparable = sameRecordAcrossCollections !== false;
  return {
    resource: "clientes",
    apiVersion,
    execution: {
      status:
        successes === 3 && allComparable
          ? "COMPLETE"
          : successes === 0
            ? "FAILED"
            : "PARTIAL",
      sameRecordAcrossCollections,
      itemMatchesDefault,
    },
    modes,
    comparison: compareStructuralProfiles(profiles),
    privacy: {
      rawPayloadPersisted: false,
      realFixtureCreated: false,
      customerValuesPersisted: false,
      customerIdsPersisted: false,
      piiLogged: false,
      tokenPersisted: false,
      refreshTokenPersisted: false,
      authorizationHeaderPersisted: false,
      fingerprintOrHashPersisted: false,
      individualExamplesPersisted: false,
      concreteItemUrlPersistedOrExposed: false,
    },
  };
}
