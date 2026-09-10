import { useState, type ReactNode } from "react";
import {
  BarChart3,
  Users,
  Package,
  Boxes,
  PieChart,
  Menu,
  X,
} from "lucide-react";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
        <button
          type="button"
          className="tp-mobile-toggle"
          onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          aria-label={isMobileMenuOpen ? "Fechar menu" : "Abrir menu"}
        >
          {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
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

          {/* Clientes */}
          <div className="tp-nav-group">
            <span className="tp-nav-group-title">CLIENTES</span>
            <ul className="tp-nav-list">
              <li>
                <button
                  type="button"
                  className="tp-nav-item"
                  onClick={() => scrollToSection("clientes")}
                >
                  <Users size={17} className="tp-nav-icon" />
                  <span className="tp-nav-text">Inteligência de Clientes</span>
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
      </aside>

      {/* Main Layout Area */}
      <div className="tp-main-wrapper" id="topo">
        {children}
      </div>
    </div>
  );
}
