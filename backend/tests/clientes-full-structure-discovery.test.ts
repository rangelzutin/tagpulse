import { describe, expect, it, vi } from "vitest";
import { discoverClientesFullStructure } from "../src/integrations/tagplus/inspection/clientes-full-structure-discovery.js";
import {
  TagPlusHttpError,
  type TagPlusClient,
  type TagPlusResponse,
} from "../src/integrations/tagplus/tagplus-client.js";

function response(data: unknown, status = 200): TagPlusResponse<unknown> {
  return { status, data, paginationHeaders: {} };
}

function clientFrom(
  implementation: (path: string) => Promise<TagPlusResponse<unknown>>,
): TagPlusClient {
  return {
    get: async <T>(path: string) =>
      (await implementation(path)) as TagPlusResponse<T>,
  };
}

function clientFor(records: {
  defaultRecord: unknown;
  fieldsRecord: unknown;
  itemRecord: unknown;
}): TagPlusClient {
  return clientFrom(async (path) => {
    if (path.includes("fields=*")) return response([records.fieldsRecord]);
    if (path === "/clientes?page=1&per_page=1")
      return response([records.defaultRecord]);
    return response(records.itemRecord);
  });
}

describe("clientes full structure discovery", () => {
  it("profiles the three modes in order using the default id only in memory", async () => {
    const get = vi.fn(async (path: string) => {
      if (path.includes("fields=*"))
        return response([{ id: 41, email: "EMAIL_CANARY" }]);
      if (path === "/clientes?page=1&per_page=1")
        return response([{ id: 41, razao_social: "CUSTOMER_NAME_CANARY" }]);
      return response({ id: 41, contatos: [{ valor: "PHONE_CANARY" }] });
    });
    const result = await discoverClientesFullStructure(clientFrom(get), "2.0");

    expect(get.mock.calls.map(([path]) => path)).toEqual([
      "/clientes?page=1&per_page=1",
      "/clientes?fields=*&page=1&per_page=1",
      "/clientes/41",
    ]);
    expect(result.execution).toEqual({
      status: "COMPLETE",
      sameRecordAcrossCollections: true,
      itemMatchesDefault: true,
    });
    expect(
      result.modes.every((mode) => mode.success && mode.profileComplete),
    ).toBe(true);
    expect(result.comparison.pathsOnlyInFieldsAll).toEqual(["$.email"]);
    expect(result.comparison.pathsOnlyInItem).toEqual([
      "$.contatos",
      "$.contatos[]",
      "$.contatos[].valor",
    ]);
    expect(JSON.stringify(result)).not.toContain("/clientes/41");
  });

  it("marks collections with different ids without exposing either id", async () => {
    const result = await discoverClientesFullStructure(
      clientFor({
        defaultRecord: { id: "CUSTOMER_ID_CANARY" },
        fieldsRecord: { id: "OTHER_ID_CANARY", ativo: true },
        itemRecord: { id: "CUSTOMER_ID_CANARY" },
      }),
      "2.0",
    );
    expect(result.execution.sameRecordAcrossCollections).toBe(false);
    expect(result.execution.status).toBe("PARTIAL");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("CUSTOMER_ID_CANARY");
    expect(serialized).not.toContain("OTHER_ID_CANARY");
  });

  it("returns PARTIAL when fields-all fails but still inspects the item", async () => {
    const result = await discoverClientesFullStructure(
      clientFrom(async (path) => {
        if (path === "/clientes?page=1&per_page=1")
          return response([{ id: 7 }]);
        if (path.includes("fields=*")) throw new TagPlusHttpError(422);
        return response({ id: 7, detail: true });
      }),
      "2.0",
    );
    expect(result.execution.status).toBe("PARTIAL");
    expect(result.modes[1]).toEqual({
      mode: "COLLECTION_FIELDS_ALL",
      success: false,
      httpStatus: 422,
      profileComplete: false,
      failureCategory: "HTTP_ERROR",
    });
    expect(result.modes[2]?.success).toBe(true);
  });

  it("returns safe PARTIAL evidence when item detail fails", async () => {
    const result = await discoverClientesFullStructure(
      clientFrom(async (path) => {
        if (path === "/clientes?page=1&per_page=1")
          return response([{ id: 9 }]);
        if (path.includes("fields=*")) return response([{ id: 9 }]);
        throw new TagPlusHttpError(404);
      }),
      "2.0",
    );
    expect(result.execution.status).toBe("PARTIAL");
    expect(result.modes[2]).toEqual({
      mode: "ITEM_DETAIL",
      success: false,
      httpStatus: 404,
      profileComplete: false,
      failureCategory: "HTTP_ERROR",
    });
    expect(JSON.stringify(result)).not.toContain("/clientes/9");
  });

  it.each([
    ["empty collection", [], "EMPTY_COLLECTION"],
    ["missing id", [{}], "MISSING_ID"],
    ["unexpected id", [{ id: { nested: true } }], "UNEXPECTED_ID_TYPE"],
  ] as const)("fails safely for %s", async (_name, data, category) => {
    const get = vi.fn(async () => response(data));
    const result = await discoverClientesFullStructure(clientFrom(get), "2.0");
    expect(result.execution.status).toBe("FAILED");
    expect(result.modes[0]?.failureCategory).toBe(category);
    expect(result.modes.slice(1).map((mode) => mode.failureCategory)).toEqual([
      "SKIPPED_DEPENDENCY",
      "SKIPPED_DEPENDENCY",
    ]);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("never serializes PII, credential, header, payload or record canaries", async () => {
    const canaries = [
      "CUSTOMER_NAME_CANARY",
      "EMAIL_CANARY",
      "PHONE_CANARY",
      "ADDRESS_CANARY",
      "DOCUMENT_CANARY",
      "OBSERVATION_CANARY",
      "CUSTOMER_ID_CANARY",
      "ENTITY_ID_CANARY",
      "ACCESS_TOKEN_CANARY",
      "AUTHORIZATION_CANARY",
    ];
    const fixture = {
      id: "CUSTOMER_ID_CANARY",
      id_entidade: "ENTITY_ID_CANARY",
      nome: "CUSTOMER_NAME_CANARY",
      email: "EMAIL_CANARY",
      telefone: "PHONE_CANARY",
      endereco: "ADDRESS_CANARY",
      cpf: "DOCUMENT_CANARY",
      observacao: "OBSERVATION_CANARY",
      token: "ACCESS_TOKEN_CANARY",
      header: "AUTHORIZATION_CANARY",
    };
    const result = await discoverClientesFullStructure(
      clientFor({
        defaultRecord: fixture,
        fieldsRecord: fixture,
        itemRecord: { ...fixture, contatos: [{ valor: "PHONE_CANARY" }] },
      }),
      "2.0",
    );
    const serialized = JSON.stringify(result);
    canaries.forEach((canary) => expect(serialized).not.toContain(canary));
    for (const forbiddenProperty of [
      "sample",
      "example",
      "payload",
      "record",
      "rawResponse",
      "responseBody",
    ])
      expect(serialized).not.toMatch(
        new RegExp(`"${forbiddenProperty}"\\s*:`, "i"),
      );
  });
});
