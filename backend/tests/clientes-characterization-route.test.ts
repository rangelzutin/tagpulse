import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const config = {
  authUrl: "https://developers.tagplus.com.br/authorize",
  baseUrl: "https://api.tagplus.com.br",
  clientId: "synthetic-client",
  clientSecret: "synthetic-secret",
  scopes: "read:clientes",
  apiVersion: "2.0",
};

afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

async function createApp(fetchMock = vi.fn<typeof fetch>()) {
  const app = await buildApp({
    databaseHealth: { check: vi.fn() },
    frontendUrl: "http://localhost:5173",
    logger: false,
    tagPlusOAuth: { config, fetch: fetchMock },
  });
  apps.push(app);
  return app;
}

describe("clientes characterization OAuth route", () => {
  it("requires OAuth and makes no upstream request when unauthorized", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const app = await createApp(fetchMock);
    const response = await app.inject({
      method: "GET",
      url: "/integrations/tagplus/inspect-clientes-characterization",
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      status: "error",
      message: "OAuth authorization required",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("runs one mocked sequential scan without returning token or values", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "TOKEN_CANARY",
            refresh_token: "REFRESH_TOKEN_CANARY",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ status: "validation-only" }]), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { id: "CUSTOMER_ID_CANARY", email: "EMAIL_CANARY", contatos: [] },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    const app = await createApp(fetchMock);
    const authorize = await app.inject({
      method: "GET",
      url: "/integrations/tagplus/authorize",
    });
    const state = new URL(authorize.headers.location ?? "").searchParams.get(
      "state",
    );
    await app.inject({
      method: "GET",
      url: `/integrations/tagplus/callback?code=valid&state=${state}`,
    });
    const response = await app.inject({
      method: "GET",
      url: "/integrations/tagplus/inspect-clientes-characterization",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      resource: "clientes",
      projection: "fields_all",
      execution: {
        recordsProcessed: 1,
        pagesProcessed: 1,
        emptyTerminationPage: 2,
        status: "COMPLETE_ENDPOINT_EXHAUSTED",
      },
    });
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe(
      "https://api.tagplus.com.br/clientes?fields=*&page=1&per_page=100",
    );
    expect(String(fetchMock.mock.calls[3]?.[0])).toBe(
      "https://api.tagplus.com.br/clientes?fields=*&page=2&per_page=100",
    );
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer TOKEN_CANARY",
    });
    for (const canary of [
      "TOKEN_CANARY",
      "REFRESH_TOKEN_CANARY",
      "CUSTOMER_ID_CANARY",
      "EMAIL_CANARY",
    ])
      expect(response.body).not.toContain(canary);
  });
});
