import { useState, useEffect, useCallback, type ReactNode } from "react";
import {
  BarChart3,
  Package,
  Boxes,
  PieChart,
  Menu,
  X,
  RefreshCw,
} from "lucide-react";
import { SyncModal } from "./SyncModal";
import { fetchTagPlusSyncStatus } from "../api/sync";

interface AppShellProps {
  children: ReactNode;
  onSyncSuccess?: () => void;
}

export function AppShell({ children, onSyncSuccess }: AppShellProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [lastCompletedSync, setLastCompletedSync] = useState<string | null>(null);

  const loadFreshness = useCallback(async () => {
    try {
      const data = await fetchTagPlusSyncStatus();
      setLastCompletedSync(data.lastCompletedSync);
    } catch {
      // ignora falha inicial
    }
  }, []);

  useEffect(() => {
    void loadFreshness();
  }, [loadFreshness]);

  const handleSyncSuccess = useCallback(() => {
    void loadFreshness();
    onSyncSuccess?.();
  }, [loadFreshness, onSyncSuccess]);

  const scrollToSection = (id: string) => {
    setIsMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="tp-shell">
      {/* Mobile Top Bar */}
      <header className="tp-mobile-bar">
        <div className="tp-mobile-brand">
          <div className="tp-brand-logo-icon">
            <span className="tp-logo-dot" />
          </div>
          <div className="tp-brand-names">
            <span className="tp-brand-name">TAGPULSE</span>
            <span className="tp-brand-company">Nineclouds</span>
          </div>
        </div>
        <div className="tp-mobile-actions">
          <button
            type="button"
            className="tp-mobile-sync-btn"
            onClick={() => setIsSyncModalOpen(true)}
            aria-label="Sincronizar Dados"
          >
            <RefreshCw size={17} />
          </button>
          <button
            type="button"
            className="tp-mobile-toggle"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            aria-label={isMobileMenuOpen ? "Fechar menu" : "Abrir menu"}
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Backdrop for mobile */}
      {isMobileMenuOpen && (
        <div
          className="tp-sidebar-backdrop"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Fixed Sidebar */}
      <aside
        className={`tp-sidebar ${isMobileMenuOpen ? "is-open" : ""}`}
        aria-label="Navegação Principal"
      >
        <div className="tp-sidebar-header">
          <div className="tp-brand-wrapper">
            <div className="tp-brand-logo-icon">
              <span className="tp-logo-dot" />
            </div>
            <div className="tp-brand-names">
              <span className="tp-brand-name">TAGPULSE</span>
              <span className="tp-brand-company">Nineclouds</span>
            </div>
          </div>
        </div>

        <nav className="tp-sidebar-nav">
          {/* Painel Executivo */}
          <div className="tp-nav-group">
            <span className="tp-nav-group-title">PAINEL EXECUTIVO</span>
            <ul className="tp-nav-list">
              <li>
                <button
                  type="button"
                  className="tp-nav-item is-active"
                  onClick={() => scrollToSection("topo")}
                >
                  <BarChart3 size={17} className="tp-nav-icon" />
                  <span className="tp-nav-text">Performance Comercial</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Futuro */}
          <div className="tp-nav-group">
            <span className="tp-nav-group-title">FUTURO</span>
            <ul className="tp-nav-list">
              <li>
                <div className="tp-nav-item is-disabled">
                  <Package size={17} className="tp-nav-icon" />
                  <span className="tp-nav-text">Produtos</span>
                  <span className="tp-badge-soon">Em breve</span>
                </div>
              </li>
              <li>
                <div className="tp-nav-item is-disabled">
                  <Boxes size={17} className="tp-nav-icon" />
                  <span className="tp-nav-text">Estoque</span>
                  <span className="tp-badge-soon">Em breve</span>
                </div>
              </li>
              <li>
                <div className="tp-nav-item is-disabled">
                  <PieChart size={17} className="tp-nav-icon" />
                  <span className="tp-nav-text">Margem</span>
                  <span className="tp-badge-soon">Em breve</span>
                </div>
              </li>
            </ul>
          </div>
        </nav>

        {/* Sidebar Footer: Sincronização & Freshness */}
        <div className="tp-sidebar-footer">
          <button
            type="button"
            className="tp-sidebar-sync-btn"
            onClick={() => {
              setIsMobileMenuOpen(false);
              setIsSyncModalOpen(true);
            }}
          >
            <RefreshCw size={15} />
            <span>Sincronizar Dados</span>
          </button>
          <div className="tp-sidebar-freshness">
            <span className="tp-freshness-label">Última sincronização:</span>
            <span className="tp-freshness-val">
              {lastCompletedSync
                ? new Date(lastCompletedSync).toLocaleString("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })
                : "Nunca sincronizado pela aplicação"}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Layout Area */}
      <div className="tp-main-wrapper" id="topo">
        {children}
      </div>

      {/* Modal de Sincronização TagPlus */}
      <SyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        onSyncSuccess={handleSyncSuccess}
      />
    </div>
  );
}
