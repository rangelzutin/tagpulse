import {
  TagPlusHttpError,
  TagPlusInvalidResponseError,
  TagPlusNetworkError,
  TagPlusTimeoutError,
  type TagPlusClient,
} from "../tagplus-client.js";
import {
  createClientesCharacterizationProfiler,
  type ClientesCharacterizationProfile,
} from "./clientes-characterization-profiler.js";
import {
  ARRAY_ELEMENT_PATHS,
  ARRAY_PATHS,
  CATEGORY_ELEMENT_PATHS,
  DEFERRED_PATHS,
  OBJECT_PATHS,
  SCALAR_VALUE_PATHS,
} from "./clientes-characterization-scope.js";

type FailureCategory =
  | "HTTP_ERROR"
  | "INVALID_JSON"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "UNEXPECTED_ROOT";

export interface ClientesFullCharacterizationResult {
  resource: "clientes";
  projection: "fields_all";
  apiVersion: string;
  scope: {
    scalarPaths: readonly string[];
    objectPaths: readonly string[];
    arrayPaths: readonly string[];
    arrayElementPaths: readonly string[];
    categoryElementPaths: readonly string[];
    deferredPaths: readonly string[];
  };
  execution: {
    firstPage: 1;
    perPage: 100;
    recordsProcessed: number;
    pagesProcessed: number;
    lastNonEmptyPage: number | null;
    lastNonEmptyPageRecordCount: number | null;
    emptyTerminationPage: number | null;
    endpointExhausted: boolean;
    executionComplete: boolean;
    status: "COMPLETE_ENDPOINT_EXHAUSTED" | "PARTIAL" | "FAILED";
    stoppedAtPage: number | null;
    warnings: Array<{
      failureStage: "FETCH_PAGE" | "VALIDATE_PAGE";
      failureCategory: FailureCategory;
      page: number;
      httpStatus?: number;
    }>;
  };
  profile: ClientesCharacterizationProfile;
  privacy: {
    rawPayloadPersisted: false;
    realFixtureCreated: false;
    customerValuesPersisted: false;
    customerIdsPersisted: false;
    emailValuesPersisted: false;
    phoneValuesPersisted: false;
    addressValuesPersisted: false;
    documentValuesPersisted: false;
    fiscalValuesPersisted: false;
    personalValuesPersisted: false;
    financialValuesPersisted: false;
    piiLogged: false;
    tokenPersisted: false;
    refreshTokenPersisted: false;
    authorizationHeaderPersisted: false;
    fingerprintOrHashPersisted: false;
    individualExamplesPersisted: false;
  };
}

export async function characterizeClientesFull(
  client: TagPlusClient,
  apiVersion: string,
): Promise<ClientesFullCharacterizationResult> {
  const profiler = createClientesCharacterizationProfiler();
  const warnings: ClientesFullCharacterizationResult["execution"]["warnings"] =
    [];
  let page = 1;
  let pagesProcessed = 0;
  let lastNonEmptyPage: number | null = null;
  let lastNonEmptyPageRecordCount: number | null = null;
  let emptyTerminationPage: number | null = null;
  let endpointExhausted = false;
  let stoppedAtPage: number | null = null;

  while (true) {
    let data: unknown;
    try {
      data = (
        await client.get<unknown>(
          `/clientes?fields=*&page=${page}&per_page=100`,
        )
      ).data;
    } catch (error: unknown) {
      warnings.push(toSafeWarning(error, page));
      stoppedAtPage = page;
      break;
    }

    if (!Array.isArray(data)) {
      warnings.push({
        failureStage: "VALIDATE_PAGE",
        failureCategory: "UNEXPECTED_ROOT",
        page,
      });
      stoppedAtPage = page;
      break;
    }
    if (data.length === 0) {
      endpointExhausted = true;
      emptyTerminationPage = page;
      break;
    }

    for (const record of data) profiler.inspectRecord(record);
    pagesProcessed += 1;
    lastNonEmptyPage = page;
    lastNonEmptyPageRecordCount = data.length;
    page += 1;
  }

  const profile = profiler.finalize();
  const executionComplete = endpointExhausted;
  return {
    resource: "clientes",
    projection: "fields_all",
    apiVersion,
    scope: {
      scalarPaths: SCALAR_VALUE_PATHS,
      objectPaths: OBJECT_PATHS,
      arrayPaths: ARRAY_PATHS,
      arrayElementPaths: ARRAY_ELEMENT_PATHS,
      categoryElementPaths: CATEGORY_ELEMENT_PATHS,
      deferredPaths: DEFERRED_PATHS,
    },
    execution: {
      firstPage: 1,
      perPage: 100,
      recordsProcessed: profile.recordsObserved,
      pagesProcessed,
      lastNonEmptyPage,
      lastNonEmptyPageRecordCount,
      emptyTerminationPage,
      endpointExhausted,
      executionComplete,
      status: executionComplete
        ? "COMPLETE_ENDPOINT_EXHAUSTED"
        : profile.recordsObserved > 0
          ? "PARTIAL"
          : "FAILED",
      stoppedAtPage,
      warnings,
    },
    profile,
    privacy: {
      rawPayloadPersisted: false,
      realFixtureCreated: false,
      customerValuesPersisted: false,
      customerIdsPersisted: false,
      emailValuesPersisted: false,
      phoneValuesPersisted: false,
      addressValuesPersisted: false,
      documentValuesPersisted: false,
      fiscalValuesPersisted: false,
      personalValuesPersisted: false,
      financialValuesPersisted: false,
      piiLogged: false,
      tokenPersisted: false,
      refreshTokenPersisted: false,
      authorizationHeaderPersisted: false,
      fingerprintOrHashPersisted: false,
      individualExamplesPersisted: false,
    },
  };
}

function toSafeWarning(
  error: unknown,
  page: number,
): ClientesFullCharacterizationResult["execution"]["warnings"][number] {
  if (error instanceof TagPlusHttpError)
    return {
      failureStage: "FETCH_PAGE",
      failureCategory: "HTTP_ERROR",
      page,
      httpStatus: error.status,
    };
  if (error instanceof TagPlusTimeoutError)
    return { failureStage: "FETCH_PAGE", failureCategory: "TIMEOUT", page };
  if (error instanceof TagPlusInvalidResponseError)
    return {
      failureStage: "FETCH_PAGE",
      failureCategory: "INVALID_JSON",
      page,
    };
  if (error instanceof TagPlusNetworkError)
    return {
      failureStage: "FETCH_PAGE",
      failureCategory: "NETWORK_ERROR",
      page,
    };
  return {
    failureStage: "FETCH_PAGE",
    failureCategory: "NETWORK_ERROR",
    page,
  };
}
