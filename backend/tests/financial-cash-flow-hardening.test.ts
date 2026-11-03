import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { createFinancialOperationalService } from "../src/modules/financial/financial-operational-service.js";
import {
  ConfirmedCashDbRecord,
  FinancialOperationalRepository,
  UndatedConfirmedCashRecordItem,
} from "../src/modules/financial/financial-operational-repository.js";
import {
  aggregateCashFlowSeries,
  aggregateUndatedConfirmedCash,
  calculateEffectiveCashAmount,
  isBancoInterReconciliationEvent,
} from "../src/modules/financial/financial-operational-calculator.js";

describe("Cash Flow & DRE hardening unit tests (P0 Egress Protection)", () => {
  it("computes effective cash amount without requiring sourcePayload", () => {
    const recordWithoutPayload: ConfirmedCashDbRecord = {
      sourceId: "rec-1",
      type: "ENTRADA",
      confirmationDate: new Date("2026-07-15T12:00:00Z"),
      paidAmount: new Prisma.Decimal("150.50"),
      totalAmount: new Prisma.Decimal("150.50"),
      isConfirmed: true,
      isTransfer: false,
      sourcePresent: true,
      description: "Venda teste",
      dueDate: new Date("2026-07-15T12:00:00Z"),
      sourcePayload: undefined,
    };

    expect(isBancoInterReconciliationEvent(recordWithoutPayload)).toBe(false);
    const amount = calculateEffectiveCashAmount(recordWithoutPayload);
    expect(amount.toNumber()).toBe(150.5);
  });

  it("passes date range filter to repository in getCashFlowOverview", async () => {
    const findConfirmedCashRecordsMock = vi.fn().mockResolvedValue([
      {
        sourceId: "rec-dated-1",
        type: "ENTRADA",
        confirmationDate: new Date("2026-07-10T10:00:00Z"),
        paidAmount: new Prisma.Decimal("200.00"),
        totalAmount: new Prisma.Decimal("200.00"),
        isConfirmed: true,
        isTransfer: false,
        sourcePresent: true,
        dueDate: new Date("2026-07-10T10:00:00Z"),
      },
    ]);

    const findUndatedMock = vi.fn().mockResolvedValue([]);
    const findExcludedSummaryMock = vi.fn().mockResolvedValue({
      totalCount: 0,
      totalAmount: 0,
      records: [],
    });

    const mockRepo: Partial<FinancialOperationalRepository> = {
      findConfirmedCashRecords: findConfirmedCashRecordsMock,
      findUndatedConfirmedCashRecords: findUndatedMock,
      findExcludedNonCashStockAdjustmentSummary: findExcludedSummaryMock,
    };

    const service = createFinancialOperationalService(
      mockRepo as FinancialOperationalRepository,
    );

    const result = await service.getCashFlowOverview({
      from: "2026-07-01",
      to: "2026-07-31",
      granularity: "month",
    });

    expect(result.success).toBe(true);
    expect(findConfirmedCashRecordsMock).toHaveBeenCalledTimes(2);

    // Call 1: bounded date range for dated series
    expect(findConfirmedCashRecordsMock).toHaveBeenNthCalledWith(1, {
      fromDate: new Date("2026-07-01T00:00:00.000Z"),
      toExclusiveDate: new Date("2026-08-01T00:00:00.000Z"),
    });

    // Call 2: undated only for undated summary
    expect(findConfirmedCashRecordsMock).toHaveBeenNthCalledWith(2, {
      undatedOnly: true,
    });
  });

  it("getUndatedConfirmedCash queries undated records only, without full table scan", async () => {
    const undatedList: UndatedConfirmedCashRecordItem[] = [
      {
        sourceId: "undated-1",
        type: "ENTRADA",
        description: "Recebimento sem confirmação formal",
        documentNumber: "DOC-99",
        entityName: "Cliente A",
        dueDate: "2026-07-05",
        totalAmount: 350.0,
        effectiveCashAmount: 350.0,
        paidAmount: null,
      },
    ];

    const undatedDbRows: ConfirmedCashDbRecord[] = [
      {
        sourceId: "undated-1",
        type: "ENTRADA",
        confirmationDate: null,
        paidAmount: null,
        totalAmount: new Prisma.Decimal("350.00"),
        isConfirmed: true,
        isTransfer: false,
        sourcePresent: true,
        description: "Recebimento sem confirmação formal",
        dueDate: new Date("2026-07-05T00:00:00Z"),
      },
    ];

    const findUndatedRecordsMock = vi.fn().mockResolvedValue(undatedList);
    const findConfirmedCashRecordsMock = vi.fn().mockResolvedValue(undatedDbRows);

    const mockRepo: Partial<FinancialOperationalRepository> = {
      findUndatedConfirmedCashRecords: findUndatedRecordsMock,
      findConfirmedCashRecords: findConfirmedCashRecordsMock,
    };

    const service = createFinancialOperationalService(
      mockRepo as FinancialOperationalRepository,
    );

    const result = await service.getUndatedConfirmedCash();

    expect(result.success).toBe(true);
    expect(findConfirmedCashRecordsMock).toHaveBeenCalledTimes(1);
    expect(findConfirmedCashRecordsMock).toHaveBeenCalledWith({ undatedOnly: true });

    if (result.success) {
      expect(result.data.records).toHaveLength(1);
      expect(result.data.summary.undatedConfirmedCount).toBe(1);
      expect(result.data.summary.undatedConfirmedInflows).toBe(350);
      expect(result.data.summary.undatedConfirmedNet).toBe(350);
    }
  });

  it("aggregateUndatedConfirmedCash correctly skips records with confirmationDate and computes net", () => {
    const mixedRecords: ConfirmedCashDbRecord[] = [
      {
        sourceId: "rec-dated",
        type: "ENTRADA",
        confirmationDate: new Date("2026-07-15T00:00:00Z"),
        totalAmount: new Prisma.Decimal("1000.00"),
        isConfirmed: true,
        isTransfer: false,
        sourcePresent: true,
      },
      {
        sourceId: "rec-undated-inflow",
        type: "ENTRADA",
        confirmationDate: null,
        totalAmount: new Prisma.Decimal("500.00"),
        isConfirmed: true,
        isTransfer: false,
        sourcePresent: true,
      },
      {
        sourceId: "rec-undated-outflow",
        type: "SAIDA",
        confirmationDate: null,
        totalAmount: new Prisma.Decimal("200.00"),
        isConfirmed: true,
        isTransfer: false,
        sourcePresent: true,
      },
    ];

    const summary = aggregateUndatedConfirmedCash(mixedRecords);
    expect(summary.undatedConfirmedCount).toBe(2);
    expect(summary.undatedConfirmedInflows).toBe(500);
    expect(summary.undatedConfirmedOutflows).toBe(200);
    expect(summary.undatedConfirmedNet).toBe(300);
  });
});

