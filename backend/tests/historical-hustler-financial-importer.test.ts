import { describe, expect, it, vi } from "vitest";
import { FinancialRecordType, SourceSystem, HistoricalImportBatchStatus } from "@prisma/client";
import { importHustlerFinancial } from "../src/modules/historical/hustler/hustler-financial-importer.js";
import * as plannerModule from "../src/modules/historical/hustler/hustler-financial-planner.js";

describe("Historical Hustler Financial Importer Unit Tests (Phase 4P)", () => {
  const mockBatch = {
    id: "1b067f48-9b87-4c26-aa16-59339a09e57e",
    companyId: "company-1",
    sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
    status: HistoricalImportBatchStatus.STAGED,
  };

  const mockPlan: plannerModule.HustlerFinancialImportPlan = {
    batchId: mockBatch.id,
    companyId: mockBatch.companyId,
    connectionId: "conn-1",
    summary: {
      batchId: mockBatch.id,
      totalSourceRows: 11152,
      entryCount: 9021,
      entryAmount: 1121885.31,
      exitCount: 2131,
      exitAmount: 1085759.45,
      confirmedEntryCount: 8993,
      confirmedEntryAmount: 1117951.4,
      openEntryCount: 28,
      openEntryAmount: 3933.91,
      confirmedExitCount: 2121,
      confirmedExitAmount: 1082732.93,
      openExitCount: 10,
      openExitAmount: 3026.52,
      classes: {
        SALE_RECEIVABLE: { count: 8963, total: 1114512.33, paid: 690739.67 },
        OPERATING_EXPENSE: { count: 1317, total: 487874.99, paid: 278044.1 },
        INVENTORY_PURCHASE_AP: { count: 814, total: 597884.46, paid: 337817.21 },
        OTHER_FINANCIAL_INCOME: { count: 28, total: 2785.54, paid: 149.8 },
        OTHER_FINANCIAL_EXPENSE: { count: 0, total: 0, paid: 0 },
        QUARANTINE: { count: 24, total: 2743.94, paid: 1403.71 },
        CANCELLED_SALE_FINANCIAL: { count: 0, total: 0, paid: 0 },
        UNRESOLVED: { count: 6, total: 1843.5, paid: 0 },
      },
      linkedToCanonicalSalesCount: 7637,
      linkedCanonicalAmount: 963556.53,
      quarantineSalesFinancialRows: 24,
      quarantineSalesFinancialAmount: 2743.94,
      cancelledSalesFinancialRows: 0,
      cancelledSalesFinancialAmount: 0,
      plannedFinancialRecordsCount: 11094,
      plannedFinancialRecordsAmount: 2200271.78,
      quarantinedCount: 24,
      unresolvedCount: 6,
      skippedOtherIncomeCount: 28,
      skippedOtherIncomeAmount: 2785.54,
      totalSkippedCount: 58,
      totalSkippedAmount: 7372.98,
      totalAccountedRows: 11152,
      totalAccountedAmount: 2207644.76,
      reconciliationPassed: true,
    },
    plannedRecords: [
      {
        legacyFinancialId: "1",
        sourceId: "HUSTLER_LEGACY:FIN:1",
        sourceType: "financeiro_lancamento",
        direction: "E",
        canonicalFinancialType: FinancialRecordType.ENTRADA,
        amountOriginal: 100,
        amountPaid: 100,
        dueDate: new Date("2024-05-10"),
        confirmedDate: new Date("2024-05-10"),
        competenceDate: new Date("2024-05-10"),
        isConfirmed: true,
        budgetPlanSourceId: "3",
        accountCategory: "COMMERCIAL_SALE",
        canonicalSaleId: "sale-1",
        customerId: "cust-1",
        paymentMethod: "Dinheiro",
        installmentNumber: 1,
        installmentCount: null,
        evidenceLevel: "LEVEL_A",
        classification: "SALE_RECEIVABLE",
        affectsCash: true,
        affectsManagerialDre: false,
        affectsCommercialRevenue: false,
        affectsCmv: false,
        importable: true,
        skipReason: null,
        warnings: [],
      },
      {
        legacyFinancialId: "2",
        sourceId: "HUSTLER_LEGACY:FIN:2",
        sourceType: "financeiro_lancamento",
        direction: "S",
        canonicalFinancialType: FinancialRecordType.SAIDA,
        amountOriginal: 500,
        amountPaid: 500,
        dueDate: new Date("2024-05-10"),
        confirmedDate: new Date("2024-05-10"),
        competenceDate: new Date("2024-05-10"),
        isConfirmed: true,
        budgetPlanSourceId: "40",
        accountCategory: "ALUGUEL",
        canonicalSaleId: null,
        customerId: null,
        paymentMethod: null,
        installmentNumber: null,
        installmentCount: null,
        evidenceLevel: "LEVEL_A",
        classification: "OPERATING_EXPENSE",
        affectsCash: true,
        affectsManagerialDre: true,
        affectsCommercialRevenue: false,
        affectsCmv: false,
        importable: true,
        skipReason: null,
        warnings: [],
      },
      {
        legacyFinancialId: "3",
        sourceId: "HUSTLER_LEGACY:FIN:3",
        sourceType: "financeiro_lancamento",
        direction: "S",
        canonicalFinancialType: FinancialRecordType.SAIDA,
        amountOriginal: 250,
        amountPaid: 0,
        dueDate: new Date("2024-05-10"),
        confirmedDate: null,
        competenceDate: new Date("2024-05-10"),
        isConfirmed: false,
        budgetPlanSourceId: "19",
        accountCategory: "INVENTORY_PURCHASE",
        canonicalSaleId: null,
        customerId: null,
        paymentMethod: null,
        installmentNumber: null,
        installmentCount: null,
        evidenceLevel: "LEVEL_B",
        classification: "INVENTORY_PURCHASE_AP",
        affectsCash: true,
        affectsManagerialDre: false,
        affectsCommercialRevenue: false,
        affectsCmv: false,
        importable: true,
        skipReason: null,
        warnings: [],
      },
      {
        legacyFinancialId: "99",
        sourceId: "HUSTLER_LEGACY:FIN:99",
        sourceType: "financeiro_lancamento",
        direction: "E",
        canonicalFinancialType: FinancialRecordType.ENTRADA,
        amountOriginal: 120,
        amountPaid: 120,
        dueDate: new Date("2024-05-10"),
        confirmedDate: new Date("2024-05-10"),
        competenceDate: new Date("2024-05-10"),
        isConfirmed: true,
        budgetPlanSourceId: "1",
        accountCategory: "OTHER_INCOME",
        canonicalSaleId: null,
        customerId: null,
        paymentMethod: null,
        installmentNumber: null,
        installmentCount: null,
        evidenceLevel: "LEVEL_C",
        classification: "OTHER_FINANCIAL_INCOME",
        affectsCash: true,
        affectsManagerialDre: false,
        affectsCommercialRevenue: false,
        affectsCmv: false,
        importable: false,
        skipReason: "Classified as OTHER_FINANCIAL_INCOME",
        warnings: [],
      },
    ],
    samples: {
      saleReceivableSample: null,
      operatingExpenseSample: null,
      inventoryPurchaseSample: null,
      openReceivableSample: null,
      quarantineSample: null,
    },
  };

  it("1. blocks production database and unknown environments", () => {
    expect(() => {
      plannerModule.assertSafeDatabaseUrl(
        "postgresql://postgres:pass@szahricoqxzckjytpnmg.supabase.co:5432/postgres"
      );
    }).toThrow(/FATAL: Production database detected/);
  });

  it("2. enforces batch guard: rejects non-HUSTLER batch or non-STAGED batch", async () => {
    const mockPrisma = {
      historicalImportBatch: {
        findUnique: vi.fn().mockResolvedValue({
          id: mockBatch.id,
          sourceSystem: SourceSystem.TAGPLUS_CURRENT,
          status: HistoricalImportBatchStatus.STAGED,
        }),
      },
    } as any;

    await expect(
      importHustlerFinancial(mockPrisma, { batchId: mockBatch.id, dryRun: true })
    ).rejects.toThrow(/Invalid sourceSystem/);
  });

  it("3. executes pre-flight validation and passes when planner matches Phase 4O specs", async () => {
    vi.spyOn(plannerModule, "planHustlerFinancialImport").mockResolvedValue(mockPlan);

    const mockPrisma = {
      historicalImportBatch: {
        findUnique: vi.fn().mockResolvedValue(mockBatch),
      },
      product: { count: vi.fn().mockResolvedValue(4792) },
      customer: { count: vi.fn().mockResolvedValue(2926) },
      sale: { count: vi.fn().mockResolvedValue(9789) },
      saleItem: { count: vi.fn().mockResolvedValue(46434) },
      saleSourceDocument: {
        count: vi.fn().mockResolvedValue(11200),
        aggregate: vi.fn().mockResolvedValue({ _sum: { netAmount: "1141693.14" } }),
      },
      saleSourceDocumentItem: { count: vi.fn().mockResolvedValue(49163) },
      historicalSourceIdentity: { count: vi.fn().mockResolvedValue(11371) },
      financialRecord: {
        count: vi.fn().mockResolvedValue(10501),
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as any;

    const res = await importHustlerFinancial(mockPrisma, {
      batchId: mockBatch.id,
      dryRun: true,
    });

    expect(res.preflight.preflightPassed).toBe(true);
    expect(res.preflight.plannedFinancialRecords).toBe(11094);
    expect(res.preflight.totalSkippedCount).toBe(58);
    expect(res.dryRun).toBe(true);
  });

  it("4. performs atomic persistence and validates canonical table invariants and commercial revenue", async () => {
    vi.spyOn(plannerModule, "planHustlerFinancialImport").mockResolvedValue(mockPlan);

    const createManyMock = vi.fn().mockResolvedValue({ count: 3 });
    const mockPrisma = {
      historicalImportBatch: {
        findUnique: vi.fn().mockResolvedValue(mockBatch),
      },
      product: { count: vi.fn().mockResolvedValue(4792) },
      customer: { count: vi.fn().mockResolvedValue(2926) },
      sale: { count: vi.fn().mockResolvedValue(9789) },
      saleItem: { count: vi.fn().mockResolvedValue(46434) },
      saleSourceDocument: {
        count: vi.fn().mockResolvedValue(11200),
        aggregate: vi.fn().mockResolvedValue({ _sum: { netAmount: "1141693.14" } }),
      },
      saleSourceDocumentItem: { count: vi.fn().mockResolvedValue(49163) },
      historicalSourceIdentity: { count: vi.fn().mockResolvedValue(11371) },
      financialRecord: {
        count: vi
          .fn()
          .mockResolvedValueOnce(10501) // before
          .mockResolvedValueOnce(10501 + 3) // after
          .mockResolvedValueOnce(3) // historicalFinancialRecords
          .mockResolvedValueOnce(0), // skippedInDb (0 skipped sourceIds persisted)
        findMany: vi.fn().mockResolvedValue([]),
        createMany: createManyMock,
      },
      $transaction: vi.fn().mockImplementation(async (cb) => {
        return cb({ financialRecord: { createMany: createManyMock } });
      }),
    } as any;

    const res = await importHustlerFinancial(mockPrisma, {
      batchId: mockBatch.id,
      dryRun: false,
      chunkSize: 10,
    });

    expect(res.dryRun).toBe(false);
    expect(res.counts.created).toBe(3); // 3 importable records in mock
    expect(res.postValidation?.postCounts.productsUnchanged).toBe(true);
    expect(res.postValidation?.postCounts.salesUnchanged).toBe(true);
    expect(res.postValidation?.revenueValidation.commercialRevenueUnchanged).toBe(true);
    expect(res.postValidation?.skippedIntegrity.skippedSourceIdsPersisted).toBe(0);
  });

  it("5. validates idempotency: second persist with all records already existing creates 0 records", async () => {
    vi.spyOn(plannerModule, "planHustlerFinancialImport").mockResolvedValue(mockPlan);

    const existingInDb = [
      { id: "uuid-1", sourceId: "HUSTLER_LEGACY:FIN:1", sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP, importBatchId: mockBatch.id },
      { id: "uuid-2", sourceId: "HUSTLER_LEGACY:FIN:2", sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP, importBatchId: mockBatch.id },
      { id: "uuid-3", sourceId: "HUSTLER_LEGACY:FIN:3", sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP, importBatchId: mockBatch.id },
    ];

    const createManyMock = vi.fn();
    const mockPrisma = {
      historicalImportBatch: {
        findUnique: vi.fn().mockResolvedValue(mockBatch),
      },
      product: { count: vi.fn().mockResolvedValue(4792) },
      customer: { count: vi.fn().mockResolvedValue(2926) },
      sale: { count: vi.fn().mockResolvedValue(9789) },
      saleItem: { count: vi.fn().mockResolvedValue(46434) },
      saleSourceDocument: {
        count: vi.fn().mockResolvedValue(11200),
        aggregate: vi.fn().mockResolvedValue({ _sum: { netAmount: "1141693.14" } }),
      },
      saleSourceDocumentItem: { count: vi.fn().mockResolvedValue(49163) },
      historicalSourceIdentity: { count: vi.fn().mockResolvedValue(11371) },
      financialRecord: {
        count: vi
          .fn()
          .mockResolvedValueOnce(21595)
          .mockResolvedValueOnce(21595)
          .mockResolvedValueOnce(11094)
          .mockResolvedValueOnce(0),
        findMany: vi.fn().mockResolvedValue(existingInDb),
        createMany: createManyMock,
      },
      $transaction: vi.fn(),
    } as any;

    const res = await importHustlerFinancial(mockPrisma, {
      batchId: mockBatch.id,
      dryRun: false,
    });

    expect(res.counts.created).toBe(0);
    expect(res.counts.alreadyExisting).toBe(3);
    expect(createManyMock).not.toHaveBeenCalled();
  });
});
