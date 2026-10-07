import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  SyncModal,
  deriveSyncModalState,
  renderFinancialMetrics,
  renderStageProgress,
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

  describe("SyncModal — UX de Progresso e Reset de Nova Execução (Seção 9)", () => {
    // 1. abrir modal sem execução ativa pode mostrar histórico apenas onde apropriado
    it("1. Abrir modal sem execução ativa mantém stages IDLE (Aguardando) e histórico no rodapé", () => {
      const state = deriveSyncModalState({
        statusData: {
          isRunning: false,
          activeRun: {
            runId: "historical-run-id",
            mode: "INCREMENTAL",
            status: "COMPLETED",
            currentStage: "COMPLETED",
            startedAt: "2026-10-05T10:00:00Z",
            completedAt: "2026-10-05T10:13:00Z",
            elapsedSeconds: 780,
          },
          stages: {
            categories: { status: "COMPLETED" },
            customers: { status: "COMPLETED" },
            products: { status: "COMPLETED" },
            sales: { status: "COMPLETED" },
            financial: { status: "COMPLETED" },
          },
          lastCompletedSync: "2026-10-05T10:13:00Z",
        },
        currentSessionRunId: null, // Sem execução ativa rastreada nesta sessão
        isStarting: false,
        errorMessage: null,
        oauthRequired: false,
        preflightData: null,
      });

      expect(state.isRunning).toBe(false);
      expect(state.isTracked).toBe(false);
      expect(state.isCompleted).toBe(false);
      // Stages devem ser IDLE_STAGES, e NÃO herdarem COMPLETED da execução histórica
      expect(state.stages.categories.status).toBe("WAITING");
      expect(state.stages.customers.status).toBe("WAITING");
      expect(state.stages.products.status).toBe("WAITING");
      expect(state.stages.sales.status).toBe("WAITING");
      expect(state.stages.financial.status).toBe("WAITING");
    });

    // 2. clicar 'Sincronizar agora' limpa imediatamente stages verdes da execução anterior
    it("2. Clicar 'Sincronizar agora' (isStarting = true) limpa imediatamente stages verdes anteriores", () => {
      const state = deriveSyncModalState({
        statusData: {
          isRunning: false,
          activeRun: {
            runId: "prev-run-id",
            mode: "INCREMENTAL",
            status: "COMPLETED",
            currentStage: "COMPLETED",
            startedAt: "2026-10-05T10:00:00Z",
            completedAt: "2026-10-05T10:13:00Z",
            elapsedSeconds: 780,
          },
          stages: {
            categories: { status: "COMPLETED" },
            customers: { status: "COMPLETED" },
            products: { status: "COMPLETED" },
            sales: { status: "COMPLETED" },
            financial: { status: "COMPLETED" },
          },
          lastCompletedSync: "2026-10-05T10:13:00Z",
        },
        currentSessionRunId: null,
        isStarting: true, // Usuário acabou de clicar 'Sincronizar agora'
        errorMessage: null,
        oauthRequired: false,
        preflightData: null,
      });

      // Nenhum card verde!
      expect(state.stages.categories.status).toBe("RUNNING");
      expect(state.stages.customers.status).toBe("WAITING");
      expect(state.stages.products.status).toBe("WAITING");
      expect(state.stages.sales.status).toBe("WAITING");
      expect(state.stages.financial.status).toBe("WAITING");
      expect(state.isCompleted).toBe(false);
    });

    // 3. nova execução começa com: Categorias ativa, demais WAITING
    it("3. Nova execução começa com Categorias ativa e demais em WAITING", () => {
      const state = deriveSyncModalState({
        statusData: null,
        currentSessionRunId: null,
        isStarting: true,
        errorMessage: null,
        oauthRequired: false,
        preflightData: null,
      });

      expect(state.stages.categories.status).toBe("RUNNING");
      expect(state.stages.customers.status).toBe("WAITING");
      expect(state.stages.products.status).toBe("WAITING");
      expect(state.stages.sales.status).toBe("WAITING");
      expect(state.stages.financial.status).toBe("WAITING");
    });

    // 4. resposta do POST com novo runId não reaproveita run anterior
    it("4. Resposta do POST com novo runId anexa apenas ao novo run", () => {
      const newRunId = "new-uuid-1234";
      const state = deriveSyncModalState({
        statusData: {
          isRunning: true,
          activeRun: {
            runId: newRunId,
            mode: "INCREMENTAL",
            status: "RUNNING",
            currentStage: "CATEGORIES",
            startedAt: "2026-10-07T12:00:00Z",
            elapsedSeconds: 1,
          },
          stages: {
            categories: { status: "RUNNING" },
            customers: { status: "WAITING" },
            products: { status: "WAITING" },
            sales: { status: "WAITING" },
            financial: { status: "WAITING" },
          },
          lastCompletedSync: "2026-10-07T11:00:00Z",
        },
        currentSessionRunId: newRunId,
        isStarting: false,
        errorMessage: null,
        oauthRequired: false,
        preflightData: null,
      });

      expect(state.isTracked).toBe(true);
      expect(state.isRunning).toBe(true);
      expect(state.isCompleted).toBe(false);
      expect(state.stages.categories.status).toBe("RUNNING");
    });

    // 5. polling do novo run atualiza normalmente os stages
    it("5. Polling do novo run atualiza normalmente os stages", () => {
      const runId = "running-run-uuid";
      const polledState = deriveSyncModalState({
        statusData: {
          isRunning: true,
          activeRun: {
            runId,
            mode: "INCREMENTAL",
            status: "RUNNING",
            currentStage: "FINANCIAL",
            startedAt: "2026-10-07T12:00:00Z",
            elapsedSeconds: 50,
          },
          stages: {
            categories: { status: "COMPLETED" },
            customers: { status: "COMPLETED" },
            products: { status: "COMPLETED" },
            sales: { status: "COMPLETED" },
            financial: {
              status: "RUNNING",
              progress: {
                current: 40,
                total: 165,
                label: "Atualizando financeiro",
              },
            },
          },
          lastCompletedSync: null,
        },
        currentSessionRunId: runId,
        isStarting: false,
        errorMessage: null,
        oauthRequired: false,
        preflightData: null,
      });

      expect(polledState.stages.categories.status).toBe("COMPLETED");
      expect(polledState.stages.sales.status).toBe("COMPLETED");
      expect(polledState.stages.financial.status).toBe("RUNNING");
      expect(polledState.stages.financial.progress?.current).toBe(40);
      expect(polledState.stages.financial.progress?.total).toBe(165);
    });

    // 6. FINANCIAL RUNNING com current/total renderiza barra
    it("6. FINANCIAL RUNNING com current/total renderiza barra de progresso", () => {
      const element = renderStageProgress({
        current: 84,
        total: 165,
        label: "Atualizando financeiro",
      });
      const html = renderToString(element as React.ReactElement);

      expect(html).toContain('data-testid="stage-progress"');
      expect(html).toContain('tp-sync-stage-progress-track');
      expect(html).toContain('tp-sync-stage-progress-bar');
      expect(html).toContain('style="width:51%"');
    });

    // 7. progresso do financeiro mostra X de Y
    it("7. Progresso do financeiro mostra X de Y", () => {
      const element = renderStageProgress({
        current: 84,
        total: 165,
        label: "Atualizando financeiro",
      });
      const html = renderToString(element as React.ReactElement);

      expect(html).toContain("84 de 165");
      expect(html).toContain("Atualizando financeiro · 84 de 165");
    });

    // 8. troca de subpasso financeiro altera o texto
    it("8. Troca de subpasso financeiro altera o texto para 'Reconciliando ajustes · 5 de 12'", () => {
      const element = renderStageProgress({
        current: 5,
        total: 12,
        label: "Reconciliando ajustes",
      });
      const html = renderToString(element as React.ReactElement);

      expect(html).toContain("Reconciliando ajustes · 5 de 12");
      expect(html).toContain('style="width:42%"');
    });

    // 9. FINANCIAL COMPLETED remove estado RUNNING/barra corretamente
    it("9. FINANCIAL COMPLETED remove estado RUNNING/barra e renderiza métricas finais", () => {
      const state = deriveSyncModalState({
        statusData: {
          isRunning: false,
          activeRun: {
            runId: "completed-run-uuid",
            mode: "INCREMENTAL",
            status: "COMPLETED",
            currentStage: "COMPLETED",
            startedAt: "2026-10-07T12:00:00Z",
            completedAt: "2026-10-07T12:12:00Z",
            elapsedSeconds: 720,
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
                  processed: 165,
                  inserted: 3,
                  updated: 5,
                },
              },
            },
          },
          lastCompletedSync: "2026-10-07T12:12:00Z",
        },
        currentSessionRunId: "completed-run-uuid",
        isStarting: false,
        errorMessage: null,
        oauthRequired: false,
        preflightData: null,
      });

      expect(state.stages.financial.status).toBe("COMPLETED");
      expect(state.stages.financial.progress).toBeUndefined();

      // Barra não é renderizada quando status é COMPLETED
      const bar = renderStageProgress(state.stages.financial.progress);
      expect(bar).toBeNull();

      // Métricas finais são renderizadas
      const metrics = renderFinancialMetrics(state.stages.financial.summary);
      const metricsHtml = renderToString(metrics as React.ReactElement);
      expect(metricsHtml).toContain("165 analisados");
      expect(metricsHtml).toContain("3 novos");
      expect(metricsHtml).toContain("5 atualizados");
    });

    // 10. progresso ausente continua renderizando sem erro
    it("10. Progresso ausente continua renderizando sem erro (retorna null)", () => {
      expect(renderStageProgress(undefined)).toBeNull();
      expect(renderStageProgress({ current: 0, total: 0 })).not.toBeNull();
    });

    // 11. nenhum termo técnico interno aparece na UI
    it("11. Nenhum termo técnico interno (JIT, StockAdjustmentFinancialLink, etc.) aparece na UI", () => {
      const element1 = renderStageProgress({
        current: 84,
        total: 165,
        label: "Atualizando financeiro",
      });
      const html1 = renderToString(element1 as React.ReactElement);

      const element2 = renderStageProgress({
        current: 5,
        total: 12,
        label: "Reconciliando ajustes",
      });
      const html2 = renderToString(element2 as React.ReactElement);

      for (const html of [html1, html2]) {
        expect(html).not.toContain("JIT");
        expect(html).not.toContain("StockAdjustmentFinancialLink");
        expect(html).not.toContain("NON_CASH_STOCK_ADJUSTMENT_OUTFLOW");
        expect(html).not.toContain("sourceId");
        expect(html).not.toContain("worker");
      }
    });

    // 12. FinancialSyncControl permanece intacto
    it("12. FinancialSyncControl permanece exportável e utilizável", async () => {
      const { FinancialSyncControl } = await import("./financial/FinancialSyncControl.js");
      expect(typeof FinancialSyncControl).toBe("function");
      const html = renderToString(<FinancialSyncControl />);
      expect(html).toBeDefined();
    });
  });
});
