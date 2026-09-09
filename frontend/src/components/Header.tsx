interface HeaderProps {
  isUpdating?: boolean;
}

export function Header({ isUpdating }: HeaderProps) {
  return (
    <header className="tp-header">
      <div className="tp-header-brand">
        <div className="tp-brand-title-wrap">
          <h1 className="tp-brand-title">TagPulse</h1>
          <span className="tp-brand-badge">Nineclouds</span>
        </div>
        <p className="tp-brand-subtitle">Inteligência Comercial</p>
      </div>
      {isUpdating && (
        <div className="tp-header-status" aria-live="polite">
          <span className="tp-status-dot" />
          <span className="tp-status-text">Atualizando dados...</span>
        </div>
      )}
    </header>
  );
}
