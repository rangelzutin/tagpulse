import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { createTagPlusOAuthTokenStore } from "../src/integrations/tagplus/oauth-token-store.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const config = {
  authUrl: "https://developers.tagplus.com.br/authorize",
  baseUrl: "https://api.tagplus.com.br",
  clientId: "synthetic-client-id",
  clientSecret: "synthetic-client-secret-canary",
  scopes: "read:clientes read:produtos read:pedidos read:vendas_simples read:nfes",
  apiVersion: "2.0",
};

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function createApp(
  fetchMock = vi.fn<typeof fetch>(),
  tokenStore = createTagPlusOAuthTokenStore(),
) {
  const app = await buildApp({
    databaseHealth: { check: vi.fn() },
    frontendUrl: "http://localhost:5173",
    logger: false,
    tagPlusOAuth: { config, fetch: fetchMock, tokenStore },
  });
  apps.push(app);
  return { app, tokenStore };
}

describe("Sales Control Case Inspection (/integrations/tagplus/inspect-sales-control-case)", () => {
  it("requires OAuth and returns 409 when token is absent", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const { app } = await createApp(fetchMock);

    const response = await app.inject({
      method: "GET",
      url: "/integrations/tagplus/inspect-sales-control-case",
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      status: "error",
      message: "OAuth authorization required",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("finds target Pedido 1239, Venda Simples 626 and NF-e 2713 and calls detail by real API id", async () => {
    const ACCESS_TOKEN_CANARY = "CANARY_TOKEN_ACCESS_12345";
    const REFRESH_TOKEN_CANARY = "CANARY_TOKEN_REFRESH_67890";

    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);

      // 1. Pedidos query probe
      if (url.includes("/pedidos?numero=1239")) {
        return new Response(
          JSON.stringify([
            {
              id: 1282, // Real API id for Pedido 1239
              numero: 1239,
              status: "A",
              cliente: {
                id: 507,
                razao_social: "Empresa Confidencial Ltda",
                cpf: "000.000.000-00",
              },
              data_criacao: "2025-10-31",
              valor_total: 14242.5,
            },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      // 2. Pedidos detail by real API id (1282)
      if (url.includes("/pedidos/1282?fields=*")) {
        return new Response(
          JSON.stringify({
            id: 1282,
            numero: 1239,
            status: "A",
            cliente: {
              id: 507,
              razao_social: "Empresa Confidencial Ltda",
              cpf: "000.000.000-00",
            },
            data_criacao: "2025-10-31",
            data_confirmacao: "2025-10-31",
            valor_produtos: 14242.5,
            valor_desconto: 2617.5,
            valor_total: 14242.5,
            itens: [
              {
                id: 98226,
                produto_servico: {
                  id: 2152,
                  codigo: "2086689434242",
                  descricao: "Shape Nineclouds Pro",
                },
                qtd: 4,
                valor_unitario: 189.9,
                valor_desconto: 0,
                valor_subtotal: 759.6,
              },
            ],
            possui_vinculo: true,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      // 3. Vendas simples query probe (returns match directly)
      if (url.includes("/vendas_simples?numero=626")) {
        return new Response(
          JSON.stringify([
            {
              id: 7022, // Real API id for Venda Simples 626
              numero: "626",
              status: "A",
              pedido_os_vinculada: { id: 1282, numero: 1239, tipo: "NF" },
              data_criacao: "2025-10-31 23:38:10",
              data_confirmacao: "2025-10-31 23:41:41",
            },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      // 4. Vendas simples detail by real API id (7022)
      if (url.includes("/vendas_simples/7022?fields=*")) {
        return new Response(
          JSON.stringify({
            id: 7022,
            numero: "626",
            status: "A",
            cliente: {
              id: 507,
              razao_social: "Empresa Confidencial Ltda",
              cpf: "000.000.000-00",
            },
            pedido_os_vinculada: { id: 1282, numero: 1239, tipo: "NF" },
            data_criacao: "2025-10-31 23:38:10",
            data_confirmacao: "2025-10-31 23:41:41",
            valor_desconto: 2617.78,
            valor_total: 7120.97,
            itens: [
              {
                id: 51134,
                produto_servico: {
                  id: 2152,
                  codigo: "2086689434242",
                  descricao: "Shape Nineclouds Pro",
                },
                qtd: 4,
                valor_unitario: 94.95,
                valor_desconto: 0,
                valor_subtotal: 379.8,
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      // 5. NF-e query probe
      if (url.includes("/nfes?numero=2713")) {
        return new Response(
          JSON.stringify([
            {
              id: 54321, // Real API id for NF-e 2713
              numero: 2713,
              serie: 1,
              status: "A",
              cliente: {
                id: 507,
                razao_social: "Empresa Confidencial Ltda",
                cpf: "000.000.000-00",
              },
              data_criacao: "2025-10-31 23:45:00",
              data_emissao: "2025-10-31 23:45:00",
              data_confirmacao: "2025-10-31 23:46:00",
              valor_total: 7120.97,
            },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      // 6. NF-e detail by real API id (54321)
      if (url.includes("/nfes/54321?fields=*")) {
        return new Response(
          JSON.stringify({
            id: 54321,
            numero: 2713,
            serie: 1,
            status: "A",
            cliente: {
              id: 507,
              razao_social: "Empresa Confidencial Ltda",
              cpf: "000.000.000-00",
            },
            pedido_os_vinculada: { id: 1282, numero: 1239, tipo: "NF" },
            data_criacao: "2025-10-31 23:45:00",
            data_emissao: "2025-10-31 23:45:00",
            data_confirmacao: "2025-10-31 23:46:00",
            valor_total: 7120.97,
            valor_desconto: 2617.78,
            itens: [
              {
                id: 61001,
                produto_servico: {
                  id: 2152,
                  codigo: "2086689434242",
                  descricao: "Shape Nineclouds Pro",
                },
                qtd: 4,
                valor_unitario: 94.95,
                valor_desconto: 0,
                valor_subtotal: 379.8,
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      return new Response("Not Found", { status: 404 });
    });

    const tokenStore = createTagPlusOAuthTokenStore();
    tokenStore.set({
      accessToken: ACCESS_TOKEN_CANARY,
      refreshToken: REFRESH_TOKEN_CANARY,
    });

    const { app } = await createApp(fetchMock, tokenStore);

    const response = await app.inject({
      method: "GET",
      url: "/integrations/tagplus/inspect-sales-control-case",
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();

    // Verify Pedido discovery & BUGFIXES
    expect(json.pedido.found).toBe(true);
    expect(json.pedido.targetVisibleNumero).toBe(1239);
    expect(json.pedido.actualApiId).toBe(1282);
    expect(json.pedido.visibleNumeroFound).toBe(1239);
    expect(json.pedido.detailFetched).toBe(true);
    expect(json.pedido.terminationReason).toBe("FOUND");
    // BUGFIX 1 verification: data_criacao present
    expect(json.pedido.structuralFields.creationDate.present).toBe(true);
    expect(json.pedido.structuralFields.creationDate.observedFieldName).toBe("data_criacao");
    expect(json.pedido.structuralFields.creationDate.valueSample).toBe("2025-10-31");
    // BUGFIX 2 verification: itens[].valor_subtotal present
    expect(json.pedido.structuralFields.itemSubtotal.present).toBe(true);
    expect(json.pedido.structuralFields.itemSubtotal.observedFieldName).toBe("valor_subtotal");
    expect(json.pedido.structuralFields.itemSubtotal.valueSample).toBe(759.6);
    // Product reference verification
    expect(json.pedido.structuralFields.productReference.present).toBe(true);
    expect(json.pedido.structuralFields.productReference.observedFieldName).toBe("produto_servico");

    // Verify Venda Simples discovery & BUGFIXES
    expect(json.vendaSimples.found).toBe(true);
    expect(json.vendaSimples.targetVisibleNumero).toBe(626);
    expect(json.vendaSimples.actualApiId).toBe(7022);
    expect(json.vendaSimples.visibleNumeroFound).toBe("626");
    // BUGFIX 1 verification: data_criacao present
    expect(json.vendaSimples.structuralFields.creationDate.present).toBe(true);
    expect(json.vendaSimples.structuralFields.creationDate.observedFieldName).toBe("data_criacao");
    // BUGFIX 2 verification: itens[].valor_subtotal present
    expect(json.vendaSimples.structuralFields.itemSubtotal.present).toBe(true);
    expect(json.vendaSimples.structuralFields.itemSubtotal.observedFieldName).toBe("valor_subtotal");
    expect(json.vendaSimples.structuralFields.itemSubtotal.valueSample).toBe(379.8);
    // Linked Pedido reference verification
    expect(
      json.vendaSimples.structuralFields.linkedPedidoReference?.present,
    ).toBe(true);
    expect(
      json.vendaSimples.structuralFields.linkedPedidoReference?.observedFieldName,
    ).toBe("pedido_os_vinculada");

    // Verify NF-e discovery
    expect(json.nfe.found).toBe(true);
    expect(json.nfe.targetVisibleNumero).toBe(2713);
    expect(json.nfe.actualApiId).toBe(54321);
    expect(json.nfe.visibleNumeroFound).toBe(2713);
    expect(json.nfe.detailFetched).toBe(true);
    expect(json.nfe.terminationReason).toBe("FOUND");
    expect(json.nfe.structuralFields.serie?.present).toBe(true);
    expect(json.nfe.structuralFields.serie?.valueSample).toBe(1);
    expect(json.nfe.structuralFields.creationDate.present).toBe(true);
    expect(json.nfe.structuralFields.creationDate.observedFieldName).toBe("data_criacao");
    expect(json.nfe.structuralFields.dataEmissao?.present).toBe(true);
    expect(json.nfe.structuralFields.itemSubtotal.present).toBe(true);
    expect(json.nfe.structuralFields.itemSubtotal.valueSample).toBe(379.8);
    expect(json.nfe.structuralFields.linkedPedidoReference?.present).toBe(true);
    expect(json.nfe.structuralFields.linkedPedidoReference?.observedFieldName).toBe("pedido_os_vinculada");

    // Verify detail calls used REAL API ID, NOT visible document number
    const calledUrls = fetchMock.mock.calls.map(([req]) => String(req));
    expect(calledUrls).toContain(
      "https://api.tagplus.com.br/pedidos/1282?fields=*",
    );
    expect(calledUrls).toContain(
      "https://api.tagplus.com.br/vendas_simples/7022?fields=*",
    );
    expect(calledUrls).toContain(
      "https://api.tagplus.com.br/nfes/54321?fields=*",
    );

    // Verify scope acceptance
    expect(json.scopeEvaluation.readPedidosAccepted).toBe(true);
    expect(json.scopeEvaluation.readVendasSimplesAccepted).toBe(true);
    expect(json.scopeEvaluation.readNfesAccepted).toBe(true);

    // Security Canary Check: NO tokens or secrets in response
    const rawOutput = response.body;
    expect(rawOutput).not.toContain(ACCESS_TOKEN_CANARY);
    expect(rawOutput).not.toContain(REFRESH_TOKEN_CANARY);
    expect(rawOutput).not.toContain("synthetic-client-secret");

    // PII Redaction Check: customer name / CPF must be redacted
    expect(rawOutput).not.toContain("Empresa Confidencial Ltda");
    expect(rawOutput).not.toContain("000.000.000-00");
  });

  it("stops within bounded page limit when target is not found", async () => {
    let callCount = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      callCount += 1;
      const url = String(input);
      if (url.includes("/pedidos") || url.includes("/vendas_simples") || url.includes("/nfes")) {
        return new Response(
          JSON.stringify([
            { id: 1000 + callCount, numero: 5000 + callCount, status: "Pendente" },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const tokenStore = createTagPlusOAuthTokenStore();
    tokenStore.set({ accessToken: "TEST_TOKEN" });

    const { app } = await createApp(fetchMock, tokenStore);

    const response = await app.inject({
      method: "GET",
      url: "/integrations/tagplus/inspect-sales-control-case",
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();

    expect(json.pedido.found).toBe(false);
    expect(json.pedido.terminationReason).toBe("BOUNDED_PAGE_LIMIT_REACHED");
    expect(json.pedido.pagesChecked).toBeLessThanOrEqual(5);

    expect(json.vendaSimples.found).toBe(false);
    expect(json.vendaSimples.terminationReason).toBe("BOUNDED_PAGE_LIMIT_REACHED");
    expect(json.vendaSimples.pagesChecked).toBeLessThanOrEqual(5);

    expect(json.nfe.found).toBe(false);
    expect(json.nfe.terminationReason).toBe("BOUNDED_PAGE_LIMIT_REACHED");
    expect(json.nfe.pagesChecked).toBeLessThanOrEqual(5);

    // No detail calls should have been made
    const calledUrls = fetchMock.mock.calls.map(([req]) => String(req));
    expect(calledUrls.some((u) => u.includes("?fields=*"))).toBe(false);
  });

  it("evaluates scope forbidden (401/403) cleanly without crashing", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("/pedidos")) {
        return new Response(JSON.stringify({ message: "Forbidden" }), {
          status: 403,
        });
      }
      if (url.includes("/vendas_simples")) {
        return new Response(JSON.stringify({ message: "Forbidden" }), {
          status: 403,
        });
      }
      if (url.includes("/nfes")) {
        return new Response(
          JSON.stringify({ error_code: "escopo_nao_autorizado", message: "Escopo nao autorizado" }),
          { status: 401 },
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const tokenStore = createTagPlusOAuthTokenStore();
    tokenStore.set({ accessToken: "TEST_TOKEN" });

    const { app } = await createApp(fetchMock, tokenStore);

    const response = await app.inject({
      method: "GET",
      url: "/integrations/tagplus/inspect-sales-control-case",
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();

    expect(json.scopeEvaluation.readPedidosAccepted).toBe(false);
    expect(json.scopeEvaluation.readVendasSimplesAccepted).toBe(false);
    expect(json.scopeEvaluation.readNfesAccepted).toBe(false);
    expect(json.pedido.terminationReason).toBe("SCOPE_FORBIDDEN");
    expect(json.vendaSimples.terminationReason).toBe("SCOPE_FORBIDDEN");
    expect(json.nfe.terminationReason).toBe("SCOPE_FORBIDDEN");
  });
});
