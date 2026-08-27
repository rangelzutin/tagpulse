import { describe, expect, it, vi } from "vitest";
import {
  createAuthorizationUrl,
  exchangeAuthorizationCode,
  TagPlusOAuthError,
  TagPlusOAuthTimeoutError,
} from "../src/integrations/tagplus/oauth.js";

const config = {
  authUrl: "https://developers.tagplus.com.br/authorize",
  baseUrl: "https://api.tagplus.com.br",
  clientId: "client-id-secret-value",
  clientSecret: "client-secret-value",
  scopes: "read:clientes",
};

describe("TagPlus OAuth", () => {
  it("generates the official authorization URL with read-only scope and state", () => {
    const url = createAuthorizationUrl(config, "csrf-state");
    expect(url.origin + url.pathname).toBe(config.authUrl);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: config.clientId,
      scope: "read:clientes",
      state: "csrf-state",
    });
    expect(url.searchParams.has("client_secret")).toBe(false);
    expect(url.searchParams.has("redirect_uri")).toBe(false);
  });

  it("rejects write scopes", () => {
    expect(() =>
      createAuthorizationUrl({ ...config, scopes: "read:clientes write:clientes" }, "state"),
    ).toThrow("read scopes only");
  });

  it("exchanges a code using a form body and parses a valid response", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 86400 }),
        { status: 200 },
      ),
    );
    const tokens = await exchangeAuthorizationCode(config, "one-time-code", { fetch: fetchMock });
    expect(tokens).toEqual({ accessToken: "access-secret", refreshToken: "refresh-secret", expiresIn: 86400 });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.tagplus.com.br/oauth2/token");
    expect(init?.method).toBe("POST");
    expect(String(init?.body)).toBe(
      "grant_type=authorization_code&code=one-time-code&client_id=client-id-secret-value&client_secret=client-secret-value",
    );
  });

  it.each([400, 401])("sanitizes token endpoint HTTP %i errors", async (status) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(`leaked ${config.clientSecret}`, { status }),
    );
    const request = exchangeAuthorizationCode(config, "secret-code", { fetch: fetchMock });
    await expect(request).rejects.toBeInstanceOf(TagPlusOAuthError);
    await expect(request).rejects.toMatchObject({
      evidence: {
        stage: "token_exchange",
        endpoint: "https://api.tagplus.com.br/oauth2/token",
        category: "http_error",
        httpStatus: status,
        durationMs: expect.any(Number),
      },
    });
    await expect(request).rejects.not.toThrow(config.clientSecret);
    await expect(request).rejects.not.toThrow("secret-code");
  });

  it("handles timeout without leaking request values", async () => {
    const fetchMock = vi.fn<typeof fetch>((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error(config.clientSecret)));
      }),
    );
    await expect(
      exchangeAuthorizationCode(config, "secret-code", { fetch: fetchMock, timeoutMs: 1 }),
    ).rejects.toMatchObject({
      name: TagPlusOAuthTimeoutError.name,
      evidence: { stage: "token_exchange", category: "timeout" },
    });
  });

  it("rejects invalid JSON with a sanitized error", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("not-json", { status: 200 }));
    await expect(exchangeAuthorizationCode(config, "secret-code", { fetch: fetchMock })).rejects.toThrow(
      "not valid JSON",
    );
  });

  it("reports only field presence when a successful response lacks access_token", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ refresh_token: "refresh-secret", expires_in: 86400 }), { status: 200 }),
    );
    await expect(exchangeAuthorizationCode(config, "secret-code", { fetch: fetchMock })).rejects.toMatchObject({
      evidence: {
        stage: "access_token_validation",
        category: "invalid_token_response",
        httpStatus: 200,
        fields: {
          accessTokenPresent: false,
          refreshTokenPresent: true,
          expiresInPresent: true,
          scopePresent: false,
        },
      },
    });
  });
});
