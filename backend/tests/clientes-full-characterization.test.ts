import { describe, expect, it, vi } from "vitest";
import { characterizeClientesFull } from "../src/integrations/tagplus/inspection/clientes-full-characterization.js";
import {
  TagPlusHttpError,
  type TagPlusClient,
  type TagPlusResponse,
} from "../src/integrations/tagplus/tagplus-client.js";

function response(data: unknown): TagPlusResponse<unknown> {
  return { status: 200, data, paginationHeaders: {} };
}

function clientFrom(
  implementation: (path: string) => Promise<TagPlusResponse<unknown>>,
): TagPlusClient {
  return {
    get: async <T>(path: string) =>
      (await implementation(path)) as TagPlusResponse<T>,
  };
}

const CANARIES = [
  "CUSTOMER_ID_CANARY",
  "ENTITY_ID_CANARY",
  "CODE_CANARY",
  "EXTERNAL_CODE_CANARY",
  "NAME_CANARY",
  "CPF_CANARY",
  "CNPJ_CANARY",
  "EMAIL_CANARY",
  "PHONE_CANARY",
  "ADDRESS_CANARY",
  "ZIP_CANARY",
  "CITY_CANARY",
  "STATE_CANARY",
  "COUNTRY_CANARY",
  "IE_CANARY",
  "IM_CANARY",
  "CNAE_CANARY",
  "CATEGORY_CANARY",
  "TYPE_CANARY",
  "DATE_CANARY",
  "TOKEN_CANARY",
  "REFRESH_TOKEN_CANARY",
  "AUTHORIZATION_CANARY",
  "FINANCIAL_CANARY",
];

describe("clientes full privacy-safe characterization scan", () => {
  it("uses one sequential fields-all traversal and terminates only on []", async () => {
    const get = vi.fn(async (path: string) => {
      if (path.includes("page=1&"))
        return response([{ id: "CUSTOMER_ID_CANARY", email: "EMAIL_CANARY" }]);
      if (path.includes("page=2&"))
        return response([{ id: "CUSTOMER_ID_CANARY_2" }]);
      return response([]);
    });
    const result = await characterizeClientesFull(clientFrom(get), "2.0");
    expect(get.mock.calls.map(([path]) => path)).toEqual([
      "/clientes?fields=*&page=1&per_page=100",
      "/clientes?fields=*&page=2&per_page=100",
      "/clientes?fields=*&page=3&per_page=100",
    ]);
    expect(result.execution).toMatchObject({
      recordsProcessed: 2,
      pagesProcessed: 2,
      lastNonEmptyPage: 2,
      lastNonEmptyPageRecordCount: 1,
      emptyTerminationPage: 3,
      endpointExhausted: true,
      executionComplete: true,
      status: "COMPLETE_ENDPOINT_EXHAUSTED",
    });
    expect(get).toHaveBeenCalledTimes(3);
    expect(
      get.mock.calls.every(([path]) => !/\/clientes\/[^?]/.test(path)),
    ).toBe(true);
  });

  it("returns safe PARTIAL metadata after progress and FAILED before progress", async () => {
    let call = 0;
    const partial = await characterizeClientesFull(
      clientFrom(async () => {
        if (call++ === 0) return response([{ razao_social: "NAME_CANARY" }]);
        throw new TagPlusHttpError(503);
      }),
      "2.0",
    );
    expect(partial.execution).toMatchObject({
      status: "PARTIAL",
      stoppedAtPage: 2,
      warnings: [
        {
          failureStage: "FETCH_PAGE",
          failureCategory: "HTTP_ERROR",
          page: 2,
          httpStatus: 503,
        },
      ],
    });
    const failed = await characterizeClientesFull(
      clientFrom(async () => response({ raw: "TOKEN_CANARY" })),
      "2.0",
    );
    expect(failed.execution).toMatchObject({
      status: "FAILED",
      stoppedAtPage: 1,
      warnings: [
        {
          failureStage: "VALIDATE_PAGE",
          failureCategory: "UNEXPECTED_ROOT",
          page: 1,
        },
      ],
    });
    expect(JSON.stringify(partial)).not.toContain("NAME_CANARY");
    expect(JSON.stringify(failed)).not.toContain("TOKEN_CANARY");
  });

  it("is deterministic and serializes no canary or prohibited output key", async () => {
    const payload = Object.fromEntries(
      CANARIES.map((canary, index) => [`field_${index}`, canary]),
    );
    Object.assign(payload, {
      id: CANARIES[0],
      id_entidade: CANARIES[1],
      codigo: CANARIES[2],
      codigo_externo: CANARIES[3],
      tipo: CANARIES[18],
      razao_social: CANARIES[4],
      cpf: CANARIES[5],
      cnpj: CANARIES[6],
      email: CANARIES[7],
      telefone: CANARIES[8],
      data_cadastro: CANARIES[19],
      ie: CANARIES[15],
      im: CANARIES[16],
      cnae: CANARIES[17],
      contatos: [{ descricao: CANARIES[4], detalhes: CANARIES[8] }],
      enderecos: [
        {
          logradouro: CANARIES[9],
          cep: CANARIES[10],
          cidade: { nome: CANARIES[11], estado: { nome: CANARIES[12] } },
          pais: { nome: CANARIES[13] },
        },
      ],
      categoria: { id: CANARIES[18], descricao: CANARIES[18] },
    });
    const run = () =>
      characterizeClientesFull(
        clientFrom(
          vi
            .fn()
            .mockResolvedValueOnce(response([payload]))
            .mockResolvedValueOnce(response([])),
        ),
        "2.0",
      );
    const first = await run(),
      second = await run();
    expect(second).toEqual(first);
    const serialized = JSON.stringify(first);
    for (const canary of CANARIES) expect(serialized).not.toContain(canary);
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("Authorization");
    const prohibited = new Set([
      "sample",
      "samples",
      "example",
      "examples",
      "value",
      "values",
      "raw",
      "payload",
      "record",
      "customer",
      "emailValue",
      "phoneValue",
      "cpfValue",
      "cnpjValue",
    ]);
    const walk = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        expect(prohibited.has(key)).toBe(false);
        walk(child);
      }
    };
    walk(first);
  });
});
