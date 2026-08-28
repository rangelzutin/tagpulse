import { describe, expect, it } from "vitest";
import { createClientesCharacterizationProfiler } from "../src/integrations/tagplus/inspection/clientes-characterization-profiler.js";

describe("clientes full characterization profiler", () => {
  it("profiles missing, null, empty, whitespace, lengths, formats and booleans", () => {
    const profiler = createClientesCharacterizationProfiler();
    profiler.inspectRecord({
      codigo: "",
      codigo_externo: "  ",
      tipo: "PF",
      ativo: true,
      cpf: "111.111.111-11",
      cnpj: null,
      data_cadastro: "2026-08-28",
      data_alteracao: "invalid",
      data_nascimento: null,
      email: "a@example.invalid",
      telefone: "11999999999",
      recebe_email: false,
      exterior: null,
      indicador_ie: "unexpected",
    });
    profiler.inspectRecord({
      codigo: "ABC",
      tipo: "PJ",
      ativo: false,
      cpf: null,
      cnpj: "11111111111111",
      data_cadastro: "2026-08-28T12:00:00Z",
      email: "invalid",
      telefone: "(11) 99999-9999",
      recebe_email: null,
    });
    const result = profiler.finalize();
    const codigo = result.scalarFields.find(
      (entry) => entry.path === "$.codigo",
    )!;
    const external = result.scalarFields.find(
      (entry) => entry.path === "$.codigo_externo",
    )!;
    expect(codigo).toMatchObject({
      presentCount: 2,
      emptyStringCount: 1,
      nonEmptyCount: 1,
      rawLengthMin: 0,
      rawLengthMax: 3,
      distinctCount: 2,
    });
    expect(external).toMatchObject({
      presentCount: 1,
      missingCount: 1,
      whitespaceOnlyCount: 1,
    });
    expect(result.documentFormats.cpf).toMatchObject({
      CPF_STANDARD_PUNCTUATED: 1,
      OTHER_TYPE: 1,
    });
    expect(result.documentFormats.cnpj).toMatchObject({
      CNPJ_DIGITS_ONLY: 1,
      OTHER_TYPE: 1,
    });
    expect(result.emailFormats).toMatchObject({
      EMAIL_LIKE: 1,
      NON_EMAIL_STRING: 1,
    });
    expect(result.phoneFormats).toMatchObject({
      PHONE_DIGITS_ONLY: 1,
      PHONE_FORMATTED: 1,
    });
    expect(
      result.booleans.find((entry) => entry.path === "$.ativo"),
    ).toMatchObject({ trueCount: 1, falseCount: 1 });
    expect(
      result.booleans.find((entry) => entry.path === "$.indicador_ie"),
    ).toMatchObject({ otherTypeCount: 1, missingCount: 1 });
  });

  it("uses explicit customer-level and element-level denominators", () => {
    const profiler = createClientesCharacterizationProfiler();
    profiler.inspectRecord({ contatos: [] });
    profiler.inspectRecord({
      contatos: [{ descricao: "one" }, { descricao: null, detalhes: "x" }],
    });
    profiler.inspectRecord({ contatos: null });
    profiler.inspectRecord({});
    const result = profiler.finalize();
    const array = result.arrays.find((entry) => entry.path === "$.contatos")!;
    const description = result.arrayElements.find(
      (entry) => entry.path === "$.contatos[].descricao",
    )!;
    expect(array).toMatchObject({
      customersWithArray: 2,
      customersWithoutArray: 2,
      nullArrayCount: 1,
      emptyArrayCount: 1,
      customersWith2Items: 1,
      customersWithMultipleItems: 1,
      totalElementsObserved: 2,
    });
    expect(description).toMatchObject({
      customersContainingPath: 1,
      customersMissingPath: 3,
      elementsContainingPath: 2,
      elementsMissingPath: 0,
      elementsNull: 1,
      elementsNonNull: 1,
    });
  });

  it("aggregates principals, completeness, exterior and optional object cardinalities", () => {
    const profiler = createClientesCharacterizationProfiler();
    profiler.inspectRecord({
      exterior: true,
      contatos: [
        {
          principal: true,
          estrangeiro: false,
          tipo_contato: { id: "TYPE_CANARY", descricao: "TYPE_NAME_CANARY" },
        },
        { principal: true, estrangeiro: null, tipo_contato: null },
      ],
      enderecos: [
        {
          principal: false,
          exterior: true,
          logradouro: "ADDRESS_CANARY",
          numero: "1",
          bairro: "B",
          cep: "ZIP_CANARY",
          cidade: { nome: "CITY_CANARY", estado: { sigla: "ST" } },
          pais: { nome: "COUNTRY_CANARY" },
          tipo_cadastro: { id: "ADDRESS_TYPE", descricao: "HOME" },
        },
        { principal: false, exterior: false, cidade: { estado: {} }, pais: {} },
      ],
      categoria: {
        id: "CATEGORY_CANARY",
        id_categoria_mae: "PARENT_CANARY",
        descricao: "CATEGORY_NAME",
      },
    });
    const result = profiler.finalize();
    expect(result.contacts).toMatchObject({
      customersWithContacts: 1,
      customersWithMultipleContacts: 1,
      customersWithPrincipalContact: 1,
      customersWithMultiplePrincipalContacts: 1,
    });
    expect(result.addresses).toMatchObject({
      customersWithAddresses: 1,
      customersWithMultipleAddresses: 1,
      customersWithNoPrincipalAddressAmongNonEmpty: 1,
      addressesWithCompleteCityObject: 1,
      addressesWithCompleteStateObject: 1,
      addressesWithCompleteCountryObject: 1,
      addressesWithTagPulseCoreLocation: 1,
      coreLocationDefinition: "TAGPULSE_INSPECTION_CONVENTION",
    });
    expect(result.category).toMatchObject({
      objectPresentCount: 1,
      distinctIdCount: 1,
      distinctParentIdCount: 1,
      distinctDescriptionCount: 1,
    });
    const serialized = JSON.stringify(result);
    for (const canary of [
      "ADDRESS_CANARY",
      "ZIP_CANARY",
      "CITY_CANARY",
      "COUNTRY_CANARY",
      "TYPE_CANARY",
      "TYPE_NAME_CANARY",
      "CATEGORY_CANARY",
      "PARENT_CANARY",
      "CATEGORY_NAME",
    ])
      expect(serialized).not.toContain(canary);
  });

  it("computes identity 1:1, 1:N and N:1 aggregates without values", () => {
    const profiler = createClientesCharacterizationProfiler();
    profiler.inspectRecord({
      id: "CUSTOMER_ID_CANARY_A",
      id_entidade: "ENTITY_ID_CANARY_A",
    });
    profiler.inspectRecord({
      id: "CUSTOMER_ID_CANARY_A",
      id_entidade: "ENTITY_ID_CANARY_B",
    });
    profiler.inspectRecord({
      id: "CUSTOMER_ID_CANARY_B",
      id_entidade: "ENTITY_ID_CANARY_B",
    });
    const result = profiler.finalize();
    expect(result.identity).toMatchObject({
      pairedRecords: 3,
      distinctPairCount: 3,
      idsWithMultipleEntityIds: 1,
      entityIdsWithMultipleIds: 1,
      id: { distinctCount: 2, duplicateOccurrences: 1, duplicateGroups: 1 },
      idEntidade: {
        distinctCount: 2,
        duplicateOccurrences: 1,
        duplicateGroups: 1,
      },
    });
    expect(JSON.stringify(result)).not.toContain("CUSTOMER_ID_CANARY");
    expect(JSON.stringify(result)).not.toContain("ENTITY_ID_CANARY");
  });

  it("builds only authorized aggregate cross-field tables", () => {
    const profiler = createClientesCharacterizationProfiler();
    profiler.inspectRecord({
      cpf: "111",
      cnpj: "",
      codigo: "A",
      codigo_externo: null,
      email: "a@example.invalid",
      telefone: "",
      contatos: [{ principal: true }],
      enderecos: [{ principal: true, exterior: true }],
      exterior: true,
      ativo: true,
      recebe_email: false,
      ie: "IE_CANARY",
      cnae: "CNAE_CANARY",
    });
    profiler.inspectRecord({
      cpf: "",
      cnpj: "111",
      contatos: [],
      enderecos: [],
      ativo: false,
      recebe_email: true,
    });
    const result = profiler.finalize();
    expect(result.crossField.documents).toEqual({
      CPF_ONLY: 1,
      CNPJ_ONLY: 1,
      BOTH: 0,
      NEITHER: 0,
    });
    expect(result.crossField.codes).toMatchObject({
      leftTrueRightFalse: 1,
      leftFalseRightFalse: 1,
    });
    expect(
      result.crossField.emailUsableByContactsNonEmpty.leftTrueRightTrue,
    ).toBe(1);
    expect(
      result.crossField.addressesNonEmptyByPrincipalExists.leftTrueRightTrue,
    ).toBe(1);
    expect(
      result.crossField.customerExteriorByExteriorAddressExists
        .leftTrueRightTrue,
    ).toBe(1);
    expect(JSON.stringify(result)).not.toContain("IE_CANARY");
    expect(JSON.stringify(result)).not.toContain("CNAE_CANARY");
  });

  it("rejects inspection after transient sets have been finalized", () => {
    const profiler = createClientesCharacterizationProfiler();
    profiler.inspectRecord({ tipo: "TYPE_CANARY" });
    const result = profiler.finalize();
    expect(JSON.stringify(result)).not.toContain("TYPE_CANARY");
    expect(() => profiler.inspectRecord({})).toThrow("already finalized");
  });
});
