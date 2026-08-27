import { createHash } from "node:crypto";

export type JsonType =
  "null" | "boolean" | "string" | "number" | "object" | "array";
export type StructuralNoveltyKind =
  "NEW_PATH" | "NEW_TYPE_FOR_PATH" | "NEW_ARRAY_ELEMENT_TYPE";

export interface StructuralNovelty {
  kind: StructuralNoveltyKind;
  record: number;
  page: number;
}

export interface PathStatistics {
  path: string;
  parentPath: string | null;
  depth: number;
  presentRecordCount: number;
  missingRecordCount: number;
  nullRecordCount: number;
  parentEligibleCount: number;
  missingWithinEligibleParent: number;
  occurrenceCount: number;
  emptyStringCount: number;
  typeCounts: Partial<Record<JsonType, number>>;
  observedTypes: JsonType[];
  multiType: boolean;
  firstSeenRecord: number;
  firstSeenPage: number;
  lastSeenRecord: number;
  lastSeenPage: number;
  presenceRate: number;
  rarity: "VERY_RARE" | "RARE" | "UNCOMMON" | "COMMON";
}

export interface ArrayStatistics {
  path: string;
  arrayPresentRecords: number;
  nullArrayRecords: number;
  emptyArrayRecords: number;
  nonEmptyArrayRecords: number;
  totalElementsObserved: number;
  elementTypeCounts: Partial<Record<JsonType, number>>;
  observedElementTypes: JsonType[];
}

export interface StructuralShape {
  shapeId: string;
  recordCount: number;
  frequency: number;
  structure: Array<{ path: string; types: JsonType[] }>;
  differenceFromDominant?: {
    added: string[];
    removed: string[];
    changedTypes: string[];
  };
}

export interface SaturationStatistics {
  minimumRecords: number;
  noveltyFreeWindow: number;
  saturationReached: boolean;
  saturationReachedAtRecord: number | null;
  saturationReachedAtPage: number | null;
  lastNoveltyAtRecord: number | null;
  lastNoveltyAtPage: number | null;
  recordsSinceLastNovelty: number;
  lateStructuralNoveltyCount: number;
}

export interface StructuralProfile {
  recordsObserved: number;
  uniquePaths: number;
  maximumDepthObserved: number;
  multiTypePaths: number;
  arrayPaths: number;
  distinctStructuralShapes: number;
  dominantShapeFrequency: number;
  rarePaths: number;
  paths: PathStatistics[];
  arrays: ArrayStatistics[];
  structuralShapes: StructuralShape[];
  saturation: SaturationStatistics;
  dynamicKeyParentsNormalized: number;
}

export interface RecordInspection {
  record: number;
  page: number;
  newPaths: number;
  newTypeEvents: number;
  newArrayElementTypeEvents: number;
  noveltyEvents: StructuralNovelty[];
}

interface InternalPathStatistics {
  path: string;
  parentPath: string | null;
  depth: number;
  presentRecords: Set<number>;
  nullRecords: Set<number>;
  eligibleParentPresenceCount: number;
  occurrenceCount: number;
  emptyStringCount: number;
  typeCounts: Map<JsonType, number>;
  firstSeenRecord: number;
  firstSeenPage: number;
  lastSeenRecord: number;
  lastSeenPage: number;
}

interface InternalArrayStatistics {
  path: string;
  presentRecords: Set<number>;
  emptyRecords: Set<number>;
  nonEmptyRecords: Set<number>;
  totalElementsObserved: number;
  elementTypeCounts: Map<JsonType, number>;
}

interface InternalShape {
  signature: string;
  structure: Array<{ path: string; types: JsonType[] }>;
  recordCount: number;
}

interface ProfilerOptions {
  minimumRecords?: number;
  noveltyFreeWindow?: number;
}

export interface StructuralProfiler {
  inspectRecord(record: unknown, page: number): RecordInspection;
  getProfile(): StructuralProfile;
}

const SAFE_SCHEMA_KEY = /^[a-z_][a-z0-9_]*$/;
const DYNAMIC_KEY = "<dynamic-key>";

export function createStructuralProfiler(
  options: ProfilerOptions = {},
): StructuralProfiler {
  const minimumRecords = options.minimumRecords ?? 500;
  const noveltyFreeWindow = options.noveltyFreeWindow ?? 1_000;
  const paths = new Map<string, InternalPathStatistics>();
  const arrays = new Map<string, InternalArrayStatistics>();
  const shapes = new Map<string, InternalShape>();
  let recordsObserved = 0;
  let lastNoveltyAtRecord: number | null = null;
  let lastNoveltyAtPage: number | null = null;
  let saturationReachedAtRecord: number | null = null;
  let saturationReachedAtPage: number | null = null;
  let lateStructuralNoveltyCount = 0;
  const dynamicParents = new Set<string>();

  function inspectRecord(record: unknown, page: number): RecordInspection {
    recordsObserved += 1;
    const recordNumber = recordsObserved;
    const noveltyEvents: StructuralNovelty[] = [];
    const shapeTypes = new Map<string, Set<JsonType>>();

    const observe = (
      path: string,
      parentPath: string | null,
      depth: number,
      value: unknown,
      eligibleInParent: boolean,
      isArrayElement: boolean,
    ): void => {
      const type = classifyJsonType(value);
      let statistics = paths.get(path);
      const newPath = statistics === undefined;
      if (!statistics) {
        statistics = {
          path,
          parentPath,
          depth,
          presentRecords: new Set(),
          nullRecords: new Set(),
          eligibleParentPresenceCount: 0,
          occurrenceCount: 0,
          emptyStringCount: 0,
          typeCounts: new Map(),
          firstSeenRecord: recordNumber,
          firstSeenPage: page,
          lastSeenRecord: recordNumber,
          lastSeenPage: page,
        };
        paths.set(path, statistics);
        noveltyEvents.push({ kind: "NEW_PATH", record: recordNumber, page });
      }

      const newType = !statistics.typeCounts.has(type);
      if (!newPath && newType) {
        noveltyEvents.push({
          kind: isArrayElement ? "NEW_ARRAY_ELEMENT_TYPE" : "NEW_TYPE_FOR_PATH",
          record: recordNumber,
          page,
        });
      }

      statistics.presentRecords.add(recordNumber);
      if (type === "null") statistics.nullRecords.add(recordNumber);
      if (eligibleInParent) statistics.eligibleParentPresenceCount += 1;
      statistics.occurrenceCount += 1;
      if (value === "") statistics.emptyStringCount += 1;
      statistics.typeCounts.set(
        type,
        (statistics.typeCounts.get(type) ?? 0) + 1,
      );
      statistics.lastSeenRecord = recordNumber;
      statistics.lastSeenPage = page;

      let typesInShape = shapeTypes.get(path);
      if (!typesInShape) {
        typesInShape = new Set();
        shapeTypes.set(path, typesInShape);
      }
      typesInShape.add(type);
    };

    const walk = (
      value: unknown,
      path: string,
      parentPath: string | null,
      depth: number,
      eligibleInParent: boolean,
      isArrayElement: boolean,
    ): void => {
      observe(path, parentPath, depth, value, eligibleInParent, isArrayElement);

      if (Array.isArray(value)) {
        let arrayStats = arrays.get(path);
        if (!arrayStats) {
          arrayStats = {
            path,
            presentRecords: new Set(),
            emptyRecords: new Set(),
            nonEmptyRecords: new Set(),
            totalElementsObserved: 0,
            elementTypeCounts: new Map(),
          };
          arrays.set(path, arrayStats);
        }
        arrayStats.presentRecords.add(recordNumber);
        if (value.length === 0) arrayStats.emptyRecords.add(recordNumber);
        else arrayStats.nonEmptyRecords.add(recordNumber);
        arrayStats.totalElementsObserved += value.length;

        const elementPath = `${path}[]`;
        for (const element of value) {
          const elementType = classifyJsonType(element);
          arrayStats.elementTypeCounts.set(
            elementType,
            (arrayStats.elementTypeCounts.get(elementType) ?? 0) + 1,
          );
          walk(element, elementPath, path, depth + 1, true, true);
        }
        return;
      }

      if (!isJsonObject(value)) return;
      const entries = normalizeEntries(value, path);
      if (entries.dynamic) dynamicParents.add(path);
      const emittedForParent = new Set<string>();
      for (const [key, child] of entries.entries) {
        const childPath = appendPath(path, key);
        const firstForParent = !emittedForParent.has(childPath);
        emittedForParent.add(childPath);
        walk(child, childPath, path, depth + 1, firstForParent, false);
      }
    };

    walk(record, "$", null, 0, false, false);

    const structure = [...shapeTypes.entries()]
      .map(([path, types]) => ({ path, types: [...types].sort() }))
      .sort((a, b) => a.path.localeCompare(b.path));
    const signature = structure
      .map((entry) => `${entry.path}:${entry.types.join("|")}`)
      .join("\n");
    const shapeId = createHash("sha256")
      .update(signature)
      .digest("hex")
      .slice(0, 12);
    const existingShape = shapes.get(shapeId);
    if (existingShape) existingShape.recordCount += 1;
    else shapes.set(shapeId, { signature, structure, recordCount: 1 });

    if (noveltyEvents.length > 0) {
      if (saturationReachedAtRecord !== null)
        lateStructuralNoveltyCount += noveltyEvents.length;
      lastNoveltyAtRecord = recordNumber;
      lastNoveltyAtPage = page;
    }

    const recordsSinceNovelty =
      lastNoveltyAtRecord === null
        ? recordNumber
        : recordNumber - lastNoveltyAtRecord;
    if (
      saturationReachedAtRecord === null &&
      recordNumber >= minimumRecords &&
      recordsSinceNovelty >= noveltyFreeWindow
    ) {
      saturationReachedAtRecord = recordNumber;
      saturationReachedAtPage = page;
    }

    return {
      record: recordNumber,
      page,
      newPaths: noveltyEvents.filter((event) => event.kind === "NEW_PATH")
        .length,
      newTypeEvents: noveltyEvents.filter(
        (event) => event.kind === "NEW_TYPE_FOR_PATH",
      ).length,
      newArrayElementTypeEvents: noveltyEvents.filter(
        (event) => event.kind === "NEW_ARRAY_ELEMENT_TYPE",
      ).length,
      noveltyEvents,
    };
  }

  function getProfile(): StructuralProfile {
    const pathResults = [...paths.values()]
      .map((statistics): PathStatistics => {
        const parentEligibleCount = getParentEligibleCount(
          statistics.parentPath,
        );
        const presentRecordCount = statistics.presentRecords.size;
        const presenceRate =
          recordsObserved === 0 ? 0 : presentRecordCount / recordsObserved;
        return {
          path: statistics.path,
          parentPath: statistics.parentPath,
          depth: statistics.depth,
          presentRecordCount,
          missingRecordCount: recordsObserved - presentRecordCount,
          nullRecordCount: statistics.nullRecords.size,
          parentEligibleCount,
          missingWithinEligibleParent: Math.max(
            0,
            parentEligibleCount - statistics.eligibleParentPresenceCount,
          ),
          occurrenceCount: statistics.occurrenceCount,
          emptyStringCount: statistics.emptyStringCount,
          typeCounts: mapCounts(statistics.typeCounts),
          observedTypes: [...statistics.typeCounts.keys()].sort(),
          multiType: statistics.typeCounts.size > 1,
          firstSeenRecord: statistics.firstSeenRecord,
          firstSeenPage: statistics.firstSeenPage,
          lastSeenRecord: statistics.lastSeenRecord,
          lastSeenPage: statistics.lastSeenPage,
          presenceRate,
          rarity: classifyRarity(presenceRate),
        };
      })
      .sort((a, b) => a.path.localeCompare(b.path));

    const arrayResults = [...arrays.values()]
      .map((statistics): ArrayStatistics => ({
        path: statistics.path,
        arrayPresentRecords: statistics.presentRecords.size,
        nullArrayRecords: paths.get(statistics.path)?.nullRecords.size ?? 0,
        emptyArrayRecords: statistics.emptyRecords.size,
        nonEmptyArrayRecords: statistics.nonEmptyRecords.size,
        totalElementsObserved: statistics.totalElementsObserved,
        elementTypeCounts: mapCounts(statistics.elementTypeCounts),
        observedElementTypes: [...statistics.elementTypeCounts.keys()].sort(),
      }))
      .sort((a, b) => a.path.localeCompare(b.path));

    const shapeResults = buildShapeResults(shapes, recordsObserved);
    const recordsSinceLastNovelty =
      lastNoveltyAtRecord === null
        ? recordsObserved
        : recordsObserved - lastNoveltyAtRecord;
    return {
      recordsObserved,
      uniquePaths: pathResults.length,
      maximumDepthObserved: Math.max(
        0,
        ...pathResults.map((entry) => entry.depth),
      ),
      multiTypePaths: pathResults.filter((entry) => entry.multiType).length,
      arrayPaths: arrayResults.length,
      distinctStructuralShapes: shapeResults.length,
      dominantShapeFrequency: shapeResults[0]?.frequency ?? 0,
      rarePaths: pathResults.filter(
        (entry) => entry.rarity === "VERY_RARE" || entry.rarity === "RARE",
      ).length,
      paths: pathResults,
      arrays: arrayResults,
      structuralShapes: shapeResults,
      saturation: {
        minimumRecords,
        noveltyFreeWindow,
        saturationReached: saturationReachedAtRecord !== null,
        saturationReachedAtRecord,
        saturationReachedAtPage,
        lastNoveltyAtRecord,
        lastNoveltyAtPage,
        recordsSinceLastNovelty,
        lateStructuralNoveltyCount,
      },
      dynamicKeyParentsNormalized: dynamicParents.size,
    };
  }

  function getParentEligibleCount(parentPath: string | null): number {
    if (parentPath === null) return recordsObserved;
    return paths.get(parentPath)?.typeCounts.get("object") ?? 0;
  }

  return { inspectRecord, getProfile };
}

export function classifyJsonType(value: unknown): JsonType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  throw new TypeError(
    "Structural profiler accepts JSON-compatible values only",
  );
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeEntries(
  value: Record<string, unknown>,
  parentPath: string,
): {
  entries: Array<[string, unknown]>;
  dynamic: boolean;
} {
  const rawEntries = Object.entries(value);
  const unsafeKey = rawEntries.some(([key]) => !SAFE_SCHEMA_KEY.test(key));
  const homogeneousObjectMap =
    rawEntries.length > 1 &&
    rawEntries.every(([, child]) => isJsonObject(child)) &&
    new Set(
      rawEntries.map(([, child]) =>
        shallowShape(child as Record<string, unknown>),
      ),
    ).size === 1;
  const dynamic = unsafeKey || (parentPath !== "$" && homogeneousObjectMap);
  if (!dynamic) return { entries: rawEntries, dynamic: false };
  return {
    entries: rawEntries.map(([, child]) => [DYNAMIC_KEY, child]),
    dynamic: true,
  };
}

function shallowShape(value: Record<string, unknown>): string {
  return Object.entries(value)
    .map(
      ([key, child]) =>
        `${SAFE_SCHEMA_KEY.test(key) ? key : DYNAMIC_KEY}:${classifyJsonType(child)}`,
    )
    .sort()
    .join("|");
}

function appendPath(parent: string, key: string): string {
  return parent === "$" ? `$.${key}` : `${parent}.${key}`;
}

function mapCounts(
  map: Map<JsonType, number>,
): Partial<Record<JsonType, number>> {
  return Object.fromEntries(
    [...map.entries()].sort(([a], [b]) => a.localeCompare(b)),
  ) as Partial<Record<JsonType, number>>;
}

function classifyRarity(rate: number): PathStatistics["rarity"] {
  if (rate <= 0.001) return "VERY_RARE";
  if (rate <= 0.01) return "RARE";
  if (rate <= 0.1) return "UNCOMMON";
  return "COMMON";
}

function buildShapeResults(
  shapes: Map<string, InternalShape>,
  recordsObserved: number,
): StructuralShape[] {
  const ordered = [...shapes.entries()].sort(
    (a, b) => b[1].recordCount - a[1].recordCount || a[0].localeCompare(b[0]),
  );
  const dominant = ordered[0]?.[1];
  return ordered.map(([shapeId, shape]) => ({
    shapeId,
    recordCount: shape.recordCount,
    frequency: recordsObserved === 0 ? 0 : shape.recordCount / recordsObserved,
    structure: shape.structure,
    ...(dominant && shape !== dominant
      ? {
          differenceFromDominant: compareShapes(
            dominant.structure,
            shape.structure,
          ),
        }
      : {}),
  }));
}

function compareShapes(
  dominant: InternalShape["structure"],
  candidate: InternalShape["structure"],
): NonNullable<StructuralShape["differenceFromDominant"]> {
  const dominantMap = new Map(
    dominant.map((entry) => [entry.path, entry.types.join("|")]),
  );
  const candidateMap = new Map(
    candidate.map((entry) => [entry.path, entry.types.join("|")]),
  );
  return {
    added: [...candidateMap.keys()]
      .filter((path) => !dominantMap.has(path))
      .sort(),
    removed: [...dominantMap.keys()]
      .filter((path) => !candidateMap.has(path))
      .sort(),
    changedTypes: [...candidateMap.keys()]
      .filter(
        (path) =>
          dominantMap.has(path) &&
          dominantMap.get(path) !== candidateMap.get(path),
      )
      .sort(),
  };
}
