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
  fetchTagPlusSyncStatus,
  getBaseUrl,
  startTagPlusSync,
  TagPlusSyncApiError,
  type TagPlusSyncMode,
  type TagPlusSyncStatusResponse,
} from "../api/sync.js";

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncSuccess?: () => void;
}

export function SyncModal({ isOpen, onClose, onSyncSuccess }: SyncModalProps) {
  const [statusData, setStatusData] = useState<TagPlusSyncStatusResponse | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [oauthRequired, setOauthRequired] = useState(false);
  const [baselineRequired, setBaselineRequired] = useState(false);
  const [authorizeUrl, setAuthorizeUrl] = useState<string | null>(null);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const data = await fetchTagPlusSyncStatus();
      setStatusData(data);
      return data;
    } catch (err: unknown) {
      // Silenciosamente ignora falhas pontuais de rede no polling
      return null;
    }
  }, []);

  // Inicia polling quando o modal abre ou se uma execução estiver ativa
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
        // Se a execução acabou de concluir com sucesso, aciona revalidação
        if (latest.activeRun?.status === "COMPLETED") {
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

    try {
      await startTagPlusSync(mode);
      await refreshStatus();
    } catch (err: unknown) {
      if (err instanceof TagPlusSyncApiError) {
        if (err.code === "TAGPLUS_OAUTH_REQUIRED") {
          setOauthRequired(true);
          const rawAuthorizeUrl = err.details?.authorizeUrl || "/integrations/tagplus/authorize";
          const finalUrl = rawAuthorizeUrl.startsWith("http")
            ? rawAuthorizeUrl
            : `${getBaseUrl()}${rawAuthorizeUrl.startsWith("/") ? "" : "/"}${rawAuthorizeUrl}`;
          setAuthorizeUrl(finalUrl);
        } else if (err.code === "TAGPLUS_INCREMENTAL_BASELINE_REQUIRED") {
          setBaselineRequired(true);
        } else if (err.code === "TAGPLUS_SYNC_ALREADY_RUNNING") {
          // Já está rodando: basta atualizar o status
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

  const isRunning = statusData?.isRunning || isStarting;
  const isCompleted = !isRunning && statusData?.activeRun?.status === "COMPLETED";
  const isFailed = !isRunning && statusData?.activeRun?.status === "FAILED";
  const activeMode = statusData?.activeRun?.mode ?? "INCREMENTAL";

  const stages = statusData?.stages ?? {
    customers: { status: "WAITING" },
    products: { status: "WAITING" },
    sales: { status: "WAITING" },
  };

  const elapsed = statusData?.activeRun?.elapsedSeconds ?? 0;
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div className="tp-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="sync-modal-title">
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
                    background: activeMode === "FULL" ? "rgba(234, 179, 8, 0.15)" : "rgba(59, 130, 246, 0.15)",
                    color: activeMode === "FULL" ? "#eab308" : "#3b82f6",
                    border: activeMode === "FULL" ? "1px solid rgba(234, 179, 8, 0.3)" : "1px solid rgba(59, 130, 246, 0.3)",
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
              disabled={isRunning}
            >
              <Database size={14} />
              <span>Executar Reconciliação Completa</span>
            </button>
          </div>
        )}

        {/* Banner OAuth */}
        {oauthRequired && (
          <div className="tp-sync-banner is-oauth">
            <Lock size={18} className="tp-sync-banner-icon" />
            <div className="tp-sync-banner-text">
              <strong>Autenticação Necessária</strong>
              <p>O token do TagPlus não está ativo na aplicação. Conecte-se para permitir o acesso.</p>
            </div>
            {authorizeUrl && (
              <a
                href={authorizeUrl}
                target="_blank"
                rel="noreferrer"
                className="tp-button tp-button-primary tp-button-sm"
              >
                <ExternalLink size={14} />
                <span>Autorizar no TagPlus</span>
              </a>
            )}
          </div>
        )}

        {/* Banner de Erro Geral */}
        {(errorMessage || isFailed) && !oauthRequired && !baselineRequired && (
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
                {activeMode === "FULL" ? "Reconciliação Completa Concluída" : "Sincronização Incremental Concluída"}
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
          </div>

          <div className="tp-sync-footer-actions">
            {!isRunning && !isCompleted && (
              <>
                <button
                  type="button"
                  className="tp-button tp-button-secondary"
                  onClick={() => handleStartSync("FULL")}
                  disabled={isStarting}
                  title="Executa varredura completa de reconciliação na API TagPlus"
                >
                  <Database size={15} />
                  <span>Reconciliação Completa</span>
                </button>
                <button
                  type="button"
                  className="tp-button tp-button-primary"
                  onClick={() => handleStartSync("INCREMENTAL")}
                  disabled={isStarting}
                >
                  <RefreshCw size={15} />
                  <span>{isFailed ? "Tentar Novamente" : "Sincronizar Dados"}</span>
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

            {!isRunning && isFailed && (
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
