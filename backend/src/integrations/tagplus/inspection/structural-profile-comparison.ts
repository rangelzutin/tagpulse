import type { JsonType, StructuralProfile } from "./structural-profiler.js";

export const DISCOVERY_MODES = [
  "COLLECTION_DEFAULT",
  "COLLECTION_FIELDS_ALL",
  "ITEM_DETAIL",
] as const;

export type DiscoveryMode = (typeof DISCOVERY_MODES)[number];

export interface SafeStructuralSummary {
  rootType: JsonType;
  recordCountProfiled: number;
  uniquePaths: number;
  maximumDepth: number;
  arrayPaths: string[];
  objectPaths: string[];
  multiTypePaths: number;
  structuralShapes: number;
  paths: Array<{ path: string; observedTypes: JsonType[] }>;
}

export interface StructuralComparison {
  pathsOnlyInDefault: string[];
  pathsOnlyInFieldsAll: string[];
  pathsOnlyInItem: string[];
  pathsCommonToAll: string[];
  typesChangedBetweenModes: Array<{
    path: string;
    typesByMode: Partial<Record<DiscoveryMode, JsonType[]>>;
  }>;
  maximumDepthByMode: Record<DiscoveryMode, number | null>;
  arrayPathsByMode: Record<DiscoveryMode, string[]>;
  objectPathsByMode: Record<DiscoveryMode, string[]>;
}

export function summarizeStructuralProfile(
  profile: StructuralProfile,
): SafeStructuralSummary {
  const root = profile.paths.find((entry) => entry.path === "$");
  const rootType = root?.observedTypes[0];
  if (!rootType) throw new Error("Structural profile has no root type");
  return {
    rootType,
    recordCountProfiled: profile.recordsObserved,
    uniquePaths: profile.uniquePaths,
    maximumDepth: profile.maximumDepthObserved,
    arrayPaths: profile.arrays.map((entry) => entry.path).sort(),
    objectPaths: profile.paths
      .filter((entry) => entry.observedTypes.includes("object"))
      .map((entry) => entry.path)
      .sort(),
    multiTypePaths: profile.multiTypePaths,
    structuralShapes: profile.distinctStructuralShapes,
    paths: profile.paths.map((entry) => ({
      path: entry.path,
      observedTypes: [...entry.observedTypes].sort(),
    })),
  };
}

export function compareStructuralProfiles(
  profiles: Partial<Record<DiscoveryMode, SafeStructuralSummary>>,
): StructuralComparison {
  const pathSets = Object.fromEntries(
    DISCOVERY_MODES.map((mode) => [
      mode,
      new Set(profiles[mode]?.paths.map((entry) => entry.path) ?? []),
    ]),
  ) as Record<DiscoveryMode, Set<string>>;
  const allPaths = new Set(
    DISCOVERY_MODES.flatMap((mode) => [...pathSets[mode]]),
  );

  const onlyIn = (target: DiscoveryMode): string[] =>
    [...pathSets[target]]
      .filter((path) =>
        DISCOVERY_MODES.every(
          (mode) => mode === target || !pathSets[mode].has(path),
        ),
      )
      .sort();

  const typesChangedBetweenModes = [...allPaths]
    .map((path) => {
      const typesByMode: Partial<Record<DiscoveryMode, JsonType[]>> = {};
      for (const mode of DISCOVERY_MODES) {
        const types = profiles[mode]?.paths.find(
          (entry) => entry.path === path,
        )?.observedTypes;
        if (types) typesByMode[mode] = [...types].sort();
      }
      const signatures = Object.values(typesByMode).map((types) =>
        types.join("|"),
      );
      return {
        path,
        typesByMode,
        changed: signatures.length > 1 && new Set(signatures).size > 1,
      };
    })
    .filter((entry) => entry.changed)
    .map(({ path, typesByMode }) => ({ path, typesByMode }))
    .sort((left, right) => left.path.localeCompare(right.path));

  return {
    pathsOnlyInDefault: onlyIn("COLLECTION_DEFAULT"),
    pathsOnlyInFieldsAll: onlyIn("COLLECTION_FIELDS_ALL"),
    pathsOnlyInItem: onlyIn("ITEM_DETAIL"),
    pathsCommonToAll: [...pathSets.COLLECTION_DEFAULT]
      .filter(
        (path) =>
          pathSets.COLLECTION_FIELDS_ALL.has(path) &&
          pathSets.ITEM_DETAIL.has(path),
      )
      .sort(),
    typesChangedBetweenModes,
    maximumDepthByMode: mapModes(
      profiles,
      (profile) => profile.maximumDepth,
      null,
    ),
    arrayPathsByMode: mapModes(
      profiles,
      (profile) => [...profile.arrayPaths],
      [],
    ),
    objectPathsByMode: mapModes(
      profiles,
      (profile) => [...profile.objectPaths],
      [],
    ),
  };
}

function mapModes<T>(
  profiles: Partial<Record<DiscoveryMode, SafeStructuralSummary>>,
  select: (profile: SafeStructuralSummary) => T,
  fallback: T,
): Record<DiscoveryMode, T> {
  return Object.fromEntries(
    DISCOVERY_MODES.map((mode) => [
      mode,
      profiles[mode] ? select(profiles[mode]) : fallback,
    ]),
  ) as Record<DiscoveryMode, T>;
}
