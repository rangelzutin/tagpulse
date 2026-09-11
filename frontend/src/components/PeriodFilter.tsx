import { useState, useRef, useEffect, useMemo } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { ptBR } from "date-fns/locale";
import { Calendar, ChevronDown } from "lucide-react";
import {
  formatDisplayDate,
  parseIsoDate,
  getLocalDateString,
  maskDateInput,
  parseDisplayDate,
  validateManualPeriodInput,
} from "../utils/formatters";
import "react-day-picker/style.css";

export type PeriodMode = "range" | "allUpTo";

interface PeriodFilterProps {
  initialFrom: string;
  initialTo: string;
  periodMode: PeriodMode;
  minDate?: string | null;
  isLoading?: boolean;
  onApply: (from: string, to: string, mode: PeriodMode) => void;
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
  periodMode,
  minDate,
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

  // Manual input drafts
  const [draftFrom, setDraftFrom] = useState(() =>
    formatDisplayDate(initialFrom),
  );
  const [draftTo, setDraftTo] = useState(() => formatDisplayDate(initialTo));
  const [inputError, setInputError] = useState<string | null>(null);

  // Active mode inside popover during interaction
  const [activeMode, setActiveMode] = useState<PeriodMode>(periodMode);

  // Track last applied values to avoid duplicate onApply on Enter + blur
  const lastAppliedRef = useRef<{ from: string; to: string; mode: PeriodMode }>({
    from: initialFrom,
    to: initialTo,
    mode: periodMode,
  });

  useEffect(() => {
    lastAppliedRef.current = {
      from: initialFrom,
      to: initialTo,
      mode: periodMode,
    };
  }, [initialFrom, initialTo, periodMode]);

  // Sync state when popover opens or props change
  useEffect(() => {
    if (!isOpen) {
      setRange({
        from: parseIsoDate(initialFrom),
        to: parseIsoDate(initialTo),
      });
      setMonth(getTargetViewMonth(initialTo, numberOfMonths));
      setDraftFrom(formatDisplayDate(initialFrom));
      setDraftTo(formatDisplayDate(initialTo));
      setInputError(null);
      setActiveMode(periodMode);
    }
  }, [isOpen, initialFrom, initialTo, numberOfMonths, periodMode]);

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

  // Apply manual input on Enter or blur
  const tryApplyManual = () => {
    const res = validateManualPeriodInput(
      draftFrom,
      draftTo,
      activeMode,
      minDate,
    );

    if (res.error) {
      setInputError(res.error);
      return;
    }

    if (!res.canApply || !res.fromIso || !res.toIso) {
      return;
    }

    const isSameAsApplied =
      res.fromIso === lastAppliedRef.current.from &&
      res.toIso === lastAppliedRef.current.to &&
      activeMode === lastAppliedRef.current.mode;

    if (isSameAsApplied) {
      setIsOpen(false);
      return;
    }

    lastAppliedRef.current = {
      from: res.fromIso,
      to: res.toIso,
      mode: activeMode,
    };

    setInputError(null);
    setRange({
      from: parseIsoDate(res.fromIso),
      to: parseIsoDate(res.toIso),
    });
    setMonth(getTargetViewMonth(res.toIso, numberOfMonths));
    setIsOpen(false);
    onApply(res.fromIso, res.toIso, activeMode);
  };

  const handleFromChange = (raw: string) => {
    const masked = maskDateInput(raw);
    setDraftFrom(masked);
    setInputError(null);
    setActiveMode("range");

    if (masked.length === 10) {
      const pFrom = parseDisplayDate(masked);
      if (pFrom.isValid && pFrom.date) {
        setRange((prev) => ({
          from: pFrom.date!,
          to: prev?.to,
        }));
      }
    }
  };

  const handleToChange = (raw: string) => {
    const masked = maskDateInput(raw);
    setDraftTo(masked);
    setInputError(null);

    if (masked.length === 10) {
      const pTo = parseDisplayDate(masked);
      if (pTo.isValid && pTo.date) {
        setRange((prev) => ({
          from: activeMode === "allUpTo" && minDate ? parseIsoDate(minDate) : prev?.from,
          to: pTo.date!,
        }));
        setMonth(getTargetViewMonth(pTo.isoDate!, numberOfMonths));
      }
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      tryApplyManual();
    }
  };

  const handleDayClick = (clickedDay: Date) => {
    setInputError(null);

    if (activeMode === "allUpTo" && minDate) {
      // In "Tudo até" mode, clicking a day chooses the end date
      const toStr = getLocalDateString(clickedDay);
      if (minDate > toStr) {
        setInputError(
          "A data final deve ser posterior ou igual ao início da base.",
        );
        return;
      }
      setDraftTo(formatDisplayDate(toStr));
      setRange({ from: parseIsoDate(minDate), to: clickedDay });
      lastAppliedRef.current = { from: minDate, to: toStr, mode: "allUpTo" };
      onApply(minDate, toStr, "allUpTo");
      setIsOpen(false);
      return;
    }

    // Range mode
    setActiveMode("range");
    if (range?.from && !range?.to) {
      // 2nd click: complete interval
      const fromDate = clickedDay < range.from ? clickedDay : range.from;
      const toDate = clickedDay < range.from ? range.from : clickedDay;
      const completeRange: DateRange = { from: fromDate, to: toDate };
      setRange(completeRange);

      const fromStr = getLocalDateString(fromDate);
      const toStr = getLocalDateString(toDate);

      setDraftFrom(formatDisplayDate(fromStr));
      setDraftTo(formatDisplayDate(toStr));

      lastAppliedRef.current = { from: fromStr, to: toStr, mode: "range" };
      onApply(fromStr, toStr, "range");
      setIsOpen(false);
    } else {
      // 1st click
      setRange({ from: clickedDay, to: undefined });
      setDraftFrom(formatDisplayDate(getLocalDateString(clickedDay)));
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

    const list: Array<{
      label: string;
      from: string;
      to: string;
      mode: PeriodMode;
    }> = [
      {
        label: "Este mês",
        from: getLocalDateString(startOfCurrentMonth),
        to: getLocalDateString(thisMonthTo),
        mode: "range",
      },
      {
        label: "Últimos 30 dias",
        from: getLocalDateString(last30From),
        to: getLocalDateString(contextToDate),
        mode: "range",
      },
      {
        label: "Últimos 90 dias",
        from: getLocalDateString(last90From),
        to: getLocalDateString(contextToDate),
        mode: "range",
      },
      {
        label: "YTD",
        from: getLocalDateString(startOfYear),
        to: getLocalDateString(contextToDate),
        mode: "range",
      },
    ];

    if (minDate) {
      list.push({
        label: "Tudo até",
        from: minDate,
        to: getLocalDateString(contextToDate),
        mode: "allUpTo",
      });
    }

    return list;
  }, [initialTo, minDate]);

  const handleApplyPreset = (
    from: string,
    to: string,
    mode: PeriodMode,
  ) => {
    setInputError(null);
    setActiveMode(mode);
    setRange({
      from: parseIsoDate(from),
      to: parseIsoDate(to),
    });
    setDraftFrom(formatDisplayDate(from));
    setDraftTo(formatDisplayDate(to));
    setMonth(getTargetViewMonth(to, numberOfMonths));
    setIsOpen(false);
    lastAppliedRef.current = { from, to, mode };
    onApply(from, to, mode);
  };

  const triggerLabel =
    periodMode === "allUpTo"
      ? `Tudo até ${formatDisplayDate(initialTo)}`
      : `${formatDisplayDate(initialFrom)} — ${formatDisplayDate(initialTo)}`;

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
        <span className="tp-period-trigger-text">{triggerLabel}</span>
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
                const isActive =
                  periodMode === p.mode &&
                  initialFrom === p.from &&
                  initialTo === p.to;
                return (
                  <button
                    key={p.label}
                    type="button"
                    className={`tp-preset-btn ${isActive ? "is-active" : ""}`}
                    onClick={() => handleApplyPreset(p.from, p.to, p.mode)}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="tp-period-calendar-wrap">
            <div className="tp-period-inputs-bar">
              <div className="tp-period-input-group">
                <label htmlFor="tp-input-from" className="tp-period-input-label">
                  {activeMode === "allUpTo"
                    ? "Desde o início da base"
                    : "De"}
                </label>
                <input
                  id="tp-input-from"
                  type="text"
                  className="tp-period-input"
                  placeholder="DD/MM/AAAA"
                  value={
                    activeMode === "allUpTo" && minDate
                      ? formatDisplayDate(minDate)
                      : draftFrom
                  }
                  disabled={activeMode === "allUpTo"}
                  onChange={(e) => handleFromChange(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  onBlur={tryApplyManual}
                />
              </div>

              <div className="tp-period-input-separator">—</div>

              <div className="tp-period-input-group">
                <label htmlFor="tp-input-to" className="tp-period-input-label">
                  Até
                </label>
                <input
                  id="tp-input-to"
                  type="text"
                  className="tp-period-input"
                  placeholder="DD/MM/AAAA"
                  value={draftTo}
                  onChange={(e) => handleToChange(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  onBlur={tryApplyManual}
                />
              </div>
            </div>

            {inputError && (
              <div className="tp-period-input-error" role="alert">
                {inputError}
              </div>
            )}

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
