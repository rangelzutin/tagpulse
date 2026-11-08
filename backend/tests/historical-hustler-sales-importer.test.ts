import { describe, expect, it, vi } from "vitest";
import { Prisma, SaleAnchorType, SourceSystem, HistoricalImportBatchStatus } from "@prisma/client";
import { importHustlerSales } from "../src/modules/historical/hustler/hustler-sales-importer.js";

describe("Historical Hustler Sales Importer Unit Tests (Phase 4I)", () => {
  const mockPlan = {
    batchId: "batch-1",
    companyId: "company-1",
    connectionId: "conn-1",
    summary: {
      totalLegacyVendas: 6329,
      activeVendas: 6318,
      cancelledVendas: 11,
      quarantinedVendas: 11,
      importableSales: 6307,
      totalActiveRevenue: 1144706.74,
      importableRevenue: 1141693.14,
      quarantinedRevenue: 3013.6,
      salesWithCanonicalCustomer: 3179,
      salesWithGenericCustomer: 3070,
      salesWithBlankCustomer: 58,
      unresolvedCustomerCount: 0,
      totalPlannedSaleItems: 11167,
      resolvedProductItems: 11167,
      unresolvedProductItems: 0,
      plannedSaleSourceDocuments: 6307,
      nfeRealizationCount: 980,
      vsRealizationCount: 5327,
      nfeFallbackToVsCount: 3,
      multipleRealizationConflicts: 0,
      plannedSsdiCount: 11167,
      nfeSsdiCount: 1843,
      vsSsdiCount: 9324,
      salesWithCustomerFreight: 31,
      totalCustomerFreight: 658.15,
      plannedSaleRevenue: 1141693.14,
      plannedIdentitiesCount: 6307,
      saleSourceIdCollisions: 0,
      saleIdentityCollisions: 0,
      accessKeyCollisions: 0,
      documentCollisions: 0,
    },
    plannedSales: [
      {
        legacyVendaId: "1001",
        anchorType: SaleAnchorType.NFE,
        anchorSourceId: "HUSTLER_LEGACY:1001",
        canonicalCustomerId: "cust-uuid-1",
        customerType: "CANONICAL",
        netAmount: new Prisma.Decimal("150.00"),
        commercialDate: new Date("2024-05-10T10:00:00Z"),
        sourceCreatedAt: new Date("2024-05-10T10:00:00Z"),
        sourceConfirmedAt: new Date("2024-05-10T10:00:00Z"),
        sourceEmissaoAt: new Date("2024-05-10T10:05:00Z"),
        customerFreightAmount: null,
        items: [
          {
            legacyItemId: "item-1",
            lineNumber: 1,
            sourceItemId: "HUSTLER_LEGACY:item-1",
            legacyProductId: "prod-leg-1",
            canonicalProductId: "prod-uuid-1",
            quantity: new Prisma.Decimal("1"),
            unitPrice: new Prisma.Decimal("150.00"),
            discountAmount: null,
            subtotal: new Prisma.Decimal("150.00"),
          },
        ],
        realizationDoc: {
          docType: SaleAnchorType.NFE,
          sourceId: "HUSTLER_LEGACY:1001",
          netAmount: new Prisma.Decimal("150.00"),
          sourceDocumentNumber: "123",
          accessKey: "35230417105605000140550010000000011234567890",
          series: "1",
          sourceCreatedAt: new Date("2024-05-10T10:00:00Z"),
          sourceEmissaoAt: new Date("2024-05-10T10:05:00Z"),
          realizedDate: new Date("2024-05-10T10:05:00Z"),
          sourcePresent: true,
          items: [
            {
              legacyItemId: "item-1",
              lineNumber: 1,
              sourceItemId: "HUSTLER_LEGACY:item-1",
              legacyProductId: "prod-leg-1",
              canonicalProductId: "prod-uuid-1",
              quantity: new Prisma.Decimal("1"),
              unitPrice: new Prisma.Decimal("150.00"),
              discountAmount: null,
              subtotal: new Prisma.Decimal("150.00"),
            },
          ],
        },
        isFallbackToVs: false,
      },
    ],
    plannedIdentities: [
      {
        sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
        sourceEntity: "venda",
        sourcePrimaryKey: "1001",
        canonicalEntityType: "Sale",
      },
    ],
    quarantinedSales: [],
    cancelledSales: [],
    samples: {},
  };

  vi.mock("../src/modules/historical/hustler/hustler-sales-planner.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../src/modules/historical/hustler/hustler-sales-planner.js")>();
    return {
      ...actual,
      planHustlerSalesImport: vi.fn(),
    };
  });

  it("1. aborts if batch is not found or not in STAGED status", async () => {
    const mockPrisma = {
      historicalImportBatch: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as unknown as any;

    await expect(
      importHustlerSales(mockPrisma, { batchId: "nonexistent" })
    ).rejects.toThrow(/not found/);

    const mockPrismaNotStaged = {
      historicalImportBatch: {
        findUnique: vi.fn().mockResolvedValue({
          id: "batch-1",
          sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
          status: HistoricalImportBatchStatus.COMPLETED,
        }),
      },
    } as unknown as any;

    await expect(
      importHustlerSales(mockPrismaNotStaged, { batchId: "batch-1" })
    ).rejects.toThrow(/must be in STAGED status/);
  });

  it("2. aborts if pre-flight planned metrics diverge from Phase 4H specifications", async () => {
    const { planHustlerSalesImport } = await import(
      "../src/modules/historical/hustler/hustler-sales-planner.js"
    );

    const divergentPlan = {
      ...mockPlan,
      summary: {
        ...mockPlan.summary,
        importableSales: 6300, // divergent!
      },
    };

    vi.mocked(planHustlerSalesImport).mockResolvedValueOnce(divergentPlan as any);

    const mockPrisma = {
      historicalImportBatch: {
        findUnique: vi.fn().mockResolvedValue({
          id: "batch-1",
          sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
          status: HistoricalImportBatchStatus.STAGED,
        }),
      },
      historicalSourceIdentity: {
        count: vi.fn().mockResolvedValue(0),
      },
    } as unknown as any;

    await expect(
      importHustlerSales(mockPrisma, { batchId: "batch-1" })
    ).rejects.toThrow(/PREFLIGHT FAILED/);
  });

  it("3. executes dry-run simulation without invoking any DB write operations", async () => {
    const { planHustlerSalesImport } = await import(
      "../src/modules/historical/hustler/hustler-sales-planner.js"
    );
    vi.mocked(planHustlerSalesImport).mockResolvedValueOnce(mockPlan as any);

    const mockPrisma = {
      historicalImportBatch: {
        findUnique: vi.fn().mockResolvedValue({
          id: "batch-1",
          sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
          status: HistoricalImportBatchStatus.STAGED,
        }),
      },
      product: {
        findMany: vi.fn().mockResolvedValue([{ id: "prod-uuid-1", sourceId: "HUSTLER_LEGACY:prod-leg-1" }]),
      },
      historicalSourceIdentity: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      sale: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        createMany: vi.fn(),
      },
      saleItem: { createMany: vi.fn() },
      saleSourceDocument: { createMany: vi.fn() },
      saleSourceDocumentItem: { createMany: vi.fn() },
    } as unknown as any;

    const res = await importHustlerSales(mockPrisma, {
      batchId: "batch-1",
      dryRun: true,
    });

    expect(res.dryRun).toBe(true);
    expect(res.preflight.preflightPassed).toBe(true);
    expect(res.counts.salesCreated).toBe(1);
    expect(res.counts.saleItemsCreated).toBe(1);
    expect(res.counts.ssdCreated).toBe(1);
    expect(res.counts.ssdiCreated).toBe(1);
    expect(res.counts.identitiesCreated).toBe(1);
    expect(mockPrisma.sale.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.saleItem.createMany).not.toHaveBeenCalled();
  });

  it("4. persists atomic Sale graph and handles idempotency on rerun", async () => {
    const { planHustlerSalesImport } = await import(
      "../src/modules/historical/hustler/hustler-sales-planner.js"
    );
    vi.mocked(planHustlerSalesImport).mockResolvedValue(mockPlan as any);

    let dbSales: any[] = [];
    let dbIdentities: any[] = [];

    const mockTx = {
      sale: {
        createMany: vi.fn().mockImplementation(({ data }) => {
          dbSales.push(...data);
          return Promise.resolve({ count: data.length });
        }),
      },
      saleItem: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      saleSourceDocument: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      saleSourceDocumentItem: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      historicalSourceIdentity: {
        createMany: vi.fn().mockImplementation(({ data }) => {
          dbIdentities.push(...data);
          return Promise.resolve({ count: data.length });
        }),
      },
    };

    const mockPrisma = {
      historicalImportBatch: {
        findUnique: vi.fn().mockResolvedValue({
          id: "batch-1",
          sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
          status: HistoricalImportBatchStatus.STAGED,
        }),
      },
      product: {
        findMany: vi.fn().mockResolvedValue([{ id: "prod-uuid-1", sourceId: "HUSTLER_LEGACY:prod-leg-1" }]),
        count: vi.fn().mockResolvedValue(4792),
      },
      customer: { count: vi.fn().mockResolvedValue(2926) },
      historicalSourceIdentity: {
        findMany: vi.fn().mockImplementation(() => Promise.resolve(dbIdentities.map(i => ({
          sourcePrimaryKey: i.sourcePrimaryKey,
          canonicalEntityId: i.canonicalEntityId,
        })))),
        count: vi.fn().mockImplementation(() => Promise.resolve(dbIdentities.length)),
      },
      sale: {
        findMany: vi.fn().mockImplementation(() => Promise.resolve(dbSales.map(s => ({
          id: s.id,
          anchorSourceId: s.anchorSourceId,
        })))),
        count: vi.fn().mockResolvedValue(9789),
        aggregate: vi.fn().mockResolvedValue({
          _min: { commercialDate: new Date("2014-10-01") },
          _max: { commercialDate: new Date("2026-06-01") },
        }),
      },
      saleItem: { count: vi.fn().mockResolvedValue(46434) },
      saleSourceDocument: {
        count: vi.fn().mockResolvedValue(11200),
        aggregate: vi.fn().mockResolvedValue({ _sum: { netAmount: new Prisma.Decimal("1141693.14") } }),
        findMany: vi.fn().mockResolvedValue([]),
        groupBy: vi.fn().mockResolvedValue([]),
      },
      saleSourceDocumentItem: { count: vi.fn().mockResolvedValue(49163) },
      financialRecord: { count: vi.fn().mockResolvedValue(10501) },
      $transaction: vi.fn().mockImplementation((fn) => fn(mockTx)),
    } as unknown as any;

    // First persistence run
    const res1 = await importHustlerSales(mockPrisma, {
      batchId: "batch-1",
      dryRun: false,
    });

    expect(res1.counts.salesCreated).toBe(1);
    expect(res1.counts.saleItemsCreated).toBe(1);
    expect(res1.counts.ssdCreated).toBe(1);
    expect(res1.counts.ssdiCreated).toBe(1);
    expect(res1.counts.identitiesCreated).toBe(1);
    expect(res1.counts.skippedExisting).toBe(0);

    // Second persistence run (Idempotency test)
    const res2 = await importHustlerSales(mockPrisma, {
      batchId: "batch-1",
      dryRun: false,
    });

    expect(res2.counts.salesCreated).toBe(0);
    expect(res2.counts.saleItemsCreated).toBe(0);
    expect(res2.counts.ssdCreated).toBe(0);
    expect(res2.counts.ssdiCreated).toBe(0);
    expect(res2.counts.identitiesCreated).toBe(0);
    expect(res2.counts.skippedExisting).toBe(1);
  });

  it("5. aborts on identity conflict if existing identity points to different Sale id", async () => {
    const { planHustlerSalesImport } = await import(
      "../src/modules/historical/hustler/hustler-sales-planner.js"
    );
    vi.mocked(planHustlerSalesImport).mockResolvedValueOnce(mockPlan as any);

    const mockPrisma = {
      historicalImportBatch: {
        findUnique: vi.fn().mockResolvedValue({
          id: "batch-1",
          sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
          status: HistoricalImportBatchStatus.STAGED,
        }),
      },
      product: { findMany: vi.fn().mockResolvedValue([]) },
      historicalSourceIdentity: {
        findMany: vi.fn().mockResolvedValue([
          { sourcePrimaryKey: "1001", canonicalEntityId: "sale-uuid-DIFFERENT" },
        ]),
        count: vi.fn().mockResolvedValue(0),
      },
      sale: {
        findMany: vi.fn().mockResolvedValue([
          { id: "sale-uuid-ORIGINAL", anchorSourceId: "HUSTLER_LEGACY:1001" },
        ]),
      },
    } as unknown as any;

    await expect(
      importHustlerSales(mockPrisma, { batchId: "batch-1", dryRun: true })
    ).rejects.toThrow(/CONFLICT/);
  });
});
