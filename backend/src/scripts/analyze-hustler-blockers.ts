import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import {
  analyzeHustlerBlockers,
  NfeBlockerAnalysisItem,
  ReadinessSimulationStep,
} from "../modules/historical/hustler/hustler-blocker-analyzer.js";

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

async function main() {
  const dbUrl = process.env.DATABASE_URL || "";

  // Strict production check
  if (dbUrl.includes(PRODUCTION_PROJECT_REF)) {
    console.error("FATAL: DATABASE_URL points to PRODUCTION! Aborting immediately.");
    process.exit(1);
  }

  if (!dbUrl.includes(EXPECTED_DEV_REF)) {
    console.warn(`WARNING: DATABASE_URL does not contain expected DEV ref ${EXPECTED_DEV_REF}`);
  }

  const prisma = new PrismaClient();

  try {
    const batchId = process.argv[2] || DEFAULT_BATCH_ID;
    console.log(`==================================================`);
    console.log(`TAGPULSE — HISTORICAL IMPORT HUSTLER`);
    console.log(`FASE 4F — ENTITY COMPLETION + BLOCKER RESOLUTION`);
    console.log(`==================================================\n`);
    console.log(`Target Batch ID: ${batchId}`);
    console.log(`Environment: DEV (${EXPECTED_DEV_REF})`);

    // Verify batch
    const batch = await prisma.historicalImportBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      throw new Error(`Batch ${batchId} not found!`);
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

    console.log("\nCanonical Snapshot BEFORE analysis:");
    console.log(`- Customers: ${customersBefore}`);
    console.log(`- Products: ${productsBefore}`);
    console.log(`- Sales: ${salesBefore}`);
    console.log(`- SaleItems: ${saleItemsBefore}`);
    console.log(`- SaleSourceDocuments: ${ssdsBefore}`);
    console.log(`- SaleSourceDocumentItems: ${ssdisBefore}`);
    console.log(`- FinancialRecords: ${financialRecordsBefore}`);
    console.log(`- HistoricalSourceIdentities: ${identitiesBefore}`);

    const result = await analyzeHustlerBlockers(prisma, batchId);

    console.log("\n--------------------------------------------------");
    console.log("1. PRODUCT BLOCKERS ANALYSIS");
    console.log("--------------------------------------------------");
    const pUsage = result.productBlockers.usageSummary;
    console.log(`Total Legacy Products: ${pUsage.totalLegacyProducts}`);
    console.log(`Matched Products (Phase 4D): ${pUsage.matchedProducts}`);
    console.log(`Unmatched Products: ${pUsage.unmatchedProducts}`);
    console.log(`  - Used in Active Sales: ${pUsage.usedInActiveSales}`);
    console.log(`  - Used ONLY in Cancelled Sales: ${pUsage.usedOnlyInCancelledSales}`);
    console.log(`  - Unused in Any Sales: ${pUsage.unusedInSales}`);
    console.log(`  - Sum check: ${pUsage.usedInActiveSales + pUsage.usedOnlyInCancelledSales + pUsage.unusedInSales} === ${pUsage.unmatchedProducts} ? ${pUsage.usedInActiveSales + pUsage.usedOnlyInCancelledSales + pUsage.unusedInSales === pUsage.unmatchedProducts ? "PASS" : "FAIL"}`);

    const pConc = result.productBlockers.concentration;
    console.log(`\nGross Revenue of Unresolved Products: R$ ${pConc.totalUnresolvedProductGrossRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
    console.log(`Concentration Ranks:`);
    console.log(`  - Top 10 products: R$ ${pConc.top10Revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (${pConc.top10Percentage}%)`);
    console.log(`  - Top 25 products: R$ ${pConc.top25Revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (${pConc.top25Percentage}%)`);
    console.log(`  - Top 50 products: R$ ${pConc.top50Revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (${pConc.top50Percentage}%)`);
    console.log(`  - Top 100 products: R$ ${pConc.top100Revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (${pConc.top100Percentage}%)`);
    console.log(`  - Top 250 products: R$ ${pConc.top250Revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (${pConc.top250Percentage}%)`);

    console.log(`\nTop 3 Unresolved Products by Revenue:`);
    pConc.topProducts.slice(0, 3).forEach((p: (typeof pConc.topProducts)[number], idx: number) => {
      console.log(`  #${idx + 1} [ID ${p.legacyProductId}] ${p.description}: ${p.salesCount} sales, R$ ${p.totalGrossRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (${p.percentage}%)`);
    });

    const pSecond = result.productBlockers.secondPass;
    console.log(`\nProduct Second-Pass Re-Match:`);
    console.log(`  - EXACT_NEW_EVIDENCE: ${pSecond.exactNewEvidence}`);
    console.log(`  - STRONG_CANDIDATE: ${pSecond.strongCandidates}`);
    console.log(`  - AMBIGUOUS: ${pSecond.ambiguous}`);
    console.log(`  - NO_CANDIDATE: ${pSecond.noCandidate}`);
    console.log(`  - Historical Product Candidates to Create: ${pSecond.createHistoricalCandidate}`);

    console.log("\n--------------------------------------------------");
    console.log("2. CUSTOMER BLOCKERS ANALYSIS");
    console.log("--------------------------------------------------");
    const cBlock = result.customerBlockers;
    console.log(`Unresolved Specific Customers: ${cBlock.unresolvedSpecificCustomersCount}`);
    console.log(`Active Sales Affected: ${cBlock.salesAffected}`);
    console.log(`Active Revenue Affected: R$ ${cBlock.revenueAffected.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
    console.log(`  - With Fiscal Document (none match canonical): ${cBlock.withFiscalDocCount}`);
    console.log(`  - Without Fiscal Document / Incomplete: ${cBlock.withoutFiscalDocCount}`);
    console.log(`Anonymous Sales Handled (No Customer creation):`);
    console.log(`  - Consumidor Hustler: ${cBlock.anonymousConsumidorSalesCount} sales`);
    console.log(`  - Blank Customer: ${cBlock.anonymousBlankSalesCount} sales`);
    console.log(`Customer Second-Pass Re-Match:`);
    console.log(`  - EXACT_NEW_EVIDENCE: ${cBlock.secondPass.exactNewEvidence}`);
    console.log(`  - STRONG_CANDIDATE: ${cBlock.secondPass.strongCandidates}`);
    console.log(`  - AMBIGUOUS: ${cBlock.secondPass.ambiguous}`);
    console.log(`  - NO_CANDIDATE: ${cBlock.secondPass.noCandidate}`);
    console.log(`  - Historical Customer Candidates to Create: ${cBlock.secondPass.createHistoricalCandidate}`);

    console.log("\n--------------------------------------------------");
    console.log("3. TOTAL MISMATCH BLOCKERS ANALYSIS");
    console.log("--------------------------------------------------");
    const tBlock = result.totalBlockers;
    console.log(`Total Sales with Mismatch: ${tBlock.totalSalesAnalyzed}`);
    console.log(`Total Mismatch Revenue: R$ ${tBlock.totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
    console.log(`  - EXPLAINED_BY_FREIGHT: ${tBlock.explainedByFreightCount} sales (R$ ${tBlock.explainedByFreightRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`);
    console.log(`  - LEGACY_DATA_INCONSISTENCY: ${tBlock.legacyInconsistencyCount} sales (R$ ${tBlock.legacyInconsistencyRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`);
    console.log(`  - EXPLAINED_BY_DISCOUNT: ${tBlock.explainedByDiscountCount}`);
    console.log(`  - EXPLAINED_BY_SURCHARGE: ${tBlock.explainedBySurchargeCount}`);
    console.log(`  - EXPLAINED_BY_ROUNDING: ${tBlock.explainedByRoundingCount}`);
    console.log(`  - UNRESOLVED_TOTAL: ${tBlock.unresolvedCount}`);

    console.log("\n--------------------------------------------------");
    console.log("4. NFE BLOCKERS ANALYSIS");
    console.log("--------------------------------------------------");
    const nBlock = result.nfeBlockers;
    console.log(`Blocked NFe Sales: ${nBlock.totalBlockedNfeSales}`);
    console.log(`Blocked NFe Revenue: R$ ${nBlock.totalBlockedNfeRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
    console.log(`  - INVALID_NFE_BUT_VALID_VS_FALLBACK: ${nBlock.validVsFallbackCount} sales (R$ ${nBlock.validVsFallbackRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`);
    console.log(`  - GENUINE_NFE_CONFLICT: ${nBlock.genuineConflictCount}`);
    console.log(`  - UNRESOLVED_NFE: ${nBlock.unresolvedCount}`);
    nBlock.details.forEach((d: NfeBlockerAnalysisItem) => {
      console.log(`    * Venda ${d.legacyVendaId}: R$ ${d.total.toFixed(2)} | key length ${d.rawAccessKey?.length} | ${d.obs}`);
    });

    console.log("\n--------------------------------------------------");
    console.log("5. READINESS POTENTIAL SIMULATION");
    console.log("--------------------------------------------------");
    const sim = result.readinessSimulation;
    console.log(`Total Active Sales: ${sim.totalActiveSales}`);
    console.log(`Total Active Revenue: R$ ${sim.totalActiveRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
    console.log(`\nSimulation Steps:`);
    sim.steps.forEach((st: ReadinessSimulationStep) => {
      console.log(
        `  ${st.step.padEnd(30)} +${String(st.incrementalSales).padStart(5)} sales (+R$ ${st.incrementalRevenue.toFixed(2).padStart(11)}) -> Cumulative: ${st.cumulativeReadySales} (${st.cumulativeReadySalesPercentage}%) | R$ ${st.cumulativeReadyRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (${st.cumulativeReadyRevenuePercentage}%)`
      );
    });

    console.log(`\nFinal Theoretical Readiness:`);
    console.log(`  - Resolvable Sales: ${sim.maximumResolvableSales} (${sim.maximumResolvableSalesPercentage}%)`);
    console.log(`  - Resolvable Revenue: R$ ${sim.maximumResolvableRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (${sim.maximumResolvableRevenuePercentage}%)`);
    console.log(`  - Unresolvable Sales: ${sim.unresolvableSales} (${sim.unresolvableSalesPercentage}%)`);
    console.log(`  - Unresolvable Revenue: R$ ${sim.unresolvableRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (${sim.unresolvableRevenuePercentage}%)`);

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

    console.log("\nCanonical Snapshot AFTER analysis:");
    console.log(`- Customers: ${customersAfter} (Diff: ${customersAfter - customersBefore})`);
    console.log(`- Products: ${productsAfter} (Diff: ${productsAfter - productsBefore})`);
    console.log(`- Sales: ${salesAfter} (Diff: ${salesAfter - salesBefore})`);
    console.log(`- SaleItems: ${saleItemsAfter} (Diff: ${saleItemsAfter - saleItemsBefore})`);
    console.log(`- SaleSourceDocuments: ${ssdsAfter} (Diff: ${ssdsAfter - ssdsBefore})`);
    console.log(`- SaleSourceDocumentItems: ${ssdisAfter} (Diff: ${ssdisAfter - ssdisBefore})`);
    console.log(`- FinancialRecords: ${financialRecordsAfter} (Diff: ${financialRecordsAfter - financialRecordsBefore})`);
    console.log(`- HistoricalSourceIdentities: ${identitiesAfter} (Diff: ${identitiesAfter - identitiesBefore})`);

    const writesOccurred =
      customersAfter !== customersBefore ||
      productsAfter !== productsBefore ||
      salesAfter !== salesBefore ||
      saleItemsAfter !== saleItemsBefore ||
      ssdsAfter !== ssdsBefore ||
      ssdisAfter !== ssdisBefore ||
      financialRecordsAfter !== financialRecordsBefore ||
      identitiesAfter !== identitiesBefore;

    if (writesOccurred) {
      console.error("\nFATAL: Canonical writes detected during blocker analysis! Invariant violated!");
      process.exit(1);
    } else {
      console.log("\n[PASS] ZERO canonical writes verified. Batch remains STAGED.");
    }
  } catch (err) {
    console.error("Error during blocker analysis:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
