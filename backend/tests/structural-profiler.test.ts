import { describe, expect, it } from "vitest";
import { createStructuralProfiler } from "../src/integrations/tagplus/inspection/structural-profiler.js";

function path(
  profile: ReturnType<
    ReturnType<typeof createStructuralProfiler>["getProfile"]
  >,
  name: string,
) {
  const result = profile.paths.find((entry) => entry.path === name);
  expect(result, `missing path ${name}`).toBeDefined();
  return result!;
}

describe("structural profiler", () => {
  it("walks scalar and nested paths with deterministic depth and parents", () => {
    const profiler = createStructuralProfiler();
    profiler.inspectRecord({ a: 1, nested: { b: "x" } }, 1);
    const profile = profiler.getProfile();

    expect(path(profile, "$")).toMatchObject({
      depth: 0,
      parentPath: null,
      observedTypes: ["object"],
    });
    expect(path(profile, "$.a")).toMatchObject({
      depth: 1,
      parentPath: "$",
      typeCounts: { number: 1 },
    });
    expect(path(profile, "$.nested")).toMatchObject({
      depth: 1,
      parentPath: "$",
      typeCounts: { object: 1 },
    });
    expect(path(profile, "$.nested.b")).toMatchObject({
      depth: 2,
      parentPath: "$.nested",
      typeCounts: { string: 1 },
    });
    expect(profile.maximumDepthObserved).toBe(2);
  });

  it("distinguishes null, missing, empty strings, and multiple JSON types", () => {
    const profiler = createStructuralProfiler();
    profiler.inspectRecord({ value: 1, empty: "" }, 1);
    profiler.inspectRecord({ value: "1" }, 1);
    profiler.inspectRecord({ value: null }, 1);
    profiler.inspectRecord({}, 1);
    const value = path(profiler.getProfile(), "$.value");

    expect(value).toMatchObject({
      presentRecordCount: 3,
      missingRecordCount: 1,
      nullRecordCount: 1,
      typeCounts: { null: 1, number: 1, string: 1 },
      multiType: true,
    });
    expect(path(profiler.getProfile(), "$.empty")).toMatchObject({
      emptyStringCount: 1,
      missingRecordCount: 3,
    });
  });

  it("distinguishes unavailable parents from missing children in eligible parents", () => {
    const profiler = createStructuralProfiler();
    profiler.inspectRecord({}, 1);
    profiler.inspectRecord({ parent: {} }, 1);
    profiler.inspectRecord({ parent: { child: 1 } }, 1);

    expect(path(profiler.getProfile(), "$.parent.child")).toMatchObject({
      presentRecordCount: 1,
      missingRecordCount: 2,
      parentEligibleCount: 2,
      missingWithinEligibleParent: 1,
    });
  });

  it("profiles empty, null, non-empty, and heterogeneous arrays without indices", () => {
    const profiler = createStructuralProfiler();
    profiler.inspectRecord({ items: [] }, 1);
    profiler.inspectRecord({ items: null }, 1);
    profiler.inspectRecord({ items: [{ x: 1 }, "text", null, 123] }, 1);
    const profile = profiler.getProfile();
    const items = profile.arrays.find((entry) => entry.path === "$.items");

    expect(items).toEqual({
      path: "$.items",
      arrayPresentRecords: 2,
      nullArrayRecords: 1,
      emptyArrayRecords: 1,
      nonEmptyArrayRecords: 1,
      totalElementsObserved: 4,
      elementTypeCounts: { null: 1, number: 1, object: 1, string: 1 },
      observedElementTypes: ["null", "number", "object", "string"],
    });
    expect(path(profile, "$.items[]")).toMatchObject({
      depth: 2,
      occurrenceCount: 4,
      presentRecordCount: 1,
    });
    expect(path(profile, "$.items[].x")).toMatchObject({
      depth: 3,
      parentPath: "$.items[]",
    });
    expect(JSON.stringify(profile)).not.toMatch(/\[\d+\]/);
  });

  it("separates record presence, element presence, and object-element eligibility", () => {
    const profiler = createStructuralProfiler();
    profiler.inspectRecord(
      { items: [{ x: 1 }, { x: 2 }, {}, "primitive", { y: true }] },
      1,
    );
    const x = path(profiler.getProfile(), "$.items[].x");

    expect(x).toMatchObject({
      presentRecordCount: 1,
      occurrenceCount: 2,
      parentEligibleCount: 4,
      missingWithinEligibleParent: 2,
    });
  });

  it("captures multiple object shapes inside arrays and stable anonymous shapes", () => {
    const first = createStructuralProfiler();
    first.inspectRecord({ items: [{ x: 1 }, { x: 2, y: true }] }, 1);
    first.inspectRecord({ items: [{ x: 9 }] }, 1);
    const firstProfile = first.getProfile();

    const second = createStructuralProfiler();
    second.inspectRecord({ items: [{ x: 100 }, { x: 200, y: false }] }, 1);
    second.inspectRecord({ items: [{ x: 300 }] }, 1);
    const secondProfile = second.getProfile();

    expect(firstProfile.distinctStructuralShapes).toBe(2);
    expect(firstProfile.structuralShapes.map((shape) => shape.shapeId)).toEqual(
      secondProfile.structuralShapes.map((shape) => shape.shapeId),
    );
    expect(JSON.stringify(firstProfile.structuralShapes)).not.toContain("100");
  });

  it("reports new paths, new types, and array-element types without double counting", () => {
    const profiler = createStructuralProfiler();
    const first = profiler.inspectRecord({ value: 1, items: [1] }, 1);
    const second = profiler.inspectRecord({ value: "one", items: ["one"] }, 2);

    expect(first.newPaths).toBeGreaterThan(0);
    expect(second.noveltyEvents).toEqual([
      { kind: "NEW_TYPE_FOR_PATH", record: 2, page: 2 },
      { kind: "NEW_ARRAY_ELEMENT_TYPE", record: 2, page: 2 },
    ]);
    expect(second.newTypeEvents).toBe(1);
    expect(second.newArrayElementTypeEvents).toBe(1);
  });

  it("records the saturation boundary and late novelty without erasing the first boundary", () => {
    const profiler = createStructuralProfiler({
      minimumRecords: 2,
      noveltyFreeWindow: 2,
    });
    profiler.inspectRecord({ a: 1 }, 1);
    profiler.inspectRecord({ a: 2 }, 1);
    profiler.inspectRecord({ a: 3 }, 2);
    expect(profiler.getProfile().saturation).toMatchObject({
      saturationReached: true,
      saturationReachedAtRecord: 3,
      saturationReachedAtPage: 2,
    });

    profiler.inspectRecord({ a: 4, late: true }, 3);
    expect(profiler.getProfile().saturation).toMatchObject({
      saturationReachedAtRecord: 3,
      lastNoveltyAtRecord: 4,
      lastNoveltyAtPage: 3,
      lateStructuralNoveltyCount: 1,
      recordsSinceLastNovelty: 0,
    });
  });

  it("normalizes dynamic keys before every serializable aggregate", () => {
    const profiler = createStructuralProfiler();
    profiler.inspectRecord(
      {
        map: {
          "fake-person@example.invalid": { x: 1 },
          ACCOUNT_9F42_X: { x: 2 },
          USR_71_KQ: { x: 3 },
        },
      },
      1,
    );
    const serialized = JSON.stringify(profiler.getProfile());

    expect(serialized).toContain("$.map.<dynamic-key>");
    expect(serialized).toContain("$.map.<dynamic-key>.x");
    expect(serialized).not.toContain("fake-person@example.invalid");
    expect(serialized).not.toContain("ACCOUNT_9F42_X");
    expect(serialized).not.toContain("USR_71_KQ");
  });

  it("never serializes synthetic privacy canary values", () => {
    const profiler = createStructuralProfiler();
    profiler.inspectRecord(
      {
        name: "SENSITIVE_CANARY_9F42",
        email: "fake-person@example.invalid",
        phone: "+55-00-00000-0000",
        token: "synthetic-access-token",
        header: "Authorization: Bearer synthetic-token",
      },
      1,
    );
    const serialized = JSON.stringify(profiler.getProfile());
    for (const canary of [
      "SENSITIVE_CANARY_9F42",
      "fake-person@example.invalid",
      "+55-00-00000-0000",
      "synthetic-access-token",
      "Authorization: Bearer synthetic-token",
    ]) {
      expect(serialized).not.toContain(canary);
    }
  });
});
