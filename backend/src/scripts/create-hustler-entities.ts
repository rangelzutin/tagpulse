import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient, SourceSystem, HistoricalImportBatchStatus } from "@prisma/client";
import {
  planHustlerHistoricalEntities,
  persistHustlerHistoricalEntities,
} from "../modules/historical/hustler/hustler-entity-creator.js";

// 1. Force Load backend/.env.development
const envDevPath = path.resolve(process.cwd(), "backend/.env.development");
const fallbackEnvDevPath = path.resolve(process.cwd(), ".env.development");
const targetEnvPath = fs.existsSync(envDevPath) ? envDevPath : fallbackEnvDevPath;
if (targetEnvPath) {
  dotenv.config({ path: targetEnvPath, override: true });
}

const PRODUCTION_PROJECT_REF = "szahricoqxzckjytpnmg";
const EXPECTED_DEV_REF = "pkjdzlfxsxulfkzksrow";
const DEFAULT_BATCH_ID = "1b067f48-9b87-4c26-aa16-59339a09e57e";

async function getTableSizes(prisma: PrismaClient) {
  try {
    const res: Array<{ table_name: string; total_bytes: string; pretty_size: string }> =
      await prisma.$queryRaw`
        SELECT 
          relname AS table_name,
          pg_total_relation_size(c.oid)::text AS total_bytes,
          pg_size_pretty(pg_total_relation_size(c.oid)) AS pretty_size
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND relname IN ('products', 'customers', 'historical_source_identities')
        ORDER BY relname;
      `;
    const map = new Map<string, { bytes: number; pretty: string }>();
    for (const r of res) {
      map.set(r.table_name, { bytes: parseInt(r.total_bytes, 10), pretty: r.pretty_size });
    }
    return map;
  } catch (e) {
    return new Map<string, { bytes: number; pretty: string }>();
  }
}

async function main() {
  const dbUrl = process.env.DATABASE_URL || "";
  const directUrl = process.env.DIRECT_URL || "";

  // Strict production check
  if (dbUrl.includes(PRODUCTION_PROJECT_REF) || directUrl.includes(PRODUCTION_PROJECT_REF)) {
    console.error("FATAL: DATABASE_URL points to PRODUCTION! Aborting immediately.");
    process.exit(1);
  }

  if (!dbUrl.includes(EXPECTED_DEV_REF)) {
    console.error(`FATAL: DATABASE_URL does not point to DEV ref ${EXPECTED_DEV_REF}. Aborting.`);
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const isPersist = args.includes("--persist");
  const batchId = args.find((a) => !a.startsWith("--")) || DEFAULT_BATCH_ID;

  const prisma = new PrismaClient();

  try {
    console.log(`==================================================`);
    console.log(`TAGPULSE — HISTORICAL IMPORT HUSTLER`);
    console.log(`FASE 4G — CONTROLLED HISTORICAL ENTITY CREATION`);
    console.log(`==================================================\n`);
    console.log(`Mode: ${isPersist ? "PERSIST (Writing to DEV)" : "DRY-RUN (Zero writes)"}`);
    console.log(`Target Batch ID: ${batchId}`);
    console.log(`Environment: DEV (${EXPECTED_DEV_REF})`);

    // Verify batch
    const batch = await prisma.historicalImportBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      throw new Error(`Batch ${batchId} not found!`);
    }

    if (batch.sourceSystem !== SourceSystem.HUSTLER_LEGACY_DUMP) {
      throw new Error(`Batch ${batchId} sourceSystem is ${batch.sourceSystem}. Expected HUSTLER_LEGACY_DUMP.`);
    }

    if (batch.status !== HistoricalImportBatchStatus.STAGED) {
      throw new Error(`Batch ${batchId} status is ${batch.status}. Expected STAGED.`);
    }

    console.log(`Batch Status: ${batch.status}`);
    console.log(`Batch Checksum: ${batch.checksumSha256}`);

    // Snapshot canonical counts before
    const [
      customersBefore,
      productsBefore,
      salesBefore,
      saleItemsBefore,
      ssdsBefore,
      ssdisBefore,
      financialRecordsBefore,
      identitiesBefore,
      prodIdentitiesBefore,
      custIdentitiesBefore,
      sizesBefore,
    ] = await Promise.all([
      prisma.customer.count(),
      prisma.product.count(),
      prisma.sale.count(),
      prisma.saleItem.count(),
      prisma.saleSourceDocument.count(),
      prisma.saleSourceDocumentItem.count(),
      prisma.financialRecord.count(),
      prisma.historicalSourceIdentity.count(),
      prisma.historicalSourceIdentity.count({ where: { sourceEntity: "produto_base" } }),
      prisma.historicalSourceIdentity.count({ where: { sourceEntity: "cliente" } }),
      getTableSizes(prisma),
    ]);

    console.log("\nCanonical Snapshot BEFORE:");
    console.log(`- Customers: ${customersBefore}`);
    console.log(`- Products: ${productsBefore}`);
    console.log(`- Sales: ${salesBefore}`);
    console.log(`- SaleItems: ${saleItemsBefore}`);
    console.log(`- SaleSourceDocuments: ${ssdsBefore}`);
    console.log(`- SaleSourceDocumentItems: ${ssdisBefore}`);
    console.log(`- FinancialRecords: ${financialRecordsBefore}`);
    console.log(`- HistoricalSourceIdentities: ${identitiesBefore} (Product: ${prodIdentitiesBefore}, Customer: ${custIdentitiesBefore})`);

    console.log("\nTable Sizes BEFORE:");
    console.log(`- products: ${sizesBefore.get("products")?.pretty || "N/A"}`);
    console.log(`- customers: ${sizesBefore.get("customers")?.pretty || "N/A"}`);
    console.log(`- historical_source_identities: ${sizesBefore.get("historical_source_identities")?.pretty || "N/A"}`);

    // Execute entity creation / planning
    const result = await persistHustlerHistoricalEntities(prisma, batchId, {
      persist: isPersist,
      chunkSize: 100,
    });

    console.log("\n--------------------------------------------------");
    console.log("PLAN / DRY-RUN RESULTS:");
    console.log("--------------------------------------------------");
    console.log(`Product Candidates to Create: ${result.plan.summary.productCandidatesCount}`);
    console.log(`Customer Candidates to Create: ${result.plan.summary.customerCandidatesCount}`);
    console.log(`Total Identity Candidates to Create: ${result.plan.summary.totalIdentityCandidatesCount}`);
    console.log(`Skipped Unused Products (remain in staging): ${result.plan.summary.skippedUnusedProductsCount}`);
    console.log(`Skipped Cancelled-Only Products: ${result.plan.summary.skippedCancelledOnlyProductsCount}`);
    console.log(`Customer Fiscal Collisions: ${result.plan.summary.fiscalCollisionsCount}`);
    console.log(`Ready to Persist: ${result.plan.summary.isReadyToPersist ? "YES" : "NO"}`);

    if (isPersist) {
      console.log("\n--------------------------------------------------");
      console.log("PERSISTENCE EXECUTION RESULTS:");
      console.log("--------------------------------------------------");
      console.log(`Products Created: ${result.productsCreated}`);
      console.log(`Product Identities Created: ${result.productIdentitiesCreated}`);
      console.log(`Customers Created: ${result.customersCreated}`);
      console.log(`Customer Identities Created: ${result.customerIdentitiesCreated}`);
      console.log(`Total Identities Created: ${result.totalIdentitiesCreated}`);
    }

    // Snapshot canonical counts after
    const [
      customersAfter,
      productsAfter,
      salesAfter,
      saleItemsAfter,
      ssdsAfter,
      ssdisAfter,
      financialRecordsAfter,
      identitiesAfter,
      prodIdentitiesAfter,
      custIdentitiesAfter,
      sizesAfter,
    ] = await Promise.all([
      prisma.customer.count(),
      prisma.product.count(),
      prisma.sale.count(),
      prisma.saleItem.count(),
      prisma.saleSourceDocument.count(),
      prisma.saleSourceDocumentItem.count(),
      prisma.financialRecord.count(),
      prisma.historicalSourceIdentity.count(),
      prisma.historicalSourceIdentity.count({ where: { sourceEntity: "produto_base" } }),
      prisma.historicalSourceIdentity.count({ where: { sourceEntity: "cliente" } }),
      getTableSizes(prisma),
    ]);

    console.log("\nCanonical Snapshot AFTER:");
    console.log(`- Customers: ${customersAfter} (Diff: +${customersAfter - customersBefore})`);
    console.log(`- Products: ${productsAfter} (Diff: +${productsAfter - productsBefore})`);
    console.log(`- Sales: ${salesAfter} (Diff: +${salesAfter - salesBefore})`);
    console.log(`- SaleItems: ${saleItemsAfter} (Diff: +${saleItemsAfter - saleItemsBefore})`);
    console.log(`- SaleSourceDocuments: ${ssdsAfter} (Diff: +${ssdsAfter - ssdsBefore})`);
    console.log(`- SaleSourceDocumentItems: ${ssdisAfter} (Diff: +${ssdisAfter - ssdisBefore})`);
    console.log(`- FinancialRecords: ${financialRecordsAfter} (Diff: +${financialRecordsAfter - financialRecordsBefore})`);
    console.log(`- HistoricalSourceIdentities: ${identitiesAfter} (Diff: +${identitiesAfter - identitiesBefore}) (Product: ${prodIdentitiesAfter}, Customer: ${custIdentitiesAfter})`);

    console.log("\nTable Sizes AFTER:");
    console.log(`- products: ${sizesAfter.get("products")?.pretty || "N/A"}`);
    console.log(`- customers: ${sizesAfter.get("customers")?.pretty || "N/A"}`);
    console.log(`- historical_source_identities: ${sizesAfter.get("historical_source_identities")?.pretty || "N/A"}`);

    // Verify invariants
    const factsUntouched =
      salesAfter === salesBefore &&
      saleItemsAfter === saleItemsBefore &&
      ssdsAfter === ssdsBefore &&
      ssdisAfter === ssdisBefore &&
      financialRecordsAfter === financialRecordsBefore;

    console.log(`\nFact tables untouched: ${factsUntouched ? "YES" : "NO"}`);

    if (isPersist) {
      // Invariant checks on created entities
      const [
        prodsWithoutId,
        custsWithoutId,
        activeHistProds,
        commHistProds,
        soldSepHistProds,
        activeHistCusts,
      ] = await Promise.all([
        prisma.$queryRaw<any[]>`
          SELECT p.id FROM products p
          WHERE p.source_id LIKE 'HUSTLER_LEGACY:%'
            AND NOT EXISTS (
              SELECT 1 FROM historical_source_identities i 
              WHERE i.canonical_entity_id = p.id AND i.canonical_entity_type = 'Product'
            )
        `,
        prisma.$queryRaw<any[]>`
          SELECT c.id FROM customers c
          WHERE c.source_id LIKE 'HUSTLER_LEGACY:%'
            AND NOT EXISTS (
              SELECT 1 FROM historical_source_identities i 
              WHERE i.canonical_entity_id = c.id AND i.canonical_entity_type = 'Customer'
            )
        `,
        prisma.product.count({ where: { sourceId: { startsWith: "HUSTLER_LEGACY:" }, active: true } }),
        prisma.product.count({ where: { sourceId: { startsWith: "HUSTLER_LEGACY:" }, commercializable: true } }),
        prisma.product.count({ where: { sourceId: { startsWith: "HUSTLER_LEGACY:" }, soldSeparately: true } }),
        prisma.customer.count({ where: { sourceId: { startsWith: "HUSTLER_LEGACY:" }, sourceActive: true } }),
      ]);

      console.log("\nEntity Invariant Checks:");
      console.log(`- Products without identity: ${prodsWithoutId.length} (Expected 0)`);
      console.log(`- Customers without identity: ${custsWithoutId.length} (Expected 0)`);
      console.log(`- Historical Products active=true: ${activeHistProds} (Expected 0)`);
      console.log(`- Historical Products commercializable=true: ${commHistProds} (Expected 0)`);
      console.log(`- Historical Products soldSeparately=true: ${soldSepHistProds} (Expected 0)`);
      console.log(`- Historical Customers sourceActive=true: ${activeHistCusts} (Expected 0)`);

      const pass =
        prodsWithoutId.length === 0 &&
        custsWithoutId.length === 0 &&
        activeHistProds === 0 &&
        commHistProds === 0 &&
        soldSepHistProds === 0 &&
        activeHistCusts === 0 &&
        factsUntouched;

      console.log(`\nOverall Invariant Status: ${pass ? "PASS" : "FAIL"}`);
    } else {
      console.log("\n[PASS] DRY-RUN completed with zero database writes.");
    }
  } catch (err) {
    console.error("Error during entity creation:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
