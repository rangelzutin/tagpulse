import { useState, useId } from "react";

interface PeriodFilterProps {
  initialFrom: string;
  initialTo: string;
  isLoading: boolean;
  onApply: (from: string, to: string) => void;
}

export function PeriodFilter({
  initialFrom,
  initialTo,
  isLoading,
  onApply,
}: PeriodFilterProps) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [validationError, setValidationError] = useState<string | null>(null);

  const fromId = useId();
  const toId = useId();

  const handleFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFrom(value);
    if (to && value > to) {
      setValidationError("A data inicial não pode ser posterior à data final.");
    } else {
      setValidationError(null);
    }
  };

  const handleToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTo(value);
    if (from && from > value) {
      setValidationError("A data final não pode ser anterior à data inicial.");
    } else {
      setValidationError(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!from || !to) {
      setValidationError("Selecione ambas as datas para o período.");
      return;
    }
    if (from > to) {
      setValidationError("A data inicial não pode ser posterior à data final.");
      return;
    }
    setValidationError(null);
    onApply(from, to);
  };

  const isInvalid = Boolean(validationError) || !from || !to;

  return (
    <section className="tp-filter-card" aria-label="Filtro de período">
      <form onSubmit={handleSubmit} className="tp-filter-form">
        <div className="tp-filter-fields">
          <div className="tp-field-group">
            <label htmlFor={fromId} className="tp-label">
              Data inicial
            </label>
            <input
              id={fromId}
              type="date"
              value={from}
              onChange={handleFromChange}
              disabled={isLoading}
              className="tp-input-date"
              required
            />
          </div>

          <div className="tp-field-group">
            <label htmlFor={toId} className="tp-label">
              Data final
            </label>
            <input
              id={toId}
              type="date"
              value={to}
              onChange={handleToChange}
              disabled={isLoading}
              className="tp-input-date"
              required
            />
          </div>
        </div>

        <div className="tp-filter-actions">
          <button
            type="submit"
            disabled={isLoading || isInvalid}
            className="tp-btn-primary"
          >
            {isLoading ? "Carregando..." : "Atualizar"}
          </button>
        </div>
      </form>

      {validationError && (
        <div className="tp-filter-error" role="alert">
          {validationError}
        </div>
      )}
    </section>
  );
}
