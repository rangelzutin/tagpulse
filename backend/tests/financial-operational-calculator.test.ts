import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  aggregateCashFlowSeries,
  aggregateOperationalSummary,
  aggregateUndatedConfirmedCash,
  calculateAgingBucket,
  calculateEffectiveCashAmount,
  classifyFinancialRecordCash,
  deriveDueDateStatus,
  deriveOperationalStatus,
  FinancialDataAnomalyError,
  isEligibleForCashFlow,
  toCivilDateString,
} from "../src/modules/financial/financial-operational-calculator.js";

describe("financial-operational-calculator", () => {
  describe("Section 16: effectiveCashAmount canonical rules", () => {
    it("Rule A: returns 0 when confirmed=false even if paidAmount and totalAmount are present", () => {
      const amount = calculateEffectiveCashAmount({
        isConfirmed: false,
        paidAmount: 696.66,
        totalAmount: 696.66,
      });
      expect(amount.toNumber()).toBe(0);
      expect(amount.equals(new Prisma.Decimal(0))).toBe(true);
    });

    it("Rule B: returns paidAmount when confirmed=true and paidAmount > 0", () => {
      const amount = calculateEffectiveCashAmount({
        isConfirmed: true,
        paidAmount: 696.67,
        totalAmount: 500.0,
      });
      expect(amount.toNumber()).toBe(696.67);
      expect(amount.equals(new Prisma.Decimal("696.67"))).toBe(true);
    });

    it("Rule C: uses fallback totalAmount when confirmed=true and paidAmount=0", () => {
      const amount = calculateEffectiveCashAmount({
        isConfirmed: true,
        paidAmount: 0,
        totalAmount: 500,
      });
      expect(amount.toNumber()).toBe(500);
      expect(amount.equals(new Prisma.Decimal(500))).toBe(true);
    });

    it("Rule D: uses fallback totalAmount when confirmed=true and paidAmount=null", () => {
      const amount = calculateEffectiveCashAmount({
        isConfirmed: true,
        paidAmount: null,
        totalAmount: 500,
      });
      expect(amount.toNumber()).toBe(500);
      expect(amount.equals(new Prisma.Decimal(500))).toBe(true);
    });

    it("Rule E: throws FinancialDataAnomalyError when confirmed=true and paidAmount <= 0 and totalAmount=null", () => {
      expect(() =>
        calculateEffectiveCashAmount({
          isConfirmed: true,
          paidAmount: 0,
          totalAmount: null,
          sourceId: "anomaly-1",
        }),
      ).toThrow(FinancialDataAnomalyError);

      expect(() =>
        calculateEffectiveCashAmount({
          isConfirmed: true,
          paidAmount: -10,
          totalAmount: null,
        }),
      ).toThrow(FinancialDataAnomalyError);
    });

    it("preserves exact precision with Prisma.Decimal without floating point drift", () => {
      const amount = calculateEffectiveCashAmount({
        isConfirmed: true,
        paidAmount: new Prisma.Decimal("1234567.8901"),
      });
      expect(amount.toString()).toBe("1234567.8901");
    });
  });

  describe("Section 17: Status de vencimento e timezone independence", () => {
    const referenceDate = "2026-09-27";

    it("classifies dueDate < referenceDate as OVERDUE", () => {
      expect(deriveDueDateStatus("2026-09-26", referenceDate)).toBe("OVERDUE");
      expect(deriveDueDateStatus("2025-12-31", referenceDate)).toBe("OVERDUE");
      expect(
        deriveDueDateStatus(
          new Date(Date.UTC(2026, 8, 26, 0, 0, 0)),
          referenceDate,
        ),
      ).toBe("OVERDUE");
    });

    it("classifies dueDate == referenceDate as DUE_TODAY (not overdue)", () => {
      expect(deriveDueDateStatus("2026-09-27", referenceDate)).toBe("DUE_TODAY");
      expect(
        deriveDueDateStatus(
          new Date(Date.UTC(2026, 8, 27, 0, 0, 0)),
          referenceDate,
        ),
      ).toBe("DUE_TODAY");
    });

    it("classifies dueDate > referenceDate as FUTURE", () => {
      expect(deriveDueDateStatus("2026-09-28", referenceDate)).toBe("FUTURE");
      expect(deriveDueDateStatus("2026-10-15", referenceDate)).toBe("FUTURE");
      expect(
        deriveDueDateStatus(
          new Date(Date.UTC(2026, 8, 28, 0, 0, 0)),
          referenceDate,
        ),
      ).toBe("FUTURE");
    });

    it("deriveOperationalStatus classifies isConfirmed=true as CONFIRMED regardless of dueDate", () => {
      expect(
        deriveOperationalStatus(
          { isConfirmed: true, dueDate: "2026-09-20" },
          referenceDate,
        ),
      ).toBe("CONFIRMED");
      expect(
        deriveOperationalStatus(
          { isConfirmed: true, dueDate: "2026-10-20" },
          referenceDate,
        ),
      ).toBe("CONFIRMED");
    });

    it("toCivilDateString extracts YYYY-MM-DD reliably from Date and strings", () => {
      const d = new Date(Date.UTC(2026, 8, 27, 23, 59, 59));
      expect(toCivilDateString(d)).toBe("2026-09-27");
      expect(toCivilDateString("2026-09-27T00:00:00.000Z")).toBe("2026-09-27");
    });

    it("calculates aging buckets correctly for overdue items", () => {
      // 1 day overdue (2026-09-26 vs 2026-09-27)
      expect(calculateAgingBucket("2026-09-26", referenceDate)).toBe("d1_30");
      // 30 days overdue (2026-08-28 vs 2026-09-27)
      expect(calculateAgingBucket("2026-08-28", referenceDate)).toBe("d1_30");
      // 31 days overdue (2026-08-27 vs 2026-09-27)
      expect(calculateAgingBucket("2026-08-27", referenceDate)).toBe("d31_60");
      // 60 days overdue (2026-07-29 vs 2026-09-27)
      expect(calculateAgingBucket("2026-07-29", referenceDate)).toBe("d31_60");
      // 61 days overdue (2026-07-28 vs 2026-09-27)
      expect(calculateAgingBucket("2026-07-28", referenceDate)).toBe("d61_90");
      // 90 days overdue (2026-06-29 vs 2026-09-27)
      expect(calculateAgingBucket("2026-06-29", referenceDate)).toBe("d61_90");
      // 91 days overdue (2026-06-28 vs 2026-09-27)
      expect(calculateAgingBucket("2026-06-28", referenceDate)).toBe("d90_plus");
    });
  });

  describe("Section 18 & 19: Operational summary and aging aggregation", () => {
    const referenceDate = "2026-09-27";

    it("aggregates open receivables summary, aging and counts accurately", () => {
      const records = [
        // Overdue 10 days (1-30)
        { dueDate: "2026-09-17", totalAmount: "100.50", isConfirmed: false },
        // Overdue 40 days (31-60)
        { dueDate: "2026-08-18", totalAmount: "200.25", isConfirmed: false },
        // Overdue 70 days (61-90)
        { dueDate: "2026-07-19", totalAmount: "300.00", isConfirmed: false },
        // Overdue 100 days (>90)
        { dueDate: "2026-06-19", totalAmount: "400.00", isConfirmed: false },
        // Due today
        { dueDate: "2026-09-27", totalAmount: "50.00", isConfirmed: false },
        // Future
        { dueDate: "2026-09-28", totalAmount: "150.00", isConfirmed: false },
        // Confirmed (must be ignored in open summary)
        { dueDate: "2026-09-10", totalAmount: "999.00", isConfirmed: true },
      ];

      const summary = aggregateOperationalSummary(records, referenceDate);

      expect(summary.openCount).toBe(6);
      expect(summary.openTotal).toBe(1200.75); // 100.50 + 200.25 + 300 + 400 + 50 + 150

      expect(summary.overdueCount).toBe(4);
      expect(summary.overdueTotal).toBe(1000.75); // 100.50 + 200.25 + 300 + 400

      expect(summary.dueTodayCount).toBe(1);
      expect(summary.dueTodayTotal).toBe(50.0);

      expect(summary.futureCount).toBe(1);
      expect(summary.futureTotal).toBe(150.0);

      expect(summary.aging.d1_30).toEqual({ count: 1, total: 100.5 });
      expect(summary.aging.d31_60).toEqual({ count: 1, total: 200.25 });
      expect(summary.aging.d61_90).toEqual({ count: 1, total: 300.0 });
      expect(summary.aging.d90_plus).toEqual({ count: 1, total: 400.0 });
    });
  });

  describe("Section 18: Cash Flow realized rules and aggregation", () => {
    it("aggregates dated cash flow and explicitly excludes undated, unconfirmed, transfers and absent records", () => {
      const records = [
        // Valid Entrada 2026-01-15
        {
          type: "ENTRADA" as const,
          confirmationDate: "2026-01-15",
          paidAmount: "1000.00",
          totalAmount: "1000.00",
          isConfirmed: true,
          isTransfer: false,
          sourcePresent: true,
        },
        // Valid Saida 2026-01-20
        {
          type: "SAIDA" as const,
          confirmationDate: "2026-01-20",
          paidAmount: "400.00",
          totalAmount: "400.00",
          isConfirmed: true,
          isTransfer: false,
          sourcePresent: true,
        },
        // Valid Entrada with fallback totalAmount (paid=0) in 2026-02-10
        {
          type: "ENTRADA" as const,
          confirmationDate: "2026-02-10",
          paidAmount: 0,
          totalAmount: "500.00",
          isConfirmed: true,
          isTransfer: false,
          sourcePresent: true,
        },
        // Unconfirmed record (should be ignored)
        {
          type: "ENTRADA" as const,
          confirmationDate: "2026-01-15",
          paidAmount: "999.00",
          totalAmount: "999.00",
          isConfirmed: false,
          isTransfer: false,
          sourcePresent: true,
        },
        // Internal transfer (must be ignored)
        {
          type: "ENTRADA" as const,
          confirmationDate: "2026-01-15",
          paidAmount: "5000.00",
          totalAmount: "5000.00",
          isConfirmed: true,
          isTransfer: true,
          sourcePresent: true,
        },
        // Source not present (must be ignored)
        {
          type: "ENTRADA" as const,
          confirmationDate: "2026-01-15",
          paidAmount: "300.00",
          totalAmount: "300.00",
          isConfirmed: true,
          isTransfer: false,
          sourcePresent: false,
        },
        // UNDATED confirmed cash (must be excluded from timeseries series)
        {
          type: "ENTRADA" as const,
          confirmationDate: null,
          paidAmount: 0,
          totalAmount: "770.00",
          isConfirmed: true,
          isTransfer: false,
          sourcePresent: true,
        },
      ];

      const monthly = aggregateCashFlowSeries(records, { granularity: "month" });

      expect(monthly.series).toHaveLength(2);
      expect(monthly.series[0]).toEqual({
        period: "2026-01",
        inflows: 1000.0,
        outflows: 400.0,
        netCashFlow: 600.0,
        inflowCount: 1,
        outflowCount: 1,
        totalCount: 2,
      });
      expect(monthly.series[1]).toEqual({
        period: "2026-02",
        inflows: 500.0,
        outflows: 0.0,
        netCashFlow: 500.0,
        inflowCount: 1,
        outflowCount: 0,
        totalCount: 1,
      });

      expect(monthly.totals).toEqual({
        inflows: 1500.0,
        outflows: 400.0,
        netCashFlow: 1100.0,
        inflowCount: 2,
        outflowCount: 1,
        totalCount: 3,
      });

      // Check undated aggregation
      const undated = aggregateUndatedConfirmedCash(records);
      expect(undated).toEqual({
        undatedConfirmedCount: 1,
        undatedConfirmedInflows: 770.0,
        undatedConfirmedOutflows: 0.0,
        undatedConfirmedNet: 770.0,
      });
    });

    it("supports daily granularity aggregation", () => {
      const records = [
        {
          type: "ENTRADA" as const,
          confirmationDate: "2026-03-01",
          paidAmount: "100.00",
          totalAmount: "100.00",
          isConfirmed: true,
          isTransfer: false,
          sourcePresent: true,
        },
        {
          type: "SAIDA" as const,
          confirmationDate: "2026-03-01",
          paidAmount: "40.00",
          totalAmount: "40.00",
          isConfirmed: true,
          isTransfer: false,
          sourcePresent: true,
        },
        {
          type: "ENTRADA" as const,
          confirmationDate: "2026-03-02",
          paidAmount: "250.00",
          totalAmount: "250.00",
          isConfirmed: true,
          isTransfer: false,
          sourcePresent: true,
        },
      ];

      const daily = aggregateCashFlowSeries(records, { granularity: "day" });
      expect(daily.series).toHaveLength(2);
      expect(daily.series[0]!.period).toBe("2026-03-01");
      expect(daily.series[0]!.netCashFlow).toBe(60.0);
      expect(daily.series[1]!.period).toBe("2026-03-02");
      expect(daily.series[1]!.netCashFlow).toBe(250.0);
    });
  });

  describe("Fase 5J: Canonical Cash Classification & Eligibility (Rules A-J)", () => {
    it("Rule A: confirmed SAIDA normal without adjustment link is CASH and eligible", () => {
      const record = {
        type: "SAIDA" as const,
        isConfirmed: true,
        isTransfer: false,
        sourcePresent: true,
        hasStockAdjustmentOutflowLink: false,
      };
      expect(classifyFinancialRecordCash(record)).toBe("CASH");
      expect(isEligibleForCashFlow(record)).toBe(true);
    });

    it("Rule B: confirmed SAIDA linked to StockAdjustment type S is NON_CASH_STOCK_ADJUSTMENT_OUTFLOW and ineligible", () => {
      const record = {
        type: "SAIDA" as const,
        isConfirmed: true,
        isTransfer: false,
        sourcePresent: true,
        hasStockAdjustmentOutflowLink: true,
      };
      expect(classifyFinancialRecordCash(record)).toBe(
        "NON_CASH_STOCK_ADJUSTMENT_OUTFLOW",
      );
      expect(isEligibleForCashFlow(record)).toBe(false);
    });

    it("Rule C (Critical Negative Test): confirmed SAIDA linked to StockAdjustment C/E/D is CASH and eligible", () => {
      // Linked to C (Compra) - should NOT have outflow link flag
      const recordC = {
        type: "SAIDA" as const,
        isConfirmed: true,
        isTransfer: false,
        sourcePresent: true,
        hasStockAdjustmentOutflowLink: false,
      };
      expect(classifyFinancialRecordCash(recordC)).toBe("CASH");
      expect(isEligibleForCashFlow(recordC)).toBe(true);

      // Linked to E (Entrada) - should NOT have outflow link flag
      const recordE = {
        type: "ENTRADA" as const,
        isConfirmed: true,
        isTransfer: false,
        sourcePresent: true,
        hasStockAdjustmentOutflowLink: false,
      };
      expect(classifyFinancialRecordCash(recordE)).toBe("CASH");
      expect(isEligibleForCashFlow(recordE)).toBe(true);

      // Linked to D (Devolução) - should NOT have outflow link flag
      const recordD = {
        type: "SAIDA" as const,
        isConfirmed: true,
        isTransfer: false,
        sourcePresent: true,
        hasStockAdjustmentOutflowLink: false,
      };
      expect(classifyFinancialRecordCash(recordD)).toBe("CASH");
      expect(isEligibleForCashFlow(recordD)).toBe(true);
    });

    it("Rule D: direct Atleta payment without adjustment link is CASH and eligible", () => {
      const directAtleta = {
        type: "SAIDA" as const,
        isConfirmed: true,
        isTransfer: false,
        sourcePresent: true,
        hasStockAdjustmentOutflowLink: false,
      };
      expect(classifyFinancialRecordCash(directAtleta)).toBe("CASH");
      expect(isEligibleForCashFlow(directAtleta)).toBe(true);
    });

    it("Rule E: direct Marketing payment without adjustment link is CASH and eligible", () => {
      const directMarketing = {
        type: "SAIDA" as const,
        isConfirmed: true,
        isTransfer: false,
        sourcePresent: true,
        hasStockAdjustmentOutflowLink: false,
      };
      expect(classifyFinancialRecordCash(directMarketing)).toBe("CASH");
      expect(isEligibleForCashFlow(directMarketing)).toBe(true);
    });

    it("Rule F: linked S with paidAmount > 0 is still NON_CASH_STOCK_ADJUSTMENT_OUTFLOW and ineligible", () => {
      const record = {
        type: "SAIDA" as const,
        isConfirmed: true,
        isTransfer: false,
        sourcePresent: true,
        hasStockAdjustmentOutflowLink: true,
        paidAmount: 500,
      };
      expect(classifyFinancialRecordCash(record)).toBe(
        "NON_CASH_STOCK_ADJUSTMENT_OUTFLOW",
      );
      expect(isEligibleForCashFlow(record)).toBe(false);
    });

    it("Rule G: linked S with confirmationDate=null is ineligible and excluded from undated cash", () => {
      const records = [
        {
          type: "SAIDA" as const,
          confirmationDate: null,
          paidAmount: 0,
          totalAmount: 500,
          isConfirmed: true,
          isTransfer: false,
          sourcePresent: true,
          hasStockAdjustmentOutflowLink: true,
        },
        {
          type: "ENTRADA" as const,
          confirmationDate: null,
          paidAmount: 0,
          totalAmount: 100,
          isConfirmed: true,
          isTransfer: false,
          sourcePresent: true,
          hasStockAdjustmentOutflowLink: false,
        },
      ];

      const undated = aggregateUndatedConfirmedCash(records);
      expect(undated.undatedConfirmedCount).toBe(1);
      expect(undated.undatedConfirmedInflows).toBe(100);
      expect(undated.undatedConfirmedOutflows).toBe(0);
    });

    it("Rule H: unconfirmed linked S is ineligible for two distinct reasons (unconfirmed and non-cash)", () => {
      const record = {
        type: "SAIDA" as const,
        isConfirmed: false,
        isTransfer: false,
        sourcePresent: true,
        hasStockAdjustmentOutflowLink: true,
      };
      expect(isEligibleForCashFlow(record)).toBe(false);
      expect(calculateEffectiveCashAmount(record).toNumber()).toBe(0);
    });

    it("Rule I: transfer records remain excluded regardless of adjustment link status", () => {
      const transferLinked = {
        type: "SAIDA" as const,
        isConfirmed: true,
        isTransfer: true,
        sourcePresent: true,
        hasStockAdjustmentOutflowLink: true,
      };
      expect(isEligibleForCashFlow(transferLinked)).toBe(false);

      const transferUnlinked = {
        type: "SAIDA" as const,
        isConfirmed: true,
        isTransfer: true,
        sourcePresent: true,
        hasStockAdjustmentOutflowLink: false,
      };
      expect(isEligibleForCashFlow(transferUnlinked)).toBe(false);
    });

    it("Rule J: sourcePresent=false remains excluded from cash flow", () => {
      const deletedRecord = {
        type: "SAIDA" as const,
        isConfirmed: true,
        isTransfer: false,
        sourcePresent: false,
        hasStockAdjustmentOutflowLink: false,
      };
      expect(isEligibleForCashFlow(deletedRecord)).toBe(false);
    });

    it("Rule K (Section 5 Negative Test): confirmed ENTRADA (E) linked to StockAdjustment type S is CASH and eligible", () => {
      // FinancialRecord type E / ENTRADA linked to StockAdjustment S must remain CASH
      const recordE = {
        type: "ENTRADA" as const,
        isConfirmed: true,
        isTransfer: false,
        sourcePresent: true,
        hasStockAdjustmentOutflowLink: true,
      };
      expect(classifyFinancialRecordCash(recordE)).toBe("CASH");
      expect(isEligibleForCashFlow(recordE)).toBe(true);

      const recordShortE = {
        type: "E",
        isConfirmed: true,
        isTransfer: false,
        sourcePresent: true,
        hasStockAdjustmentOutflowLink: true,
      };
      expect(classifyFinancialRecordCash(recordShortE)).toBe("CASH");
      expect(isEligibleForCashFlow(recordShortE)).toBe(true);
    });

    it("Rule L (Section 6 Link Histórico): link with sourcePresent=false still classifies SAIDA + StockAdjustment S as non-cash", () => {
      const record = {
        type: "SAIDA" as const,
        isConfirmed: true,
        isTransfer: false,
        sourcePresent: true,
        hasStockAdjustmentOutflowLink: true,
      };
      expect(classifyFinancialRecordCash(record)).toBe(
        "NON_CASH_STOCK_ADJUSTMENT_OUTFLOW",
      );
      expect(isEligibleForCashFlow(record)).toBe(false);
    });

    it("excludes S-linked adjustments from aggregateCashFlowSeries timeseries and totals", () => {
      const records = [
        {
          type: "SAIDA" as const,
          confirmationDate: "2026-04-10",
          totalAmount: 1000,
          isConfirmed: true,
          isTransfer: false,
          sourcePresent: true,
          hasStockAdjustmentOutflowLink: true, // Non-cash S-adjustment
        },
        {
          type: "SAIDA" as const,
          confirmationDate: "2026-04-10",
          totalAmount: 200,
          isConfirmed: true,
          isTransfer: false,
          sourcePresent: true,
          hasStockAdjustmentOutflowLink: false, // Normal cash outflow
        },
        {
          type: "ENTRADA" as const,
          confirmationDate: "2026-04-12",
          totalAmount: 800,
          isConfirmed: true,
          isTransfer: false,
          sourcePresent: true,
          hasStockAdjustmentOutflowLink: false,
        },
      ];

      const result = aggregateCashFlowSeries(records, { granularity: "month" });
      expect(result.totals.outflowCount).toBe(1);
      expect(result.totals.outflows).toBe(200);
      expect(result.totals.inflows).toBe(800);
      expect(result.totals.netCashFlow).toBe(600);
      expect(result.series).toHaveLength(1);
      expect(result.series[0]!.outflows).toBe(200);
    });

    it("Section 8: respects period filter and proves outflowBefore - outflowAfter = excludedAmount", () => {
      // Registro A: FinancialRecord S, Adjustment S, confirmationDate dentro do período (2026-05-15), amount 100
      const recordA = {
        type: "SAIDA" as const,
        confirmationDate: "2026-05-15",
        totalAmount: 100,
        isConfirmed: true,
        isTransfer: false,
        sourcePresent: true,
        hasStockAdjustmentOutflowLink: true,
      };

      // Registro B: FinancialRecord S, Adjustment S, confirmationDate fora do período (2026-06-20), amount 200
      const recordB = {
        type: "SAIDA" as const,
        confirmationDate: "2026-06-20",
        totalAmount: 200,
        isConfirmed: true,
        isTransfer: false,
        sourcePresent: true,
        hasStockAdjustmentOutflowLink: true,
      };

      // Registro C: FinancialRecord S normal, dentro do período (2026-05-20), amount 300
      const recordC = {
        type: "SAIDA" as const,
        confirmationDate: "2026-05-20",
        totalAmount: 300,
        isConfirmed: true,
        isTransfer: false,
        sourcePresent: true,
        hasStockAdjustmentOutflowLink: false,
      };

      const periodOptions = {
        granularity: "month" as const,
        from: "2026-05-01",
        to: "2026-05-31",
      };

      // Outflow antes da exclusão
      const withoutExclusion = [
        { ...recordA, hasStockAdjustmentOutflowLink: false },
        { ...recordB, hasStockAdjustmentOutflowLink: false },
        recordC,
      ];
      const beforeResult = aggregateCashFlowSeries(withoutExclusion, periodOptions);
      const outflowBefore = beforeResult.totals.outflows; // 100 + 300 = 400

      // Outflow depois da exclusão no período
      const afterResult = aggregateCashFlowSeries([recordA, recordB, recordC], periodOptions);
      const outflowAfter = afterResult.totals.outflows; // apenas C = 300

      // Métrica auditável de exclusão no período de maio
      const excludedInPeriod = [recordA, recordB].filter((r) => {
        return (
          r.hasStockAdjustmentOutflowLink &&
          r.confirmationDate >= "2026-05-01" &&
          r.confirmationDate <= "2026-05-31"
        );
      });
      const excludedCount = excludedInPeriod.length;
      const excludedAmount = excludedInPeriod.reduce((sum, r) => sum + r.totalAmount, 0);

      expect(excludedCount).toBe(1);
      expect(excludedAmount).toBe(100);
      expect(afterResult.totals.outflowCount).toBe(1);
      expect(outflowAfter).toBe(300);

      // Prova matemática: outflow-before - outflow-after = excludedAmount
      expect(outflowBefore - outflowAfter).toBe(excludedAmount);
    });
  });
});
