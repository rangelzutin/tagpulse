import { describe, expect, it } from "vitest";
import {
  normalizeCpfCnpj,
  normalizeEmail,
  normalizeSku,
  normalizeBarcode,
  isGenericCustomerName,
  maskFiscalDoc,
  maskEmail,
  CustomerMatchClassification,
  ProductMatchClassification,
} from "../src/modules/historical/hustler/hustler-reconciler.js";

describe("Historical Hustler Reconciler Utilities & Logic (Phase 4D)", () => {
  describe("Fiscal Document Normalization (CPF/CNPJ)", () => {
    it("normalizes formatted CPF to 11 raw digits", () => {
      expect(normalizeCpfCnpj("123.456.789-10")).toBe("12345678910");
      expect(normalizeCpfCnpj("  12345678910  ")).toBe("12345678910");
    });

    it("normalizes formatted CNPJ to 14 raw digits", () => {
      expect(normalizeCpfCnpj("17.105.605/0001-40")).toBe("17105605000140");
      expect(normalizeCpfCnpj("  17105605000140  ")).toBe("17105605000140");
    });

    it("rejects sequences with all repeating digits (dummy documents)", () => {
      expect(normalizeCpfCnpj("000.000.000-00")).toBeNull();
      expect(normalizeCpfCnpj("11111111111")).toBeNull();
      expect(normalizeCpfCnpj("00000000000000")).toBeNull();
    });

    it("rejects invalid length or empty fiscal documents", () => {
      expect(normalizeCpfCnpj("")).toBeNull();
      expect(normalizeCpfCnpj(null)).toBeNull();
      expect(normalizeCpfCnpj(undefined)).toBeNull();
      expect(normalizeCpfCnpj("123456789")).toBeNull(); // 9 digits
      expect(normalizeCpfCnpj("123456789012")).toBeNull(); // 12 digits
    });
  });

  describe("Email Normalization", () => {
    it("normalizes email to trimmed lowercase", () => {
      expect(normalizeEmail("  USER@Domain.COM  ")).toBe("user@domain.com");
    });

    it("rejects invalid email formats", () => {
      expect(normalizeEmail("")).toBeNull();
      expect(normalizeEmail("not-an-email")).toBeNull();
      expect(normalizeEmail("missing@domain")).toBeNull();
      expect(normalizeEmail("@missinguser.com")).toBeNull();
      expect(normalizeEmail(null)).toBeNull();
    });
  });

  describe("Product SKU Normalization", () => {
    it("preserves leading zeros and trims whitespace", () => {
      expect(normalizeSku("  0012345  ")).toBe("0012345");
      expect(normalizeSku("0000")).toBe("0000");
    });

    it("does not convert alphanumeric codes to numbers", () => {
      expect(normalizeSku("2016496272102")).toBe("2016496272102");
      expect(normalizeSku("JROL1501AB07")).toBe("JROL1501AB07");
    });

    it("returns null for empty strings", () => {
      expect(normalizeSku("")).toBeNull();
      expect(normalizeSku("   ")).toBeNull();
      expect(normalizeSku(null)).toBeNull();
    });
  });

  describe("Barcode Normalization", () => {
    it("trims whitespace and preserves barcode string", () => {
      expect(normalizeBarcode(" 7901710504426 ")).toBe("7901710504426");
    });

    it("returns null for empty barcode", () => {
      expect(normalizeBarcode("")).toBeNull();
      expect(normalizeBarcode("   ")).toBeNull();
      expect(normalizeBarcode(null)).toBeNull();
    });
  });

  describe("Generic Customer Detection", () => {
    it("detects generic customer names", () => {
      expect(isGenericCustomerName("Consumidor Hustler", null)).toBe(true);
      expect(
        isGenericCustomerName(null, "CONSUMIDOR HUSTLER SKATE SHOP"),
      ).toBe(true);
      expect(isGenericCustomerName("Cliente Balcao", null)).toBe(true);
      expect(isGenericCustomerName("Cliente Balcão", null)).toBe(true);
      expect(isGenericCustomerName(null, "BALCAO")).toBe(true);
    });

    it("returns false for regular customer names", () => {
      expect(isGenericCustomerName("Rangel Zutin", "Rangel Zutin")).toBe(false);
      expect(isGenericCustomerName(null, "ANDRE ORANGE")).toBe(false);
    });
  });

  describe("Sanitization & PII Masking", () => {
    it("masks CPF correctly", () => {
      expect(maskFiscalDoc("12345678910")).toBe("***.***.***-10");
      expect(maskFiscalDoc("123.456.789-10")).toBe("***.***.***-10");
    });

    it("masks CNPJ correctly", () => {
      expect(maskFiscalDoc("17105605000140")).toBe("**.***.***/****-40");
      expect(maskFiscalDoc("17.105.605/0001-40")).toBe("**.***.***/****-40");
    });

    it("masks email correctly", () => {
      expect(maskEmail("rangel@tagpulse.com")).toBe("r***l@tagpulse.com");
      expect(maskEmail("contato@hustlerskateshop.com.br")).toBe(
        "c***o@hustlerskateshop.com.br",
      );
    });
  });

  describe("Classification Enums", () => {
    it("contains all expected customer match classifications", () => {
      expect(CustomerMatchClassification.MATCH_EXACT_FISCAL).toBe(
        "MATCH_EXACT_FISCAL",
      );
      expect(CustomerMatchClassification.MATCH_EXACT_EMAIL).toBe(
        "MATCH_EXACT_EMAIL",
      );
      expect(CustomerMatchClassification.AMBIGUOUS_FISCAL).toBe(
        "AMBIGUOUS_FISCAL",
      );
      expect(CustomerMatchClassification.AMBIGUOUS_EMAIL).toBe(
        "AMBIGUOUS_EMAIL",
      );
      expect(CustomerMatchClassification.CONFLICTING_EVIDENCE).toBe(
        "CONFLICTING_EVIDENCE",
      );
      expect(CustomerMatchClassification.NAME_EVIDENCE_ONLY).toBe(
        "NAME_EVIDENCE_ONLY",
      );
      expect(CustomerMatchClassification.GENERIC_CUSTOMER).toBe(
        "GENERIC_CUSTOMER",
      );
      expect(CustomerMatchClassification.UNMATCHED).toBe("UNMATCHED");
    });

    it("contains all expected product match classifications", () => {
      expect(ProductMatchClassification.MATCH_EXACT_SKU).toBe(
        "MATCH_EXACT_SKU",
      );
      expect(ProductMatchClassification.MATCH_EXACT_BARCODE).toBe(
        "MATCH_EXACT_BARCODE",
      );
      expect(ProductMatchClassification.AMBIGUOUS_SKU).toBe("AMBIGUOUS_SKU");
      expect(ProductMatchClassification.AMBIGUOUS_BARCODE).toBe(
        "AMBIGUOUS_BARCODE",
      );
      expect(ProductMatchClassification.CONFLICTING_EVIDENCE).toBe(
        "CONFLICTING_EVIDENCE",
      );
      expect(ProductMatchClassification.DESCRIPTION_EVIDENCE_ONLY).toBe(
        "DESCRIPTION_EVIDENCE_ONLY",
      );
      expect(ProductMatchClassification.UNMATCHED).toBe("UNMATCHED");
    });
  });
});
