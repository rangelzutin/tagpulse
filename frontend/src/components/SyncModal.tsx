import { useEffect, useState, useCallback, useRef } from "react";
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
  ExternalLink,
  Users,
  Package,
  ShoppingCart,
  Lock,
  Database,
} from "lucide-react";
import {
  fetchTagPlusPreflight,
  fetchTagPlusSyncStatus,
  getBaseUrl,
  startTagPlusSync,
  TagPlusSyncApiError,
  type TagPlusPreflightResponse,
  type TagPlusSyncMode,
  type TagPlusSyncStatusResponse,
} from "../api/sync.js";

export const IDLE_STAGES: TagPlusSyncStatusResponse["stages"] = {
  customers: { status: "WAITING" },
  products: { status: "WAITING" },
  sales: { status: "WAITING" },
};

export interface DerivedSyncModalState {
  isRunning: boolean;
  isTracked: boolean;
  isCompleted: boolean;
  isSessionFailed: boolean;
  isHistoricalFailed: boolean;
  isAuthError: boolean;
  isPreflightBlocking: boolean;
  activeMode: TagPlusSyncMode;
  stages: TagPlusSyncStatusResponse["stages"];
  primaryButtonLabel: "Sincronizar agora" | "Tentar Novamente";
  canStartSync: boolean;
}

export function deriveSyncModalState(params: {
  statusData: TagPlusSyncStatusResponse | null;
  currentSessionRunId: string | null;
  isStarting: boolean;
  errorMessage: string | null;
  oauthRequired: boolean;
  preflightData: TagPlusPreflightResponse | null;
}): DerivedSyncModalState {
  const isRunning = Boolean(params.statusData?.isRunning || params.isStarting);
  const isTracked = Boolean(
    params.currentSessionRunId &&
      params.statusData?.activeRun?.runId === params.currentSessionRunId,
  );
  const isCompleted =
    !isRunning && isTracked && params.statusData?.activeRun?.status === "COMPLETED";

  const isAuthError = Boolean(
    params.statusData?.activeRun?.isAuthError ||
      params.statusData?.activeRun?.errorCategory === "TAGPLUS_AUTH_EXPIRED",
  );

  const isSessionFailed =
    !isRunning &&
    ((isTracked && params.statusData?.activeRun?.status === "FAILED") ||
      Boolean(params.errorMessage || params.oauthRequired));

  const isHistoricalFailed =
    !isRunning &&
    !params.currentSessionRunId &&
    params.statusData?.activeRun?.status === "FAILED";

  const isPreflightBlocking =
    params.preflightData !== null && params.preflightData.status !== "CONNECTED";

  const activeMode =
    (isTracked || isRunning)
      ? (params.statusData?.activeRun?.mode ?? "INCREMENTAL")
      : "INCREMENTAL";

  const stages =
    (isTracked || isRunning)
      ? (params.statusData?.stages ?? IDLE_STAGES)
      : IDLE_STAGES;

  const primaryButtonLabel = isSessionFailed
    ? "Tentar Novamente"
    : "Sincronizar agora";

  const canStartSync =
    !params.isStarting && !isPreflightBlocking && !isRunning;

  return {
    isRunning,
    isTracked,
    isCompleted,
    isSessionFailed,
    isHistoricalFailed,
    isAuthError,
    isPreflightBlocking,
    activeMode,
    stages,
    primaryButtonLabel,
    canStartSync,
  };
}

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncSuccess?: () => void;
}

export function SyncModal({ isOpen, onClose, onSyncSuccess }: SyncModalProps) {
  const [statusData, setStatusData] = useState<TagPlusSyncStatusResponse | null>(null);
  const [currentSessionRunId, setCurrentSessionRunId] = useState<string | null>(null);
  const currentSessionRunIdRef = useRef<string | null>(null);
  currentSessionRunIdRef.current = currentSessionRunId;

  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [oauthRequired, setOauthRequired] = useState(false);
  const [baselineRequired, setBaselineRequired] = useState(false);
  const [authorizeUrl, setAuthorizeUrl] = useState<string | null>(null);

  // Preflight state
  const [preflightData, setPreflightData] = useState<TagPlusPreflightResponse | null>(null);
  const [isCheckingPreflight, setIsCheckingPreflight] = useState(false);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const preflightSeqRef = useRef(0);
  const isPreflightInProgressRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasNotifiedSuccessRef = useRef(false);

  const {
    isRunning,
    isCompleted,
    isSessionFailed,
    isHistoricalFailed,
    isAuthError,
    isPreflightBlocking,
    activeMode,
    stages,
    primaryButtonLabel,
  } = deriveSyncModalState({
    statusData,
    currentSessionRunId,
    isStarting,
    errorMessage,
    oauthRequired,
    preflightData,
  });

  const isRunningRef = useRef(isRunning);
  isRunningRef.current = isRunning;

  const resolveAuthorizeUrl = useCallback((rawUrl?: string | null): string => {
    const target = rawUrl || "/integrations/tagplus/authorize";
    if (target.startsWith("http")) return target;
    const base = getBaseUrl();
    return `${base}${target.startsWith("/") ? "" : "/"}${target}`;
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const data = await fetchTagPlusSyncStatus();
      setStatusData(data);

      // Regra 4 & 6: Se há execução em andamento no backend e ainda não rastreamos nada nesta sessão
      // (ex: modal abriu enquanto o sync já rodava), adota a execução ativa
      if (data.isRunning && !currentSessionRunIdRef.current && data.activeRun?.runId) {
        setCurrentSessionRunId(data.activeRun.runId);
        currentSessionRunIdRef.current = data.activeRun.runId;
      }

      return data;
    } catch {
      // Silenciosamente ignora falhas pontuais de rede no polling
      return null;
    }
  }, []);

  const runPreflight = useCallback(async () => {
    if (isRunningRef.current) return;
    if (isPreflightInProgressRef.current) return;

    const currentSeq = ++preflightSeqRef.current;
    setIsCheckingPreflight(true);
    isPreflightInProgressRef.current = true;

    try {
      const data = await fetchTagPlusPreflight();
      if (currentSeq === preflightSeqRef.current) {
        setPreflightData(data);
        if (data.status === "CONNECTED") {
          setOauthRequired(false);
        }
      }
    } catch {
      if (currentSeq === preflightSeqRef.current) {
        setPreflightData({
          status: "ERROR",
          reason: "CONNECTION_FAILED",
          message: "Não foi possível conectar ao TagPlus.",
          description: "Verifique sua conexão e tente novamente.",
          authorizeUrl: "/integrations/tagplus/authorize",
          isLocalEnvironment: false,
        });
      }
    } finally {
      if (currentSeq === preflightSeqRef.current) {
        setIsCheckingPreflight(false);
      }
      isPreflightInProgressRef.current = false;
    }
  }, []);

  // Preflight na abertura e retorno via window.focus
  useEffect(() => {
    if (!isOpen) {
      setCurrentSessionRunId(null);
      currentSessionRunIdRef.current = null;
      hasNotifiedSuccessRef.current = false;
      setStatusData(null);
      setIsStarting(false);
      setErrorMessage(null);
      setOauthRequired(false);
      setBaselineRequired(false);
      setAuthorizeUrl(null);
      setPreflightData(null);
      setIsCheckingPreflight(false);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      return;
    }

    void runPreflight();

    const handleFocus = () => {
      if (isRunningRef.current) return;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        void runPreflight();
      }, 300);
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [isOpen, runPreflight]);

  // Polling de status quando o modal abre ou execução ativa
  useEffect(() => {
    if (!isOpen) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    void refreshStatus();

    pollIntervalRef.current = setInterval(async () => {
      const latest = await refreshStatus();
      if (latest && !latest.isRunning) {
        const trackedId = currentSessionRunIdRef.current;
        // Somente notifica sucesso uma única vez e somente se o run da sessão concluiu
        if (
          trackedId &&
          latest.activeRun?.runId === trackedId &&
          latest.activeRun?.status === "COMPLETED" &&
          !hasNotifiedSuccessRef.current
        ) {
          hasNotifiedSuccessRef.current = true;
          onSyncSuccess?.();
        }
      }
    }, 2000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [isOpen, refreshStatus, onSyncSuccess]);

  const handleStartSync = async (mode: TagPlusSyncMode = "INCREMENTAL") => {
    setIsStarting(true);
    setErrorMessage(null);
    setOauthRequired(false);
    setBaselineRequired(false);
    setAuthorizeUrl(null);
    hasNotifiedSuccessRef.current = false;

    try {
      const result = await startTagPlusSync(mode);
      // Item 3: Transição imediata após start
      // - salvar imediatamente em currentSessionRunId
      // - entrar imediatamente no estado RUNNING
      // - não esperar o primeiro polling para atualizar a UX
      setCurrentSessionRunId(result.runId);
      currentSessionRunIdRef.current = result.runId;

      setStatusData((prev) => ({
        isRunning: true,
        activeRun: {
          runId: result.runId,
          mode: result.mode,
          status: result.status,
          currentStage: result.currentStage,
          startedAt: result.startedAt,
          elapsedSeconds: 0,
          windowSince: result.windowSince,
          windowUntil: result.windowUntil,
        },
        stages: {
          customers: { status: "RUNNING" },
          products: { status: "WAITING" },
          sales: { status: "WAITING" },
        },
        lastCompletedSync: prev?.lastCompletedSync ?? null,
        lastCompletedIncrementalSync: prev?.lastCompletedIncrementalSync ?? null,
        lastCompletedFullSync: prev?.lastCompletedFullSync ?? null,
      }));

      await refreshStatus();
    } catch (err: unknown) {
      if (err instanceof TagPlusSyncApiError) {
        if (err.code === "TAGPLUS_OAUTH_REQUIRED") {
          setOauthRequired(true);
          const rawAuthorizeUrl =
            err.details?.authorizeUrl || "/integrations/tagplus/authorize";
          setAuthorizeUrl(resolveAuthorizeUrl(rawAuthorizeUrl));
        } else if (err.code === "TAGPLUS_INCREMENTAL_BASELINE_REQUIRED") {
          setBaselineRequired(true);
        } else if (err.code === "TAGPLUS_SYNC_ALREADY_RUNNING") {
          const runningId = err.details?.activeRun?.runId;
          if (runningId) {
            setCurrentSessionRunId(runningId);
            currentSessionRunIdRef.current = runningId;
          }
          await refreshStatus();
        } else {
          setErrorMessage(err.message);
        }
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("Erro desconhecido ao iniciar sincronização.");
      }
    } finally {
      setIsStarting(false);
    }
  };

  if (!isOpen) return null;

  const elapsed = statusData?.activeRun?.elapsedSeconds ?? 0;
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div
      className="tp-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-modal-title"
    >
      <div className="tp-modal-card tp-sync-modal">
        {/* Header */}
        <div className="tp-modal-header">
          <div className="tp-sync-title-box">
            <div className="tp-sync-icon-badge">
              <RefreshCw className={isRunning ? "tp-spin" : ""} size={20} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h2 id="sync-modal-title" className="tp-modal-title">
                  Sincronização TagPlus
                </h2>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: "12px",
                    background:
                      activeMode === "FULL"
                        ? "rgba(234, 179, 8, 0.15)"
                        : "rgba(59, 130, 246, 0.15)",
                    color: activeMode === "FULL" ? "#eab308" : "#3b82f6",
                    border:
                      activeMode === "FULL"
                        ? "1px solid rgba(234, 179, 8, 0.3)"
                        : "1px solid rgba(59, 130, 246, 0.3)",
                  }}
                >
                  {activeMode === "FULL" ? "Reconciliação Completa" : "Incremental"}
                </span>
              </div>
              <p className="tp-modal-subtitle">
                Atualização da base Nineclouds consultando alterações na API TagPlus.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="tp-modal-close"
            onClick={onClose}
            aria-label="Fechar"
            disabled={isRunning}
          >
            <X size={20} />
          </button>
        </div>

        {/* Bloco Conexão TagPlus */}
        <div
          className={`tp-sync-connection-card is-${
            isCheckingPreflight
              ? "checking"
              : preflightData?.status?.toLowerCase() || "checking"
          }`}
          data-testid="tagplus-connection-card"
        >
          <div className="tp-sync-connection-main">
            <div className="tp-sync-connection-status">
              {isCheckingPreflight ? (
                <>
                  <RefreshCw size={15} className="tp-spin" />
                  <span>Verificando conexão com o TagPlus...</span>
                </>
              ) : preflightData?.status === "CONNECTED" ? (
                <>
                  <CheckCircle2 size={15} />
                  <span>✓ TagPlus conectado</span>
                </>
              ) : preflightData?.status === "AUTH_REQUIRED" ? (
                <>
                  <Lock size={15} />
                  <span>Autorização do TagPlus necessária</span>
                </>
              ) : (
                <>
                  <AlertCircle size={15} />
                  <span>Erro de conexão com o TagPlus</span>
                </>
              )}
            </div>

            <div className="tp-sync-connection-actions">
              {preflightData?.status === "CONNECTED" && (
                <a
                  href={resolveAuthorizeUrl(preflightData.authorizeUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="tp-sync-reauth-btn"
                  title="Abrir novamente o fluxo de autorização OAuth do TagPlus"
                >
                  <ExternalLink size={12} />
                  <span>Reautorizar TagPlus</span>
                </a>
              )}

              {preflightData?.status === "AUTH_REQUIRED" && (
                <a
                  href={resolveAuthorizeUrl(preflightData.authorizeUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="tp-button tp-button-primary tp-button-sm"
                >
                  <ExternalLink size={13} />
                  <span>Autorizar TagPlus</span>
                </a>
              )}

              {preflightData?.status === "ERROR" && (
                <button
                  type="button"
                  className="tp-button tp-button-secondary tp-button-sm"
                  onClick={() => void runPreflight()}
                  disabled={isCheckingPreflight}
                >
                  <RefreshCw
                    size={13}
                    className={isCheckingPreflight ? "tp-spin" : ""}
                  />
                  <span>Testar Conexão</span>
                </button>
              )}
            </div>
          </div>

          {!isCheckingPreflight && preflightData?.description && (
            <p className="tp-sync-connection-desc">{preflightData.description}</p>
          )}

          {preflightData?.isLocalEnvironment && (
            <div className="tp-sync-local-hint">
              <span className="tp-sync-local-tag">Ambiente local</span>
              <span className="tp-sync-local-text">
                Para concluir a autorização do TagPlus, mantenha o túnel ngrok configurado para o callback OAuth ativo.
              </span>
            </div>
          )}
        </div>

        {/* Banner Baseline Requerida */}
        {baselineRequired && (
          <div className="tp-sync-banner is-error">
            <AlertCircle size={18} className="tp-sync-banner-icon" />
            <div className="tp-sync-banner-text">
              <strong>Reconciliação Completa Necessária</strong>
              <p>
                Nenhuma sincronização completa prévia foi encontrada para a conexão Nineclouds.
                Execute uma Reconciliação Completa para criar o baseline inicial.
              </p>
            </div>
            <button
              type="button"
              className="tp-button tp-button-primary tp-button-sm"
              onClick={() => handleStartSync("FULL")}
              disabled={isRunning || isPreflightBlocking}
            >
              <Database size={14} />
              <span>Executar Reconciliação Completa</span>
            </button>
          </div>
        )}

        {/* Banner de Autorização Expirada durante/após Sync */}
        {(oauthRequired || (isSessionFailed && isAuthError)) && !baselineRequired && (
          <div className="tp-sync-banner is-oauth" data-testid="auth-expired-banner">
            <Lock size={18} className="tp-sync-banner-icon" />
            <div className="tp-sync-banner-text">
              <strong>Autorização do TagPlus expirada</strong>
              <p>Autorize novamente sua conta para continuar a sincronização.</p>
            </div>
            <a
              href={resolveAuthorizeUrl(authorizeUrl || preflightData?.authorizeUrl)}
              target="_blank"
              rel="noreferrer"
              className="tp-button tp-button-primary tp-button-sm"
            >
              <ExternalLink size={14} />
              <span>Autorizar TagPlus</span>
            </a>
          </div>
        )}

        {/* Banner de Erro Geral Técnico (não-auth) */}
        {(errorMessage || (isSessionFailed && !isAuthError)) &&
          !oauthRequired &&
          !baselineRequired && (
            <div className="tp-sync-banner is-error">
              <AlertCircle size={18} className="tp-sync-banner-icon" />
              <div className="tp-sync-banner-text">
                <strong>Falha na Sincronização</strong>
                <p>
                  {errorMessage ||
                    statusData?.activeRun?.errorMessage ||
                    "Ocorreu um erro durante a execução da sincronização."}
                </p>
              </div>
            </div>
          )}

        {/* Banner de Sucesso */}
        {isCompleted && (
          <div className="tp-sync-banner is-success">
            <CheckCircle2 size={18} className="tp-sync-banner-icon" />
            <div className="tp-sync-banner-text">
              <strong>
                {activeMode === "FULL"
                  ? "Reconciliação Completa Concluída"
                  : "Sincronização Incremental Concluída"}
              </strong>
              <p>
                A base local do TagPulse foi atualizada em {formatDuration(elapsed)}.
              </p>
            </div>
          </div>
        )}

        {/* Lista de Etapas */}
        <div className="tp-sync-stages-list">
          {/* Etapa 1: Clientes */}
          <div className={`tp-sync-stage-item is-${stages.customers.status.toLowerCase()}`}>
            <div className="tp-sync-stage-icon-wrap">
              <Users size={16} />
            </div>
            <div className="tp-sync-stage-info">
              <div className="tp-sync-stage-header">
                <span className="tp-sync-stage-name">1. Clientes</span>
                <span className={`tp-sync-stage-badge is-${stages.customers.status.toLowerCase()}`}>
                  {stages.customers.status === "WAITING" && "Aguardando"}
                  {stages.customers.status === "RUNNING" && "Sincronizando..."}
                  {stages.customers.status === "COMPLETED" && "Concluído"}
                  {stages.customers.status === "FAILED" && "Erro"}
                </span>
              </div>
              {stages.customers.summary && (
                <div className="tp-sync-stage-metrics">
                  <span>
                    {(stages.customers.summary.recordsFetched as number)?.toLocaleString() ?? 0} registros analisados
                  </span>
                  <span className="tp-metric-sep">•</span>
                  <span>
                    {(stages.customers.summary.recordsInserted as number) ?? 0} novos
                  </span>
                  <span className="tp-metric-sep">•</span>
                  <span>
                    {(stages.customers.summary.recordsUpdated as number) ?? 0} atualizados
                  </span>
                </div>
              )}
              {stages.customers.error && (
                <p className="tp-sync-stage-error">{stages.customers.error}</p>
              )}
            </div>
          </div>

          {/* Etapa 2: Produtos */}
          <div className={`tp-sync-stage-item is-${stages.products.status.toLowerCase()}`}>
            <div className="tp-sync-stage-icon-wrap">
              <Package size={16} />
            </div>
            <div className="tp-sync-stage-info">
              <div className="tp-sync-stage-header">
                <span className="tp-sync-stage-name">2. Produtos</span>
                <span className={`tp-sync-stage-badge is-${stages.products.status.toLowerCase()}`}>
                  {stages.products.status === "WAITING" && "Aguardando"}
                  {stages.products.status === "RUNNING" && "Sincronizando..."}
                  {stages.products.status === "COMPLETED" && "Concluído"}
                  {stages.products.status === "FAILED" && "Erro"}
                </span>
              </div>
              {stages.products.summary && (
                <div className="tp-sync-stage-metrics">
                  <span>
                    {(stages.products.summary.recordsFetched as number)?.toLocaleString() ?? 0} produtos analisados
                  </span>
                  <span className="tp-metric-sep">•</span>
                  <span>
                    {(stages.products.summary.recordsInserted as number) ?? 0} novos
                  </span>
                  <span className="tp-metric-sep">•</span>
                  <span>
                    {(stages.products.summary.recordsUpdated as number) ?? 0} atualizados
                  </span>
                </div>
              )}
              {stages.products.error && (
                <p className="tp-sync-stage-error">{stages.products.error}</p>
              )}
            </div>
          </div>

          {/* Etapa 3: Vendas */}
          <div className={`tp-sync-stage-item is-${stages.sales.status.toLowerCase()}`}>
            <div className="tp-sync-stage-icon-wrap">
              <ShoppingCart size={16} />
            </div>
            <div className="tp-sync-stage-info">
              <div className="tp-sync-stage-header">
                <span className="tp-sync-stage-name">3. Vendas e Faturamento</span>
                <span className={`tp-sync-stage-badge is-${stages.sales.status.toLowerCase()}`}>
                  {stages.sales.status === "WAITING" && "Aguardando"}
                  {stages.sales.status === "RUNNING" && "Sincronizando..."}
                  {stages.sales.status === "COMPLETED" && "Concluído"}
                  {stages.sales.status === "FAILED" && "Erro"}
                </span>
              </div>
              {stages.sales.summary && (
                <div className="tp-sync-stage-metrics">
                  {(() => {
                    const sum = stages.sales.summary as {
                      pedidos?: { recordsFetched?: number };
                      vendasSimples?: { recordsFetched?: number };
                      nfes?: { recordsFetched?: number };
                    };
                    return (
                      <span>
                        Pedidos: {sum.pedidos?.recordsFetched ?? 0} | Vendas Simples:{" "}
                        {sum.vendasSimples?.recordsFetched ?? 0} | NF-e:{" "}
                        {sum.nfes?.recordsFetched ?? 0}
                      </span>
                    );
                  })()}
                </div>
              )}
              {stages.sales.error && (
                <p className="tp-sync-stage-error">{stages.sales.error}</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="tp-modal-footer tp-sync-footer">
          <div className="tp-sync-footer-left">
            {isRunning && (
              <div className="tp-sync-elapsed-time">
                <RefreshCw size={13} className="tp-spin" />
                <span>Tempo decorrido: {formatDuration(elapsed)}</span>
              </div>
            )}
            {!isRunning && statusData?.lastCompletedSync && (
              <div className="tp-sync-last-run-info">
                <span>
                  Última sincronização bem-sucedida:{" "}
                  {new Date(statusData.lastCompletedSync).toLocaleString("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
              </div>
            )}
            {!isRunning && isHistoricalFailed && (
              <div
                className="tp-sync-last-run-info"
                style={{ color: "#f87171", marginTop: "2px" }}
              >
                <span>
                  Última tentativa falhou
                  {statusData?.activeRun?.errorMessage
                    ? `: ${statusData.activeRun.errorMessage}`
                    : ""}
                </span>
              </div>
            )}
          </div>

          <div className="tp-sync-footer-actions">
            {!isRunning && !isCompleted && (
              <>
                <button
                  type="button"
                  className="tp-button tp-button-secondary"
                  onClick={() => handleStartSync("FULL")}
                  disabled={isStarting || isPreflightBlocking}
                  title={
                    isPreflightBlocking
                      ? "Conecte o TagPlus antes de sincronizar"
                      : "Executa varredura completa de reconciliação na API TagPlus"
                  }
                >
                  <Database size={15} />
                  <span>Reconciliação Completa</span>
                </button>
                <button
                  type="button"
                  className="tp-button tp-button-primary"
                  onClick={() => handleStartSync("INCREMENTAL")}
                  disabled={isStarting || isPreflightBlocking}
                  title={
                    isPreflightBlocking
                      ? "Conecte o TagPlus antes de sincronizar"
                      : undefined
                  }
                >
                  <RefreshCw size={15} />
                  <span>{primaryButtonLabel}</span>
                </button>
              </>
            )}

            {isCompleted && (
              <button
                type="button"
                className="tp-button tp-button-primary"
                onClick={onClose}
              >
                <CheckCircle2 size={15} />
                <span>Fechar e Atualizar Dashboard</span>
              </button>
            )}

            {!isRunning && isSessionFailed && (
              <button
                type="button"
                className="tp-button tp-button-secondary"
                onClick={onClose}
              >
                <span>Fechar</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
