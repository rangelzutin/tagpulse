import { type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

interface HeaderProps {
  isUpdating?: boolean;
  children?: ReactNode;
}

export function Header({ isUpdating, children }: HeaderProps) {
  return (
    <header className="tp-header">
      <div className="tp-header-left">
        <div className="tp-header-title-row">
          <h1 className="tp-page-title">Performance Comercial</h1>
          {isUpdating && (
            <div className="tp-header-status" aria-live="polite">
              <RefreshCw size={12} className="tp-spin" />
              <span className="tp-status-text">Atualizando...</span>
            </div>
          )}
        </div>
        <p className="tp-page-subtitle">
          Análise operacional e comercial da Nineclouds com base nas vendas
          realizadas e no comportamento da base de clientes.
        </p>
      </div>

      {children && <div className="tp-header-right">{children}</div>}
    </header>
  );
}
