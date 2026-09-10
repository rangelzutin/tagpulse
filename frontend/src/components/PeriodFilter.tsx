import { useState, useRef, useEffect, useMemo } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { ptBR } from "date-fns/locale";
import { Calendar, ChevronDown } from "lucide-react";
import {
  formatDisplayDate,
  parseIsoDate,
  getLocalDateString,
} from "../utils/formatters";
import "react-day-picker/style.css";

interface PeriodFilterProps {
  initialFrom: string;
  initialTo: string;
  isLoading?: boolean;
  onApply: (from: string, to: string) => void;
}

function getTargetViewMonth(toDateStr: string, numMonths: number): Date {
  const toDate = parseIsoDate(toDateStr);
  if (numMonths === 2) {
    return new Date(toDate.getFullYear(), toDate.getMonth() - 1, 1);
  }
  return new Date(toDate.getFullYear(), toDate.getMonth(), 1);
}

export function PeriodFilter({
  initialFrom,
  initialTo,
  isLoading,
  onApply,
}: PeriodFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track responsive numberOfMonths: 2 on desktop, 1 on mobile
  const [numberOfMonths, setNumberOfMonths] = useState(2);

  useEffect(() => {
    const handleResize = () => {
      setNumberOfMonths(window.innerWidth < 768 ? 1 : 2);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Selected range in calendar
  const [range, setRange] = useState<DateRange | undefined>(() => ({
    from: parseIsoDate(initialFrom),
    to: parseIsoDate(initialTo),
  }));

  // Visible month in calendar (positioned at the end of the interval)
  const [month, setMonth] = useState<Date>(() =>
    getTargetViewMonth(initialTo, numberOfMonths),
  );

  // Sync range and visible month with initial props, and reset partial selection when popover closes
  useEffect(() => {
    if (!isOpen) {
      setRange({
        from: parseIsoDate(initialFrom),
        to: parseIsoDate(initialTo),
      });
      setMonth(getTargetViewMonth(initialTo, numberOfMonths));
    }
  }, [isOpen, initialFrom, initialTo, numberOfMonths]);

  // Close popover when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Handle explicit 2-click day selection
  // 1st click: define start (do not fetch, do not close)
  // 2nd click: define end (automatically fetch both endpoints and close popover)
  const handleDayClick = (clickedDay: Date) => {
    if (range?.from && !range?.to) {
      // 2nd click: complete interval
      const fromDate = clickedDay < range.from ? clickedDay : range.from;
      const toDate = clickedDay < range.from ? range.from : clickedDay;
      const completeRange: DateRange = { from: fromDate, to: toDate };
      setRange(completeRange);

      const fromStr = getLocalDateString(fromDate);
      const toStr = getLocalDateString(toDate);
      onApply(fromStr, toStr);
      setIsOpen(false);
    } else {
      // 1st click (or new selection after a complete interval)
      setRange({ from: clickedDay, to: undefined });
    }
  };

  // Presets definition based on context
  const presets = useMemo(() => {
    const contextToDate = parseIsoDate(initialTo);
    const toYear = contextToDate.getFullYear();
    const toMonth = contextToDate.getMonth();

    // 1. Este mês
    const startOfCurrentMonth = new Date(toYear, toMonth, 1);
    const endOfCurrentMonth = new Date(toYear, toMonth + 1, 0);
    const thisMonthTo =
      contextToDate < endOfCurrentMonth ? contextToDate : endOfCurrentMonth;

    // 2. Últimos 30 dias
    const last30From = new Date(contextToDate.getTime() - 29 * 86400000);

    // 3. Últimos 90 dias
    const last90From = new Date(contextToDate.getTime() - 89 * 86400000);

    // 4. YTD: de 01/01 até a data final do contexto
    const startOfYear = new Date(toYear, 0, 1);

    return [
      {
        label: "Este mês",
        from: getLocalDateString(startOfCurrentMonth),
        to: getLocalDateString(thisMonthTo),
      },
      {
        label: "Últimos 30 dias",
        from: getLocalDateString(last30From),
        to: getLocalDateString(contextToDate),
      },
      {
        label: "Últimos 90 dias",
        from: getLocalDateString(last90From),
        to: getLocalDateString(contextToDate),
      },
      {
        label: "YTD",
        from: getLocalDateString(startOfYear),
        to: getLocalDateString(contextToDate),
      },
    ];
  }, [initialTo]);

  const handleApplyPreset = (from: string, to: string) => {
    setRange({
      from: parseIsoDate(from),
      to: parseIsoDate(to),
    });
    setMonth(getTargetViewMonth(to, numberOfMonths));
    setIsOpen(false);
    onApply(from, to);
  };

  return (
    <div className="tp-period-picker-container" ref={containerRef}>
      <button
        type="button"
        className={`tp-period-trigger ${isOpen ? "is-open" : ""}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label="Selecionar período"
        disabled={isLoading}
      >
        <Calendar size={15} className="tp-period-trigger-icon" />
        <span className="tp-period-trigger-text">
          {formatDisplayDate(initialFrom)} — {formatDisplayDate(initialTo)}
        </span>
        <ChevronDown
          size={14}
          className={`tp-period-chevron ${isOpen ? "is-rotated" : ""}`}
        />
      </button>

      {isOpen && (
        <div
          className="tp-period-popover"
          role="dialog"
          aria-label="Seletor de período"
        >
          <div className="tp-period-presets">
            <span className="tp-presets-title">ATALHOS</span>
            <div className="tp-presets-list">
              {presets.map((p) => {
                const isActive = initialFrom === p.from && initialTo === p.to;
                return (
                  <button
                    key={p.label}
                    type="button"
                    className={`tp-preset-btn ${isActive ? "is-active" : ""}`}
                    onClick={() => handleApplyPreset(p.from, p.to)}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="tp-period-calendar-wrap">
            <DayPicker
              mode="range"
              locale={ptBR}
              selected={range}
              onDayClick={handleDayClick}
              month={month}
              onMonthChange={setMonth}
              numberOfMonths={numberOfMonths}
            />
          </div>
        </div>
      )}
    </div>
  );
}
