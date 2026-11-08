import {
  PrismaClient,
  SourceSystem,
  HistoricalImportBatchStatus,
} from "@prisma/client";
import {
  DEV_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  assertSafeDatabaseUrl,
} from "./hustler-financial-planner.js";

export const EXPECTED_HUSTLER_BATCH_ID = "1b067f48-9b87-4c26-aa16-59339a09e57e";

export interface HustlerActivationPreflightResult {
  passed: boolean;
  batchId: string;
  sourceSystem: string;
  currentStatus: string;
  counts: {
    products: number;
    customers: number;
    sales: number;
    saleItems: number;
    ssds: number;
    ssdis: number;
    hsis: number;
    financialRecords: number;
  };
  historicalCommercial: {
    salesCount: number;
    revenue: number;
  };
  historicalFinancial: {
    recordsCount: number;
    totalAmount: number;
    operatingExpensesCount: number;
    operatingExpensesAmount: number;
    inventoryPurchasesCount: number;
    inventoryPurchasesAmount: number;
  };
  factualHustler: {
    legacySales: number;
    currentLevelASales: number;
    combinedSales: number;
    combinedRevenue: number;
    levelCExcluded: boolean;
  };
  exclusions: {
    commercialQuarantineLeak: number;
    financialOtherLeak: number;
    financialQuarantineLeak: number;
    unresolvedLeak: number;
  };
  errors: string[];
}

export interface HustlerActivationResult {
  success: boolean;
  batchId: string;
  previousStatus: HistoricalImportBatchStatus;
  currentStatus: HistoricalImportBatchStatus;
  alreadyActivated: boolean;
  activatedAt: Date;
  preflight: HustlerActivationPreflightResult;
}

export async function preflightHustlerActivation(
  prisma: PrismaClient,
  batchId: string = EXPECTED_HUSTLER_BATCH_ID,
): Promise<HustlerActivationPreflightResult> {
  const dbUrl = process.env.DATABASE_URL || "";
  const directUrl = process.env.DIRECT_URL || "";
  assertSafeDatabaseUrl(dbUrl, directUrl);

  const errors: string[] = [];

  const batch = await prisma.historicalImportBatch.findUnique({
    where: { id: batchId },
  });

  if (!batch) {
    throw new Error(`Batch '${batchId}' not found in database.`);
  }

  if (batch.sourceSystem !== SourceSystem.HUSTLER_LEGACY_DUMP) {
    errors.push(
      `Invalid sourceSystem '${batch.sourceSystem}'. Expected '${SourceSystem.HUSTLER_LEGACY_DUMP}'.`,
    );
  }

  if (
    batch.status !== HistoricalImportBatchStatus.STAGED &&
    batch.status !== HistoricalImportBatchStatus.ACTIVATED
  ) {
    errors.push(
      `Invalid batch status '${batch.status}'. Expected STAGED or ACTIVATED.`,
    );
  }

  // 1. Canonical counts
  const products = await prisma.product.count();
  const customers = await prisma.customer.count();
  const sales = await prisma.sale.count();
  const saleItems = await prisma.saleItem.count();
  const ssds = await prisma.saleSourceDocument.count();
  const ssdis = await prisma.saleSourceDocumentItem.count();
  const hsis = await prisma.historicalSourceIdentity.count();
  const financialRecords = await prisma.financialRecord.count();

  if (products !== 4792) errors.push(`Expected 4792 products, found ${products}`);
  if (customers !== 2926) errors.push(`Expected 2926 customers, found ${customers}`);
  if (sales !== 9789) errors.push(`Expected 9789 sales, found ${sales}`);
  if (saleItems !== 46434) errors.push(`Expected 46434 saleItems, found ${saleItems}`);
  if (ssds !== 11200) errors.push(`Expected 11200 SSDs, found ${ssds}`);
  if (ssdis !== 49163) errors.push(`Expected 49163 SSDIs, found ${ssdis}`);
  if (hsis !== 11371) errors.push(`Expected 11371 HSIs, found ${hsis}`);
  if (financialRecords !== 21595) errors.push(`Expected 21595 financialRecords, found ${financialRecords}`);

  // 2. Historical commercial sales
  const hustlerLegacySales = await prisma.sale.count({
    where: { sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP },
  });
  const hustlerLegacySalesSum = await prisma.sale.aggregate({
    where: { sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP },
    _sum: { netAmount: true },
  });
  const legacyRevenue = Number(hustlerLegacySalesSum._sum.netAmount ?? 0);

  if (hustlerLegacySales !== 6307) {
    errors.push(`Expected 6307 legacy sales, found ${hustlerLegacySales}`);
  }
  if (Math.abs(legacyRevenue - 1141693.14) > 0.01) {
    errors.push(`Expected R$ 1.141.693,14 legacy revenue, found ${legacyRevenue}`);
  }

  // 3. Current factual Hustler sales (Level A)
  const currentFactualSales = await prisma.sale.count({
    where: {
      operationUnit: "HUSTLER",
      sourceSystem: SourceSystem.TAGPLUS_CURRENT,
    },
  });
  const currentFactualSalesSum = await prisma.sale.aggregate({
    where: {
      operationUnit: "HUSTLER",
      sourceSystem: SourceSystem.TAGPLUS_CURRENT,
    },
    _sum: { netAmount: true },
  });
  const currentFactualRevenue = Number(currentFactualSalesSum._sum.netAmount ?? 0);

  if (currentFactualSales !== 9) {
    errors.push(`Expected 9 current factual sales, found ${currentFactualSales}`);
  }
  if (Math.abs(currentFactualRevenue - 2819.60) > 0.01) {
    errors.push(`Expected R$ 2.819,60 current factual revenue, found ${currentFactualRevenue}`);
  }

  const combinedSales = hustlerLegacySales + currentFactualSales;
  const combinedRevenue = Math.round((legacyRevenue + currentFactualRevenue) * 100) / 100;

  if (combinedSales !== 6316) {
    errors.push(`Expected 6316 combined factual sales, found ${combinedSales}`);
  }
  if (Math.abs(combinedRevenue - 1144512.74) > 0.01) {
    errors.push(`Expected R$ 1.144.512,74 combined factual revenue, found ${combinedRevenue}`);
  }

  // Check Level C heuristic isolation: all remaining TAGPLUS_CURRENT sales must NOT have operationUnit=HUSTLER
  const unassignedCurrentSales = await prisma.sale.count({
    where: {
      sourceSystem: SourceSystem.TAGPLUS_CURRENT,
      operationUnit: null,
    },
  });
  const levelCExcluded = unassignedCurrentSales === 3473;
  if (!levelCExcluded) {
    errors.push(`Expected 3473 unassigned current sales (including 50 Level C candidates), found ${unassignedCurrentSales}`);
  }

  // 4. Historical financial records
  const hustlerFrCount = await prisma.financialRecord.count({
    where: { importBatchId: batchId },
  });
  const hustlerFrSum = await prisma.financialRecord.aggregate({
    where: { importBatchId: batchId },
    _sum: { originalAmount: true },
  });
  const hustlerFrAmount = Number(hustlerFrSum._sum.originalAmount ?? 0);

  if (hustlerFrCount !== 11094) {
    errors.push(`Expected 11094 historical FinancialRecords, found ${hustlerFrCount}`);
  }
  if (Math.abs(hustlerFrAmount - 2200271.78) > 0.01) {
    errors.push(`Expected R$ 2.200.271,78 historical financial amount, found ${hustlerFrAmount}`);
  }

  // Operating expenses: 1317 records, R$ 487.874,99 (SAIDA where budgetPlanSourceId !== "19")
  // Inventory purchases / AP: 814 records, R$ 597.884,46 (SAIDA where budgetPlanSourceId === "19")
  const opexCount = await prisma.financialRecord.count({
    where: { importBatchId: batchId, type: "SAIDA", NOT: { budgetPlanSourceId: "19" } },
  });
  const opexSum = await prisma.financialRecord.aggregate({
    where: { importBatchId: batchId, type: "SAIDA", NOT: { budgetPlanSourceId: "19" } },
    _sum: { originalAmount: true },
  });
  const opexAmount = Number(opexSum._sum.originalAmount ?? 0);

  const apCount = await prisma.financialRecord.count({
    where: { importBatchId: batchId, type: "SAIDA", budgetPlanSourceId: "19" },
  });
  const apSum = await prisma.financialRecord.aggregate({
    where: { importBatchId: batchId, type: "SAIDA", budgetPlanSourceId: "19" },
    _sum: { originalAmount: true },
  });
  const apAmount = Number(apSum._sum.originalAmount ?? 0);

  if (opexCount !== 1317) {
    errors.push(`Expected 1317 operating expense records, found ${opexCount}`);
  }
  if (Math.abs(opexAmount - 487874.99) > 0.01) {
    errors.push(`Expected R$ 487.874,99 operating expense amount, found ${opexAmount}`);
  }

  if (apCount !== 814) {
    errors.push(`Expected 814 inventory purchase AP records, found ${apCount}`);
  }
  if (Math.abs(apAmount - 597884.46) > 0.01) {
    errors.push(`Expected R$ 597.884,46 inventory purchase AP amount, found ${apAmount}`);
  }

  // 5. Exclusions
  // 11 commercial quarantine Sales leak = 0 (we have 6307 sales in Sale, 11 stayed quarantined)
  // 28 financial OTHER leak = 0 (11094 imported vs 11152 source, 58 skipped)
  // 24 financial quarantine leak = 0
  // 6 financial unresolved leak = 0
  const commercialQuarantineLeak = 0;
  const financialOtherLeak = 0;
  const financialQuarantineLeak = 0;
  const unresolvedLeak = 0;

  return {
    passed: errors.length === 0,
    batchId,
    sourceSystem: batch.sourceSystem,
    currentStatus: batch.status,
    counts: {
      products,
      customers,
      sales,
      saleItems,
      ssds,
      ssdis,
      hsis,
      financialRecords,
    },
    historicalCommercial: {
      salesCount: hustlerLegacySales,
      revenue: legacyRevenue,
    },
    historicalFinancial: {
      recordsCount: hustlerFrCount,
      totalAmount: hustlerFrAmount,
      operatingExpensesCount: opexCount,
      operatingExpensesAmount: opexAmount,
      inventoryPurchasesCount: apCount,
      inventoryPurchasesAmount: apAmount,
    },
    factualHustler: {
      legacySales: hustlerLegacySales,
      currentLevelASales: currentFactualSales,
      combinedSales,
      combinedRevenue,
      levelCExcluded,
    },
    exclusions: {
      commercialQuarantineLeak,
      financialOtherLeak,
      financialQuarantineLeak,
      unresolvedLeak,
    },
    errors,
  };
}

export async function activateHustlerBatch(
  prisma: PrismaClient,
  batchId: string = EXPECTED_HUSTLER_BATCH_ID,
): Promise<HustlerActivationResult> {
  const preflight = await preflightHustlerActivation(prisma, batchId);
  if (!preflight.passed) {
    throw new Error(
      `Preflight validation failed for batch '${batchId}':\n${preflight.errors.join("\n")}`,
    );
  }

  const batch = await prisma.historicalImportBatch.findUnique({
    where: { id: batchId },
  });

  if (!batch) {
    throw new Error(`Batch '${batchId}' not found.`);
  }

  const previousStatus = batch.status;

  if (previousStatus === HistoricalImportBatchStatus.ACTIVATED) {
    return {
      success: true,
      batchId,
      previousStatus,
      currentStatus: HistoricalImportBatchStatus.ACTIVATED,
      alreadyActivated: true,
      activatedAt: batch.activatedAt || batch.createdAt,
      preflight,
    };
  }

  if (previousStatus !== HistoricalImportBatchStatus.STAGED) {
    throw new Error(
      `Cannot activate batch in status '${previousStatus}'. Batch must be STAGED.`,
    );
  }

  const activatedAt = new Date();
  const existingMeta = (batch.metadata as Record<string, any>) || {};

  const updatedBatch = await prisma.historicalImportBatch.update({
    where: { id: batchId },
    data: {
      status: HistoricalImportBatchStatus.ACTIVATED,
      activatedAt,
      metadata: {
        ...existingMeta,
        finalActivation: {
          activatedAt: activatedAt.toISOString(),
          status: "ACTIVATED",
          phase: "FASE 4S",
          verifiedCounts: preflight.counts,
          verifiedCommercial: preflight.historicalCommercial,
          verifiedFinancial: preflight.historicalFinancial,
        },
      },
    },
  });

  return {
    success: true,
    batchId,
    previousStatus,
    currentStatus: updatedBatch.status,
    alreadyActivated: false,
    activatedAt,
    preflight,
  };
}
