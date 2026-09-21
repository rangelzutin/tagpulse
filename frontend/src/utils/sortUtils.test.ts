import { describe, it, expect } from "vitest";
import {
  compareNullsLast,
  compareNumericNullsLast,
  compareStringNullsLast,
} from "./sortUtils";

describe("sortUtils - compareNullsLast", () => {
  it("places null at the end in DESC sort", () => {
    const data = [10, null, 50, null, 20];
    const sorted = [...data].sort((a, b) => compareNumericNullsLast(a, b, "desc"));
    expect(sorted).toEqual([50, 20, 10, null, null]);
  });

  it("places null at the end in ASC sort", () => {
    const data = [10, null, 50, null, 20];
    const sorted = [...data].sort((a, b) => compareNumericNullsLast(a, b, "asc"));
    expect(sorted).toEqual([10, 20, 50, null, null]);
  });

  it("handles undefined the same as null (at the end)", () => {
    const data = [undefined, 15, null, 5];
    const sortedDesc = [...data].sort((a, b) => compareNumericNullsLast(a, b, "desc"));
    expect(sortedDesc.slice(0, 2)).toEqual([15, 5]);
    expect(sortedDesc.slice(2)).toEqual(expect.arrayContaining([null, undefined]));

    const sortedAsc = [...data].sort((a, b) => compareNumericNullsLast(a, b, "asc"));
    expect(sortedAsc.slice(0, 2)).toEqual([5, 15]);
    expect(sortedAsc.slice(2)).toEqual(expect.arrayContaining([null, undefined]));
  });


  it("does not treat null or undefined as zero", () => {
    const data = [0, null, -10, 10];
    const sortedDesc = [...data].sort((a, b) => compareNumericNullsLast(a, b, "desc"));
    expect(sortedDesc).toEqual([10, 0, -10, null]);

    const sortedAsc = [...data].sort((a, b) => compareNumericNullsLast(a, b, "asc"));
    expect(sortedAsc).toEqual([-10, 0, 10, null]);
  });

  it("correctly sorts strings with nulls at the end", () => {
    const data = ["Banana", null, "Maçã", null, "Abacaxi"];
    const sortedAsc = [...data].sort((a, b) => compareStringNullsLast(a, b, "asc"));
    expect(sortedAsc).toEqual(["Abacaxi", "Banana", "Maçã", null, null]);

    const sortedDesc = [...data].sort((a, b) => compareStringNullsLast(a, b, "desc"));
    expect(sortedDesc).toEqual(["Maçã", "Banana", "Abacaxi", null, null]);
  });
});
