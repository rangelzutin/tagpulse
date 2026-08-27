import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const oauthConfig = {
  authUrl: "https://developers.tagplus.com.br/authorize",
  baseUrl: "https://api.tagplus.com.br",
  clientId: "client-id-value",
  clientSecret: "client-secret-value",
  scopes: "read:clientes",
  apiVersion: "2.0",
};

afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

async function createApp(fetchMock = vi.fn<typeof fetch>()) {
  const app = await buildApp({
    databaseHealth: { check: vi.fn() },
    frontendUrl: "http://localhost:5173",
    logger: false,
    tagPlusOAuth: { config: oauthConfig, fetch: fetchMock },
  });
  apps.push(app);
  return app;
}

describe("TagPlus OAuth routes", () => {
  it("rejects a callback without code", async () => {
    const app = await createApp();
    const response = await app.inject({ method: "GET", url: "/integrations/tagplus/callback" });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ status: "error", message: "Missing authorization code" });
  });

  it("rejects invalid state without calling TagPlus", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const app = await createApp(fetchMock);
    const response = await app.inject({ method: "GET", url: "/integrations/tagplus/callback?code=x&state=invalid" });
    expect(response.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exchanges the code, validates once, and never returns tokens", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 86400 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ nome: "private customer" }]), { status: 200 }));
    const app = await createApp(fetchMock);
    const authorize = await app.inject({ method: "GET", url: "/integrations/tagplus/authorize" });
    const state = new URL(authorize.headers.location ?? "").searchParams.get("state");
    const callback = await app.inject({ method: "GET", url: `/integrations/tagplus/callback?code=valid-code&state=${state}` });
    expect(callback.statusCode).toBe(200);
    expect(callback.json()).toEqual({
      status: "authorized",
      accessTokenReceived: true,
      refreshTokenReceived: true,
      expiresIn: 86400,
      validation: { endpoint: "/clientes?page=1&per_page=1", httpStatus: 200, durationMs: expect.any(Number), rootType: "array", itemCount: 1 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(callback.body).not.toContain("access-secret");
    expect(callback.body).not.toContain("refresh-secret");
    expect(callback.body).not.toContain("private customer");
  });
});
