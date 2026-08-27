import { describe, expect, it, vi } from "vitest";
import {
  inspectClientesStructure,
  type ClientesStructuralInspectionResult,
} from "../src/integrations/tagplus/inspection/clientes-structural-inspection.js";
import {
  TagPlusHttpError,
  TagPlusInvalidResponseError,
  TagPlusNetworkError,
  TagPlusTimeoutError,
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

const clock = {
  now: vi.fn().mockReturnValueOnce("start").mockReturnValueOnce("end"),
};

describe("clientes structural inspection", () => {
  it("starts at page 1, keeps per_page=100, crosses a short page, and stops only on []", async () => {
    const get = vi.fn(async (requestPath: string) => {
      if (requestPath.includes("page=1&"))
        return response([{ a: 1 }, { a: 2 }]);
      if (requestPath.includes("page=2&")) return response([{ a: 3 }]);
      return response([]);
    });

    const result = await inspectClientesStructure(
      clientFrom(get),
      "2.0",
      clock,
    );

    expect(get.mock.calls.map(([requestPath]) => requestPath)).toEqual([
      "/clientes?page=1&per_page=100",
      "/clientes?page=2&per_page=100",
      "/clientes?page=3&per_page=100",
    ]);
    expect(result.scan).toEqual({
      firstPage: 1,
      perPage: 100,
      lastNonEmptyPage: 2,
      emptyTerminationPage: 3,
      endpointExhausted: true,
    });
    expect(result.execution).toMatchObject({
      executionComplete: true,
      stoppedAtPage: null,
    });
    expect(result.records.recordsFetched).toBe(3);
    expect(result.discoveryCurve).toHaveLength(2);
    expect(
      result.discoveryCurve.map((point) => point.recordsCumulative),
    ).toEqual([2, 3]);
  });

  it("returns safe partial evidence for an unexpected root", async () => {
    const result = await inspectClientesStructure(
      clientFrom(async () => response({ data: [] })),
      "2.0",
    );

    expectPartial(result, "UNEXPECTED_ROOT");
    expect(result.execution.stoppedAtPage).toBe(1);
  });

  it.each([
    ["HTTP_ERROR", new TagPlusHttpError(429), 429],
    ["TIMEOUT", new TagPlusTimeoutError(), undefined],
    ["NETWORK_ERROR", new TagPlusNetworkError(), undefined],
    ["INVALID_JSON", new TagPlusInvalidResponseError(), undefined],
  ] as const)(
    "returns safe partial evidence for %s",
    async (category, error, status) => {
      let calls = 0;
      const client = clientFrom(async () => {
        calls += 1;
        if (calls === 1) return response([{ safe: true }]);
        throw error;
      });

      const result = await inspectClientesStructure(client, "2.0");

      expectPartial(result, category);
      expect(result.records.recordsFetched).toBe(1);
      expect(result.execution.stoppedAtPage).toBe(2);
      const warning = result.execution.warnings.find(
        (entry) => entry.category === category,
      );
      expect(warning?.httpStatus).toBe(status);
      expect(JSON.stringify(warning)).not.toContain(String(error));
    },
  );

  it("does not serialize payload values and never assumes identity fields", async () => {
    const sensitive = {
      id: "SENSITIVE_CANARY_9F42",
      customerid: "fake-person@example.invalid",
      codigo: "+55-00-00000-0000",
      uuid: "synthetic-access-token",
      header: "Authorization: Bearer synthetic-token",
    };
    let calls = 0;
    const result = await inspectClientesStructure(
      clientFrom(async () =>
        response(calls++ === 0 ? [sensitive, sensitive] : []),
      ),
      "2.0",
    );
    const serialized = JSON.stringify(result);

    expect(result.records).toEqual({
      recordsFetched: 2,
      uniqueRecordsObserved: null,
      duplicateOccurrences: null,
      duplicateDetection: "unavailable_without_assuming_identity_field",
    });
    for (const value of Object.values(sensitive))
      expect(serialized).not.toContain(value);
  });
});

function expectPartial(
  result: ClientesStructuralInspectionResult,
  category: string,
): void {
  expect(result.scan.endpointExhausted).toBe(false);
  expect(result.scan.emptyTerminationPage).toBeNull();
  expect(result.execution.executionComplete).toBe(false);
  expect(result.execution.status).toBe("PARTIAL_NOT_SATURATED");
  expect(result.execution.warnings).toContainEqual(
    expect.objectContaining({ category }),
  );
}
