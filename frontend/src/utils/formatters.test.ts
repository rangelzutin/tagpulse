import { describe, it, expect } from "vitest";
import {
  getLocalDateString,
  getDefaultPeriod,
  formatCurrency,
  formatNumber,
  formatMonthLabel,
  formatFullMonthName,
} from "./formatters";

describe("formatters utils", () => {
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
});
