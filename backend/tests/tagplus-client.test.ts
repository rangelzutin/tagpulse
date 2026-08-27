import { describe, expect, it, vi } from "vitest";
import {
  createTagPlusClient,
  TagPlusHttpError,
  TagPlusInvalidResponseError,
  TagPlusNetworkError,
  TagPlusTimeoutError,
} from "../src/integrations/tagplus/tagplus-client.js";

const secrets = {
  accessToken: "access-token-that-must-not-leak",
  clientId: "client-id-that-must-not-leak",
  clientSecret: "client-secret-that-must-not-leak",
  refreshToken: "refresh-token-that-must-not-leak",
};

function createClient(fetchImplementation: typeof fetch, timeoutMs = 10_000) {
  return createTagPlusClient({
    baseUrl: "https://api.tagplus.com.br",
    apiVersion: "2.0",
    accessToken: secrets.accessToken,
    fetch: fetchImplementation,
    timeoutMs,
  });
}

function expectSecretsSanitized(error: unknown): void {
  const serialized = String(error);
  for (const secret of Object.values(secrets)) {
    expect(serialized).not.toContain(secret);
  }
  expect(serialized).not.toContain("Authorization");
}

describe("TagPlus client", () => {
  it("builds the URL and sends authentication and API version headers", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify([{ id: 1 }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = createClient(fetchMock);

    const result = await client.get<{ id: number }[]>("/clientes?page=1");

    expect(result).toEqual({
      status: 200,
      data: [{ id: 1 }],
      paginationHeaders: {},
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.tagplus.com.br/clientes?page=1");
    expect(init).toMatchObject({
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${secrets.accessToken}`,
        "X-Api-Version": "2.0",
      },
    });
  });

  it.each([401, 403])(
    "handles HTTP %i without exposing credentials",
    async (status) => {
      const responseBody = JSON.stringify({
        message: `${secrets.accessToken} ${secrets.clientSecret}`,
      });
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(responseBody, { status }));
      const client = createClient(fetchMock);

      const request = client.get("/clientes");

      await expect(request).rejects.toBeInstanceOf(TagPlusHttpError);
      try {
        await request;
      } catch (error: unknown) {
        expect(error).toMatchObject({ status });
        expectSecretsSanitized(error);
      }
    },
  );

  it("turns an aborted request into a controlled timeout error", async () => {
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    });
    const client = createClient(fetchMock, 1);

    const request = client.get("/clientes");

    await expect(request).rejects.toBeInstanceOf(TagPlusTimeoutError);
    try {
      await request;
    } catch (error: unknown) {
      expectSecretsSanitized(error);
    }
  });

  it("rejects invalid JSON with a controlled error", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("not-json", { status: 200 }));
    const client = createClient(fetchMock);

    const request = client.get("/clientes");

    await expect(request).rejects.toBeInstanceOf(TagPlusInvalidResponseError);
    try {
      await request;
    } catch (error: unknown) {
      expectSecretsSanitized(error);
    }
  });

  it("turns a fetch failure into a controlled network error", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError(`network ${secrets.accessToken}`));
    const client = createClient(fetchMock);

    const request = client.get("/clientes");

    await expect(request).rejects.toBeInstanceOf(TagPlusNetworkError);
    try {
      await request;
    } catch (error: unknown) {
      expectSecretsSanitized(error);
    }
  });
});
