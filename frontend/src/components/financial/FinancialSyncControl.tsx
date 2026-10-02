import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import {
  fetchFinancialSyncStatus,
  triggerFinancialIncrementalSync,
  FinancialSyncConflictError,
  type FinancialSyncStatusResponse,
} from "../../api/financial";

interface FinancialSyncControlProps {
  onSyncSuccess?: () => void;
}

export function FinancialSyncControl({ onSyncSuccess }: FinancialSyncControlProps) {
  const [syncStatus, setSyncStatus] = useState<FinancialSyncStatusResponse | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollTimerRef.current !== null) {
        window.clearTimeout(pollTimerRef.current);
      }
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const data = await fetchFinancialSyncStatus();
      if (!isMountedRef.current) return data;
      setSyncStatus(data);
      return data;
    } catch {
      // Falha silenciosa no carregamento de status inicial
      return null;
    }
  }, []);

  const pollUntilComplete = useCallback(async () => {
    stopPolling();
    const data = await loadStatus();
    if (!isMountedRef.current) return;

    if (data?.status === "RUNNING") {
      pollTimerRef.current = window.setTimeout(() => {
        void pollUntilComplete();
      }, 2500);
    } else {
      if (data?.status === "SUCCEEDED") {
        setNotice(null);
        onSyncSuccess?.();
      }
    }
  }, [loadStatus, stopPolling, onSyncSuccess]);

  useEffect(() => {
    void (async () => {
      const data = await loadStatus();
      if (data?.status === "RUNNING") {
        void pollUntilComplete();
      }
    })();
  }, [loadStatus, pollUntilComplete]);

  const handleStartSync = async () => {
    if (syncStatus?.status === "RUNNING" || isTriggering) return;
    setIsTriggering(true);
    setNotice(null);

    try {
      await triggerFinancialIncrementalSync();
      setSyncStatus((prev) =>
        prev
          ? { ...prev, status: "RUNNING" }
          : {
              status: "RUNNING",
              startedAt: new Date().toISOString(),
              finishedAt: null,
              durationMs: null,
              since: null,
              lookbackDays: 7,
              recentCandidates: 0,
              openCandidates: 0,
              undatedCandidates: 0,
              uniqueCandidates: 0,
              totalCandidates: 0,
              overlapDeduplicated: 0,
              processed: 0,
              completed: 0,
              failed: 0,
              notFound: 0,
              inserted: 0,
              updated: 0,
              unchanged: 0,
              lastError: null,
            },
      );
      void pollUntilComplete();
    } catch (err: unknown) {
      if (err instanceof FinancialSyncConflictError) {
        setNotice("Sincronização já em andamento.");
        void pollUntilComplete();
      } else {
        const msg = err instanceof Error ? err.message : "Erro ao disparar sincronização.";
        setNotice(msg);
      }
    } finally {
      if (isMountedRef.current) {
        setIsTriggering(false);
      }
    }
  };

  const isRunning = syncStatus?.status === "RUNNING" || isTriggering;

  const formatLastSyncTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return "Nunca sincronizado";
    try {
      const date = new Date(dateStr);
      return date.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="tp-financial-sync-wrap" aria-label="Controle de Sincronização Financeira">
      {/* Status indicator */}
      <div className="tp-financial-sync-status-indicator">
        {isRunning ? (
          <span className="tp-sync-badge is-running" title="Sincronização incremental em andamento">
            <RefreshCw size={12} className="tp-spin" />
            <span>Sincronizando...</span>
          </span>
        ) : syncStatus?.status === "SUCCEEDED" ? (
          <span
            className="tp-sync-badge is-succeeded"
            title={`Última sincronização com sucesso às ${formatLastSyncTime(syncStatus.finishedAt)}`}
          >
            <CheckCircle2 size={12} />
            <span>Atualizado às {formatLastSyncTime(syncStatus.finishedAt)}</span>
          </span>
        ) : syncStatus?.status === "FAILED" ? (
          <span
            className="tp-sync-badge is-failed"
            title={syncStatus.lastError || "Última sincronização falhou"}
          >
            <AlertCircle size={12} />
            <span>Falha na sincronização</span>
          </span>
        ) : (
          <span className="tp-sync-badge is-idle">
            <Clock size={12} />
            <span>{syncStatus?.finishedAt ? `Sinc.: ${formatLastSyncTime(syncStatus.finishedAt)}` : "Pronto"}</span>
          </span>
        )}

        {notice && !isRunning && (
          <span className="tp-financial-sync-notice">{notice}</span>
        )}
      </div>

      {/* Trigger button */}
      <button
        type="button"
        className={`tp-action-btn tp-financial-sync-btn ${isRunning ? "is-loading" : ""}`}
        onClick={handleStartSync}
        disabled={isRunning}
        title="Disparar sincronização incremental de títulos e baixas financeiras do ERP TagPlus"
        aria-label="Sincronizar financeiro"
      >
        <RefreshCw size={13} className={isRunning ? "tp-spin" : ""} />
        <span>{isRunning ? "Sincronizando..." : "Sincronizar financeiro"}</span>
      </button>
    </div>
  );
}
