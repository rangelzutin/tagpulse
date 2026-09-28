/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  normalizeTagPlusStockAdjustment,
  parseDecimal,
  parseTagPlusCivilDate,
  sanitizePayload,
} from "../src/integrations/tagplus/stock-adjustments/stock-adjustment-normalizer.js";

describe("StockAdjustmentNormalizer", () => {
  it("A. normalizes adjustment detail correctly", () => {
    const raw = {
      id: 7640,
      numero: "703",
      codigo_externo: "EXT-123",
      tipo: "S",
      status: "A",
      entidade: {
        id: 506,
        razao_social: "GIANCARLO NACCARATO",
        cpf: "310.258.858-13",
        cnpj: null,
      },
      data_criacao: "2026-08-05 14:30:00",
      data_alteracao: "2026-08-05 15:00:00",
      data_confirmacao: "2026-08-05 00:00:00",
      observacoes: "Cotas referente ao mes 08 - 09 de 2026",
      funcionario: {
        id: 1,
        nome: "Administrador",
      },
      valor_frete: 10.5,
      valor_outros: 5.25,
      valor_total: 1000,
      tem_fatura: false,
      itens: [],
      faturas: [],
    };

    const norm = normalizeTagPlusStockAdjustment(raw);

    expect(norm.sourceId).toBe("7640");
    expect(norm.number).toBe("703");
    expect(norm.externalCode).toBe("EXT-123");
    expect(norm.type).toBe("S");
    expect(norm.status).toBe("A");
    expect(norm.entitySourceId).toBe("506");
    expect(norm.entityName).toBe("GIANCARLO NACCARATO");
    expect(norm.entityCpf).toBe("310.258.858-13");
    expect(norm.entityCnpj).toBeNull();
    expect(norm.notes).toBe("Cotas referente ao mes 08 - 09 de 2026");
    expect(norm.employeeSourceId).toBe("1");
    expect(norm.employeeName).toBe("Administrador");
    expect(norm.freightAmount.toString()).toBe("10.5");
    expect(norm.otherAmount.toString()).toBe("5.25");
    expect(norm.totalAmount.toString()).toBe("1000");
    expect(norm.hasInvoice).toBe(false);
  });

  it("B. normalizes items correctly with product and category info", () => {
    const raw = {
      id: 100,
      itens: [
        {
          id: 53892,
          item: 1,
          produto_servico: {
            id: 2384,
            codigo: "2065542318004",
            descricao: "Shape Nineclouds - Lucky9 7.75",
          },
          qtd: 2,
          unidade_saida: "UN",
          valor_unitario: 125,
          valor_acrescimo: 0,
          valor_desconto: 10,
          valor_subtotal: 240,
          cfop: "5.949",
          detalhes: "detalhes item",
          tipo_unidade: "S",
          unidade_restante: "UN",
          produto: {
            categoria: {
              id: 79,
              descricao: "Shape Nineclouds Collection",
            },
          },
        },
      ],
    };

    const norm = normalizeTagPlusStockAdjustment(raw);

    expect(norm.items).toHaveLength(1);
    const item = norm.items[0];
    expect(item.sourceItemId).toBe("53892");
    expect(item.itemNumber).toBe(1);
    expect(item.productSourceId).toBe("2384");
    expect(item.productCode).toBe("2065542318004");
    expect(item.productDescription).toBe("Shape Nineclouds - Lucky9 7.75");
    expect(item.quantity.toString()).toBe("2");
    expect(item.outputUnit).toBe("UN");
    expect(item.unitAmount.toString()).toBe("125");
    expect(item.surchargeAmount.toString()).toBe("0");
    expect(item.discountAmount.toString()).toBe("10");
    expect(item.subtotalAmount.toString()).toBe("240");
    expect(item.cfop).toBe("5.949");
    expect(item.details).toBe("detalhes item");
    expect(item.unitType).toBe("S");
    expect(item.remainingUnit).toBe("UN");
    expect(item.categorySourceId).toBe("79");
    expect(item.categoryDescription).toBe("Shape Nineclouds Collection");
  });

  it("C. parses Decimal values robustly including strings and comma formatting", () => {
    expect(parseDecimal(125.5).toString()).toBe("125.5");
    expect(parseDecimal("1.250,75").toString()).toBe("1250.75");
    expect(parseDecimal("350,50").toString()).toBe("350.5");
    expect(parseDecimal(new Prisma.Decimal("99.99")).toString()).toBe("99.99");
    expect(parseDecimal(null).toString()).toBe("0");
    expect(parseDecimal(undefined).toString()).toBe("0");
    expect(parseDecimal(Number.NaN).toString()).toBe("0");
  });

  it("D. parses valid and invalid dates properly", () => {
    const validDate = parseTagPlusCivilDate("2026-08-05 14:30:00");
    expect(validDate).not.toBeNull();
    expect(validDate?.toISOString()).toContain("2026-08-05");

    const validDateOnly = parseTagPlusCivilDate("2026-08-05");
    expect(validDateOnly).not.toBeNull();
    expect(validDateOnly?.toISOString()).toBe("2026-08-05T00:00:00.000Z");

    expect(parseTagPlusCivilDate(null)).toBeNull();
    expect(parseTagPlusCivilDate("")).toBeNull();
    expect(parseTagPlusCivilDate("invalid-date-string")).toBeNull();
    expect(parseTagPlusCivilDate("1969-12-31")).toBeNull(); // <= 1970 invalid
  });

  it("E. extracts financial link to FinancialRecord sourceId", () => {
    const raw = {
      id: 543,
      numero: "76",
      tem_fatura: true,
      faturas: [
        {
          item: 1,
          parcelas: [
            {
              id: 10,
              parcela: 1,
              documento: "DOC-99",
              lancamento_financeiro_vinculado: {
                id: 1152,
                descricao: "Lançamento referente à Ajuste de Estoque de número 76",
              },
            },
          ],
        },
      ],
    };

    const norm = normalizeTagPlusStockAdjustment(raw);
    expect(norm.hasInvoice).toBe(true);
    expect(norm.financialLinks).toHaveLength(1);
    expect(norm.financialLinks[0].financialRecordSourceId).toBe("1152");
    expect(norm.financialLinks[0].invoiceNumber).toBe("DOC-99");
    expect(norm.financialLinks[0].installmentNumber).toBe(1);
  });

  it("F. handles adjustment with multiple installments", () => {
    const raw = {
      id: 6745,
      numero: "656",
      tem_fatura: true,
      faturas: [
        {
          item: 1,
          parcelas: [
            {
              id: 201,
              parcela: 1,
              documento: "PARC-1",
              lancamento_financeiro_vinculado: { id: 9808 },
            },
            {
              id: 202,
              parcela: 2,
              documento: "PARC-2",
              lancamento_financeiro_vinculado: { id: 9809 },
            },
          ],
        },
      ],
    };

    const norm = normalizeTagPlusStockAdjustment(raw);
    expect(norm.financialLinks).toHaveLength(2);
    expect(norm.financialLinks[0].financialRecordSourceId).toBe("9808");
    expect(norm.financialLinks[0].installmentNumber).toBe(1);
    expect(norm.financialLinks[1].financialRecordSourceId).toBe("9809");
    expect(norm.financialLinks[1].installmentNumber).toBe(2);
  });

  it("G. handles adjustment without invoice/fatura cleanly", () => {
    const raw = {
      id: 7640,
      numero: "703",
      tem_fatura: false,
      faturas: [],
    };

    const norm = normalizeTagPlusStockAdjustment(raw);
    expect(norm.hasInvoice).toBe(false);
    expect(norm.financialLinks).toHaveLength(0);
  });

  it("N. sanitizes sourcePayload by redacting sensitive keys", () => {
    const raw = {
      id: 50,
      token: "secret-token-value",
      api_key: "my-secret-key",
      password: "pass",
      nested: {
        authorization: "Bearer 123",
        picpay_token: "picpay123",
        normalField: "public-data",
      },
    };

    const sanitized: any = sanitizePayload(raw);
    expect(sanitized.token).toBe("[REDACTED]");
    expect(sanitized.api_key).toBe("[REDACTED]");
    expect(sanitized.password).toBe("[REDACTED]");
    expect(sanitized.nested.authorization).toBe("[REDACTED]");
    expect(sanitized.nested.picpay_token).toBe("[REDACTED]");
    expect(sanitized.nested.normalField).toBe("public-data");
  });
});
