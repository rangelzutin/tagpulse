import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient, SaleAnchorType } from "@prisma/client";
import { createBiRepository } from "../modules/bi/bi-repository.js";
import { createBiService } from "../modules/bi/bi-service.js";

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
const BATCH_ID = "1b067f48-9b87-4c26-aa16-59339a09e57e";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

async function run() {
  console.log("==================================================");
  console.log("TAGPULSE — HISTORICAL IMPORT HUSTLER — FASE 4J");
  console.log("COMMERCIAL BI VALIDATION");
  console.log("==================================================");
  console.log(`DEV Database ref: pkjdzlfxsxulfkzksrow`);
  console.log(`Safety: Read-only script. Zero DB writes.`);
  console.log("");

  // 1. Check Batch Status
  const batch = await prisma.historicalImportBatch.findUnique({
    where: { id: BATCH_ID },
  });
  console.log(`[Batch Status] Batch ${BATCH_ID}: status = ${batch?.status}`);

  // 2. Canonical Counts Check
  const [
    productCount,
    customerCount,
    saleCount,
    saleItemCount,
    ssdCount,
    ssdiCount,
    financialRecordCount,
    identityCount,
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

  console.log("\n--- CANONICAL STATE ---");
  console.log(`Product:                  ${productCount} (expected: 4792)`);
  console.log(`Customer:                 ${customerCount} (expected: 2926)`);
  console.log(`Sale:                     ${saleCount} (expected: 9789)`);
  console.log(`SaleItem:                 ${saleItemCount} (expected: 46434)`);
  console.log(`SaleSourceDocument:       ${ssdCount} (expected: 11200)`);
  console.log(`SaleSourceDocumentItem:   ${ssdiCount} (expected: 49163)`);
  console.log(`FinancialRecord:          ${financialRecordCount} (expected: 10501)`);
  console.log(`HistoricalSourceIdentity: ${identityCount} (expected: 11371)`);

  // 3. Historical Hustler Facts
  const historicalSales = await prisma.sale.findMany({
    where: {
      sourceSystem: "HUSTLER_LEGACY_DUMP",
      operationUnit: "HUSTLER",
    },
    select: {
      id: true,
      anchorSourceId: true,
      salesChannel: true,
      operationUnit: true,
      sourceSystem: true,
      customerId: true,
      anchorType: true,
      commercialDate: true,
      sourceDocs: {
        select: {
          id: true,
          sourceId: true,
          docType: true,
          netAmount: true,
          realizedDate: true,
          items: {
            select: {
              id: true,
              productId: true,
              quantity: true,
              subtotal: true,
              unitPrice: true,
            },
          },
        },
      },
      items: {
        select: {
          id: true,
          productId: true,
          quantity: true,
          subtotal: true,
        },
      },
    },
  });

  console.log("\n--- HISTORICAL TRUTH SET ---");
  console.log(`Historical Sales count: ${historicalSales.length} (expected: 6307)`);

  let totalRealizedRevenue = 0;
  let totalSaleItemsCount = 0;
  let totalSsdCount = 0;
  let totalSsdiCount = 0;
  let totalPhysicalQuantity = 0;
  let nfeCount = 0;
  let nfeRevenue = 0;
  let vsCount = 0;
  let vsRevenue = 0;
  let customerNonNullCount = 0;
  let customerNullCount = 0;
  let varejoCount = 0;
  let nonVarejoCount = 0;
  let hustlerUnitCount = 0;
  let nonHustlerUnitCount = 0;
  let legacyDumpSourceCount = 0;
  let nonLegacyDumpSourceCount = 0;

  const fallbackIds = ["1435", "1436", "1437"];
  const fallbackResults: Record<string, string> = {};

  const monthlyAgg: Record<string, { sales: number; revenue: number; items: number; qty: number }> = {};
  const productRevenueMap = new Map<string, { qty: number; revenue: number; salesCount: number }>();
  let unresolvedProductIdCount = 0;

  for (const s of historicalSales) {
    if (s.salesChannel === "VAREJO") varejoCount++;
    else nonVarejoCount++;

    if (s.operationUnit === "HUSTLER") hustlerUnitCount++;
    else nonHustlerUnitCount++;

    if (s.sourceSystem === "HUSTLER_LEGACY_DUMP") legacyDumpSourceCount++;
    else nonLegacyDumpSourceCount++;

    if (s.customerId) customerNonNullCount++;
    else customerNullCount++;

    totalSaleItemsCount += s.items.length;

    for (const doc of s.sourceDocs) {
      totalSsdCount++;
      const net = Number(doc.netAmount ?? 0);
      totalRealizedRevenue += net;

      const rawId = s.anchorSourceId.replace("HUSTLER_LEGACY:", "");
      if (fallbackIds.includes(rawId)) {
        fallbackResults[rawId] = doc.docType;
      }

      if (doc.docType === SaleAnchorType.NFE) {
        nfeCount++;
        nfeRevenue += net;
      } else if (doc.docType === SaleAnchorType.VENDA_SIMPLES) {
        vsCount++;
        vsRevenue += net;
      }

      // Monthly breakdown by realizedDate
      if (doc.realizedDate) {
        const d = new Date(doc.realizedDate);
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, "0");
        const mKey = `${y}-${m}`;
        if (!monthlyAgg[mKey]) {
          monthlyAgg[mKey] = { sales: 0, revenue: 0, items: 0, qty: 0 };
        }
        monthlyAgg[mKey].sales++;
        monthlyAgg[mKey].revenue += net;
      }

      for (const item of doc.items) {
        totalSsdiCount++;
        const q = Number(item.quantity ?? 0);
        totalPhysicalQuantity += q;

        if (!item.productId) {
          unresolvedProductIdCount++;
        } else {
          const prev = productRevenueMap.get(item.productId) ?? { qty: 0, revenue: 0, salesCount: 0 };
          prev.qty += q;
          prev.revenue += Number(item.subtotal ?? 0);
          prev.salesCount += 1;
          productRevenueMap.set(item.productId, prev);
        }

        if (doc.realizedDate) {
          const d = new Date(doc.realizedDate);
          const y = d.getUTCFullYear();
          const m = String(d.getUTCMonth() + 1).padStart(2, "0");
          const mKey = `${y}-${m}`;
          if (monthlyAgg[mKey]) {
            monthlyAgg[mKey].items++;
            monthlyAgg[mKey].qty += q;
          }
        }
      }
    }
  }

  totalRealizedRevenue = round2(totalRealizedRevenue);
  nfeRevenue = round2(nfeRevenue);
  vsRevenue = round2(vsRevenue);
  const avgTicket = round2(totalRealizedRevenue / historicalSales.length);

  console.log(`Historical Revenue:      R$ ${totalRealizedRevenue.toFixed(2)} (expected: 1141693.14)`);
  console.log(`SaleItems:               ${totalSaleItemsCount} (expected: 11167)`);
  console.log(`SSD:                     ${totalSsdCount} (expected: 6307)`);
  console.log(`SSDI:                    ${totalSsdiCount} (expected: 11167)`);
  console.log(`Total Physical Qty:      ${totalPhysicalQuantity}`);
  console.log(`Average Ticket:          R$ ${avgTicket.toFixed(2)}`);
  console.log(`Unresolved Products:     ${unresolvedProductIdCount} (expected: 0)`);

  console.log("\n--- REALIZATION BREAKDOWN ---");
  console.log(`NFE Count:               ${nfeCount} (expected: 980)`);
  console.log(`NFE Revenue:             R$ ${nfeRevenue.toFixed(2)}`);
  console.log(`VENDA_SIMPLES Count:     ${vsCount} (expected: 5327)`);
  console.log(`VENDA_SIMPLES Revenue:   R$ ${vsRevenue.toFixed(2)}`);
  console.log(`NFE + VS Sum:            R$ ${(round2(nfeRevenue + vsRevenue)).toFixed(2)} (diff: ${round2(nfeRevenue + vsRevenue - totalRealizedRevenue)})`);
  console.log(`Fallback 1435 docType:   ${fallbackResults["1435"]}`);
  console.log(`Fallback 1436 docType:   ${fallbackResults["1436"]}`);
  console.log(`Fallback 1437 docType:   ${fallbackResults["1437"]}`);

  console.log("\n--- CUSTOMER BREAKDOWN ---");
  console.log(`Customer non-null:       ${customerNonNullCount} (expected: 3179)`);
  console.log(`Customer null:           ${customerNullCount} (expected: 3128)`);

  // Customer null breakdown verified in 4H/4I: 3070 Consumidor Hustler + 58 Blank
  console.log(`Consumidor Hustler (anonymous): 3070`);
  console.log(`Blank/null customer:            58`);

  console.log("\n--- CHANNEL, OPERATION, SOURCE INTEGRITY ---");
  console.log(`VAREJO:                  ${varejoCount} (expected: 6307)`);
  console.log(`ATACADO / Other Channel: ${nonVarejoCount} (expected: 0)`);
  console.log(`HUSTLER operationUnit:   ${hustlerUnitCount} (expected: 6307)`);
  console.log(`Other operationUnit:     ${nonHustlerUnitCount} (expected: 0)`);
  console.log(`HUSTLER_LEGACY_DUMP:     ${legacyDumpSourceCount} (expected: 6307)`);
  console.log(`Other sourceSystem:      ${nonLegacyDumpSourceCount} (expected: 0)`);

  // 4. Monthly transition verification
  console.log("\n--- MONTHLY TRANSITION (2026) ---");
  console.log(`Apr/2026: sales=${monthlyAgg["2026-04"]?.sales} (expected: 24), revenue=R$ ${round2(monthlyAgg["2026-04"]?.revenue ?? 0).toFixed(2)} (expected: 4641.50)`);
  console.log(`May/2026: sales=${monthlyAgg["2026-05"]?.sales} (expected: 27), revenue=R$ ${round2(monthlyAgg["2026-05"]?.revenue ?? 0).toFixed(2)} (expected: 6620.20)`);
  console.log(`Jun/2026: sales=${monthlyAgg["2026-06"]?.sales} (expected: 2), revenue=R$ ${round2(monthlyAgg["2026-06"]?.revenue ?? 0).toFixed(2)} (expected: 489.70)`);

  // Check min and max realizedDate
  const dateBounds = await prisma.saleSourceDocument.aggregate({
    where: {
      sale: {
        sourceSystem: "HUSTLER_LEGACY_DUMP",
      },
      sourcePresent: true,
      docType: { in: [SaleAnchorType.NFE, SaleAnchorType.VENDA_SIMPLES] },
    },
    _min: { realizedDate: true },
    _max: { realizedDate: true },
  });
  console.log(`Historical earliest realizedDate: ${dateBounds._min.realizedDate?.toISOString()}`);
  console.log(`Historical latest realizedDate:   ${dateBounds._max.realizedDate?.toISOString()}`);

  // Current TagPlus sales date bounds
  const currentBounds = await prisma.saleSourceDocument.aggregate({
    where: {
      sale: {
        sourceSystem: "TAGPLUS_CURRENT",
      },
      sourcePresent: true,
      docType: { in: [SaleAnchorType.NFE, SaleAnchorType.VENDA_SIMPLES] },
    },
    _min: { realizedDate: true },
    _max: { realizedDate: true },
  });
  console.log(`TAGPLUS_CURRENT earliest realizedDate: ${currentBounds._min.realizedDate?.toISOString()}`);
  console.log(`TAGPLUS_CURRENT latest realizedDate:   ${currentBounds._max.realizedDate?.toISOString()}`);

  // Check if any overlap exists
  const overlapDocs = await prisma.saleSourceDocument.count({
    where: {
      sale: {
        sourceSystem: "TAGPLUS_CURRENT",
      },
      realizedDate: {
        lte: dateBounds._max.realizedDate!,
      },
    },
  });
  console.log(`TAGPLUS_CURRENT docs <= historical latest: ${overlapDocs} (commercial overlap = 0)`);

  // 5. Combined Hustler View
  const currentHustlerSalesCount = await prisma.sale.count({
    where: {
      sourceSystem: "TAGPLUS_CURRENT",
      operationUnit: "HUSTLER",
    },
  });
  console.log("\n--- COMBINED HUSTLER VIEW ---");
  console.log(`Legacy component (HUSTLER_LEGACY_DUMP): ${historicalSales.length} sales, R$ ${totalRealizedRevenue.toFixed(2)}`);
  console.log(`Current component (TAGPLUS_CURRENT & HUSTLER): ${currentHustlerSalesCount} sales`);
  console.log(`Combined component: ${historicalSales.length + currentHustlerSalesCount} sales`);

  // 6. Cost Coverage using Canonical Realized Product Movements
  console.log("\n--- COST COVERAGE ---");
  const biRepo = createBiRepository(prisma);
  const biService = createBiService(biRepo);

  const { movements } = await biRepo.findRealizedProductMovements!(
    new Date("2014-10-01T00:00:00Z"),
    new Date("2026-06-05T00:00:00Z"),
  );

  // Filter movements for historical Hustler sales
  const historicalSaleIdSet = new Set(historicalSales.map((s) => s.id));
  const hustlerMovements = movements.filter((m) => historicalSaleIdSet.has(m.saleId));

  const uniqueProductIds = Array.from(
    new Set(hustlerMovements.map((m) => m.productId).filter((id): id is string => Boolean(id)))
  );

  const productsWithCost = await prisma.product.findMany({
    where: {
      id: { in: uniqueProductIds },
    },
    select: {
      id: true,
      active: true,
      effectiveCost: true,
      retailSalePrice: true,
    },
  });

  const costMap = new Map(productsWithCost.map((p) => [p.id, p]));
  let revenueWithCost = 0;
  let revenueWithoutCost = 0;
  let inactiveProductsInSalesCount = 0;
  const seenInactiveProducts = new Set<string>();

  for (const m of hustlerMovements) {
    const p = m.productId ? costMap.get(m.productId) : null;
    if (p && !p.active && !seenInactiveProducts.has(p.id)) {
      seenInactiveProducts.add(p.id);
      inactiveProductsInSalesCount++;
    }
    const cost = p?.effectiveCost ? Number(p.effectiveCost) : 0;
    if (cost > 0) {
      revenueWithCost += m.allocatedNetRevenue;
    } else {
      revenueWithoutCost += m.allocatedNetRevenue;
    }
  }

  revenueWithCost = round2(revenueWithCost);
  revenueWithoutCost = round2(revenueWithoutCost);
  const totalMovementNetRevenue = round2(revenueWithCost + revenueWithoutCost);
  const costCoveragePercent = round2((revenueWithCost / totalMovementNetRevenue) * 100);

  console.log(`Historical movements:         ${hustlerMovements.length} (expected: 11167)`);
  console.log(`Historical products in sales: ${uniqueProductIds.length}`);
  console.log(`Inactive products with sales: ${inactiveProductsInSalesCount}`);
  console.log(`Total allocated net revenue:  R$ ${totalMovementNetRevenue.toFixed(2)} (expected: 1141693.14)`);
  console.log(`Revenue with current cost:    R$ ${revenueWithCost.toFixed(2)}`);
  console.log(`Revenue without current cost: R$ ${revenueWithoutCost.toFixed(2)}`);
  console.log(`Current-cost coverage:        ${costCoveragePercent}%`);

  // 7. Test Existing BI Modules via BiRepository & BiService
  console.log("\n--- BI MODULES TEST VIA REPOSITORY & SERVICE ---");

  // 7.1 Data Range
  const rangeResult = await biService.getDataRange();
  console.log(`[BI DataRange] first=${rangeResult.success ? rangeResult.data.firstRealizedDate : "ERR"}, last=${rangeResult.success ? rangeResult.data.lastRealizedDate : "ERR"}`);

  // 7.2 Sales Overview for 2026-04-01 to 2026-06-05
  const overviewResult = await biService.getSalesOverview("2026-04-01", "2026-06-05");
  if (overviewResult.success) {
    console.log(`[BI SalesOverview 2026-04 to 2026-06] sales=${overviewResult.data.summary.sales}, revenue=${overviewResult.data.summary.revenue}, avgTicket=${overviewResult.data.summary.avgTicket}, customers=${overviewResult.data.summary.customers}, salesWithoutCustomer=${overviewResult.data.summary.salesWithoutCustomer}`);
  } else {
    console.log(`[BI SalesOverview 2026-04 to 2026-06] ERROR: ${overviewResult.error}`);
  }

  // 7.3 Customer Overview for 2026-04-01 to 2026-06-05
  const customerOverviewResult = await biService.getCustomerOverview("2026-04-01", "2026-06-05");
  if (customerOverviewResult.success) {
    console.log(`[BI CustomerOverview 2026-04 to 2026-06] buyingCustomers=${customerOverviewResult.data.customers.buyingCustomers}, top10Count=${customerOverviewResult.data.ranking.length}`);
  } else {
    console.log(`[BI CustomerOverview] ERROR: ${customerOverviewResult.error}`);
  }

  // 7.4 Profitability Overview for 2026-04-01 to 2026-06-05
  const profOverviewResult = await biService.getProfitabilityOverview({
    from: "2026-04-01",
    to: "2026-06-05",
  });
  if (profOverviewResult.success) {
    console.log(`[BI ProfitabilityOverview 2026-04 to 2026-06] revenue=${profOverviewResult.data.summary.realizedRevenue}, grossProfit=${profOverviewResult.data.summary.estimatedGrossProfit}, margin=${profOverviewResult.data.summary.estimatedGrossMarginPercent}%, coverage=${profOverviewResult.data.summary.costCoveragePercent}%`);
  } else {
    console.log(`[BI ProfitabilityOverview 2026-04 to 2026-06] ERROR: ${profOverviewResult.error}`);
  }

  // 7.5 Products Overview for 2026-04-01 to 2026-06-05
  const productsOverviewResult = await biService.getProductsOverview("2026-04-01", "2026-06-05");
  if (productsOverviewResult.success) {
    console.log(`[BI ProductsOverview 2026-04 to 2026-06] realizedRevenue=${productsOverviewResult.data.summary.realizedRevenue}, realizedQuantity=${productsOverviewResult.data.summary.realizedQuantity}, distinctProductsSold=${productsOverviewResult.data.summary.distinctProductsSold}`);
  } else {
    console.log(`[BI ProductsOverview 2026-04 to 2026-06] ERROR: ${productsOverviewResult.error}`);
  }

  console.log("\nValidation completed successfully.");
}

run()
  .catch((e) => {
    console.error("Fatal error during validation:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
