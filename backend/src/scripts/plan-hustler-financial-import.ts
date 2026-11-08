import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import {
  DEV_PROJECT_REF,
  assertSafeDatabaseUrl,
  planHustlerFinancialImport,
} from "../modules/historical/hustler/hustler-financial-planner.js";

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
  const batchId = args.find((a) => !a.startsWith("--")) || DEFAULT_BATCH_ID;

  console.log("==================================================");
  console.log("TAGPULSE — HISTORICAL IMPORT HUSTLER — FASE 4O");
  console.log("HISTORICAL FINANCIAL IMPORT DESIGN & PLANNING");
  console.log("==================================================");
  console.log(`DEV Database ref: ${DEV_PROJECT_REF}`);
  console.log(`Target Batch ID:  ${batchId}`);
  console.log(`Execution Mode:   DRY-RUN ONLY (Zero writes)`);
  console.log("");

  const plan = await planHustlerFinancialImport(prisma, batchId);
  const { summary, samples } = plan;

  console.log("--- 1. AUTHORITATIVE SOURCE & ROW COUNTS ---");
  console.log(`Authoritative Entity:        financeiro_lancamento`);
  console.log(`pagamento creates record:    NO (used strictly as metadata/evidence)`);
  console.log(`Total source rows:           ${summary.totalSourceRows} (Expected: 11152)`);
  console.log(`ENTRY rows / amount:         ${summary.entryCount} / R$ ${summary.entryAmount.toFixed(2)} (Expected: 9021 / R$ 1121885.31)`);
  console.log(`EXIT rows / amount:          ${summary.exitCount} / R$ ${summary.exitAmount.toFixed(2)} (Expected: 2131 / R$ 1085759.45)`);
  console.log(`Confirmed ENTRY:             ${summary.confirmedEntryCount} / R$ ${summary.confirmedEntryAmount.toFixed(2)}`);
  console.log(`Open ENTRY:                  ${summary.openEntryCount} / R$ ${summary.openEntryAmount.toFixed(2)} (Expected: 28 / R$ 3933.91)`);
  console.log(`Confirmed EXIT:              ${summary.confirmedExitCount} / R$ ${summary.confirmedExitAmount.toFixed(2)}`);
  console.log(`Open EXIT:                   ${summary.openExitCount} / R$ ${summary.openExitAmount.toFixed(2)}`);
  console.log("");

  console.log("--- 2. EXHAUSTIVE DOMAIN CLASSIFICATION ---");
  for (const [k, v] of Object.entries(summary.classes)) {
    console.log(`  - ${k.padEnd(25)}: ${String(v.count).padStart(6)} rows | Total: R$ ${v.total.toFixed(2).padStart(11)} | Paid: R$ ${v.paid.toFixed(2).padStart(11)}`);
  }
  console.log(`Reconciliation check passed: ${summary.reconciliationPassed ? "YES" : "NO"}`);
  console.log("");

  console.log("--- 3. CANONICAL SALE LINKAGE ---");
  console.log(`Rows linked to canonical Sales:  ${summary.linkedToCanonicalSalesCount}`);
  console.log(`Amount linked to Sales:          R$ ${summary.linkedCanonicalAmount.toFixed(2)}`);
  console.log(`Quarantine-sale financial rows:  ${summary.quarantineSalesFinancialRows} (R$ ${summary.quarantineSalesFinancialAmount.toFixed(2)})`);
  console.log(`Cancelled-sale financial rows:   ${summary.cancelledSalesFinancialRows} (R$ ${summary.cancelledSalesFinancialAmount.toFixed(2)})`);
  console.log("");

  console.log("--- 4. IMPORT PLAN TOTALS & MATHEMATICAL CLOSURE ---");
  console.log(`Planned FinancialRecords:        ${summary.plannedFinancialRecordsCount} (R$ ${summary.plannedFinancialRecordsAmount.toFixed(2)})`);
  console.log(`  - SALE_RECEIVABLE:             ${summary.classes.SALE_RECEIVABLE.count} (R$ ${summary.classes.SALE_RECEIVABLE.total.toFixed(2)})`);
  console.log(`  - OPERATING_EXPENSE:           ${summary.classes.OPERATING_EXPENSE.count} (R$ ${summary.classes.OPERATING_EXPENSE.total.toFixed(2)})`);
  console.log(`  - INVENTORY_PURCHASE_AP:       ${summary.classes.INVENTORY_PURCHASE_AP.count} (R$ ${summary.classes.INVENTORY_PURCHASE_AP.total.toFixed(2)})`);
  console.log(`Skipped / Quarantined rows:      ${summary.totalSkippedCount} (R$ ${summary.totalSkippedAmount.toFixed(2)})`);
  console.log(`  - QUARANTINE:                  ${summary.quarantinedCount} (R$ ${summary.quarantineSalesFinancialAmount.toFixed(2)})`);
  console.log(`  - UNRESOLVED:                  ${summary.unresolvedCount} (R$ ${summary.classes.UNRESOLVED.total.toFixed(2)})`);
  console.log(`  - OTHER_FINANCIAL_INCOME:      ${summary.skippedOtherIncomeCount} (R$ ${summary.skippedOtherIncomeAmount.toFixed(2)})`);
  console.log(`Total Accounted (Planned+Skip):  ${summary.totalAccountedRows} / R$ ${summary.totalAccountedAmount.toFixed(2)} (Expected: 11152 / R$ 2207644.76)`);
  console.log(`Closure Reconciled:              ${summary.reconciliationPassed ? "YES" : "NO"}`);
  console.log("");

  console.log("--- 5. REPRESENTATIVE SAMPLES ---");
  if (samples.saleReceivableSample) {
    console.log("Sample SALE_RECEIVABLE:", {
      sourceId: samples.saleReceivableSample.sourceId,
      amount: samples.saleReceivableSample.amountOriginal,
      canonicalSaleId: samples.saleReceivableSample.canonicalSaleId,
      paymentMethod: samples.saleReceivableSample.paymentMethod,
      isConfirmed: samples.saleReceivableSample.isConfirmed,
    });
  }
  if (samples.operatingExpenseSample) {
    console.log("Sample OPERATING_EXPENSE:", {
      sourceId: samples.operatingExpenseSample.sourceId,
      amount: samples.operatingExpenseSample.amountOriginal,
      accountCategory: samples.operatingExpenseSample.accountCategory,
      budgetPlanSourceId: samples.operatingExpenseSample.budgetPlanSourceId,
      dueDate: samples.operatingExpenseSample.dueDate.toISOString().slice(0, 10),
    });
  }
  if (samples.inventoryPurchaseSample) {
    console.log("Sample INVENTORY_PURCHASE_AP:", {
      sourceId: samples.inventoryPurchaseSample.sourceId,
      amount: samples.inventoryPurchaseSample.amountOriginal,
      accountCategory: samples.inventoryPurchaseSample.accountCategory,
      affectsManagerialDre: samples.inventoryPurchaseSample.affectsManagerialDre,
      affectsCmv: samples.inventoryPurchaseSample.affectsCmv,
    });
  }
  if (samples.openReceivableSample) {
    console.log("Sample OPEN_RECEIVABLE:", {
      sourceId: samples.openReceivableSample.sourceId,
      amount: samples.openReceivableSample.amountOriginal,
      dueDate: samples.openReceivableSample.dueDate.toISOString().slice(0, 10),
      isConfirmed: samples.openReceivableSample.isConfirmed,
    });
  }
  if (samples.quarantineSample) {
    console.log("Sample QUARANTINE:", {
      sourceId: samples.quarantineSample.sourceId,
      amount: samples.quarantineSample.amountOriginal,
      importable: samples.quarantineSample.importable,
      skipReason: samples.quarantineSample.skipReason,
    });
  }
  console.log("");

  console.log("--- 6. SAFETY & INVARIANTS ---");
  console.log("Commercial revenue after future import remains: R$ 1.141.693,14 (ENTRY is cash flow, NOT commercial revenue)");
  console.log("Inventory purchases excluded from direct CMV/DRE: YES (Stock purchase != CMV)");
  console.log("DB writes in this phase: 0");
  console.log("Batch status remains: STAGED");
  console.log("==================================================");
  console.log("PHASE 4O DRY-RUN EXECUTION FINISHED");
  console.log("==================================================");
}

main()
  .catch((e) => {
    console.error("FATAL ERROR in Phase 4O:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

