import {
  TagPlusHttpError,
  TagPlusInvalidResponseError,
  TagPlusNetworkError,
  TagPlusTimeoutError,
  type TagPlusClient,
} from "../tagplus-client.js";
import {
  createStructuralProfiler,
  type JsonType,
  type StructuralProfile,
} from "./structural-profiler.js";

type CensusWarningCategory =
  | "HTTP_ERROR"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "INVALID_JSON"
  | "UNEXPECTED_ROOT";

export interface FullCensusPath {
  path: string;
  presentCount: number;
  missingCount: number;
  nullCount: number;
  observedTypes: JsonType[];
  objectCount: number;
  arrayCount: number;
}

export interface FullCensusShape {
  shapeId: string;
  recordCount: number;
  percentage: number;
  pathCount: number;
}

export interface ClientesFullStructuralCensusResult {
  resource: "clientes";
  projection: "fields_all";
  apiVersion: string;
  execution: {
    recordsFetched: number;
    nonEmptyPages: number;
    lastNonEmptyPage: number | null;
    lastNonEmptyPageRecordCount: number | null;
    emptyTerminationPage: number | null;
    endpointExhausted: boolean;
    executionComplete: boolean;
    status: "COMPLETE_ENDPOINT_EXHAUSTED" | "PARTIAL" | "FAILED";
    stoppedAtPage: number | null;
    warnings: Array<{
      category: CensusWarningCategory;
      page: number;
      httpStatus?: number;
    }>;
  };
  structure: {
    uniquePathCount: number;
    maximumDepth: number;
    arrayPaths: string[];
    objectPaths: string[];
    multiTypePaths: number;
    structuralShapeCount: number;
    dynamicKeyParentsNormalized: number;
  };
  paths: FullCensusPath[];
  shapes: FullCensusShape[];
  novelty: {
    firstNovelPathRecord: number | null;
    firstNovelPathPage: number | null;
    lastNovelPathRecord: number | null;
    lastNovelPathPage: number | null;
    firstNovelShapeRecord: number | null;
    firstNovelShapePage: number | null;
    lastNovelShapeRecord: number | null;
    lastNovelShapePage: number | null;
    profilerSaturationReached: boolean;
    profilerSaturationRecord: number | null;
    profilerSaturationPage: number | null;
  };
  privacy: {
    rawPayloadPersisted: false;
    realFixtureCreated: false;
    customerValuesPersisted: false;
    customerIdsPersisted: false;
    emailValuesPersisted: false;
    phoneValuesPersisted: false;
    addressValuesPersisted: false;
    documentValuesPersisted: false;
    financialValuesPersisted: false;
    piiLogged: false;
    tokenPersisted: false;
    refreshTokenPersisted: false;
    authorizationHeaderPersisted: false;
    customerFingerprintOrHashPersisted: false;
    individualExamplesPersisted: false;
    concreteItemUrlPersistedOrExposed: false;
    dynamicBusinessKeysExposed: false;
  };
}

export async function censusClientesFullStructure(
  client: TagPlusClient,
  apiVersion: string,
): Promise<ClientesFullStructuralCensusResult> {
  const profiler = createStructuralProfiler();
  const warnings: ClientesFullStructuralCensusResult["execution"]["warnings"] =
    [];
  let page = 1;
  let nonEmptyPages = 0;
  let lastNonEmptyPage: number | null = null;
  let lastNonEmptyPageRecordCount: number | null = null;
  let emptyTerminationPage: number | null = null;
  let endpointExhausted = false;
  let stoppedAtPage: number | null = null;
  let firstNovelPathRecord: number | null = null;
  let firstNovelPathPage: number | null = null;
  let lastNovelPathRecord: number | null = null;
  let lastNovelPathPage: number | null = null;
  let firstNovelShapeRecord: number | null = null;
  let firstNovelShapePage: number | null = null;
  let lastNovelShapeRecord: number | null = null;
  let lastNovelShapePage: number | null = null;

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
      warnings.push({ category: "UNEXPECTED_ROOT", page });
      stoppedAtPage = page;
      break;
    }
    if (data.length === 0) {
      endpointExhausted = true;
      emptyTerminationPage = page;
      break;
    }

    for (const record of data) {
      const inspection = profiler.inspectRecord(record, page);
      if (inspection.newPaths > 0) {
        firstNovelPathRecord ??= inspection.record;
        firstNovelPathPage ??= page;
        lastNovelPathRecord = inspection.record;
        lastNovelPathPage = page;
      }
      if (inspection.newStructuralShape) {
        firstNovelShapeRecord ??= inspection.record;
        firstNovelShapePage ??= page;
        lastNovelShapeRecord = inspection.record;
        lastNovelShapePage = page;
      }
    }
    nonEmptyPages += 1;
    lastNonEmptyPage = page;
    lastNonEmptyPageRecordCount = data.length;
    page += 1;
  }

  const profile = profiler.getProfile();
  const executionComplete = endpointExhausted;
  return {
    resource: "clientes",
    projection: "fields_all",
    apiVersion,
    execution: {
      recordsFetched: profile.recordsObserved,
      nonEmptyPages,
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
    structure: summarizeStructure(profile),
    paths: summarizePaths(profile),
    shapes: summarizeShapes(profile),
    novelty: {
      firstNovelPathRecord,
      firstNovelPathPage,
      lastNovelPathRecord,
      lastNovelPathPage,
      firstNovelShapeRecord,
      firstNovelShapePage,
      lastNovelShapeRecord,
      lastNovelShapePage,
      profilerSaturationReached: profile.saturation.saturationReached,
      profilerSaturationRecord: profile.saturation.saturationReachedAtRecord,
      profilerSaturationPage: profile.saturation.saturationReachedAtPage,
    },
    privacy: {
      rawPayloadPersisted: false,
      realFixtureCreated: false,
      customerValuesPersisted: false,
      customerIdsPersisted: false,
      emailValuesPersisted: false,
      phoneValuesPersisted: false,
      addressValuesPersisted: false,
      documentValuesPersisted: false,
      financialValuesPersisted: false,
      piiLogged: false,
      tokenPersisted: false,
      refreshTokenPersisted: false,
      authorizationHeaderPersisted: false,
      customerFingerprintOrHashPersisted: false,
      individualExamplesPersisted: false,
      concreteItemUrlPersistedOrExposed: false,
      dynamicBusinessKeysExposed: false,
    },
  };
}

function summarizeStructure(
  profile: StructuralProfile,
): ClientesFullStructuralCensusResult["structure"] {
  return {
    uniquePathCount: profile.uniquePaths,
    maximumDepth: profile.maximumDepthObserved,
    arrayPaths: profile.arrays.map((entry) => entry.path).sort(),
    objectPaths: profile.paths
      .filter((entry) => entry.observedTypes.includes("object"))
      .map((entry) => entry.path)
      .sort(),
    multiTypePaths: profile.multiTypePaths,
    structuralShapeCount: profile.distinctStructuralShapes,
    dynamicKeyParentsNormalized: profile.dynamicKeyParentsNormalized,
  };
}

function summarizePaths(profile: StructuralProfile): FullCensusPath[] {
  return profile.paths.map((entry) => ({
    path: entry.path,
    presentCount: entry.presentRecordCount,
    missingCount: entry.missingRecordCount,
    nullCount: entry.nullRecordCount,
    observedTypes: [...entry.observedTypes],
    objectCount: entry.typeCounts.object ?? 0,
    arrayCount: entry.typeCounts.array ?? 0,
  }));
}

function summarizeShapes(profile: StructuralProfile): FullCensusShape[] {
  return profile.structuralShapes.map((shape, index) => ({
    shapeId: `SHAPE_${String(index + 1).padStart(3, "0")}`,
    recordCount: shape.recordCount,
    percentage: shape.frequency,
    pathCount: shape.structure.length,
  }));
}

function toSafeWarning(
  error: unknown,
  page: number,
): ClientesFullStructuralCensusResult["execution"]["warnings"][number] {
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
