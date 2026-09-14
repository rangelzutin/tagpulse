import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { PeriodFilter } from "./PeriodFilter";
import { getPeriodPresets } from "../utils/formatters";

describe("PeriodFilter component & presets", () => {
  it("renders trigger with formatted display dates", () => {
    const html = renderToString(
      <PeriodFilter
        initialFrom="2026-09-01"
        initialTo="2026-09-14"
        periodMode="range"
        onApply={() => {}}
      />,
    );

    expect(html).toContain("01/09/2026 — 14/09/2026");
    expect(html).toContain("tp-period-trigger");
  });

  it("renders trigger with 'Tudo até' format when periodMode is allUpTo", () => {
    const html = renderToString(
      <PeriodFilter
        initialFrom="2024-01-01"
        initialTo="2026-09-14"
        periodMode="allUpTo"
        minDate="2024-01-01"
        onApply={() => {}}
      />,
    );

    expect(html).toContain("Tudo até 14/09/2026");
  });

  it("generates correct presets for 14/09/2026 including 'Mês anterior' and dynamic 'Este mês'", () => {
    const simulatedDate = new Date(2026, 8, 14); // 14/09/2026
    const presets = getPeriodPresets(simulatedDate, "2024-01-01");

    expect(presets.map((p) => p.label)).toEqual([
      "Este mês",
      "Mês anterior",
      "Últimos 30 dias",
      "Últimos 90 dias",
      "YTD",
      "Tudo até",
    ]);

    const esteMes = presets.find((p) => p.label === "Este mês")!;
    expect(esteMes.from).toBe("2026-09-01");
    expect(esteMes.to).toBe("2026-09-14");

    const mesAnterior = presets.find((p) => p.label === "Mês anterior")!;
    expect(mesAnterior.from).toBe("2026-08-01");
    expect(mesAnterior.to).toBe("2026-08-31");

    const ytd = presets.find((p) => p.label === "YTD")!;
    expect(ytd.from).toBe("2026-01-01");
    expect(ytd.to).toBe("2026-09-14");

    const u30 = presets.find((p) => p.label === "Últimos 30 dias")!;
    expect(u30.to).toBe("2026-09-14");

    const u90 = presets.find((p) => p.label === "Últimos 90 dias")!;
    expect(u90.to).toBe("2026-09-14");
  });
});
