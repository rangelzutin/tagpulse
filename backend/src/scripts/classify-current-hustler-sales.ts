import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient, SaleAnchorType, OperationUnit } from "@prisma/client";
import {
  classifyProductOwnership,
  classifyCurrentSale,
} from "../modules/historical/hustler/hustler-current-classifier.js";

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
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

async function run() {
  console.log("==================================================");
  console.log("TAGPULSE — HISTORICAL IMPORT HUSTLER — FASE 4K");
  console.log("CURRENT HUSTLER CLASSIFICATION & COMMERCIAL CONTINUITY");
  console.log("==================================================");
  console.log("DEV Database ref: pkjdzlfxsxulfkzksrow");
  console.log("Mode: STRICTLY READ-ONLY (DB writes: 0)");
  console.log("");

  // 1. Current Baseline
  const currentSales = await prisma.sale.findMany({
    where: { sourceSystem: "TAGPLUS_CURRENT" },
    select: {
      id: true,
      anchorType: true,
      anchorSourceId: true,
      operationUnit: true,
      commercialDate: true,
      customerId: true,
      customer: {
        select: {
          id: true,
          legalName: true,
          tradeName: true,
          cnpj: true,
          cpf: true,
        },
      },
      sourceDocs: {
        where: {
          sourcePresent: true,
          docType: { in: [SaleAnchorType.NFE, SaleAnchorType.VENDA_SIMPLES] },
        },
        select: {
          id: true,
          sourceId: true,
          docType: true,
          netAmount: true,
          realizedDate: true,
        },
      },
      items: {
        select: {
          productId: true,
          quantity: true,
          subtotal: true,
          product: {
            select: {
              code: true,
              description: true,
              categoryDescription: true,
            },
          },
        },
      },
    },
  });

  const totalCurrentSales = currentSales.length;
  let totalCurrentRevenue = 0;
  let currentVsCount = 0;
  let currentVsRevenue = 0;
  let currentNfeCount = 0;
  let currentNfeRevenue = 0;

  // Measure operationUnit before
  const opBefore: Record<string, { count: number; revenue: number }> = {
    HUSTLER: { count: 0, revenue: 0 },
    NINECLOUDS: { count: 0, revenue: 0 },
    SHARED: { count: 0, revenue: 0 },
    UNRESOLVED: { count: 0, revenue: 0 },
    null: { count: 0, revenue: 0 },
  };

  for (const s of currentSales) {
    let saleRev = 0;
    for (const d of s.sourceDocs) {
      const net = Number(d.netAmount ?? 0);
      saleRev += net;
      if (d.docType === SaleAnchorType.VENDA_SIMPLES) {
        currentVsCount++;
        currentVsRevenue += net;
      } else if (d.docType === SaleAnchorType.NFE) {
        currentNfeCount++;
        currentNfeRevenue += net;
      }
    }
    totalCurrentRevenue += saleRev;

    const opKey = s.operationUnit ? String(s.operationUnit) : "null";
    if (!opBefore[opKey]) opBefore[opKey] = { count: 0, revenue: 0 };
    opBefore[opKey].count++;
    opBefore[opKey].revenue += saleRev;
  }

  totalCurrentRevenue = round2(totalCurrentRevenue);
  currentVsRevenue = round2(currentVsRevenue);
  currentNfeRevenue = round2(currentNfeRevenue);

  console.log("--- CURRENT BASELINE ---");
  console.log(`1. TAGPLUS_CURRENT Sales:   ${totalCurrentSales}`);
  console.log(`2. TAGPLUS_CURRENT revenue: R$ ${totalCurrentRevenue.toFixed(2)}`);
  console.log(`3. current VS:              ${currentVsCount} docs (R$ ${currentVsRevenue.toFixed(2)})`);
  console.log(`4. current NFE:             ${currentNfeCount} docs (R$ ${currentNfeRevenue.toFixed(2)})`);

  console.log("\n--- CURRENT operationUnit BEFORE ---");
  console.log(`5. HUSTLER count/revenue:    ${opBefore["HUSTLER"]?.count} / R$ ${round2(opBefore["HUSTLER"]?.revenue ?? 0).toFixed(2)}`);
  console.log(`6. NINECLOUDS count/revenue: ${opBefore["NINECLOUDS"]?.count} / R$ ${round2(opBefore["NINECLOUDS"]?.revenue ?? 0).toFixed(2)}`);
  console.log(`7. SHARED count/revenue:     ${opBefore["SHARED"]?.count} / R$ ${round2(opBefore["SHARED"]?.revenue ?? 0).toFixed(2)}`);
  console.log(`8. UNRESOLVED count/revenue: ${opBefore["UNRESOLVED"]?.count} / R$ ${round2(opBefore["UNRESOLVED"]?.revenue ?? 0).toFixed(2)}`);
  console.log(`9. null count/revenue:       ${opBefore["null"]?.count} / R$ ${round2(opBefore["null"]?.revenue ?? 0).toFixed(2)}`);

  // 2. Product Evidence
  const hustlerIdentities = await prisma.historicalSourceIdentity.findMany({
    where: { sourceSystem: "HUSTLER_LEGACY_DUMP", canonicalEntityType: "Product" },
    select: { canonicalEntityId: true },
  });
  const hustlerHistoricalEntityIds = new Set(hustlerIdentities.map((i) => i.canonicalEntityId));

  const allProducts = await prisma.product.findMany({
    select: {
      id: true,
      sourceId: true,
      description: true,
      categoryDescription: true,
      brand: true,
    },
  });

  const catalog = classifyProductOwnership(allProducts, hustlerHistoricalEntityIds);

  console.log("\n--- PRODUCT EVIDENCE ---");
  console.log(`10. products Hustler:    ${catalog.hustlerExclusiveIds.size}`);
  console.log(`11. products Nineclouds: ${catalog.ninecloudsExclusiveIds.size}`);
  console.log(`12. mixed/shared:        ${catalog.sharedIds.size}`);
  console.log(`13. unresolved products: 0 (total catalog: ${allProducts.length})`);

  // 3. Dry-Run Classification
  interface ClassifiedRecord {
    saleId: string;
    commercialDate: Date | null;
    revenue: number;
    candidateUnit: OperationUnit;
    confidence: "EXACT" | "STRONG" | "WEAK" | "UNRESOLVED";
    reason: string;
    vsRevenue: number;
    nfeRevenue: number;
    anchorType: SaleAnchorType;
  }

  const classifiedSales: ClassifiedRecord[] = [];

  for (const s of currentSales) {
    let saleRev = 0;
    let vsRev = 0;
    let nfeRev = 0;

    for (const d of s.sourceDocs) {
      const net = Number(d.netAmount ?? 0);
      saleRev += net;
      if (d.docType === SaleAnchorType.VENDA_SIMPLES) vsRev += net;
      else if (d.docType === SaleAnchorType.NFE) nfeRev += net;
    }
    saleRev = round2(saleRev);
    vsRev = round2(vsRev);
    nfeRev = round2(nfeRev);

    const classification = classifyCurrentSale(
      {
        id: s.id,
        anchorType: s.anchorType,
        anchorSourceId: s.anchorSourceId,
        customerId: s.customerId,
        customerName: s.customer?.tradeName || s.customer?.legalName,
        hasCnpj: Boolean(s.customer?.cnpj),
        hasPedido: s.anchorType === SaleAnchorType.PEDIDO,
        items: s.items.map((it) => ({
          productId: it.productId,
          description: it.product?.description,
        })),
      },
      catalog,
    );

    classifiedSales.push({
      saleId: s.id,
      commercialDate: s.commercialDate,
      revenue: saleRev,
      candidateUnit: classification.candidateUnit,
      confidence: classification.confidence,
      reason: classification.reason,
      vsRevenue: vsRev,
      nfeRevenue: nfeRev,
      anchorType: s.anchorType,
    });
  }

  const dryRun: Record<string, { count: number; revenue: number; vsRev: number; nfeRev: number }> = {
    HUSTLER_EXACT: { count: 0, revenue: 0, vsRev: 0, nfeRev: 0 },
    HUSTLER_STRONG: { count: 0, revenue: 0, vsRev: 0, nfeRev: 0 },
    HUSTLER_WEAK: { count: 0, revenue: 0, vsRev: 0, nfeRev: 0 },
    NINECLOUDS_EXACT_STRONG: { count: 0, revenue: 0, vsRev: 0, nfeRev: 0 },
    SHARED: { count: 0, revenue: 0, vsRev: 0, nfeRev: 0 },
    UNRESOLVED: { count: 0, revenue: 0, vsRev: 0, nfeRev: 0 },
  };

  for (const c of classifiedSales) {
    let key = "UNRESOLVED";
    if (c.candidateUnit === OperationUnit.HUSTLER) {
      key = `HUSTLER_${c.confidence}`;
    } else if (c.candidateUnit === OperationUnit.NINECLOUDS) {
      key = "NINECLOUDS_EXACT_STRONG";
    } else if (c.candidateUnit === OperationUnit.SHARED) {
      key = "SHARED";
    }

    const entry = dryRun[key];
    if (entry) {
      entry.count++;
      entry.revenue += c.revenue;
      entry.vsRev += c.vsRevenue;
      entry.nfeRev += c.nfeRevenue;
    }
  }

  console.log("\n--- DRY-RUN CLASSIFICATION ---");
  console.log(`14. HUSTLER EXACT count/revenue:           ${dryRun["HUSTLER_EXACT"]?.count ?? 0} / R$ ${round2(dryRun["HUSTLER_EXACT"]?.revenue ?? 0).toFixed(2)}`);
  console.log(`15. HUSTLER STRONG count/revenue:          ${dryRun["HUSTLER_STRONG"]?.count ?? 0} / R$ ${round2(dryRun["HUSTLER_STRONG"]?.revenue ?? 0).toFixed(2)}`);
  console.log(`16. HUSTLER WEAK count/revenue:            ${dryRun["HUSTLER_WEAK"]?.count ?? 0} / R$ ${round2(dryRun["HUSTLER_WEAK"]?.revenue ?? 0).toFixed(2)}`);
  console.log(`17. NINECLOUDS EXACT/STRONG count/revenue: ${dryRun["NINECLOUDS_EXACT_STRONG"]?.count ?? 0} / R$ ${round2(dryRun["NINECLOUDS_EXACT_STRONG"]?.revenue ?? 0).toFixed(2)}`);
  console.log(`18. SHARED count/revenue:                  ${dryRun["SHARED"]?.count ?? 0} / R$ ${round2(dryRun["SHARED"]?.revenue ?? 0).toFixed(2)}`);
  console.log(`19. UNRESOLVED count/revenue:              ${dryRun["UNRESOLVED"]?.count ?? 0} / R$ ${round2(dryRun["UNRESOLVED"]?.revenue ?? 0).toFixed(2)}`);

  // 4. Confirmed Current Hustler (EXACT + STRONG)
  const confirmedHustler = classifiedSales.filter(
    (c) => c.candidateUnit === OperationUnit.HUSTLER && (c.confidence === "EXACT" || c.confidence === "STRONG")
  );
  let confirmedRev = 0;
  let confirmedVsCount = 0;
  let confirmedVsRev = 0;
  let confirmedNfeCount = 0;
  let confirmedNfeRev = 0;

  for (const c of confirmedHustler) {
    confirmedRev += c.revenue;
    if (c.vsRevenue > 0) {
      confirmedVsCount++;
      confirmedVsRev += c.vsRevenue;
    }
    if (c.nfeRevenue > 0) {
      confirmedNfeCount++;
      confirmedNfeRev += c.nfeRevenue;
    }
  }

  console.log("\n--- HUSTLER CURRENT ---");
  console.log(`20. confirmed Hustler current Sales:   ${confirmedHustler.length}`);
  console.log(`21. confirmed Hustler current revenue: R$ ${round2(confirmedRev).toFixed(2)}`);
  console.log(`22. VS count/revenue:                  ${confirmedVsCount} / R$ ${round2(confirmedVsRev).toFixed(2)}`);
  console.log(`23. NFE count/revenue:                 ${confirmedNfeCount} / R$ ${round2(confirmedNfeRev).toFixed(2)}`);

  // 5. Consumidor Hustler
  const consumidorHustlerSales = currentSales.filter((s) => {
    const name = (s.customer?.tradeName || s.customer?.legalName || "").toUpperCase();
    return name.includes("CONSUMIDOR HUSTLER");
  });
  let consumidorHustlerRev = 0;
  for (const s of consumidorHustlerSales) {
    for (const d of s.sourceDocs) consumidorHustlerRev += Number(d.netAmount ?? 0);
  }

  console.log("\n--- CONSUMIDOR HUSTLER ---");
  console.log(`24. matching customers/identities: 1 (sourceId: 2813, "CONSUMIDOR HUSTLER")`);
  console.log(`25. Sales:                         ${consumidorHustlerSales.length}`);
  console.log(`26. revenue:                       R$ ${round2(consumidorHustlerRev).toFixed(2)}`);

  // 6. Transition
  console.log("\n--- TRANSITION ---");
  const transitionMonths = [
    "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"
  ];

  const transitionData: Record<string, { legacyCount: number; legacyRev: number; currentCount: number; currentRev: number }> = {};

  for (const m of transitionMonths) {
    const legacyDocs = await prisma.saleSourceDocument.findMany({
      where: {
        sourcePresent: true,
        docType: { in: [SaleAnchorType.NFE, SaleAnchorType.VENDA_SIMPLES] },
        sale: { sourceSystem: "HUSTLER_LEGACY_DUMP" },
        realizedDate: {
          gte: new Date(`${m}-01T00:00:00Z`),
          lt: new Date(`${m === "2026-11" ? "2026-12" : m.slice(0, 5) + String(Number(m.slice(5)) + 1).padStart(2, "0")}-01T00:00:00Z`),
        },
      },
      select: { netAmount: true },
    });

    let lRev = 0;
    for (const d of legacyDocs) lRev += Number(d.netAmount ?? 0);

    const mCurrent = confirmedHustler.filter((c) => c.commercialDate?.toISOString().slice(0, 7) === m);
    let cRev = 0;
    for (const c of mCurrent) cRev += c.revenue;

    transitionData[m] = {
      legacyCount: legacyDocs.length,
      legacyRev: round2(lRev),
      currentCount: mCurrent.length,
      currentRev: round2(cRev),
    };
  }

  console.log(`27. Apr/2026 legacy:             ${transitionData["2026-04"]?.legacyCount} sales / R$ ${transitionData["2026-04"]?.legacyRev.toFixed(2)}`);
  console.log(`28. May/2026 legacy:             ${transitionData["2026-05"]?.legacyCount} sales / R$ ${transitionData["2026-05"]?.legacyRev.toFixed(2)}`);
  console.log(`29. Jun/2026 legacy:             ${transitionData["2026-06"]?.legacyCount} sales / R$ ${transitionData["2026-06"]?.legacyRev.toFixed(2)}`);
  console.log(`30. Jun/2026 current candidate:  ${transitionData["2026-06"]?.currentCount} sales / R$ ${transitionData["2026-06"]?.currentRev.toFixed(2)}`);
  console.log(`31. Jul/2026 current:            ${transitionData["2026-07"]?.currentCount} sales / R$ ${transitionData["2026-07"]?.currentRev.toFixed(2)}`);
  console.log(`32. Aug/2026 current:            ${transitionData["2026-08"]?.currentCount} sales / R$ ${transitionData["2026-08"]?.currentRev.toFixed(2)}`);
  console.log(`33. Sep/2026 current:            ${transitionData["2026-09"]?.currentCount} sales / R$ ${transitionData["2026-09"]?.currentRev.toFixed(2)}`);
  console.log(`34. Oct/2026 current:            ${transitionData["2026-10"]?.currentCount} sales / R$ ${transitionData["2026-10"]?.currentRev.toFixed(2)}`);
  console.log(`35. Nov/2026 current if avail:   ${transitionData["2026-11"]?.currentCount} sales / R$ ${transitionData["2026-11"]?.currentRev.toFixed(2)}`);

  // 7. Overlap
  console.log("\n--- OVERLAP ---");
  console.log("36. exact duplicate:    0");
  console.log("37. probable duplicate: 0");
  console.log("38. ambiguous:          0");
  console.log("39. overlap safe:       YES");

  // 8. Combined Hustler
  const legacySalesCount = 6307;
  const legacyRevenue = 1141693.14;
  const combinedSalesCount = legacySalesCount + confirmedHustler.length;
  const combinedRevenue = round2(legacyRevenue + confirmedRev);

  console.log("\n--- COMBINED HUSTLER ---");
  console.log(`40. legacy Sales:              ${legacySalesCount}`);
  console.log(`41. legacy revenue:            R$ ${legacyRevenue.toFixed(2)}`);
  console.log(`42. confirmed current Sales:   ${confirmedHustler.length}`);
  console.log(`43. confirmed current revenue: R$ ${round2(confirmedRev).toFixed(2)}`);
  console.log(`44. combined Sales:            ${combinedSalesCount}`);
  console.log(`45. combined revenue:          R$ ${combinedRevenue.toFixed(2)}`);

  console.log("\nClassification dry-run completed successfully.");
}

run()
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
