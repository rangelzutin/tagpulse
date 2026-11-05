import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient, SourceSystem, HistoricalImportBatchStatus } from "@prisma/client";
import {
  reconcileHustlerSales,
  SaleReadinessStatus,
  NfeValidityStatus,
  RealizationDocumentType,
  TotalMatchClassification,
  OverlapClassification,
} from "../modules/historical/hustler/hustler-sales-reconciler.js";

// 1. Force Load backend/.env.development
const envDevPath = path.resolve(process.cwd(), "backend/.env.development");
const fallbackEnvDevPath = path.resolve(process.cwd(), ".env.development");
const targetEnvPath = fs.existsSync(envDevPath) ? envDevPath : fallbackEnvDevPath;

if (fs.existsSync(targetEnvPath)) {
  dotenv.config({ path: targetEnvPath, override: true });
}

// 2. Strict Production Guard
const dbUrl = process.env.DATABASE_URL || "";
const directUrl = process.env.DIRECT_URL || "";

if (
  dbUrl.includes("szahricoqxzckjytpnmg") ||
  directUrl.includes("szahricoqxzckjytpnmg")
) {
  console.error(
    "\n[FATAL GUARDRAIL] Production database 'szahricoqxzckjytpnmg' detected! Sales reconciliation is strictly forbidden on production.",
  );
  process.exit(1);
}

if (!dbUrl.includes("pkjdzlfxsxulfkzksrow")) {
  console.error(
    "\n[FATAL GUARDRAIL] DATABASE_URL does not point to tagpulse-historical-dev ('pkjdzlfxsxulfkzksrow'). Aborting.",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const explicitBatchId = args.find((a) => !a.startsWith("--"));

function formatCurrency(val: number): string {
  return "R$ " + val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function main() {
  console.log("==================================================");
  console.log("TAGPULSE — HISTORICAL HUSTLER SALES RECONCILIATION DRY-RUN (4E)");
  console.log("==================================================");
  console.log(`Database Target: tagpulse-historical-dev (pkjdzlfxsxulfkzksrow)`);
  console.log(`Execution Mode:  STRICT DRY-RUN (No writes to canonical tables or identities)\n`);

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: dbUrl,
      },
    },
  });

  try {
    // Snapshot canonical counts before
    const [
      customersBefore,
      productsBefore,
      salesBefore,
      saleItemsBefore,
      saleSourceDocsBefore,
      saleSourceDocItemsBefore,
      financialRecordsBefore,
      identitiesBefore,
    ] = await Promise.all([
      prisma.customer.count(),
      prisma.product.count(),
      prisma.sale.count(),
      prisma.saleItem.count(),
      prisma.saleSourceDocument.count(),
      prisma.saleSourceDocumentItem.count(),
      prisma.financialRecord.count(),
      prisma.historicalSourceIdentity.count(),
    ]);

    let targetBatchId = explicitBatchId;
    if (!targetBatchId) {
      const activeBatch = await prisma.historicalImportBatch.findFirst({
        where: {
          sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
          status: HistoricalImportBatchStatus.STAGED,
        },
        orderBy: { createdAt: "desc" },
      });
      if (!activeBatch) {
        throw new Error(
          "No STAGED HistoricalImportBatch found for HUSTLER_LEGACY_DUMP. Run Phase 4C staging first.",
        );
      }
      targetBatchId = activeBatch.id;
    }

    console.log(`Target Batch ID: ${targetBatchId}`);

    const result = await reconcileHustlerSales({
      prisma,
      batchId: targetBatchId,
    });

    console.log(`Company: ${result.companyName} (${result.companyId})\n`);

    console.log("---------------- 1. SALES CLASSIFICATION & READINESS ----------------");
    console.log(`Total Legacy Sales (venda):     ${result.sales.total}`);
    console.log(`Active Sales:                   ${result.sales.active}`);
    console.log(`Cancelled Sales:                ${result.sales.cancelled}`);
    console.log(`Unknown Sales:                  ${result.sales.unknown}`);
    console.log("\nReadiness Breakdown:");
    for (const [status, count] of Object.entries(result.sales.readiness)) {
      console.log(`  ${status.padEnd(24)}: ${count}`);
    }

    console.log("\n---------------- 2. REALIZATION DOCUMENTS ---------------------------");
    console.log(`Realized by Valid NF-e:         ${result.realization.realizedByValidNfe}`);
    console.log(`Realized by Venda Simples (VS): ${result.realization.realizedByVs}`);
    console.log(`Invalid NF-e:                   ${result.realization.invalidNfe}`);
    console.log(`Ambiguous NF-e:                 ${result.realization.ambiguousNfe}`);
    console.log(`Access Key Conflicts:           ${result.realization.accessKeyConflicts}`);
    console.log(`Valid Unique Access Keys:       ${result.realization.validUniqueAccessKeys}`);

    console.log("\n---------------- 3. ITEMS PARTITIONING -------------------------------");
    console.log(`Commercial Items (Linked NFL):  ${result.itemsPartition.commercialLinkedNfl}`);
    console.log(`Non-Sales Items (Excluded NFL): ${result.itemsPartition.nonSalesNfl}`);
    console.log(`Non-Sales Correctly Excluded:   ${result.itemsPartition.nonSalesExcluded}`);

    console.log("\n---------------- 4. PRODUCT RESOLUTION IMPACT -----------------------");
    console.log(`Total Commercial Items:         ${result.productImpact.totalCommercialItems}`);
    console.log(`Resolved Product Items:         ${result.productImpact.resolvedItems}`);
    console.log(`Unresolved Product Items:       ${result.productImpact.unresolvedItems}`);
    console.log(`Sales Fully Resolved:           ${result.productImpact.salesFullyResolved}`);
    console.log(`Sales Partially Unresolved:     ${result.productImpact.salesPartiallyUnresolved}`);
    console.log(`Sales Fully Unresolved:         ${result.productImpact.salesFullyUnresolved}`);
    console.log(`Revenue Unresolved Products:    ${formatCurrency(result.productImpact.revenueAffectedByUnresolvedProducts)}`);

    console.log("\n---------------- 5. CUSTOMER RESOLUTION IMPACT ----------------------");
    console.log(`Sales Customer Resolved:        ${result.customerImpact.salesCustomerResolved}`);
    console.log(`Sales Customer Unresolved:      ${result.customerImpact.salesCustomerUnresolved}`);
    console.log(`Revenue Customer Resolved:      ${formatCurrency(result.customerImpact.revenueCustomerResolved)}`);
    console.log(`Revenue Customer Unresolved:    ${formatCurrency(result.customerImpact.revenueCustomerUnresolved)}`);

    console.log("\n---------------- 6. TOTAL RECONCILIATION ----------------------------");
    console.log(`Exact Total Matches:            ${result.totalReconciliation.totalMatch}`);
    console.log(`Rounding Differences (<= 0.05): ${result.totalReconciliation.roundingDifference}`);
    console.log(`Total Mismatches (> 0.05):      ${result.totalReconciliation.totalMismatch}`);
    console.log(`Undetermined:                   ${result.totalReconciliation.undetermined}`);

    console.log("\n---------------- 7. TRANSITION PERIOD & OVERLAP --------------------");
    console.log(`April 2026 Active Sales:        ${result.transition.aprActive} (${formatCurrency(result.transition.aprRevenue)})`);
    console.log(`May 2026 Active Sales:          ${result.transition.mayActive} (${formatCurrency(result.transition.mayRevenue)})`);
    console.log(`June 2026 Active Sales:         ${result.transition.junActive} (${formatCurrency(result.transition.junRevenue)})`);
    console.log(`Exact Duplicates:               ${result.transition.exactDuplicates}`);
    console.log(`Probable Duplicates:            ${result.transition.probableDuplicates}`);
    console.log(`Ambiguous Overlaps:             ${result.transition.ambiguousOverlaps}`);

    console.log("\n---------------- 8. REVENUE RECONCILIATION --------------------------");
    console.log(`Active Sales Total Revenue:     ${formatCurrency(result.revenue.activeTotal)}`);
    console.log(`  Ready Revenue:                ${formatCurrency(result.revenue.readyTotal)}`);
    console.log(`  Blocked Revenue:              ${formatCurrency(result.revenue.blockedTotal)}`);
    console.log(`Expected Reference Revenue:     R$ 1.144.706,74`);
    console.log(`Difference vs Reference:        ${formatCurrency(result.revenue.referenceDiff)}`);

    // Verify canonical counts after
    const [
      customersAfter,
      productsAfter,
      salesAfter,
      saleItemsAfter,
      saleSourceDocsAfter,
      saleSourceDocItemsAfter,
      financialRecordsAfter,
      identitiesAfter,
    ] = await Promise.all([
      prisma.customer.count(),
      prisma.product.count(),
      prisma.sale.count(),
      prisma.saleItem.count(),
      prisma.saleSourceDocument.count(),
      prisma.saleSourceDocumentItem.count(),
      prisma.financialRecord.count(),
      prisma.historicalSourceIdentity.count(),
    ]);

    console.log("\n---------------- 9. CANONICAL DATABASE INTEGRITY ---------------------");
    console.log(`Customers:              ${customersBefore} -> ${customersAfter} (Diff: ${customersAfter - customersBefore})`);
    console.log(`Products:               ${productsBefore} -> ${productsAfter} (Diff: ${productsAfter - productsBefore})`);
    console.log(`Sales:                  ${salesBefore} -> ${salesAfter} (Diff: ${salesAfter - salesBefore})`);
    console.log(`Sale Items:             ${saleItemsBefore} -> ${saleItemsAfter} (Diff: ${saleItemsAfter - saleItemsBefore})`);
    console.log(`Sale Source Docs:       ${saleSourceDocsBefore} -> ${saleSourceDocsAfter} (Diff: ${saleSourceDocsAfter - saleSourceDocsBefore})`);
    console.log(`Sale Source Doc Items:  ${saleSourceDocItemsBefore} -> ${saleSourceDocItemsAfter} (Diff: ${saleSourceDocItemsAfter - saleSourceDocItemsBefore})`);
    console.log(`Financial Records:      ${financialRecordsBefore} -> ${financialRecordsAfter} (Diff: ${financialRecordsAfter - financialRecordsBefore})`);
    console.log(`Identities:             ${identitiesBefore} -> ${identitiesAfter} (Diff: ${identitiesAfter - identitiesBefore})`);

    const hasCanonicalWrites =
      customersAfter !== customersBefore ||
      productsAfter !== productsBefore ||
      salesAfter !== salesBefore ||
      saleItemsAfter !== saleItemsBefore ||
      saleSourceDocsAfter !== saleSourceDocsBefore ||
      saleSourceDocItemsAfter !== saleSourceDocItemsBefore ||
      financialRecordsAfter !== financialRecordsBefore ||
      identitiesAfter !== identitiesBefore;

    if (hasCanonicalWrites) {
      console.error("\n[CRITICAL ERROR] Canonical database tables or identities were modified during dry-run!");
      process.exit(1);
    } else {
      console.log("\n[PASS] Strict dry-run verified: zero canonical writes occurred.");
    }
  } catch (err: any) {
    console.error("\n[ERROR] Sales reconciliation failed:", err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
