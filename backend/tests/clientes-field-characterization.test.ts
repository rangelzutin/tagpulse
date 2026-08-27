import { describe, expect, it, vi } from "vitest";
import { characterizeClientesFields } from "../src/integrations/tagplus/inspection/clientes-field-characterization.js";
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

describe("clientes field characterization", () => {
  it("continues across a short page and stops only on []", async () => {
    const get = vi.fn(async (path: string) => {
      if (path.includes("page=1&")) return response([{ id: 1 }, { id: 2 }]);
      if (path.includes("page=2&")) return response([{ id: 3 }]);
      return response([]);
    });
    const result = await characterizeClientesFields(clientFrom(get), "2.0", {
      now: vi.fn().mockReturnValueOnce("start").mockReturnValueOnce("end"),
    });

    expect(get.mock.calls.map(([path]) => path)).toEqual([
      "/clientes?page=1&per_page=100",
      "/clientes?page=2&per_page=100",
      "/clientes?page=3&per_page=100",
    ]);
    expect(result.scan).toEqual({
      firstPage: 1,
      perPage: 100,
      recordsFetched: 3,
      nonEmptyPages: 2,
      lastNonEmptyPage: 2,
      lastPageRecords: 1,
      emptyTerminationPage: 3,
      endpointExhausted: true,
    });
    expect(result.execution).toMatchObject({
      executionComplete: true,
      status: "COMPLETE_ENDPOINT_EXHAUSTED",
    });
  });

  it("returns privacy-safe partial results", async () => {
    let call = 0;
    const result = await characterizeClientesFields(
      clientFrom(async () => {
        if (call++ === 0)
          return response([
            {
              id: "ENTITY_ID_CANARY",
              cpf: "12345678901",
              razao_social: "CLIENT_SECRET_CANARY",
            },
          ]);
        throw new TagPlusHttpError(429);
      }),
      "2.0",
    );
    expect(result.execution).toMatchObject({
      executionComplete: false,
      status: "PARTIAL_NOT_EXHAUSTED",
      stoppedAtPage: 2,
      warnings: [{ category: "HTTP_ERROR", page: 2, httpStatus: 429 }],
    });
    const serialized = JSON.stringify(result);
    for (const canary of [
      "ENTITY_ID_CANARY",
      "12345678901",
      "CLIENT_SECRET_CANARY",
    ])
      expect(serialized).not.toContain(canary);
  });

  it("marks a non-array response as incomplete", async () => {
    const result = await characterizeClientesFields(
      clientFrom(async () => response({ records: [] })),
      "2.0",
    );
    expect(result.execution).toMatchObject({
      executionComplete: false,
      status: "PARTIAL_NOT_EXHAUSTED",
      stoppedAtPage: 1,
      warnings: [{ category: "UNEXPECTED_ROOT", page: 1 }],
    });
  });
});
