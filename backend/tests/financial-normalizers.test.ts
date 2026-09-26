import { describe, expect, it } from "vitest";
import {
  normalizeTagPlusBudgetPlan,
  normalizeTagPlusBankAccount,
  normalizeTagPlusPaymentMethod,
  normalizeTagPlusDepartment,
} from "../src/integrations/tagplus/financial/index.js";

describe("Financial Reference Normalizers", () => {
  describe("FinancialBudgetPlan Normalizer", () => {
    it("normalizes a root budget plan with null parent", () => {
      const raw = {
        id: 1,
        descricao: "1 - RECEITAS OPERACIONAIS",
        tipo: "E",
        posicao: "1",
        protegido: true,
        pai: null,
        classificacao_dre: null,
      };

      const normalized = normalizeTagPlusBudgetPlan(raw);
      expect(normalized).toEqual({
        sourceId: "1",
        parentSourceId: null,
        type: "E",
        description: "1 - RECEITAS OPERACIONAIS",
        position: "1",
        isProtected: true,
        sourceDreClassification: null,
      });
    });

    it("preserves position string exactly as '2.10' and child relationship", () => {
      const raw = {
        id: 39,
        descricao: "Retirada Mensal",
        tipo: "S",
        posicao: "2.10",
        protegido: false,
        pai: {
          id: 2,
          descricao: "2 - DESPESAS OPERACIONAIS",
        },
        classificacao_dre: null,
      };

      const normalized = normalizeTagPlusBudgetPlan(raw);
      expect(normalized.position).toBe("2.10");
      expect(typeof normalized.position).toBe("string");
      expect(normalized.sourceId).toBe("39");
      expect(normalized.parentSourceId).toBe("2");
      expect(normalized.type).toBe("S");
      expect(normalized.isProtected).toBe(false);
      expect(normalized.sourceDreClassification).toBeNull();
    });

    it("preserves sourceDreClassification when present as object or string", () => {
      const raw = {
        id: 19,
        descricao: "Compras",
        tipo: "S",
        posicao: "2.1",
        protegido: true,
        classificacao_dre: { codigo: "DRE-01", nome: "Custos" },
      };

      const normalized = normalizeTagPlusBudgetPlan(raw);
      expect(normalized.sourceDreClassification).toEqual({
        codigo: "DRE-01",
        nome: "Custos",
      });
    });

    it("throws when id is missing or empty", () => {
      expect(() =>
        normalizeTagPlusBudgetPlan({ id: null } as unknown as Parameters<
          typeof normalizeTagPlusBudgetPlan
        >[0]),
      ).toThrow("FinancialBudgetPlan missing required identifier: id");
      expect(() =>
        normalizeTagPlusBudgetPlan({ id: "   " } as unknown as Parameters<
          typeof normalizeTagPlusBudgetPlan
        >[0]),
      ).toThrow("FinancialBudgetPlan id cannot be empty");
    });
  });

  describe("BankAccount Normalizer", () => {
    it("normalizes a bank account preserving rawDetails without inventing schema columns", () => {
      const raw = {
        id: 101,
        descricao: "Itaú Principal",
        banco: "341",
        agencia_custom: "1234",
        conta_custom: "56789-0",
        saldo_inicial: "1500.00",
      };

      const normalized = normalizeTagPlusBankAccount(raw);
      expect(normalized).toEqual({
        sourceId: "101",
        description: "Itaú Principal",
        rawDetails: {
          banco: "341",
          agencia_custom: "1234",
          conta_custom: "56789-0",
          saldo_inicial: "1500.00",
        },
      });
    });

    it("returns null for rawDetails when no extra properties are present", () => {
      const raw = {
        id: 102,
        descricao: "Caixa Físico",
      };

      const normalized = normalizeTagPlusBankAccount(raw);
      expect(normalized.sourceId).toBe("102");
      expect(normalized.description).toBe("Caixa Físico");
      expect(normalized.rawDetails).toBeNull();
    });

    it("throws when id is missing", () => {
      expect(() => normalizeTagPlusBankAccount({ descricao: "Conta" })).toThrow(
        "BankAccount missing required identifier: id",
      );
    });
  });

  describe("PaymentMethod Normalizer", () => {
    it("normalizes payment method preserving ativo as sourceActive and excluding picpay_token", () => {
      const raw = {
        id: 5,
        descricao: "Boleto Bancário",
        ativo: true,
        picpay_token: "super-secret-token-12345",
        vinculo: "banco_itau",
      };

      const normalized = normalizeTagPlusPaymentMethod(raw);
      expect(normalized).toEqual({
        sourceId: "5",
        description: "Boleto Bancário",
        sourceActive: true,
      });

      // Token and secrets must NOT be in the normalized output
      expect(
        (normalized as unknown as Record<string, unknown>).picpay_token,
      ).toBeUndefined();
    });

    it("correctly captures inactive payment method (ativo = false)", () => {
      const raw = {
        id: 12,
        descricao: "Cheque Pré-datado",
        ativo: false,
      };

      const normalized = normalizeTagPlusPaymentMethod(raw);
      expect(normalized.sourceActive).toBe(false);
    });

    it("defaults sourceActive to true when ativo is omitted", () => {
      const raw = {
        id: 8,
        descricao: "PIX",
      };

      const normalized = normalizeTagPlusPaymentMethod(raw);
      expect(normalized.sourceActive).toBe(true);
    });

    it("throws when id is missing", () => {
      expect(() => normalizeTagPlusPaymentMethod({ descricao: "PIX" })).toThrow(
        "PaymentMethod missing required identifier: id",
      );
    });
  });

  describe("Department Normalizer", () => {
    it("normalizes department with clean sourceId and description", () => {
      const raw = {
        id: 3,
        descricao: "Comercial / Vendas",
      };

      const normalized = normalizeTagPlusDepartment(raw);
      expect(normalized).toEqual({
        sourceId: "3",
        description: "Comercial / Vendas",
      });
    });

    it("throws when id is missing", () => {
      expect(() => normalizeTagPlusDepartment({ descricao: "TI" })).toThrow(
        "Department missing required identifier: id",
      );
    });
  });
});
