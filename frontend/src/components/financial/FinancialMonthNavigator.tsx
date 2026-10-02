import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface SelectedMonthRange {
  dueFrom: string;
  dueTo: string;
  year: number;
  month: number; // 1-12
}

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function buildMonthRange(
  year: number,
  month: number,
  maxDate?: string,
): SelectedMonthRange {
  const mStr = String(month).padStart(2, "0");
  const lastDay = String(getDaysInMonth(year, month)).padStart(2, "0");
  const defaultTo = `${year}-${mStr}-${lastDay}`;
  const dueFrom = `${year}-${mStr}-01`;

  let dueTo = defaultTo;
  if (maxDate && /^\d{4}-\d{2}-\d{2}$/.test(maxDate)) {
    if (dueTo > maxDate) {
      dueTo = maxDate;
    }
  }

  return {
    year,
    month,
    dueFrom,
    dueTo,
  };
}

export function calculateEffectiveDueRange(
  selectedMonth: SelectedMonthRange | null,
  periodMode: string | undefined,
  selectedTo: string | undefined,
): { dueFrom?: string; dueTo?: string } {
  const isAllUpTo = periodMode === "allUpTo";

  if (!selectedMonth) {
    if (isAllUpTo && selectedTo) {
      return {
        dueFrom: undefined,
        dueTo: selectedTo,
      };
    }
    return {
      dueFrom: undefined,
      dueTo: undefined,
    };
  }

  const { dueFrom, dueTo } = selectedMonth;

  if (isAllUpTo && selectedTo) {
    const cappedDueTo = dueTo > selectedTo ? selectedTo : dueTo;
    return {
      dueFrom,
      dueTo: cappedDueTo,
    };
  }

  return {
    dueFrom,
    dueTo,
  };
}

interface FinancialMonthNavigatorProps {
  selectedMonth: SelectedMonthRange | null;
  onChange: (range: SelectedMonthRange | null) => void;
  referenceDate?: string;
  maxDate?: string;
}

export function FinancialMonthNavigator({
  selectedMonth,
  onChange,
  referenceDate,
  maxDate,
}: FinancialMonthNavigatorProps) {
  // Determine the reference anchor (default to referenceDate, maxDate or current date)
  const initialAnchor = (() => {
    if (selectedMonth) {
      return { year: selectedMonth.year, month: selectedMonth.month };
    }
    const anchorDate = referenceDate || maxDate;
    if (anchorDate && /^\d{4}-\d{2}-\d{2}$/.test(anchorDate.trim())) {
      const parts = anchorDate.trim().split("-").map(Number);
      return { year: parts[0]!, month: parts[1]! };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  })();

  const [viewYear, setViewYear] = useState(initialAnchor.year);
  const [viewMonth, setViewMonth] = useState(initialAnchor.month);

  const displayYear = selectedMonth ? selectedMonth.year : viewYear;
  const displayMonth = selectedMonth ? selectedMonth.month : viewMonth;
  const monthLabel = `${MONTH_NAMES[displayMonth - 1]} ${displayYear}`;

  // Check if advancing to next month is prohibited by maxDate
  const isNextDisabled = (() => {
    if (!maxDate || !/^\d{4}-\d{2}-\d{2}$/.test(maxDate)) return false;
    const [maxY, maxM] = maxDate.split("-").map(Number);
    if (!maxY || !maxM) return false;
    let nextY = displayYear;
    let nextM = displayMonth + 1;
    if (nextM > 12) {
      nextM = 1;
      nextY += 1;
    }
    if (nextY > maxY) return true;
    if (nextY === maxY && nextM > maxM) return true;
    return false;
  })();

  const handlePrev = () => {
    let nextY = displayYear;
    let nextM = displayMonth - 1;
    if (nextM < 1) {
      nextM = 12;
      nextY -= 1;
    }
    setViewYear(nextY);
    setViewMonth(nextM);
    onChange(buildMonthRange(nextY, nextM, maxDate));
  };

  const handleNext = () => {
    if (isNextDisabled) return;
    let nextY = displayYear;
    let nextM = displayMonth + 1;
    if (nextM > 12) {
      nextM = 1;
      nextY += 1;
    }
    setViewYear(nextY);
    setViewMonth(nextM);
    onChange(buildMonthRange(nextY, nextM, maxDate));
  };

  const handleActivateViewMonth = () => {
    onChange(buildMonthRange(displayYear, displayMonth, maxDate));
  };

  const handleSelectAll = () => {
    onChange(null);
  };

  return (
    <div className="tp-month-navigator" role="group" aria-label="Navegação por mês de vencimento">
      <div className="tp-month-nav-controls">
        <button
          type="button"
          className="tp-month-nav-arrow"
          onClick={handlePrev}
          aria-label="Mês anterior"
          title="Mês anterior"
        >
          <ChevronLeft size={14} />
        </button>

        <button
          type="button"
          className={`tp-month-nav-label-btn ${selectedMonth !== null ? "is-active" : ""}`}
          onClick={handleActivateViewMonth}
          title={selectedMonth !== null ? "Mês selecionado" : "Clique para filtrar por este mês"}
        >
          <span>{monthLabel}</span>
        </button>

        <button
          type="button"
          className="tp-month-nav-arrow"
          onClick={handleNext}
          disabled={isNextDisabled}
          aria-label="Próximo mês"
          title={isNextDisabled ? "Navegação futura desabilitada pelo limite do período selecionado" : "Próximo mês"}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      <button
        type="button"
        className={`tp-filter-pill tp-month-all-pill ${selectedMonth === null ? "is-selected" : ""}`}
        onClick={handleSelectAll}
        aria-pressed={selectedMonth === null}
        title="Mostrar todos os meses de vencimento"
      >
        Todos
      </button>
    </div>
  );
}
