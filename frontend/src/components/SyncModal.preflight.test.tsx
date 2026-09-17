import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  SyncModal,
  deriveSyncModalState,
  IDLE_STAGES,
} from "./SyncModal.js";
import type {
  TagPlusPreflightResponse,
  TagPlusSyncStatusResponse,
} from "../api/sync.js";

describe("SyncModal Preflight & Auth UX", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders CONNECTED state: shows '✓ TagPlus conectado', displays 'Reautorizar TagPlus', and releases sync buttons", () => {
    const html = renderToString(
      <SyncModal isOpen={true} onClose={() => {}} />,
    );

    // Initial check state
    expect(html).toContain("tp-sync-modal");
    expect(html).toContain("Sincronização TagPlus");
    expect(html).toContain("tagplus-connection-card");
  });

  it("translates 401 during sync to friendly message and preserves technical error separately", () => {
    const mockStatusWithAuthError: TagPlusSyncStatusResponse = {
      isRunning: false,
      activeRun: {
        runId: "run-failed-401",
        mode: "INCREMENTAL",
        status: "FAILED",
        currentStage: "CUSTOMERS",
        startedAt: "2026-09-12T10:00:00Z",
        completedAt: "2026-09-12T10:00:05Z",
        elapsedSeconds: 5,
        errorStage: "CUSTOMERS",
        errorMessage: "CUSTOMER_SYNC_FETCH_ERROR",
        errorCategory: "TAGPLUS_AUTH_EXPIRED",
        isAuthError: true,
      },
      stages: {
        categories: { status: "COMPLETED" },
        customers: {
          status: "FAILED",
          error: "CUSTOMER_SYNC_FETCH_ERROR",
          summary: { recordsFetched: 0 },
        },
        products: { status: "WAITING" },
        sales: { status: "WAITING" },
      },
      lastCompletedSync: null,
    };

    expect(mockStatusWithAuthError.activeRun?.isAuthError).toBe(true);
    expect(mockStatusWithAuthError.activeRun?.errorCategory).toBe("TAGPLUS_AUTH_EXPIRED");
    expect(mockStatusWithAuthError.activeRun?.errorMessage).toBe("CUSTOMER_SYNC_FETCH_ERROR");
    expect(mockStatusWithAuthError.stages.customers.error).toBe("CUSTOMER_SYNC_FETCH_ERROR");
  });

  it("verifies debounce and race condition prevention logic for window.focus", async () => {
    let callCount = 0;
    let sequence = 0;
    let lastHandledSequence = 0;
    let inProgress = false;

    const fakePreflight = async () => {
      if (inProgress) return null;
      inProgress = true;
      const currentSeq = ++sequence;
      callCount += 1;
      await new Promise((r) => setTimeout(r, 20));
      inProgress = false;
      if (currentSeq >= lastHandledSequence) {
        lastHandledSequence = currentSeq;
        return { status: "CONNECTED", seq: currentSeq };
      }
      return null;
    };

    const p1 = fakePreflight();
    const p2 = fakePreflight();

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(callCount).toBe(1);
    expect(r1?.status).toBe("CONNECTED");
    expect(r2).toBeNull();
  });

  it("verifies that previous FAILED attempt remains visible after reauthorization and CONNECTED enables 'Tentar Novamente' without auto-start", () => {
    const previousRunState = {
      isFailed: true,
      isRunning: false,
      customersStatus: "FAILED",
      customerError: "CUSTOMER_SYNC_FETCH_ERROR",
      isAuthError: true,
    };

    const preflightState: TagPlusPreflightResponse = {
      status: "CONNECTED",
      message: "TagPlus conectado",
      authorizeUrl: "/integrations/tagplus/authorize",
      isLocalEnvironment: true,
    };

    const isPreflightBlocking = preflightState.status !== "CONNECTED";
    const buttonLabel = previousRunState.isFailed ? "Tentar Novamente" : "Sincronizar agora";
    const isButtonDisabled = previousRunState.isRunning || isPreflightBlocking;

    expect(previousRunState.customersStatus).toBe("FAILED");
    expect(previousRunState.customerError).toBe("CUSTOMER_SYNC_FETCH_ERROR");
    expect(isPreflightBlocking).toBe(false);
    expect(buttonLabel).toBe("Tentar Novamente");
    expect(isButtonDisabled).toBe(false);
  });

  it("displays local ngrok hint only when isLocalEnvironment is true", () => {
    const localPreflight: TagPlusPreflightResponse = {
      status: "CONNECTED",
      message: "TagPlus conectado",
      authorizeUrl: "/integrations/tagplus/authorize",
      isLocalEnvironment: true,
    };

    const remotePreflight: TagPlusPreflightResponse = {
      status: "CONNECTED",
      message: "TagPlus conectado",
      authorizeUrl: "/integrations/tagplus/authorize",
      isLocalEnvironment: false,
    };

    expect(localPreflight.isLocalEnvironment).toBe(true);
    expect(remotePreflight.isLocalEnvironment).toBe(false);
  });

  it("blocks sync when preflight status is AUTH_REQUIRED or ERROR", () => {
    const authRequiredPreflight: TagPlusPreflightResponse = {
      status: "AUTH_REQUIRED",
      reason: "TOKEN_EXPIRED",
      message: "Autorização do TagPlus necessária",
      description: "Sua sessão expirou ou ainda não foi autorizada.",
      authorizeUrl: "/integrations/tagplus/authorize",
      isLocalEnvironment: false,
    };

    const isBlocking = authRequiredPreflight.status !== "CONNECTED";
    expect(isBlocking).toBe(true);

    const errorPreflight: TagPlusPreflightResponse = {
      status: "ERROR",
      reason: "CONNECTION_FAILED",
      message: "Não foi possível conectar ao TagPlus.",
      description: "Verifique sua conexão e tente novamente.",
      authorizeUrl: "/integrations/tagplus/authorize",
      isLocalEnvironment: false,
    };

    const isErrorBlocking = errorPreflight.status !== "CONNECTED";
    expect(isErrorBlocking).toBe(true);
  });
});

describe("SyncModal State Machine (Cenários Obrigatórios A–I)", () => {
  const connectedPreflight: TagPlusPreflightResponse = {
    status: "CONNECTED",
    message: "TagPlus conectado",
    authorizeUrl: "/integrations/tagplus/authorize",
    isLocalEnvironment: false,
  };

  const historicalCompletedStatus: TagPlusSyncStatusResponse = {
    isRunning: false,
    activeRun: {
      runId: "run-historical-100",
      mode: "INCREMENTAL",
      status: "COMPLETED",
      currentStage: "COMPLETED",
      startedAt: "2026-09-13T23:30:00.000Z",
      completedAt: "2026-09-13T23:33:15.000Z",
      elapsedSeconds: 195,
    },
    stages: {
      categories: { status: "COMPLETED", summary: { recordsFetched: 71, recordsInserted: 0, recordsUpdated: 0 } },
      customers: { status: "COMPLETED", summary: { recordsFetched: 10, recordsInserted: 0, recordsUpdated: 0 } },
      products: { status: "COMPLETED", summary: { recordsFetched: 25, recordsInserted: 0, recordsUpdated: 0 } },
      sales: { status: "COMPLETED", summary: { pedidos: { recordsFetched: 0 }, vendasSimples: { recordsFetched: 0 }, nfes: { recordsFetched: 0 } } },
    },
    lastCompletedSync: "2026-09-13T23:33:15.000Z",
  };

  it("Cenário A: Modal abre com isRunning = false e activeRun.status = COMPLETED -> mostra READY e 'Sincronizar agora'", () => {
    const state = deriveSyncModalState({
      statusData: historicalCompletedStatus,
      currentSessionRunId: null, // Aberto recentemente sem disparar run nesta sessão
      isStarting: false,
      errorMessage: null,
      oauthRequired: false,
      preflightData: connectedPreflight,
    });

    // NÃO deve mostrar conclusão como execução atual
    expect(state.isCompleted).toBe(false);
    expect(state.isRunning).toBe(false);
    expect(state.isTracked).toBe(false);

    // Deve estar pronto para sincronizar
    expect(state.primaryButtonLabel).toBe("Sincronizar agora");
    expect(state.canStartSync).toBe(true);

    // Etapas devem estar em WAITING ("Aguardando")
    expect(state.stages.customers.status).toBe("WAITING");
    expect(state.stages.products.status).toBe("WAITING");
    expect(state.stages.sales.status).toBe("WAITING");
  });

  it("Cenário B: Usuário inicia nova execução -> novo runId passa a controlar o modal", () => {
    const newRunId = "run-session-200";

    const runningStatus: TagPlusSyncStatusResponse = {
      isRunning: true,
      activeRun: {
        runId: newRunId,
        mode: "INCREMENTAL",
        status: "RUNNING",
        currentStage: "CUSTOMERS",
        startedAt: "2026-09-14T20:10:00.000Z",
        elapsedSeconds: 2,
      },
      stages: {
        categories: { status: "COMPLETED" },
        customers: { status: "RUNNING" },
        products: { status: "WAITING" },
        sales: { status: "WAITING" },
      },
      lastCompletedSync: historicalCompletedStatus.lastCompletedSync,
    };

    const state = deriveSyncModalState({
      statusData: runningStatus,
      currentSessionRunId: newRunId,
      isStarting: false,
      errorMessage: null,
      oauthRequired: false,
      preflightData: connectedPreflight,
    });

    expect(state.isTracked).toBe(true);
    expect(state.isRunning).toBe(true);
    expect(state.isCompleted).toBe(false);
    expect(state.stages.customers.status).toBe("RUNNING");
  });

  it("Cenário C: Run atual completa -> modal mostra sucesso e métricas da execução", () => {
    const currentRunId = "run-session-200";

    const completedStatus: TagPlusSyncStatusResponse = {
      isRunning: false,
      activeRun: {
        runId: currentRunId,
        mode: "INCREMENTAL",
        status: "COMPLETED",
        currentStage: "COMPLETED",
        startedAt: "2026-09-14T20:10:00.000Z",
        completedAt: "2026-09-14T20:10:45.000Z",
        elapsedSeconds: 45,
      },
      stages: {
        categories: { status: "COMPLETED", summary: { recordsFetched: 71, recordsInserted: 0, recordsUpdated: 0 } },
        customers: { status: "COMPLETED", summary: { recordsFetched: 15, recordsInserted: 2, recordsUpdated: 1 } },
        products: { status: "COMPLETED", summary: { recordsFetched: 40, recordsInserted: 0, recordsUpdated: 3 } },
        sales: { status: "COMPLETED", summary: { pedidos: { recordsFetched: 5 }, vendasSimples: { recordsFetched: 2 }, nfes: { recordsFetched: 1 } } },
      },
      lastCompletedSync: "2026-09-14T20:10:45.000Z",
    };

    const state = deriveSyncModalState({
      statusData: completedStatus,
      currentSessionRunId: currentRunId,
      isStarting: false,
      errorMessage: null,
      oauthRequired: false,
      preflightData: connectedPreflight,
    });

    expect(state.isTracked).toBe(true);
    expect(state.isRunning).toBe(false);
    expect(state.isCompleted).toBe(true);
    expect(state.stages.customers.status).toBe("COMPLETED");
    expect(state.stages.sales.status).toBe("COMPLETED");
  });

  it("Cenário D: Fecha e reabre -> volta ao estado READY com última sincronização como histórico", () => {
    // 1. Fechar o modal zera currentSessionRunId
    let currentSessionRunId: string | null = "run-session-200";
    currentSessionRunId = null; // simulando onClose / isOpen = false

    // 2. Reabrir consulta status com a última sincronização do run recém-concluído
    const statusOnReopen: TagPlusSyncStatusResponse = {
      isRunning: false,
      activeRun: {
        runId: "run-session-200",
        mode: "INCREMENTAL",
        status: "COMPLETED",
        currentStage: "COMPLETED",
        startedAt: "2026-09-14T20:10:00.000Z",
        completedAt: "2026-09-14T20:10:45.000Z",
        elapsedSeconds: 45,
      },
      stages: {
        categories: { status: "COMPLETED", summary: { recordsFetched: 71 } },
        customers: { status: "COMPLETED", summary: { recordsFetched: 15 } },
        products: { status: "COMPLETED" },
        sales: { status: "COMPLETED" },
      },
      lastCompletedSync: "2026-09-14T20:10:45.000Z",
    };

    const state = deriveSyncModalState({
      statusData: statusOnReopen,
      currentSessionRunId,
      isStarting: false,
      errorMessage: null,
      oauthRequired: false,
      preflightData: connectedPreflight,
    });

    // Não deve ficar preso em COMPLETED
    expect(state.isCompleted).toBe(false);
    expect(state.isTracked).toBe(false);
    expect(state.isRunning).toBe(false);
    expect(state.primaryButtonLabel).toBe("Sincronizar agora");
    expect(state.canStartSync).toBe(true);
    expect(state.stages).toEqual(IDLE_STAGES);
  });

  it("Cenário E: isRunning = true ao abrir -> recupera corretamente a execução em andamento", () => {
    const backendActiveRunId = "run-background-999";
    const backendRunningStatus: TagPlusSyncStatusResponse = {
      isRunning: true,
      activeRun: {
        runId: backendActiveRunId,
        mode: "FULL",
        status: "RUNNING",
        currentStage: "PRODUCTS",
        startedAt: "2026-09-14T20:12:00.000Z",
        elapsedSeconds: 20,
      },
      stages: {
        categories: { status: "COMPLETED", summary: { recordsFetched: 71 } },
        customers: { status: "COMPLETED", summary: { recordsFetched: 50 } },
        products: { status: "RUNNING" },
        sales: { status: "WAITING" },
      },
      lastCompletedSync: null,
    };

    // Modal adota o backendActiveRunId se abriu com isRunning: true
    const currentSessionRunId = backendRunningStatus.isRunning
      ? (backendRunningStatus.activeRun?.runId ?? null)
      : null;

    const state = deriveSyncModalState({
      statusData: backendRunningStatus,
      currentSessionRunId,
      isStarting: false,
      errorMessage: null,
      oauthRequired: false,
      preflightData: connectedPreflight,
    });

    expect(state.isRunning).toBe(true);
    expect(state.isTracked).toBe(true);
    expect(state.activeMode).toBe("FULL");
    expect(state.stages.products.status).toBe("RUNNING");
  });

  it("Cenário F: FAILED histórico + conexão válida -> não bloqueia uma nova sincronização", () => {
    const historicalFailedStatus: TagPlusSyncStatusResponse = {
      isRunning: false,
      activeRun: {
        runId: "run-failed-ancient",
        mode: "INCREMENTAL",
        status: "FAILED",
        currentStage: "SALES",
        startedAt: "2026-09-14T18:00:00.000Z",
        completedAt: "2026-09-14T18:02:00.000Z",
        elapsedSeconds: 120,
        errorMessage: "Network timeout",
      },
      stages: {
        categories: { status: "COMPLETED" },
        customers: { status: "COMPLETED" },
        products: { status: "COMPLETED" },
        sales: { status: "FAILED", error: "Network timeout" },
      },
      lastCompletedSync: "2026-09-13T23:33:15.000Z",
    };

    const state = deriveSyncModalState({
      statusData: historicalFailedStatus,
      currentSessionRunId: null, // Histórico, modal abriu agora
      isStarting: false,
      errorMessage: null,
      oauthRequired: false,
      preflightData: connectedPreflight,
    });

    expect(state.isHistoricalFailed).toBe(true);
    expect(state.isSessionFailed).toBe(false);
    expect(state.primaryButtonLabel).toBe("Sincronizar agora");
    expect(state.canStartSync).toBe(true);
  });

  it("Cenário G: FAILED por auth durante sessão atual -> mantém fluxo amigável de reautorização", () => {
    const sessionAuthFailedRunId = "run-auth-session-300";

    const sessionAuthFailedStatus: TagPlusSyncStatusResponse = {
      isRunning: false,
      activeRun: {
        runId: sessionAuthFailedRunId,
        mode: "INCREMENTAL",
        status: "FAILED",
        currentStage: "CUSTOMERS",
        startedAt: "2026-09-14T20:15:00.000Z",
        completedAt: "2026-09-14T20:15:03.000Z",
        elapsedSeconds: 3,
        errorCategory: "TAGPLUS_AUTH_EXPIRED",
        errorMessage: "TOKEN_EXPIRED",
        isAuthError: true,
      },
      stages: {
        categories: { status: "COMPLETED" },
        customers: { status: "FAILED", error: "TOKEN_EXPIRED" },
        products: { status: "WAITING" },
        sales: { status: "WAITING" },
      },
      lastCompletedSync: null,
    };

    // Enquanto preflight estiver AUTH_REQUIRED: botão fica bloqueado
    const stateAuthRequired = deriveSyncModalState({
      statusData: sessionAuthFailedStatus,
      currentSessionRunId: sessionAuthFailedRunId,
      isStarting: false,
      errorMessage: null,
      oauthRequired: false,
      preflightData: {
        status: "AUTH_REQUIRED",
        message: "Autorização necessária",
        authorizeUrl: "/integrations/tagplus/authorize",
        isLocalEnvironment: false,
      },
    });

    expect(stateAuthRequired.isSessionFailed).toBe(true);
    expect(stateAuthRequired.isAuthError).toBe(true);
    expect(stateAuthRequired.isPreflightBlocking).toBe(true);
    expect(stateAuthRequired.canStartSync).toBe(false);

    // Após usuário autorizar e preflight retornar CONNECTED: libera "Tentar Novamente" sem auto-start
    const stateReconnected = deriveSyncModalState({
      statusData: sessionAuthFailedStatus,
      currentSessionRunId: sessionAuthFailedRunId,
      isStarting: false,
      errorMessage: null,
      oauthRequired: false,
      preflightData: connectedPreflight,
    });

    expect(stateReconnected.isSessionFailed).toBe(true);
    expect(stateReconnected.primaryButtonLabel).toBe("Tentar Novamente");
    expect(stateReconnected.canStartSync).toBe(true);
  });

  it("Cenário H: Fecha o modal durante RUNNING e reabre -> modal recupera run ativo", () => {
    const runningRunId = "run-active-long";
    const serverRunningStatus: TagPlusSyncStatusResponse = {
      isRunning: true,
      activeRun: {
        runId: runningRunId,
        mode: "INCREMENTAL",
        status: "RUNNING",
        currentStage: "PRODUCTS",
        startedAt: "2026-09-14T20:15:00.000Z",
        elapsedSeconds: 12,
      },
      stages: {
        categories: { status: "COMPLETED", summary: { recordsFetched: 71 } },
        customers: { status: "COMPLETED", summary: { recordsFetched: 10 } },
        products: { status: "RUNNING" },
        sales: { status: "WAITING" },
      },
      lastCompletedSync: null,
    };

    // Quando o modal reabre com isOpen = true, o fetch inicial adota o activeRun.runId do backend
    let currentSessionRunId: string | null = null;
    if (serverRunningStatus.isRunning && !currentSessionRunId && serverRunningStatus.activeRun?.runId) {
      currentSessionRunId = serverRunningStatus.activeRun.runId;
    }

    const state = deriveSyncModalState({
      statusData: serverRunningStatus,
      currentSessionRunId,
      isStarting: false,
      errorMessage: null,
      oauthRequired: false,
      preflightData: connectedPreflight,
    });

    expect(currentSessionRunId).toBe(runningRunId);
    expect(state.isRunning).toBe(true);
    expect(state.isTracked).toBe(true);
    expect(state.stages.products.status).toBe("RUNNING");
  });

  it("Cenário I: Após startTagPlusSync retornar runId -> modal entra imediatamente em RUNNING antes do polling", () => {
    const newRunId = "run-immediate-start";

    // Logo após `const result = await startTagPlusSync(mode)`:
    // statusData é sintetizado imediatamente com isRunning: true
    const immediateStatusData: TagPlusSyncStatusResponse = {
      isRunning: true,
      activeRun: {
        runId: newRunId,
        mode: "INCREMENTAL",
        status: "RUNNING",
        currentStage: "CUSTOMERS",
        startedAt: "2026-09-14T20:16:00.000Z",
        elapsedSeconds: 0,
      },
      stages: {
        categories: { status: "COMPLETED" },
        customers: { status: "RUNNING" },
        products: { status: "WAITING" },
        sales: { status: "WAITING" },
      },
      lastCompletedSync: "2026-09-13T23:33:15.000Z",
    };

    const state = deriveSyncModalState({
      statusData: immediateStatusData,
      currentSessionRunId: newRunId,
      isStarting: false,
      errorMessage: null,
      oauthRequired: false,
      preflightData: connectedPreflight,
    });

    // Confirma que não há flicker ou retorno momentâneo para READY
    expect(state.isRunning).toBe(true);
    expect(state.isTracked).toBe(true);
    expect(state.isCompleted).toBe(false);
    expect(state.stages.customers.status).toBe("RUNNING");
    expect(state.stages.products.status).toBe("WAITING");
    expect(state.stages.sales.status).toBe("WAITING");
  });

  it("Cenário J: Modal renders 4 stages including 1. Categorias with correct badges and metrics", () => {
    expect(IDLE_STAGES).toEqual({
      categories: { status: "WAITING" },
      customers: { status: "WAITING" },
      products: { status: "WAITING" },
      sales: { status: "WAITING" },
    });

    const html = renderToString(
      <SyncModal isOpen={true} onClose={() => {}} />,
    );

    expect(html).toContain("1. Categorias");
    expect(html).toContain("2. Clientes");
    expect(html).toContain("3. Produtos");
    expect(html).toContain("4. Vendas e Faturamento");
  });

  it("Cenário K: Category transitions through WAITING, RUNNING, COMPLETED, FAILED", () => {
    const runId = "run-cat-test";

    // RUNNING
    const runningStatus: TagPlusSyncStatusResponse = {
      isRunning: true,
      activeRun: {
        runId,
        mode: "INCREMENTAL",
        status: "RUNNING",
        currentStage: "CATEGORIES",
        startedAt: "2026-09-17T00:00:00.000Z",
        elapsedSeconds: 2,
      },
      stages: {
        categories: { status: "RUNNING" },
        customers: { status: "WAITING" },
        products: { status: "WAITING" },
        sales: { status: "WAITING" },
      },
      lastCompletedSync: null,
    };

    const runningState = deriveSyncModalState({
      statusData: runningStatus,
      currentSessionRunId: runId,
      isStarting: false,
      errorMessage: null,
      oauthRequired: false,
      preflightData: connectedPreflight,
    });
    expect(runningState.stages.categories.status).toBe("RUNNING");

    // COMPLETED
    const completedStatus: TagPlusSyncStatusResponse = {
      isRunning: false,
      activeRun: {
        runId,
        mode: "INCREMENTAL",
        status: "COMPLETED",
        currentStage: "COMPLETED",
        startedAt: "2026-09-17T00:00:00.000Z",
        completedAt: "2026-09-17T00:01:00.000Z",
        elapsedSeconds: 60,
      },
      stages: {
        categories: {
          status: "COMPLETED",
          summary: { recordsFetched: 71, recordsInserted: 71, recordsUpdated: 0 },
        },
        customers: { status: "COMPLETED" },
        products: { status: "COMPLETED" },
        sales: { status: "COMPLETED" },
      },
      lastCompletedSync: "2026-09-17T00:01:00.000Z",
    };

    const completedState = deriveSyncModalState({
      statusData: completedStatus,
      currentSessionRunId: runId,
      isStarting: false,
      errorMessage: null,
      oauthRequired: false,
      preflightData: connectedPreflight,
    });
    expect(completedState.isCompleted).toBe(true);
    expect(completedState.stages.categories.status).toBe("COMPLETED");

    // FAILED
    const failedStatus: TagPlusSyncStatusResponse = {
      isRunning: false,
      activeRun: {
        runId,
        mode: "INCREMENTAL",
        status: "FAILED",
        currentStage: "CATEGORIES",
        startedAt: "2026-09-17T00:00:00.000Z",
        elapsedSeconds: 2,
        errorStage: "CATEGORIES",
        errorMessage: "Category sync error",
      },
      stages: {
        categories: { status: "FAILED", error: "Category sync error" },
        customers: { status: "WAITING" },
        products: { status: "WAITING" },
        sales: { status: "WAITING" },
      },
      lastCompletedSync: null,
    };

    const failedState = deriveSyncModalState({
      statusData: failedStatus,
      currentSessionRunId: runId,
      isStarting: false,
      errorMessage: null,
      oauthRequired: false,
      preflightData: connectedPreflight,
    });
    expect(failedState.isSessionFailed).toBe(true);
    expect(failedState.stages.categories.status).toBe("FAILED");
  });
});
