import { describe, it, expect } from "vitest";
import {
  assertSafeDatabaseUrl,
  classifyHustlerFinancialRecord,
  categorizeExpenseDescription,
} from "../src/modules/historical/hustler/hustler-financial-reconciler.js";

describe("Historical Hustler Financial Discovery & Reconciliation (Phase 4N)", () => {
  describe("1. Environment Guards", () => {
    it("1. blocks production database URL", () => {
      expect(() => {
        assertSafeDatabaseUrl("postgresql://postgres:pass@szahricoqxzckjytpnmg.supabase.co:5432/postgres");
      }).toThrow(/FATAL: Production database detected/);
    });

    it("2. blocks unknown database URL that is not DEV ref", () => {
      expect(() => {
        assertSafeDatabaseUrl("postgresql://postgres:pass@otherref.supabase.co:5432/postgres");
      }).toThrow(/does not point to tagpulse-historical-dev/);
    });

    it("3. accepts DEV database URL", () => {
      expect(() => {
        assertSafeDatabaseUrl("postgresql://postgres:pass@pkjdzlfxsxulfkzksrow.supabase.co:5432/postgres");
      }).not.toThrow();
    });
  });

  describe("2. Financial Record Domain Classification", () => {
    it("4. classifies Entrada linked to sales payment as SALE_RECEIPT", () => {
      const result = classifyHustlerFinancialRecord("E", "101", "Venda balcao");
      expect(result).toBe("SALE_RECEIPT");
    });

    it("5. classifies Entrada without payment link as FINANCIAL_INCOME", () => {
      const result = classifyHustlerFinancialRecord("E", null, "Suprimento de caixa");
      expect(result).toBe("FINANCIAL_INCOME");
    });

    it("6. classifies Saída linked to invoice payment as SUPPLIER_PURCHASE", () => {
      const result = classifyHustlerFinancialRecord("S", "202", "Compra fornecedor skate");
      expect(result).toBe("SUPPLIER_PURCHASE");
    });

    it("7. classifies Saída without invoice payment link as OPERATING_EXPENSE", () => {
      const result = classifyHustlerFinancialRecord("S", null, "Aluguel Loja Tiradentes");
      expect(result).toBe("OPERATING_EXPENSE");
    });

    it("8. isolates quarantined sale finance as QUARANTINE", () => {
      const result = classifyHustlerFinancialRecord("E", "303", "Venda inconsistente", true);
      expect(result).toBe("QUARANTINE");
    });
  });

  describe("3. Operating Expense Categorization", () => {
    it("9. categorizes rent, utilities, payroll, and taxes accurately", () => {
      expect(categorizeExpenseDescription("Aluguel - Tiradentes")).toBe("ALUGUEL");
      expect(categorizeExpenseDescription("Conta de Energia Elektro")).toBe("ENERGIA_AGUA_LUZ");
      expect(categorizeExpenseDescription("Salario funcionario loja")).toBe("FOLHA_PRO_LABORE_PESSOAL");
      expect(categorizeExpenseDescription("Simples Nacional DARF")).toBe("IMPOSTOS_TAXAS");
      expect(categorizeExpenseDescription("Tarifa bancaria TED")).toBe("TAXAS_BANCARIAS_CARTAO");
      expect(categorizeExpenseDescription("Conserto fechadura porta")).toBe("MANUTENCAO_REFORMA");
      expect(categorizeExpenseDescription("Despesa diversa")).toBe("OUTROS_OPERACIONAIS");
    });
  });
});
