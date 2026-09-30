import { useEffect, useRef } from "react";
import { X, CalendarOff } from "lucide-react";
import type { UndatedConfirmedCashResponse } from "../../api/financial";
import { formatCurrency, formatDateBr } from "../../utils/formatters";

interface UndatedCashModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: UndatedConfirmedCashResponse | null;
  isLoading?: boolean;
}

export function UndatedCashModal({
  isOpen,
  onClose,
  data,
  isLoading = false,
}: UndatedCashModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const records = data?.records ?? [];
  const summary = data?.summary;

  return (
    <div className="tp-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="undated-modal-title">
      <div className="tp-modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="tp-modal-content tp-undated-modal-container" ref={modalRef}>
        <div className="tp-modal-header">
          <div className="tp-modal-title-wrap">
            <div className="tp-modal-icon-badge tp-badge-amber">
              <CalendarOff size={18} />
            </div>
            <div>
              <h2 id="undated-modal-title" className="tp-modal-title">
                Lançamentos Confirmados Sem Data
              </h2>
              <p className="tp-modal-subtitle">
                Títulos marcados como pagos/confirmados no TagPlus, mas sem data de baixa preenchida.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="tp-modal-close-btn"
            onClick={onClose}
            aria-label="Fechar modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Summary Banner */}
        {summary && (
          <div className="tp-undated-summary-banner">
            <div className="tp-undated-stat-item">
              <span className="tp-stat-label">Total de títulos:</span>
              <span className="tp-stat-val">{summary.undatedConfirmedCount}</span>
            </div>
            <div className="tp-undated-stat-item">
              <span className="tp-stat-label">Entradas confirmadas:</span>
              <span className="tp-stat-val tp-value-emerald">
                {formatCurrency(summary.undatedConfirmedInflows)}
              </span>
            </div>
            <div className="tp-undated-stat-item">
              <span className="tp-stat-label">Saídas confirmadas:</span>
              <span className="tp-stat-val tp-value-rose">
                {formatCurrency(summary.undatedConfirmedOutflows)}
              </span>
            </div>
            <div className="tp-undated-stat-item">
              <span className="tp-stat-label">Saldo sem data:</span>
              <span className="tp-stat-val tp-value-cyan">
                {formatCurrency(summary.undatedConfirmedNet)}
              </span>
            </div>
          </div>
        )}

        {/* Content Table / State */}
        <div className="tp-undated-table-container">
          {isLoading ? (
            <div className="tp-loading-state" role="status">
              <div className="tp-spinner" />
              <p className="tp-loading-text">Carregando lançamentos sem data...</p>
            </div>
          ) : records.length === 0 ? (
            <div className="tp-empty-state-card">
              <p className="tp-empty-text">Nenhum lançamento confirmado sem data encontrado.</p>
            </div>
          ) : (
            <table className="tp-table tp-table-compact">
              <thead>
                <tr>
                  <th className="tp-th tp-th-left">Tipo</th>
                  <th className="tp-th tp-th-left">Entidade / Cliente</th>
                  <th className="tp-th tp-th-left">Descrição / Doc</th>
                  <th className="tp-th tp-th-center">Vencimento</th>
                  <th className="tp-th tp-th-right">Valor Caixa</th>
                </tr>
              </thead>
              <tbody>
                {records.map((item) => (
                  <tr key={item.sourceId} className="tp-table-row">
                    <td className="tp-td tp-td-left">
                      <span
                        className={`tp-badge-subtle ${
                          item.type === "ENTRADA" ? "is-emerald" : "is-rose"
                        }`}
                      >
                        {item.type === "ENTRADA" ? "Entrada" : "Saída"}
                      </span>
                    </td>
                    <td className="tp-td tp-td-left tp-font-medium">
                      {item.entityName || "Não identificada"}
                    </td>
                    <td className="tp-td tp-td-left tp-text-muted">
                      <span>{item.description || "Sem descrição"}</span>
                      {item.documentNumber && (
                        <span className="tp-doc-pill">Doc: {item.documentNumber}</span>
                      )}
                    </td>
                    <td className="tp-td tp-td-center tp-font-mono">
                      {item.dueDate ? formatDateBr(item.dueDate) : "—"}
                    </td>
                    <td className="tp-td tp-td-right tp-font-mono tp-font-medium">
                      {formatCurrency(item.effectiveCashAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="tp-modal-footer">
          <button type="button" className="tp-action-btn" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
