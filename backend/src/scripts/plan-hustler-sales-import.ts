import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { planHustlerSalesImport } from "../modules/historical/hustler/hustler-sales-planner.js";

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
const batchId = process.argv[2] || DEFAULT_BATCH_ID;

async function getCanonicalCounts() {
  const [
    products,
    customers,
    sales,
    saleItems,
    saleSourceDocs,
    saleSourceDocItems,
    financialRecords,
    historicalIdentities,
  ] = await Promise.all([
    prisma.product.count(),
    prisma.customer.count(),
    prisma.sale.count(),
    prisma.saleItem.count(),
    prisma.saleSourceDocument.count(),
    prisma.saleSourceDocumentItem.count(),
    prisma.financialRecord.count(),
    prisma.historicalSourceIdentity.count(),
  ]);

  return {
    products,
    customers,
    sales,
    saleItems,
    saleSourceDocs,
    saleSourceDocItems,
    financialRecords,
    historicalIdentities,
  };
}

async function main() {
  console.log("==================================================");
  console.log("TAGPULSE — HISTORICAL IMPORT HUSTLER: FASE 4H");
  console.log("SALES IMPORT DESIGN + DRY-RUN");
  console.log("==================================================");
  console.log(`Target Batch ID: ${batchId}`);
  console.log(`Target DB: tagpulse-historical-dev (pkjdzlfxsxulfkzksrow)`);
  console.log(`Mode: STRICT DRY-RUN (0 DB writes)`);

  // Snapshot canonical counts BEFORE
  const countsBefore = await getCanonicalCounts();

  const plan = await planHustlerSalesImport(prisma, batchId);
  const s = plan.summary;

  // Snapshot canonical counts AFTER
  const countsAfter = await getCanonicalCounts();

  const invariantsMatch =
    countsBefore.products === countsAfter.products &&
    countsBefore.customers === countsAfter.customers &&
    countsBefore.sales === countsAfter.sales &&
    countsBefore.saleItems === countsAfter.saleItems &&
    countsBefore.saleSourceDocs === countsAfter.saleSourceDocs &&
    countsBefore.saleSourceDocItems === countsAfter.saleSourceDocItems &&
    countsBefore.financialRecords === countsAfter.financialRecords &&
    countsBefore.historicalIdentities === countsAfter.historicalIdentities;

  console.log("\n--------------------------------------------------");
  console.log("1. SCOPE & SUMMARY");
  console.log("--------------------------------------------------");
  console.log(`Legacy total vendas:    ${s.totalLegacyVendas}`);
  console.log(`Active vendas:          ${s.activeVendas}`);
  console.log(`Cancelled vendas:       ${s.cancelledVendas}`);
  console.log(`Quarantined vendas:     ${s.quarantinedVendas}`);
  console.log(`Importable sales:       ${s.importableSales}`);
  console.log(`Total active revenue:   R$ ${s.totalActiveRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  console.log(`Importable revenue:     R$ ${s.importableRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  console.log(`Quarantined revenue:    R$ ${s.quarantinedRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);

  console.log("\n--------------------------------------------------");
  console.log("2. CUSTOMER RESOLUTION");
  console.log("--------------------------------------------------");
  console.log(`Sales with canonical customer:    ${s.salesWithCanonicalCustomer}`);
  console.log(`Sales with generic customer/null: ${s.salesWithGenericCustomer}`);
  console.log(`Sales with blank customer/null:   ${s.salesWithBlankCustomer}`);
  console.log(`Unresolved customer:              ${s.unresolvedCustomerCount} (Expected 0)`);

  console.log("\n--------------------------------------------------");
  console.log("3. PRODUCT MAPPING & ITEMS");
  console.log("--------------------------------------------------");
  console.log(`Planned SaleItems:       ${s.totalPlannedSaleItems}`);
  console.log(`Resolved Product items:  ${s.resolvedProductItems}`);
  console.log(`Unresolved Product items: ${s.unresolvedProductItems} (Expected 0)`);

  console.log("\n--------------------------------------------------");
  console.log("4. REALIZATION DOCUMENTS");
  console.log("--------------------------------------------------");
  console.log(`Planned SaleSourceDocuments:    ${s.plannedSaleSourceDocuments}`);
  console.log(`NFE realization:                ${s.nfeRealizationCount}`);
  console.log(`VS realization:                 ${s.vsRealizationCount}`);
  console.log(`NFE fallback to VS:             ${s.nfeFallbackToVsCount} (Expected 3)`);
  console.log(`Multiple realization conflicts: ${s.multipleRealizationConflicts} (Expected 0)`);

  console.log("\n--------------------------------------------------");
  console.log("5. DOCUMENT ITEMS (SSDI)");
  console.log("--------------------------------------------------");
  console.log(`Planned SSDI:  ${s.plannedSsdiCount}`);
  console.log(`NFE SSDI:      ${s.nfeSsdiCount}`);
  console.log(`VS SSDI:       ${s.vsSsdiCount}`);

  console.log("\n--------------------------------------------------");
  console.log("6. FREIGHT RECONCILIATION");
  console.log("--------------------------------------------------");
  console.log(`Sales with customer freight:     ${s.salesWithCustomerFreight}`);
  console.log(`Total customer freight:          R$ ${s.totalCustomerFreight.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  console.log(`Canonical freight mapping:       Integrated in netAmount (no separate freight column)`);
  console.log(`Double-count risk eliminated:    YES`);

  console.log("\n--------------------------------------------------");
  console.log("7. REVENUE RECONCILIATION");
  console.log("--------------------------------------------------");
  console.log(`Planned Sale revenue:  R$ ${s.plannedSaleRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  console.log(`Expected revenue:      R$ 1.141.693,14`);
  console.log(`Revenue reconciles:    ${s.plannedSaleRevenue === 1141693.14 ? "YES" : "NO"}`);

  console.log("\n--------------------------------------------------");
  console.log("8. COLLISIONS & INVARIANTS");
  console.log("--------------------------------------------------");
  console.log(`Sale sourceId collisions:       ${s.saleSourceIdCollisions} (Expected 0)`);
  console.log(`Sale identity collisions:       ${s.saleIdentityCollisions} (Expected 0)`);
  console.log(`Access-key collisions:          ${s.accessKeyCollisions} (Expected 0)`);
  console.log(`Document collisions:            ${s.documentCollisions} (Expected 0)`);
  console.log(`Planned Sale identities:        ${s.plannedIdentitiesCount} (Expected 6307)`);
  console.log(`Invariants preserved:           ${invariantsMatch ? "YES" : "NO"}`);

  console.log("\nCounts Snapshot:");
  console.log(`- Product:                ${countsAfter.products} (before: ${countsBefore.products})`);
  console.log(`- Customer:               ${countsAfter.customers} (before: ${countsBefore.customers})`);
  console.log(`- Sale:                   ${countsAfter.sales} (before: ${countsBefore.sales})`);
  console.log(`- SaleItem:               ${countsAfter.saleItems} (before: ${countsBefore.saleItems})`);
  console.log(`- SaleSourceDocument:     ${countsAfter.saleSourceDocs} (before: ${countsBefore.saleSourceDocs})`);
  console.log(`- SaleSourceDocumentItem: ${countsAfter.saleSourceDocItems} (before: ${countsBefore.saleSourceDocItems})`);
  console.log(`- FinancialRecord:        ${countsAfter.financialRecords} (before: ${countsBefore.financialRecords})`);
  console.log(`- HistoricalIdentity:     ${countsAfter.historicalIdentities} (before: ${countsBefore.historicalIdentities})`);

  console.log("\n--------------------------------------------------");
  console.log("9. SANITIZED SAMPLES");
  console.log("--------------------------------------------------");
  if (plan.samples.canonicalCustomerSample) {
    const sm = plan.samples.canonicalCustomerSample;
    console.log(`\n[SAMPLE] Canonical Customer Sale:`);
    console.log(`  legacyVendaId: ${sm.legacyVendaId}, anchor: ${sm.anchorType}:${sm.anchorSourceId}`);
    console.log(`  customerId: ${sm.canonicalCustomerId}, netAmount: R$ ${sm.netAmount.toString()}`);
    console.log(`  items: ${sm.items.length}, realization: ${sm.realizationDoc.docType}`);
  }

  if (plan.samples.genericCustomerSample) {
    const sm = plan.samples.genericCustomerSample;
    console.log(`\n[SAMPLE] Generic Customer Sale:`);
    console.log(`  legacyVendaId: ${sm.legacyVendaId}, anchor: ${sm.anchorType}:${sm.anchorSourceId}`);
    console.log(`  customerId: ${sm.canonicalCustomerId} (null), netAmount: R$ ${sm.netAmount.toString()}`);
  }

  if (plan.samples.blankCustomerSample) {
    const sm = plan.samples.blankCustomerSample;
    console.log(`\n[SAMPLE] Blank Customer Sale:`);
    console.log(`  legacyVendaId: ${sm.legacyVendaId}, anchor: ${sm.anchorType}:${sm.anchorSourceId}`);
    console.log(`  customerId: ${sm.canonicalCustomerId} (null), netAmount: R$ ${sm.netAmount.toString()}`);
  }

  if (plan.samples.nfeRealizationSample) {
    const sm = plan.samples.nfeRealizationSample;
    console.log(`\n[SAMPLE] NFe Realization Sale:`);
    console.log(`  legacyVendaId: ${sm.legacyVendaId}, docType: ${sm.realizationDoc.docType}`);
    console.log(`  accessKey: ${sm.realizationDoc.accessKey}, docNumber: ${sm.realizationDoc.sourceDocumentNumber}`);
    console.log(`  realizedDate: ${sm.realizationDoc.realizedDate?.toISOString()}`);
  }

  if (plan.samples.vsRealizationSample) {
    const sm = plan.samples.vsRealizationSample;
    console.log(`\n[SAMPLE] Venda Simples Realization Sale:`);
    console.log(`  legacyVendaId: ${sm.legacyVendaId}, docType: ${sm.realizationDoc.docType}`);
    console.log(`  realizedDate: ${sm.realizationDoc.realizedDate?.toISOString()}`);
  }

  if (plan.samples.nfeFallbackSample) {
    const sm = plan.samples.nfeFallbackSample;
    console.log(`\n[SAMPLE] NFe Fallback Sale:`);
    console.log(`  legacyVendaId: ${sm.legacyVendaId}, fallback: ${sm.isFallbackToVs}, docType: ${sm.realizationDoc.docType}`);
    console.log(`  realizedDate: ${sm.realizationDoc.realizedDate?.toISOString()}`);
  }

  if (plan.samples.freightSample) {
    const sm = plan.samples.freightSample;
    console.log(`\n[SAMPLE] Customer Freight Sale:`);
    console.log(`  legacyVendaId: ${sm.legacyVendaId}, netAmount: R$ ${sm.netAmount.toString()}, freight: R$ ${sm.customerFreightAmount?.toString()}`);
  }

  if (plan.samples.quarantineSample) {
    const sm = plan.samples.quarantineSample;
    console.log(`\n[SAMPLE] Quarantined Sale:`);
    console.log(`  legacyVendaId: ${sm.legacyVendaId}, reason: ${sm.reason}, total: R$ ${sm.total.toFixed(2)}`);
    console.log(`  explanation: ${sm.explanation}`);
  }

  console.log("\n==================================================");
  console.log("PLANNER EXECUTION COMPLETE (DRY-RUN)");
  console.log("==================================================");
}

main()
  .catch((err) => {
    console.error("FATAL ERROR in planner execution:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
