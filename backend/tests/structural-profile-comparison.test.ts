import { describe, expect, it } from "vitest";
import {
  compareStructuralProfiles,
  summarizeStructuralProfile,
  type DiscoveryMode,
  type SafeStructuralSummary,
} from "../src/integrations/tagplus/inspection/structural-profile-comparison.js";
import { createStructuralProfiler } from "../src/integrations/tagplus/inspection/structural-profiler.js";

function profile(record: unknown): SafeStructuralSummary {
  const profiler = createStructuralProfiler();
  profiler.inspectRecord(record, 1);
  return summarizeStructuralProfile(profiler.getProfile());
}

function profiles(
  defaultRecord: unknown,
  fieldsRecord: unknown,
  itemRecord: unknown,
): Record<DiscoveryMode, SafeStructuralSummary> {
  return {
    COLLECTION_DEFAULT: profile(defaultRecord),
    COLLECTION_FIELDS_ALL: profile(fieldsRecord),
    ITEM_DETAIL: profile(itemRecord),
  };
}

describe("structural profile comparison", () => {
  it("reports equal structures as common paths", () => {
    const comparison = compareStructuralProfiles(
      profiles(
        { id: 1, name: "a" },
        { id: 2, name: "b" },
        { id: 3, name: "c" },
      ),
    );
    expect(comparison.pathsCommonToAll).toEqual(["$", "$.id", "$.name"]);
    expect(comparison.pathsOnlyInDefault).toEqual([]);
    expect(comparison.pathsOnlyInFieldsAll).toEqual([]);
    expect(comparison.pathsOnlyInItem).toEqual([]);
  });

  it("separates fields-all and item-only paths deterministically", () => {
    const comparison = compareStructuralProfiles(
      profiles(
        { id: 1 },
        { z_field: true, id: 1, email: "x" },
        { contatos: [{ tipo: "x" }], id: 1, email: "x" },
      ),
    );
    expect(comparison.pathsOnlyInFieldsAll).toEqual(["$.z_field"]);
    expect(comparison.pathsOnlyInItem).toEqual([
      "$.contatos",
      "$.contatos[]",
      "$.contatos[].tipo",
    ]);
    expect(comparison.pathsCommonToAll).toEqual(["$", "$.id"]);
  });

  it("reports nested objects, arrays, maximum depth and changed types", () => {
    const comparison = compareStructuralProfiles(
      profiles(
        { id: 1, value: 1 },
        { id: 1, value: "one", endereco: { cidade: "x" } },
        { id: 1, value: false, contatos: [{ tipo: "x" }] },
      ),
    );
    expect(comparison.typesChangedBetweenModes).toEqual([
      {
        path: "$.value",
        typesByMode: {
          COLLECTION_DEFAULT: ["number"],
          COLLECTION_FIELDS_ALL: ["string"],
          ITEM_DETAIL: ["boolean"],
        },
      },
    ]);
    expect(comparison.maximumDepthByMode).toEqual({
      COLLECTION_DEFAULT: 1,
      COLLECTION_FIELDS_ALL: 2,
      ITEM_DETAIL: 3,
    });
    expect(comparison.arrayPathsByMode.ITEM_DETAIL).toEqual(["$.contatos"]);
    expect(comparison.objectPathsByMode.COLLECTION_FIELDS_ALL).toEqual([
      "$",
      "$.endereco",
    ]);
  });
});
