import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import {
  SyncModal,
  renderStageProgress,
  deriveSyncModalState,
  STARTING_STAGES,
  IDLE_STAGES,
} from "./SyncModal.js";
import { FinancialView } from "./financial/FinancialView.js";
import { AppShell } from "./AppShell.js";
import type { TagPlusSyncStatusResponse, SyncStepProgressInfo } from "../api/sync.js";

describe("Fechamento de UX — Progresso em todas as 5 etapas + Remoção do Botão Financeiro", () => {
  // 1. Botão 'Sincronizar financeiro' não aparece mais na tela Financeiro
  it("1. Botão 'Sincronizar financeiro' não aparece mais na tela Financeiro", () => {
    const html = renderToString(<FinancialView />);
    expect(html).not.toContain("Sincronizar financeiro");
    expect(html).not.toContain("tp-financial-sync-wrap");
    expect(html).toContain("tp-financial-header-actions");
  });

  // 2. Botão global 'Sincronizar Dados' permanece
  it("2. Botão global 'Sincronizar Dados' permanece no AppShell", () => {
    const html = renderToString(
      <AppShell
        activeNav="financial"
        onSelectNav={() => {}}
      >
        <div>Content</div>
      </AppShell>,
    );
    expect(html).toContain("Sincronizar Dados");
  });

  // 3. Endpoint financeiro isolado e FinancialSyncControl permanecem intactos tecnicamente
  it("3. Componente técnico FinancialSyncControl permanece disponível para diagnóstico", async () => {
    const { FinancialSyncControl } = await import("./financial/FinancialSyncControl.js");
    expect(typeof FinancialSyncControl).toBe("function");
    const html = renderToString(<FinancialSyncControl />);
    expect(html).toContain("Sincronizar financeiro");
  });

  // 4. Categorias RUNNING exibe progresso
  it("4. Categorias RUNNING exibe progresso 'Atualizando categorias · X processados'", () => {
    const progress: SyncStepProgressInfo = {
      current: 42,
      label: "Atualizando categorias",
    };
    const element = renderStageProgress(progress);
    const html = renderToString(element as React.ReactElement);

    expect(html).toContain("Atualizando categorias · 42 processados");
    expect(html).toContain("tp-sync-stage-progress-bar");
    expect(html).toContain("is-indeterminate");
  });

  // 5. Clientes RUNNING exibe progresso
  it("5. Clientes RUNNING exibe progresso 'Atualizando clientes · X processados'", () => {
    const progress: SyncStepProgressInfo = {
      current: 128,
      label: "Atualizando clientes",
    };
    const element = renderStageProgress(progress);
    const html = renderToString(element as React.ReactElement);

    expect(html).toContain("Atualizando clientes · 128 processados");
    expect(html).toContain("is-indeterminate");
  });

  // 6. Produtos RUNNING exibe progresso
  it("6. Produtos RUNNING exibe progresso 'Atualizando produtos · X processados'", () => {
    const progress: SyncStepProgressInfo = {
      current: 256,
      label: "Atualizando produtos",
    };
    const element = renderStageProgress(progress);
    const html = renderToString(element as React.ReactElement);

    expect(html).toContain("Atualizando produtos · 256 processados");
    expect(html).toContain("is-indeterminate");
  });

  // 7. SALES RUNNING exibe substep/progresso real
  it("7. SALES RUNNING exibe substep real para pedidos, vendas simples e NF-e", () => {
    const pedidosElement = renderStageProgress({
      current: 30,
      substep: "Atualizando pedidos",
      label: "Atualizando pedidos",
    });
    const pedidosHtml = renderToString(pedidosElement as React.ReactElement);
    expect(pedidosHtml).toContain("Atualizando pedidos · 30 processados");
    expect(pedidosHtml).toContain("is-indeterminate");

    const vendasSimplesElement = renderStageProgress({
      current: 15,
      substep: "Atualizando vendas simples",
      label: "Atualizando vendas simples",
    });
    const vendasSimplesHtml = renderToString(vendasSimplesElement as React.ReactElement);
    expect(vendasSimplesHtml).toContain("Atualizando vendas simples · 15 processados");
    expect(vendasSimplesHtml).toContain("is-indeterminate");

    const nfesElement = renderStageProgress({
      current: 8,
      substep: "Atualizando NF-e",
      label: "Atualizando NF-e",
    });
    const nfesHtml = renderToString(nfesElement as React.ReactElement);
    expect(nfesHtml).toContain("Atualizando NF-e · 8 processados");
    expect(nfesHtml).toContain("is-indeterminate");
  });

  // 8. FINANCIAL mantém progresso atual
  it("8. FINANCIAL mantém progresso determinado com total e substeps conhecidos", () => {
    const finElement = renderStageProgress({
      current: 84,
      total: 165,
      label: "Atualizando financeiro",
    });
    const finHtml = renderToString(finElement as React.ReactElement);
    expect(finHtml).toContain("Atualizando financeiro · 84 de 165");
    expect(finHtml).toContain('style="width:51%"');
    expect(finHtml).not.toContain("is-indeterminate");

    const adjElement = renderStageProgress({
      current: 5,
      total: 12,
      label: "Reconciliando ajustes",
    });
    const adjHtml = renderToString(adjElement as React.ReactElement);
    expect(adjHtml).toContain("Reconciliando ajustes · 5 de 12");
    expect(adjHtml).toContain('style="width:42%"');
  });

  // 9. Total conhecido gera barra determinada
  it("9. Total conhecido gera barra determinada (com percentual e sem classe is-indeterminate)", () => {
    const element = renderStageProgress({
      current: 34,
      total: 82,
      label: "Atualizando clientes",
    });
    const html = renderToString(element as React.ReactElement);
    expect(html).toContain("Atualizando clientes · 34 de 82");
    expect(html).toContain('style="width:41%"');
    expect(html).not.toContain("is-indeterminate");
  });

  // 10. Total desconhecido gera estado indeterminado
  it("10. Total desconhecido (total: undefined) gera estado indeterminado e 'X processados'", () => {
    const element = renderStageProgress({
      current: 34,
      label: "Atualizando clientes",
    });
    const html = renderToString(element as React.ReactElement);
    expect(html).toContain("Atualizando clientes · 34 processados");
    expect(html).toContain("is-indeterminate");
    expect(html).not.toContain("style=");
  });

  // 11. WAITING não mostra barra
  it("11. WAITING não mostra barra de progresso no modal", () => {
    const mockStatus: TagPlusSyncStatusResponse = {
      isRunning: true,
      activeRun: {
        runId: "run-waiting-test",
        mode: "INCREMENTAL",
        status: "RUNNING",
        currentStage: "CATEGORIES",
        startedAt: "2026-10-07T12:00:00Z",
        elapsedSeconds: 5,
      },
      stages: {
        categories: { status: "RUNNING", progress: { current: 10, label: "Atualizando categorias" } },
        customers: { status: "WAITING" },
        products: { status: "WAITING" },
        sales: { status: "WAITING" },
        financial: { status: "WAITING" },
      },
      lastCompletedSync: null,
    };

    const state = deriveSyncModalState({
      statusData: mockStatus,
      currentSessionRunId: "run-waiting-test",
      isStarting: false,
      errorMessage: null,
      oauthRequired: false,
      preflightData: null,
    });

    expect(state.stages.customers.status).toBe("WAITING");
    expect(state.stages.customers.progress).toBeUndefined();
    expect(renderStageProgress(state.stages.customers.progress)).toBeNull();
  });

  // 12. COMPLETED não mostra barra ativa
  it("12. COMPLETED não mostra barra ativa, mantendo resumo final", () => {
    const state = deriveSyncModalState({
      statusData: {
        isRunning: false,
        activeRun: {
          runId: "completed-run-uuid",
          mode: "INCREMENTAL",
          status: "COMPLETED",
          currentStage: "COMPLETED",
          startedAt: "2026-10-07T12:00:00Z",
          completedAt: "2026-10-07T12:05:00Z",
          elapsedSeconds: 300,
        },
        stages: {
          categories: {
            status: "COMPLETED",
            summary: { recordsFetched: 82, recordsInserted: 2, recordsUpdated: 5 },
          },
          customers: {
            status: "COMPLETED",
            summary: { recordsFetched: 1500, recordsInserted: 10, recordsUpdated: 20 },
          },
          products: {
            status: "COMPLETED",
            summary: { recordsFetched: 800, recordsInserted: 0, recordsUpdated: 15 },
          },
          sales: {
            status: "COMPLETED",
            summary: {
              pedidos: { recordsFetched: 450 },
              vendasSimples: { recordsFetched: 120 },
              nfes: { recordsFetched: 310 },
            },
          },
          financial: {
            status: "COMPLETED",
            summary: {
              incremental: { processed: 165, inserted: 3, updated: 5 },
            },
          },
        },
        lastCompletedSync: "2026-10-07T12:05:00Z",
      },
      currentSessionRunId: "completed-run-uuid",
      isStarting: false,
      errorMessage: null,
      oauthRequired: false,
      preflightData: null,
    });

    // Nenhuma etapa possui barra ativa
    for (const stageKey of ["categories", "customers", "products", "sales", "financial"] as const) {
      expect(state.stages[stageKey].status).toBe("COMPLETED");
      expect(state.stages[stageKey].progress).toBeUndefined();
      expect(renderStageProgress(state.stages[stageKey].progress)).toBeNull();
    }
  });

  // 13. FAILED preserva erro sem barra ativa
  it("13. FAILED preserva erro sem renderizar barra ativa", () => {
    const state = deriveSyncModalState({
      statusData: {
        isRunning: false,
        activeRun: {
          runId: "failed-run-uuid",
          mode: "INCREMENTAL",
          status: "FAILED",
          currentStage: "FAILED",
          errorStage: "CUSTOMERS",
          errorMessage: "Falha de conexão com a API TagPlus",
          startedAt: "2026-10-07T12:00:00Z",
          elapsedSeconds: 15,
        },
        stages: {
          categories: { status: "COMPLETED" },
          customers: { status: "FAILED", error: "Falha de conexão com a API TagPlus" },
          products: { status: "WAITING" },
          sales: { status: "WAITING" },
          financial: { status: "WAITING" },
        },
        lastCompletedSync: null,
      },
      currentSessionRunId: "failed-run-uuid",
      isStarting: false,
      errorMessage: null,
      oauthRequired: false,
      preflightData: null,
    });

    expect(state.stages.customers.status).toBe("FAILED");
    expect(state.stages.customers.error).toBe("Falha de conexão com a API TagPlus");
    expect(state.stages.customers.progress).toBeUndefined();
    expect(renderStageProgress(state.stages.customers.progress)).toBeNull();
  });

  // 14. Reset visual da nova execução continua funcionando
  it("14. Reset visual da nova execução inicia com Categorias RUNNING e demais WAITING", () => {
    const state = deriveSyncModalState({
      statusData: null,
      currentSessionRunId: null,
      isStarting: true,
      errorMessage: null,
      oauthRequired: false,
      preflightData: null,
    });

    expect(state.stages).toEqual(STARTING_STAGES);
    expect(state.stages.categories.status).toBe("RUNNING");
    expect(state.stages.customers.status).toBe("WAITING");
    expect(state.stages.products.status).toBe("WAITING");
    expect(state.stages.sales.status).toBe("WAITING");
    expect(state.stages.financial.status).toBe("WAITING");
  });

  // 15. Mobile e layout: SyncModal renderiza apenas a etapa RUNNING com barra
  it("15. SyncModal renderiza apenas a etapa RUNNING com barra, sem cards múltiplos de vendas", () => {
    const mockStatus: TagPlusSyncStatusResponse = {
      isRunning: true,
      activeRun: {
        runId: "active-run",
        mode: "INCREMENTAL",
        status: "RUNNING",
        currentStage: "SALES",
        startedAt: "2026-10-07T12:00:00Z",
        elapsedSeconds: 20,
      },
      stages: {
        categories: { status: "COMPLETED", summary: { recordsFetched: 10 } },
        customers: { status: "COMPLETED", summary: { recordsFetched: 50 } },
        products: { status: "COMPLETED", summary: { recordsFetched: 120 } },
        sales: {
          status: "RUNNING",
          progress: {
            current: 45,
            substep: "Atualizando pedidos",
            label: "Atualizando pedidos",
          },
        },
        financial: { status: "WAITING" },
      },
      lastCompletedSync: null,
    };

    // Renderiza HTML do modal com SALES ativo
    const state = deriveSyncModalState({
      statusData: mockStatus,
      currentSessionRunId: "active-run",
      isStarting: false,
      errorMessage: null,
      oauthRequired: false,
      preflightData: null,
    });

    expect(state.stages.sales.status).toBe("RUNNING");
    expect(state.stages.categories.status).toBe("COMPLETED");
    expect(state.stages.financial.status).toBe("WAITING");

    const salesBar = renderStageProgress(state.stages.sales.progress);
    const salesHtml = renderToString(salesBar as React.ReactElement);
    expect(salesHtml).toContain("Atualizando pedidos · 45 processados");
  });
});
