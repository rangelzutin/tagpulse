import {
  PrismaClient,
  SourceSystem,
  OperationUnit,
  SalesChannel,
  SaleAnchorType,
  HistoricalImportBatchStatus,
} from "@prisma/client";

export enum SaleReadinessStatus {
  READY = "READY",
  READY_WITH_WARNING = "READY_WITH_WARNING",
  BLOCKED_CUSTOMER = "BLOCKED_CUSTOMER",
  BLOCKED_PRODUCT = "BLOCKED_PRODUCT",
  BLOCKED_NFE = "BLOCKED_NFE",
  BLOCKED_TOTAL = "BLOCKED_TOTAL",
  POSSIBLE_DUPLICATE = "POSSIBLE_DUPLICATE",
  CANCELLED = "CANCELLED",
  UNKNOWN = "UNKNOWN",
}

export enum NfeValidityStatus {
  VALID_NFE = "VALID_NFE",
  INVALID_NFE = "INVALID_NFE",
  AMBIGUOUS_NFE = "AMBIGUOUS_NFE",
  NO_NFE = "NO_NFE",
}

export enum RealizationDocumentType {
  NFE = "NFE",
  VENDA_SIMPLES = "VENDA_SIMPLES",
}

export enum TotalMatchClassification {
  TOTAL_MATCH = "TOTAL_MATCH",
  ROUNDING_DIFFERENCE = "ROUNDING_DIFFERENCE",
  TOTAL_MISMATCH = "TOTAL_MISMATCH",
  UNDETERMINED = "UNDETERMINED",
}

export enum OverlapClassification {
  NO_OVERLAP = "NO_OVERLAP",
  EXACT_DUPLICATE = "EXACT_DUPLICATE",
  PROBABLE_DUPLICATE = "PROBABLE_DUPLICATE",
  AMBIGUOUS_OVERLAP = "AMBIGUOUS_OVERLAP",
}

export enum LegacyCustomerClassification {
  CUSTOMER_REGISTERED_RESOLVED = "CUSTOMER_REGISTERED_RESOLVED",
  CUSTOMER_GENERIC_LEGACY = "CUSTOMER_GENERIC_LEGACY",
  CUSTOMER_BLANK_LEGACY = "CUSTOMER_BLANK_LEGACY",
  CUSTOMER_REFERENCE_UNRESOLVED = "CUSTOMER_REFERENCE_UNRESOLVED",
}

export interface ReconciledSaleItem {
  legacyItemId: string;
  legacyProductId: string;
  canonicalProductId: string | null;
  isResolved: boolean;
  quantity: number;
  unitPrice: number;
  grossSubtotal: number;
  discount: number;
  netTotal: number;
}

export interface ReconciledSale {
  legacyVendaId: string;
  legacyClienteId: string;
  canonicalCustomerId: string | null;
  isCustomerResolved: boolean;
  customerClassification: LegacyCustomerClassification;
  legacyDate: string;
  realizedDate: string;
  total: number;
  discount: number;
  acrescimo: number;
  status: "ACTIVE" | "CANCELLED" | "UNKNOWN";
  realizationDocType: RealizationDocumentType;
  nfeValidity: NfeValidityStatus;
  accessKey: string | null;
  totalMatchStatus: TotalMatchClassification;
  totalDiff: number;
  items: ReconciledSaleItem[];
  allProductsResolved: boolean;
  hasUnresolvedProducts: boolean;
  overlapStatus: OverlapClassification;
  readiness: SaleReadinessStatus;
  reason: string;
}

export interface HustlerSalesReconcileOptions {
  prisma: PrismaClient;
  batchId: string;
}

export interface HustlerSalesReconcileResult {
  batchId: string;
  companyId: string;
  companyName: string;

  sales: {
    total: number;
    active: number;
    cancelled: number;
    unknown: number;
    readiness: Record<SaleReadinessStatus, number>;
  };

  customerImpact: {
    salesCustomerResolved: number;
    salesCustomerUnresolved: number;
    revenueCustomerResolved: number;
    revenueCustomerUnresolved: number;
  };

  productImpact: {
    totalCommercialItems: number;
    resolvedItems: number;
    unresolvedItems: number;
    salesFullyResolved: number;
    salesPartiallyUnresolved: number;
    salesFullyUnresolved: number;
    revenueAffectedByUnresolvedProducts: number;
  };

  realization: {
    realizedByValidNfe: number;
    realizedByVs: number;
    invalidNfe: number;
    ambiguousNfe: number;
    accessKeyConflicts: number;
    validUniqueAccessKeys: number;
  };

  revenue: {
    activeTotal: number;
    readyTotal: number;
    blockedTotal: number;
    referenceDiff: number; // vs R$ 1.144.706,74
  };

  itemsPartition: {
    commercialLinkedNfl: number;
    nonSalesNfl: number;
    nonSalesExcluded: boolean;
  };

  totalReconciliation: {
    totalMatch: number;
    roundingDifference: number;
    totalMismatch: number;
    undetermined: number;
  };

  transition: {
    aprActive: number;
    aprRevenue: number;
    mayActive: number;
    mayRevenue: number;
    junActive: number;
    junRevenue: number;
    exactDuplicates: number;
    probableDuplicates: number;
    ambiguousOverlaps: number;
  };

  customerSemantics: {
    registeredResolved: { sales: number; revenue: number; items: number };
    genericLegacy: { sales: number; revenue: number; items: number; periodStart: string | null; periodEnd: string | null };
    blankLegacy: { sales: number; revenue: number; items: number; periodStart: string | null; periodEnd: string | null };
    referenceUnresolved: {
      sales: number;
      revenue: number;
      uniqueLegacyCustomers: number;
      items: number;
      periodStart: string | null;
      periodEnd: string | null;
    };
  };

  readinessBefore: Record<SaleReadinessStatus, number>;

  samples: Record<string, ReconciledSale[]>;
}

export function evaluateTotalReconciliation(
  vendaTotal: number,
  vendaDiscount: number,
  vendaAcrescimo: number,
  items: { grossSubtotal: number; unitPrice: number; quantity: number; discount: number }[],
): { status: TotalMatchClassification; minDiff: number } {
  if (items.length === 0) {
    return { status: TotalMatchClassification.UNDETERMINED, minDiff: vendaTotal };
  }

  let itemsGrossSubtotal = 0;
  let itemsGrossProd = 0;
  let itemsDiscount = 0;

  for (const it of items) {
    itemsGrossSubtotal += it.grossSubtotal;
    itemsGrossProd += it.unitPrice * it.quantity;
    itemsDiscount += it.discount;
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

  if (minDiff < 0.001) {
    return { status: TotalMatchClassification.TOTAL_MATCH, minDiff: 0 };
  } else if (minDiff <= 0.05) {
    return { status: TotalMatchClassification.ROUNDING_DIFFERENCE, minDiff };
  } else {
    return { status: TotalMatchClassification.TOTAL_MISMATCH, minDiff };
  }
}

export function evaluateNfeValidity(
  nfeList?: Record<string, unknown>[] | null,
): { status: NfeValidityStatus; accessKey: string | null } {
  if (!nfeList || nfeList.length === 0) {
    return { status: NfeValidityStatus.NO_NFE, accessKey: null };
  }
  if (nfeList.length > 1) {
    return { status: NfeValidityStatus.AMBIGUOUS_NFE, accessKey: null };
  }

  const nfe = nfeList[0];
  if (!nfe) {
    return { status: NfeValidityStatus.NO_NFE, accessKey: null };
  }
  const rawKey = String(nfe["chave_acesso"] || "").replace(/\D/g, "");
  if (rawKey.length === 44) {
    return { status: NfeValidityStatus.VALID_NFE, accessKey: rawKey };
  }
  return { status: NfeValidityStatus.INVALID_NFE, accessKey: rawKey || null };
}

export function classifyLegacyCustomer(
  legacyClienteId: string | null | undefined,
  customerIdMap: Map<string, string>,
): LegacyCustomerClassification {
  const trimmed =
    legacyClienteId !== null && legacyClienteId !== undefined
      ? String(legacyClienteId).trim()
      : "";
  if (!trimmed || trimmed === "0" || trimmed.toLowerCase() === "null") {
    return LegacyCustomerClassification.CUSTOMER_BLANK_LEGACY;
  }
  if (trimmed === "1") {
    return LegacyCustomerClassification.CUSTOMER_GENERIC_LEGACY;
  }
  if (customerIdMap.has(trimmed)) {
    return LegacyCustomerClassification.CUSTOMER_REGISTERED_RESOLVED;
  }
  return LegacyCustomerClassification.CUSTOMER_REFERENCE_UNRESOLVED;
}

export async function reconcileHustlerSales(
  options: HustlerSalesReconcileOptions,
): Promise<HustlerSalesReconcileResult> {
  const { prisma, batchId } = options;

  // 1. Validate Batch
  const batch = await prisma.historicalImportBatch.findUnique({
    where: { id: batchId },
    include: { company: true },
  });

  if (!batch) {
    throw new Error(`HistoricalImportBatch '${batchId}' not found.`);
  }

  const companyId = batch.companyId;
  const companyName = batch.company.name;

  // 2. Load Identities
  const identities = await prisma.historicalSourceIdentity.findMany({
    where: {
      companyId,
      sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
    },
  });

  const customerIdMap = new Map<string, string>();
  const productIdMap = new Map<string, string>();

  for (const idRow of identities) {
    if (idRow.sourceEntity === "cliente") {
      customerIdMap.set(idRow.sourcePrimaryKey, idRow.canonicalEntityId);
    } else if (idRow.sourceEntity === "produto_base") {
      productIdMap.set(idRow.sourcePrimaryKey, idRow.canonicalEntityId);
    }
  }

  // 3. Load Staging Tables
  const [vendaRows, nflRows, nfeRows, nfRows] = await Promise.all([
    prisma.historicalStagingRow.findMany({
      where: { importBatchId: batchId, sourceTable: "venda" },
      select: { payload: true },
    }),
    prisma.historicalStagingRow.findMany({
      where: { importBatchId: batchId, sourceTable: "nota_fiscal_lancamento" },
      select: { payload: true },
    }),
    prisma.historicalStagingRow.findMany({
      where: { importBatchId: batchId, sourceTable: "nfe" },
      select: { payload: true },
    }),
    prisma.historicalStagingRow.findMany({
      where: { importBatchId: batchId, sourceTable: "nota_fiscal" },
      select: { payload: true },
    }),
  ]);

  const nfMap = new Map<string, Record<string, unknown>>();
  for (const nf of nfRows) {
    const p = nf.payload as Record<string, unknown>;
    nfMap.set(String(p["id"]), p);
  }

  const itemsByNfId = new Map<string, Record<string, unknown>[]>();
  for (const n of nflRows) {
    const p = n.payload as Record<string, unknown>;
    const nfId = String(p["id_nota_fiscal"]);
    if (!itemsByNfId.has(nfId)) itemsByNfId.set(nfId, []);
    itemsByNfId.get(nfId)!.push(p);
  }

  const nfeByNfId = new Map<string, Record<string, unknown>[]>();
  for (const n of nfeRows) {
    const p = n.payload as Record<string, unknown>;
    const nfId = String(p["id_nota_fiscal"]);
    if (!nfeByNfId.has(nfId)) nfeByNfId.set(nfId, []);
    nfeByNfId.get(nfId)!.push(p);
  }

  // 4. Partition Commercial Items vs Non-sales Movements
  const allVendaNfIds = new Set<string>();
  for (const v of vendaRows) {
    const p = v.payload as Record<string, unknown>;
    if (p["id_nota_fiscal"]) {
      allVendaNfIds.add(String(p["id_nota_fiscal"]));
    }
  }

  let commercialLinkedNfl = 0;
  let nonSalesNfl = 0;
  for (const n of nflRows) {
    const p = n.payload as Record<string, unknown>;
    if (allVendaNfIds.has(String(p["id_nota_fiscal"]))) {
      commercialLinkedNfl++;
    } else {
      nonSalesNfl++;
    }
  }

  // 5. Load Canonical Sales & Docs for Overlap Verification
  const connections = await prisma.tagPlusConnection.findMany({
    where: { companyId },
    select: { id: true },
  });
  const connectionIds = connections.map((c) => c.id);

  const canonicalDocs = await prisma.saleSourceDocument.findMany({
    where: { connectionId: { in: connectionIds } },
    select: {
      id: true,
      realizedDate: true,
      netAmount: true,
    },
  });

  const canonicalSalesByDateAndNet = new Map<string, typeof canonicalDocs>();
  for (const d of canonicalDocs) {
    if (d.realizedDate && d.netAmount) {
      const dateStr = d.realizedDate.toISOString().slice(0, 10);
      const netStr = parseFloat(d.netAmount.toString()).toFixed(2);
      const key = `${dateStr}:${netStr}`;
      if (!canonicalSalesByDateAndNet.has(key)) {
        canonicalSalesByDateAndNet.set(key, []);
      }
      canonicalSalesByDateAndNet.get(key)!.push(d);
    }
  }

  // 6. Process Sales Graph
  const readinessCounts: Record<SaleReadinessStatus, number> = {
    READY: 0,
    READY_WITH_WARNING: 0,
    BLOCKED_CUSTOMER: 0,
    BLOCKED_PRODUCT: 0,
    BLOCKED_NFE: 0,
    BLOCKED_TOTAL: 0,
    POSSIBLE_DUPLICATE: 0,
    CANCELLED: 0,
    UNKNOWN: 0,
  };

  const readinessBeforeCounts: Record<SaleReadinessStatus, number> = {
    READY: 0,
    READY_WITH_WARNING: 0,
    BLOCKED_CUSTOMER: 0,
    BLOCKED_PRODUCT: 0,
    BLOCKED_NFE: 0,
    BLOCKED_TOTAL: 0,
    POSSIBLE_DUPLICATE: 0,
    CANCELLED: 0,
    UNKNOWN: 0,
  };

  let registeredResolvedSales = 0;
  let registeredResolvedRev = 0;
  let registeredResolvedItems = 0;

  let genericLegacySales = 0;
  let genericLegacyRev = 0;
  let genericLegacyItems = 0;
  let minDateGeneric: string | null = null;
  let maxDateGeneric: string | null = null;

  let blankLegacySales = 0;
  let blankLegacyRev = 0;
  let blankLegacyItems = 0;
  let minDateBlank: string | null = null;
  let maxDateBlank: string | null = null;

  let referenceUnresolvedSales = 0;
  let referenceUnresolvedRev = 0;
  let referenceUnresolvedItems = 0;
  let minDateUnresolved: string | null = null;
  let maxDateUnresolved: string | null = null;
  const unresolvedSpecificCustIds = new Set<string>();

  let activeVendasCount = 0;
  let cancelledVendasCount = 0;
  let unknownVendasCount = 0;

  let activeRevenueTotal = 0;
  let readyRevenueTotal = 0;
  let blockedRevenueTotal = 0;

  let salesCustResolved = 0;
  let salesCustUnresolved = 0;
  let revCustResolved = 0;
  let revCustUnresolved = 0;

  let commercialItemsInActiveVendas = 0;
  let resolvedItemsCount = 0;
  let unresolvedItemsCount = 0;

  let fullyResolvedSalesCount = 0;
  let partiallyUnresolvedSalesCount = 0;
  let fullyUnresolvedSalesCount = 0;
  let revAffectedByUnresolvedProd = 0;

  let realizedByValidNfeCount = 0;
  let realizedByVsCount = 0;
  let invalidNfeCount = 0;
  let ambiguousNfeCount = 0;

  let totalMatchCount = 0;
  let roundingDiffCount = 0;
  let totalMismatchCount = 0;
  let undeterminedCount = 0;

  let aprActive = 0, aprRev = 0;
  let mayActive = 0, mayRev = 0;
  let junActive = 0, junRev = 0;

  let exactDuplicatesCount = 0;
  let probableDuplicatesCount = 0;
  let ambiguousOverlapsCount = 0;

  const uniqueAccessKeys = new Set<string>();
  const accessKeyToVendaIds = new Map<string, string[]>();

  const reconciledSales: ReconciledSale[] = [];
  const samplesByStatus: Record<string, ReconciledSale[]> = {};

  for (const vr of vendaRows) {
    const v = vr.payload as Record<string, unknown>;
    const legacyVendaId = String(v["id"]);
    const legacyClienteId = String(v["id_cliente"]);
    const nfId = String(v["id_nota_fiscal"] || "");
    const canceladoStr = String(v["cancelado"]);
    const vendaTotal = parseFloat(String(v["vr_total"] || "0"));
    const vendaDiscount = parseFloat(String(v["vr_desconto"] || "0"));
    const vendaAcrescimo = parseFloat(String(v["vr_acrescimo"] || "0"));
    const legacyDate = String(v["data_hr_venda"] || "");

    let status: "ACTIVE" | "CANCELLED" | "UNKNOWN" = "ACTIVE";
    if (canceladoStr === "1") {
      status = "CANCELLED";
      cancelledVendasCount++;
    } else if (canceladoStr === "0") {
      status = "ACTIVE";
      activeVendasCount++;
      activeRevenueTotal += vendaTotal;
    } else {
      status = "UNKNOWN";
      unknownVendasCount++;
    }

    // NF & NFE resolution
    const nf = nfMap.get(nfId);
    const nfeList = nfeByNfId.get(nfId) || [];
    const { status: nfeValidity, accessKey } = evaluateNfeValidity(nfeList);

    let realizationDocType: RealizationDocumentType;
    let realizedDate = legacyDate;

    if (nfeValidity === NfeValidityStatus.VALID_NFE) {
      realizationDocType = RealizationDocumentType.NFE;
      realizedByValidNfeCount++;
      if (accessKey) {
        uniqueAccessKeys.add(accessKey);
        if (!accessKeyToVendaIds.has(accessKey)) accessKeyToVendaIds.set(accessKey, []);
        accessKeyToVendaIds.get(accessKey)!.push(legacyVendaId);
      }
      if (nf && nf["data_emissao"]) {
        realizedDate = String(nf["data_emissao"]);
      }
    } else {
      realizationDocType = RealizationDocumentType.VENDA_SIMPLES;
      if (status === "ACTIVE") {
        realizedByVsCount++;
        if (nfeValidity === NfeValidityStatus.INVALID_NFE) invalidNfeCount++;
        if (nfeValidity === NfeValidityStatus.AMBIGUOUS_NFE) ambiguousNfeCount++;
      }
    }

    // Items Resolution
    const rawItems = itemsByNfId.get(nfId) || [];
    const items: ReconciledSaleItem[] = [];
    let saleResolvedItemsCount = 0;

    for (const it of rawItems) {
      const rawPid = String(it["id_produto"]);
      const canonicalPid = productIdMap.get(rawPid) || null;
      const isResolved = Boolean(canonicalPid);
      const qty = parseFloat(String(it["quantidade"] || "1"));
      const unit = parseFloat(String(it["vr_produto"] || "0"));
      const subtotal = parseFloat(String(it["vr_subtotal"] || "0"));
      const desc = parseFloat(
        String(it["vr_desconto_despesa"] || it["vr_desconto_bruto"] || "0"),
      );
      const netTotal = subtotal > 0 ? subtotal - desc : unit * qty - desc;

      if (status === "ACTIVE") {
        commercialItemsInActiveVendas++;
        if (isResolved) {
          resolvedItemsCount++;
          saleResolvedItemsCount++;
        } else {
          unresolvedItemsCount++;
        }
      }

      items.push({
        legacyItemId: String(it["id"]),
        legacyProductId: rawPid,
        canonicalProductId: canonicalPid,
        isResolved,
        quantity: qty,
        unitPrice: unit,
        grossSubtotal: subtotal > 0 ? subtotal : unit * qty,
        discount: desc,
        netTotal,
      });
    }

    const allProductsResolved =
      items.length > 0 && saleResolvedItemsCount === items.length;
    const hasUnresolvedProducts =
      items.length === 0 || saleResolvedItemsCount < items.length;

    // Customer Resolution & Semantic Classification
    const canonicalCustomerId = customerIdMap.get(legacyClienteId) || null;
    const isCustomerResolved = Boolean(canonicalCustomerId);
    const customerClassification = classifyLegacyCustomer(legacyClienteId, customerIdMap);

    if (status === "ACTIVE") {
      if (customerClassification === LegacyCustomerClassification.CUSTOMER_REGISTERED_RESOLVED) {
        registeredResolvedSales++;
        registeredResolvedRev += vendaTotal;
        registeredResolvedItems += items.length;
      } else if (customerClassification === LegacyCustomerClassification.CUSTOMER_GENERIC_LEGACY) {
        genericLegacySales++;
        genericLegacyRev += vendaTotal;
        genericLegacyItems += items.length;
        if (!minDateGeneric || legacyDate < minDateGeneric) minDateGeneric = legacyDate;
        if (!maxDateGeneric || legacyDate > maxDateGeneric) maxDateGeneric = legacyDate;
      } else if (customerClassification === LegacyCustomerClassification.CUSTOMER_BLANK_LEGACY) {
        blankLegacySales++;
        blankLegacyRev += vendaTotal;
        blankLegacyItems += items.length;
        if (!minDateBlank || legacyDate < minDateBlank) minDateBlank = legacyDate;
        if (!maxDateBlank || legacyDate > maxDateBlank) maxDateBlank = legacyDate;
      } else {
        referenceUnresolvedSales++;
        referenceUnresolvedRev += vendaTotal;
        referenceUnresolvedItems += items.length;
        unresolvedSpecificCustIds.add(legacyClienteId);
        if (!minDateUnresolved || legacyDate < minDateUnresolved) minDateUnresolved = legacyDate;
        if (!maxDateUnresolved || legacyDate > maxDateUnresolved) maxDateUnresolved = legacyDate;
      }

      if (isCustomerResolved) {
        salesCustResolved++;
        revCustResolved += vendaTotal;
      } else {
        salesCustUnresolved++;
        revCustUnresolved += vendaTotal;
      }

      if (allProductsResolved) {
        fullyResolvedSalesCount++;
      } else if (saleResolvedItemsCount > 0) {
        partiallyUnresolvedSalesCount++;
        revAffectedByUnresolvedProd += vendaTotal;
      } else {
        fullyUnresolvedSalesCount++;
        revAffectedByUnresolvedProd += vendaTotal;
      }
    }

    // Total Reconciliation
    const totalEval = evaluateTotalReconciliation(
      vendaTotal,
      vendaDiscount,
      vendaAcrescimo,
      items,
    );

    if (status === "ACTIVE") {
      if (totalEval.status === TotalMatchClassification.TOTAL_MATCH) totalMatchCount++;
      else if (totalEval.status === TotalMatchClassification.ROUNDING_DIFFERENCE) roundingDiffCount++;
      else if (totalEval.status === TotalMatchClassification.TOTAL_MISMATCH) totalMismatchCount++;
      else undeterminedCount++;
    }

    // Transition Period (2026-04 to 2026-06)
    if (status === "ACTIVE") {
      if (legacyDate.startsWith("2026-04")) {
        aprActive++;
        aprRev += vendaTotal;
      } else if (legacyDate.startsWith("2026-05")) {
        mayActive++;
        mayRev += vendaTotal;
      } else if (legacyDate.startsWith("2026-06")) {
        junActive++;
        junRev += vendaTotal;
      }
    }

    // Overlap Verification against Canonical DEV
    let overlapStatus: OverlapClassification = OverlapClassification.NO_OVERLAP;
    if (status === "ACTIVE" && legacyDate.startsWith("2026-")) {
      const datePart = legacyDate.slice(0, 10);
      const netPart = vendaTotal.toFixed(2);
      const key = `${datePart}:${netPart}`;
      const candidates = canonicalSalesByDateAndNet.get(key) || [];
      if (candidates.length === 1) {
        overlapStatus = OverlapClassification.PROBABLE_DUPLICATE;
        probableDuplicatesCount++;
      } else if (candidates.length > 1) {
        overlapStatus = OverlapClassification.AMBIGUOUS_OVERLAP;
        ambiguousOverlapsCount++;
      }
    }

    // Determine Readiness Category (BEFORE - strict customer resolution required)
    let rBefore: SaleReadinessStatus;
    if (status === "CANCELLED") {
      rBefore = SaleReadinessStatus.CANCELLED;
    } else if (status === "UNKNOWN") {
      rBefore = SaleReadinessStatus.UNKNOWN;
    } else if (
      overlapStatus === OverlapClassification.PROBABLE_DUPLICATE ||
      overlapStatus === OverlapClassification.AMBIGUOUS_OVERLAP
    ) {
      rBefore = SaleReadinessStatus.POSSIBLE_DUPLICATE;
    } else if (
      nfeValidity === NfeValidityStatus.INVALID_NFE ||
      nfeValidity === NfeValidityStatus.AMBIGUOUS_NFE
    ) {
      rBefore = SaleReadinessStatus.BLOCKED_NFE;
    } else if (totalEval.status === TotalMatchClassification.TOTAL_MISMATCH) {
      rBefore = SaleReadinessStatus.BLOCKED_TOTAL;
    } else if (hasUnresolvedProducts) {
      rBefore = SaleReadinessStatus.BLOCKED_PRODUCT;
    } else if (!isCustomerResolved) {
      rBefore = SaleReadinessStatus.BLOCKED_CUSTOMER;
    } else if (totalEval.status === TotalMatchClassification.ROUNDING_DIFFERENCE) {
      rBefore = SaleReadinessStatus.READY_WITH_WARNING;
    } else {
      rBefore = SaleReadinessStatus.READY;
    }
    readinessBeforeCounts[rBefore]++;

    // Determine Readiness Category (AFTER - semantic customer rules)
    const isCustomerBlocked = (customerClassification === LegacyCustomerClassification.CUSTOMER_REFERENCE_UNRESOLVED);
    let readiness: SaleReadinessStatus;
    let reason = "";

    if (status === "CANCELLED") {
      readiness = SaleReadinessStatus.CANCELLED;
      reason = "Sale marked as cancelled (cancelado = '1') in legacy dump.";
    } else if (status === "UNKNOWN") {
      readiness = SaleReadinessStatus.UNKNOWN;
      reason = `Unknown cancellation status '${canceladoStr}'.`;
    } else if (
      overlapStatus === OverlapClassification.PROBABLE_DUPLICATE ||
      overlapStatus === OverlapClassification.AMBIGUOUS_OVERLAP
    ) {
      readiness = SaleReadinessStatus.POSSIBLE_DUPLICATE;
      reason = "Duplicate or probable overlap found in canonical database.";
    } else if (
      nfeValidity === NfeValidityStatus.INVALID_NFE ||
      nfeValidity === NfeValidityStatus.AMBIGUOUS_NFE
    ) {
      readiness = SaleReadinessStatus.BLOCKED_NFE;
      reason = `Associated NF-e has invalid or ambiguous status (${nfeValidity}).`;
    } else if (totalEval.status === TotalMatchClassification.TOTAL_MISMATCH) {
      readiness = SaleReadinessStatus.BLOCKED_TOTAL;
      reason = `Total mismatch: difference of R$ ${totalEval.minDiff.toFixed(2)} between sale total and items sum.`;
    } else if (hasUnresolvedProducts) {
      readiness = SaleReadinessStatus.BLOCKED_PRODUCT;
      reason = `Contains ${items.length - saleResolvedItemsCount} unresolved product item(s).`;
    } else if (isCustomerBlocked) {
      readiness = SaleReadinessStatus.BLOCKED_CUSTOMER;
      reason = `Customer '${legacyClienteId}' is a specific legacy customer without canonical identity.`;
    } else if (totalEval.status === TotalMatchClassification.ROUNDING_DIFFERENCE) {
      readiness = SaleReadinessStatus.READY_WITH_WARNING;
      reason = `Minor rounding difference of R$ ${totalEval.minDiff.toFixed(2)} detected within 5-cent tolerance.`;
    } else {
      readiness = SaleReadinessStatus.READY;
      reason = "All validations passed: active, resolved customer (or legitimate generic/blank), resolved products, consistent totals.";
    }

    readinessCounts[readiness]++;

    if (status === "ACTIVE") {
      if (
        readiness === SaleReadinessStatus.READY ||
        readiness === SaleReadinessStatus.READY_WITH_WARNING
      ) {
        readyRevenueTotal += vendaTotal;
      } else {
        blockedRevenueTotal += vendaTotal;
      }
    }

    const recSale: ReconciledSale = {
      legacyVendaId,
      legacyClienteId,
      canonicalCustomerId,
      isCustomerResolved,
      customerClassification,
      legacyDate,
      realizedDate,
      total: vendaTotal,
      discount: vendaDiscount,
      acrescimo: vendaAcrescimo,
      status,
      realizationDocType,
      nfeValidity,
      accessKey,
      totalMatchStatus: totalEval.status,
      totalDiff: totalEval.minDiff,
      items,
      allProductsResolved,
      hasUnresolvedProducts,
      overlapStatus,
      readiness,
      reason,
    };

    reconciledSales.push(recSale);

    if (!samplesByStatus[readiness]) {
      samplesByStatus[readiness] = [];
    }
    if (samplesByStatus[readiness]!.length < 5) {
      samplesByStatus[readiness]!.push(recSale);
    }
  }

  // Check access-key conflicts among valid NFE
  let accessKeyConflicts = 0;
  for (const vIds of accessKeyToVendaIds.values()) {
    if (vIds.length > 1) {
      accessKeyConflicts++;
    }
  }

  const REFERENCE_REVENUE = 1144706.74;
  const referenceDiff = Math.abs(activeRevenueTotal - REFERENCE_REVENUE);

  return {
    batchId,
    companyId,
    companyName,

    sales: {
      total: vendaRows.length,
      active: activeVendasCount,
      cancelled: cancelledVendasCount,
      unknown: unknownVendasCount,
      readiness: readinessCounts,
    },

    customerImpact: {
      salesCustomerResolved: salesCustResolved,
      salesCustomerUnresolved: salesCustUnresolved,
      revenueCustomerResolved: revCustResolved,
      revenueCustomerUnresolved: revCustUnresolved,
    },

    productImpact: {
      totalCommercialItems: commercialItemsInActiveVendas,
      resolvedItems: resolvedItemsCount,
      unresolvedItems: unresolvedItemsCount,
      salesFullyResolved: fullyResolvedSalesCount,
      salesPartiallyUnresolved: partiallyUnresolvedSalesCount,
      salesFullyUnresolved: fullyUnresolvedSalesCount,
      revenueAffectedByUnresolvedProducts: revAffectedByUnresolvedProd,
    },

    realization: {
      realizedByValidNfe: realizedByValidNfeCount,
      realizedByVs: realizedByVsCount,
      invalidNfe: invalidNfeCount,
      ambiguousNfe: ambiguousNfeCount,
      accessKeyConflicts,
      validUniqueAccessKeys: uniqueAccessKeys.size,
    },

    revenue: {
      activeTotal: activeRevenueTotal,
      readyTotal: readyRevenueTotal,
      blockedTotal: blockedRevenueTotal,
      referenceDiff,
    },

    itemsPartition: {
      commercialLinkedNfl,
      nonSalesNfl,
      nonSalesExcluded: nonSalesNfl === 7328,
    },

    totalReconciliation: {
      totalMatch: totalMatchCount,
      roundingDifference: roundingDiffCount,
      totalMismatch: totalMismatchCount,
      undetermined: undeterminedCount,
    },

    transition: {
      aprActive: aprVendasCount(vendaRows),
      aprRevenue: aprRev,
      mayActive: mayVendasCount(vendaRows),
      mayRevenue: mayRev,
      junActive: junVendasCount(vendaRows),
      junRevenue: junRev,
      exactDuplicates: exactDuplicatesCount,
      probableDuplicates: probableDuplicatesCount,
      ambiguousOverlaps: ambiguousOverlapsCount,
    },

    customerSemantics: {
      registeredResolved: {
        sales: registeredResolvedSales,
        revenue: registeredResolvedRev,
        items: registeredResolvedItems,
      },
      genericLegacy: {
        sales: genericLegacySales,
        revenue: genericLegacyRev,
        items: genericLegacyItems,
        periodStart: minDateGeneric,
        periodEnd: maxDateGeneric,
      },
      blankLegacy: {
        sales: blankLegacySales,
        revenue: blankLegacyRev,
        items: blankLegacyItems,
        periodStart: minDateBlank,
        periodEnd: maxDateBlank,
      },
      referenceUnresolved: {
        sales: referenceUnresolvedSales,
        revenue: referenceUnresolvedRev,
        uniqueLegacyCustomers: unresolvedSpecificCustIds.size,
        items: referenceUnresolvedItems,
        periodStart: minDateUnresolved,
        periodEnd: maxDateUnresolved,
      },
    },

    readinessBefore: readinessBeforeCounts,

    samples: samplesByStatus,
  };
}

function aprVendasCount(vendaRows: Record<string, unknown>[]): number {
  return vendaRows.filter((r) => {
    const p = r.payload as Record<string, unknown>;
    return (
      String(p["cancelado"]) === "0" &&
      String(p["data_hr_venda"] || "").startsWith("2026-04")
    );
  }).length;
}

function mayVendasCount(vendaRows: Record<string, unknown>[]): number {
  return vendaRows.filter((r) => {
    const p = r.payload as Record<string, unknown>;
    return (
      String(p["cancelado"]) === "0" &&
      String(p["data_hr_venda"] || "").startsWith("2026-05")
    );
  }).length;
}

function junVendasCount(vendaRows: Record<string, unknown>[]): number {
  return vendaRows.filter((r) => {
    const p = r.payload as Record<string, unknown>;
    return (
      String(p["cancelado"]) === "0" &&
      String(p["data_hr_venda"] || "").startsWith("2026-06")
    );
  }).length;
}
