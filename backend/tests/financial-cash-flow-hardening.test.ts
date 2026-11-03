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

  it("proves semantic invariance: OLD vs NEW logic across all 5 contract categories", () => {
    // 1. Registro confirmado com data normal (no período)
    const rec1_datedInPeriod: ConfirmedCashDbRecord = {
      sourceId: "rec-1-dated-in-period",
      type: "ENTRADA",
      confirmationDate: new Date("2026-07-15T12:00:00Z"),
      paidAmount: new Prisma.Decimal("1000.00"),
      totalAmount: new Prisma.Decimal("1000.00"),
      isConfirmed: true,
      isTransfer: false,
      sourcePresent: true,
    };

    // 2. Registro que pertence à categoria undated pelo contrato real (confirmado, confirmationDate=null, elegível)
    const rec2_undatedContract: ConfirmedCashDbRecord = {
      sourceId: "rec-2-undated-valid",
      type: "ENTRADA",
      confirmationDate: null,
      paidAmount: null,
      totalAmount: new Prisma.Decimal("500.00"),
      isConfirmed: true,
      isTransfer: false,
      sourcePresent: true,
    };

    // 3. Registro não confirmado (não deve entrar em nenhum fluxo)
    const rec3_unconfirmed: ConfirmedCashDbRecord = {
      sourceId: "rec-3-unconfirmed",
      type: "ENTRADA",
      confirmationDate: null,
      paidAmount: null,
      totalAmount: new Prisma.Decimal("300.00"),
      isConfirmed: false,
      isTransfer: false,
      sourcePresent: true,
    };

    // 4. Registro confirmado fora do período (não entra na série temporal do período)
    const rec4_datedOutPeriod: ConfirmedCashDbRecord = {
      sourceId: "rec-4-dated-out-period",
      type: "ENTRADA",
      confirmationDate: new Date("2026-05-10T12:00:00Z"),
      paidAmount: new Prisma.Decimal("800.00"),
      totalAmount: new Prisma.Decimal("800.00"),
      isConfirmed: true,
      isTransfer: false,
      sourcePresent: true,
    };

    // 5. Registros que não pertencem ao undated
    // 5a. Transferência com confirmationDate null
    const rec5a_transfer: ConfirmedCashDbRecord = {
      sourceId: "rec-5a-transfer",
      type: "ENTRADA",
      confirmationDate: null,
      totalAmount: new Prisma.Decimal("400.00"),
      isConfirmed: true,
      isTransfer: true,
      sourcePresent: true,
    };
    // 5b. Fonte ausente (sourcePresent=false)
    const rec5b_sourceMissing: ConfirmedCashDbRecord = {
      sourceId: "rec-5b-source-missing",
      type: "ENTRADA",
      confirmationDate: null,
      totalAmount: new Prisma.Decimal("250.00"),
      isConfirmed: true,
      isTransfer: false,
      sourcePresent: false,
    };
    // 5c. Evento auxiliar de reconciliação Banco Inter
    const rec5c_interAux: ConfirmedCashDbRecord = {
      sourceId: "rec-5c-inter-aux",
      type: "ENTRADA",
      confirmationDate: null,
      totalAmount: new Prisma.Decimal("600.00"),
      isConfirmed: true,
      isTransfer: false,
      sourcePresent: true,
      paymentMethodSourceId: "24",
      bankAccountSourceId: "8",
      description: "Pagamento confirmado via Banco Inter - Extrato",
    };

    const allDbPool = [
      rec1_datedInPeriod,
      rec2_undatedContract,
      rec3_unconfirmed,
      rec4_datedOutPeriod,
      rec5a_transfer,
      rec5b_sourceMissing,
      rec5c_interAux,
    ];

    // --- OLD LOGIC (Sem filtro SQL de data/undated) ---
    // Repositório antigo executava where: { isConfirmed: true, isTransfer: false, sourcePresent: true }
    // sem filtro de data ou undated, retornando rec1, rec2, rec4 e rec5c.
    const oldRepositoryRecords = allDbPool.filter(
      (r) => r.isConfirmed && !r.isTransfer && r.sourcePresent,
    );

    const oldCashFlow = aggregateCashFlowSeries(oldRepositoryRecords, {
      from: "2026-07-01",
      to: "2026-07-31",
      granularity: "month",
    });
    const oldUndated = aggregateUndatedConfirmedCash(oldRepositoryRecords);

    // --- NEW LOGIC (Com filtro SQL pushdown no repositório) ---
    // 1. datedRecords via where.confirmationDate = { gte: fromDate, lt: toExclusiveDate }
    const fromDate = new Date("2026-07-01T00:00:00.000Z");
    const toExclusiveDate = new Date("2026-08-01T00:00:00.000Z");

    const newDatedRecords = allDbPool.filter(
      (r) =>
        r.isConfirmed &&
        !r.isTransfer &&
        r.sourcePresent &&
        r.confirmationDate != null &&
        r.confirmationDate >= fromDate &&
        r.confirmationDate < toExclusiveDate,
    );

    // 2. undatedRecords via where.confirmationDate = null
    const newUndatedRecords = allDbPool.filter(
      (r) =>
        r.isConfirmed &&
        !r.isTransfer &&
        r.sourcePresent &&
        r.confirmationDate === null,
    );

    const newCashFlow = aggregateCashFlowSeries(newDatedRecords, {
      from: "2026-07-01",
      to: "2026-07-31",
      granularity: "month",
    });
    const newUndated = aggregateUndatedConfirmedCash(newUndatedRecords);

    // Prova 1: População retornada pelo banco
    // No dated: somente rec1 foi buscado (em vez de rec1, rec2, rec4, rec5c)
    expect(newDatedRecords.map((r) => r.sourceId)).toEqual(["rec-1-dated-in-period"]);
    // No undated: somente rec2 e rec5c foram buscados (em vez de toda a tabela)
    expect(newUndatedRecords.map((r) => r.sourceId)).toEqual([
      "rec-2-undated-valid",
      "rec-5c-inter-aux",
    ]);

    // Prova 2: Cash Flow totals são rigorosamente IDÊNTICOS
    expect(newCashFlow.totals).toEqual(oldCashFlow.totals);
    expect(newCashFlow.series).toEqual(oldCashFlow.series);
    expect(newCashFlow.totals.inflows).toBe(1000);
    expect(newCashFlow.totals.totalCount).toBe(1);

    // Prova 3: Undated summary é rigorosamente IDÊNTICO
    expect(newUndated).toEqual(oldUndated);
    expect(newUndated.undatedConfirmedCount).toBe(1); // rec5c descartado por isBancoInterReconciliationEvent
    expect(newUndated.undatedConfirmedInflows).toBe(500);
    expect(newUndated.undatedConfirmedNet).toBe(500);
  });
});
