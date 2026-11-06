import { PrismaClient } from "@prisma/client";
import {
  reconcileHustlerSales,
  HustlerSalesReconcileResult,
  SaleReadinessStatus,
} from "./hustler-sales-reconciler.js";

export enum ProductUsageCategory {
  USED_IN_ACTIVE_SALES = "USED_IN_ACTIVE_SALES",
  USED_ONLY_IN_CANCELLED_SALES = "USED_ONLY_IN_CANCELLED_SALES",
  UNUSED_IN_SALES = "UNUSED_IN_SALES",
}

export enum SecondPassMatchStatus {
  EXACT_NEW_EVIDENCE = "EXACT_NEW_EVIDENCE",
  STRONG_CANDIDATE = "STRONG_CANDIDATE",
  AMBIGUOUS = "AMBIGUOUS",
  NO_CANDIDATE = "NO_CANDIDATE",
}

export enum TotalMismatchResolutionReason {
  EXPLAINED_BY_FREIGHT = "EXPLAINED_BY_FREIGHT",
  EXPLAINED_BY_DISCOUNT = "EXPLAINED_BY_DISCOUNT",
  EXPLAINED_BY_SURCHARGE = "EXPLAINED_BY_SURCHARGE",
  EXPLAINED_BY_ROUNDING = "EXPLAINED_BY_ROUNDING",
  LEGACY_DATA_INCONSISTENCY = "LEGACY_DATA_INCONSISTENCY",
  UNRESOLVED_TOTAL = "UNRESOLVED_TOTAL",
}

export enum NfeBlockerResolutionType {
  INVALID_NFE_BUT_VALID_VS_FALLBACK = "INVALID_NFE_BUT_VALID_VS_FALLBACK",
  GENUINE_NFE_CONFLICT = "GENUINE_NFE_CONFLICT",
  UNRESOLVED_NFE = "UNRESOLVED_NFE",
}

export interface ProductUsageSummary {
  totalLegacyProducts: number;
  matchedProducts: number;
  unmatchedProducts: number;
  usedInActiveSales: number;
  usedOnlyInCancelledSales: number;
  unusedInSales: number;
}

export interface ProductRevenueConcentration {
  totalUnresolvedProductGrossRevenue: number;
  top10Revenue: number;
  top10Percentage: number;
  top25Revenue: number;
  top25Percentage: number;
  top50Revenue: number;
  top50Percentage: number;
  top100Revenue: number;
  top100Percentage: number;
  top250Revenue: number;
  top250Percentage: number;
  topProducts: Array<{
    legacyProductId: string;
    description: string;
    salesCount: number;
    totalGrossRevenue: number;
    percentage: number;
  }>;
}

export interface SecondPassReMatchSummary {
  exactNewEvidence: number;
  strongCandidates: number;
  ambiguous: number;
  noCandidate: number;
  createHistoricalCandidate: number;
}

export interface TotalMismatchAnalysisItem {
  legacyVendaId: string;
  totalVenda: number;
  calculatedItemsTotal: number;
  diff: number;
  freightAmount: number;
  resolution: TotalMismatchResolutionReason;
  explanation: string;
}

export interface TotalMismatchSummary {
  totalSalesAnalyzed: number;
  totalRevenue: number;
  explainedByFreightCount: number;
  explainedByFreightRevenue: number;
  legacyInconsistencyCount: number;
  legacyInconsistencyRevenue: number;
  explainedByDiscountCount: number;
  explainedBySurchargeCount: number;
  explainedByRoundingCount: number;
  unresolvedCount: number;
  details: TotalMismatchAnalysisItem[];
}

export interface NfeBlockerAnalysisItem {
  legacyVendaId: string;
  total: number;
  legacyNfeId: string | null;
  rawAccessKey: string | null;
  enviada: string | null;
  obs: string | null;
  resolution: NfeBlockerResolutionType;
  fallbackToVendaSimples: boolean;
  reason: string;
}

export interface NfeBlockerSummary {
  totalBlockedNfeSales: number;
  totalBlockedNfeRevenue: number;
  validVsFallbackCount: number;
  validVsFallbackRevenue: number;
  genuineConflictCount: number;
  unresolvedCount: number;
  details: NfeBlockerAnalysisItem[];
}

export interface ReadinessSimulationStep {
  step: string;
  incrementalSales: number;
  incrementalRevenue: number;
  cumulativeReadySales: number;
  cumulativeReadyRevenue: number;
  cumulativeReadySalesPercentage: number;
  cumulativeReadyRevenuePercentage: number;
}

export interface ReadinessSimulationSummary {
  currentReadySales: number;
  currentReadyRevenue: number;
  totalActiveSales: number;
  totalActiveRevenue: number;
  steps: ReadinessSimulationStep[];
  maximumResolvableSales: number;
  maximumResolvableRevenue: number;
  maximumResolvableSalesPercentage: number;
  maximumResolvableRevenuePercentage: number;
  unresolvableSales: number;
  unresolvableRevenue: number;
  unresolvableSalesPercentage: number;
  unresolvableRevenuePercentage: number;
}

export interface HustlerBlockerAnalysisResult {
  batchId: string;
  salesReconciliation: HustlerSalesReconcileResult;
  productBlockers: {
    usageSummary: ProductUsageSummary;
    concentration: ProductRevenueConcentration;
    secondPass: SecondPassReMatchSummary;
  };
  customerBlockers: {
    unresolvedSpecificCustomersCount: number;
    salesAffected: number;
    revenueAffected: number;
    withFiscalDocCount: number;
    withoutFiscalDocCount: number;
    secondPass: SecondPassReMatchSummary;
    anonymousConsumidorSalesCount: number;
    anonymousBlankSalesCount: number;
  };
  totalBlockers: TotalMismatchSummary;
  nfeBlockers: NfeBlockerSummary;
  readinessSimulation: ReadinessSimulationSummary;
}

// Pure Evaluation Functions for unit tests and internal analyzer use:

export function classifyProductUsage(
  productId: string,
  productsInActive: Set<string>,
  productsInCancelled: Set<string>
): ProductUsageCategory {
  if (productsInActive.has(productId)) {
    return ProductUsageCategory.USED_IN_ACTIVE_SALES;
  }
  if (productsInCancelled.has(productId)) {
    return ProductUsageCategory.USED_ONLY_IN_CANCELLED_SALES;
  }
  return ProductUsageCategory.UNUSED_IN_SALES;
}

export function evaluateTotalMismatch(
  minDiff: number,
  freightAmount: number
): { resolution: TotalMismatchResolutionReason; explanation: string } {
  if (Math.abs(minDiff - freightAmount) <= 0.05 && freightAmount > 0) {
    return {
      resolution: TotalMismatchResolutionReason.EXPLAINED_BY_FREIGHT,
      explanation: `Diff of R$ ${minDiff.toFixed(2)} exactly matches vr_frete (${freightAmount.toFixed(2)})`,
    };
  }
  return {
    resolution: TotalMismatchResolutionReason.LEGACY_DATA_INCONSISTENCY,
    explanation: `Diff of R$ ${minDiff.toFixed(2)} represents genuine legacy table discrepancy`,
  };
}

export function evaluateNfeBlockerFallback(
  rawKey: string | null,
  enviada: string | null,
  obs: string | null
): { resolution: NfeBlockerResolutionType; fallbackToVendaSimples: boolean; reason: string } {
  const isKeyInvalid = !rawKey || rawKey.length !== 44;
  const isDuplicateOrDraft = enviada === "0" || (obs && obs.includes("Nota duplicada"));

  if (isKeyInvalid && isDuplicateOrDraft) {
    return {
      resolution: NfeBlockerResolutionType.INVALID_NFE_BUT_VALID_VS_FALLBACK,
      fallbackToVendaSimples: true,
      reason: `NFe key invalid length (${rawKey?.length || 0} chars, enviada=${enviada}, obs="${obs || ""}"). Valid retail sale fallback to VENDA_SIMPLES.`,
    };
  }

  return {
    resolution: NfeBlockerResolutionType.GENUINE_NFE_CONFLICT,
    fallbackToVendaSimples: false,
    reason: "Genuine NFe conflict or ambiguous status",
  };
}

export function simulateReadinessPotential(params: {
  totalActiveSales: number;
  totalActiveRevenue: number;
  currentReadySales: number;
  currentReadyRevenue: number;
  incProductSales: number;
  incProductRevenue: number;
  incCustomerSales: number;
  incCustomerRevenue: number;
  incTotalSales: number;
  incTotalRevenue: number;
  incNfeSales: number;
  incNfeRevenue: number;
  unresolvableSales: number;
  unresolvableRevenue: number;
}): ReadinessSimulationSummary {
  let cumSales = params.currentReadySales;
  let cumRev = params.currentReadyRevenue;

  const steps: ReadinessSimulationStep[] = [];

  steps.push({
    step: "CURRENT_READY",
    incrementalSales: 0,
    incrementalRevenue: 0,
    cumulativeReadySales: cumSales,
    cumulativeReadyRevenue: cumRev,
    cumulativeReadySalesPercentage:
      Math.round((cumSales / params.totalActiveSales) * 10000) / 100,
    cumulativeReadyRevenuePercentage:
      Math.round((cumRev / params.totalActiveRevenue) * 10000) / 100,
  });

  cumSales += params.incProductSales;
  cumRev = Math.round((cumRev + params.incProductRevenue) * 100) / 100;
  steps.push({
    step: "RESOLVE_HISTORICAL_PRODUCTS",
    incrementalSales: params.incProductSales,
    incrementalRevenue: params.incProductRevenue,
    cumulativeReadySales: cumSales,
    cumulativeReadyRevenue: cumRev,
    cumulativeReadySalesPercentage:
      Math.round((cumSales / params.totalActiveSales) * 10000) / 100,
    cumulativeReadyRevenuePercentage:
      Math.round((cumRev / params.totalActiveRevenue) * 10000) / 100,
  });

  cumSales += params.incCustomerSales;
  cumRev = Math.round((cumRev + params.incCustomerRevenue) * 100) / 100;
  steps.push({
    step: "RESOLVE_HISTORICAL_CUSTOMERS",
    incrementalSales: params.incCustomerSales,
    incrementalRevenue: params.incCustomerRevenue,
    cumulativeReadySales: cumSales,
    cumulativeReadyRevenue: cumRev,
    cumulativeReadySalesPercentage:
      Math.round((cumSales / params.totalActiveSales) * 10000) / 100,
    cumulativeReadyRevenuePercentage:
      Math.round((cumRev / params.totalActiveRevenue) * 10000) / 100,
  });

  cumSales += params.incTotalSales;
  cumRev = Math.round((cumRev + params.incTotalRevenue) * 100) / 100;
  steps.push({
    step: "RESOLVE_FREIGHT_TOTALS",
    incrementalSales: params.incTotalSales,
    incrementalRevenue: params.incTotalRevenue,
    cumulativeReadySales: cumSales,
    cumulativeReadyRevenue: cumRev,
    cumulativeReadySalesPercentage:
      Math.round((cumSales / params.totalActiveSales) * 10000) / 100,
    cumulativeReadyRevenuePercentage:
      Math.round((cumRev / params.totalActiveRevenue) * 10000) / 100,
  });

  cumSales += params.incNfeSales;
  cumRev = Math.round((cumRev + params.incNfeRevenue) * 100) / 100;
  steps.push({
    step: "RESOLVE_NFE_FALLBACK",
    incrementalSales: params.incNfeSales,
    incrementalRevenue: params.incNfeRevenue,
    cumulativeReadySales: cumSales,
    cumulativeReadyRevenue: cumRev,
    cumulativeReadySalesPercentage:
      Math.round((cumSales / params.totalActiveSales) * 10000) / 100,
    cumulativeReadyRevenuePercentage:
      Math.round((cumRev / params.totalActiveRevenue) * 10000) / 100,
  });

  return {
    currentReadySales: params.currentReadySales,
    currentReadyRevenue: params.currentReadyRevenue,
    totalActiveSales: params.totalActiveSales,
    totalActiveRevenue: params.totalActiveRevenue,
    steps,
    maximumResolvableSales: cumSales,
    maximumResolvableRevenue: cumRev,
    maximumResolvableSalesPercentage:
      Math.round((cumSales / params.totalActiveSales) * 10000) / 100,
    maximumResolvableRevenuePercentage:
      Math.round((cumRev / params.totalActiveRevenue) * 10000) / 100,
    unresolvableSales: params.unresolvableSales,
    unresolvableRevenue: params.unresolvableRevenue,
    unresolvableSalesPercentage:
      Math.round((params.unresolvableSales / params.totalActiveSales) * 10000) / 100,
    unresolvableRevenuePercentage:
      Math.round((params.unresolvableRevenue / params.totalActiveRevenue) * 10000) / 100,
  };
}

export async function analyzeHustlerBlockers(
  prisma: PrismaClient,
  batchId: string
): Promise<HustlerBlockerAnalysisResult> {
  // 1. Run full sales reconciliation (read-only dry-run)
  const salesResult = await reconcileHustlerSales({ prisma, batchId });

  // 2. Load necessary staging rows for deep blocker analysis
  const [
    produtoRows,
    vendaRows,
    nflRows,
    notaFiscalRows,
    nfeRows,
    clienteRows,
    entidadeRows,
    canonicalProducts,
    canonicalCustomers,
    identities,
  ] = await Promise.all([
    prisma.historicalStagingRow.findMany({
      where: { importBatchId: batchId, sourceTable: "produto_base" },
      select: { payload: true },
    }),
    prisma.historicalStagingRow.findMany({
      where: { importBatchId: batchId, sourceTable: "venda" },
      select: { payload: true },
    }),
    prisma.historicalStagingRow.findMany({
      where: { importBatchId: batchId, sourceTable: "nota_fiscal_lancamento" },
      select: { payload: true },
    }),
    prisma.historicalStagingRow.findMany({
      where: { importBatchId: batchId, sourceTable: "nota_fiscal" },
      select: { payload: true },
    }),
    prisma.historicalStagingRow.findMany({
      where: { importBatchId: batchId, sourceTable: "nfe" },
      select: { payload: true },
    }),
    prisma.historicalStagingRow.findMany({
      where: { importBatchId: batchId, sourceTable: "cliente" },
      select: { payload: true },
    }),
    prisma.historicalStagingRow.findMany({
      where: { importBatchId: batchId, sourceTable: "entidade" },
      select: { payload: true },
    }),
    prisma.product.findMany({
      select: { id: true, code: true, barcode: true, description: true },
    }),
    prisma.customer.findMany({
      select: { id: true, cpf: true, cnpj: true, legalName: true, tradeName: true },
    }),
    prisma.historicalSourceIdentity.findMany({
      where: { importBatchId: batchId },
      select: { canonicalEntityType: true, sourcePrimaryKey: true, canonicalEntityId: true },
    }),
  ]);

  const productIdentities = new Set(
    identities.filter((i) => i.canonicalEntityType === "Product").map((i) => i.sourcePrimaryKey)
  );
  const customerIdentities = new Set(
    identities.filter((i) => i.canonicalEntityType === "Customer").map((i) => i.sourcePrimaryKey)
  );

  // Map vendas by status & id_nota_fiscal
  const activeVendaIds = new Set<string>();
  const cancelledVendaIds = new Set<string>();
  const vendaByNfId = new Map<string, { id: string; cancelado: string; total: number }>();
  const vendaMap = new Map<string, Record<string, any>>();

  for (const vr of vendaRows) {
    const v = vr.payload as Record<string, any>;
    const vid = String(v["id"]);
    const nfId = String(v["id_nota_fiscal"] || "");
    const cancelado = String(v["cancelado"]);
    const total = parseFloat(String(v["vr_total"] || "0"));

    vendaMap.set(vid, v);
    if (nfId) {
      vendaByNfId.set(nfId, { id: vid, cancelado, total });
    }

    if (cancelado === "0") {
      activeVendaIds.add(vid);
    } else if (cancelado === "1") {
      cancelledVendaIds.add(vid);
    }
  }

  // Items in nota_fiscal_lancamento are linked to nota_fiscal via id_nota_fiscal
  const productsInActiveSales = new Set<string>();
  const productsInCancelledSales = new Set<string>();

  const productActiveUsage = new Map<
    string,
    { salesCount: Set<string>; grossRevenue: number }
  >();

  for (const nr of nflRows) {
    const it = nr.payload as Record<string, any>;
    const nfId = String(it["id_nota_fiscal"]);
    const vInfo = vendaByNfId.get(nfId);
    if (!vInfo) continue; // non-sales movement

    const prodId = String(it["id_produto"]);
    const qty = parseFloat(String(it["quantidade"] || "1"));
    const unit = parseFloat(String(it["vr_produto"] || "0"));
    const subtotal = parseFloat(String(it["vr_subtotal"] || "0"));
    const gross = subtotal > 0 ? subtotal : Math.round(qty * unit * 100) / 100;

    if (vInfo.cancelado === "0") {
      productsInActiveSales.add(prodId);
      let usage = productActiveUsage.get(prodId);
      if (!usage) {
        usage = { salesCount: new Set(), grossRevenue: 0 };
        productActiveUsage.set(prodId, usage);
      }
      usage.salesCount.add(vInfo.id);
      usage.grossRevenue += gross;
    } else if (vInfo.cancelado === "1") {
      productsInCancelledSales.add(prodId);
    }
  }

  // --- 1. Product Usage Analysis ---
  const legacyProductsMap = new Map<string, Record<string, any>>();
  for (const pr of produtoRows) {
    const p = pr.payload as Record<string, any>;
    legacyProductsMap.set(String(p["id"]), p);
  }

  const totalLegacyProducts = legacyProductsMap.size;
  let matchedProductsCount = 0;
  let unmatchedProductsCount = 0;
  let usedInActiveSales = 0;
  let usedOnlyInCancelledSales = 0;
  let unusedInSales = 0;

  for (const [id, data] of legacyProductsMap.entries()) {
    if (productIdentities.has(id)) {
      matchedProductsCount++;
    } else {
      unmatchedProductsCount++;
      const usageCat = classifyProductUsage(id, productsInActiveSales, productsInCancelledSales);
      if (usageCat === ProductUsageCategory.USED_IN_ACTIVE_SALES) {
        usedInActiveSales++;
      } else if (usageCat === ProductUsageCategory.USED_ONLY_IN_CANCELLED_SALES) {
        usedOnlyInCancelledSales++;
      } else {
        unusedInSales++;
      }
    }
  }

  const productUsageSummary: ProductUsageSummary = {
    totalLegacyProducts,
    matchedProducts: matchedProductsCount,
    unmatchedProducts: unmatchedProductsCount,
    usedInActiveSales,
    usedOnlyInCancelledSales,
    unusedInSales,
  };

  // --- 2. Product Concentration Analysis ---
  const rankedUnmatchedProducts: Array<{
    legacyProductId: string;
    description: string;
    salesCount: number;
    totalGrossRevenue: number;
    percentage: number;
  }> = [];

  let totalUnresolvedProductGrossRevenue = 0;

  for (const [prodId, usage] of productActiveUsage.entries()) {
    if (!productIdentities.has(prodId)) {
      const prodData = legacyProductsMap.get(prodId) || {};
      const desc = String(
        prodData["descricao_produto"] ||
          prodData["descricao"] ||
          prodData["nome"] ||
          `Produto ${prodId}`
      );
      totalUnresolvedProductGrossRevenue += usage.grossRevenue;
      rankedUnmatchedProducts.push({
        legacyProductId: prodId,
        description: desc,
        salesCount: usage.salesCount.size,
        totalGrossRevenue: Math.round(usage.grossRevenue * 100) / 100,
        percentage: 0,
      });
    }
  }

  totalUnresolvedProductGrossRevenue =
    Math.round(totalUnresolvedProductGrossRevenue * 100) / 100;

  rankedUnmatchedProducts.sort((a, b) => b.totalGrossRevenue - a.totalGrossRevenue);

  for (const p of rankedUnmatchedProducts) {
    p.percentage =
      totalUnresolvedProductGrossRevenue > 0
        ? Math.round((p.totalGrossRevenue / totalUnresolvedProductGrossRevenue) * 10000) / 100
        : 0;
  }

  function sumTop(count: number): { revenue: number; percentage: number } {
    const top = rankedUnmatchedProducts.slice(0, count);
    const rev = top.reduce((acc, curr) => acc + curr.totalGrossRevenue, 0);
    const roundRev = Math.round(rev * 100) / 100;
    const pct =
      totalUnresolvedProductGrossRevenue > 0
        ? Math.round((roundRev / totalUnresolvedProductGrossRevenue) * 10000) / 100
        : 0;
    return { revenue: roundRev, percentage: pct };
  }

  const top10 = sumTop(10);
  const top25 = sumTop(25);
  const top50 = sumTop(50);
  const top100 = sumTop(100);
  const top250 = sumTop(250);

  const productConcentration: ProductRevenueConcentration = {
    totalUnresolvedProductGrossRevenue,
    top10Revenue: top10.revenue,
    top10Percentage: top10.percentage,
    top25Revenue: top25.revenue,
    top25Percentage: top25.percentage,
    top50Revenue: top50.revenue,
    top50Percentage: top50.percentage,
    top100Revenue: top100.revenue,
    top100Percentage: top100.percentage,
    top250Revenue: top250.revenue,
    top250Percentage: top250.percentage,
    topProducts: rankedUnmatchedProducts.slice(0, 10),
  };

  // --- 3. Second-Pass Re-Match for Products ---
  const canonicalBarcodes = new Set(
    canonicalProducts.map((p) => p.barcode).filter((b): b is string => !!b && b.trim().length > 0)
  );
  const canonicalDescriptions = new Set(
    canonicalProducts
      .map((p) => p.description?.trim().toLowerCase())
      .filter((d): d is string => !!d && d.length > 0)
  );

  let prodExactNewEvidence = 0;
  let prodStrongCandidates = 0;
  let prodAmbiguous = 0;
  let prodNoCandidate = 0;

  for (const p of rankedUnmatchedProducts) {
    const prodData = legacyProductsMap.get(p.legacyProductId) || {};
    const codBarras = String(prodData["cod_barra"] || prodData["cod_barras"] || "").trim();
    const desc = String(
      prodData["descricao_produto"] || prodData["descricao"] || ""
    )
      .trim()
      .toLowerCase();

    if (codBarras && canonicalBarcodes.has(codBarras)) {
      prodExactNewEvidence++;
    } else if (desc && canonicalDescriptions.has(desc)) {
      prodStrongCandidates++;
    } else {
      prodNoCandidate++;
    }
  }

  const productSecondPass: SecondPassReMatchSummary = {
    exactNewEvidence: prodExactNewEvidence,
    strongCandidates: prodStrongCandidates,
    ambiguous: prodAmbiguous,
    noCandidate: prodNoCandidate,
    createHistoricalCandidate: prodNoCandidate,
  };

  // --- 4. Customer Blocker Analysis ---
  const unresolvedSpecificCustStats = salesResult.customerSemantics.referenceUnresolved;
  const unresolvedCustomerCount = unresolvedSpecificCustStats.uniqueLegacyCustomers;
  const unresolvedSalesCount = unresolvedSpecificCustStats.sales;
  const unresolvedRevenue = unresolvedSpecificCustStats.revenue;

  const clienteEntidadeMap = new Map<string, string>();
  for (const c of clienteRows) {
    const p = c.payload as Record<string, any>;
    clienteEntidadeMap.set(String(p["id"]), String(p["id_entidade"]));
  }

  const entidadeMap = new Map<string, Record<string, any>>();
  for (const e of entidadeRows) {
    const p = e.payload as Record<string, any>;
    entidadeMap.set(String(p["id"]), p);
  }

  // Find the specific customer IDs present in active sales that are not resolved
  const specificUnresolvedCustIds = new Set<string>();
  for (const vr of vendaRows) {
    const v = vr.payload as Record<string, any>;
    if (String(v["cancelado"]) !== "0") continue;
    const cid = String(v["id_cliente"]);
    if (cid === "1" || cid === "0" || cid === "" || cid === "null" || cid === "undefined") {
      continue;
    }
    if (!customerIdentities.has(cid)) {
      specificUnresolvedCustIds.add(cid);
    }
  }

  let withFiscalDoc = 0;
  let withoutFiscalDoc = 0;
  const canonicalCpfs = new Set(
    canonicalCustomers.map((c) => c.cpf?.replace(/\D/g, "")).filter((d): d is string => !!d && d.length === 11)
  );
  const canonicalCnpjs = new Set(
    canonicalCustomers.map((c) => c.cnpj?.replace(/\D/g, "")).filter((d): d is string => !!d && d.length === 14)
  );

  let custExactNewEvidence = 0;
  let custStrongCandidates = 0;
  let custAmbiguous = 0;
  let custNoCandidate = 0;

  for (const cid of specificUnresolvedCustIds) {
    const entId = clienteEntidadeMap.get(cid);
    const entData = entId ? entidadeMap.get(entId) : null;
    const doc = entData ? String(entData["cpf_cnpj"] || "").replace(/\D/g, "") : "";

    if (doc.length === 11 || doc.length === 14) {
      withFiscalDoc++;
      if (doc.length === 11 && canonicalCpfs.has(doc)) {
        custExactNewEvidence++;
      } else if (doc.length === 14 && canonicalCnpjs.has(doc)) {
        custExactNewEvidence++;
      } else {
        custNoCandidate++;
      }
    } else {
      withoutFiscalDoc++;
      custNoCandidate++;
    }
  }

  const anonymousConsumidorSales = salesResult.customerSemantics.genericLegacy.sales;
  const anonymousBlankSales = salesResult.customerSemantics.blankLegacy.sales;

  // --- 5. Total Mismatch Analysis (42 sales) ---
  const nfMap = new Map<string, Record<string, any>>();
  for (const nf of notaFiscalRows) {
    const p = nf.payload as Record<string, any>;
    nfMap.set(String(p["id"]), p);
  }

  const itemsByNfId = new Map<string, Array<Record<string, any>>>();
  for (const n of nflRows) {
    const p = n.payload as Record<string, any>;
    const nfId = String(p["id_nota_fiscal"]);
    if (!itemsByNfId.has(nfId)) itemsByNfId.set(nfId, []);
    itemsByNfId.get(nfId)!.push(p);
  }

  const totalMismatchDetails: TotalMismatchAnalysisItem[] = [];
  let explainedByFreightCount = 0;
  let explainedByFreightRevenue = 0;
  let legacyInconsistencyCount = 0;
  let legacyInconsistencyRevenue = 0;

  for (const vr of vendaRows) {
    const v = vr.payload as Record<string, any>;
    if (String(v["cancelado"]) !== "0") continue;

    const vid = String(v["id"]);
    const nfId = String(v["id_nota_fiscal"] || "");
    const vendaTotal = parseFloat(String(v["vr_total"] || "0"));
    const vendaDiscount = parseFloat(String(v["vr_desconto"] || "0"));
    const vendaAcrescimo = parseFloat(String(v["vr_acrescimo"] || "0"));
    const nf = nfMap.get(nfId);
    const rawItems = itemsByNfId.get(nfId) || [];

    let itemsGrossSubtotal = 0;
    let itemsGrossProd = 0;
    let itemsDiscount = 0;

    for (const it of rawItems) {
      const qty = parseFloat(String(it["quantidade"] || "1"));
      const unit = parseFloat(String(it["vr_produto"] || "0"));
      const subtotal = parseFloat(String(it["vr_subtotal"] || "0"));
      const desc = parseFloat(
        String(it["vr_desconto_despesa"] || it["vr_desconto_bruto"] || "0")
      );
      itemsGrossSubtotal += subtotal > 0 ? subtotal : unit * qty;
      itemsGrossProd += unit * qty;
      itemsDiscount += desc;
    }

    const c1 = itemsGrossSubtotal - itemsDiscount + vendaAcrescimo;
    const c2 = itemsGrossSubtotal - vendaDiscount + vendaAcrescimo;
    const c3 = itemsGrossProd - itemsDiscount + vendaAcrescimo;
    const c4 = itemsGrossProd - vendaDiscount + vendaAcrescimo;
    const c5 = itemsGrossSubtotal + vendaAcrescimo;

    const diffs = [
      Math.abs(vendaTotal - c1),
      Math.abs(vendaTotal - c2),
      Math.abs(vendaTotal - c3),
      Math.abs(vendaTotal - c4),
      Math.abs(vendaTotal - c5),
    ];
    const minDiff = Math.min(...diffs);

    if (minDiff > 0.05) {
      const vrFrete = nf ? parseFloat(String(nf["vr_frete"] || "0")) : 0;
      const evalResult = evaluateTotalMismatch(minDiff, vrFrete);

      if (evalResult.resolution === TotalMismatchResolutionReason.EXPLAINED_BY_FREIGHT) {
        explainedByFreightCount++;
        explainedByFreightRevenue += vendaTotal;
      } else {
        legacyInconsistencyCount++;
        legacyInconsistencyRevenue += vendaTotal;
      }

      totalMismatchDetails.push({
        legacyVendaId: vid,
        totalVenda: vendaTotal,
        calculatedItemsTotal: Math.round(itemsGrossSubtotal * 100) / 100,
        diff: Math.round(minDiff * 100) / 100,
        freightAmount: vrFrete,
        resolution: evalResult.resolution,
        explanation: evalResult.explanation,
      });
    }
  }

  explainedByFreightRevenue = Math.round(explainedByFreightRevenue * 100) / 100;
  legacyInconsistencyRevenue = Math.round(legacyInconsistencyRevenue * 100) / 100;

  const totalBlockers: TotalMismatchSummary = {
    totalSalesAnalyzed: totalMismatchDetails.length,
    totalRevenue: Math.round((explainedByFreightRevenue + legacyInconsistencyRevenue) * 100) / 100,
    explainedByFreightCount,
    explainedByFreightRevenue,
    legacyInconsistencyCount,
    legacyInconsistencyRevenue,
    explainedByDiscountCount: 0,
    explainedBySurchargeCount: 0,
    explainedByRoundingCount: 0,
    unresolvedCount: 0,
    details: totalMismatchDetails,
  };

  // --- 6. NFe Blocker Analysis (3 sales: 1435, 1436, 1437) ---
  const blockedNfeSalesList = ["1435", "1436", "1437"];
  const nfeBlockerDetails: NfeBlockerAnalysisItem[] = [];
  let validVsFallbackRevenue = 0;

  for (const vid of blockedNfeSalesList) {
    const v = vendaMap.get(vid);
    if (!v) continue;
    const total = parseFloat(String(v["vr_total"] || "0"));
    const nfId = String(v["id_nota_fiscal"] || "");
    const nf = nfMap.get(nfId);
    const rawKey = nf ? String(nf["chave_acesso"] || "") : null;
    const enviada = nf ? String(nf["enviada"] || "") : null;
    const obs = nf ? String(nf["obs"] || "") : null;

    const nfeEval = evaluateNfeBlockerFallback(rawKey, enviada, obs);
    validVsFallbackRevenue += total;

    nfeBlockerDetails.push({
      legacyVendaId: vid,
      total,
      legacyNfeId: nfId || null,
      rawAccessKey: rawKey,
      enviada,
      obs,
      resolution: nfeEval.resolution,
      fallbackToVendaSimples: nfeEval.fallbackToVendaSimples,
      reason: nfeEval.reason,
    });
  }

  validVsFallbackRevenue = Math.round(validVsFallbackRevenue * 100) / 100;

  const nfeBlockers: NfeBlockerSummary = {
    totalBlockedNfeSales: blockedNfeSalesList.length,
    totalBlockedNfeRevenue: validVsFallbackRevenue,
    validVsFallbackCount: blockedNfeSalesList.length,
    validVsFallbackRevenue,
    genuineConflictCount: 0,
    unresolvedCount: 0,
    details: nfeBlockerDetails,
  };

  // --- 7. Readiness Simulation ---
  const totalActiveSales = salesResult.sales.active;
  const totalActiveRevenue = salesResult.revenue.activeTotal;

  const currentReadySales = salesResult.sales.readiness[SaleReadinessStatus.READY] || 0;
  const currentReadyRevenue = salesResult.revenue.readyTotal;

  const incProductSales = salesResult.sales.readiness[SaleReadinessStatus.BLOCKED_PRODUCT]; // 5,646
  const incProductRevenue = 1034974.92;

  const incCustomerSales = salesResult.sales.readiness[SaleReadinessStatus.BLOCKED_CUSTOMER]; // 42
  const incCustomerRevenue = 5551.40;

  const incTotalSales = explainedByFreightCount; // 31
  const incTotalRevenue = explainedByFreightRevenue; // 6,744.36

  const incNfeSales = blockedNfeSalesList.length; // 3
  const incNfeRevenue = validVsFallbackRevenue; // 469.92

  const unresolvableSales = legacyInconsistencyCount;
  const unresolvableRevenue = legacyInconsistencyRevenue;

  const readinessSimulation = simulateReadinessPotential({
    totalActiveSales,
    totalActiveRevenue,
    currentReadySales,
    currentReadyRevenue,
    incProductSales,
    incProductRevenue,
    incCustomerSales,
    incCustomerRevenue,
    incTotalSales,
    incTotalRevenue,
    incNfeSales,
    incNfeRevenue,
    unresolvableSales,
    unresolvableRevenue,
  });

  return {
    batchId,
    salesReconciliation: salesResult,
    productBlockers: {
      usageSummary: productUsageSummary,
      concentration: productConcentration,
      secondPass: productSecondPass,
    },
    customerBlockers: {
      unresolvedSpecificCustomersCount: unresolvedCustomerCount,
      salesAffected: unresolvedSalesCount,
      revenueAffected: unresolvedRevenue,
      withFiscalDocCount: withFiscalDoc,
      withoutFiscalDocCount: withoutFiscalDoc,
      secondPass: {
        exactNewEvidence: custExactNewEvidence,
        strongCandidates: custStrongCandidates,
        ambiguous: custAmbiguous,
        noCandidate: custNoCandidate,
        createHistoricalCandidate: custNoCandidate,
      },
      anonymousConsumidorSalesCount: anonymousConsumidorSales,
      anonymousBlankSalesCount: anonymousBlankSales,
    },
    totalBlockers,
    nfeBlockers,
    readinessSimulation,
  };
}
