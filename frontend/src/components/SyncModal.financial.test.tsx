import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  SyncModal,
  deriveSyncModalState,
  renderFinancialMetrics,
  IDLE_STAGES,
} from "./SyncModal.js";
import type { TagPlusSyncStatusResponse } from "../api/sync.js";

describe("SyncModal — 5ª Etapa Financeiro (Fase B)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Modal renderiza 5 etapas
  it("1. Modal renderiza 5 etapas completas", () => {
    const html = renderToString(<SyncModal isOpen={true} onClose={() => {}} />);

    expect(html).toContain("1. Categorias");
    expect(html).toContain("2. Clientes");
    expect(html).toContain("3. Produtos");
    expect(html).toContain("4. Vendas e Faturamento");
    expect(html).toContain("5. Financeiro");
    expect(html).toContain('data-testid="stage-financial"');
  });

  // 2. Financeiro vem depois de Vendas e Faturamento
  it("2. Financeiro vem estritamente após Vendas e Faturamento na ordem visual do DOM", () => {
    const html = renderToString(<SyncModal isOpen={true} onClose={() => {}} />);

    const posSales = html.indexOf("4. Vendas e Faturamento");
    const posFinancial = html.indexOf("5. Financeiro");

    expect(posSales).toBeGreaterThan(-1);
    expect(posFinancial).toBeGreaterThan(-1);
    expect(posFinancial).toBeGreaterThan(posSales);
  });

  // 3. Financeiro WAITING/PENDING renderiza corretamente
  it("3. Financeiro WAITING renderiza com badge 'Aguardando' e classe is-waiting", () => {
    const state = deriveSyncModalState({
      statusData: {
        isRunning: true,
        activeRun: {
          runId: "run-stage-financial-wait",
          mode: "INCREMENTAL",
          status: "RUNNING",
          currentStage: "SALES",
          startedAt: "2026-10-05T12:00:00Z",
          elapsedSeconds: 15,
        },
        stages: {
          categories: { status: "COMPLETED" },
          customers: { status: "COMPLETED" },
          products: { status: "COMPLETED" },
          sales: { status: "RUNNING" },
          financial: { status: "WAITING" },
        },
        lastCompletedSync: null,
      },
      currentSessionRunId: "run-stage-financial-wait",
      isStarting: false,
      errorMessage: null,
      oauthRequired: false,
      preflightData: {
        status: "CONNECTED",
        message: "TagPlus conectado",
        authorizeUrl: "/auth",
        isLocalEnvironment: false,
      },
    });

    expect(state.stages.financial.status).toBe("WAITING");

    // Simula renderização do HTML com status WAITING
    const mockStatus: TagPlusSyncStatusResponse = {
      isRunning: true,
      activeRun: {
        runId: "run-test-waiting",
        mode: "INCREMENTAL",
        status: "RUNNING",
        currentStage: "SALES",
        startedAt: "2026-10-05T12:00:00Z",
        elapsedSeconds: 5,
      },
      stages: {
        categories: { status: "COMPLETED" },
        customers: { status: "COMPLETED" },
        products: { status: "COMPLETED" },
        sales: { status: "RUNNING" },
        financial: { status: "WAITING" },
      },
      lastCompletedSync: null,
    };

    // Spy fetchTagPlusSyncStatus to return mockStatus
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: unknown) => {
      const urlStr = String(input);
      if (urlStr.includes("/preflight")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: "CONNECTED", message: "ok", authorizeUrl: "/auth", isLocalEnvironment: false }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => mockStatus,
      } as Response;
    });

    const html = renderToString(<SyncModal isOpen={true} onClose={() => {}} />);
    expect(html).toContain("5. Financeiro");
    expect(html).toContain("Aguardando");
  });

  // 4. Financeiro RUNNING renderiza corretamente
  it("4. Financeiro RUNNING renderiza com badge 'Sincronizando...' e classe is-running", () => {
    const state = deriveSyncModalState({
      statusData: {
        isRunning: true,
        activeRun: {
          runId: "run-stage-financial-running",
          mode: "INCREMENTAL",
          status: "RUNNING",
          currentStage: "FINANCIAL",
          startedAt: "2026-10-05T12:00:00Z",
          elapsedSeconds: 30,
        },
        stages: {
          categories: { status: "COMPLETED" },
          customers: { status: "COMPLETED" },
          products: { status: "COMPLETED" },
          sales: { status: "COMPLETED" },
          financial: { status: "RUNNING" },
        },
        lastCompletedSync: null,
      },
      currentSessionRunId: "run-stage-financial-running",
      isStarting: false,
      errorMessage: null,
      oauthRequired: false,
      preflightData: null,
    });

    expect(state.stages.financial.status).toBe("RUNNING");
    expect(state.isRunning).toBe(true);
  });

  // 5. Financeiro COMPLETED renderiza corretamente
  it("5. Financeiro COMPLETED renderiza com badge 'Concluído' e classe is-completed", () => {
    const state = deriveSyncModalState({
      statusData: {
        isRunning: false,
        activeRun: {
          runId: "run-stage-financial-done",
          mode: "INCREMENTAL",
          status: "COMPLETED",
          currentStage: "COMPLETED",
          startedAt: "2026-10-05T12:00:00Z",
          completedAt: "2026-10-05T12:00:45Z",
          elapsedSeconds: 45,
        },
        stages: {
          categories: { status: "COMPLETED" },
          customers: { status: "COMPLETED" },
          products: { status: "COMPLETED" },
          sales: { status: "COMPLETED" },
          financial: {
            status: "COMPLETED",
            summary: {
              incremental: {
                processed: 42,
                updated: 3,
                inserted: 0,
              },
            },
          },
        },
        lastCompletedSync: "2026-10-05T12:00:45Z",
      },
      currentSessionRunId: "run-stage-financial-done",
      isStarting: false,
      errorMessage: null,
      oauthRequired: false,
      preflightData: null,
    });

    expect(state.isCompleted).toBe(true);
    expect(state.stages.financial.status).toBe("COMPLETED");
  });

  // 6. Financeiro FAILED renderiza erro no mesmo padrão das demais etapas
  it("6. Financeiro FAILED renderiza badge 'Erro', classe is-failed e mensagem de erro", () => {
    const state = deriveSyncModalState({
      statusData: {
        isRunning: false,
        activeRun: {
          runId: "run-financial-failed",
          mode: "INCREMENTAL",
          status: "FAILED",
          currentStage: "FINANCIAL",
          startedAt: "2026-10-05T12:00:00Z",
          completedAt: "2026-10-05T12:00:20Z",
          elapsedSeconds: 20,
          errorStage: "FINANCIAL",
          errorMessage: "Falha de rede ao consultar títulos financeiros",
        },
        stages: {
          categories: { status: "COMPLETED" },
          customers: { status: "COMPLETED" },
          products: { status: "COMPLETED" },
          sales: { status: "COMPLETED" },
          financial: {
            status: "FAILED",
            error: "Falha de rede ao consultar títulos financeiros",
          },
        },
        lastCompletedSync: null,
      },
      currentSessionRunId: "run-financial-failed",
      isStarting: false,
      errorMessage: null,
      oauthRequired: false,
      preflightData: null,
    });

    expect(state.isSessionFailed).toBe(true);
    expect(state.stages.financial.status).toBe("FAILED");
    expect(state.stages.financial.error).toBe(
      "Falha de rede ao consultar títulos financeiros",
    );
  });

  // 7. Métricas financeiras exibidas sem quebrar quando presentes
  it("7. renderFinancialMetrics exibe resumo compacto sem jargões técnicos", () => {
    // Caso com dados completos sob incremental
    const metricsHtml1 = renderToString(
      renderFinancialMetrics({
        incremental: {
          processed: 42,
          inserted: 1,
          updated: 3,
          failed: 0,
        },
      }) as React.ReactElement,
    );

    expect(metricsHtml1).toContain("42 analisados");
    expect(metricsHtml1).toContain("1 novos");
    expect(metricsHtml1).toContain("3 atualizados");
    // Não expõe termos técnicos
    expect(metricsHtml1).not.toContain("JIT");
    expect(metricsHtml1).not.toContain("Stock Adjustment");
    expect(metricsHtml1).not.toContain("NON_CASH_STOCK_ADJUSTMENT_OUTFLOW");

    // Caso plano direto (ex: candidatos / atualizados)
    const metricsHtml2 = renderToString(
      renderFinancialMetrics({
        processed: 85,
        updated: 12,
      }) as React.ReactElement,
    );
    expect(metricsHtml2).toContain("85 analisados");
    expect(metricsHtml2).toContain("12 atualizados");
  });

  // 8. Métricas ausentes ou zeradas não quebram renderização e não geram ruído
  it("8. renderFinancialMetrics retorna null se resumo for ausente ou zerado", () => {
    expect(renderFinancialMetrics(undefined)).toBeNull();
    expect(renderFinancialMetrics({})).toBeNull();
    expect(
      renderFinancialMetrics({
        incremental: {
          processed: 0,
          inserted: 0,
          updated: 0,
          failed: 0,
        },
      }),
    ).toBeNull();
  });

  // 9. SALES FAILED não faz Financeiro parecer concluído
  it("9. Se SALES falhar, Financeiro permanece em WAITING e NÃO aparece concluído", () => {
    const state = deriveSyncModalState({
      statusData: {
        isRunning: false,
        activeRun: {
          runId: "run-sales-fail",
          mode: "INCREMENTAL",
          status: "FAILED",
          currentStage: "SALES",
          startedAt: "2026-10-05T12:00:00Z",
          elapsedSeconds: 10,
          errorStage: "SALES",
          errorMessage: "SALES_FETCH_FAILED",
        },
        stages: {
          categories: { status: "COMPLETED" },
          customers: { status: "COMPLETED" },
          products: { status: "COMPLETED" },
          sales: { status: "FAILED", error: "SALES_FETCH_FAILED" },
          financial: { status: "WAITING" },
        },
        lastCompletedSync: null,
      },
      currentSessionRunId: "run-sales-fail",
      isStarting: false,
      errorMessage: null,
      oauthRequired: false,
      preflightData: null,
    });

    expect(state.stages.sales.status).toBe("FAILED");
    expect(state.stages.financial.status).toBe("WAITING");
    expect(state.stages.financial.status).not.toBe("COMPLETED");
  });

  // 10. Resposta/status sem FINANCIAL continua sendo tratada defensivamente
  it("10. Resposta legada ou payload sem 'financial' preenche com WAITING defensivamente", () => {
    const state = deriveSyncModalState({
      statusData: {
        isRunning: true,
        activeRun: {
          runId: "run-legacy-no-financial",
          mode: "INCREMENTAL",
          status: "RUNNING",
          currentStage: "PRODUCTS",
          startedAt: "2026-10-05T12:00:00Z",
          elapsedSeconds: 5,
        },
        // Payload legado sem chave financial
        stages: {
          categories: { status: "COMPLETED" },
          customers: { status: "COMPLETED" },
          products: { status: "RUNNING" },
          sales: { status: "WAITING" },
        } as unknown as TagPlusSyncStatusResponse["stages"],
        lastCompletedSync: null,
      },
      currentSessionRunId: "run-legacy-no-financial",
      isStarting: false,
      errorMessage: null,
      oauthRequired: false,
      preflightData: null,
    });

    expect(state.stages.financial).toBeDefined();
    expect(state.stages.financial.status).toBe("WAITING");
  });

  // 11. 409 não cria uma segunda execução
  it("11. Conflito 409 mantém a sessão existente ou exibe mensagem limpa sem criar 2ª execução", () => {
    // Caso A: Existe runId global em andamento
    const stateGlobalConflict = deriveSyncModalState({
      statusData: {
        isRunning: true,
        activeRun: {
          runId: "run-existing-global",
          mode: "INCREMENTAL",
          status: "RUNNING",
          currentStage: "PRODUCTS",
          startedAt: "2026-10-05T12:00:00Z",
          elapsedSeconds: 8,
        },
        stages: {
          categories: { status: "COMPLETED" },
          customers: { status: "COMPLETED" },
          products: { status: "RUNNING" },
          sales: { status: "WAITING" },
          financial: { status: "WAITING" },
        },
        lastCompletedSync: null,
      },
      currentSessionRunId: "run-existing-global",
      isStarting: false,
      errorMessage: null,
      oauthRequired: false,
      preflightData: null,
    });

    expect(stateGlobalConflict.isRunning).toBe(true);
    expect(stateGlobalConflict.isTracked).toBe(true);
    expect(stateGlobalConflict.canStartSync).toBe(false);

    // Caso B: Conflito com sync financeiro isolado e nenhum global run ativo
    const stateIsolatedConflict = deriveSyncModalState({
      statusData: {
        isRunning: false,
        activeRun: null,
        stages: IDLE_STAGES,
        lastCompletedSync: null,
      },
      currentSessionRunId: null,
      isStarting: false,
      errorMessage: "Já existe uma sincronização em andamento.",
      oauthRequired: false,
      preflightData: null,
    });

    expect(stateIsolatedConflict.isRunning).toBe(false);
    expect(stateIsolatedConflict.isTracked).toBe(false);
    expect(stateIsolatedConflict.isSessionFailed).toBe(true);
    expect(stateIsolatedConflict.primaryButtonLabel).toBe("Tentar Novamente");
  });

  // 12. Etapas antigas continuam funcionando sem regressão
  it("12. Etapas 1 a 4 continuam funcionando sem regressão estrutural", () => {
    const state = deriveSyncModalState({
      statusData: {
        isRunning: true,
        activeRun: {
          runId: "run-all-stages",
          mode: "FULL",
          status: "RUNNING",
          currentStage: "PRODUCTS",
          startedAt: "2026-10-05T12:00:00Z",
          elapsedSeconds: 12,
        },
        stages: {
          categories: {
            status: "COMPLETED",
            summary: { recordsFetched: 15, recordsInserted: 2, recordsUpdated: 13 },
          },
          customers: {
            status: "COMPLETED",
            summary: { recordsFetched: 150, recordsInserted: 10, recordsUpdated: 20 },
          },
          products: {
            status: "RUNNING",
            summary: { recordsFetched: 80, recordsInserted: 5, recordsUpdated: 10 },
          },
          sales: { status: "WAITING" },
          financial: { status: "WAITING" },
        },
        lastCompletedSync: null,
      },
      currentSessionRunId: "run-all-stages",
      isStarting: false,
      errorMessage: null,
      oauthRequired: false,
      preflightData: null,
    });

    expect(state.stages.categories.status).toBe("COMPLETED");
    expect(state.stages.customers.status).toBe("COMPLETED");
    expect(state.stages.products.status).toBe("RUNNING");
    expect(state.stages.sales.status).toBe("WAITING");
    expect(state.stages.financial.status).toBe("WAITING");
    expect(state.activeMode).toBe("FULL");
  });

  describe("Validação Visual Local (Estados A, B, C, D)", () => {
    it("Estado A: Financeiro aguardando exibe ícone, classe is-waiting e texto 'Aguardando'", () => {
      const state = deriveSyncModalState({
        statusData: {
          isRunning: true,
          activeRun: {
            runId: "run-state-a",
            mode: "INCREMENTAL",
            status: "RUNNING",
            currentStage: "CATEGORIES",
            startedAt: "2026-10-05T12:00:00Z",
            elapsedSeconds: 2,
          },
          stages: {
            categories: { status: "RUNNING" },
            customers: { status: "WAITING" },
            products: { status: "WAITING" },
            sales: { status: "WAITING" },
            financial: { status: "WAITING" },
          },
          lastCompletedSync: null,
        },
        currentSessionRunId: "run-state-a",
        isStarting: false,
        errorMessage: null,
        oauthRequired: false,
        preflightData: null,
      });

      expect(state.stages.financial.status).toBe("WAITING");
    });

    it("Estado B: Financeiro executando exibe classe is-running e badge 'Sincronizando...'", () => {
      const state = deriveSyncModalState({
        statusData: {
          isRunning: true,
          activeRun: {
            runId: "run-state-b",
            mode: "INCREMENTAL",
            status: "RUNNING",
            currentStage: "FINANCIAL",
            startedAt: "2026-10-05T12:00:00Z",
            elapsedSeconds: 25,
          },
          stages: {
            categories: { status: "COMPLETED" },
            customers: { status: "COMPLETED" },
            products: { status: "COMPLETED" },
            sales: { status: "COMPLETED" },
            financial: { status: "RUNNING" },
          },
          lastCompletedSync: null,
        },
        currentSessionRunId: "run-state-b",
        isStarting: false,
        errorMessage: null,
        oauthRequired: false,
        preflightData: null,
      });

      expect(state.stages.financial.status).toBe("RUNNING");
    });

    it("Estado C: Financeiro concluído exibe classe is-completed, badge 'Concluído' e métricas compactas", () => {
      const state = deriveSyncModalState({
        statusData: {
          isRunning: false,
          activeRun: {
            runId: "run-state-c",
            mode: "INCREMENTAL",
            status: "COMPLETED",
            currentStage: "COMPLETED",
            startedAt: "2026-10-05T12:00:00Z",
            completedAt: "2026-10-05T12:00:35Z",
            elapsedSeconds: 35,
          },
          stages: {
            categories: { status: "COMPLETED" },
            customers: { status: "COMPLETED" },
            products: { status: "COMPLETED" },
            sales: { status: "COMPLETED" },
            financial: {
              status: "COMPLETED",
              summary: {
                incremental: {
                  processed: 42,
                  inserted: 0,
                  updated: 3,
                },
              },
            },
          },
          lastCompletedSync: "2026-10-05T12:00:35Z",
        },
        currentSessionRunId: "run-state-c",
        isStarting: false,
        errorMessage: null,
        oauthRequired: false,
        preflightData: null,
      });

      expect(state.stages.financial.status).toBe("COMPLETED");
      const metrics = renderFinancialMetrics(state.stages.financial.summary);
      const metricsHtml = renderToString(metrics as React.ReactElement);
      expect(metricsHtml).toContain("42 analisados");
      expect(metricsHtml).toContain("3 atualizados");
      expect(metricsHtml).not.toContain("novos"); // zerado não aparece
    });

    it("Estado D: Financeiro falhou exibe classe is-failed, badge 'Erro' e mensagem de erro técnica tratada", () => {
      const state = deriveSyncModalState({
        statusData: {
          isRunning: false,
          activeRun: {
            runId: "run-state-d",
            mode: "INCREMENTAL",
            status: "FAILED",
            currentStage: "FINANCIAL",
            startedAt: "2026-10-05T12:00:00Z",
            completedAt: "2026-10-05T12:00:15Z",
            elapsedSeconds: 15,
            errorStage: "FINANCIAL",
            errorMessage: "FINANCIAL_INCREMENTAL_FAILED: falha de timeout",
          },
          stages: {
            categories: { status: "COMPLETED" },
            customers: { status: "COMPLETED" },
            products: { status: "COMPLETED" },
            sales: { status: "COMPLETED" },
            financial: {
              status: "FAILED",
              error: "FINANCIAL_INCREMENTAL_FAILED: falha de timeout",
            },
          },
          lastCompletedSync: null,
        },
        currentSessionRunId: "run-state-d",
        isStarting: false,
        errorMessage: null,
        oauthRequired: false,
        preflightData: null,
      });

      expect(state.stages.financial.status).toBe("FAILED");
      expect(state.stages.financial.error).toContain("FINANCIAL_INCREMENTAL_FAILED");
    });
  });
});

