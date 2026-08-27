import { describe, expect, it, vi } from "vitest";
import {
  analyzePage,
  inspectClientesPagination,
  isLastPage,
} from "../src/integrations/tagplus/inspection/clientes-pagination.js";
import type { TagPlusClient, TagPlusResponse } from "../src/integrations/tagplus/tagplus-client.js";

function response(data: unknown, paginationHeaders: Record<string, string> = {}): TagPlusResponse<unknown> {
  return { status: 200, data, paginationHeaders };
}

describe("clientes pagination inspection", () => {
  it("analyzes non-empty and empty array pages", () => {
    expect(analyzePage("/clientes?page=1", response([{ id: 1 }]), 12)).toMatchObject({
      rootType: "array",
      itemCount: 1,
      technicalIds: ["1"],
    });
    expect(analyzePage("/clientes?page=2", response([]), 8)).toMatchObject({
      rootType: "array",
      itemCount: 0,
      technicalIds: [],
    });
  });

  it("uses a short page as end evidence", () => {
    expect(isLastPage(1, 2)).toBe(true);
    expect(isLastPage(2, 2)).toBe(false);
  });

  it("recognizes explicit pagination metadata", async () => {
    const getMock = vi.fn(async (path: string): Promise<TagPlusResponse<unknown>> => {
      if (path.includes("2147483647")) return response([]);
      if (path.includes("page=0") || path.includes("invalid") || path.includes("per_page=0") || path.includes("per_page=101")) {
        const { TagPlusHttpError } = await import("../src/integrations/tagplus/tagplus-client.js");
        throw new TagPlusHttpError(400);
      }
      return response([{ id: 1 }], { "x-total-count": "1" });
    });
    const client: TagPlusClient = {
      get: async <T>(path: string) => (await getMock(path)) as TagPlusResponse<T>,
    };
    const evidence = await inspectClientesPagination(client, "2.0");
    expect(evidence.explicitTotal).toBe(1);
    expect(evidence.paginationMetadata).toEqual(["x-total-count"]);
    expect(evidence.lastPageEvidence).toBe("short_page");
    expect(evidence.maximumPerPage).toBe(100);
  });

  it("returns sanitized evidence without records or technical IDs", async () => {
    const privateRecord = {
      id: 123,
      nome: "private name",
      cpf: "private cpf",
      email: "private email",
    };
    const getMock = vi.fn(async () => response([privateRecord]));
    const client: TagPlusClient = {
      get: async <T>() => (await getMock()) as TagPlusResponse<T>,
    };
    const evidence = await inspectClientesPagination(client, "2.0");
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain("private name");
    expect(serialized).not.toContain("private cpf");
    expect(serialized).not.toContain("private email");
    expect(serialized).not.toContain("123");
    expect(serialized).not.toContain("technicalIds");
    expect(evidence.realApiCalls).toBe(13);
  });
});
