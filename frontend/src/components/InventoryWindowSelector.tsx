import type { InventoryWindowDays } from "../api/bi";

interface InventoryWindowSelectorProps {
  value: InventoryWindowDays;
  onChange: (value: InventoryWindowDays) => void;
  disabled?: boolean;
}

const WINDOWS: { label: string; value: InventoryWindowDays }[] = [
  { label: "30 dias", value: 30 },
  { label: "90 dias", value: 90 },
  { label: "180 dias", value: 180 },
];

export function InventoryWindowSelector({
  value,
  onChange,
  disabled = false,
}: InventoryWindowSelectorProps) {
  return (
    <div
      className="tp-inventory-window-selector"
      role="group"
      aria-label="Janela de velocidade"
    >
      <span className="tp-inventory-window-label">Janela de velocidade</span>
      <div className="tp-inventory-window-buttons">
        {WINDOWS.map((item) => {
          const isActive = value === item.value;
          return (
            <button
              key={item.value}
              type="button"
              className={`tp-inventory-window-btn ${isActive ? "is-active" : ""}`}
              onClick={() => {
                if (!isActive && !disabled) {
                  onChange(item.value);
                }
              }}
              disabled={disabled}
              aria-pressed={isActive}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
