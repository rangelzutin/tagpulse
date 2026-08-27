import { describe, expect, it } from "vitest";
import { createFieldProfiler } from "../src/integrations/tagplus/inspection/field-profiler.js";

function field(
  profile: ReturnType<ReturnType<typeof createFieldProfiler>["getProfile"]>,
  name: string,
) {
  return profile.fields.find((entry) => entry.field === name)!;
}

describe("field profiler", () => {
  it("keeps missing, null, empty, whitespace and non-empty values distinct", () => {
    const profiler = createFieldProfiler();
    profiler.inspectRecord({ razao_social: null });
    profiler.inspectRecord({ razao_social: "" });
    profiler.inspectRecord({ razao_social: "  " });
    profiler.inspectRecord({ razao_social: " name " });
    profiler.inspectRecord({ razao_social: 7 });
    profiler.inspectRecord({});

    expect(field(profiler.getProfile(), "razao_social")).toMatchObject({
      presentCount: 5,
      missingCount: 1,
      observedTypes: ["null", "number", "string"],
      nullCount: 1,
      emptyStringCount: 1,
      whitespaceOnlyCount: 1,
      nonEmptyStringCount: 1,
      minRawLength: 0,
      maxRawLength: 6,
      minTrimmedLength: 0,
      maxTrimmedLength: 4,
    });
  });

  it("classifies CPF and CNPJ formats and aggregates raw lengths", () => {
    const profiler = createFieldProfiler();
    profiler.inspectRecord({ cpf: "12345678901", cnpj: "11222333000144" });
    profiler.inspectRecord({
      cpf: "123.456.789-01",
      cnpj: "11.222.333/0001-44",
    });
    profiler.inspectRecord({ cpf: "CPF-OTHER", cnpj: "CNPJ-OTHER" });
    profiler.inspectRecord({ cpf: " ", cnpj: "" });
    const profile = profiler.getProfile();

    expect(profile.documents).toEqual([
      {
        field: "cpf",
        formatCounts: {
          DIGITS_ONLY: 1,
          STANDARD_PUNCTUATED: 1,
          OTHER: 1,
        },
        rawLengthDistribution: { "9": 1, "11": 1, "14": 1 },
      },
      {
        field: "cnpj",
        formatCounts: {
          DIGITS_ONLY: 1,
          STANDARD_PUNCTUATED: 1,
          OTHER: 1,
        },
        rawLengthDistribution: { "10": 1, "14": 1, "18": 1 },
      },
    ]);
  });

  it("covers all CPF/CNPJ usability combinations", () => {
    const profiler = createFieldProfiler();
    profiler.inspectRecord({ cpf: "1", cnpj: null });
    profiler.inspectRecord({ cpf: "", cnpj: "2" });
    profiler.inspectRecord({ cpf: " 3 ", cnpj: " 4 " });
    profiler.inspectRecord({ cpf: " ", cnpj: "" });
    expect(profiler.getProfile().cpfCnpjUsability).toEqual({
      cpfUsableCnpjNotUsable: 1,
      cpfNotUsableCnpjUsable: 1,
      cpfUsableCnpjUsable: 1,
      cpfNotUsableCnpjNotUsable: 1,
    });
  });

  it.each([
    [
      "all unique",
      [
        { id: 1, id_entidade: "a" },
        { id: 2, id_entidade: "b" },
      ],
      [2, 0, 0],
    ],
    [
      "simple duplicate",
      [
        { id: 1, id_entidade: "a" },
        { id: 1, id_entidade: "a" },
      ],
      [1, 1, 1],
    ],
    [
      "multiple duplicate groups",
      [{ id: 1 }, { id: 1 }, { id: 2 }, { id: 2 }, { id: 2 }],
      [2, 3, 2],
    ],
    ["null and missing", [{ id: null }, {}], [0, 0, 0]],
  ] as const)(
    "profiles identity uniqueness: %s",
    (_name, records, expected) => {
      const profiler = createFieldProfiler();
      records.forEach((record) => profiler.inspectRecord(record));
      const identity = profiler.getProfile().identities[0]!;
      expect([
        identity.distinctCount,
        identity.duplicateOccurrences,
        identity.duplicateGroups,
      ]).toEqual(expected);
    },
  );

  it.each([
    [
      "OBSERVED_ONE_TO_ONE",
      [
        [1, "a"],
        [2, "b"],
      ],
    ],
    [
      "OBSERVED_ONE_TO_MANY",
      [
        [1, "a"],
        [1, "b"],
      ],
    ],
    [
      "OBSERVED_MANY_TO_ONE",
      [
        [1, "a"],
        [2, "a"],
      ],
    ],
    [
      "OBSERVED_MANY_TO_MANY",
      [
        [1, "a"],
        [1, "b"],
        [2, "a"],
      ],
    ],
  ] as const)("classifies cardinality as %s", (expected, pairs) => {
    const profiler = createFieldProfiler();
    pairs.forEach(([id, id_entidade]) =>
      profiler.inspectRecord({ id, id_entidade }),
    );
    expect(profiler.getProfile().idToIdEntidade.observedCardinality).toBe(
      expected,
    );
  });

  it("never serializes customer, identity, credential or document canaries", () => {
    const profiler = createFieldProfiler();
    const canaries = [
      "CLIENT_SECRET_CANARY",
      "12345678901",
      "11222333000144",
      "ENTITY_ID_CANARY",
    ];
    profiler.inspectRecord({
      id: "CLIENT_SECRET_CANARY",
      id_entidade: "ENTITY_ID_CANARY",
      razao_social: "CLIENT_SECRET_CANARY",
      nome_fantasia: "ENTITY_ID_CANARY",
      cpf: "12345678901",
      cnpj: "11222333000144",
    });
    const serialized = JSON.stringify(profiler.getProfile());
    canaries.forEach((canary) => expect(serialized).not.toContain(canary));
  });
});
