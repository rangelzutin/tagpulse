import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchFinancialDreSummary,
  fetchFinancialDreMonthly,
  fetchFinancialDreBreakdown,
  DRE_DISCLAIMER,
  type DreSummaryDto,
  type DreMonthlyItemDto,
  type DreBreakdownDto,
} from "./financial";

describe("Financial DRE API Client Tests (Phase 5D)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetchFinancialDreSummary calls /financial/dre/summary with query params and returns typed data", async () => {
    const mockSummary: Partial<DreSummaryDto> = {
      period: { from: "2026-01-01", to: "2026-10-13" },
      totals: {
        realizedRevenue: 322465.68,
        estimatedCOGS: 197277.62,
        estimatedGrossProfit: 125188.06,
        estimatedGrossMarginPercent: 38.82,
        variableExpenses: {
          paymentFees: 3213.5,
          taxesOnRevenue: 15164.05,
          freightLogistics: 13906.98,
          salesCommissions: 0,
          other: 0,
          total: 32284.53,
        },
        contributionMargin: 92903.53,
        contributionMarginPercent: 28.81,
        operatingExpenses: {
          personnel: 4279.44,
          partnerCompensation: 66000.0,
          marketing: 18669.05,
          occupancy: 4715.55,
          utilities: 1166.32,
          software: 2448.88,
          accounting: 6293.76,
          infrastructure: 1705.17,
          administrative: 2425.78,
          other: 130.0,
          total: 107833.95,
        },
        financialResult: {
          financialIncome: 60.37,
          financialExpenses: 1506.69,
          total: -1446.32,
        },
        otherResult: {
          otherIncome: 0,
          otherExpenses: 0,
          total: 0,
        },
        netManagerialResult: -16376.74,
        netManagerialMarginPercent: -5.08,
        status: "LOSS",
      },
      lastClosedMonth: "2026-08",
      dataQuality: {
        isProvisional: true,
        financiallyClosed: false,
        pendingAccruals: ["VARIABLE_TAX_ON_REVENUE", "OPERATING_PERSONNEL"],
        dreClassificationCoveragePercent: 100,
        unknownAmount: 0,
      },
      disclaimer: DRE_DISCLAIMER,
    };

    let calledUrl = "";
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      calledUrl = url;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockSummary),
      } as Response);
    });

    const res = await fetchFinancialDreSummary({ from: "2026-01-01", to: "2026-10-13" });

    expect(calledUrl).toContain("/financial/dre/summary?from=2026-01-01&to=2026-10-13");
    expect(res.totals.realizedRevenue).toBe(322465.68);
    expect(res.totals.netManagerialResult).toBe(-16376.74);
    expect(res.dataQuality.isProvisional).toBe(true);
  });

  it("fetchFinancialDreMonthly calls /financial/dre/monthly with year param", async () => {
    let calledUrl = "";
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      calledUrl = url;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);
    });

    await fetchFinancialDreMonthly({ year: "2026" });
    expect(calledUrl).toContain("/financial/dre/monthly?year=2026");
  });

  it("fetchFinancialDreBreakdown calls /financial/dre/breakdown with from/to params", async () => {
    let calledUrl = "";
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      calledUrl = url;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ period: { from: "2026-01-01", to: "2026-10-13" }, categories: [] }),
      } as Response);
    });

    await fetchFinancialDreBreakdown({ from: "2026-01-01", to: "2026-10-13" });
    expect(calledUrl).toContain("/financial/dre/breakdown?from=2026-01-01&to=2026-10-13");
  });

  it("throws descriptive error when server returns an error response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ message: "Ano inválido fornecido." }),
    } as Response);

    await expect(fetchFinancialDreMonthly({ year: "invalid" })).rejects.toThrow("Ano inválido fornecido.");
  });
});
