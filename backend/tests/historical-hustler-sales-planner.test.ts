import { describe, expect, it, vi } from "vitest";
import { Prisma, SaleAnchorType, SourceSystem } from "@prisma/client";
import {
  formatSaleSourceId,
  formatSaleItemSourceId,
  formatDocumentSourceId,
  parseLegacyDate,
  isNfeFallbackToVs,
  classifyCustomerForPlan,
  evaluateSaleRealization,
  planHustlerSalesImport,
} from "../src/modules/historical/hustler/hustler-sales-planner.js";

describe("Historical Hustler Sales Planner Unit Tests (Phase 4H)", () => {
  describe("1. Pure Helper & Deterministic Formats", () => {
    it("1. formats Sale sourceId deterministically using HUSTLER_LEGACY namespace", () => {
      expect(formatSaleSourceId("1001")).toBe("HUSTLER_LEGACY:1001");
      expect(formatSaleSourceId("42")).toBe("HUSTLER_LEGACY:42");
    });

    it("2. formats SaleItem sourceItemId deterministically using HUSTLER_LEGACY namespace", () => {
      expect(formatSaleItemSourceId("888")).toBe("HUSTLER_LEGACY:888");
      expect(formatSaleItemSourceId("999")).toBe("HUSTLER_LEGACY:999");
    });

    it("3. formats SaleSourceDocument sourceId deterministically", () => {
      expect(formatDocumentSourceId("1001")).toBe("HUSTLER_LEGACY:1001");
    });

    it("4. parses legacy datetime without timezone shift preserving civil date", () => {
      const d1 = parseLegacyDate("2024-05-15 14:30:00");
      expect(d1).toBeInstanceOf(Date);
      expect(d1?.toISOString()).toBe("2024-05-15T14:30:00.000Z");

      const d2 = parseLegacyDate("2024-05-15");
      expect(d2?.toISOString()).toBe("2024-05-15T00:00:00.000Z");

      expect(parseLegacyDate(null)).toBeNull();
      expect(parseLegacyDate("0000-00-00 00:00:00")).toBeNull();
      expect(parseLegacyDate("")).toBeNull();
    });
  });

  describe("2. Customer Semantic Mapping", () => {
    const customerMap = new Map<string, string>([
      ["10", "cust-canonical-uuid-10"],
      ["42", "cust-historical-uuid-42"],
    ]);

    it("5. maps registered canonical customer to canonical customerId", () => {
      const res = classifyCustomerForPlan("10", customerMap);
      expect(res.customerId).toBe("cust-canonical-uuid-10");
      expect(res.customerType).toBe("CANONICAL");
      expect(res.isResolved).toBe(true);
    });

    it("6. maps historical customer created in Phase 4G to canonical customerId", () => {
      const res = classifyCustomerForPlan("42", customerMap);
      expect(res.customerId).toBe("cust-historical-uuid-42");
      expect(res.customerType).toBe("CANONICAL");
      expect(res.isResolved).toBe(true);
    });

    it("7. maps generic 'Consumidor Hustler' (id_cliente = 1) to customerId = null", () => {
      const res = classifyCustomerForPlan("1", customerMap);
      expect(res.customerId).toBeNull();
      expect(res.customerType).toBe("GENERIC_CONSUMIDOR");
      expect(res.isResolved).toBe(true);
    });

    it("8. maps blank / 0 / null customer to customerId = null", () => {
      const res0 = classifyCustomerForPlan("0", customerMap);
      expect(res0.customerId).toBeNull();
      expect(res0.customerType).toBe("BLANK");
      expect(res0.isResolved).toBe(true);

      const resEmpty = classifyCustomerForPlan("", customerMap);
      expect(resEmpty.customerId).toBeNull();
      expect(resEmpty.customerType).toBe("BLANK");

      const resNull = classifyCustomerForPlan(null, customerMap);
      expect(resNull.customerId).toBeNull();
      expect(resNull.customerType).toBe("BLANK");
    });

    it("9. marks unmapped non-generic customer as unresolved", () => {
      const res = classifyCustomerForPlan("9999", customerMap);
      expect(res.isResolved).toBe(false);
      expect(res.customerId).toBeNull();
    });
  });

  describe("3. Realization Document Classification", () => {
    it("10. plans valid NF-e realization when valid 44-digit key is present", () => {
      const res = evaluateSaleRealization({
        legacyVendaId: "2000",
        nfeList: [
          {
            chave_acesso: "35230417105605000140550010000000011234567890",
          },
        ],
        nf: {
          numero_nota: "1234",
          serie: "1",
          data_emissao: "2024-06-01 10:00:00",
        },
        legacyDate: "2024-05-31 18:00:00",
      });

      expect(res.docType).toBe(SaleAnchorType.NFE);
      expect(res.accessKey).toBe("35230417105605000140550010000000011234567890");
      expect(res.documentNumber).toBe("1234");
      expect(res.series).toBe("1");
      expect(res.realizedDate).toBe("2024-06-01 10:00:00");
      expect(res.isFallback).toBe(false);
    });

    it("11. plans VENDA_SIMPLES realization when no NF-e is present", () => {
      const res = evaluateSaleRealization({
        legacyVendaId: "2001",
        nfeList: [],
        nf: undefined,
        legacyDate: "2024-05-31 18:00:00",
      });

      expect(res.docType).toBe(SaleAnchorType.VENDA_SIMPLES);
      expect(res.accessKey).toBeNull();
      expect(res.documentNumber).toBeNull();
      expect(res.series).toBeNull();
      expect(res.realizedDate).toBe("2024-05-31 18:00:00");
      expect(res.isFallback).toBe(false);
    });

    it("12. routes the 3 invalid NF-e vendas (1435, 1436, 1437) to VENDA_SIMPLES fallback", () => {
      for (const vid of ["1435", "1436", "1437"]) {
        expect(isNfeFallbackToVs(vid)).toBe(true);

        const res = evaluateSaleRealization({
          legacyVendaId: vid,
          nfeList: [
            {
              chave_acesso: "INVALID_KEY_123",
            },
          ],
          nf: { numero_nota: "999" },
          legacyDate: "2024-04-10 12:00:00",
        });

        expect(res.docType).toBe(SaleAnchorType.VENDA_SIMPLES);
        expect(res.accessKey).toBeNull();
        expect(res.documentNumber).toBeNull();
        expect(res.isFallback).toBe(true);
      }
    });

    it("13. guarantees single realization document per sale (no simultaneous NFE + VS)", () => {
      const resNfe = evaluateSaleRealization({
        legacyVendaId: "3000",
        nfeList: [{ chave_acesso: "35230417105605000140550010000000011234567890" }],
        nf: undefined,
        legacyDate: "2024-05-01 10:00:00",
      });
      const resVs = evaluateSaleRealization({
        legacyVendaId: "3001",
        nfeList: [],
        nf: undefined,
        legacyDate: "2024-05-01 10:00:00",
      });

      expect([SaleAnchorType.NFE, SaleAnchorType.VENDA_SIMPLES]).toContain(resNfe.docType);
      expect([SaleAnchorType.NFE, SaleAnchorType.VENDA_SIMPLES]).toContain(resVs.docType);
      expect(resNfe.docType).not.toBe(resVs.docType);
    });
  });

  describe("4. End-to-End Mocked Planner Invariants & Zero DB Writes", () => {
    it("14. planHustlerSalesImport executes in strict DRY-RUN without invoking any DB write operations", async () => {
      const mockPrisma = {
        historicalImportBatch: {
          findUnique: vi.fn().mockResolvedValue({
            id: "batch-1",
            companyId: "company-1",
            status: "STAGED",
            company: {
              tagPlusConnections: [{ id: "conn-1" }],
            },
          }),
        },
        historicalSourceIdentity: {
          findMany: vi.fn().mockResolvedValue([
            { sourceEntity: "cliente", sourcePrimaryKey: "10", canonicalEntityId: "canon-cust-10" },
            { sourceEntity: "produto_base", sourcePrimaryKey: "101", canonicalEntityId: "canon-prod-101" },
          ]),
          count: vi.fn().mockResolvedValue(0),
        },
        historicalStagingRow: {
          findMany: vi.fn().mockImplementation(({ where }) => {
            if (where.sourceTable === "venda") {
              return Promise.resolve([
                {
                  payload: {
                    id: "101",
                    id_cliente: "10",
                    id_nota_fiscal: "501",
                    cancelado: "0",
                    vr_total: "150.00",
                    vr_desconto: "0.00",
                    vr_acrescimo: "0.00",
                    data_hr_venda: "2025-01-10 10:00:00",
                  },
                },
                {
                  payload: {
                    id: "102",
                    id_cliente: "1", // generic
                    id_nota_fiscal: "502",
                    cancelado: "1", // cancelled
                    vr_total: "200.00",
                    data_hr_venda: "2025-01-10 11:00:00",
                  },
                },
              ]);
            }
            if (where.sourceTable === "nota_fiscal") {
              return Promise.resolve([
                {
                  payload: {
                    id: "501",
                    numero_nota: "123",
                    serie: "1",
                    data_emissao: "2025-01-10 10:05:00",
                    vr_frete: "0.00",
                  },
                },
              ]);
            }
            if (where.sourceTable === "nota_fiscal_lancamento") {
              return Promise.resolve([
                {
                  payload: {
                    id: "9001",
                    id_nota_fiscal: "501",
                    id_produto: "101",
                    quantidade: "2",
                    vr_produto: "75.00",
                    vr_subtotal: "150.00",
                  },
                },
              ]);
            }
            if (where.sourceTable === "nfe") {
              return Promise.resolve([
                {
                  payload: {
                    id_nota_fiscal: "501",
                    chave_acesso: "35230417105605000140550010000000011234567890",
                  },
                },
              ]);
            }
            return Promise.resolve([]);
          }),
        },
        sale: {
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
        saleSourceDocument: {
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
        saleItem: {
          create: vi.fn(),
        },
        saleSourceDocumentItem: {
          create: vi.fn(),
        },
      } as unknown as any;

      const plan = await planHustlerSalesImport(mockPrisma, "batch-1");

      // Verify ZERO DB writes
      expect(mockPrisma.sale.create).not.toHaveBeenCalled();
      expect(mockPrisma.sale.update).not.toHaveBeenCalled();
      expect(mockPrisma.sale.delete).not.toHaveBeenCalled();
      expect(mockPrisma.saleSourceDocument.create).not.toHaveBeenCalled();
      expect(mockPrisma.saleItem.create).not.toHaveBeenCalled();
      expect(mockPrisma.saleSourceDocumentItem.create).not.toHaveBeenCalled();

      // Verify Plan output
      expect(plan.summary.totalLegacyVendas).toBe(2);
      expect(plan.summary.activeVendas).toBe(1);
      expect(plan.summary.cancelledVendas).toBe(1);
      expect(plan.summary.importableSales).toBe(1);
      expect(plan.summary.importableRevenue).toBe(150.0);
      expect(plan.summary.salesWithCanonicalCustomer).toBe(1);
      expect(plan.summary.totalPlannedSaleItems).toBe(1);
      expect(plan.summary.resolvedProductItems).toBe(1);
      expect(plan.summary.unresolvedProductItems).toBe(0);
      expect(plan.summary.nfeRealizationCount).toBe(1);
      expect(plan.summary.vsRealizationCount).toBe(0);

      // Verify Sale details
      const plannedSale = plan.plannedSales[0];
      expect(plannedSale.legacyVendaId).toBe("101");
      expect(plannedSale.anchorSourceId).toBe("HUSTLER_LEGACY:101");
      expect(plannedSale.canonicalCustomerId).toBe("canon-cust-10");
      expect(plannedSale.netAmount).toEqual(new Prisma.Decimal("150.0000"));
      expect(plannedSale.items.length).toBe(1);
      expect(plannedSale.items[0].canonicalProductId).toBe("canon-prod-101");
      expect(plannedSale.realizationDoc.docType).toBe(SaleAnchorType.NFE);
      expect(plannedSale.realizationDoc.accessKey).toBe(
        "35230417105605000140550010000000011234567890"
      );

      // Verify Identity
      expect(plan.plannedIdentities.length).toBe(1);
      expect(plan.plannedIdentities[0]).toEqual({
        sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
        sourceEntity: "venda",
        sourcePrimaryKey: "101",
        canonicalEntityType: "Sale",
      });
    });

    it("15. excludes quarantined sales from plannedSales and accounts for quarantined revenue", async () => {
      const mockPrisma = {
        historicalImportBatch: {
          findUnique: vi.fn().mockResolvedValue({
            id: "batch-1",
            companyId: "company-1",
            status: "STAGED",
            company: { tagPlusConnections: [{ id: "conn-1" }] },
          }),
        },
        historicalSourceIdentity: {
          findMany: vi.fn().mockResolvedValue([
            { sourceEntity: "cliente", sourcePrimaryKey: "10", canonicalEntityId: "canon-cust-10" },
            { sourceEntity: "produto_base", sourcePrimaryKey: "101", canonicalEntityId: "canon-prod-101" },
          ]),
          count: vi.fn().mockResolvedValue(0),
        },
        historicalStagingRow: {
          findMany: vi.fn().mockImplementation(({ where }) => {
            if (where.sourceTable === "venda") {
              return Promise.resolve([
                {
                  payload: {
                    id: "2655", // known quarantined ID
                    id_cliente: "10",
                    id_nota_fiscal: "555",
                    cancelado: "0",
                    vr_total: "300.00",
                    data_hr_venda: "2025-01-10 10:00:00",
                  },
                },
              ]);
            }
            if (where.sourceTable === "nota_fiscal") {
              return Promise.resolve([
                {
                  payload: { id: "555", vr_frete: "0.00" },
                },
              ]);
            }
            if (where.sourceTable === "nota_fiscal_lancamento") {
              // item total is 100, but sale is 300 (diff 200, no freight) -> Quarantined
              return Promise.resolve([
                {
                  payload: {
                    id: "9002",
                    id_nota_fiscal: "555",
                    id_produto: "101",
                    quantidade: "1",
                    vr_produto: "100.00",
                    vr_subtotal: "100.00",
                  },
                },
              ]);
            }
            if (where.sourceTable === "nfe") return Promise.resolve([]);
            return Promise.resolve([]);
          }),
        },
        sale: { count: vi.fn().mockResolvedValue(0) },
        saleSourceDocument: { count: vi.fn().mockResolvedValue(0) },
      } as unknown as any;

      const plan = await planHustlerSalesImport(mockPrisma, "batch-1");

      expect(plan.plannedSales.length).toBe(0);
      expect(plan.summary.importableSales).toBe(0);
      expect(plan.summary.quarantinedVendas).toBe(1);
      expect(plan.summary.quarantinedRevenue).toBe(300.0);
      expect(plan.quarantinedSales[0].legacyVendaId).toBe("2655");
      expect(plan.quarantinedSales[0].reason).toBe("LEGACY_DATA_INCONSISTENCY");
    });

    it("16. integrates customer freight correctly and explains difference without double counting", async () => {
      const mockPrisma = {
        historicalImportBatch: {
          findUnique: vi.fn().mockResolvedValue({
            id: "batch-1",
            companyId: "company-1",
            status: "STAGED",
            company: { tagPlusConnections: [{ id: "conn-1" }] },
          }),
        },
        historicalSourceIdentity: {
          findMany: vi.fn().mockResolvedValue([
            { sourceEntity: "cliente", sourcePrimaryKey: "10", canonicalEntityId: "canon-cust-10" },
            { sourceEntity: "produto_base", sourcePrimaryKey: "101", canonicalEntityId: "canon-prod-101" },
          ]),
          count: vi.fn().mockResolvedValue(0),
        },
        historicalStagingRow: {
          findMany: vi.fn().mockImplementation(({ where }) => {
            if (where.sourceTable === "venda") {
              return Promise.resolve([
                {
                  payload: {
                    id: "7001",
                    id_cliente: "10",
                    id_nota_fiscal: "777",
                    cancelado: "0",
                    vr_total: "120.00", // item 100 + freight 20
                    data_hr_venda: "2025-01-10 10:00:00",
                  },
                },
              ]);
            }
            if (where.sourceTable === "nota_fiscal") {
              return Promise.resolve([
                {
                  payload: { id: "777", vr_frete: "20.00" },
                },
              ]);
            }
            if (where.sourceTable === "nota_fiscal_lancamento") {
              return Promise.resolve([
                {
                  payload: {
                    id: "9003",
                    id_nota_fiscal: "777",
                    id_produto: "101",
                    quantidade: "1",
                    vr_produto: "100.00",
                    vr_subtotal: "100.00",
                  },
                },
              ]);
            }
            if (where.sourceTable === "nfe") return Promise.resolve([]);
            return Promise.resolve([]);
          }),
        },
        sale: { count: vi.fn().mockResolvedValue(0) },
        saleSourceDocument: { count: vi.fn().mockResolvedValue(0) },
      } as unknown as any;

      const plan = await planHustlerSalesImport(mockPrisma, "batch-1");

      expect(plan.plannedSales.length).toBe(1);
      expect(plan.summary.salesWithCustomerFreight).toBe(1);
      expect(plan.summary.totalCustomerFreight).toBe(20.0);
      expect(plan.summary.importableRevenue).toBe(120.0);

      const planned = plan.plannedSales[0];
      expect(planned.customerFreightAmount).toEqual(new Prisma.Decimal("20.0000"));
      expect(planned.netAmount).toEqual(new Prisma.Decimal("120.0000"));
      expect(planned.realizationDoc.netAmount).toEqual(new Prisma.Decimal("120.0000"));
    });

    it("17. rejects non-STAGED batch to prevent running on an active/imported batch", async () => {
      const mockPrisma = {
        historicalImportBatch: {
          findUnique: vi.fn().mockResolvedValue({
            id: "batch-1",
            status: "COMPLETED",
          }),
        },
      } as unknown as any;

      await expect(planHustlerSalesImport(mockPrisma, "batch-1")).rejects.toThrow(
        /must be in STAGED status/
      );
    });

    it("18. confirms no physical double movement: 1 SSDI item per commercial item", async () => {
      const mockPrisma = {
        historicalImportBatch: {
          findUnique: vi.fn().mockResolvedValue({
            id: "batch-1",
            companyId: "company-1",
            status: "STAGED",
            company: { tagPlusConnections: [{ id: "conn-1" }] },
          }),
        },
        historicalSourceIdentity: {
          findMany: vi.fn().mockResolvedValue([
            { sourceEntity: "cliente", sourcePrimaryKey: "10", canonicalEntityId: "canon-cust-10" },
            { sourceEntity: "produto_base", sourcePrimaryKey: "101", canonicalEntityId: "canon-prod-101" },
            { sourceEntity: "produto_base", sourcePrimaryKey: "102", canonicalEntityId: "canon-prod-102" },
          ]),
          count: vi.fn().mockResolvedValue(0),
        },
        historicalStagingRow: {
          findMany: vi.fn().mockImplementation(({ where }) => {
            if (where.sourceTable === "venda") {
              return Promise.resolve([
                {
                  payload: {
                    id: "8001",
                    id_cliente: "10",
                    id_nota_fiscal: "888",
                    cancelado: "0",
                    vr_total: "250.00",
                    data_hr_venda: "2025-01-10 10:00:00",
                  },
                },
              ]);
            }
            if (where.sourceTable === "nota_fiscal") {
              return Promise.resolve([
                { payload: { id: "888", vr_frete: "0.00" } },
              ]);
            }
            if (where.sourceTable === "nota_fiscal_lancamento") {
              return Promise.resolve([
                {
                  payload: {
                    id: "901",
                    id_nota_fiscal: "888",
                    id_produto: "101",
                    quantidade: "1",
                    vr_produto: "100.00",
                    vr_subtotal: "100.00",
                  },
                },
                {
                  payload: {
                    id: "902",
                    id_nota_fiscal: "888",
                    id_produto: "102",
                    quantidade: "1",
                    vr_produto: "150.00",
                    vr_subtotal: "150.00",
                  },
                },
              ]);
            }
            if (where.sourceTable === "nfe") return Promise.resolve([]);
            return Promise.resolve([]);
          }),
        },
        sale: { count: vi.fn().mockResolvedValue(0) },
        saleSourceDocument: { count: vi.fn().mockResolvedValue(0) },
      } as unknown as any;

      const plan = await planHustlerSalesImport(mockPrisma, "batch-1");
      const s = plan.plannedSales[0];

      expect(s.items.length).toBe(2);
      expect(s.realizationDoc.items.length).toBe(2);
      expect(s.items[0].sourceItemId).toBe(s.realizationDoc.items[0].sourceItemId);
      expect(s.items[1].sourceItemId).toBe(s.realizationDoc.items[1].sourceItemId);
    });
  });
});
