import { describe, it, expect, vi } from "vitest";
import { PrismaClient, SourceSystem, SaleAnchorType, OperationUnit } from "@prisma/client";
import {
  assertSafeDatabaseUrl,
  planCurrentHustlerAttribution,
  persistCurrentHustlerAttribution,
  validateCombinedHustlerTruthSet,
  TargetCurrentSale,
  CurrentHustlerAttributionPlan,
} from "../src/modules/historical/hustler/hustler-current-persister.js";

describe("Historical Hustler Current OperationUnit Persistence (Phase 4M)", () => {
  describe("1. Environment & Production Guard", () => {
    it("1. blocks production database URL in DATABASE_URL", () => {
      expect(() => {
        assertSafeDatabaseUrl("postgresql://postgres:pass@szahricoqxzckjytpnmg.supabase.co:5432/postgres");
      }).toThrow(/FATAL: Production database detected/);
    });

    it("2. blocks production database URL in DIRECT_URL", () => {
      expect(() => {
        assertSafeDatabaseUrl(
          "postgresql://postgres:pass@pkjdzlfxsxulfkzksrow.supabase.co:5432/postgres",
          "postgresql://postgres:pass@szahricoqxzckjytpnmg.supabase.co:5432/postgres",
        );
      }).toThrow(/FATAL: Production database detected/);
    });

    it("3. blocks unknown database URL that is not DEV ref", () => {
      expect(() => {
        assertSafeDatabaseUrl("postgresql://postgres:pass@randomdbref.supabase.co:5432/postgres");
      }).toThrow(/does not point to tagpulse-historical-dev/);
    });

    it("4. accepts DEV database URL", () => {
      expect(() => {
        assertSafeDatabaseUrl("postgresql://postgres:pass@pkjdzlfxsxulfkzksrow.supabase.co:5432/postgres");
      }).not.toThrow();
    });
  });

  describe("2. Plan & Attribution Isolation", () => {
    it("5. only includes LEVEL_A CONSUMIDOR HUSTLER in targetSales and excludes LEVEL_C", async () => {
      const mockSales = [
        // Target: CONSUMIDOR HUSTLER (LEVEL A)
        {
          id: "sale-hustler-1",
          anchorType: SaleAnchorType.VENDA_SIMPLES,
          anchorSourceId: "101",
          commercialDate: new Date("2026-06-03"),
          customerId: "cust-1",
          operationUnit: null,
          sourceSystem: SourceSystem.TAGPLUS_CURRENT,
          customer: {
            id: "cust-1",
            tradeName: "CONSUMIDOR HUSTLER",
            legalName: null,
            cnpj: null,
            cpf: null,
          },
          sourceDocs: [
            {
              id: "doc-1",
              sourceId: "101",
              docType: SaleAnchorType.VENDA_SIMPLES,
              netAmount: "300.00",
              realizedDate: new Date("2026-06-03"),
            },
          ],
          items: [
            {
              productId: "prod-1",
              product: { description: "Lixa Skate" },
            },
          ],
        },
        // Non-target: Retail customer with skate shoes (LEVEL C Heuristic)
        {
          id: "sale-heuristic-1",
          anchorType: SaleAnchorType.VENDA_SIMPLES,
          anchorSourceId: "102",
          commercialDate: new Date("2026-06-05"),
          customerId: "cust-2",
          operationUnit: null,
          sourceSystem: SourceSystem.TAGPLUS_CURRENT,
          customer: {
            id: "cust-2",
            tradeName: null,
            legalName: "JOAO SILVA",
            cnpj: null,
            cpf: "12345678900",
          },
          sourceDocs: [
            {
              id: "doc-2",
              sourceId: "102",
              docType: SaleAnchorType.VENDA_SIMPLES,
              netAmount: "450.00",
              realizedDate: new Date("2026-06-05"),
            },
          ],
          items: [
            {
              productId: "prod-2",
              product: { description: "Tenis DC Shoes Kalis S" },
            },
          ],
        },
        // Non-target: Wholesale B2B Nineclouds (LEVEL A Nineclouds)
        {
          id: "sale-nineclouds-1",
          anchorType: SaleAnchorType.PEDIDO,
          anchorSourceId: "103",
          commercialDate: new Date("2026-06-10"),
          customerId: "cust-3",
          operationUnit: null,
          sourceSystem: SourceSystem.TAGPLUS_CURRENT,
          customer: {
            id: "cust-3",
            tradeName: "SKATE SHOP LTDA",
            legalName: "SKATE SHOP LTDA",
            cnpj: "12345678000199",
            cpf: null,
          },
          sourceDocs: [
            {
              id: "doc-3",
              sourceId: "103",
              docType: SaleAnchorType.NFE,
              netAmount: "2500.00",
              realizedDate: new Date("2026-06-10"),
            },
          ],
          items: [
            {
              productId: "prod-3",
              product: { description: "Shape Nineclouds Maple 8.0" },
            },
          ],
        },
      ];

      const mockPrisma = {
        historicalSourceIdentity: {
          findMany: vi.fn().mockResolvedValue([{ canonicalEntityId: "prod-2" }]),
        },
        product: {
          findMany: vi.fn().mockResolvedValue([
            { id: "prod-1", sourceId: "p1", description: "Lixa Skate", categoryDescription: null, brand: null },
            { id: "prod-2", sourceId: "p2", description: "Tenis DC Shoes Kalis S", categoryDescription: "Tenis", brand: "DC" },
            { id: "prod-3", sourceId: "p3", description: "Shape Nineclouds Maple 8.0", categoryDescription: "Shape", brand: "Nineclouds" },
          ]),
        },
        sale: {
          findMany: vi.fn().mockResolvedValue(mockSales),
        },
      } as unknown as PrismaClient;

      const plan = await planCurrentHustlerAttribution(mockPrisma);

      expect(plan.totalCurrentSales).toBe(3);
      expect(plan.targetSales.length).toBe(1);
      expect(plan.targetSales[0].id).toBe("sale-hustler-1");
      expect(plan.targetSales[0].evidenceLevel).toBe("LEVEL_A");
      expect(plan.targetSales[0].customerName).toBe("CONSUMIDOR HUSTLER");
      expect(plan.targetSales[0].netAmount).toBe(300);

      // Verify LEVEL_C heuristic is excluded from targetSales
      expect(plan.levelCExcludedCount).toBe(1);
      expect(plan.levelCExcludedRevenue).toBe(450);
      expect(plan.targetSales.some((t) => t.id === "sale-heuristic-1")).toBe(false);
      expect(plan.targetSales.some((t) => t.id === "sale-nineclouds-1")).toBe(false);
    });
  });

  describe("3. Write Contract & Idempotency", () => {
    it("6. updates strictly operationUnit and leaves all other fields intact", async () => {
      const mockTarget: TargetCurrentSale = {
        id: "sale-target-1",
        anchorType: SaleAnchorType.VENDA_SIMPLES,
        anchorSourceId: "201",
        commercialDate: new Date("2026-06-03"),
        customerId: "cust-1",
        customerName: "CONSUMIDOR HUSTLER",
        netAmount: 300,
        currentOperationUnit: null,
        targetOperationUnit: OperationUnit.HUSTLER,
        evidenceLevel: "LEVEL_A",
        status: "PENDING_UPDATE",
      };

      const plan: CurrentHustlerAttributionPlan = {
        totalCurrentSales: 3482,
        totalCurrentRevenue: 5928239.09,
        targetSales: [mockTarget],
        pendingUpdates: [mockTarget],
        alreadyCorrect: [],
        conflicts: [],
        levelCExcludedCount: 50,
        levelCExcludedRevenue: 11204.72,
        targetSalesCount: 1,
        targetRevenue: 300,
        allTargetsLevelA: true,
        allTargetsCurrentlyNullOrHustler: true,
        preflightPassed: true,
      };

      const updateMock = vi.fn().mockResolvedValue({});
      const mockPrisma = {
        $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
          return cb({
            sale: {
              update: updateMock,
            },
          });
        }),
      } as unknown as PrismaClient;

      const result = await persistCurrentHustlerAttribution(mockPrisma, plan, true);

      expect(result.updated).toBe(1);
      expect(result.alreadyCorrect).toBe(1);
      expect(result.conflicts).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.isPersist).toBe(true);

      // Verify write contract: strictly operationUnit
      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(updateMock).toHaveBeenCalledWith({
        where: { id: "sale-target-1" },
        data: { operationUnit: OperationUnit.HUSTLER },
      });
    });

    it("7. behaves idempotently on second run with updated = 0", async () => {
      const mockTarget: TargetCurrentSale = {
        id: "sale-target-1",
        anchorType: SaleAnchorType.VENDA_SIMPLES,
        anchorSourceId: "201",
        commercialDate: new Date("2026-06-03"),
        customerId: "cust-1",
        customerName: "CONSUMIDOR HUSTLER",
        netAmount: 300,
        currentOperationUnit: OperationUnit.HUSTLER,
        targetOperationUnit: OperationUnit.HUSTLER,
        evidenceLevel: "LEVEL_A",
        status: "ALREADY_HUSTLER",
      };

      const plan: CurrentHustlerAttributionPlan = {
        totalCurrentSales: 3482,
        totalCurrentRevenue: 5928239.09,
        targetSales: [mockTarget],
        pendingUpdates: [], // already correct!
        alreadyCorrect: [mockTarget],
        conflicts: [],
        levelCExcludedCount: 50,
        levelCExcludedRevenue: 11204.72,
        targetSalesCount: 1,
        targetRevenue: 300,
        allTargetsLevelA: true,
        allTargetsCurrentlyNullOrHustler: true,
        preflightPassed: true,
      };

      const updateMock = vi.fn();
      const mockPrisma = {
        $transaction: vi.fn(),
      } as unknown as PrismaClient;

      const result = await persistCurrentHustlerAttribution(mockPrisma, plan, true);

      expect(result.updated).toBe(0);
      expect(result.alreadyCorrect).toBe(1);
      expect(result.conflicts).toBe(0);
      expect(result.idempotent).toBe(true);
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("8. dry-run mode performs zero database updates", async () => {
      const mockTarget: TargetCurrentSale = {
        id: "sale-target-1",
        anchorType: SaleAnchorType.VENDA_SIMPLES,
        anchorSourceId: "201",
        commercialDate: new Date("2026-06-03"),
        customerId: "cust-1",
        customerName: "CONSUMIDOR HUSTLER",
        netAmount: 300,
        currentOperationUnit: null,
        targetOperationUnit: OperationUnit.HUSTLER,
        evidenceLevel: "LEVEL_A",
        status: "PENDING_UPDATE",
      };

      const plan: CurrentHustlerAttributionPlan = {
        totalCurrentSales: 3482,
        totalCurrentRevenue: 5928239.09,
        targetSales: [mockTarget],
        pendingUpdates: [mockTarget],
        alreadyCorrect: [],
        conflicts: [],
        levelCExcludedCount: 50,
        levelCExcludedRevenue: 11204.72,
        targetSalesCount: 1,
        targetRevenue: 300,
        allTargetsLevelA: true,
        allTargetsCurrentlyNullOrHustler: true,
        preflightPassed: true,
      };

      const mockPrisma = {
        $transaction: vi.fn(),
      } as unknown as PrismaClient;

      const result = await persistCurrentHustlerAttribution(mockPrisma, plan, false);

      expect(result.isPersist).toBe(false);
      expect(result.updated).toBe(0);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("4. Sync Contract & Combined Truth-Set", () => {
    it("9. verifies that future sync update contract preserves operationUnit", () => {
      // In sales-repository.ts, tx.sale.upsert only touches:
      const allowedUpdateFields = [
        "netAmount",
        "customerId",
        "sourceCreatedAt",
        "sourceConfirmedAt",
        "sourceEmissaoAt",
        "commercialDate",
      ];

      expect(allowedUpdateFields).not.toContain("operationUnit");
      expect(allowedUpdateFields).not.toContain("sourceSystem");
      expect(allowedUpdateFields).not.toContain("salesChannel");
    });

    it("10. calculates exact combined factual Hustler truth-set (6.316 sales / R$ 1.144.512,74)", async () => {
      const mockPrisma = {
        sale: {
          findMany: vi
            .fn()
            // 1st call: Legacy Hustler
            .mockResolvedValueOnce([
              { id: "leg-1", netAmount: "1141693.14", commercialDate: new Date("2026-06-01") },
            ])
            // 2nd call: Current Factual Hustler
            .mockResolvedValueOnce([
              { id: "cur-1", netAmount: "2819.60", commercialDate: new Date("2026-06-03") },
            ]),
        },
      } as unknown as PrismaClient;

      const combined = await validateCombinedHustlerTruthSet(mockPrisma);

      expect(combined.legacyCount).toBe(1);
      expect(combined.legacyRevenue).toBe(1141693.14);
      expect(combined.currentCount).toBe(1);
      expect(combined.currentRevenue).toBe(2819.6);
      expect(combined.combinedCount).toBe(2);
      expect(combined.combinedRevenue).toBe(1144512.74);
      expect(combined.legacyLatest).toEqual(new Date("2026-06-01"));
      expect(combined.currentEarliest).toEqual(new Date("2026-06-03"));
      expect(combined.exactDuplicates).toBe(0);
      expect(combined.probableDuplicates).toBe(0);
    });
  });
});
