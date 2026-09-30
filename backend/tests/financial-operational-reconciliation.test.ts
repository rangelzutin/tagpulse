import { describe, expect, it } from "vitest";
import { prisma } from "../src/database/prisma.js";
import {
  calculateEffectiveCashAmount,
  createFinancialOperationalService,
  createPrismaFinancialOperationalRepository,
} from "../src/modules/financial/index.js";

describe("Financial Operational Layer — Production Database Reconciliation", () => {
  const repository = createPrismaFinancialOperationalRepository(prisma);
  const service = createFinancialOperationalService(repository, {
    getNow: () => new Date("2026-09-27T12:00:00-03:00"),
  });

  it("reconciles Receivables overview against real PostgreSQL production database", async () => {
    // Independent baseline query from database
    const aggregate = await prisma.financialRecord.aggregate({
      where: {
        type: "ENTRADA",
        isConfirmed: false,
        sourcePresent: true,
        isTransfer: false,
      },
      _count: { id: true },
      _sum: { totalAmount: true },
    });
    const expectedCount = aggregate._count.id;
    const expectedTotal = Number(aggregate._sum.totalAmount?.toFixed(2) ?? "0");

    const result = await service.getReceivablesOverview("2026-09-27");
    expect(result.success).toBe(true);
    const data = result.data!;

    // Reconcile to independent database query
    expect(data.type).toBe("ENTRADA");
    expect(data.openCount).toBe(expectedCount);
    expect(data.openTotal).toBe(expectedTotal);

    // Overdue + DueToday + Future must sum to open
    expect(data.overdueCount + data.dueTodayCount + data.futureCount).toBe(expectedCount);
    expect(
      Number(
        (data.overdueTotal + data.dueTodayTotal + data.futureTotal).toFixed(2),
      ),
    ).toBe(expectedTotal);

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
    // Independent baseline query from database
    const aggregate = await prisma.financialRecord.aggregate({
      where: {
        type: "SAIDA",
        isConfirmed: false,
        sourcePresent: true,
        isTransfer: false,
      },
      _count: { id: true },
      _sum: { totalAmount: true },
    });
    const expectedCount = aggregate._count.id;
    const expectedTotal = Number(aggregate._sum.totalAmount?.toFixed(2) ?? "0");

    const result = await service.getPayablesOverview("2026-09-27");
    expect(result.success).toBe(true);
    const data = result.data!;

    expect(data.type).toBe("SAIDA");
    expect(data.openCount).toBe(expectedCount);
    expect(data.openTotal).toBe(expectedTotal);

    expect(data.overdueCount + data.dueTodayCount + data.futureCount).toBe(expectedCount);
    expect(
      Number(
        (data.overdueTotal + data.dueTodayTotal + data.futureTotal).toFixed(2),
      ),
    ).toBe(expectedTotal);

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
    // Independent reference extraction from database
    const [datedRows, undatedRows, excludedRows] = await Promise.all([
      prisma.financialRecord.findMany({
        where: {
          isConfirmed: true,
          isTransfer: false,
          sourcePresent: true,
          confirmationDate: { not: null },
          stockAdjustmentFinancialLinks: {
            none: {
              stockAdjustment: {
                type: "S",
              },
            },
          },
        },
        select: {
          type: true,
          isConfirmed: true,
          paidAmount: true,
          totalAmount: true,
        },
      }),
      prisma.financialRecord.findMany({
        where: {
          isConfirmed: true,
          isTransfer: false,
          sourcePresent: true,
          confirmationDate: null,
          stockAdjustmentFinancialLinks: {
            none: {
              stockAdjustment: {
                type: "S",
              },
            },
          },
        },
        select: {
          type: true,
          isConfirmed: true,
          paidAmount: true,
          totalAmount: true,
        },
      }),
      prisma.financialRecord.findMany({
        where: {
          isConfirmed: true,
          isTransfer: false,
          sourcePresent: true,
          stockAdjustmentFinancialLinks: {
            some: {
              stockAdjustment: {
                type: "S",
              },
            },
          },
        },
        select: {
          paidAmount: true,
          totalAmount: true,
          isConfirmed: true,
        },
      }),
    ]);

    const expectedDatedCount = datedRows.length;
    let expectedInflowCount = 0;
    let expectedOutflowCount = 0;
    let expectedInflows = 0;
    let expectedOutflows = 0;

    for (const r of datedRows) {
      const amount = Number(calculateEffectiveCashAmount(r).toFixed(2));
      if (r.type === "ENTRADA") {
        expectedInflowCount++;
        expectedInflows += amount;
      } else if (r.type === "SAIDA") {
        expectedOutflowCount++;
        expectedOutflows += amount;
      }
    }
    expectedInflows = Number(expectedInflows.toFixed(2));
    expectedOutflows = Number(expectedOutflows.toFixed(2));
    const expectedNet = Number((expectedInflows - expectedOutflows).toFixed(2));

    let expectedUndatedInflows = 0;
    let expectedUndatedOutflows = 0;
    for (const r of undatedRows) {
      const amount = Number(calculateEffectiveCashAmount(r).toFixed(2));
      if (r.type === "ENTRADA") {
        expectedUndatedInflows += amount;
      } else if (r.type === "SAIDA") {
        expectedUndatedOutflows += amount;
      }
    }
    expectedUndatedInflows = Number(expectedUndatedInflows.toFixed(2));
    expectedUndatedOutflows = Number(expectedUndatedOutflows.toFixed(2));
    const expectedUndatedNet = Number(
      (expectedUndatedInflows - expectedUndatedOutflows).toFixed(2),
    );

    let expectedExcludedAmount = 0;
    for (const r of excludedRows) {
      expectedExcludedAmount += Number(calculateEffectiveCashAmount(r).toFixed(2));
    }
    expectedExcludedAmount = Number(expectedExcludedAmount.toFixed(2));

    const result = await service.getCashFlowOverview({ granularity: "month" });
    expect(result.success).toBe(true);
    const data = result.data!;

    // Dated confirmed cash metrics
    expect(data.totals.totalCount).toBe(expectedDatedCount);
    expect(data.totals.inflowCount).toBe(expectedInflowCount);
    expect(data.totals.outflowCount).toBe(expectedOutflowCount);
    expect(data.totals.inflows).toBe(expectedInflows);
    expect(data.totals.outflows).toBe(expectedOutflows);
    expect(data.totals.netCashFlow).toBe(expectedNet);

    // Undated confirmed cash metrics
    expect(data.undated.undatedConfirmedCount).toBe(undatedRows.length);
    expect(data.undated.undatedConfirmedInflows).toBe(expectedUndatedInflows);
    expect(data.undated.undatedConfirmedOutflows).toBe(expectedUndatedOutflows);
    expect(data.undated.undatedConfirmedNet).toBe(expectedUndatedNet);

    // Excluded non-cash adjustments auditability metrics
    expect(data.excludedNonCashStockAdjustments.count).toBe(excludedRows.length);
    expect(data.excludedNonCashStockAdjustments.amount).toBe(expectedExcludedAmount);

    // Invariant: Total confirmed records
    expect(data.totals.totalCount + data.undated.undatedConfirmedCount).toBe(
      expectedDatedCount + undatedRows.length,
    );
    // Invariant: Total confirmed cash
    const totalConfirmedCash = Number(
      (
        data.totals.inflows +
        data.totals.outflows +
        data.undated.undatedConfirmedInflows
      ).toFixed(2),
    );
    const expectedTotalCash = Number(
      (expectedInflows + expectedOutflows + expectedUndatedInflows).toFixed(2),
    );
    expect(totalConfirmedCash).toBe(expectedTotalCash);
  });

  it("reconciles undated confirmed cash audit endpoint against real PostgreSQL database", async () => {
    const undatedRows = await prisma.financialRecord.findMany({
      where: {
        isConfirmed: true,
        isTransfer: false,
        sourcePresent: true,
        confirmationDate: null,
        stockAdjustmentFinancialLinks: {
          none: {
            stockAdjustment: {
              type: "S",
            },
          },
        },
      },
      select: {
        sourceId: true,
        type: true,
        isConfirmed: true,
        paidAmount: true,
        totalAmount: true,
      },
      orderBy: { sourceId: "asc" },
    });

    const expectedUndatedCount = undatedRows.length;
    let expectedUndatedInflows = 0;
    for (const r of undatedRows) {
      if (r.type === "ENTRADA") {
        expectedUndatedInflows += Number(calculateEffectiveCashAmount(r).toFixed(2));
      }
    }
    expectedUndatedInflows = Number(expectedUndatedInflows.toFixed(2));
    const expectedSourceIds = undatedRows.map((r) => r.sourceId).sort();

    const result = await service.getUndatedConfirmedCash();
    expect(result.success).toBe(true);
    const data = result.data!;

    expect(data.summary.undatedConfirmedCount).toBe(expectedUndatedCount);
    expect(data.summary.undatedConfirmedInflows).toBe(expectedUndatedInflows);
    expect(data.records).toHaveLength(expectedUndatedCount);

    const sourceIds = data.records.map((r) => r.sourceId).sort();
    expect(sourceIds).toEqual(expectedSourceIds);
    for (const record of data.records) {
      expect(record.type).toBe("ENTRADA");
      expect(record.effectiveCashAmount).toBeGreaterThan(0);
    }
  });

  it("supports pagination and search on real receivables list", async () => {
    const aggregate = await prisma.financialRecord.aggregate({
      where: {
        type: "ENTRADA",
        isConfirmed: false,
        sourcePresent: true,
        isTransfer: false,
      },
      _count: { id: true },
    });
    const expectedTotal = aggregate._count.id;
    const expectedPages = Math.ceil(expectedTotal / 10);

    const result = await service.getReceivablesList({
      status: "OPEN",
      referenceDate: "2026-09-27",
      page: 1,
      pageSize: 10,
    });
    expect(result.success).toBe(true);
    expect(result.data!.items).toHaveLength(Math.min(10, expectedTotal));
    expect(result.data!.total).toBe(expectedTotal);
    expect(result.data!.totalPages).toBe(expectedPages);
  });

  it("supports pagination and search on real payables list", async () => {
    const aggregate = await prisma.financialRecord.aggregate({
      where: {
        type: "SAIDA",
        isConfirmed: false,
        sourcePresent: true,
        isTransfer: false,
      },
      _count: { id: true },
    });
    const expectedTotal = aggregate._count.id;
    const expectedPages = Math.ceil(expectedTotal / 10);

    const result = await service.getPayablesList({
      status: "OPEN",
      referenceDate: "2026-09-27",
      page: 1,
      pageSize: 10,
    });
    expect(result.success).toBe(true);
    expect(result.data!.items).toHaveLength(Math.min(10, expectedTotal));
    expect(result.data!.total).toBe(expectedTotal);
    expect(result.data!.totalPages).toBe(expectedPages);
  });
});
