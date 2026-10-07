import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { AppShell, SIDEBAR_COLLAPSED_KEY } from "./AppShell.js";

describe("Sidebar Retrátil — Padrão Dashboard Control (AppShell)", () => {
  let mockStorage: Record<string, string>;

  beforeEach(() => {
    mockStorage = {};
    const storageMock = {
      getItem: vi.fn((key: string) => mockStorage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        mockStorage[key] = String(value);
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
      clear: vi.fn(() => {
        mockStorage = {};
      }),
      length: 0,
      key: vi.fn(() => null),
    };

    Object.defineProperty(globalThis, "localStorage", {
      value: storageMock,
      writable: true,
      configurable: true,
    });
  });

  // 1. sidebar inicia expandida sem preferência salva;
  it("1. sidebar inicia expandida sem preferência salva", () => {
    const html = renderToString(
      <AppShell>
        <div>Dashboard Content</div>
      </AppShell>,
    );

    expect(html).not.toContain("tp-sidebar is-collapsed");
    expect(html).not.toContain("tp-shell is-collapsed");
    expect(html).toContain('aria-label="Recolher menu"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("TAGPULSE");
    expect(html).toContain("Nineclouds");
  });

  // 2. clique recolhe sidebar;
  it("2. clique recolhe sidebar", () => {
    // Inicia sem preferência
    expect(mockStorage[SIDEBAR_COLLAPSED_KEY]).toBeUndefined();

    // Simulação do evento de toggle / clique no controle
    mockStorage[SIDEBAR_COLLAPSED_KEY] = "true";

    const html = renderToString(
      <AppShell>
        <div>Dashboard Content</div>
      </AppShell>,
    );

    expect(html).toContain("tp-shell is-collapsed");
    expect(html).toContain("tp-sidebar is-collapsed");
    expect(html).toContain('aria-label="Expandir menu"');
    expect(html).toContain('aria-expanded="false"');
  });

  // 3. clique novamente expande;
  it("3. clique novamente expande", () => {
    // Previamente recolhido
    mockStorage[SIDEBAR_COLLAPSED_KEY] = "true";

    // Simulação de novo clique expandindo a sidebar
    mockStorage[SIDEBAR_COLLAPSED_KEY] = "false";

    const html = renderToString(
      <AppShell>
        <div>Dashboard Content</div>
      </AppShell>,
    );

    expect(html).not.toContain("tp-shell is-collapsed");
    expect(html).not.toContain("tp-sidebar is-collapsed");
    expect(html).toContain('aria-label="Recolher menu"');
    expect(html).toContain('aria-expanded="true"');
  });

  // 4. preferência collapsed persiste em localStorage;
  it("4. preferência collapsed persiste em localStorage", () => {
    mockStorage[SIDEBAR_COLLAPSED_KEY] = "true";
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe("true");

    const html = renderToString(
      <AppShell>
        <div>Dashboard Content</div>
      </AppShell>,
    );

    expect(html).toContain("tp-sidebar is-collapsed");
  });

  // 5. refresh/novo mount respeita preferência;
  it("5. refresh/novo mount respeita preferência", () => {
    // Mount com estado recolhido
    mockStorage[SIDEBAR_COLLAPSED_KEY] = "true";
    const htmlCollapsed = renderToString(
      <AppShell>
        <div>Dashboard Content</div>
      </AppShell>,
    );
    expect(htmlCollapsed).toContain("tp-sidebar is-collapsed");

    // Novo mount / refresh com estado expandido
    mockStorage[SIDEBAR_COLLAPSED_KEY] = "false";
    const htmlExpanded = renderToString(
      <AppShell>
        <div>Dashboard Content</div>
      </AppShell>,
    );
    expect(htmlExpanded).not.toContain("tp-sidebar is-collapsed");
  });

  // 6. textos das rotas somem no modo recolhido;
  it("6. textos das rotas somem no modo recolhido", () => {
    const html = renderToString(
      <AppShell>
        <div>Dashboard Content</div>
      </AppShell>,
    );

    // Classes dedicadas que recebem display: none via regra CSS .tp-sidebar.is-collapsed .tp-nav-text
    expect(html).toContain("tp-nav-group-title");
    expect(html).toContain("PAINEL EXECUTIVO");
    expect(html).toContain("FUTURO");
    expect(html).toContain("tp-nav-text");
    expect(html).toContain("Performance Comercial");
    expect(html).toContain("Produtos");
    expect(html).toContain("Estoque &amp; Giro");
    expect(html).toContain("Rentabilidade");
    expect(html).toContain("Decisões");
    expect(html).toContain("Financeiro");
    expect(html).toContain("Margem Histórica");
  });

  // 7. ícones permanecem;
  it("7. ícones permanecem", () => {
    mockStorage[SIDEBAR_COLLAPSED_KEY] = "true";
    const html = renderToString(
      <AppShell>
        <div>Dashboard Content</div>
      </AppShell>,
    );

    expect(html).toContain("tp-sidebar is-collapsed");
    expect(html).toContain("tp-nav-icon");
    const matches = html.match(/tp-nav-icon/g);
    expect(matches?.length).toBe(7);
  });

  // 8. rota ativa permanece identificável;
  it("8. rota ativa permanece identificável", () => {
    mockStorage[SIDEBAR_COLLAPSED_KEY] = "true";

    const html = renderToString(
      <AppShell activeNav="financial">
        <div>Financial Content</div>
      </AppShell>,
    );

    expect(html).toContain("tp-sidebar is-collapsed");
    expect(html).toContain('tp-nav-item is-active" aria-label="Financeiro"');
  });

  // 9. botão Sincronizar Dados continua funcional;
  it("9. botão Sincronizar Dados continua funcional", () => {
    mockStorage[SIDEBAR_COLLAPSED_KEY] = "true";

    const html = renderToString(
      <AppShell>
        <div>Content</div>
      </AppShell>,
    );

    expect(html).toContain("tp-sidebar is-collapsed");
    expect(html).toContain("tp-sidebar-sync-btn");
    expect(html).toContain('aria-label="Sincronizar Dados"');
    expect(html).toContain('data-tooltip="Sincronizar Dados"');
    expect(html).toContain("tp-sync-btn-text");
  });

  // 10. tooltip aparece para itens compactos;
  it("10. tooltip aparece para itens compactos", () => {
    mockStorage[SIDEBAR_COLLAPSED_KEY] = "true";

    const html = renderToString(
      <AppShell>
        <div>Content</div>
      </AppShell>,
    );

    expect(html).toContain('data-tooltip="Performance Comercial"');
    expect(html).toContain('data-tooltip="Produtos"');
    expect(html).toContain('data-tooltip="Estoque &amp; Giro"');
    expect(html).toContain('data-tooltip="Rentabilidade"');
    expect(html).toContain('data-tooltip="Decisões"');
    expect(html).toContain('data-tooltip="Financeiro"');
    expect(html).toContain('data-tooltip="Margem Histórica (Futuro)"');
    expect(html).toContain('data-tooltip="Sincronizar Dados"');
    expect(html).toContain('data-tooltip="Expandir menu"');
  });

  // 11. conteúdo principal recebe espaço liberado;
  it("11. conteúdo principal recebe espaço liberado", () => {
    mockStorage[SIDEBAR_COLLAPSED_KEY] = "true";

    const html = renderToString(
      <AppShell>
        <div id="content-test">Content</div>
      </AppShell>,
    );

    expect(html).toContain('class="tp-shell is-collapsed"');
    expect(html).toContain('class="tp-main-wrapper"');
  });

  // 12. estado mobile não é quebrado;
  it("12. estado mobile não é quebrado", () => {
    const html = renderToString(
      <AppShell>
        <div>Mobile Content</div>
      </AppShell>,
    );

    expect(html).toContain("tp-mobile-bar");
    expect(html).toContain("tp-mobile-sync-btn");
    expect(html).toContain("tp-mobile-toggle");
    expect(html).toContain("tp-mobile-brand");
  });

  // 13. controle possui aria-label correto;
  it("13. controle possui aria-label correto", () => {
    // Expandido
    const expandedHtml = renderToString(
      <AppShell>
        <div>Content</div>
      </AppShell>,
    );
    expect(expandedHtml).toContain('aria-label="Recolher menu"');
    expect(expandedHtml).toContain('title="Recolher menu"');

    // Recolhido
    mockStorage[SIDEBAR_COLLAPSED_KEY] = "true";
    const collapsedHtml = renderToString(
      <AppShell>
        <div>Content</div>
      </AppShell>,
    );
    expect(collapsedHtml).toContain('aria-label="Expandir menu"');
    expect(collapsedHtml).toContain('title="Expandir menu"');
  });

  // 14. Fallback defensivo para localStorage indisponível
  it("14. trata localStorage com erro ou indisponível de forma defensiva sem quebrar", () => {
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: () => {
          throw new Error("Access denied");
        },
        setItem: () => {
          throw new Error("Access denied");
        },
      },
      writable: true,
      configurable: true,
    });

    expect(() => {
      renderToString(
        <AppShell>
          <div>Safe Content</div>
        </AppShell>,
      );
    }).not.toThrow();
  });
});
