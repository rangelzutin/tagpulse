import { type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

interface HeaderProps {
  title?: string;
  subtitle?: string;
  badge?: string;
  isUpdating?: boolean;
  children?: ReactNode;
}

export function Header({
  title = "Performance Comercial",
  subtitle = "Análise operacional e comercial da Nineclouds com base nas vendas realizadas e no comportamento da base de clientes.",
  badge,
  isUpdating,
  children,
}: HeaderProps) {
  return (
    <header className="tp-header">
      <div className="tp-header-left">
        <div className="tp-header-title-row">
          <h1 className="tp-page-title">{title}</h1>
          {badge && <span className="tp-header-badge">{badge}</span>}
          {isUpdating && (
            <div className="tp-header-status" aria-live="polite">
              <RefreshCw size={12} className="tp-spin" />
              <span className="tp-status-text">Atualizando...</span>
            </div>
          )}
        </div>
        <p className="tp-page-subtitle">{subtitle}</p>
      </div>

      {children && <div className="tp-header-right">{children}</div>}
    </header>
  );
}
