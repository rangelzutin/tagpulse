import { describe, expect, it } from "vitest";
import {
  createDateStructuralPattern,
  CustomerNormalizationError,
  normalizeExternalId,
  normalizeTagPlusCustomer,
} from "../src/integrations/tagplus/customers/customer-normalizer.js";

describe("TagPlus customer normalizer", () => {
  it("normalizes only numeric or string identifiers", () => {
    expect(normalizeExternalId(123)).toBe("123");
    expect(normalizeExternalId("123")).toBe("123");
    expect(normalizeExternalId(null)).toBeNull();
    expectCategory(
      () => normalizeExternalId(true, true),
      "CUSTOMER_INVALID_SOURCE_ID",
    );
    expectCategory(
      () => normalizeTagPlusCustomer({}),
      "CUSTOMER_INVALID_SOURCE_ID",
    );
  });

  it("preserves source strings including empty and whitespace", () => {
    const result = normalizeTagPlusCustomer({
      id: 1,
      codigo: "",
      codigo_externo: "   ",
      nome_fantasia: null,
      razao_social: "Synthetic Customer",
    });
    expect(result).toMatchObject({
      code: "",
      externalCode: "   ",
      tradeName: null,
      legalName: "Synthetic Customer",
    });
  });

  it("accepts booleans and rejects coercion", () => {
    expect(
      normalizeTagPlusCustomer({ id: 1, ativo: true, recebe_email: false }),
    ).toMatchObject({
      sourceActive: true,
      acceptsEmail: false,
      foreignCustomer: null,
    });
    expectCategory(
      () => normalizeTagPlusCustomer({ id: 1, ativo: 1 }),
      "CUSTOMER_INVALID_TYPE",
    );
  });

  it("accepts the observed boolean IE indicator as an opaque string", () => {
    expect(
      normalizeTagPlusCustomer({ id: 1, indicador_ie: true }),
    ).toMatchObject({ ieIndicator: "true" });
    expect(
      normalizeTagPlusCustomer({ id: 1, indicador_ie: "synthetic" }),
    ).toMatchObject({ ieIndicator: "synthetic" });
    expectCategory(
      () => normalizeTagPlusCustomer({ id: 1, indicador_ie: 1 }),
      "CUSTOMER_INVALID_TYPE",
    );
  });

  it("parses timezone-qualified timestamps and preserves a civil birth date", () => {
    const result = normalizeTagPlusCustomer({
      id: 1,
      data_cadastro: "2026-08-29T10:30:00-03:00",
      data_alteracao: "2026-08-29T13:30:00Z",
      data_nascimento: "2000-01-02",
    });
    expect(result.sourceCreatedAt?.toISOString()).toBe(
      "2026-08-29T13:30:00.000Z",
    );
    expect(result.birthDate?.toISOString().slice(0, 10)).toBe("2000-01-02");
    expectCategory(
      () => normalizeTagPlusCustomer({ id: 1, data_cadastro: "invalid" }),
      "CUSTOMER_INVALID_DATE",
    );
    expectCategory(
      () => normalizeTagPlusCustomer({ id: 1, data_nascimento: "2000-02-30" }),
      "CUSTOMER_INVALID_DATE",
    );
  });

  it.each([
    ["data_cadastro", "2026-08-30 15:22:01", [2026, 7, 30, 15, 22, 1]],
    ["data_alteracao", "2024-02-29 01:02:03", [2024, 1, 29, 1, 2, 3]],
    ["data_cadastro", "2026-12-31 23:59:59", [2026, 11, 31, 23, 59, 59]],
  ] as const)(
    "parses TagPlus local datetime in %s: %s",
    (field, value, components) => {
      const result = normalizeTagPlusCustomer({ id: 1, [field]: value });
      const date =
        field === "data_cadastro"
          ? result.sourceCreatedAt
          : result.sourceUpdatedAt;
      expect(date).not.toBeNull();
      expect([
        date!.getFullYear(),
        date!.getMonth(),
        date!.getDate(),
        date!.getHours(),
        date!.getMinutes(),
        date!.getSeconds(),
      ]).toEqual(components);
    },
  );

  it.each([
    "2026-02-30 10:00:00",
    "2026-13-01 10:00:00",
    "2026-01-01 24:00:00",
    "2026-01-01 10:60:00",
    "2026-01-01 10:00:60",
    "30/08/2026 15:22:01",
    "2026/08/30 15:22:01",
    "20260830152201",
    "2026-08-30 15:22",
    "2026-08-30 15:22:01.123",
  ])("rejects an unauthorized or impossible local datetime: %s", (value) => {
    const error = captureError(() =>
      normalizeTagPlusCustomer({ id: 1, data_cadastro: value }),
    );
    expect(error).toMatchObject({ category: "CUSTOMER_INVALID_DATE" });
    expect(JSON.stringify(error)).not.toContain(value);
  });

  it("keeps data_nascimento restricted to a civil date", () => {
    expect(
      normalizeTagPlusCustomer({ id: 1, data_nascimento: "2024-02-29" })
        .birthDate,
    ).not.toBeNull();
    expectCategory(
      () =>
        normalizeTagPlusCustomer({
          id: 1,
          data_nascimento: "2024-02-29 01:02:03",
        }),
      "CUSTOMER_INVALID_DATE",
    );
  });

  it.each([
    {
      field: "data_cadastro",
      value: "synthetic-invalid-created-at",
      path: "$.data_cadastro",
      observedType: "string",
      expectedFormat: "timezone-qualified-datetime",
    },
    {
      field: "data_alteracao",
      value: 123456,
      path: "$.data_alteracao",
      observedType: "number",
      expectedFormat: "timezone-qualified-datetime",
    },
    {
      field: "data_nascimento",
      value: ["synthetic-invalid-birth-date"],
      path: "$.data_nascimento",
      observedType: "array",
      expectedFormat: "YYYY-MM-DD",
    },
  ])("reports safe date diagnostics for $field", (fixture) => {
    const error = captureError(() =>
      normalizeTagPlusCustomer({ id: 1, [fixture.field]: fixture.value }),
    );
    expect(error).toMatchObject({
      category: "CUSTOMER_INVALID_DATE",
      diagnostics: {
        path: fixture.path,
        observedType: fixture.observedType,
        expectedFormat: fixture.expectedFormat,
      },
    });
    expect(JSON.stringify(error)).not.toContain(JSON.stringify(fixture.value));
  });

  it.each([
    ["data_cadastro", "2026-08-29T10:30:00", "DATETIME_WITHOUT_TIMEZONE"],
    ["data_cadastro", "2026-08-29", "DATE_ONLY"],
    ["data_cadastro", "", "EMPTY"],
    ["data_cadastro", "synthetic-unclassified", "INVALID_OR_UNCLASSIFIED"],
    ["data_alteracao", "2026-08-29T10:30:00", "DATETIME_WITHOUT_TIMEZONE"],
    ["data_alteracao", "2026-08-29", "DATE_ONLY"],
    ["data_alteracao", "", "EMPTY"],
    ["data_alteracao", "synthetic-unclassified", "INVALID_OR_UNCLASSIFIED"],
  ])(
    "classifies invalid %s strings without accepting them",
    (field, value, dateFormatClass) => {
      const error = captureError(() =>
        normalizeTagPlusCustomer({ id: 1, [field]: value }),
      );
      expect(error).toMatchObject({
        category: "CUSTOMER_INVALID_DATE",
        diagnostics: { observedType: "string", dateFormatClass },
      });
      expect(JSON.stringify(error)).not.toContain(JSON.stringify(value));
    },
  );

  it.each([
    ["2026/08/30 12:44:15", "####/##/## ##:##:##"],
    ["30/08/2026 12:44:15", "##/##/#### ##:##:##"],
    ["20260830124415", "##############"],
    ["2026-08-30T12:44:15.123", "####-##-##T##:##:##.###"],
  ])("masks a date structure: %s", (value, pattern) => {
    const result = createDateStructuralPattern(value);
    expect(result).toBe(pattern);
    expect(result).not.toMatch(/2026|08|30|12|44|15|123/);
  });

  it.each([
    ["2026-08-29T10:30:00", "DATETIME_WITHOUT_TIMEZONE"],
    ["2026-08-30T12:44:15.123", "DATETIME_WITHOUT_TIMEZONE"],
    ["2026-08-29", "DATE_ONLY"],
    ["", "EMPTY"],
  ])("omits a structural pattern for %s classified as %s", (value) => {
    const error = captureError(() =>
      normalizeTagPlusCustomer({ id: 1, data_cadastro: value }),
    );
    expect(error.diagnostics).not.toHaveProperty("dateStructuralPattern");
  });

  it("omits a structural pattern for non-string dates", () => {
    const error = captureError(() =>
      normalizeTagPlusCustomer({ id: 1, data_cadastro: 123456 }),
    );
    expect(error.diagnostics).not.toHaveProperty("dateStructuralPattern");
  });

  it("classifies a timezone datetime as invalid for data_nascimento", () => {
    const value = "2026-08-29T10:30:00Z";
    const error = captureError(() =>
      normalizeTagPlusCustomer({ id: 1, data_nascimento: value }),
    );
    expect(error).toMatchObject({
      category: "CUSTOMER_INVALID_DATE",
      diagnostics: {
        path: "$.data_nascimento",
        observedType: "string",
        expectedFormat: "YYYY-MM-DD",
        dateFormatClass: "DATETIME_WITH_TIMEZONE",
      },
    });
    expect(JSON.stringify(error)).not.toContain(value);
  });

  it("omits date format classification for non-string values", () => {
    const error = captureError(() =>
      normalizeTagPlusCustomer({ id: 1, data_cadastro: 123456 }),
    );
    expect(error.diagnostics).toMatchObject({ observedType: "number" });
    expect(error.diagnostics).not.toHaveProperty("dateFormatClass");
  });

  it("distinguishes missing, empty and populated child collections", () => {
    const missing = normalizeTagPlusCustomer({ id: 1 });
    const nullCollections = normalizeTagPlusCustomer({
      id: 1,
      contatos: null,
      enderecos: null,
    });
    const empty = normalizeTagPlusCustomer({
      id: 1,
      contatos: [],
      enderecos: [],
    });
    const populated = normalizeTagPlusCustomer({
      id: 1,
      contatos: [
        {
          id: 10,
          descricao: "Synthetic",
          tipo_contato: { id: 2, descricao: "Email" },
        },
        { id: "11", principal: true, tipo_cadastro: null },
      ],
      enderecos: [
        {
          id: 20,
          id_endereco_entidade: 21,
          cidade: {
            id: 30,
            codigo: 31,
            nome: "Synthetic City",
            estado: { id: 40, sigla: "ST" },
          },
          pais: { id: 50, codigo: 51, nome: "Synthetic Country" },
        },
        { id: 22 },
      ],
    });
    expect(missing.contacts).toEqual({ state: "NOT_PROVIDED" });
    expect(missing.addresses).toEqual({ state: "NOT_PROVIDED" });
    expect(nullCollections.contacts).toEqual({ state: "NOT_PROVIDED" });
    expect(nullCollections.addresses).toEqual({ state: "NOT_PROVIDED" });
    expect(empty.contacts).toEqual({ state: "PROVIDED", items: [] });
    expect(empty.addresses).toEqual({ state: "PROVIDED", items: [] });
    expect(populated.contacts).toMatchObject({
      state: "PROVIDED",
      items: [
        { sourceId: "10", contactTypeId: "2", position: 0 },
        { sourceId: "11", position: 1 },
      ],
    });
    expect(populated.addresses).toMatchObject({
      state: "PROVIDED",
      items: [
        {
          sourceId: "20",
          sourceEntityAddressId: "21",
          cityId: "30",
          stateId: "40",
          countryId: "50",
          position: 0,
        },
        { sourceId: "22", cityId: null, position: 1 },
      ],
    });
  });

  it.each([{}, "unexpected", 123, true])(
    "rejects non-array non-null contacts: %j",
    (contatos) => {
      expectCategory(
        () => normalizeTagPlusCustomer({ id: 1, contatos }),
        "CUSTOMER_INVALID_STRUCTURE",
      );
    },
  );

  it.each([{}, "unexpected", 123, true])(
    "rejects non-array non-null addresses: %j",
    (enderecos) => {
      expectCategory(
        () => normalizeTagPlusCustomer({ id: 1, enderecos }),
        "CUSTOMER_INVALID_STRUCTURE",
      );
    },
  );

  it("fails the parent safely for invalid child identifiers", () => {
    expectCategory(
      () => normalizeTagPlusCustomer({ id: 1, contatos: [{}] }),
      "CUSTOMER_INVALID_CONTACT_ID",
    );
    expectCategory(
      () => normalizeTagPlusCustomer({ id: 1, enderecos: [{ id: true }] }),
      "CUSTOMER_INVALID_ADDRESS_ID",
    );
    const canary = "synthetic-customer@example.invalid";
    try {
      normalizeTagPlusCustomer({ id: 1, email: canary, contatos: [{}] });
    } catch (error: unknown) {
      expect(String(error)).not.toContain(canary);
    }
  });

  it("preserves duplicate child source identifiers by array position", () => {
    const result = normalizeTagPlusCustomer({
      id: "synthetic-parent",
      contatos: [
        { id: "same-contact", descricao: "Synthetic Contact A" },
        { id: "same-contact", descricao: "Synthetic Contact B" },
      ],
      enderecos: [
        { id: "same-address", logradouro: "Synthetic Street A" },
        { id: "same-address", logradouro: "Synthetic Street B" },
      ],
    });
    expect(result.contacts).toMatchObject({
      state: "PROVIDED",
      items: [
        { sourceId: "same-contact", position: 0 },
        { sourceId: "same-contact", position: 1 },
      ],
    });
    expect(result.addresses).toMatchObject({
      state: "PROVIDED",
      items: [
        { sourceId: "same-address", position: 0 },
        { sourceId: "same-address", position: 1 },
      ],
    });
  });

  it.each([
    [
      { id: 1, ativo: "PRIVATE_INVALID" },
      "CUSTOMER_INVALID_TYPE",
      "$.ativo",
      "boolean",
    ],
    [
      { id: 1, contatos: "PRIVATE_INVALID" },
      "CUSTOMER_INVALID_STRUCTURE",
      "$.contatos",
      "array",
    ],
    [
      { id: 1, contatos: ["PRIVATE_INVALID"] },
      "CUSTOMER_INVALID_CHILD_STRUCTURE",
      "$.contatos[]",
      "object",
    ],
    [
      { id: 1, enderecos: ["PRIVATE_INVALID"] },
      "CUSTOMER_INVALID_CHILD_STRUCTURE",
      "$.enderecos[]",
      "object",
    ],
  ])(
    "classifies structural failures without retaining values",
    (input, category, path, expectedTypeOrFormat) => {
      const error = captureError(() => normalizeTagPlusCustomer(input));
      expect(error).toMatchObject({
        category,
        diagnostics: { path, observedType: "string", expectedTypeOrFormat },
      });
      expect(JSON.stringify(error)).not.toContain("PRIVATE_INVALID");
    },
  );
});

function expectCategory(
  action: () => unknown,
  category: CustomerNormalizationError["category"],
): void {
  try {
    action();
    throw new Error("Expected normalization to fail");
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(CustomerNormalizationError);
    expect(error).toMatchObject({ category });
  }
}

function captureError(action: () => unknown): CustomerNormalizationError {
  try {
    action();
    throw new Error("Expected normalization to fail");
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(CustomerNormalizationError);
    return error as CustomerNormalizationError;
  }
}
