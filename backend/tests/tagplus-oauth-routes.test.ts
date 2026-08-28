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
  it("rejects full structural census without OAuth authorization", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/integrations/tagplus/inspect-clientes-full-structure-census",
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      status: "error",
      message: "OAuth authorization required",
    });
  });

  it("rejects full structure discovery without OAuth authorization", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/integrations/tagplus/inspect-clientes-full-structure",
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      status: "error",
      message: "OAuth authorization required",
    });
  });

  it("rejects field characterization without OAuth authorization", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/integrations/tagplus/inspect-clientes-fields",
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      status: "error",
      message: "OAuth authorization required",
    });
  });

  it("rejects structural inspection without OAuth authorization", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/integrations/tagplus/inspect-clientes-structure",
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      status: "error",
      message: "OAuth authorization required",
    });
  });

  it("rejects a callback without code", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/integrations/tagplus/callback",
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      status: "error",
      message: "Missing authorization code",
    });
  });

  it("rejects invalid state without calling TagPlus", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const app = await createApp(fetchMock);
    const response = await app.inject({
      method: "GET",
      url: "/integrations/tagplus/callback?code=x&state=invalid",
    });
    expect(response.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exchanges the code, validates once, and never returns tokens", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "access-secret",
            refresh_token: "refresh-secret",
            expires_in: 86400,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ nome: "private customer" }]), {
          status: 200,
        }),
      );
    const app = await createApp(fetchMock);
    const authorize = await app.inject({
      method: "GET",
      url: "/integrations/tagplus/authorize",
    });
    const state = new URL(authorize.headers.location ?? "").searchParams.get(
      "state",
    );
    const callback = await app.inject({
      method: "GET",
      url: `/integrations/tagplus/callback?code=valid-code&state=${state}`,
    });
    expect(callback.statusCode).toBe(200);
    expect(callback.json()).toEqual({
      status: "authorized",
      accessTokenReceived: true,
      refreshTokenReceived: true,
      expiresIn: 86400,
      validation: {
        endpoint: "/clientes?page=1&per_page=1",
        httpStatus: 200,
        durationMs: expect.any(Number),
        rootType: "array",
        itemCount: 1,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(callback.body).not.toContain("access-secret");
    expect(callback.body).not.toContain("refresh-secret");
    expect(callback.body).not.toContain("private customer");
  });

  it("runs the structural inspection through the authorized client without returning values", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "synthetic-route-token" }),
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
            {
              id: "SENSITIVE_CANARY_ROUTE_7B91",
              email: "fake-route@example.invalid",
              secret: "synthetic-route-token",
            },
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
    const callback = await app.inject({
      method: "GET",
      url: `/integrations/tagplus/callback?code=valid-code&state=${state}`,
    });
    expect(callback.statusCode).toBe(200);

    const response = await app.inject({
      method: "GET",
      url: "/integrations/tagplus/inspect-clientes-structure",
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      resource: "clientes",
      scan: {
        firstPage: 1,
        perPage: 100,
        lastNonEmptyPage: 1,
        emptyTerminationPage: 2,
        endpointExhausted: true,
      },
      execution: { executionComplete: true },
      records: {
        recordsFetched: 1,
        uniqueRecordsObserved: null,
        duplicateOccurrences: null,
        duplicateDetection: "unavailable_without_assuming_identity_field",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe(
      "https://api.tagplus.com.br/clientes?page=1&per_page=100",
    );
    expect(String(fetchMock.mock.calls[3]?.[0])).toBe(
      "https://api.tagplus.com.br/clientes?page=2&per_page=100",
    );
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer synthetic-route-token",
    });
    expect(response.body).not.toContain("SENSITIVE_CANARY_ROUTE_7B91");
    expect(response.body).not.toContain("fake-route@example.invalid");
    expect(response.body).not.toContain("synthetic-route-token");
  });

  it("runs privacy-safe field characterization through the authorized client", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "synthetic-field-route-token" }),
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
            {
              id: "ENTITY_ID_CANARY",
              id_entidade: "CUSTOMER_ID_CANARY",
              razao_social: "CLIENT_SECRET_CANARY",
              cpf: "12345678901",
              cnpj: null,
            },
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
      url: `/integrations/tagplus/callback?code=valid-code&state=${state}`,
    });

    const response = await app.inject({
      method: "GET",
      url: "/integrations/tagplus/inspect-clientes-fields",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      resource: "clientes",
      scan: {
        recordsFetched: 1,
        nonEmptyPages: 1,
        lastNonEmptyPage: 1,
        lastPageRecords: 1,
        emptyTerminationPage: 2,
        endpointExhausted: true,
      },
      execution: {
        executionComplete: true,
        status: "COMPLETE_ENDPOINT_EXHAUSTED",
      },
    });
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer synthetic-field-route-token",
    });
    for (const canary of [
      "synthetic-field-route-token",
      "ENTITY_ID_CANARY",
      "CUSTOMER_ID_CANARY",
      "CLIENT_SECRET_CANARY",
      "12345678901",
    ])
      expect(response.body).not.toContain(canary);
  });

  it("runs privacy-safe full structure discovery through the authorized client", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "synthetic-discovery-route-token" }),
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
            { id: 73, razao_social: "CUSTOMER_NAME_ROUTE_CANARY" },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ id: 73, email: "EMAIL_ROUTE_CANARY" }]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 73,
            contatos: [{ valor: "PHONE_ROUTE_CANARY" }],
          }),
          { status: 200 },
        ),
      );
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
      url: `/integrations/tagplus/callback?code=valid-code&state=${state}`,
    });

    const response = await app.inject({
      method: "GET",
      url: "/integrations/tagplus/inspect-clientes-full-structure",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      resource: "clientes",
      execution: {
        status: "COMPLETE",
        sameRecordAcrossCollections: true,
        itemMatchesDefault: true,
      },
      comparison: {
        pathsOnlyInFieldsAll: ["$.email"],
        pathsOnlyInItem: ["$.contatos", "$.contatos[]", "$.contatos[].valor"],
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe(
      "https://api.tagplus.com.br/clientes?page=1&per_page=1",
    );
    expect(String(fetchMock.mock.calls[3]?.[0])).toBe(
      "https://api.tagplus.com.br/clientes?fields=*&page=1&per_page=1",
    );
    expect(String(fetchMock.mock.calls[4]?.[0])).toBe(
      "https://api.tagplus.com.br/clientes/73",
    );
    expect(fetchMock.mock.calls[4]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer synthetic-discovery-route-token",
    });
    for (const canary of [
      "synthetic-discovery-route-token",
      "CUSTOMER_NAME_ROUTE_CANARY",
      "EMAIL_ROUTE_CANARY",
      "PHONE_ROUTE_CANARY",
      "/clientes/73",
    ])
      expect(response.body).not.toContain(canary);
  });

  it("runs the full structural census sequentially without returning values", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "census-route-token" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ status: "validation-only" }]), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "CUSTOMER_CENSUS_CANARY",
              email: "fake-census@example.invalid",
            },
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
      url: `/integrations/tagplus/callback?code=valid-code&state=${state}`,
    });

    const response = await app.inject({
      method: "GET",
      url: "/integrations/tagplus/inspect-clientes-full-structure-census",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      resource: "clientes",
      projection: "fields_all",
      execution: {
        recordsFetched: 1,
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
    for (const canary of [
      "census-route-token",
      "CUSTOMER_CENSUS_CANARY",
      "fake-census@example.invalid",
    ])
      expect(response.body).not.toContain(canary);
  });
});
