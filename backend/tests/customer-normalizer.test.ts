import { describe, expect, it } from "vitest";
import {
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
      "CUSTOMER_NORMALIZATION_ERROR",
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
        "CUSTOMER_NORMALIZATION_ERROR",
      );
    },
  );

  it.each([{}, "unexpected", 123, true])(
    "rejects non-array non-null addresses: %j",
    (enderecos) => {
      expectCategory(
        () => normalizeTagPlusCustomer({ id: 1, enderecos }),
        "CUSTOMER_NORMALIZATION_ERROR",
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
