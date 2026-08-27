import { describe, expect, it, vi } from "vitest";
import {
  inspectTagPlusConnection,
  TAGPLUS_CONNECTION_ENDPOINT,
} from "../src/integrations/tagplus/connection-inspection.js";

describe("TagPlus connection inspection", () => {
  it("makes one request and returns only sanitized evidence", async () => {
    const get = vi.fn().mockResolvedValue({
      status: 200,
      data: [{ nome: "must not be returned", cpf: "must not be returned" }],
    });
    const now = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(142);

    const evidence = await inspectTagPlusConnection({
      company: { companyId: "company-id", companySlug: "nineclouds" },
      client: { get },
      apiVersion: "2.0",
      now,
      timestamp: () => "2026-08-26T12:00:00.000Z",
    });

    expect(get).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledWith(TAGPLUS_CONNECTION_ENDPOINT);
    expect(evidence).toEqual({
      companySlug: "nineclouds",
      apiVersion: "2.0",
      endpoint: "/clientes?page=1&per_page=1",
      httpStatus: 200,
      durationMs: 42,
      timestamp: "2026-08-26T12:00:00.000Z",
      rootType: "array",
      itemCount: 1,
    });
    expect(JSON.stringify(evidence)).not.toContain("must not be returned");
    expect(JSON.stringify(evidence)).not.toContain("company-id");
  });
});
