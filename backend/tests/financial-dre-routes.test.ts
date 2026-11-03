import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { FinancialDreService } from "../src/modules/financial/financial-dre-service.js";

function createMockFinancialDreService(): FinancialDreService {
  return {
    async getDreSummary() {
      return {
        success: true,
        data: {
          period: { from: "2026-01-01", to: "2026-10-13" },
          totals: {
            realizedRevenue: 150000.0,
            estimatedCOGS: 60000.0,
            estimatedGrossProfit: 90000.0,
            estimatedGrossMarginPercent: 60.0,
            variableExpenses: {
              paymentFees: 5000.0,
              taxesOnRevenue: 10000.0,
              freightLogistics: 2000.0,
              salesCommissions: 1000.0,
              other: 500.0,
              total: 18500.0,
            },
            contributionMargin: 71500.0,
            contributionMarginPercent: 47.67,
            operatingExpenses: {
              personnel: 20000.0,
              partnerCompensation: 10000.0,
              marketing: 5000.0,
              occupancy: 4000.0,
              utilities: 1500.0,
              software: 2000.0,
              accounting: 1000.0,
              infrastructure: 500.0,
              administrative: 1000.0,
              other: 500.0,
              total: 45500.0,
            },
            operatingResult: 26000.0,
            operatingMarginPercent: 17.33,
            financialResult: {
              financialIncome: 500.0,
              financialExpenses: 1500.0,
              total: -1000.0,
            },
            otherResult: { otherIncome: 0, otherExpenses: 0, total: 0 },
            netManagerialResult: 25000.0,
            netManagerialMarginPercent: 16.67,
            status: "PROFIT",
          },
          lastClosedMonth: "2026-09",
          months: [
            {
              month: "2026-09",
              realizedRevenue: 50000.0,
              estimatedCOGS: 20000.0,
              estimatedGrossProfit: 30000.0,
              variableExpenses: {
                paymentFees: 1500.0,
                taxesOnRevenue: 3000.0,
                freightLogistics: 500.0,
                salesCommissions: 300.0,
                other: 200.0,
                total: 5500.0,
              },
              contributionMargin: 24500.0,
              operatingExpenses: {
                personnel: 7000.0,
                partnerCompensation: 3500.0,
                marketing: 1500.0,
                occupancy: 1300.0,
                utilities: 500.0,
                software: 700.0,
                accounting: 350.0,
                infrastructure: 150.0,
                administrative: 350.0,
                other: 150.0,
                total: 15500.0,
              },
              operatingResult: 9000.0,
              financialResult: { financialIncome: 100.0, financialExpenses: 400.0, total: -300.0 },
              netManagerialResult: 8700.0,
              status: "PROFIT",
              dataQuality: {
                isProvisional: false,
                financiallyClosed: true,
                pendingAccruals: [],
              },
            },
          ],
          dataQuality: {
            dreClassificationCoveragePercent: 98.5,
            unknownAmount: 500.0,
            provisionalMonthNote: null,
          },
          disclaimer:
            "O DRE Gerencial do TagPulse reflete a competência econômica aproximada da operação.",
        },
      };
    },
    async getDreMonthly() {
      const months = [];
      for (let i = 1; i <= 10; i++) {
        const mStr = String(i).padStart(2, "0");
        months.push({
          month: `2026-${mStr}`,
          realizedRevenue: 40000.0,
          estimatedCOGS: 16000.0,
          estimatedGrossProfit: 24000.0,
          grossMarginPercent: 60.0,
          variableExpenses: {
            paymentFees: 1200.0,
            taxesOnRevenue: 2400.0,
            freightLogistics: 400.0,
            salesCommissions: 200.0,
            other: 100.0,
            total: 4300.0,
          },
          contributionMargin: 19700.0,
          contributionMarginPercent: 49.25,
          operatingExpenses: {
            personnel: 5000.0,
            partnerCompensation: 2500.0,
            marketing: 1000.0,
            occupancy: 1000.0,
            utilities: 400.0,
            software: 500.0,
            accounting: 250.0,
            infrastructure: 100.0,
            administrative: 250.0,
            other: 100.0,
            total: 11100.0,
          },
          operatingResult: 8600.0,
          operatingMarginPercent: 21.5,
          financialResult: { financialIncome: 50.0, financialExpenses: 300.0, total: -250.0 },
          otherResult: { otherIncome: 0, otherExpenses: 0, total: 0 },
          netManagerialResult: 8350.0,
          netManagerialMarginPercent: 20.88,
          status: "PROFIT" as const,
          dataQuality: {
            isProvisional: i === 10,
            financiallyClosed: i < 10,
            pendingAccruals: [],
          },
        });
      }
      return {
        success: true,
        data: months,
      };
    },
    async getDreBreakdown() {
      return {
        success: true,
        data: {
          period: { from: "2026-01-01", to: "2026-10-13" },
          realizedRevenue: 150000.0,
          categories: [
            {
              economicCategory: "VARIABLE_PAYMENT_FEE",
              label: "Taxas de Pagamento",
              group: "VARIABLE_EXPENSE",
              amount: 5000.0,
              shareOfRevenue: 3.33,
            },
            {
              economicCategory: "OPERATING_PERSONNEL",
              label: "Pessoal",
              group: "OPERATING_EXPENSE",
              amount: 20000.0,
              shareOfRevenue: 13.33,
            },
          ],
        },
      };
    },
  };
}

describe("Financial DRE HTTP Routes", () => {
  it("serves /financial/dre/summary, monthly, and breakdown with status 200", async () => {
    const mockService = createMockFinancialDreService();
    const app = await buildApp({
      databaseHealth: { check: async () => {} },
      frontendUrl: "http://localhost:5173",
      logger: false,
      financialDreService: mockService,
    });

    // 1. GET /financial/dre/summary
    const summaryResponse = await app.inject({
      method: "GET",
      url: "/financial/dre/summary?from=2026-01-01&to=2026-10-13",
    });
    expect(summaryResponse.statusCode).toBe(200);
    const summaryData = JSON.parse(summaryResponse.body);
    expect(summaryData.totals).toBeDefined();
    expect(summaryData.totals.realizedRevenue).toBeGreaterThan(0);
    expect(summaryData.disclaimer).toContain("O DRE Gerencial do TagPulse");

    // 2. GET /financial/dre/monthly
    const monthlyResponse = await app.inject({
      method: "GET",
      url: "/financial/dre/monthly?year=2026",
    });
    expect(monthlyResponse.statusCode).toBe(200);
    const monthlyData = JSON.parse(monthlyResponse.body);
    expect(Array.isArray(monthlyData)).toBe(true);
    expect(monthlyData.length).toBeGreaterThanOrEqual(10);

    // 3. GET /financial/dre/breakdown
    const breakdownResponse = await app.inject({
      method: "GET",
      url: "/financial/dre/breakdown?from=2026-01-01&to=2026-10-13",
    });
    expect(breakdownResponse.statusCode).toBe(200);
    const breakdownData = JSON.parse(breakdownResponse.body);
    expect(breakdownData.categories).toBeDefined();
    expect(Array.isArray(breakdownData.categories)).toBe(true);

    await app.close();
  });
});
