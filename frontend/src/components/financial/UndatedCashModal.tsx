import { useEffect, useRef } from "react";
import { X, CalendarOff } from "lucide-react";
import type { UndatedConfirmedCashResponse } from "../../api/financial";
import { formatCurrency, formatDateBr, formatNumber } from "../../utils/formatters";

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
    <div
      className="tp-modal-overlay tp-undated-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="undated-modal-title"
    >
      <div className="tp-modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="tp-undated-modal" ref={modalRef}>
        {/* Integrated Header */}
        <div className="tp-undated-modal-header">
          <div className="tp-undated-modal-header-left">
            <div className="tp-undated-modal-icon-badge" aria-hidden="true">
              <CalendarOff size={16} />
            </div>
            <div className="tp-undated-modal-titles">
              <h2 id="undated-modal-title" className="tp-undated-modal-title">
                Confirmados sem data de confirmação
              </h2>
              <p className="tp-undated-modal-subtitle">
                Lançamentos financeiros confirmados sem data de confirmação disponível.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="tp-undated-modal-close"
            onClick={onClose}
            aria-label="Fechar modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* 3-Indicator Summary */}
        {summary && (
          <div className="tp-undated-modal-summary">
            <div className="tp-undated-summary-card">
              <span className="tp-undated-summary-label">Títulos</span>
              <span className="tp-undated-summary-val">
                {formatNumber(summary.undatedConfirmedCount)}
              </span>
            </div>
            <div className="tp-undated-summary-card">
              <span className="tp-undated-summary-label">Entradas</span>
              <span className="tp-undated-summary-val tp-value-emerald">
                {formatCurrency(summary.undatedConfirmedInflows)}
              </span>
            </div>
            <div className="tp-undated-summary-card">
              <span className="tp-undated-summary-label">
                {summary.undatedConfirmedOutflows > 0 ? "Saldo sem data" : "Saídas / Saldo sem data"}
              </span>
              <span className="tp-undated-summary-val tp-value-cyan">
                {formatCurrency(summary.undatedConfirmedNet)}
              </span>
            </div>
          </div>
        )}

        {/* Content Table / State */}
        <div className="tp-undated-modal-body">
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
            <div className="tp-undated-table-wrap">
              <table className="tp-undated-table">
                <thead>
                  <tr>
                    <th className="tp-undated-th tp-col-type">Tipo</th>
                    <th className="tp-undated-th tp-col-entity">Entidade / Cliente</th>
                    <th className="tp-undated-th tp-col-desc">Descrição / Documento</th>
                    <th className="tp-undated-th tp-col-due">Vencimento</th>
                    <th className="tp-undated-th tp-col-val">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((item) => (
                    <tr key={item.sourceId} className="tp-undated-row">
                      <td className="tp-undated-td tp-col-type">
                        <span
                          className={`tp-badge-subtle ${
                            item.type === "ENTRADA" ? "is-emerald" : "is-rose"
                          }`}
                        >
                          {item.type === "ENTRADA" ? "Entrada" : "Saída"}
                        </span>
                      </td>
                      <td
                        className="tp-undated-td tp-col-entity tp-entity-cell"
                        title={item.entityName || "Não identificada"}
                      >
                        {item.entityName || "Não identificada"}
                      </td>
                      <td className="tp-undated-td tp-col-desc">
                        <div className="tp-desc-flex">
                          <span
                            className="tp-desc-text"
                            title={item.description || "Sem descrição"}
                          >
                            {item.description || "Sem descrição"}
                          </span>
                          {item.documentNumber && (
                            <span className="tp-doc-pill">Doc: {item.documentNumber}</span>
                          )}
                        </div>
                      </td>
                      <td className="tp-undated-td tp-col-due tp-font-mono">
                        {item.dueDate ? formatDateBr(item.dueDate) : "—"}
                      </td>
                      <td className="tp-undated-td tp-col-val tp-font-mono tp-font-medium tp-val-right">
                        {formatCurrency(item.effectiveCashAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="tp-undated-modal-footer">
          <button type="button" className="tp-undated-btn-close" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
