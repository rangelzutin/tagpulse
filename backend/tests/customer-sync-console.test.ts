import { describe, expect, it } from "vitest";
import { formatCustomerSyncConsoleError } from "../src/modules/customers/customer-sync-console.js";
import { CustomerSyncError } from "../src/modules/customers/customer-full-sync.js";

describe("customer sync console diagnostics", () => {
  it("outputs only whitelisted structural date metadata", () => {
    const unsafeValue = "synthetic-private-source-value";
    const error = new CustomerSyncError(
      "CUSTOMER_SYNC_NORMALIZATION_ERROR",
      {
        path: "$.data_nascimento",
        observedType: "string",
        expectedFormat: "YYYY-MM-DD",
        dateFormatClass: "INVALID_OR_UNCLASSIFIED",
        dateStructuralPattern: "####/##/## ##:##:##",
      },
      "CUSTOMER_INVALID_DATE",
    );
    Object.assign(error, {
      value: unsafeValue,
      payload: { value: unsafeValue },
    });

    const output = formatCustomerSyncConsoleError(error);

    expect(JSON.parse(output)).toEqual({
      status: "ERROR",
      category: "CUSTOMER_SYNC_NORMALIZATION_ERROR",
      safeNormalizationCategory: "CUSTOMER_INVALID_DATE",
      path: "$.data_nascimento",
      observedType: "string",
      expectedFormat: "YYYY-MM-DD",
      dateFormatClass: "INVALID_OR_UNCLASSIFIED",
      dateStructuralPattern: "####/##/## ##:##:##",
    });
    expect(output).not.toContain(unsafeValue);
    expect(output).not.toContain("payload");
    expect(output).not.toContain("value");
  });

  it("rejects a structural pattern containing raw digits or letters", () => {
    const output = formatCustomerSyncConsoleError(
      new CustomerSyncError(
        "CUSTOMER_SYNC_NORMALIZATION_ERROR",
        {
          path: "$.data_cadastro",
          observedType: "string",
          expectedFormat: "timezone-qualified-datetime",
          dateFormatClass: "INVALID_OR_UNCLASSIFIED",
          dateStructuralPattern: "2099/AA/private",
        },
        "CUSTOMER_INVALID_DATE",
      ),
    );
    expect(JSON.parse(output)).not.toHaveProperty("dateStructuralPattern");
    expect(output).not.toContain("2099");
    expect(output).not.toContain("private");
  });
});
