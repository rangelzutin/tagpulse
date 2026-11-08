import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import {
  DEV_PROJECT_REF,
  assertSafeDatabaseUrl,
} from "../modules/historical/hustler/hustler-financial-planner.js";
import {
  importHustlerFinancial,
  HustlerFinancialImportResult,
} from "../modules/historical/hustler/hustler-financial-importer.js";

// Force load backend/.env.development
const envDevPath = path.resolve(process.cwd(), "backend/.env.development");
const fallbackEnvDevPath = path.resolve(process.cwd(), ".env.development");
const targetEnvPath = fs.existsSync(envDevPath) ? envDevPath : fallbackEnvDevPath;
if (fs.existsSync(targetEnvPath)) {
  dotenv.config({ path: targetEnvPath, override: true });
}

const dbUrl = process.env.DATABASE_URL || "";
const directUrl = process.env.DIRECT_URL || "";

assertSafeDatabaseUrl(dbUrl, directUrl);

const DEFAULT_BATCH_ID = "1b067f48-9b87-4c26-aa16-59339a09e57e";
const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const isPersist = args.includes("--persist");
  const batchId = args.find((a) => !a.startsWith("--")) || DEFAULT_BATCH_ID;

  console.log("==================================================");
  console.log("TAGPULSE — HISTORICAL IMPORT HUSTLER — FASE 4P");
  console.log("CONTROLLED FINANCIAL PERSISTENCE");
  console.log("==================================================");
  console.log(`DEV Database ref: ${DEV_PROJECT_REF}`);
  console.log(`Target Batch ID:  ${batchId}`);
  console.log(`Execution Mode:   ${isPersist ? "PERSISTENCE (WRITES ENABLED)" : "DRY-RUN (Simulated)"}`);
  console.log("");

  const result: HustlerFinancialImportResult = await importHustlerFinancial(prisma, {
    batchId,
    dryRun: !isPersist,
    chunkSize: 500,
  });

  const { preflight, counts, byClass, postValidation } = result;

  console.log("--- 1. PRE-FLIGHT VALIDATION ---");
  console.log(`Total source rows:             ${preflight.totalSourceRows} (Expected: 11152)`);
  console.log(`Planned FinancialRecords:      ${preflight.plannedFinancialRecords} (Expected: 11094)`);
  console.log(`Planned Amount:                R$ ${preflight.plannedFinancialAmount.toFixed(2)} (Expected: R$ 2200271.78)`);
  console.log(`  - SALE_RECEIVABLE:           ${preflight.saleReceivableCount} (R$ ${preflight.saleReceivableAmount.toFixed(2)})`);
  console.log(`  - OPERATING_EXPENSE:         ${preflight.operatingExpenseCount} (R$ ${preflight.operatingExpenseAmount.toFixed(2)})`);
  console.log(`  - INVENTORY_PURCHASE_AP:     ${preflight.inventoryPurchaseCount} (R$ ${preflight.inventoryPurchaseAmount.toFixed(2)})`);
  console.log(`Skipped Rows:                  ${preflight.totalSkippedCount} (Expected: 58)`);
  console.log(`  - OTHER_FINANCIAL_INCOME:    ${preflight.skippedOtherIncomeCount} (R$ ${preflight.skippedOtherIncomeAmount.toFixed(2)})`);
  console.log(`  - QUARANTINE:                ${preflight.quarantinedCount} (R$ ${preflight.quarantinedAmount.toFixed(2)})`);
  console.log(`  - UNRESOLVED:                ${preflight.unresolvedCount} (R$ ${preflight.unresolvedAmount.toFixed(2)})`);
  console.log(`Conflicts:                     ${preflight.conflicts}`);
  console.log(`Preflight Passed:              ${preflight.preflightPassed ? "YES" : "NO"}`);
  console.log("");

  console.log("--- 2. EXECUTION COUNTS ---");
  console.log(`FinancialRecords created:      ${counts.created}`);
  console.log(`Already existing:              ${counts.alreadyExisting}`);
  console.log(`Skipped (intentionally):       ${counts.skipped}`);
  console.log(`Conflicts:                     ${counts.conflicts}`);
  console.log(`Failed:                        ${counts.failed}`);
  console.log("");

  if (byClass) {
    console.log("--- 3. PERSISTED BY CLASS ---");
    console.log(`SALE_RECEIVABLE:               ${byClass.saleReceivable.count} / R$ ${byClass.saleReceivable.amount.toFixed(2)}`);
    console.log(`OPERATING_EXPENSE:             ${byClass.operatingExpense.count} / R$ ${byClass.operatingExpense.amount.toFixed(2)}`);
    console.log(`INVENTORY_PURCHASE_AP:         ${byClass.inventoryPurchaseAp.count} / R$ ${byClass.inventoryPurchaseAp.amount.toFixed(2)}`);
    console.log("");
  }

  if (postValidation) {
    console.log("--- 4. POST-VALIDATION & INVARIANTS ---");
    console.log(`FinancialRecord before:        ${postValidation.baselineCounts.financialRecordsBefore}`);
    console.log(`FinancialRecord after:         ${postValidation.postCounts.financialRecordsAfter}`);
    console.log(`Historical FinancialRecords:   ${postValidation.postCounts.historicalFinancialRecords}`);
    console.log(`Skipped sourceIds persisted:   ${postValidation.skippedIntegrity.skippedSourceIdsPersisted} (Expected: 0)`);
    console.log(`Product unchanged:             ${postValidation.postCounts.productsUnchanged ? "YES" : "NO"}`);
    console.log(`Customer unchanged:            ${postValidation.postCounts.customersUnchanged ? "YES" : "NO"}`);
    console.log(`Sale unchanged:                ${postValidation.postCounts.salesUnchanged ? "YES" : "NO"}`);
    console.log(`SaleItem unchanged:            ${postValidation.postCounts.saleItemsUnchanged ? "YES" : "NO"}`);
    console.log(`SSD unchanged:                 ${postValidation.postCounts.ssdUnchanged ? "YES" : "NO"}`);
    console.log(`SSDI unchanged:                ${postValidation.postCounts.ssdiUnchanged ? "YES" : "NO"}`);
    console.log(`HistoricalSourceIdentity unch: ${postValidation.postCounts.identitiesUnchanged ? "YES" : "NO"}`);
    console.log(`Commercial revenue before:     R$ ${postValidation.revenueValidation.commercialRevenueBefore.toFixed(2)}`);
    console.log(`Commercial revenue after:      R$ ${postValidation.revenueValidation.commercialRevenueAfter.toFixed(2)}`);
    console.log(`Revenue unchanged:             ${postValidation.revenueValidation.commercialRevenueUnchanged ? "YES" : "NO"}`);
    console.log(`Batch status:                  ${postValidation.batchStatus}`);
    console.log("");

    console.log("--- 5. STATUS & LINKAGE BREAKDOWN ---");
    console.log(`Open receivables:              ${postValidation.statusBreakdown.openReceivablesCount} / R$ ${postValidation.statusBreakdown.openReceivablesAmount.toFixed(2)}`);
    console.log(`Confirmed receivables:         ${postValidation.statusBreakdown.confirmedReceivablesCount} / R$ ${postValidation.statusBreakdown.confirmedReceivablesAmount.toFixed(2)}`);
    console.log(`Open payables:                 ${postValidation.statusBreakdown.openPayablesCount} / R$ ${postValidation.statusBreakdown.openPayablesAmount.toFixed(2)}`);
    console.log(`Confirmed payables:            ${postValidation.statusBreakdown.confirmedPayablesCount} / R$ ${postValidation.statusBreakdown.confirmedPayablesAmount.toFixed(2)}`);
    console.log(`Linked receivables:            ${postValidation.saleLinkage.linkedReceivables} / R$ ${postValidation.saleLinkage.linkedAmount.toFixed(2)}`);
    console.log(`Unlinked legitimate:           ${postValidation.saleLinkage.unlinkedReceivables} / R$ ${postValidation.saleLinkage.unlinkedAmount.toFixed(2)}`);
    console.log(`Ambiguous receivables:         ${postValidation.saleLinkage.ambiguous}`);
    console.log("");
  }

  console.log("==================================================");
  console.log(`PHASE 4P ${isPersist ? "PERSISTENCE" : "DRY-RUN"} COMPLETED SUCCESSFULLY`);
  console.log("==================================================");
}

main()
  .catch((e) => {
    console.error("FATAL ERROR in Phase 4P:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
