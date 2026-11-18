import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MonthlyChart } from "./MonthlyChart";
import type { SalesOverviewMonthly } from "../api/bi";

vi.mock("recharts", async () => {
  const original = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div className="recharts-responsive-container">{children}</div>
    ),
    AreaChart: ({ children }: { children: React.ReactNode }) => (
      <div className="recharts-mock-chart">{children}</div>
    ),
    ReferenceLine: (props: { label?: { value?: string } }) => (
      <div data-testid="reference-line">{props.label?.value}</div>
    ),
  };
});

describe("MonthlyChart — Consolidated Revenue Trend & Historical Marker", () => {
  const mockMonthly: SalesOverviewMonthly[] = [
    {
      month: "2026-05",
      revenue: 35000,
      sales: 45,
      avgTicket: 777.78,
      customers: 40,
    },
    {
      month: "2026-06",
      revenue: 38000,
      sales: 50,
      avgTicket: 760,
      customers: 42,
    },
    {
      month: "2026-07",
      revenue: 42000,
      sales: 55,
      avgTicket: 763.64,
      customers: 46,
    },
    {
      month: "2026-08",
      revenue: 41000,
      sales: 52,
      avgTicket: 788.46,
      customers: 44,
    },
  ];

  it("renders ReferenceLine with 'Nineclouds + Hustler no mesmo sistema' when June 2026 is in range", () => {
    const html = renderToString(
      React.createElement(MonthlyChart, {
        monthly: mockMonthly,
        from: "2026-05-01",
        toDate: "2026-08-31",
      }),
    );

    expect(html).toContain("Nineclouds + Hustler no mesmo sistema");
    expect(html).not.toContain("Início da operação consolidada no TagPlus");
    expect(html).not.toContain("Entrada do varejo no TagPlus");
  });

  it("does not render the ReferenceLine when June 2026 is outside the selected interval (earlier)", () => {
    const html = renderToString(
      React.createElement(MonthlyChart, {
        monthly: [
          {
            month: "2026-01",
            revenue: 30000,
            sales: 35,
            avgTicket: 857.14,
            customers: 30,
          },
        ],
        from: "2026-01-01",
        toDate: "2026-03-31",
      }),
    );

    expect(html).not.toContain("Nineclouds + Hustler no mesmo sistema");
    expect(html).not.toContain("Início da operação consolidada no TagPlus");
    expect(html).not.toContain("Entrada do varejo no TagPlus");
  });

  it("does not render the ReferenceLine when June 2026 is outside the selected interval (later)", () => {
    const html = renderToString(
      React.createElement(MonthlyChart, {
        monthly: [
          {
            month: "2026-07",
            revenue: 40000,
            sales: 45,
            avgTicket: 888.89,
            customers: 35,
          },
        ],
        from: "2026-07-01",
        toDate: "2026-10-31",
      }),
    );

    expect(html).not.toContain("Nineclouds + Hustler no mesmo sistema");
  });
});
