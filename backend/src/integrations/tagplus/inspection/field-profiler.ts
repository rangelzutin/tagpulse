export const CLIENTES_FIELDS = [
  "id",
  "id_entidade",
  "razao_social",
  "nome_fantasia",
  "cpf",
  "cnpj",
] as const;

export type ClientesField = (typeof CLIENTES_FIELDS)[number];
export type ObservedType =
  "null" | "boolean" | "string" | "number" | "object" | "array";
export type DocumentFormat = "DIGITS_ONLY" | "STANDARD_PUNCTUATED" | "OTHER";

export interface FieldStatistics {
  field: ClientesField;
  presentCount: number;
  missingCount: number;
  observedTypes: ObservedType[];
  nullCount: number;
  emptyStringCount: number;
  whitespaceOnlyCount: number;
  nonEmptyStringCount: number;
  minRawLength: number | null;
  maxRawLength: number | null;
  minTrimmedLength: number | null;
  maxTrimmedLength: number | null;
}

export interface DocumentStatistics {
  field: "cpf" | "cnpj";
  formatCounts: Record<DocumentFormat, number>;
  rawLengthDistribution: Record<string, number>;
}

export interface IdentityStatistics {
  field: "id" | "id_entidade";
  nonNullCount: number;
  distinctCount: number;
  duplicateOccurrences: number;
  duplicateGroups: number;
}

export type ObservedCardinality =
  | "OBSERVED_ONE_TO_ONE"
  | "OBSERVED_ONE_TO_MANY"
  | "OBSERVED_MANY_TO_ONE"
  | "OBSERVED_MANY_TO_MANY"
  | "INSUFFICIENT_PAIRED_VALUES";

export interface FieldProfile {
  recordsObserved: number;
  fields: FieldStatistics[];
  documents: DocumentStatistics[];
  cpfCnpjUsability: {
    cpfUsableCnpjNotUsable: number;
    cpfNotUsableCnpjUsable: number;
    cpfUsableCnpjUsable: number;
    cpfNotUsableCnpjNotUsable: number;
  };
  identities: IdentityStatistics[];
  idToIdEntidade: {
    pairedRecords: number;
    distinctPairs: number;
    idsWithMultipleEntityIds: number;
    entityIdsWithMultipleIds: number;
    maximumEntityIdsPerId: number;
    maximumIdsPerEntityId: number;
    observedCardinality: ObservedCardinality;
  };
}

export interface FieldProfiler {
  inspectRecord(record: unknown): void;
  getProfile(): FieldProfile;
}

interface MutableFieldStatistics extends FieldStatistics {
  types: Set<ObservedType>;
}

export function createFieldProfiler(): FieldProfiler {
  let recordsObserved = 0;
  const fields = new Map<ClientesField, MutableFieldStatistics>(
    CLIENTES_FIELDS.map((field) => [field, emptyField(field)]),
  );
  const documentCounts = new Map<"cpf" | "cnpj", DocumentStatistics>([
    ["cpf", emptyDocument("cpf")],
    ["cnpj", emptyDocument("cnpj")],
  ]);
  const identityCounts = new Map<"id" | "id_entidade", Map<unknown, number>>([
    ["id", new Map()],
    ["id_entidade", new Map()],
  ]);
  const entitiesById = new Map<unknown, Set<unknown>>();
  const idsByEntity = new Map<unknown, Set<unknown>>();
  let pairedRecords = 0;
  const usability = {
    cpfUsableCnpjNotUsable: 0,
    cpfNotUsableCnpjUsable: 0,
    cpfUsableCnpjUsable: 0,
    cpfNotUsableCnpjNotUsable: 0,
  };

  function inspectRecord(record: unknown): void {
    recordsObserved += 1;
    const object = isObject(record) ? record : {};
    for (const field of CLIENTES_FIELDS) {
      const stats = fields.get(field)!;
      if (!Object.prototype.hasOwnProperty.call(object, field)) {
        stats.missingCount += 1;
        continue;
      }
      stats.presentCount += 1;
      const value = object[field];
      const type = classify(value);
      stats.types.add(type);
      if (value === null) stats.nullCount += 1;
      if (typeof value === "string") inspectString(stats, value);
      if ((field === "cpf" || field === "cnpj") && usable(value))
        inspectDocument(documentCounts.get(field)!, value);
      if ((field === "id" || field === "id_entidade") && value !== null)
        increment(identityCounts.get(field)!, value);
    }

    const cpfUsable = usable(object.cpf);
    const cnpjUsable = usable(object.cnpj);
    if (cpfUsable && cnpjUsable) usability.cpfUsableCnpjUsable += 1;
    else if (cpfUsable) usability.cpfUsableCnpjNotUsable += 1;
    else if (cnpjUsable) usability.cpfNotUsableCnpjUsable += 1;
    else usability.cpfNotUsableCnpjNotUsable += 1;

    if (hasNonNull(object, "id") && hasNonNull(object, "id_entidade")) {
      pairedRecords += 1;
      addRelation(entitiesById, object.id, object.id_entidade);
      addRelation(idsByEntity, object.id_entidade, object.id);
    }
  }

  function getProfile(): FieldProfile {
    const idsWithMultipleEntityIds = countMultiple(entitiesById);
    const entityIdsWithMultipleIds = countMultiple(idsByEntity);
    return {
      recordsObserved,
      fields: CLIENTES_FIELDS.map((field) => {
        const { types, ...statistics } = fields.get(field)!;
        return { ...statistics, observedTypes: [...types].sort() };
      }),
      documents: (["cpf", "cnpj"] as const).map((field) => ({
        ...documentCounts.get(field)!,
        rawLengthDistribution: sortNumericKeys(
          documentCounts.get(field)!.rawLengthDistribution,
        ),
      })),
      cpfCnpjUsability: { ...usability },
      identities: (["id", "id_entidade"] as const).map((field) =>
        identityResult(field, identityCounts.get(field)!),
      ),
      idToIdEntidade: {
        pairedRecords,
        distinctPairs: sumSizes(entitiesById),
        idsWithMultipleEntityIds,
        entityIdsWithMultipleIds,
        maximumEntityIdsPerId: maximumSize(entitiesById),
        maximumIdsPerEntityId: maximumSize(idsByEntity),
        observedCardinality: cardinality(
          pairedRecords,
          idsWithMultipleEntityIds > 0,
          entityIdsWithMultipleIds > 0,
        ),
      },
    };
  }

  return { inspectRecord, getProfile };
}

function emptyField(field: ClientesField): MutableFieldStatistics {
  return {
    field,
    presentCount: 0,
    missingCount: 0,
    observedTypes: [],
    types: new Set(),
    nullCount: 0,
    emptyStringCount: 0,
    whitespaceOnlyCount: 0,
    nonEmptyStringCount: 0,
    minRawLength: null,
    maxRawLength: null,
    minTrimmedLength: null,
    maxTrimmedLength: null,
  };
}

function emptyDocument(field: "cpf" | "cnpj"): DocumentStatistics {
  return {
    field,
    formatCounts: { DIGITS_ONLY: 0, STANDARD_PUNCTUATED: 0, OTHER: 0 },
    rawLengthDistribution: {},
  };
}

function inspectString(stats: MutableFieldStatistics, value: string): void {
  const trimmed = value.trim();
  if (value.length === 0) stats.emptyStringCount += 1;
  else if (trimmed.length === 0) stats.whitespaceOnlyCount += 1;
  else stats.nonEmptyStringCount += 1;
  stats.minRawLength = minimum(stats.minRawLength, value.length);
  stats.maxRawLength = maximum(stats.maxRawLength, value.length);
  stats.minTrimmedLength = minimum(stats.minTrimmedLength, trimmed.length);
  stats.maxTrimmedLength = maximum(stats.maxTrimmedLength, trimmed.length);
}

function inspectDocument(stats: DocumentStatistics, value: string): void {
  const candidate = value.trim();
  const standard =
    stats.field === "cpf"
      ? /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(candidate)
      : /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(candidate);
  const format: DocumentFormat = /^\d+$/.test(candidate)
    ? "DIGITS_ONLY"
    : standard
      ? "STANDARD_PUNCTUATED"
      : "OTHER";
  stats.formatCounts[format] += 1;
  const length = String(value.length);
  stats.rawLengthDistribution[length] =
    (stats.rawLengthDistribution[length] ?? 0) + 1;
}

function classify(value: unknown): ObservedType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  throw new TypeError("Field profiler accepts JSON-compatible values only");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function usable(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasNonNull(object: Record<string, unknown>, field: string): boolean {
  return (
    Object.prototype.hasOwnProperty.call(object, field) &&
    object[field] !== null
  );
}

function increment(map: Map<unknown, number>, value: unknown): void {
  map.set(value, (map.get(value) ?? 0) + 1);
}

function addRelation(
  map: Map<unknown, Set<unknown>>,
  left: unknown,
  right: unknown,
): void {
  const related = map.get(left) ?? new Set<unknown>();
  related.add(right);
  map.set(left, related);
}

function identityResult(
  field: "id" | "id_entidade",
  counts: Map<unknown, number>,
): IdentityStatistics {
  const occurrences = [...counts.values()];
  return {
    field,
    nonNullCount: occurrences.reduce((sum, count) => sum + count, 0),
    distinctCount: counts.size,
    duplicateOccurrences: occurrences.reduce(
      (sum, count) => sum + Math.max(0, count - 1),
      0,
    ),
    duplicateGroups: occurrences.filter((count) => count > 1).length,
  };
}

function countMultiple(map: Map<unknown, Set<unknown>>): number {
  return [...map.values()].filter((values) => values.size > 1).length;
}

function maximumSize(map: Map<unknown, Set<unknown>>): number {
  return Math.max(0, ...[...map.values()].map((values) => values.size));
}

function sumSizes(map: Map<unknown, Set<unknown>>): number {
  return [...map.values()].reduce((sum, values) => sum + values.size, 0);
}

function cardinality(
  pairedRecords: number,
  oneToMany: boolean,
  manyToOne: boolean,
): ObservedCardinality {
  if (pairedRecords === 0) return "INSUFFICIENT_PAIRED_VALUES";
  if (oneToMany && manyToOne) return "OBSERVED_MANY_TO_MANY";
  if (oneToMany) return "OBSERVED_ONE_TO_MANY";
  if (manyToOne) return "OBSERVED_MANY_TO_ONE";
  return "OBSERVED_ONE_TO_ONE";
}

function minimum(current: number | null, value: number): number {
  return current === null ? value : Math.min(current, value);
}

function maximum(current: number | null, value: number): number {
  return current === null ? value : Math.max(current, value);
}

function sortNumericKeys(
  counts: Record<string, number>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counts).sort(
      ([left], [right]) => Number(left) - Number(right),
    ),
  );
}
