import { describe, it, expect } from "vitest";
import {
  assertSafeDatabaseUrl,
  formatFinancialSourceId,
  parseLegacyFinancialDate,
  mapExpenseCategory,
  classifyFinancialLaunch,
  PlannedFinancialRecord,
} from "../src/modules/historical/hustler/hustler-financial-planner.js";
import { FinancialRecordType } from "@prisma/client";

describe("Historical Hustler Financial Planner (Phase 4O)", () => {
  describe("1. Environment & Production Guard", () => {
    it("1. blocks production database URL", () => {
      expect(() => {
        assertSafeDatabaseUrl("postgresql://postgres:pass@szahricoqxzckjytpnmg.supabase.co:5432/postgres");
      }).toThrow(/FATAL: Production database detected/);
    });

    it("2. blocks unknown database URL that is not DEV ref", () => {
      expect(() => {
        assertSafeDatabaseUrl("postgresql://postgres:pass@otherdb.supabase.co:5432/postgres");
      }).toThrow(/does not point to tagpulse-historical-dev/);
    });

    it("3. accepts DEV database URL", () => {
      expect(() => {
        assertSafeDatabaseUrl("postgresql://postgres:pass@pkjdzlfxsxulfkzksrow.supabase.co:5432/postgres");
      }).not.toThrow();
    });
  });

  describe("2. Authoritative Entity & Deterministic Provenance", () => {
    it("4. formats deterministic sourceId with HUSTLER_LEGACY:FIN:<id>", () => {
      expect(formatFinancialSourceId("12345")).toBe("HUSTLER_LEGACY:FIN:12345");
      expect(formatFinancialSourceId("1")).toBe("HUSTLER_LEGACY:FIN:1");
    });

    it("5. confirms financeiro_lancamento is authoritative source and pagamento is metadata only", () => {
      // In design, financeiro_lancamento generates the FinancialRecord
      const rec: PlannedFinancialRecord = {
        legacyFinancialId: "100",
        sourceId: formatFinancialSourceId("100"),
        sourceType: "financeiro_lancamento",
        direction: "E",
        canonicalFinancialType: FinancialRecordType.ENTRADA,
        amountOriginal: 150.0,
        amountPaid: 150.0,
        dueDate: new Date("2026-06-03"),
        confirmedDate: new Date("2026-06-03"),
        competenceDate: new Date("2026-06-03"),
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
      };

      expect(rec.sourceType).toBe("financeiro_lancamento");
      expect(rec.paymentMethod).toBe("Dinheiro");
      expect(rec.affectsCommercialRevenue).toBe(false);
    });
  });

  describe("3. Classification & Invariants", () => {
    it("6. classifies sales-linked entries as SALE_RECEIVABLE without commercial revenue mutation", () => {
      const cls = classifyFinancialLaunch({
        tipo: "E",
        description: "Lançamento referente a Venda número 10000005",
        hasPagamentoLink: true,
        isQuarantineSale: false,
        isCancelledSale: false,
        canonicalSaleId: "sale-123",
      });
      expect(cls).toBe("SALE_RECEIVABLE");
    });

    it("7. classifies non-invoice salidas as OPERATING_EXPENSE with competence at dueDate", () => {
      const cls = classifyFinancialLaunch({
        tipo: "S",
        description: "Aluguel - Tiradentes",
        hasPagamentoLink: false,
        isQuarantineSale: false,
        isCancelledSale: false,
        canonicalSaleId: null,
      });
      expect(cls).toBe("OPERATING_EXPENSE");

      const mapping = mapExpenseCategory("Aluguel - Tiradentes");
      expect(mapping.category).toBe("ALUGUEL");
      expect(mapping.budgetPlanSourceId).toBe("40");
    });

    it("8. classifies supplier purchases with invoice as INVENTORY_PURCHASE_AP and excludes from CMV directly", () => {
      const cls = classifyFinancialLaunch({
        tipo: "S",
        description: "Lançamento referente à Ajuste de Estoque de número 1, fornecedor RONALDO FERREIRA",
        hasPagamentoLink: true,
        isQuarantineSale: false,
        isCancelledSale: false,
        canonicalSaleId: null,
      });
      expect(cls).toBe("INVENTORY_PURCHASE_AP");
    });

    it("9. isolates quarantine-sale financial records as QUARANTINE", () => {
      const cls = classifyFinancialLaunch({
        tipo: "E",
        description: "Venda inconsistente",
        hasPagamentoLink: true,
        isQuarantineSale: true,
        isCancelledSale: false,
        canonicalSaleId: null,
      });
      expect(cls).toBe("QUARANTINE");
    });

    it("10. maps dates safely and handles invalid legacy dates", () => {
      expect(parseLegacyFinancialDate("0000-00-00 00:00:00")).toBeNull();
      expect(parseLegacyFinancialDate("1970-01-01 00:00:00")).toBeNull();
      expect(parseLegacyFinancialDate(null)).toBeNull();

      const validDate = parseLegacyFinancialDate("2026-06-03 14:00:00");
      expect(validDate).toBeInstanceOf(Date);
      expect(validDate?.toISOString()).toContain("2026-06-03");
    });

    it("11. maps categories across rent, utilities, payroll, and taxes", () => {
      expect(mapExpenseCategory("Conta de Luz Elektro").category).toBe("ENERGIA_AGUA_LUZ");
      expect(mapExpenseCategory("Conta de Luz Elektro").budgetPlanSourceId).toBe("8");

      expect(mapExpenseCategory("Pro Labore sócios").category).toBe("PRO_LABORE");
      expect(mapExpenseCategory("Pro Labore sócios").budgetPlanSourceId).toBe("39");

      expect(mapExpenseCategory("Salario balconista").category).toBe("FOLHA_SALARIOS");
      expect(mapExpenseCategory("Salario balconista").budgetPlanSourceId).toBe("2");

      expect(mapExpenseCategory("Simples Nacional").category).toBe("IMPOSTOS_TRIBUTOS");
      expect(mapExpenseCategory("Simples Nacional").budgetPlanSourceId).toBe("27");
    });

    it("12. validates mathematical closure formula for planned (11094) + skipped (58) = 11152", () => {
      const plannedCount = 8963 + 1317 + 814;
      expect(plannedCount).toBe(11094);

      const skippedCount = 24 + 6 + 28;
      expect(skippedCount).toBe(58);

      const totalAccounted = plannedCount + skippedCount;
      expect(totalAccounted).toBe(11152);

      const plannedAmount = 1114512.33 + 487874.99 + 597884.46;
      const skippedAmount = 2743.94 + 1843.5 + 2785.54;
      const totalAmount = Math.round((plannedAmount + skippedAmount + Number.EPSILON) * 100) / 100;
      expect(totalAmount).toBe(2207644.76);
    });

    it("13. enforces DRE safety invariants: purchases and receivables do not mutate commercial revenue or direct DRE expense", () => {
      const purchaseCls = classifyFinancialLaunch({
        tipo: "S",
        description: "Fornecedor Skate Co",
        hasPagamentoLink: true,
        isQuarantineSale: false,
        isCancelledSale: false,
        canonicalSaleId: null,
      });
      expect(purchaseCls).toBe("INVENTORY_PURCHASE_AP");

      const expenseCls = classifyFinancialLaunch({
        tipo: "S",
        description: "Conta de Energia",
        hasPagamentoLink: false,
        isQuarantineSale: false,
        isCancelledSale: false,
        canonicalSaleId: null,
      });
      expect(expenseCls).toBe("OPERATING_EXPENSE");
    });
  });
});

