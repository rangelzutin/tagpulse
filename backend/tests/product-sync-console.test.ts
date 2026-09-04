import { describe, expect, it } from "vitest";
import { formatProductSyncConsoleError } from "../src/modules/products/product-sync-console.js";
import { ProductSyncError } from "../src/modules/products/product-full-sync.js";

describe("product sync console diagnostics", () => {
  it("outputs safe error category and structural diagnostics without leaking unsafe values", () => {
    const unsafeValue = "sensitive-price-or-barcode";
    const error = new ProductSyncError(
      "PRODUCT_SYNC_NORMALIZATION_ERROR",
      {
        path: "$.valor_venda_varejo",
        observedType: "string",
      },
      "PRODUCT_INVALID_TYPE",
    );
    Object.assign(error, {
      value: unsafeValue,
      rawPayload: { secret: unsafeValue },
    });

    const output = formatProductSyncConsoleError(error);
    const parsed = JSON.parse(output);

    expect(parsed).toEqual({
      status: "ERROR",
      category: "PRODUCT_SYNC_NORMALIZATION_ERROR",
      safeNormalizationCategory: "PRODUCT_INVALID_TYPE",
      path: "$.valor_venda_varejo",
      observedType: "string",
    });
    expect(output).not.toContain(unsafeValue);
    expect(output).not.toContain("rawPayload");
    expect(output).not.toContain("secret");
  });

  it("formats persistence diagnostics safely", () => {
    const error = new ProductSyncError(
      "PRODUCT_SYNC_PERSISTENCE_ERROR",
      undefined,
      undefined,
      {
        persistenceStage: "PRODUCT",
        persistenceOperation: "UPSERT",
        persistenceErrorClass: "UNIQUE_CONSTRAINT",
      },
    );
    const output = formatProductSyncConsoleError(error);
    const parsed = JSON.parse(output);
    expect(parsed).toMatchObject({
      status: "ERROR",
      category: "PRODUCT_SYNC_PERSISTENCE_ERROR",
      persistenceStage: "PRODUCT",
      persistenceOperation: "UPSERT",
      persistenceErrorClass: "UNIQUE_CONSTRAINT",
    });
  });

  it("falls back to PRODUCT_SYNC_ERROR for arbitrary or unclassified error categories", () => {
    const output = formatProductSyncConsoleError(new Error("unexpected crash"));
    const parsed = JSON.parse(output);
    expect(parsed).toEqual({
      status: "ERROR",
      category: "PRODUCT_SYNC_ERROR",
    });
  });
});
