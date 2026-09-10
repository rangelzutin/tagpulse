import { describe, it, expect } from "vitest";
import {
  getLocalDateString,
  getDefaultPeriod,
  formatCurrency,
  formatNumber,
  formatMonthLabel,
  formatFullMonthName,
  formatPercent,
  formatCompactCurrency,
  parseIsoDate,
  formatDisplayDate,
} from "./formatters";

describe("formatters utils", () => {
  it("parseIsoDate parses YYYY-MM-DD into a local Date without timezone offset", () => {
    const d = parseIsoDate("2026-09-08");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8); // September is 8
    expect(d.getDate()).toBe(8);
  });

  it("formatDisplayDate formats YYYY-MM-DD into DD/MM/YYYY", () => {
    expect(formatDisplayDate("2026-01-01")).toBe("01/01/2026");
    expect(formatDisplayDate("2026-09-08")).toBe("08/09/2026");
    expect(formatDisplayDate("")).toBe("");
  });

  it("getLocalDateString formats dates using local year, month, and day without ISO slicing", () => {
    const testDate = new Date(2026, 8, 9); // September 9, 2026 local
    expect(getLocalDateString(testDate)).toBe("2026-09-09");
  });

  it("getDefaultPeriod returns from as Jan 1st of current year and to as current local date", () => {
    const period = getDefaultPeriod();
    const currentYear = new Date().getFullYear().toString();
    expect(period.from).toBe(`${currentYear}-01-01`);
    expect(period.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("formatCurrency formats Brazilian Real properly", () => {
    const formatted = formatCurrency(1260.5);
    // Should contain R$ and 1.260,50
    expect(formatted).toContain("R$");
    expect(formatted).toContain("1.260,50");
  });

  it("formatNumber formats Brazilian numbers with thousand separators", () => {
    expect(formatNumber(12500)).toBe("12.500");
  });

  it("formatMonthLabel formats YYYY-MM to short month/year", () => {
    expect(formatMonthLabel("2026-01")).toBe("Jan/26");
    expect(formatMonthLabel("2026-08")).toBe("Ago/26");
    expect(formatMonthLabel("invalid")).toBe("invalid");
  });

  it("formatFullMonthName formats YYYY-MM to full month name", () => {
    expect(formatFullMonthName("2026-01")).toBe("Janeiro de 2026");
    expect(formatFullMonthName("2026-09")).toBe("Setembro de 2026");
  });

  it("formatPercent formats decimal percentages in pt-BR format", () => {
    expect(formatPercent(24.52)).toBe("24,5%");
    expect(formatPercent(0)).toBe("0,0%");
    expect(formatPercent(100)).toBe("100,0%");
    expect(formatPercent(12.345, 2)).toBe("12,35%");
  });

  it("formatCompactCurrency formats large numbers compactly", () => {
    expect(formatCompactCurrency(0)).toBe("R$ 0");
    expect(formatCompactCurrency(1500)).toBe("R$ 2k");
    expect(formatCompactCurrency(250000)).toBe("R$ 250k");
    expect(formatCompactCurrency(1200000)).toBe("R$ 1,2M");
  });
});
