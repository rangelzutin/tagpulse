import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import {
  DEV_PROJECT_REF,
  assertSafeDatabaseUrl,
  planCurrentHustlerAttribution,
  persistCurrentHustlerAttribution,
  validateCombinedHustlerTruthSet,
} from "../modules/historical/hustler/hustler-current-persister.js";

// Force load backend/.env.development
const envDevPath = path.resolve(process.cwd(), "backend/.env.development");
const fallbackEnvDevPath = path.resolve(process.cwd(), ".env.development");
const targetEnvPath = fs.existsSync(envDevPath) ? envDevPath : fallbackEnvDevPath;
if (fs.existsSync(targetEnvPath)) {
  dotenv.config({ path: targetEnvPath, override: true });
}

const dbUrl = process.env.DATABASE_URL || "";
const directUrl = process.env.DIRECT_URL || "";

// Guard against production
assertSafeDatabaseUrl(dbUrl, directUrl);

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const isPersist = args.includes("--persist");

  console.log("==================================================");
  console.log("TAGPULSE — HISTORICAL IMPORT HUSTLER — FASE 4M");
  console.log("CONTROLLED CURRENT HUSTLER OPERATIONUNIT PERSISTENCE");
  console.log("==================================================");
  console.log(`DEV Database ref: ${DEV_PROJECT_REF}`);
  console.log(`Execution Mode:   ${isPersist ? "PERSIST (Writing to DEV)" : "DRY-RUN (Zero writes)"}`);
  console.log("");

  // 1. Plan & Pre-flight
  console.log("--- 1. PRE-FLIGHT AUDIT ---");
  const plan = await planCurrentHustlerAttribution(prisma);

  console.log(`Total TAGPLUS_CURRENT sales:     ${plan.totalCurrentSales}`);
  console.log(`Total current revenue:           R$ ${plan.totalCurrentRevenue.toFixed(2)}`);
  console.log(`Target Sales (CONSUMIDOR HUSTLER): ${plan.targetSalesCount}`);
  console.log(`Target revenue:                  R$ ${plan.targetRevenue.toFixed(2)}`);
  console.log(`All targets LEVEL_A:             ${plan.allTargetsLevelA ? "YES" : "NO"}`);
  console.log(`All targets null or HUSTLER:     ${plan.allTargetsCurrentlyNullOrHustler ? "YES" : "NO"}`);
  console.log(`Pending updates:                 ${plan.pendingUpdates.length}`);
  console.log(`Already correct:                 ${plan.alreadyCorrect.length}`);
  console.log(`Conflicts:                       ${plan.conflicts.length}`);
  console.log(`LEVEL_C candidates isolated:     ${plan.levelCExcludedCount} sales (R$ ${plan.levelCExcludedRevenue.toFixed(2)})`);
  console.log(`Pre-flight status:               ${plan.preflightPassed ? "PASSED" : "FAILED"}`);
  console.log("");

  if (!plan.preflightPassed && plan.conflicts.length > 0) {
    console.error("FATAL: Pre-flight failed due to conflicting sales. Aborting!");
    process.exit(1);
  }

  // List target sales
  console.log("Target Sales Details:");
  for (const t of plan.targetSales) {
    console.log(
      `  - ID: ${t.id} | Anchor: ${t.anchorType} #${t.anchorSourceId} | Date: ${t.commercialDate?.toISOString().slice(0, 10)} | Net: R$ ${t.netAmount.toFixed(2)} | Current: ${t.currentOperationUnit ?? "null"} | Status: ${t.status}`,
    );
  }
  console.log("");

  // 2. Persistence execution
  console.log(`--- 2. EXECUTION (${isPersist ? "PERSIST" : "DRY-RUN"}) ---`);
  const result = await persistCurrentHustlerAttribution(prisma, plan, isPersist);

  console.log(`isPersist:                       ${result.isPersist}`);
  console.log(`Updated:                         ${result.updated}`);
  console.log(`Already correct:                 ${result.alreadyCorrect}`);
  console.log(`Conflicts:                       ${result.conflicts}`);
  console.log(`Failed:                          ${result.failed}`);
  console.log(`Idempotent:                      ${result.idempotent ? "YES" : "NO"}`);
  console.log("");

  // 3. Combined Factual Truth-Set
  console.log("--- 3. COMBINED FACTUAL HUSTLER TRUTH-SET ---");
  const combined = await validateCombinedHustlerTruthSet(prisma);
  console.log(`Legacy Sales (Dump):             ${combined.legacyCount}`);
  console.log(`Legacy Revenue:                  R$ ${combined.legacyRevenue.toFixed(2)}`);
  console.log(`Current Factual Sales (LEVEL A): ${combined.currentCount}`);
  console.log(`Current Factual Revenue:         R$ ${combined.currentRevenue.toFixed(2)}`);
  console.log(`Combined Factual Sales:          ${combined.combinedCount}`);
  console.log(`Combined Factual Revenue:        R$ ${combined.combinedRevenue.toFixed(2)}`);
  console.log(`Legacy Latest Commercial Date:   ${combined.legacyLatest?.toISOString().slice(0, 10)}`);
  console.log(`Current Earliest Factual Date:   ${combined.currentEarliest?.toISOString().slice(0, 10)}`);
  console.log(`Exact Duplicates:                ${combined.exactDuplicates}`);
  console.log(`Probable Duplicates:             ${combined.probableDuplicates}`);
  console.log("");

  console.log("==================================================");
  console.log("PHASE 4M EXECUTION FINISHED");
  console.log("==================================================");
}

main()
  .catch((e) => {
    console.error("FATAL ERROR in Phase 4M:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
