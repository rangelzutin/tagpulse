import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  SourceSystem,
  OperationUnit,
  SalesChannel,
  HistoricalImportBatchStatus,
} from "@prisma/client";

describe("Historical Provenance and Import Batch Schema (Phase 4A)", () => {
  const models = Prisma.dmmf.datamodel.models;
  const enums = Prisma.dmmf.datamodel.enums;

  describe("Enums", () => {
    it("defines SourceSystem enum with expected values", () => {
      const sourceSystemEnum = enums.find((e) => e.name === "SourceSystem");
      expect(sourceSystemEnum).toBeDefined();
      const values = sourceSystemEnum!.values.map((v) => v.name);
      expect(values).toEqual([
        "TAGPLUS_CURRENT",
        "HUSTLER_LEGACY_DUMP",
        "GLOBALLINK_LEGACY_DUMP",
      ]);

      expect(SourceSystem.TAGPLUS_CURRENT).toBe("TAGPLUS_CURRENT");
      expect(SourceSystem.HUSTLER_LEGACY_DUMP).toBe("HUSTLER_LEGACY_DUMP");
      expect(SourceSystem.GLOBALLINK_LEGACY_DUMP).toBe("GLOBALLINK_LEGACY_DUMP");
    });

    it("defines OperationUnit enum with expected business units", () => {
      const opUnitEnum = enums.find((e) => e.name === "OperationUnit");
      expect(opUnitEnum).toBeDefined();
      const values = opUnitEnum!.values.map((v) => v.name);
      expect(values).toEqual([
        "HUSTLER",
        "NINECLOUDS",
        "SHARED",
        "UNRESOLVED",
      ]);

      expect(OperationUnit.HUSTLER).toBe("HUSTLER");
      expect(OperationUnit.NINECLOUDS).toBe("NINECLOUDS");
      expect(OperationUnit.SHARED).toBe("SHARED");
      expect(OperationUnit.UNRESOLVED).toBe("UNRESOLVED");
    });

    it("defines SalesChannel enum with expected channels", () => {
      const channelEnum = enums.find((e) => e.name === "SalesChannel");
      expect(channelEnum).toBeDefined();
      const values = channelEnum!.values.map((v) => v.name);
      expect(values).toEqual(["VAREJO", "ATACADO"]);

      expect(SalesChannel.VAREJO).toBe("VAREJO");
      expect(SalesChannel.ATACADO).toBe("ATACADO");
    });

    it("defines HistoricalImportBatchStatus enum with lifecycle states", () => {
      const statusEnum = enums.find(
        (e) => e.name === "HistoricalImportBatchStatus",
      );
      expect(statusEnum).toBeDefined();
      const values = statusEnum!.values.map((v) => v.name);
      expect(values).toEqual([
        "CREATED",
        "STAGED",
        "RECONCILED",
        "ACTIVATED",
        "FAILED",
        "ROLLED_BACK",
      ]);

      expect(HistoricalImportBatchStatus.CREATED).toBe("CREATED");
      expect(HistoricalImportBatchStatus.ACTIVATED).toBe("ACTIVATED");
    });
  });

  describe("HistoricalImportBatch Model", () => {
    const hib = models.find((m) => m.name === "HistoricalImportBatch");

    it("exists in the datamodel", () => {
      expect(hib).toBeDefined();
    });

    it("contains all required tracking fields", () => {
      const fieldNames = hib!.fields.map((f) => f.name);
      expect(fieldNames).toContain("id");
      expect(fieldNames).toContain("companyId");
      expect(fieldNames).toContain("sourceSystem");
      expect(fieldNames).toContain("filename");
      expect(fieldNames).toContain("checksumSha256");
      expect(fieldNames).toContain("status");
      expect(fieldNames).toContain("recordsImported");
      expect(fieldNames).toContain("recordsRejected");
      expect(fieldNames).toContain("metadata");
      expect(fieldNames).toContain("createdAt");
      expect(fieldNames).toContain("activatedAt");
    });

    it("has back-relations to Company, facts, source identities, and staging rows", () => {
      const fieldNames = hib!.fields.map((f) => f.name);
      expect(fieldNames).toContain("company");
      expect(fieldNames).toContain("sourceIdentities");
      expect(fieldNames).toContain("sales");
      expect(fieldNames).toContain("sourceDocs");
      expect(fieldNames).toContain("financialRecords");
      expect(fieldNames).toContain("stagingRows");
    });
  });

  describe("HistoricalStagingRow Model (Phase 4C)", () => {
    const hsr = models.find((m) => m.name === "HistoricalStagingRow");

    it("exists in the datamodel", () => {
      expect(hsr).toBeDefined();
    });

    it("contains all required staging fields", () => {
      const fieldNames = hsr!.fields.map((f) => f.name);
      expect(fieldNames).toContain("id");
      expect(fieldNames).toContain("importBatchId");
      expect(fieldNames).toContain("sourceSystem");
      expect(fieldNames).toContain("sourceTable");
      expect(fieldNames).toContain("sourcePrimaryKey");
      expect(fieldNames).toContain("rowIndex");
      expect(fieldNames).toContain("payload");
      expect(fieldNames).toContain("payloadHash");
      expect(fieldNames).toContain("createdAt");
    });

    it("enforces compound unique constraint on [importBatchId, sourceTable, sourcePrimaryKey]", () => {
      expect(hsr!.uniqueFields).toEqual([
        ["importBatchId", "sourceTable", "sourcePrimaryKey"],
      ]);
    });

    it("configures relation to HistoricalImportBatch with onDelete: Cascade", () => {
      const batchField = hsr!.fields.find((f) => f.name === "importBatch");
      expect(batchField).toBeDefined();
      expect(batchField?.relationOnDelete).toBe("Cascade");
    });
  });

  describe("HistoricalSourceIdentity Model", () => {
    const hsi = models.find((m) => m.name === "HistoricalSourceIdentity");

    it("exists in the datamodel", () => {
      expect(hsi).toBeDefined();
    });

    it("contains all required mapping fields", () => {
      const fieldNames = hsi!.fields.map((f) => f.name);
      expect(fieldNames).toContain("id");
      expect(fieldNames).toContain("companyId");
      expect(fieldNames).toContain("importBatchId");
      expect(fieldNames).toContain("sourceSystem");
      expect(fieldNames).toContain("sourceEntity");
      expect(fieldNames).toContain("sourcePrimaryKey");
      expect(fieldNames).toContain("canonicalEntityType");
      expect(fieldNames).toContain("canonicalEntityId");
      expect(fieldNames).toContain("createdAt");
    });

    it("enforces compound unique constraint on [companyId, sourceSystem, sourceEntity, sourcePrimaryKey]", () => {
      expect(hsi!.uniqueFields).toEqual([
        ["companyId", "sourceSystem", "sourceEntity", "sourcePrimaryKey"],
      ]);
    });

    it("does not include importBatchId in the unique constraint to allow idempotent reprocessing", () => {
      const uniqueFields = hsi!.uniqueFields.flat();
      expect(uniqueFields).not.toContain("importBatchId");
    });
  });

  describe("Transactional Fact Provenance", () => {
    it("configures Sale with provenance fields and correct defaults", () => {
      const sale = models.find((m) => m.name === "Sale")!;
      expect(sale).toBeDefined();

      const sourceSystem = sale.fields.find((f) => f.name === "sourceSystem")!;
      expect(sourceSystem).toBeDefined();
      expect(sourceSystem.type).toBe("SourceSystem");
      expect(sourceSystem.isRequired).toBe(true);
      expect(sourceSystem.default).toBe("TAGPLUS_CURRENT");

      const opUnit = sale.fields.find((f) => f.name === "operationUnit")!;
      expect(opUnit).toBeDefined();
      expect(opUnit.type).toBe("OperationUnit");
      expect(opUnit.isRequired).toBe(false);

      const salesChannel = sale.fields.find((f) => f.name === "salesChannel")!;
      expect(salesChannel).toBeDefined();
      expect(salesChannel.type).toBe("SalesChannel");
      expect(salesChannel.isRequired).toBe(false);

      const batchId = sale.fields.find((f) => f.name === "importBatchId")!;
      expect(batchId).toBeDefined();
      expect(batchId.isRequired).toBe(false);
    });

    it("configures SaleSourceDocument with provenance fields and correct defaults", () => {
      const doc = models.find((m) => m.name === "SaleSourceDocument")!;
      expect(doc).toBeDefined();

      const sourceSystem = doc.fields.find((f) => f.name === "sourceSystem")!;
      expect(sourceSystem).toBeDefined();
      expect(sourceSystem.type).toBe("SourceSystem");
      expect(sourceSystem.isRequired).toBe(true);
      expect(sourceSystem.default).toBe("TAGPLUS_CURRENT");

      const opUnit = doc.fields.find((f) => f.name === "operationUnit")!;
      expect(opUnit).toBeDefined();
      expect(opUnit.type).toBe("OperationUnit");
      expect(opUnit.isRequired).toBe(false);

      const batchId = doc.fields.find((f) => f.name === "importBatchId")!;
      expect(batchId).toBeDefined();
      expect(batchId.isRequired).toBe(false);
    });

    it("configures FinancialRecord with provenance fields and correct defaults", () => {
      const fr = models.find((m) => m.name === "FinancialRecord")!;
      expect(fr).toBeDefined();

      const sourceSystem = fr.fields.find((f) => f.name === "sourceSystem")!;
      expect(sourceSystem).toBeDefined();
      expect(sourceSystem.type).toBe("SourceSystem");
      expect(sourceSystem.isRequired).toBe(true);
      expect(sourceSystem.default).toBe("TAGPLUS_CURRENT");

      const opUnit = fr.fields.find((f) => f.name === "operationUnit")!;
      expect(opUnit).toBeDefined();
      expect(opUnit.type).toBe("OperationUnit");
      expect(opUnit.isRequired).toBe(false);

      const batchId = fr.fields.find((f) => f.name === "importBatchId")!;
      expect(batchId).toBeDefined();
      expect(batchId.isRequired).toBe(false);
    });
  });

  describe("Canonical Entities Protection", () => {
    it("does not add direct legacy sourceSystem to Customer", () => {
      const customer = models.find((m) => m.name === "Customer")!;
      const sourceSystem = customer.fields.find(
        (f) => f.name === "sourceSystem",
      );
      expect(sourceSystem).toBeUndefined();
    });

    it("does not add direct legacy sourceSystem to Product", () => {
      const product = models.find((m) => m.name === "Product")!;
      const sourceSystem = product.fields.find((f) => f.name === "sourceSystem");
      expect(sourceSystem).toBeUndefined();
    });
  });
  describe("HistoricalImportBatch Deletion Governance (ON DELETE RESTRICT)", () => {
    it("configures HistoricalSourceIdentity -> HistoricalImportBatch relation with onDelete Restrict", () => {
      const hsi = models.find((m) => m.name === "HistoricalSourceIdentity")!;
      const importBatchRel = hsi.fields.find((f) => f.name === "importBatch")!;
      expect(importBatchRel).toBeDefined();
      expect(importBatchRel.relationOnDelete).toBe("Restrict");
    });

    it("configures Sale -> HistoricalImportBatch relation with onDelete Restrict", () => {
      const sale = models.find((m) => m.name === "Sale")!;
      const importBatchRel = sale.fields.find((f) => f.name === "importBatch")!;
      expect(importBatchRel).toBeDefined();
      expect(importBatchRel.relationOnDelete).toBe("Restrict");
    });

    it("configures SaleSourceDocument -> HistoricalImportBatch relation with onDelete Restrict", () => {
      const doc = models.find((m) => m.name === "SaleSourceDocument")!;
      const importBatchRel = doc.fields.find((f) => f.name === "importBatch")!;
      expect(importBatchRel).toBeDefined();
      expect(importBatchRel.relationOnDelete).toBe("Restrict");
    });

    it("configures FinancialRecord -> HistoricalImportBatch relation with onDelete Restrict", () => {
      const fr = models.find((m) => m.name === "FinancialRecord")!;
      const importBatchRel = fr.fields.find((f) => f.name === "importBatch")!;
      expect(importBatchRel).toBeDefined();
      expect(importBatchRel.relationOnDelete).toBe("Restrict");
    });

    it("preserves importBatchId as nullable across all referencing fact and identity tables", () => {
      const hsi = models.find((m) => m.name === "HistoricalSourceIdentity")!;
      const sale = models.find((m) => m.name === "Sale")!;
      const doc = models.find((m) => m.name === "SaleSourceDocument")!;
      const fr = models.find((m) => m.name === "FinancialRecord")!;

      expect(hsi.fields.find((f) => f.name === "importBatchId")!.isRequired).toBe(false);
      expect(sale.fields.find((f) => f.name === "importBatchId")!.isRequired).toBe(false);
      expect(doc.fields.find((f) => f.name === "importBatchId")!.isRequired).toBe(false);
      expect(fr.fields.find((f) => f.name === "importBatchId")!.isRequired).toBe(false);
    });
  });
});
