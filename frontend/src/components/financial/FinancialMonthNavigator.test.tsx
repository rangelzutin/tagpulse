import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  FinancialMonthNavigator,
  buildMonthRange,
  getDaysInMonth,
  calculateEffectiveDueRange,
} from "./FinancialMonthNavigator";

describe("FinancialMonthNavigator & Month Range calculations (Tests C, D, E)", () => {
  it("C. computes correct days in months including leap years and non-leap years", () => {
    expect(getDaysInMonth(2026, 10)).toBe(31); // Outubro
    expect(getDaysInMonth(2026, 11)).toBe(30); // Novembro
    expect(getDaysInMonth(2026, 2)).toBe(28);  // Fev 2026
    expect(getDaysInMonth(2028, 2)).toBe(29);  // Fev 2028 (bissexto)
  });

  it("D. buildMonthRange builds exact dueFrom and dueTo for Outubro 2026", () => {
    const range = buildMonthRange(2026, 10);
    expect(range.year).toBe(2026);
    expect(range.month).toBe(10);
    expect(range.dueFrom).toBe("2026-10-01");
    expect(range.dueTo).toBe("2026-10-31");
  });

  it("E. correctly calculates year/month boundaries forward (Dez/2026 -> Jan/2027)", () => {
    let year = 2026;
    let month = 12;

    // Simulate next click
    let nextY = year;
    let nextM = month + 1;
    if (nextM > 12) {
      nextM = 1;
      nextY += 1;
    }

    const range = buildMonthRange(nextY, nextM);
    expect(range.year).toBe(2027);
    expect(range.month).toBe(1);
    expect(range.dueFrom).toBe("2027-01-01");
    expect(range.dueTo).toBe("2027-01-31");
  });

  it("E. correctly calculates year/month boundaries backward (Jan/2027 -> Dez/2026)", () => {
    let year = 2027;
    let month = 1;

    // Simulate prev click
    let prevY = year;
    let prevM = month - 1;
    if (prevM < 1) {
      prevM = 12;
      prevY -= 1;
    }

    const range = buildMonthRange(prevY, prevM);
    expect(range.year).toBe(2026);
    expect(range.month).toBe(12);
    expect(range.dueFrom).toBe("2026-12-01");
    expect(range.dueTo).toBe("2026-12-31");
  });

  it("renders with Todos selected by default when selectedMonth is null", () => {
    const html = renderToString(
      <FinancialMonthNavigator
        selectedMonth={null}
        onChange={vi.fn()}
        referenceDate="2026-10-02"
      />,
    );
    expect(html).toContain("tp-month-navigator");
    expect(html).toContain("Todos");
    expect(html).toContain("is-selected");
    expect(html).toContain("Outubro 2026");
  });

  it("renders with active month selected when selectedMonth is provided", () => {
    const activeRange = buildMonthRange(2026, 11);
    const html = renderToString(
      <FinancialMonthNavigator
        selectedMonth={activeRange}
        onChange={vi.fn()}
        referenceDate="2026-10-02"
      />,
    );
    expect(html).toContain("Novembro 2026");
    expect(html).toContain("is-active");
  });
});

describe("Canonical Semantics of 'Tudo até' & Month Navigation", () => {
  const selectedTo = "2026-10-02";

  it("1. Tudo até 02/10/2026 + Todos: sem dueFrom, dueTo=2026-10-02, referenceDate=2026-10-02", () => {
    const result = calculateEffectiveDueRange(null, "allUpTo", selectedTo);
    expect(result.dueFrom).toBeUndefined();
    expect(result.dueTo).toBe("2026-10-02");
  });

  it("2. Tudo até 02/10/2026 + Setembro: dueFrom=2026-09-01, dueTo=2026-09-30", () => {
    const setembro = buildMonthRange(2026, 9, selectedTo);
    const result = calculateEffectiveDueRange(setembro, "allUpTo", selectedTo);
    expect(result.dueFrom).toBe("2026-09-01");
    expect(result.dueTo).toBe("2026-09-30");
  });

  it("3. Tudo até 02/10/2026 + Outubro: dueFrom=2026-10-01, dueTo=2026-10-02 (capped by ceiling)", () => {
    const outubro = buildMonthRange(2026, 10, selectedTo);
    expect(outubro.dueFrom).toBe("2026-10-01");
    expect(outubro.dueTo).toBe("2026-10-02");

    const result = calculateEffectiveDueRange(outubro, "allUpTo", selectedTo);
    expect(result.dueFrom).toBe("2026-10-01");
    expect(result.dueTo).toBe("2026-10-02");
  });

  it("4. Does NOT allow navigating to November 2026 beyond the ceiling when mode=allUpTo", () => {
    // When current view is October 2026 and maxDate is 2026-10-02, next button must be disabled
    const outubro = buildMonthRange(2026, 10, selectedTo);
    const html = renderToString(
      <FinancialMonthNavigator
        selectedMonth={outubro}
        onChange={vi.fn()}
        referenceDate={selectedTo}
        maxDate={selectedTo}
      />,
    );

    // The next arrow must be disabled
    expect(html).toContain('disabled=""');
    expect(html).toContain("Navegação futura desabilitada pelo limite do período selecionado");
  });

  it("5. Other modes (range): maintains existing unconstrained semantics", () => {
    // Range + Todos: no dueFrom, no dueTo
    const rangeTodos = calculateEffectiveDueRange(null, "range", selectedTo);
    expect(rangeTodos.dueFrom).toBeUndefined();
    expect(rangeTodos.dueTo).toBeUndefined();

    // Range + Outubro: full month 2026-10-01 to 2026-10-31
    const rangeOutubro = buildMonthRange(2026, 10);
    const result = calculateEffectiveDueRange(rangeOutubro, "range", selectedTo);
    expect(result.dueFrom).toBe("2026-10-01");
    expect(result.dueTo).toBe("2026-10-31");
  });
});
