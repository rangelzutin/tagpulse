import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { importHustlerSales } from "../modules/historical/hustler/hustler-sales-importer.js";

// Force load backend/.env.development
const envDevPath = path.resolve(process.cwd(), "backend/.env.development");
const fallbackEnvDevPath = path.resolve(process.cwd(), ".env.development");
const targetEnvPath = fs.existsSync(envDevPath) ? envDevPath : fallbackEnvDevPath;
if (fs.existsSync(targetEnvPath)) {
  dotenv.config({ path: targetEnvPath, override: true });
}

// Production safety guards
const dbUrl = process.env.DATABASE_URL || "";
const directUrl = process.env.DIRECT_URL || "";

if (
  dbUrl.includes("szahricoqxzckjytpnmg") ||
  directUrl.includes("szahricoqxzckjytpnmg")
) {
  console.error("FATAL: Production database detected in DATABASE_URL/DIRECT_URL. Aborting!");
  process.exit(1);
}

if (!dbUrl.includes("pkjdzlfxsxulfkzksrow")) {
  console.error("FATAL: DATABASE_URL does not point to tagpulse-historical-dev (pkjdzlfxsxulfkzksrow). Aborting!");
  process.exit(1);
}

const prisma = new PrismaClient();
const DEFAULT_BATCH_ID = "1b067f48-9b87-4c26-aa16-59339a09e57e";

const args = process.argv.slice(2);
const isPersist = args.includes("--persist");
const batchId = args.find((a) => !a.startsWith("--")) || DEFAULT_BATCH_ID;

async function getTableSizes() {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ relname: string; size: string }>>(
      `SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) as size 
       FROM pg_catalog.pg_statio_user_tables 
       WHERE relname IN ('sales', 'sale_items', 'sale_source_documents', 'sale_source_document_items', 'historical_source_identities') 
       ORDER BY relname;`
    );
    const sizeMap = new Map<string, string>();
    for (const r of rows) {
      sizeMap.set(r.relname, r.size);
    }
    return sizeMap;
  } catch (err) {
    console.warn("Could not query table sizes:", err);
    return new Map<string, string>();
  }
}

async function main() {
  console.log("==================================================");
  console.log("TAGPULSE — HISTORICAL IMPORT HUSTLER: FASE 4I");
  console.log("CONTROLLED SALES PERSISTENCE");
  console.log("==================================================");
  console.log(`Target Batch ID: ${batchId}`);
  console.log(`Target DB: tagpulse-historical-dev (pkjdzlfxsxulfkzksrow)`);
  console.log(`Mode: ${isPersist ? "PERSISTENCE (DB WRITES ENABLED)" : "DRY-RUN (0 DB WRITES)"}`);

  const sizesBefore = await getTableSizes();

  const result = await importHustlerSales(prisma, {
    batchId,
    dryRun: !isPersist,
  });

  const sizesAfter = await getTableSizes();

  console.log("\n--------------------------------------------------");
  console.log("1. PRE-FLIGHT");
  console.log("--------------------------------------------------");
  console.log(`Planned Sales:       ${result.preflight.plannedSales}`);
  console.log(`Planned SaleItems:   ${result.preflight.plannedSaleItems}`);
  console.log(`Planned SSD:         ${result.preflight.plannedSsd}`);
  console.log(`Planned SSDI:        ${result.preflight.plannedSsdi}`);
  console.log(`Planned identities:  ${result.preflight.plannedIdentities}`);
  console.log(`Planned revenue:     R$ ${result.preflight.plannedRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  console.log(`Conflicts:           ${result.preflight.conflicts}`);
  console.log(`Preflight passed:    ${result.preflight.preflightPassed ? "YES" : "NO"}`);

  console.log("\n--------------------------------------------------");
  console.log("2. EXECUTION COUNTS");
  console.log("--------------------------------------------------");
  console.log(`Sales created:       ${result.counts.salesCreated}`);
  console.log(`SaleItems created:   ${result.counts.saleItemsCreated}`);
  console.log(`SSD created:         ${result.counts.ssdCreated}`);
  console.log(`SSDI created:        ${result.counts.ssdiCreated}`);
  console.log(`Identities created:  ${result.counts.identitiesCreated}`);
  console.log(`Skipped existing:    ${result.counts.skippedExisting}`);
  console.log(`Conflicts:           ${result.counts.conflicts}`);
  console.log(`Failed:              ${result.counts.failed}`);

  if (result.postValidation) {
    const pv = result.postValidation;
    console.log("\n--------------------------------------------------");
    console.log("3. HISTORICAL FACT COUNTS");
    console.log("--------------------------------------------------");
    console.log(`Historical Sales:       ${pv.historicalFactCounts.historicalSales}`);
    console.log(`Historical SaleItems:   ${pv.historicalFactCounts.historicalSaleItems}`);
    console.log(`Historical SSD:         ${pv.historicalFactCounts.historicalSsd}`);
    console.log(`Historical SSDI:        ${pv.historicalFactCounts.historicalSsdi}`);
    console.log(`Historical identities:  ${pv.historicalFactCounts.historicalIdentities}`);

    console.log("\n--------------------------------------------------");
    console.log("4. REALIZATION DISTRIBUTION");
    console.log("--------------------------------------------------");
    console.log(`Historical NFE SSD:     ${pv.realizationCounts.nfeSsd}`);
    console.log(`Historical VS SSD:      ${pv.realizationCounts.vsSsd}`);
    console.log(`NFE SSDI:               ${pv.realizationCounts.nfeSsdi}`);
    console.log(`VS SSDI:                ${pv.realizationCounts.vsSsdi}`);
    console.log(`Multiple realization:   ${pv.realizationCounts.multipleRealization}`);

    console.log("\n--------------------------------------------------");
    console.log("5. CUSTOMER DISTRIBUTION");
    console.log("--------------------------------------------------");
    console.log(`Canonical customer sales: ${pv.customerCounts.canonicalCustomerSales}`);
    console.log(`Generic/null sales:       ${pv.customerCounts.genericNullSales}`);
    console.log(`Blank/null sales:         ${pv.customerCounts.blankNullSales}`);
    console.log(`Unresolved customer:      ${pv.customerCounts.unresolved}`);

    console.log("\n--------------------------------------------------");
    console.log("6. QUARANTINE & CANCELLED");
    console.log("--------------------------------------------------");
    console.log(`Quarantined sales imported: ${pv.quarantineCounts.quarantinedSalesImported} (Expected 0)`);
    console.log(`Cancelled sales imported:   ${pv.quarantineCounts.cancelledSalesImported} (Expected 0)`);

    console.log("\n--------------------------------------------------");
    console.log("7. REVENUE RECONCILIATION");
    console.log("--------------------------------------------------");
    console.log(`Realized historical revenue: R$ ${pv.revenue.realizedHistoricalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
    console.log(`Expected revenue:            R$ ${pv.revenue.expectedRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
    console.log(`Revenue reconciles:          ${pv.revenue.revenueReconciles ? "YES" : "NO"}`);

    console.log("\n--------------------------------------------------");
    console.log("8. TRANSITION PERIOD & DATES");
    console.log("--------------------------------------------------");
    console.log(`Apr/2026: ${pv.transition.apr2026Count} sales (R$ ${pv.transition.apr2026Revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`);
    console.log(`May/2026: ${pv.transition.may2026Count} sales (R$ ${pv.transition.may2026Revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`);
    console.log(`Jun/2026: ${pv.transition.jun2026Count} sales (R$ ${pv.transition.jun2026Revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`);
    console.log(`Earliest imported sale: ${pv.transition.earliestSaleDate}`);
    console.log(`Latest imported sale:   ${pv.transition.latestSaleDate}`);

    console.log("\n--------------------------------------------------");
    console.log("9. CANONICAL INVARIANTS POST-PERSISTENCE");
    console.log("--------------------------------------------------");
    console.log(`Product:                ${pv.canonicalCounts.products} (expected 4792)`);
    console.log(`Customer:               ${pv.canonicalCounts.customers} (expected 2926)`);
    console.log(`Sale:                   ${pv.canonicalCounts.sales} (expected 9789)`);
    console.log(`SaleItem:               ${pv.canonicalCounts.saleItems} (expected 46434)`);
    console.log(`SaleSourceDocument:     ${pv.canonicalCounts.saleSourceDocs} (expected 11200)`);
    console.log(`SaleSourceDocumentItem: ${pv.canonicalCounts.saleSourceDocItems} (expected 49163)`);
    console.log(`FinancialRecord:        ${pv.canonicalCounts.financialRecords} (expected 10501)`);
    console.log(`HistoricalIdentity:     ${pv.canonicalCounts.historicalIdentities} (expected 11371)`);

    console.log("\n--------------------------------------------------");
    console.log("10. ENTITY INTEGRITY");
    console.log("--------------------------------------------------");
    console.log(`Historical Sale without identity: ${pv.entityIntegrity.historicalSaleWithoutIdentity} (Expected 0)`);
    console.log(`Historical Sale without SSD:      ${pv.entityIntegrity.historicalSaleWithoutSsd} (Expected 0)`);
    console.log(`Historical Sale with multiple SSD: ${pv.entityIntegrity.historicalSaleWithMultipleSsd} (Expected 0)`);
    console.log(`SaleItems unresolved:            ${pv.entityIntegrity.saleItemsUnresolved} (Expected 0)`);
    console.log(`SSDI unresolved:                 ${pv.entityIntegrity.ssdiUnresolved} (Expected 0)`);
    console.log(`Batch Status:                    ${pv.batchStatus} (Expected STAGED)`);
  }

  console.log("\n--------------------------------------------------");
  console.log("11. DB SIZES");
  console.log("--------------------------------------------------");
  for (const [tbl, sizeBefore] of sizesBefore.entries()) {
    const sizeAfter = sizesAfter.get(tbl) || sizeBefore;
    console.log(`- ${tbl}: before=${sizeBefore}, after=${sizeAfter}`);
  }

  console.log("\n==================================================");
  console.log(`IMPORTER EXECUTION COMPLETE (${isPersist ? "PERSISTENCE" : "DRY-RUN"})`);
  console.log("==================================================");
}

main()
  .catch((err) => {
    console.error("FATAL ERROR in sales importer execution:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
