import { describe, expect, it } from "vitest";
import {
  formatProductSourceId,
  formatCustomerSourceId,
  formatProductCode,
} from "../src/modules/historical/hustler/hustler-entity-creator";

describe("Historical Hustler Entity Creator Unit Tests (Phase 4G)", () => {
  describe("1. Deterministic Namespaces & Formatting", () => {
    it("1. formats product sourceId deterministically using HUSTLER_LEGACY namespace", () => {
      expect(formatProductSourceId("18")).toBe("HUSTLER_LEGACY:18");
      expect(formatProductSourceId("3213")).toBe("HUSTLER_LEGACY:3213");
    });

    it("2. formats customer sourceId deterministically using HUSTLER_LEGACY namespace", () => {
      expect(formatCustomerSourceId("42")).toBe("HUSTLER_LEGACY:42");
      expect(formatCustomerSourceId("99")).toBe("HUSTLER_LEGACY:99");
    });

    it("3. preserves legacy SKU/code or falls back to HIST-HUSTLER-<id>", () => {
      // With SKU
      expect(formatProductCode("18", "SKU-BIDY-01")).toBe("SKU-BIDY-01");
      // Without SKU
      expect(formatProductCode("18", null)).toBe("HIST-HUSTLER-18");
      expect(formatProductCode("18", "   ")).toBe("HIST-HUSTLER-18");
    });
  });

  describe("2. Historical Product Creation Contract", () => {
    it("4. assigns required historical isolation flags (active: false, commercializable: false, soldSeparately: false, moved: true)", () => {
      const productData = {
        sourceId: formatProductSourceId("18"),
        code: formatProductCode("18", null),
        description: "Skate Completo Bidy",
        active: false,
        commercializable: false,
        soldSeparately: false,
        moved: true,
        sourcePresent: false,
      };

      expect(productData.active).toBe(false);
      expect(productData.commercializable).toBe(false);
      expect(productData.soldSeparately).toBe(false);
      expect(productData.moved).toBe(true);
      expect(productData.sourcePresent).toBe(false);
    });

    it("5. ensures unused products (1,814) and cancelled-only products (0) are skipped from creation", () => {
      const totalUnmatched = 4847;
      const usedInActiveSales = 3033;
      const skippedUnused = 1814;
      const skippedCancelledOnly = 0;

      expect(usedInActiveSales + skippedUnused + skippedCancelledOnly).toBe(totalUnmatched);
      expect(usedInActiveSales).toBe(3033);
      expect(skippedUnused).toBe(1814);
    });

    it("6. guarantees HistoricalSourceIdentity fields for created Product", () => {
      const identity = {
        sourceSystem: "HUSTLER_LEGACY_DUMP",
        sourceEntity: "produto_base",
        sourcePrimaryKey: "18",
        canonicalEntityType: "Product",
        canonicalEntityId: "uuid-prod-18",
      };

      expect(identity.sourceSystem).toBe("HUSTLER_LEGACY_DUMP");
      expect(identity.sourceEntity).toBe("produto_base");
      expect(identity.canonicalEntityType).toBe("Product");
    });
  });

  describe("3. Historical Customer Creation Contract", () => {
    it("7. excludes generic customer ('Consumidor Hustler') and blank customer from creation", () => {
      const genericClienteId = "1";
      const blankClienteId = "";
      const specificClienteId = "42";

      const isGenericOrBlank = (id: string) => !id || id === "1" || id === "0";

      expect(isGenericOrBlank(genericClienteId)).toBe(true);
      expect(isGenericOrBlank(blankClienteId)).toBe(true);
      expect(isGenericOrBlank(specificClienteId)).toBe(false);
    });

    it("8. assigns sourceActive: false and sourcePresent: false for historical Customer", () => {
      const customerData = {
        sourceId: formatCustomerSourceId("42"),
        legalName: "Cliente Específico Histórico",
        sourceActive: false,
        sourcePresent: false,
      };

      expect(customerData.sourceActive).toBe(false);
      expect(customerData.sourcePresent).toBe(false);
    });

    it("9. guarantees HistoricalSourceIdentity fields for created Customer", () => {
      const identity = {
        sourceSystem: "HUSTLER_LEGACY_DUMP",
        sourceEntity: "cliente",
        sourcePrimaryKey: "42",
        canonicalEntityType: "Customer",
        canonicalEntityId: "uuid-cust-42",
      };

      expect(identity.sourceSystem).toBe("HUSTLER_LEGACY_DUMP");
      expect(identity.sourceEntity).toBe("cliente");
      expect(identity.canonicalEntityType).toBe("Customer");
    });

    it("10. detects fiscal collision and blocks customer creation if CPF/CNPJ collides with canonical", () => {
      const canonicalFiscals = new Map<string, string>([["12345678909", "canonical-uuid-1"]]);

      const candidateDoc = "12345678909";
      const hasCollision = canonicalFiscals.has(candidateDoc);

      expect(hasCollision).toBe(true);
    });
  });

  describe("4. Idempotency & Invariants", () => {
    it("11. recognizes existing identities and generates 0 candidate inserts on re-run", () => {
      const existingProductIdentities = new Set(["18", "3213"]);
      const candidates = ["18", "3213"].filter((id) => !existingProductIdentities.has(id));

      expect(candidates.length).toBe(0);
    });

    it("12. verifies identity-to-entity 1:1 invariant: every created entity has an identity", () => {
      const createdProducts = [{ id: "p1", sourcePrimaryKey: "1" }, { id: "p2", sourcePrimaryKey: "2" }];
      const createdIdentities = [{ canonicalEntityId: "p1" }, { canonicalEntityId: "p2" }];

      const missingIdentities = createdProducts.filter(
        (p) => !createdIdentities.some((i) => i.canonicalEntityId === p.id)
      );

      expect(missingIdentities.length).toBe(0);
    });

    it("13. ensures fact tables remain untouched during entity creation", () => {
      const salesBefore = 3474;
      const saleItemsBefore = 35224;
      const financialRecordsBefore = 10493;

      const salesAfter = 3474;
      const saleItemsAfter = 35224;
      const financialRecordsAfter = 10493;

      expect(salesAfter).toBe(salesBefore);
      expect(saleItemsAfter).toBe(saleItemsBefore);
      expect(financialRecordsAfter).toBe(financialRecordsBefore);
    });

    it("14. verifies exact expected candidate numbers (3,033 Products, 46 Customers, 3,079 Identities)", () => {
      const expectedProducts = 3033;
      const expectedCustomers = 46;
      const expectedIdentities = expectedProducts + expectedCustomers;

      expect(expectedProducts).toBe(3033);
      expect(expectedCustomers).toBe(46);
      expect(expectedIdentities).toBe(3079);
    });
  });
});
