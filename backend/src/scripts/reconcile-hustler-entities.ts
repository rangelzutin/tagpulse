import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient, SourceSystem, HistoricalImportBatchStatus } from "@prisma/client";
import {
  reconcileHustlerEntities,
  maskFiscalDoc,
  maskEmail,
} from "../modules/historical/hustler/hustler-reconciler.js";

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
    "\n[FATAL GUARDRAIL] Production database 'szahricoqxzckjytpnmg' detected! Reconciliation is strictly forbidden on production.",
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
const isDryRun = args.includes("--dry-run");
const explicitBatchId = args.find((a) => !a.startsWith("--"));

async function main() {
  console.log("==================================================");
  console.log("TAGPULSE — HISTORICAL HUSTLER RECONCILIATION (4D)");
  console.log("==================================================");
  console.log(`Database Target: tagpulse-historical-dev (pkjdzlfxsxulfkzksrow)`);
  console.log(`Execution Mode:  ${isDryRun ? "DRY-RUN (No identities will be written)" : "PERSISTENCE (Identities will be written)"}\n`);

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: dbUrl,
      },
    },
  });

  try {
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

    console.log(`Target Batch ID: ${targetBatchId}\n`);

    const result = await reconcileHustlerEntities({
      prisma,
      batchId: targetBatchId,
      dryRun: isDryRun,
    });

    console.log("---------------- CUSTOMER RECONCILIATION -----------------");
    console.log(`Total Legacy Customers:         ${result.customers.total}`);
    console.log(`Valid Fiscal Docs:              ${result.customers.validFiscalDocs}`);
    console.log(`Invalid / No Fiscal Docs:       ${result.customers.invalidFiscalDocs}`);
    console.log(`Exact Fiscal Matches:           ${result.customers.exactFiscalMatches}`);
    console.log(`Exact Email Fallback Matches:   ${result.customers.exactEmailMatches}`);
    console.log(`Ambiguous Fiscal:               ${result.customers.ambiguousFiscal}`);
    console.log(`Ambiguous Email:                ${result.customers.ambiguousEmail}`);
    console.log(`Conflicting Evidence:           ${result.customers.conflictingEvidence}`);
    console.log(`Generic Customers:              ${result.customers.generic}`);
    console.log(`Name Evidence Only:             ${result.customers.nameEvidenceOnly}`);
    console.log(`Unmatched:                      ${result.customers.unmatched}`);
    console.log(`Safe Customer Matches (Total):  ${result.customers.safeMatchesCount}`);

    console.log("\n---------------- PRODUCT RECONCILIATION ------------------");
    console.log(`Total Legacy Products:          ${result.products.total}`);
    console.log(`Unique SKUs:                    ${result.products.uniqueSkus}`);
    console.log(`Duplicate SKUs:                 ${result.products.duplicateSkus}`);
    console.log(`Exact SKU Matches:              ${result.products.exactSkuMatches}`);
    console.log(`Exact Barcode Matches:          ${result.products.exactBarcodeMatches}`);
    console.log(`Ambiguous SKU:                  ${result.products.ambiguousSku}`);
    console.log(`Ambiguous Barcode:              ${result.products.ambiguousBarcode}`);
    console.log(`Conflicting Evidence:           ${result.products.conflictingEvidence}`);
    console.log(`Description Evidence Only:      ${result.products.descriptionEvidenceOnly}`);
    console.log(`Unmatched:                      ${result.products.unmatched}`);
    console.log(`Safe Product Matches (Total):   ${result.products.safeMatchesCount}`);

    console.log("\n---------------- IDENTITY PERSISTENCE --------------------");
    console.log(`Customer Identities Created:    ${result.identities.customerCreated}`);
    console.log(`Product Identities Created:     ${result.identities.productCreated}`);
    console.log(`Total Identities Created (Run): ${result.identities.totalCreated}`);
    console.log(`Existing Identical Identities:  ${result.identities.existingIdentical}`);
    console.log(`Identity Conflicts Detected:    ${result.identities.conflicted}`);

    console.log("\n---------------- SANITIZED SAMPLE REVIEW -----------------");
    console.log("[Sample Generic Customers]");
    const genericSamples = result.customers.sampleReview["GENERIC_CUSTOMER"] || [];
    if (genericSamples.length === 0) console.log("  None");
    for (const s of genericSamples) {
      console.log(
        `  - Legacy ID: ${s.legacyClienteId} | Name: ${s.legalName || s.tradeName} | Doc: ${maskFiscalDoc(s.fiscalDoc)} | Reason: ${s.reason}`,
      );
    }

    console.log("\n[Sample Ambiguous Email Customers]");
    const ambigEmailSamples = result.customers.sampleReview["AMBIGUOUS_EMAIL"] || [];
    if (ambigEmailSamples.length === 0) console.log("  None");
    for (const s of ambigEmailSamples) {
      console.log(
        `  - Legacy ID: ${s.legacyClienteId} | Email: ${maskEmail(s.email)} | Reason: ${s.reason}`,
      );
    }

    console.log("\n[Sample Unmatched Customers]");
    const unmatchedCustSamples = result.customers.sampleReview["UNMATCHED"] || [];
    if (unmatchedCustSamples.length === 0) console.log("  None");
    for (const s of unmatchedCustSamples.slice(0, 3)) {
      console.log(
        `  - Legacy ID: ${s.legacyClienteId} | Name: ${s.legalName || s.tradeName} | Doc: ${maskFiscalDoc(s.fiscalDoc)} | Reason: ${s.reason}`,
      );
    }

    console.log("\n[Sample Unmatched Products]");
    const unmatchedProdSamples = result.products.sampleReview["UNMATCHED"] || [];
    if (unmatchedProdSamples.length === 0) console.log("  None");
    for (const s of unmatchedProdSamples.slice(0, 3)) {
      console.log(
        `  - Legacy ID: ${s.legacyProdutoBaseId} | SKU: ${s.legacySku || "N/A"} | Desc: ${s.description?.slice(0, 30)} | Reason: ${s.reason}`,
      );
    }

    console.log("===========================================================\n");
  } catch (err: any) {
    console.error("\n[RECONCILIATION FAILED]:", err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
