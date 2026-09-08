import { describe, expect, it } from "vitest";
import {
  isConfirmedInboundTagPlusNfe,
  normalizeTagPlusNfe,
  normalizeTagPlusPedido,
  normalizeTagPlusVendaSimples,
  parseTagPlusDate,
  SalesNormalizationError,
} from "../src/integrations/tagplus/sales/sales-normalizers.js";

describe("sales normalizers", () => {
  describe("parseTagPlusDate", () => {
    it("parses local datetime YYYY-MM-DD HH:mm:ss as UTC timestamp", () => {
      const parsed = parseTagPlusDate("2025-10-31 23:38:10");
      expect(parsed?.toISOString()).toBe("2025-10-31T23:38:10.000Z");
    });

    it("parses date-only YYYY-MM-DD as start of day UTC", () => {
      const parsed = parseTagPlusDate("2025-10-31");
      expect(parsed?.toISOString()).toBe("2025-10-31T00:00:00.000Z");
    });

    it("parses standard ISO date string", () => {
      const parsed = parseTagPlusDate("2025-10-31T15:30:00.000Z");
      expect(parsed?.toISOString()).toBe("2025-10-31T15:30:00.000Z");
    });

    it("returns null for null, undefined, or empty string", () => {
      expect(parseTagPlusDate(null)).toBeNull();
      expect(parseTagPlusDate(undefined)).toBeNull();
      expect(parseTagPlusDate("")).toBeNull();
      expect(parseTagPlusDate("   ")).toBeNull();
    });
  });

  describe("normalizeTagPlusPedido", () => {
    it("normalizes a full Pedido payload", () => {
      const raw = {
        id: 1282,
        numero: 1239,
        cliente: { id: 507, razao_social: "Empresa Confidencial Ltda" },
        data_criacao: "2025-10-31",
        data_confirmacao: "2025-10-31 10:00:00",
        valor_total: 14242.5,
        itens: [
          {
            id: 98226,
            produto_servico: { id: 2152, codigo: "SKU-PRO" },
            qtd: 4,
            valor_unitario: 189.9,
            valor_desconto: 0,
            valor_subtotal: 759.6,
          },
        ],
      };

      const normalized = normalizeTagPlusPedido(raw);
      expect(normalized.anchorType).toBe("PEDIDO");
      expect(normalized.sourceId).toBe("1282");
      expect(normalized.parentPedidoSourceId).toBeNull();
      expect(normalized.netAmount).toBe("14242.5");
      expect(normalized.customerSourceId).toBe("507");
      expect(normalized.sourceCreatedAt?.toISOString()).toBe(
        "2025-10-31T00:00:00.000Z",
      );
      expect(normalized.sourceConfirmedAt?.toISOString()).toBe(
        "2025-10-31T10:00:00.000Z",
      );
      expect(normalized.sourceEmissaoAt).toBeNull();
      expect(normalized.items).toHaveLength(1);
      expect(normalized.items[0]).toEqual({
        sourceItemId: "98226",
        lineNumber: 1,
        sourceProductId: "2152",
        quantity: "4",
        unitPrice: "189.9",
        discountAmount: "0",
        subtotal: "759.6",
      });
    });

    it("derives sourceItemId strictly from item.id and assigns 1-based positional lineNumber", () => {
      const raw = {
        id: 100,
        valor_total: 50,
        itens: [
          { id: 991, produto_servico: { id: 1 }, qtd: 1, valor_unitario: 25, valor_subtotal: 25 },
          { id: 992, produto_servico: { id: 1 }, qtd: 1, valor_unitario: 25, valor_subtotal: 25 },
        ],
      };
      const normalized = normalizeTagPlusPedido(raw);
      expect(normalized.items).toHaveLength(2);
      expect(normalized.items[0].sourceItemId).toBe("991");
      expect(normalized.items[0].lineNumber).toBe(1);
      expect(normalized.items[1].sourceItemId).toBe("992");
      expect(normalized.items[1].lineNumber).toBe(2);
      expect(normalized.items[0].sourceItemId).not.toBe(normalized.items[1].sourceItemId);
    });

    it("throws when Pedido id is missing", () => {
      expect(() => normalizeTagPlusPedido({})).toThrow(
        SalesNormalizationError,
      );
    });
  });

  describe("normalizeTagPlusVendaSimples", () => {
    it("normalizes a Venda Simples referencing a parent Pedido", () => {
      const raw = {
        id: 7022,
        numero: "626",
        cliente: { id: 507 },
        pedido_os_vinculada: { id: 1282, numero: 1239, tipo: "NF" },
        data_criacao: "2025-10-31 23:38:10",
        data_confirmacao: "2025-10-31 23:41:41",
        valor_total: 7120.97,
        itens: [
          {
            id: 51134,
            produto_servico: { id: 2152 },
            qtd: 4,
            valor_unitario: 94.95,
            valor_desconto: 0,
            valor_subtotal: 379.8,
          },
        ],
      };

      const normalized = normalizeTagPlusVendaSimples(raw);
      expect(normalized.anchorType).toBe("VENDA_SIMPLES");
      expect(normalized.sourceId).toBe("7022");
      expect(normalized.parentPedidoSourceId).toBe("1282");
      expect(normalized.netAmount).toBe("7120.97");
      expect(normalized.customerSourceId).toBe("507");
      expect(normalized.items[0].sourceItemId).toBe("51134");
      expect(normalized.items[0].sourceProductId).toBe("2152");
    });

    it("normalizes a direct Venda Simples without parent Pedido", () => {
      const raw = {
        id: 7030,
        numero: "630",
        valor_total: 150.0,
      };

      const normalized = normalizeTagPlusVendaSimples(raw);
      expect(normalized.sourceId).toBe("7030");
      expect(normalized.parentPedidoSourceId).toBeNull();
      expect(normalized.netAmount).toBe("150");
    });
  });

  describe("normalizeTagPlusNfe", () => {
    it("normalizes an NFe with valor_nota, data_emissao, and linked Pedido when tipo is 'S'", () => {
      const raw = {
        id: 54321,
        tipo: "S",
        numero: 2713,
        cliente: { id: 507 },
        pedido_os_vinculada: { id: 1282, numero: 1239 },
        data_criacao: "2025-10-31 23:45:00",
        data_emissao: "2025-10-31 23:45:00",
        data_confirmacao: "2025-10-31 23:46:00",
        valor_nota: 7120.97,
        itens: [
          {
            id: 61001,
            produto_servico: { id: 2152 },
            qtd: 4,
            valor_unitario: 94.95,
            valor_subtotal: 379.8,
          },
        ],
      };

      const normalized = normalizeTagPlusNfe(raw);
      expect(normalized).not.toBeNull();
      expect(normalized!.anchorType).toBe("NFE");
      expect(normalized!.sourceId).toBe("54321");
      expect(normalized!.parentPedidoSourceId).toBe("1282");
      expect(normalized!.netAmount).toBe("7120.97");
      expect(normalized!.sourceEmissaoAt?.toISOString()).toBe(
        "2025-10-31T23:45:00.000Z",
      );
      expect(normalized!.items[0].sourceItemId).toBe("61001");
      expect(normalized!.items[0].sourceProductId).toBe("2152");
    });

    it("returns null for inbound NFe (tipo: 'E') and does not normalize into a Sale", () => {
      const rawEntry = {
        id: 2218,
        tipo: "E",
        numero: 2152,
        valor_nota: 44915.39,
        itens: [
          {
            id: 37702,
            produto_servico: { id: 1724 },
            qtd: 50000,
            valor_unitario: 0.52947,
            valor_subtotal: 26473.5,
          },
        ],
      };

      expect(normalizeTagPlusNfe(rawEntry)).toBeNull();
    });

    it("returns null when tipo is missing or unrecognized (fail-closed)", () => {
      expect(
        normalizeTagPlusNfe({ id: 100, valor_nota: 50, itens: [] }),
      ).toBeNull();
      expect(
        normalizeTagPlusNfe({ id: 100, tipo: null, valor_nota: 50, itens: [] }),
      ).toBeNull();
      expect(
        normalizeTagPlusNfe({ id: 100, tipo: "X", valor_nota: 50, itens: [] }),
      ).toBeNull();
    });

    it("returns null for tipo: 'E' even if it has duplicate items without throwing normalization error", () => {
      const rawWithDuplicates = {
        id: 2218,
        tipo: "E",
        numero: 2152,
        valor_nota: 44915.39,
        itens: [
          {
            id: 37702,
            produto_servico: { id: 1724 },
            qtd: 50000,
            valor_unitario: 0.52947,
            valor_subtotal: 26473.5,
          },
          {
            id: 37702,
            produto_servico: { id: 1724 },
            qtd: 50000,
            valor_unitario: 0.52947,
            valor_subtotal: 26473.5,
          },
        ],
      };

      // Fails closed early and safely returns null
      expect(normalizeTagPlusNfe(rawWithDuplicates)).toBeNull();
    });

    it("throws when item has no product on outbound NFe (tipo: 'S')", () => {
      const raw = {
        id: 999,
        tipo: "S",
        valor_nota: 100,
        itens: [{ id: 1 }],
      };
      expect(() => normalizeTagPlusNfe(raw)).toThrow(
        SalesNormalizationError,
      );
    });
  });

  describe("isConfirmedInboundTagPlusNfe", () => {
    it("returns sourceId string when tipo is 'E' and id is present", () => {
      expect(isConfirmedInboundTagPlusNfe({ id: 2218, tipo: "E" })).toBe("2218");
      expect(isConfirmedInboundTagPlusNfe({ id: "999", tipo: "E" })).toBe("999");
    });

    it("returns null when tipo is 'S'", () => {
      expect(isConfirmedInboundTagPlusNfe({ id: 2218, tipo: "S" })).toBeNull();
    });

    it("returns null when tipo is missing, null, or unknown (unknown != E)", () => {
      expect(isConfirmedInboundTagPlusNfe({ id: 2218 })).toBeNull();
      expect(isConfirmedInboundTagPlusNfe({ id: 2218, tipo: null })).toBeNull();
      expect(isConfirmedInboundTagPlusNfe({ id: 2218, tipo: "X" })).toBeNull();
    });

    it("returns null when id is missing or null", () => {
      expect(isConfirmedInboundTagPlusNfe({ tipo: "E" })).toBeNull();
      expect(isConfirmedInboundTagPlusNfe({ id: null, tipo: "E" })).toBeNull();
    });

    it("returns null for non-object payloads", () => {
      expect(isConfirmedInboundTagPlusNfe(null)).toBeNull();
      expect(isConfirmedInboundTagPlusNfe(undefined)).toBeNull();
      expect(isConfirmedInboundTagPlusNfe("invalid")).toBeNull();
    });
  });
});
