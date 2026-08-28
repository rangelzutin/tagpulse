import { describe, expect, it, vi } from "vitest";
import { censusClientesFullStructure } from "../src/integrations/tagplus/inspection/clientes-full-structural-census.js";
import {
  TagPlusHttpError,
  type TagPlusClient,
} from "../src/integrations/tagplus/tagplus-client.js";

function clientWithPages(...pages: unknown[]): TagPlusClient {
  return {
    get: vi.fn(async () => {
      const next = pages.shift();
      if (next instanceof Error) throw next;
      return { data: next, status: 200, durationMs: 1 };
    }),
  };
}

function findPath(
  result: Awaited<ReturnType<typeof censusClientesFullStructure>>,
  path: string,
) {
  const found = result.paths.find((entry) => entry.path === path);
  expect(found, `missing path ${path}`).toBeDefined();
  return found!;
}

describe("full clientes structural census", () => {
  it("continues after a short page and exhausts only on an empty page", async () => {
    const client = clientWithPages(
      [
        {
          name: "NAME_CANARY",
          cpf: "CPF_CANARY",
          cnpj: "CNPJ_CANARY",
          email: "EMAIL_CANARY",
          phone: "PHONE_CANARY",
          address: "ADDRESS_CANARY",
          zip: "ZIP_CANARY",
          id: "CUSTOMER_ID_CANARY",
          entity_id: "ENTITY_ID_CANARY",
          optional: null,
          multi: 1,
          nested: { child: "ADDRESS_CANARY" },
          items: [],
          map: {
            "fake-person@example.invalid": { total: 1 },
            ACCOUNT_9F42_X: { total: 2 },
          },
          token: "TOKEN_CANARY",
          authorization: "AUTHORIZATION_CANARY",
          credit: "CREDIT_CANARY",
          observation: "OBSERVATION_CANARY",
        },
        {
          id: "CUSTOMER_ID_CANARY_2",
          multi: "one",
          items: [{ kind: "ITEM_CANARY" }],
        },
      ],
      [{ id: "CUSTOMER_ID_CANARY_3", late: true }],
      [],
    );

    const result = await censusClientesFullStructure(client, "2.0");

    expect(client.get).toHaveBeenNthCalledWith(
      1,
      "/clientes?fields=*&page=1&per_page=100",
    );
    expect(client.get).toHaveBeenNthCalledWith(
      2,
      "/clientes?fields=*&page=2&per_page=100",
    );
    expect(client.get).toHaveBeenNthCalledWith(
      3,
      "/clientes?fields=*&page=3&per_page=100",
    );
    expect(result.execution).toEqual({
      recordsFetched: 3,
      nonEmptyPages: 2,
      lastNonEmptyPage: 2,
      lastNonEmptyPageRecordCount: 1,
      emptyTerminationPage: 3,
      endpointExhausted: true,
      executionComplete: true,
      status: "COMPLETE_ENDPOINT_EXHAUSTED",
      stoppedAtPage: null,
      warnings: [],
    });
    expect(findPath(result, "$.optional")).toMatchObject({
      presentCount: 1,
      missingCount: 2,
      nullCount: 1,
    });
    expect(findPath(result, "$.multi").observedTypes).toEqual([
      "number",
      "string",
    ]);
    expect(findPath(result, "$.late")).toMatchObject({
      presentCount: 1,
      missingCount: 2,
    });
    expect(result.structure).toMatchObject({
      multiTypePaths: 1,
      structuralShapeCount: 3,
      dynamicKeyParentsNormalized: 1,
    });
    expect(result.structure.arrayPaths).toContain("$.items");
    expect(result.structure.objectPaths).toContain("$.nested");
    expect(result.shapes.map((shape) => shape.shapeId)).toEqual([
      "SHAPE_001",
      "SHAPE_002",
      "SHAPE_003",
    ]);
    expect(result.novelty).toMatchObject({
      firstNovelPathRecord: 1,
      firstNovelPathPage: 1,
      lastNovelPathRecord: 3,
      lastNovelPathPage: 2,
      firstNovelShapeRecord: 1,
      lastNovelShapeRecord: 3,
      lastNovelShapePage: 2,
    });
    const serialized = JSON.stringify(result);
    for (const canary of [
      "NAME_CANARY",
      "CPF_CANARY",
      "CNPJ_CANARY",
      "EMAIL_CANARY",
      "PHONE_CANARY",
      "ADDRESS_CANARY",
      "ZIP_CANARY",
      "CUSTOMER_ID_CANARY",
      "ENTITY_ID_CANARY",
      "TOKEN_CANARY",
      "AUTHORIZATION_CANARY",
      "CREDIT_CANARY",
      "OBSERVATION_CANARY",
    ])
      expect(serialized).not.toContain(canary);
  });

  it("returns a safe partial result when a later page fails", async () => {
    const result = await censusClientesFullStructure(
      clientWithPages([{ stable: true }], new TagPlusHttpError(503)),
      "2.0",
    );

    expect(result.execution).toMatchObject({
      recordsFetched: 1,
      endpointExhausted: false,
      executionComplete: false,
      status: "PARTIAL",
      stoppedAtPage: 2,
      warnings: [{ category: "HTTP_ERROR", page: 2, httpStatus: 503 }],
    });
  });

  it("returns FAILED when the first response has an unexpected root", async () => {
    const result = await censusClientesFullStructure(
      clientWithPages({ private: "VALUE_CANARY" }),
      "2.0",
    );

    expect(result.execution).toMatchObject({
      recordsFetched: 0,
      status: "FAILED",
      stoppedAtPage: 1,
      warnings: [{ category: "UNEXPECTED_ROOT", page: 1 }],
    });
    expect(JSON.stringify(result)).not.toContain("VALUE_CANARY");
  });

  it("is deterministic and never serializes values or dynamic business keys", async () => {
    const first = await censusClientesFullStructure(
      clientWithPages(
        [
          {
            name: "SENSITIVE_CANARY_9F42",
            map: { ACCOUNT_9F42_X: { value: "SECRET_ONE" } },
          },
        ],
        [],
      ),
      "2.0",
    );
    const second = await censusClientesFullStructure(
      clientWithPages(
        [
          {
            name: "DIFFERENT_PRIVATE_VALUE",
            map: { DIFFERENT_DYNAMIC_KEY: { value: "SECRET_TWO" } },
          },
        ],
        [],
      ),
      "2.0",
    );

    expect(second).toEqual(first);
    const serialized = JSON.stringify(first);
    expect(serialized).toContain("$.map.<dynamic-key>.value");
    for (const canary of [
      "SENSITIVE_CANARY_9F42",
      "ACCOUNT_9F42_X",
      "SECRET_ONE",
    ])
      expect(serialized).not.toContain(canary);
  });
});
