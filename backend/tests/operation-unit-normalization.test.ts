import { describe, it, expect } from "vitest";
import { OperationUnit } from "@prisma/client";
import {
  buildOperationUnitFilter,
  buildSaleOperationUnitFilter,
  parseOperationUnit,
} from "../src/shared/filters/filter-options.js";

describe("Operation Unit Normalization & Defensive Filters", () => {
  it("correctly parses valid operation units", () => {
    expect(parseOperationUnit(undefined)).toEqual({ valid: true });
    expect(parseOperationUnit(null)).toEqual({ valid: true });
    expect(parseOperationUnit("")).toEqual({ valid: true });
    expect(parseOperationUnit("NINECLOUDS")).toEqual({
      valid: true,
      value: OperationUnit.NINECLOUDS,
    });
    expect(parseOperationUnit("HUSTLER")).toEqual({
      valid: true,
      value: OperationUnit.HUSTLER,
    });
    expect(parseOperationUnit("INVALID_UNIT").valid).toBe(false);
  });

  it("builds defensive filter for NINECLOUDS including both explicit NINECLOUDS and legacy NULL", () => {
    const filter = buildOperationUnitFilter(OperationUnit.NINECLOUDS);
    expect(filter).toEqual({
      OR: [
        { operationUnit: OperationUnit.NINECLOUDS },
        { operationUnit: null },
      ],
    });

    const stringFilter = buildOperationUnitFilter("NINECLOUDS");
    expect(stringFilter).toEqual({
      OR: [
        { operationUnit: OperationUnit.NINECLOUDS },
        { operationUnit: null },
      ],
    });
  });

  it("builds strict filter for HUSTLER without matching NULL", () => {
    const filter = buildOperationUnitFilter(OperationUnit.HUSTLER);
    expect(filter).toEqual({ operationUnit: OperationUnit.HUSTLER });

    const stringFilter = buildOperationUnitFilter("HUSTLER");
    expect(stringFilter).toEqual({ operationUnit: OperationUnit.HUSTLER });
  });

  it("returns undefined when operation unit is not provided (Consolidated scope)", () => {
    expect(buildOperationUnitFilter(undefined)).toBeUndefined();
  });

  it("builds defensive filter for related Sale with NINECLOUDS including NULL", () => {
    const saleFilter = buildSaleOperationUnitFilter(OperationUnit.NINECLOUDS);
    expect(saleFilter).toEqual({
      sale: {
        OR: [
          { operationUnit: OperationUnit.NINECLOUDS },
          { operationUnit: null },
        ],
      },
    });
  });

  it("builds strict filter for related Sale with HUSTLER", () => {
    const saleFilter = buildSaleOperationUnitFilter(OperationUnit.HUSTLER);
    expect(saleFilter).toEqual({
      sale: {
        operationUnit: OperationUnit.HUSTLER,
      },
    });
  });

  it("returns undefined for related Sale when unit is undefined", () => {
    expect(buildSaleOperationUnitFilter(undefined)).toBeUndefined();
  });
});
