import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import {
  DEV_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  assertSafeDatabaseUrl,
} from "../modules/historical/hustler/hustler-financial-planner.js";
import {
  activateHustlerBatch,
  preflightHustlerActivation,
  EXPECTED_HUSTLER_BATCH_ID,
} from "../modules/historical/hustler/hustler-activator.js";

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

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const isExecute = args.includes("--execute");
  const batchId = args.find((a) => !a.startsWith("--")) || EXPECTED_HUSTLER_BATCH_ID;

  console.log("==================================================");
  console.log("TAGPULSE — HISTORICAL IMPORT HUSTLER — FASE 4S");
  console.log("FINAL ACTIVATION & PROJECT CLOSURE");
  console.log("==================================================");
  console.log(`DEV Database ref:      ${DEV_PROJECT_REF}`);
  console.log(`Blocked Production:    ${PRODUCTION_PROJECT_REF}`);
  console.log(`Target Batch ID:       ${batchId}`);
  console.log(`Mode:                  ${isExecute ? "EXECUTE (APPLY ACTIVATION)" : "DRY RUN (PREFLIGHT ONLY)"}`);
  console.log("==================================================");

  // 1. Run Preflight Validation
  console.log("\n[1/3] Executing Activation Preflight Checks...");
  const preflight = await preflightHustlerActivation(prisma, batchId);

  console.log(`\nBatch Status:            ${preflight.currentStatus}`);
  console.log(`Source System:           ${preflight.sourceSystem}`);
  console.log(`Preflight Passed:        ${preflight.passed ? "YES" : "NO"}`);

  console.log("\nCanonical Counts Verified:");
  console.log(`  Products:              ${preflight.counts.products} (expected 4792)`);
  console.log(`  Customers:             ${preflight.counts.customers} (expected 2926)`);
  console.log(`  Sales:                 ${preflight.counts.sales} (expected 9789)`);
  console.log(`  SaleItems:             ${preflight.counts.saleItems} (expected 46434)`);
  console.log(`  SSDs:                  ${preflight.counts.ssds} (expected 11200)`);
  console.log(`  SSDIs:                 ${preflight.counts.ssdis} (expected 49163)`);
  console.log(`  HSIs:                  ${preflight.counts.hsis} (expected 11371)`);
  console.log(`  FinancialRecords:      ${preflight.counts.financialRecords} (expected 21595)`);

  console.log("\nTruth Set Verified:");
  console.log(`  Legacy Sales:          ${preflight.historicalCommercial.salesCount} (R$ ${preflight.historicalCommercial.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`);
  console.log(`  Current Factual Sales: ${preflight.factualHustler.currentLevelASales} (R$ 2.819,60)`);
  console.log(`  Combined Factual:      ${preflight.factualHustler.combinedSales} (R$ ${preflight.factualHustler.combinedRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`);
  console.log(`  Level C Excluded:      ${preflight.factualHustler.levelCExcluded ? "YES" : "NO"}`);
  console.log(`  Historical Financial:  ${preflight.historicalFinancial.recordsCount} (R$ ${preflight.historicalFinancial.totalAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`);
  console.log(`  Operating Expenses:    ${preflight.historicalFinancial.operatingExpensesCount} (R$ ${preflight.historicalFinancial.operatingExpensesAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`);
  console.log(`  Inventory / AP:        ${preflight.historicalFinancial.inventoryPurchasesCount} (R$ ${preflight.historicalFinancial.inventoryPurchasesAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`);

  console.log("\nExclusions Verified:");
  console.log(`  Commercial Quarantine: leak = ${preflight.exclusions.commercialQuarantineLeak}`);
  console.log(`  Financial Other:       leak = ${preflight.exclusions.financialOtherLeak}`);
  console.log(`  Financial Quarantine:  leak = ${preflight.exclusions.financialQuarantineLeak}`);
  console.log(`  Unresolved:            leak = ${preflight.exclusions.unresolvedLeak}`);

  if (!preflight.passed) {
    console.error("\nPREFLIGHT CHECKS FAILED:");
    for (const err of preflight.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log("\n[2/3] Preflight validation PASSED completely.");

  if (!isExecute) {
    console.log("\n[3/3] DRY RUN COMPLETE. No data was modified.");
    console.log("Run with '--execute' to perform the administrative activation transition.");
    return;
  }

  // 2. Execute Activation
  console.log("\n[3/3] Executing Activation Transition...");
  const result = await activateHustlerBatch(prisma, batchId);

  console.log("\nACTIVATION RESULT:");
  console.log(`  Batch ID:              ${result.batchId}`);
  console.log(`  Previous Status:       ${result.previousStatus}`);
  console.log(`  Current Status:        ${result.currentStatus}`);
  console.log(`  Already Activated:     ${result.alreadyActivated ? "YES (IDEMPOTENT NO-OP)" : "NO (FIRST ACTIVATION)"}`);
  console.log(`  Activated At:          ${result.activatedAt.toISOString()}`);
  console.log("==================================================");
  console.log("HISTORICAL HUSTLER IMPORT: FORMALLY ACTIVATED");
  console.log("==================================================");
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
