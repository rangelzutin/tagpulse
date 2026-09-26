import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  normalizeTagPlusFinancialRecord,
  sanitizePayload,
  parseTagPlusCivilDate,
  parseTagPlusSourceUpdatedAt,
} from "../src/integrations/tagplus/financial/financial-record-normalizer.js";

describe("financial-record-normalizer", () => {
  describe("sanitizePayload", () => {
    it("redacts sensitive fields recursively", () => {
      const payload = {
        id: 123,
        descricao: "Lançamento",
        token: "secret-token",
        access_token: "secret-access-token",
        refresh_token: "secret-refresh-token",
        password: "my-password",
        senha: "outra-senha",
        secret: "super-secret",
        authorization: "Bearer 123",
        forma_pagamento: {
          id: 1,
          picpay_token: "picpay-secret-token",
          descricao: "Dinheiro",
        },
        items: [
          { token: "item-token", value: 100 },
        ],
      };

      const sanitized = sanitizePayload(payload);

      expect(sanitized.id).toBe(123);
      expect(sanitized.descricao).toBe("Lançamento");
      expect(sanitized.token).toBe("[REDACTED]");
      expect(sanitized.access_token).toBe("[REDACTED]");
      expect(sanitized.refresh_token).toBe("[REDACTED]");
      expect(sanitized.password).toBe("[REDACTED]");
      expect(sanitized.senha).toBe("[REDACTED]");
      expect(sanitized.secret).toBe("[REDACTED]");
      expect(sanitized.authorization).toBe("[REDACTED]");
      expect((sanitized.forma_pagamento as Record<string, unknown>).picpay_token).toBe("[REDACTED]");
      expect((sanitized.forma_pagamento as Record<string, unknown>).descricao).toBe("Dinheiro");
      expect((sanitized.items as Array<Record<string, unknown>>)[0].token).toBe("[REDACTED]");
      expect((sanitized.items as Array<Record<string, unknown>>)[0].value).toBe(100);
    });
  });

  describe("parseTagPlusCivilDate", () => {
    it("parses valid YYYY-MM-DD to UTC date", () => {
      const d = parseTagPlusCivilDate("2026-02-19");
      expect(d).not.toBeNull();
      expect(d?.toISOString()).toBe("2026-02-19T00:00:00.000Z");
    });

    it("returns null for null, undefined, empty, or year <= 1970", () => {
      expect(parseTagPlusCivilDate(null)).toBeNull();
      expect(parseTagPlusCivilDate(undefined)).toBeNull();
      expect(parseTagPlusCivilDate("")).toBeNull();
      expect(parseTagPlusCivilDate("1970-01-01")).toBeNull();
      expect(parseTagPlusCivilDate("0000-00-00")).toBeNull();
    });
  });

  describe("parseTagPlusSourceUpdatedAt", () => {
    it("parses valid datetime string", () => {
      const d = parseTagPlusSourceUpdatedAt("2026-02-23 10:13:18");
      expect(d).not.toBeNull();
      expect(d?.toISOString()).toBe("2026-02-23T10:13:18.000Z");
    });

    it("normalizes legacy 1970 and 0000 dates to null without failing", () => {
      expect(parseTagPlusSourceUpdatedAt("1970-01-01 00:00:00")).toBeNull();
      expect(parseTagPlusSourceUpdatedAt("0000-00-00 00:00:00")).toBeNull();
      expect(parseTagPlusSourceUpdatedAt("invalid-date")).toBeNull();
      expect(parseTagPlusSourceUpdatedAt(null)).toBeNull();
      expect(parseTagPlusSourceUpdatedAt(undefined)).toBeNull();
    });
  });

  describe("normalizeTagPlusFinancialRecord", () => {
    it("maps ENTRADA and SAIDA correctly", () => {
      const entradaRaw = {
        id: 101,
        tipo: "E",
        data_vencimento: "2026-01-10",
        valor_original: 100,
      };
      const saidaRaw = {
        id: 102,
        tipo: "S",
        data_vencimento: "2026-01-10",
        valor_original: 200,
      };

      const normE = normalizeTagPlusFinancialRecord(entradaRaw);
      const normS = normalizeTagPlusFinancialRecord(saidaRaw);

      expect(normE.type).toBe("ENTRADA");
      expect(normS.type).toBe("SAIDA");
    });

    it("faithfully preserves paidAmount even when confirmed = false", () => {
      const raw = {
        id: 10471,
        tipo: "E",
        confirmado: false,
        data_vencimento: "2026-04-20",
        valor_original: 696.66,
        valor_pago: 696.66, // Raw ERP contains valor_pago even if unconfirmed
      };

      const normalized = normalizeTagPlusFinancialRecord(raw);

      expect(normalized.isConfirmed).toBe(false);
      expect(normalized.paidAmount).toEqual(new Prisma.Decimal(696.66));
      expect(normalized.originalAmount).toEqual(new Prisma.Decimal(696.66));
    });

    it("correctly extracts entity snapshot and auxiliary IDs", () => {
      const raw = {
        id: 10469,
        tipo: "E",
        confirmado: true,
        transferencia: false,
        descricao: "Lançamento NF 2751",
        numero_documento: "000002751001",
        numero_sigla_movimentacao_vinculada: "55 - 2751",
        data_vencimento: "2026-02-19",
        data_alteracao: "2026-02-23 10:13:18",
        data_lancamento: "2026-01-15",
        data_confirmacao: "2026-02-23",
        data_competencia: "2026-01-15",
        valor_original: 696.67,
        valor_bruto: 696.67,
        valor_pago: 696.67,
        valor_total: 696.67,
        valor_desconto: 0,
        valor_acrescimo: 0,
        valor_juros_atraso: 0,
        aliquota_juros_ao_dia: 0,
        forma_pagamento: { id: 2, descricao: "Duplicata" },
        plano_orcamentario: { id: 1, nome: "Credito" },
        conta_bancaria: { id: 4, nome: "Bradesco" },
        departamento: { id: 1, descricao: "Administrativo" },
        entidade: {
          id: 24,
          razao_social: "BLEND SHOP LTDA",
          tipo_entidade: "C",
        },
        parcela: 1,
        total_parcelas: 3,
        fatura_parcela_vinculada: {
          id: 8638,
          parcela: 1,
          valor_parcela: 696.67,
        },
      };

      const norm = normalizeTagPlusFinancialRecord(raw);

      expect(norm.sourceId).toBe("10469");
      expect(norm.type).toBe("ENTRADA");
      expect(norm.isConfirmed).toBe(true);
      expect(norm.isTransfer).toBe(false);
      expect(norm.description).toBe("Lançamento NF 2751");
      expect(norm.documentNumber).toBe("000002751001");
      expect(norm.linkedMovementNumber).toBe("55 - 2751");
      expect(norm.dueDate).toEqual(new Date(Date.UTC(2026, 1, 19)));
      expect(norm.confirmationDate).toEqual(new Date(Date.UTC(2026, 1, 23)));
      expect(norm.sourceCompetenceDate).toEqual(new Date(Date.UTC(2026, 0, 15)));
      expect(norm.postingDate).toEqual(new Date(Date.UTC(2026, 0, 15)));
      expect(norm.sourceUpdatedAt).toEqual(new Date(Date.UTC(2026, 1, 23, 10, 13, 18)));
      expect(norm.originalAmount).toEqual(new Prisma.Decimal(696.67));
      expect(norm.grossAmount).toEqual(new Prisma.Decimal(696.67));
      expect(norm.paidAmount).toEqual(new Prisma.Decimal(696.67));
      expect(norm.totalAmount).toEqual(new Prisma.Decimal(696.67));
      expect(norm.installmentNumber).toBe(1);
      expect(norm.installmentCount).toBe(3);
      expect(norm.paymentMethodSourceId).toBe("2");
      expect(norm.budgetPlanSourceId).toBe("1");
      expect(norm.bankAccountSourceId).toBe("4");
      expect(norm.departmentSourceId).toBe("1");
      expect(norm.entitySourceId).toBe("24");
      expect(norm.entityType).toBe("C");
      expect(norm.entityName).toBe("BLEND SHOP LTDA");
      expect(norm.linkedInvoiceInstallmentSourceId).toBe("8638");
      expect(norm.sourcePayload).toBeDefined();
    });

    it("handles legacy ID 158 correctly, keeping sourceUpdatedAt null and preserving 1970 date in sourcePayload", () => {
      const raw = {
        id: 158,
        tipo: "E",
        confirmado: true,
        transferencia: false,
        data_vencimento: "2015-06-22",
        data_alteracao: "1970-01-01 00:00:00",
        valor_original: 424.5,
        valor_pago: 0,
      };

      const norm = normalizeTagPlusFinancialRecord(raw);

      expect(norm.sourceId).toBe("158");
      expect(norm.sourceUpdatedAt).toBeNull();
      expect(norm.sourcePayload.data_alteracao).toBe("1970-01-01 00:00:00");
    });
  });
});
