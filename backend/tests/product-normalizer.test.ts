import { describe, expect, it } from "vitest";
import {
  normalizeExternalId,
  normalizeTagPlusProduct,
  ProductNormalizationError,
} from "../src/integrations/tagplus/products/product-normalizer.js";

describe("normalizeExternalId", () => {
  it("normalizes integer to string", () => {
    expect(normalizeExternalId(12345)).toBe("12345");
  });

  it("normalizes string trimming whitespace", () => {
    expect(normalizeExternalId("  PROD-001  ")).toBe("PROD-001");
  });

  it("returns null for null/undefined when not required", () => {
    expect(normalizeExternalId(null, false)).toBeNull();
    expect(normalizeExternalId(undefined, false)).toBeNull();
    expect(normalizeExternalId("", false)).toBeNull();
  });

  it("throws for missing/empty when required", () => {
    expect(() => normalizeExternalId(null, true, "$.id")).toThrow(
      ProductNormalizationError,
    );
    expect(() => normalizeExternalId("", true, "$.id")).toThrow(
      ProductNormalizationError,
    );
  });

  it("throws for non-safe integer or object", () => {
    expect(() => normalizeExternalId({}, false)).toThrow(
      ProductNormalizationError,
    );
    expect(() => normalizeExternalId([], false)).toThrow(
      ProductNormalizationError,
    );
    expect(() => normalizeExternalId(NaN, false)).toThrow(
      ProductNormalizationError,
    );
  });
});

describe("normalizeTagPlusProduct", () => {
  const minimalValid = {
    id: 1001,
  };

  it("normalizes minimal product payload", () => {
    const result = normalizeTagPlusProduct(minimalValid);
    expect(result.sourceId).toBe("1001");
    expect(result.code).toBeNull();
    expect(result.description).toBeNull();
    expect(result.active).toBeNull();
    expect(result.retailSalePrice).toBeNull();
    expect(result.stockQuantity).toBeNull();
    expect(result.categorySourceId).toBeNull();
    expect(result.parentSourceId).toBeNull();
  });

  it("normalizes a complete expanded product payload", () => {
    const payload = {
      id: 555,
      codigo: "SKU-99",
      codigo_externo: "EXT-88",
      codigo_barras: "7891234567890",
      codigo_barras_tributavel: "7891234567890",
      codigo_grade: "001",
      descricao: "Colchão Queen Size",
      descricao_curta: "Colchão Queen",
      ativo: true,
      movimentado: true,
      comercializavel: true,
      vendido_separado: true,
      tipo: "N",
      finalidade: "00",
      marca: "Nineclouds",
      id_pai: 444,
      categoria: {
        id: 12,
        descricao: "Colchões",
      },
      departamento: {
        id: 3,
        descricao: "Quarto",
      },
      valor_venda_varejo: 1599.9,
      valor_oferta: 1499.0,
      custo_utilizado: 800.0,
      custo_medio: 785.5,
      custo_outras_despesas: 14.5,
      qtd_revenda: 25,
      estoque: {
        qtd_revenda: 25,
        qtd_min: 5,
        qtd_max: 50,
      },
      unidade_saida: {
        id: 1,
        sigla: "UN",
        descricao: "Unidade",
        fracionado: false,
      },
      data_criacao: "2026-01-15 10:30:00",
      data_alteracao: "2026-08-20T14:22:10-03:00",
    };

    const result = normalizeTagPlusProduct(payload);
    expect(result.sourceId).toBe("555");
    expect(result.code).toBe("SKU-99");
    expect(result.externalCode).toBe("EXT-88");
    expect(result.barcode).toBe("7891234567890");
    expect(result.taxableBarcode).toBe("7891234567890");
    expect(result.gradeCode).toBe("001");
    expect(result.description).toBe("Colchão Queen Size");
    expect(result.shortDescription).toBe("Colchão Queen");
    expect(result.active).toBe(true);
    expect(result.moved).toBe(true);
    expect(result.commercializable).toBe(true);
    expect(result.soldSeparately).toBe(true);
    expect(result.type).toBe("N");
    expect(result.purpose).toBe("00");
    expect(result.brand).toBe("Nineclouds");
    expect(result.parentSourceId).toBe("444");
    expect(result.categorySourceId).toBe("12");
    expect(result.categoryDescription).toBe("Colchões");
    expect(result.departmentSourceId).toBe("3");
    expect(result.departmentDescription).toBe("Quarto");
    expect(result.retailSalePrice).toBe(1599.9);
    expect(result.offerPrice).toBe(1499.0);
    expect(result.effectiveCost).toBe(800.0);
    expect(result.averageCost).toBe(785.5);
    expect(result.otherExpensesCost).toBe(14.5);
    expect(result.stockQuantity).toBe(25);
    expect(result.stockMinQuantity).toBe(5);
    expect(result.stockMaxQuantity).toBe(50);
    expect(result.outputUnitSourceId).toBe("1");
    expect(result.outputUnitAbbreviation).toBe("UN");
    expect(result.outputUnitDescription).toBe("Unidade");
    expect(result.outputUnitFractioned).toBe(false);
    expect(result.sourceCreatedAt).toBeInstanceOf(Date);
    expect(result.sourceUpdatedAt).toBeInstanceOf(Date);
  });

  it("handles string numbers correctly", () => {
    const payload = {
      id: 200,
      valor_venda_varejo: "123.45",
      custo_utilizado: "50",
      qtd_revenda: "10",
    };
    const result = normalizeTagPlusProduct(payload);
    expect(result.retailSalePrice).toBe(123.45);
    expect(result.effectiveCost).toBe(50);
    expect(result.stockQuantity).toBe(10);
  });

  it("falls back to top-level qtd_revenda when estoque is missing", () => {
    const payload = {
      id: 201,
      qtd_revenda: 15,
    };
    const result = normalizeTagPlusProduct(payload);
    expect(result.stockQuantity).toBe(15);
    expect(result.stockMinQuantity).toBeNull();
    expect(result.stockMaxQuantity).toBeNull();
  });

  it("prefers estoque.qtd_revenda when present", () => {
    const payload = {
      id: 202,
      qtd_revenda: 5,
      estoque: {
        qtd_revenda: 20,
        qtd_min: 2,
        qtd_max: 30,
      },
    };
    const result = normalizeTagPlusProduct(payload);
    expect(result.stockQuantity).toBe(20);
    expect(result.stockMinQuantity).toBe(2);
    expect(result.stockMaxQuantity).toBe(30);
  });

  it("rejects non-object root payloads", () => {
    expect(() => normalizeTagPlusProduct(null)).toThrow(
      ProductNormalizationError,
    );
    expect(() => normalizeTagPlusProduct([])).toThrow(
      ProductNormalizationError,
    );
    expect(() => normalizeTagPlusProduct("invalid")).toThrow(
      ProductNormalizationError,
    );
  });

  it("rejects invalid dates with PRODUCT_INVALID_DATE", () => {
    expect(() =>
      normalizeTagPlusProduct({ id: 1, data_criacao: "not-a-date" }),
    ).toThrow(ProductNormalizationError);
    try {
      normalizeTagPlusProduct({ id: 1, data_criacao: "not-a-date" });
    } catch (err) {
      expect((err as ProductNormalizationError).category).toBe(
        "PRODUCT_INVALID_DATE",
      );
      expect((err as ProductNormalizationError).diagnostics?.path).toBe(
        "$.data_criacao",
      );
    }
  });

  it("rejects invalid numeric values with PRODUCT_INVALID_TYPE", () => {
    expect(() =>
      normalizeTagPlusProduct({ id: 1, valor_venda_varejo: "invalid-number" }),
    ).toThrow(ProductNormalizationError);
    try {
      normalizeTagPlusProduct({ id: 1, valor_venda_varejo: "invalid-number" });
    } catch (err) {
      expect((err as ProductNormalizationError).category).toBe(
        "PRODUCT_INVALID_TYPE",
      );
    }
  });
});
