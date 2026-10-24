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

  it("calculates live summary preserving core financial invariants and business consistency", async () => {
    const res = await dreService.getDreSummary({
      from: "2026-01-01",
      to: "2026-10-13",
    });

    expect(res.success).toBe(true);
    const summary = res.data!;

    // 1. Sensibilidade e Não-Negatividade de Grandezas Base
    expect(summary.totals.realizedRevenue).toBeGreaterThan(0);
    expect(summary.totals.estimatedCOGS).toBeGreaterThan(0);
    expect(summary.totals.variableExpenses.total).toBeGreaterThan(0);
    expect(summary.totals.operatingExpenses.total).toBeGreaterThan(0);

    // 2. Invariante: Revenue - COGS = Gross Profit
    const expectedGrossProfit =
      Math.round(
        (summary.totals.realizedRevenue - summary.totals.estimatedCOGS) * 100,
      ) / 100;
    expect(summary.totals.estimatedGrossProfit).toBe(expectedGrossProfit);

    const expectedGrossMargin =
      Math.round(
        ((summary.totals.estimatedGrossProfit /
          summary.totals.realizedRevenue) *
          100) *
          100,
      ) / 100;
    expect(summary.totals.estimatedGrossMarginPercent).toBe(expectedGrossMargin);

    // 3. Invariante: Composição de Despesas Variáveis
    const sumVariableExpenses =
      Math.round(
        (summary.totals.variableExpenses.paymentFees +
          summary.totals.variableExpenses.taxesOnRevenue +
          summary.totals.variableExpenses.freightLogistics +
          summary.totals.variableExpenses.salesCommissions +
          summary.totals.variableExpenses.other) *
          100,
      ) / 100;
    expect(summary.totals.variableExpenses.total).toBe(sumVariableExpenses);

    // 4. Invariante: Gross Profit - Variable Expenses = Contribution Margin
    const expectedCM =
      Math.round(
        (summary.totals.estimatedGrossProfit -
          summary.totals.variableExpenses.total) *
          100,
      ) / 100;
    expect(summary.totals.contributionMargin).toBe(expectedCM);

    const expectedCMPercent =
      Math.round(
        ((summary.totals.contributionMargin / summary.totals.realizedRevenue) *
          100) *
          100,
      ) / 100;
    expect(summary.totals.contributionMarginPercent).toBe(expectedCMPercent);

    // 5. Invariante: Composição de Despesas Fixas / Operacionais
    const sumOpExpenses =
      Math.round(
        (summary.totals.operatingExpenses.personnel +
          summary.totals.operatingExpenses.partnerCompensation +
          summary.totals.operatingExpenses.marketing +
          summary.totals.operatingExpenses.occupancy +
          summary.totals.operatingExpenses.utilities +
          summary.totals.operatingExpenses.software +
          summary.totals.operatingExpenses.accounting +
          summary.totals.operatingExpenses.infrastructure +
          summary.totals.operatingExpenses.administrative +
          summary.totals.operatingExpenses.other) *
          100,
      ) / 100;
    expect(summary.totals.operatingExpenses.total).toBe(sumOpExpenses);

    // 6. Invariante: Resultado Financeiro e Outros
    const expectedFinResult =
      Math.round(
        (summary.totals.financialResult.financialIncome -
          summary.totals.financialResult.financialExpenses) *
          100,
      ) / 100;
    expect(summary.totals.financialResult.total).toBe(expectedFinResult);
    expect(summary.totals.otherResult.total).toBe(0.0);

    // 7. Invariante: CM - OpEx + FinRes + OtherRes = Net Managerial Result
    const expectedNet =
      Math.round(
        (summary.totals.contributionMargin -
          summary.totals.operatingExpenses.total +
          summary.totals.financialResult.total +
          summary.totals.otherResult.total) *
          100,
      ) / 100;
    expect(summary.totals.netManagerialResult).toBe(expectedNet);

    const expectedNetMargin =
      Math.round(
        ((summary.totals.netManagerialResult / summary.totals.realizedRevenue) *
          100) *
          100,
      ) / 100;
    expect(summary.totals.netManagerialMarginPercent).toBe(expectedNetMargin);

    // 8. Invariante: Status coerente com sinal do resultado
    const expectedStatus =
      summary.totals.netManagerialResult > 0
        ? "PROFIT"
        : summary.totals.netManagerialResult < 0
          ? "LOSS"
          : "BREAK_EVEN";
    expect(summary.totals.status).toBe(expectedStatus);

    // 9. Invariantes de Fechamento e Qualidade Temporal (sem congelar snapshot de meses vivos)
    if (summary.lastClosedMonth !== null) {
      expect(summary.lastClosedMonth).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    }

    expect(Array.isArray(summary.months)).toBe(true);
    expect(summary.months.length).toBeGreaterThan(0);

    for (const m of summary.months) {
      expect(m.month).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
      expect(typeof m.dataQuality.isProvisional).toBe("boolean");
      expect(typeof m.dataQuality.financiallyClosed).toBe("boolean");
      expect(Array.isArray(m.dataQuality.pendingAccruals)).toBe(true);

      // Invariante: não pode ser simultaneamente provisório e fechado
      expect(m.dataQuality.isProvisional && m.dataQuality.financiallyClosed).toBe(false);

      // Invariante de coerência com fechamento: meses fechados não carregam pendências materiais
      if (m.dataQuality.financiallyClosed) {
        expect(m.dataQuality.isProvisional).toBe(false);
        expect(m.dataQuality.pendingAccruals).toHaveLength(0);
        if (summary.lastClosedMonth !== null) {
          expect(m.month <= summary.lastClosedMonth).toBe(true);
        }
      }

      // Meses posteriores ao lastClosedMonth nunca podem estar fechados
      if (summary.lastClosedMonth !== null && m.month > summary.lastClosedMonth) {
        expect(m.dataQuality.financiallyClosed).toBe(false);
      }
    }

    // 10. Classification Coverage e Unknown
    expect(summary.dataQuality.dreClassificationCoveragePercent).toBeGreaterThanOrEqual(95);
    expect(summary.dataQuality.unknownAmount).toBeGreaterThanOrEqual(0);
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

  it("calculates breakdown excluding inventory purchase from DRE expense categories and reconciles with summary", async () => {
    const res = await dreService.getDreBreakdown({
      from: "2026-01-01",
      to: "2026-10-13",
    });
    expect(res.success).toBe(true);
    const breakdown = res.data!;

    // Reconcile breakdown categories sum with summary lines
    const summaryRes = await dreService.getDreSummary({
      from: "2026-01-01",
      to: "2026-10-13",
    });
    expect(summaryRes.success).toBe(true);
    const summaryTotals = summaryRes.data!.totals;

    expect(breakdown.realizedRevenue).toBe(summaryTotals.realizedRevenue);

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
    expect(payFees!.amount).toBe(summaryTotals.variableExpenses.paymentFees);

    const opTotal = breakdown.categories
      .filter((c) => c.group === "OPERATING_EXPENSE")
      .reduce((acc, c) => acc + c.amount, 0);
    expect(Math.round(opTotal * 100) / 100).toBe(summaryTotals.operatingExpenses.total);

    const varTotal = breakdown.categories
      .filter((c) => c.group === "VARIABLE_EXPENSE")
      .reduce((acc, c) => acc + c.amount, 0);
    expect(Math.round(varTotal * 100) / 100).toBe(summaryTotals.variableExpenses.total);

    const finExpCat = breakdown.categories.find((c) => c.economicCategory === "FINANCIAL_EXPENSE");
    expect(finExpCat?.amount).toBe(summaryTotals.financialResult.financialExpenses);

    const finIncCat = breakdown.categories.find((c) => c.economicCategory === "FINANCIAL_INCOME");
    expect(finIncCat?.amount).toBe(summaryTotals.financialResult.financialIncome);
  }, 30000);

  it("reconciles summary(2026-09-01, 2026-09-30) exactly with monthly['2026-09']", async () => {
    const [summaryRes, monthlyRes] = await Promise.all([
      dreService.getDreSummary({ from: "2026-09-01", to: "2026-09-30" }),
      dreService.getDreMonthly({ year: "2026" }),
    ]);

    expect(summaryRes.success).toBe(true);
    expect(monthlyRes.success).toBe(true);

    const s = summaryRes.data!.totals;
    const m = monthlyRes.data!.find((item) => item.month === "2026-09");
    expect(m).toBeDefined();

    expect(s.realizedRevenue).toBe(m!.realizedRevenue);
    expect(s.estimatedCOGS).toBe(m!.estimatedCOGS);
    expect(s.estimatedGrossProfit).toBe(m!.estimatedGrossProfit);
    expect(s.variableExpenses.total).toBe(m!.variableExpenses.total);
    expect(s.contributionMargin).toBe(m!.contributionMargin);
    expect(s.operatingExpenses.total).toBe(m!.operatingExpenses.total);
    expect(s.financialResult.total).toBe(m!.financialResult.total);
    expect(s.netManagerialResult).toBe(m!.netManagerialResult);
    expect(s.status).toBe(m!.status);
  }, 30000);

  it("reconciles summary(2026-08-01, 2026-08-31) exactly with monthly['2026-08']", async () => {
    const [summaryRes, monthlyRes] = await Promise.all([
      dreService.getDreSummary({ from: "2026-08-01", to: "2026-08-31" }),
      dreService.getDreMonthly({ year: "2026" }),
    ]);

    expect(summaryRes.success).toBe(true);
    expect(monthlyRes.success).toBe(true);

    const s = summaryRes.data!.totals;
    const m = monthlyRes.data!.find((item) => item.month === "2026-08");
    expect(m).toBeDefined();

    expect(s.realizedRevenue).toBe(m!.realizedRevenue);
    expect(s.estimatedCOGS).toBe(m!.estimatedCOGS);
    expect(s.estimatedGrossProfit).toBe(m!.estimatedGrossProfit);
    expect(s.variableExpenses.total).toBe(m!.variableExpenses.total);
    expect(s.contributionMargin).toBe(m!.contributionMargin);
    expect(s.operatingExpenses.total).toBe(m!.operatingExpenses.total);
    expect(s.financialResult.total).toBe(m!.financialResult.total);
    expect(s.netManagerialResult).toBe(m!.netManagerialResult);
    expect(s.status).toBe(m!.status);
  }, 30000);

  it("reconciles multi-month summary(2026-08-01, 2026-09-30) with sum of monthly buckets", async () => {
    const [summaryRes, monthlyRes] = await Promise.all([
      dreService.getDreSummary({ from: "2026-08-01", to: "2026-09-30" }),
      dreService.getDreMonthly({ year: "2026" }),
    ]);

    expect(summaryRes.success).toBe(true);
    expect(monthlyRes.success).toBe(true);

    const s = summaryRes.data!.totals;
    const aug = monthlyRes.data!.find((item) => item.month === "2026-08")!;
    const sep = monthlyRes.data!.find((item) => item.month === "2026-09")!;
    expect(aug).toBeDefined();
    expect(sep).toBeDefined();

    const expectedRev = Math.round((aug.realizedRevenue + sep.realizedRevenue) * 100) / 100;
    const expectedCogs = Math.round((aug.estimatedCOGS + sep.estimatedCOGS) * 100) / 100;
    const expectedGross = Math.round((aug.estimatedGrossProfit + sep.estimatedGrossProfit) * 100) / 100;
    const expectedVar = Math.round((aug.variableExpenses.total + sep.variableExpenses.total) * 100) / 100;
    const expectedCM = Math.round((aug.contributionMargin + sep.contributionMargin) * 100) / 100;
    const expectedOp = Math.round((aug.operatingExpenses.total + sep.operatingExpenses.total) * 100) / 100;
    const expectedFin = Math.round((aug.financialResult.total + sep.financialResult.total) * 100) / 100;
    const expectedNet = Math.round((aug.netManagerialResult + sep.netManagerialResult) * 100) / 100;

    expect(s.realizedRevenue).toBe(expectedRev);
    expect(s.estimatedCOGS).toBe(expectedCogs);
    expect(s.estimatedGrossProfit).toBe(expectedGross);
    expect(s.variableExpenses.total).toBe(expectedVar);
    expect(s.contributionMargin).toBe(expectedCM);
    expect(s.operatingExpenses.total).toBe(expectedOp);
    expect(s.financialResult.total).toBe(expectedFin);
    expect(s.netManagerialResult).toBe(expectedNet);
  }, 30000);
});
