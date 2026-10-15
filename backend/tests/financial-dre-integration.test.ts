import { describe, expect, it } from "vitest";
import { prisma } from "../src/database/prisma.js";
import { createBiRepository } from "../src/modules/bi/bi-repository.js";
import {
  createFinancialDreService,
  createPrismaFinancialDreRepository,
} from "../src/modules/financial/index.js";

describe("Financial DRE Integration Tests (Canonical Baseline 2026)", () => {
  const biRepo = createBiRepository(prisma);
  const dreRepo = createPrismaFinancialDreRepository(prisma, biRepo);
  const dreService = createFinancialDreService(dreRepo);

  it("calculates canonical summary matching the frozen contract for 2026", async () => {
    const res = await dreService.getDreSummary({
      from: "2026-01-01",
      to: "2026-10-13",
    });

    expect(res.success).toBe(true);
    const summary = res.data!;

    // 1. Receita e Lucro Bruto
    expect(summary.totals.realizedRevenue).toBe(322465.68);
    expect(summary.totals.estimatedCOGS).toBe(197277.62);
    expect(summary.totals.estimatedGrossProfit).toBe(125188.06);
    expect(summary.totals.estimatedGrossMarginPercent).toBe(38.82);

    // 2. Despesas Variáveis
    expect(summary.totals.variableExpenses.paymentFees).toBe(3213.5);
    expect(summary.totals.variableExpenses.freightLogistics).toBe(13906.98);

    // 3. Despesas Fixas / Operacionais
    expect(summary.totals.operatingExpenses.partnerCompensation).toBe(66000.0);

    // 4. Resultado Financeiro
    expect(summary.totals.financialResult.financialIncome).toBe(60.37);
    expect(summary.totals.financialResult.financialExpenses).toBe(1506.69);

    // 5. Invariantes
    // Invariant: Revenue - COGS = Gross Profit
    expect(
      Math.round(
        (summary.totals.realizedRevenue -
          summary.totals.estimatedCOGS -
          summary.totals.estimatedGrossProfit) *
          100,
      ),
    ).toBe(0);

    // Invariant: Gross Profit - Variable Expenses = Contribution Margin
    expect(
      Math.round(
        (summary.totals.estimatedGrossProfit -
          summary.totals.variableExpenses.total -
          summary.totals.contributionMargin) *
          100,
      ),
    ).toBe(0);

    // Invariant: CM - OpEx + FinRes = Net
    const expectedNet =
      summary.totals.contributionMargin -
      summary.totals.operatingExpenses.total +
      summary.totals.financialResult.total;
    expect(
      Math.round((expectedNet - summary.totals.netManagerialResult) * 100),
    ).toBe(0);

    // 6. Fechamento e Qualidade Temporal
    // lastClosedMonth naturalmente retorna 2026-08 (Agosto)
    expect(summary.lastClosedMonth).toBe("2026-08");

    // Setembro e Outubro são provisórios
    const sep = summary.months.find((m) => m.month === "2026-09")!;
    expect(sep.dataQuality.isProvisional).toBe(true);
    expect(sep.dataQuality.financiallyClosed).toBe(false);
    expect(sep.dataQuality.pendingAccruals).toContain("VARIABLE_TAX_ON_REVENUE");
    expect(sep.dataQuality.pendingAccruals).toContain("OPERATING_PERSONNEL");

    const oct = summary.months.find((m) => m.month === "2026-10")!;
    expect(oct.dataQuality.isProvisional).toBe(true);
    expect(oct.dataQuality.financiallyClosed).toBe(false);
  }, 30000);

  it("calculates monthly timeseries reconciling with summary totals with 0.00 discrepancy", async () => {
    const res = await dreService.getDreMonthly({ year: "2026" });
    expect(res.success).toBe(true);
    const months = res.data!;

    const summaryRes = await dreService.getDreSummary({
      from: "2026-01-01",
      to: "2026-12-31",
    });
    const summaryTotals = summaryRes.data!.totals;

    // Sum of all months matches full year summary totals with 0.00 discrepancy
    const sumRev = months.reduce((a, b) => a + b.realizedRevenue, 0);
    expect(Math.round(sumRev * 100) / 100).toBe(summaryTotals.realizedRevenue);

    const sumCogs = months.reduce((a, b) => a + b.estimatedCOGS, 0);
    expect(Math.round(sumCogs * 100) / 100).toBe(summaryTotals.estimatedCOGS);

    const sumNet = months.reduce((a, b) => a + b.netManagerialResult, 0);
    expect(Math.round(sumNet * 100) / 100).toBe(summaryTotals.netManagerialResult);
  }, 30000);

  it("calculates breakdown excluding inventory purchase from DRE expense categories", async () => {
    const res = await dreService.getDreBreakdown({
      from: "2026-01-01",
      to: "2026-10-13",
    });
    expect(res.success).toBe(true);
    const breakdown = res.data!;

    expect(breakdown.realizedRevenue).toBe(322465.68);

    const inv = breakdown.categories.find(
      (c) => c.economicCategory === "INVENTORY_PURCHASE",
    );
    if (inv) {
      expect(inv.group).toBe("NON_DRE");
    }

    const payFees = breakdown.categories.find(
      (c) => c.economicCategory === "VARIABLE_PAYMENT_FEE",
    );
    expect(payFees).toBeDefined();
    expect(payFees!.amount).toBe(3213.5);
  }, 30000);
});
