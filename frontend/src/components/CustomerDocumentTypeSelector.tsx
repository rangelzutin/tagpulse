import type { CustomerDocumentType } from "../api/bi";

interface CustomerDocumentTypeSelectorProps {
  value: CustomerDocumentType;
  onChange: (type: CustomerDocumentType) => void;
  disabled?: boolean;
}

const OPTIONS: Array<{
  value: CustomerDocumentType;
  label: string;
  tooltip: string;
}> = [
  { value: "all", label: "Todos", tooltip: "Todos os clientes da base" },
  { value: "cnpj", label: "CNPJ", tooltip: "Clientes cadastrados com CNPJ" },
  { value: "cpf", label: "CPF", tooltip: "Clientes cadastrados com CPF" },
  {
    value: "no_document",
    label: "Sem CPF/CNPJ",
    tooltip: "Clientes sem CPF e sem CNPJ cadastrados",
  },
];

export function CustomerDocumentTypeSelector({
  value,
  onChange,
  disabled = false,
}: CustomerDocumentTypeSelectorProps) {
  return (
    <div
      className="tp-doc-type-control"
      role="radiogroup"
      aria-label="Filtro por tipo de cliente"
    >
      <span className="tp-doc-type-control-label" id="tp-doc-type-label">
        Tipo de cliente:
      </span>
      <div
        className="tp-doc-type-pills"
        role="presentation"
        aria-labelledby="tp-doc-type-label"
      >
        {OPTIONS.map((opt) => {
          const isSelected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              title={opt.tooltip}
              disabled={disabled}
              className={`tp-doc-type-pill ${isSelected ? "is-selected" : ""}`}
              onClick={() => {
                if (value !== opt.value) {
                  onChange(opt.value);
                }
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
