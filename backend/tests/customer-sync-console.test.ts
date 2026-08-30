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

  it("outputs only whitelisted persistence diagnostics", () => {
    const canary = "RAW_DB_CANARY customer@example.invalid source-123";
    const error = new CustomerSyncError(
      "CUSTOMER_SYNC_PERSISTENCE_ERROR",
      undefined,
      undefined,
      {
        persistenceStage: "ADDRESSES",
        persistenceOperation: "DELETE_MISSING_CHILDREN",
        persistenceErrorClass: "FOREIGN_KEY_CONSTRAINT",
      },
    );
    Object.assign(error, {
      rawMessage: canary,
      query: canary,
      payload: canary,
    });
    const output = formatCustomerSyncConsoleError(error);
    expect(JSON.parse(output)).toEqual({
      status: "ERROR",
      category: "CUSTOMER_SYNC_PERSISTENCE_ERROR",
      persistenceStage: "ADDRESSES",
      persistenceOperation: "DELETE_MISSING_CHILDREN",
      persistenceErrorClass: "FOREIGN_KEY_CONSTRAINT",
    });
    expect(output).not.toContain(canary);
    expect(output).not.toContain("rawMessage");
    expect(output).not.toContain("query");
    expect(output).not.toContain("payload");
  });

  it("rejects non-whitelisted persistence diagnostics", () => {
    const output = formatCustomerSyncConsoleError({
      category: "CUSTOMER_SYNC_PERSISTENCE_ERROR",
      persistenceDiagnostics: {
        persistenceStage: "CUSTOMER source-123",
        persistenceOperation: "RAW SQL",
        persistenceErrorClass: "private database message",
      },
    });
    expect(JSON.parse(output)).toEqual({
      status: "ERROR",
      category: "CUSTOMER_SYNC_PERSISTENCE_ERROR",
    });
  });
});
