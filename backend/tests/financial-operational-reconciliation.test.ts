import { describe, expect, it } from "vitest";
import { prisma } from "../src/database/prisma.js";
import {
  createFinancialOperationalService,
  createPrismaFinancialOperationalRepository,
} from "../src/modules/financial/index.js";

describe("Financial Operational Layer — Production Database Reconciliation", () => {
  const repository = createPrismaFinancialOperationalRepository(prisma);
  const service = createFinancialOperationalService(repository, {
    getNow: () => new Date("2026-09-27T12:00:00-03:00"),
  });

  it("reconciles Receivables overview against real PostgreSQL production database", async () => {
    const result = await service.getReceivablesOverview("2026-09-27");
    expect(result.success).toBe(true);
    const data = result.data!;

    // Total open receivables must reconcile to baseline
    expect(data.type).toBe("ENTRADA");
    expect(data.openCount).toBe(60);
    expect(data.openTotal).toBe(55184.88);

    // Overdue + DueToday + Future must sum to open
    expect(data.overdueCount + data.dueTodayCount + data.futureCount).toBe(60);
    expect(
      Number(
        (data.overdueTotal + data.dueTodayTotal + data.futureTotal).toFixed(2),
      ),
    ).toBe(55184.88);

    // Aging buckets must sum to overdue count and total
    const agingSum =
      data.aging.d1_30.total +
      data.aging.d31_60.total +
      data.aging.d61_90.total +
      data.aging.d90_plus.total;
    expect(Number(agingSum.toFixed(2))).toBe(data.overdueTotal);
    expect(
      data.aging.d1_30.count +
        data.aging.d31_60.count +
        data.aging.d61_90.count +
        data.aging.d90_plus.count,
    ).toBe(data.overdueCount);
  });

  it("reconciles Payables overview against real PostgreSQL production database", async () => {
    const result = await service.getPayablesOverview("2026-09-27");
    expect(result.success).toBe(true);
    const data = result.data!;

    expect(data.type).toBe("SAIDA");
    expect(data.openCount).toBe(32);
    expect(data.openTotal).toBe(9440.93);

    expect(data.overdueCount + data.dueTodayCount + data.futureCount).toBe(32);
    expect(
      Number(
        (data.overdueTotal + data.dueTodayTotal + data.futureTotal).toFixed(2),
      ),
    ).toBe(9440.93);

    const agingSum =
      data.aging.d1_30.total +
      data.aging.d31_60.total +
      data.aging.d61_90.total +
      data.aging.d90_plus.total;
    expect(Number(agingSum.toFixed(2))).toBe(data.overdueTotal);
    expect(
      data.aging.d1_30.count +
        data.aging.d31_60.count +
        data.aging.d61_90.count +
        data.aging.d90_plus.count,
    ).toBe(data.overdueCount);
  });

  it("reconciles Cash Flow totals and Undated Cash against real PostgreSQL database", async () => {
    const result = await service.getCashFlowOverview({ granularity: "month" });
    expect(result.success).toBe(true);
    const data = result.data!;

    // Dated confirmed cash metrics
    expect(data.totals.totalCount).toBe(10280);
    expect(data.totals.inflowCount).toBe(6422);
    expect(data.totals.outflowCount).toBe(3858);
    expect(data.totals.inflows).toBe(5365376.56);
    expect(data.totals.outflows).toBe(5763126.7);
    expect(data.totals.netCashFlow).toBe(-397750.14);

    // Undated confirmed cash metrics (5 records, all ENTRADA, R$ 3.476,61)
    expect(data.undated.undatedConfirmedCount).toBe(5);
    expect(data.undated.undatedConfirmedInflows).toBe(3476.61);
    expect(data.undated.undatedConfirmedOutflows).toBe(0.0);
    expect(data.undated.undatedConfirmedNet).toBe(3476.61);

    // Total confirmed records: 10280 dated + 5 undated = 10285
    expect(data.totals.totalCount + data.undated.undatedConfirmedCount).toBe(
      10285,
    );
    // Total confirmed cash: 5365376.56 + 5763126.70 + 3476.61 = 11131979.87
    const totalConfirmedCash = Number(
      (
        data.totals.inflows +
        data.totals.outflows +
        data.undated.undatedConfirmedInflows
      ).toFixed(2),
    );
    expect(totalConfirmedCash).toBe(11131979.87);
  });

  it("reconciles undated confirmed cash audit endpoint against real PostgreSQL database", async () => {
    const result = await service.getUndatedConfirmedCash();
    expect(result.success).toBe(true);
    const data = result.data!;

    expect(data.summary.undatedConfirmedCount).toBe(5);
    expect(data.summary.undatedConfirmedInflows).toBe(3476.61);
    expect(data.records).toHaveLength(5);

    const sourceIds = data.records.map((r) => r.sourceId).sort();
    expect(sourceIds).toEqual(["11191", "11265", "11289", "11309", "11368"]);
    for (const record of data.records) {
      expect(record.type).toBe("ENTRADA");
      expect(record.effectiveCashAmount).toBeGreaterThan(0);
    }
  });

  it("supports pagination and search on real receivables list", async () => {
    const result = await service.getReceivablesList({
      status: "OPEN",
      referenceDate: "2026-09-27",
      page: 1,
      pageSize: 10,
    });
    expect(result.success).toBe(true);
    expect(result.data!.items).toHaveLength(10);
    expect(result.data!.total).toBe(60);
    expect(result.data!.totalPages).toBe(6);
  });

  it("supports pagination and search on real payables list", async () => {
    const result = await service.getPayablesList({
      status: "OPEN",
      referenceDate: "2026-09-27",
      page: 1,
      pageSize: 10,
    });
    expect(result.success).toBe(true);
    expect(result.data!.items).toHaveLength(10);
    expect(result.data!.total).toBe(32);
    expect(result.data!.totalPages).toBe(4);
  });
});
