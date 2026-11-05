import { describe, expect, it } from "vitest";
import {
  EXPECTED_HUSTLER_CHECKSUM,
  EXPECTED_HUSTLER_TABLE_COUNTS,
  TOTAL_EXPECTED_HUSTLER_ROWS,
  getLegacyPrimaryKey,
  canonicalizeJson,
  calculateRowHash,
} from "../src/modules/historical/hustler/hustler-staging.js";
import { HUSTLER_SUPPORTED_TABLES } from "../src/modules/historical/hustler/hustler-schema.js";
import { HistoricalImportBatchStatus } from "@prisma/client";

describe("Historical Hustler Staging Contracts & Utilities (Phase 4C)", () => {
  describe("Legacy Primary Key Extraction", () => {
    it("extracts legacy primary key from row for supported tables", () => {
      const row = { id: 12345, id_empresa: 1, vr_total: "150.00" };
      expect(getLegacyPrimaryKey("venda", row)).toBe("12345");
    });

    it("throws error when 'id' is missing", () => {
      const row = { id_empresa: 1, vr_total: "150.00" };
      expect(() => getLegacyPrimaryKey("venda", row)).toThrow(
        "Legacy primary key 'id' missing, null, or empty for table 'venda'",
      );
    });

    it("throws error when 'id' is null or empty string", () => {
      expect(() => getLegacyPrimaryKey("cliente", { id: null })).toThrow();
      expect(() => getLegacyPrimaryKey("cliente", { id: "" })).toThrow();
      expect(() => getLegacyPrimaryKey("cliente", { id: "   " })).toThrow();
    });
  });

  describe("Canonical JSON Serialization", () => {
    it("produces identical JSON string regardless of key insertion order", () => {
      const objA = { z: "last", a: 1, m: "middle" };
      const objB = { a: 1, m: "middle", z: "last" };
      const objC = { m: "middle", z: "last", a: 1 };

      const jsonA = canonicalizeJson(objA);
      const jsonB = canonicalizeJson(objB);
      const jsonC = canonicalizeJson(objC);

      expect(jsonA).toBe(jsonB);
      expect(jsonB).toBe(jsonC);
      expect(jsonA).toBe('{"a":1,"m":"middle","z":"last"}');
    });

    it("normalizes undefined values to null", () => {
      const obj = { a: 1, b: undefined };
      expect(canonicalizeJson(obj)).toBe('{"a":1,"b":null}');
    });
  });

  describe("Deterministic Row Hash Calculation", () => {
    it("generates deterministic SHA-256 regardless of property order", () => {
      const rowA = { id: "100", nome: "Shape", preco: "299.90" };
      const rowB = { preco: "299.90", id: "100", nome: "Shape" };

      const hashA = calculateRowHash("produto_base", "100", rowA);
      const hashB = calculateRowHash("produto_base", "100", rowB);

      expect(hashA).toBe(hashB);
      expect(hashA).toMatch(/^[0-9a-f]{64}$/);
    });

    it("produces different hash when payload changes", () => {
      const rowA = { id: "100", preco: "299.90" };
      const rowB = { id: "100", preco: "350.00" };

      const hashA = calculateRowHash("produto_base", "100", rowA);
      const hashB = calculateRowHash("produto_base", "100", rowB);

      expect(hashA).not.toBe(hashB);
    });

    it("produces different hash for different tables with same PK and payload", () => {
      const payload = { id: "1", codigo_externo: "X" };

      const hashA = calculateRowHash("cliente", "1", payload);
      const hashB = calculateRowHash("produto_base", "1", payload);

      expect(hashA).not.toBe(hashB);
    });

    it("produces different hash for different PKs", () => {
      const payload = { nome: "Teste" };

      const hashA = calculateRowHash("entidade", "1", payload);
      const hashB = calculateRowHash("entidade", "2", payload);

      expect(hashA).not.toBe(hashB);
    });
  });

  describe("Hustler Dump Contract Constants", () => {
    it("matches expected SHA-256 checksum", () => {
      expect(EXPECTED_HUSTLER_CHECKSUM).toBe(
        "54aa336bf5c7656131f2a4c473241ce6acd9453d1ecdf875fbc85837b592f5eb",
      );
    });

    it("defines counts for all 12 supported tables summing exactly to 69,181", () => {
      const tables = Object.keys(EXPECTED_HUSTLER_TABLE_COUNTS);
      expect(tables.length).toBe(12);
      expect(tables.sort()).toEqual([...HUSTLER_SUPPORTED_TABLES].sort());

      expect(EXPECTED_HUSTLER_TABLE_COUNTS.venda).toBe(6329);
      expect(EXPECTED_HUSTLER_TABLE_COUNTS.nota_fiscal).toBe(10014);
      expect(EXPECTED_HUSTLER_TABLE_COUNTS.nota_fiscal_lancamento).toBe(18542);
      expect(EXPECTED_HUSTLER_TABLE_COUNTS.nfe).toBe(2078);
      expect(EXPECTED_HUSTLER_TABLE_COUNTS.pagamento).toBe(9853);
      expect(EXPECTED_HUSTLER_TABLE_COUNTS.financeiro_lancamento).toBe(11152);
      expect(EXPECTED_HUSTLER_TABLE_COUNTS.produto_base).toBe(5556);
      expect(EXPECTED_HUSTLER_TABLE_COUNTS.cliente).toBe(1326);
      expect(EXPECTED_HUSTLER_TABLE_COUNTS.entidade).toBe(1424);
      expect(EXPECTED_HUSTLER_TABLE_COUNTS.contato).toBe(768);
      expect(EXPECTED_HUSTLER_TABLE_COUNTS.endereco).toBe(785);
      expect(EXPECTED_HUSTLER_TABLE_COUNTS.endereco_entidade).toBe(1354);

      const total = Object.values(EXPECTED_HUSTLER_TABLE_COUNTS).reduce(
        (acc, val) => acc + val,
        0,
      );
      expect(total).toBe(TOTAL_EXPECTED_HUSTLER_ROWS);
      expect(total).toBe(69181);
    });

    it("verifies batch status lifecycle includes CREATED, STAGED, FAILED", () => {
      expect(HistoricalImportBatchStatus.CREATED).toBe("CREATED");
      expect(HistoricalImportBatchStatus.STAGED).toBe("STAGED");
      expect(HistoricalImportBatchStatus.FAILED).toBe("FAILED");
    });
  });
});
