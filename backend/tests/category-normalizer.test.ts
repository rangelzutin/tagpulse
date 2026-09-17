import { describe, expect, it } from "vitest";
import {
  normalizeTagPlusCategory,
  type RawTagPlusCategory,
} from "../src/integrations/tagplus/categories/category-normalizer.js";

describe("TagPlus Category Normalizer", () => {
  it("normalizes a root category with categoria_mae as null", () => {
    const raw: RawTagPlusCategory = {
      id: 49,
      categoria_mae: null,
      descricao: "1 - NINECLOUDS",
      tipo: "P",
      localizacao: "",
      atributos: [],
    };

    const normalized = normalizeTagPlusCategory(raw);
    expect(normalized).toEqual({
      sourceId: "49",
      description: "1 - NINECLOUDS",
      parentSourceId: null,
      type: "P",
      location: null,
    });
  });

  it("normalizes a child category with categoria_mae object", () => {
    const raw: RawTagPlusCategory = {
      id: 50,
      categoria_mae: {
        id: 49,
        descricao: "1 - NINECLOUDS",
      },
      descricao: "Shapes Nineclouds",
      tipo: "P",
      localizacao: "A1",
    };

    const normalized = normalizeTagPlusCategory(raw);
    expect(normalized).toEqual({
      sourceId: "50",
      description: "Shapes Nineclouds",
      parentSourceId: "49",
      type: "P",
      location: "A1",
    });
  });

  it("normalizes a 3rd/4th level category (grandchild)", () => {
    const raw: RawTagPlusCategory = {
      id: 79,
      categoria_mae: {
        id: 50,
        descricao: "Shapes Nineclouds",
      },
      descricao: "Shape Nineclouds Collection",
      tipo: "P",
    };

    const normalized = normalizeTagPlusCategory(raw);
    expect(normalized).toEqual({
      sourceId: "79",
      description: "Shape Nineclouds Collection",
      parentSourceId: "50",
      type: "P",
      location: null,
    });
  });

  it("preserves exact descriptions without normalization", () => {
    const destrux = normalizeTagPlusCategory({
      id: 78,
      descricao: "2- DESTRUX",
      categoria_mae: null,
    });
    expect(destrux.description).toBe("2- DESTRUX");

    const desativados = normalizeTagPlusCategory({
      id: 48,
      descricao: "X - DESATIVADOS",
      categoria_mae: null,
    });
    expect(desativados.description).toBe("X - DESATIVADOS");
  });

  it("treats id_pai == 0 or string '0' as null root", () => {
    const raw: RawTagPlusCategory = {
      id: 100,
      categoria_mae: {
        id: 0,
        descricao: "",
      },
      descricao: "Raiz com zero",
    };

    const normalized = normalizeTagPlusCategory(raw);
    expect(normalized.parentSourceId).toBeNull();
  });

  it("throws error if id is missing or empty", () => {
    expect(() => normalizeTagPlusCategory({ descricao: "Sem id" })).toThrow(
      "Category missing required identifier: id",
    );
    expect(() =>
      normalizeTagPlusCategory({ id: "   ", descricao: "Id vazio" }),
    ).toThrow("Category id cannot be empty");
  });
});
