import { describe, expect, it, vi, beforeEach } from "vitest";
import { SourceSystem, HistoricalImportBatchStatus } from "@prisma/client";
import {
  activateHustlerBatch,
  preflightHustlerActivation,
  EXPECTED_HUSTLER_BATCH_ID,
} from "../src/modules/historical/hustler/hustler-activator.js";
import * as plannerModule from "../src/modules/historical/hustler/hustler-financial-planner.js";

describe("Historical Hustler Activator Unit Tests (Phase 4S)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DATABASE_URL: `postgresql://postgres:pass@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?search_path=${plannerModule.DEV_PROJECT_REF}`,
      DIRECT_URL: `postgresql://postgres:pass@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?search_path=${plannerModule.DEV_PROJECT_REF}`,
    };
  });

  function createMockPrisma(batchOverrides: any = {}, countOverrides: any = {}) {
    const mockBatch = {
      id: EXPECTED_HUSTLER_BATCH_ID,
      companyId: "company-1",
      sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
      status: HistoricalImportBatchStatus.STAGED,
      recordsImported: 69181,
      recordsRejected: 0,
      metadata: {},
      createdAt: new Date("2026-11-03T20:00:00.000Z"),
      activatedAt: null,
      ...batchOverrides,
    };

    const mockPrisma = {
      historicalImportBatch: {
        findUnique: vi.fn().mockResolvedValue(mockBatch),
        update: vi.fn().mockImplementation(async ({ data }) => {
          return {
            ...mockBatch,
            ...data,
          };
        }),
      },
      product: { count: vi.fn().mockResolvedValue(countOverrides.products ?? 4792) },
      customer: { count: vi.fn().mockResolvedValue(countOverrides.customers ?? 2926) },
      sale: {
        count: vi.fn().mockImplementation(async ({ where }: any = {}) => {
          if (where?.sourceSystem === SourceSystem.HUSTLER_LEGACY_DUMP) {
            return countOverrides.legacySales ?? 6307;
          }
          if (where?.sourceSystem === SourceSystem.TAGPLUS_CURRENT && where?.operationUnit === "HUSTLER") {
            return countOverrides.currentLevelASales ?? 9;
          }
          if (where?.sourceSystem === SourceSystem.TAGPLUS_CURRENT && where?.operationUnit === null) {
            return countOverrides.unassignedCurrentSales ?? 3473;
          }
          return countOverrides.sales ?? 9789;
        }),
        aggregate: vi.fn().mockImplementation(async ({ where }: any = {}) => {
          if (where?.sourceSystem === SourceSystem.HUSTLER_LEGACY_DUMP) {
            return { _sum: { netAmount: "1141693.14" } };
          }
          if (where?.sourceSystem === SourceSystem.TAGPLUS_CURRENT && where?.operationUnit === "HUSTLER") {
            return { _sum: { netAmount: "2819.60" } };
          }
          return { _sum: { netAmount: "6909852.93" } };
        }),
      },
      saleItem: { count: vi.fn().mockResolvedValue(countOverrides.saleItems ?? 46434) },
      saleSourceDocument: { count: vi.fn().mockResolvedValue(countOverrides.ssds ?? 11200) },
      saleSourceDocumentItem: { count: vi.fn().mockResolvedValue(countOverrides.ssdis ?? 49163) },
      historicalSourceIdentity: { count: vi.fn().mockResolvedValue(countOverrides.hsis ?? 11371) },
      financialRecord: {
        count: vi.fn().mockImplementation(async ({ where }: any = {}) => {
          if (where?.importBatchId === EXPECTED_HUSTLER_BATCH_ID) {
            if (where?.type === "SAIDA") {
              if (where?.budgetPlanSourceId === "19") return countOverrides.apCount ?? 814;
              if (where?.NOT?.budgetPlanSourceId === "19") return countOverrides.opexCount ?? 1317;
            }
            return countOverrides.hustlerFinancialRecords ?? 11094;
          }
          return countOverrides.financialRecords ?? 21595;
        }),
        aggregate: vi.fn().mockImplementation(async ({ where }: any = {}) => {
          if (where?.importBatchId === EXPECTED_HUSTLER_BATCH_ID) {
            if (where?.type === "SAIDA") {
              if (where?.budgetPlanSourceId === "19") return { _sum: { originalAmount: "597884.46" } };
              if (where?.NOT?.budgetPlanSourceId === "19") return { _sum: { originalAmount: "487874.99" } };
            }
            return { _sum: { originalAmount: "2200271.78" } };
          }
          return { _sum: { originalAmount: "10395699.48" } };
        }),
      },
    };

    return { mockPrisma, mockBatch };
  }

  it("blocks activation if production database is detected", async () => {
    process.env.DATABASE_URL = `postgresql://postgres:pass@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?search_path=${plannerModule.PRODUCTION_PROJECT_REF}`;
    const { mockPrisma } = createMockPrisma();

    await expect(preflightHustlerActivation(mockPrisma as any)).rejects.toThrow(
      /FATAL: Production database detected/,
    );
  });

  it("passes preflight when all canonical numbers match truth set exactly", async () => {
    const { mockPrisma } = createMockPrisma();
    const result = await preflightHustlerActivation(mockPrisma as any);

    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.counts.products).toBe(4792);
    expect(result.counts.customers).toBe(2926);
    expect(result.counts.sales).toBe(9789);
    expect(result.historicalCommercial.salesCount).toBe(6307);
    expect(result.historicalCommercial.revenue).toBe(1141693.14);
    expect(result.historicalFinancial.recordsCount).toBe(11094);
    expect(result.historicalFinancial.totalAmount).toBe(2200271.78);
    expect(result.factualHustler.combinedSales).toBe(6316);
    expect(result.factualHustler.combinedRevenue).toBe(1144512.74);
  });

  it("fails preflight when canonical count diverges", async () => {
    const { mockPrisma } = createMockPrisma({}, { sales: 9780 });
    const result = await preflightHustlerActivation(mockPrisma as any);

    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes("Expected 9789 sales"))).toBe(true);
  });

  it("successfully activates batch from STAGED to ACTIVATED", async () => {
    const { mockPrisma } = createMockPrisma();
    const result = await activateHustlerBatch(mockPrisma as any);

    expect(result.success).toBe(true);
    expect(result.alreadyActivated).toBe(false);
    expect(result.previousStatus).toBe(HistoricalImportBatchStatus.STAGED);
    expect(result.currentStatus).toBe(HistoricalImportBatchStatus.ACTIVATED);
    expect(result.activatedAt).toBeInstanceOf(Date);
    expect(mockPrisma.historicalImportBatch.update).toHaveBeenCalledTimes(1);
    const updateArgs = mockPrisma.historicalImportBatch.update.mock.calls[0][0];
    expect(updateArgs.data.status).toBe(HistoricalImportBatchStatus.ACTIVATED);
    expect(updateArgs.data.activatedAt).toBeDefined();
    expect(updateArgs.data.metadata.finalActivation).toBeDefined();
  });

  it("is idempotent: re-executing activation returns alreadyActivated: true without duplicate updates", async () => {
    const activatedDate = new Date("2026-11-08T21:40:00.000Z");
    const { mockPrisma } = createMockPrisma({
      status: HistoricalImportBatchStatus.ACTIVATED,
      activatedAt: activatedDate,
    });

    const result = await activateHustlerBatch(mockPrisma as any);

    expect(result.success).toBe(true);
    expect(result.alreadyActivated).toBe(true);
    expect(result.previousStatus).toBe(HistoricalImportBatchStatus.ACTIVATED);
    expect(result.currentStatus).toBe(HistoricalImportBatchStatus.ACTIVATED);
    expect(result.activatedAt).toEqual(activatedDate);
    expect(mockPrisma.historicalImportBatch.update).not.toHaveBeenCalled();
  });
});
