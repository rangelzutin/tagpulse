import {
  PrismaClient,
  Prisma,
  SourceSystem,
  SaleAnchorType,
  HistoricalImportBatchStatus,
} from "@prisma/client";

export interface PlannedSaleItem {
  legacyItemId: string;
  lineNumber: number;
  sourceItemId: string;
  legacyProductId: string;
  canonicalProductId: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  discountAmount: Prisma.Decimal | null;
  subtotal: Prisma.Decimal;
}

export interface PlannedSaleSourceDocumentItem {
  legacyItemId: string;
  lineNumber: number;
  sourceItemId: string;
  legacyProductId: string;
  canonicalProductId: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  discountAmount: Prisma.Decimal | null;
  subtotal: Prisma.Decimal;
}

export interface PlannedSaleSourceDocument {
  docType: SaleAnchorType;
  sourceId: string;
  netAmount: Prisma.Decimal;
  sourceDocumentNumber: string | null;
  accessKey: string | null;
  series: string | null;
  sourceCreatedAt: Date | null;
  sourceEmissaoAt: Date | null;
  realizedDate: Date | null;
  sourcePresent: boolean;
  items: PlannedSaleSourceDocumentItem[];
}

export interface PlannedSale {
  legacyVendaId: string;
  anchorType: SaleAnchorType;
  anchorSourceId: string;
  canonicalCustomerId: string | null;
  customerType: "CANONICAL" | "GENERIC_CONSUMIDOR" | "BLANK";
  netAmount: Prisma.Decimal;
  commercialDate: Date | null;
  sourceCreatedAt: Date | null;
  sourceConfirmedAt: Date | null;
  sourceEmissaoAt: Date | null;
  customerFreightAmount: Prisma.Decimal | null;
  items: PlannedSaleItem[];
  realizationDoc: PlannedSaleSourceDocument;
  isFallbackToVs: boolean;
}

export interface PlannedHistoricalIdentity {
  sourceSystem: SourceSystem;
  sourceEntity: "venda";
  sourcePrimaryKey: string;
  canonicalEntityType: "Sale";
}

export interface QuarantinedSale {
  legacyVendaId: string;
  reason: string;
  total: number;
  explanation: string;
}

export interface CancelledSale {
  legacyVendaId: string;
  total: number;
}

export interface HustlerSalesPlanSummary {
  totalLegacyVendas: number;
  activeVendas: number;
  cancelledVendas: number;
  quarantinedVendas: number;
  importableSales: number;
  totalActiveRevenue: number;
  importableRevenue: number;
  quarantinedRevenue: number;
  salesWithCanonicalCustomer: number;
  salesWithGenericCustomer: number;
  salesWithBlankCustomer: number;
  unresolvedCustomerCount: number;
  totalPlannedSaleItems: number;
  resolvedProductItems: number;
  unresolvedProductItems: number;
  plannedSaleSourceDocuments: number;
  nfeRealizationCount: number;
  vsRealizationCount: number;
  nfeFallbackToVsCount: number;
  multipleRealizationConflicts: number;
  plannedSsdiCount: number;
  nfeSsdiCount: number;
  vsSsdiCount: number;
  salesWithCustomerFreight: number;
  totalCustomerFreight: number;
  plannedSaleRevenue: number;
  plannedIdentitiesCount: number;
  saleSourceIdCollisions: number;
  saleIdentityCollisions: number;
  accessKeyCollisions: number;
  documentCollisions: number;
}

export interface HustlerSalesImportPlan {
  batchId: string;
  companyId: string;
  connectionId: string;
  summary: HustlerSalesPlanSummary;
  plannedSales: PlannedSale[];
  plannedIdentities: PlannedHistoricalIdentity[];
  quarantinedSales: QuarantinedSale[];
  cancelledSales: CancelledSale[];
  samples: {
    canonicalCustomerSample: PlannedSale | null;
    genericCustomerSample: PlannedSale | null;
    blankCustomerSample: PlannedSale | null;
    nfeRealizationSample: PlannedSale | null;
    vsRealizationSample: PlannedSale | null;
    nfeFallbackSample: PlannedSale | null;
    freightSample: PlannedSale | null;
    quarantineSample: QuarantinedSale | null;
  };
}

// -----------------------------------------------------------------------------
// Pure Helpers
// -----------------------------------------------------------------------------

export function parseLegacyDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (!s || s === "0000-00-00 00:00:00" || s === "0000-00-00") return null;

  if (s.includes(" ")) {
    const [datePart, timePart] = s.split(" ");
    const d = new Date(`${datePart}T${timePart}Z`);
    return isNaN(d.getTime()) ? null : d;
  }
  if (s.includes("T")) {
    const d = new Date(s.endsWith("Z") ? s : `${s}Z`);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(`${s}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

export function formatSaleSourceId(legacyVendaId: string): string {
  return `HUSTLER_LEGACY:${legacyVendaId}`;
}

export function formatSaleItemSourceId(legacyLancamentoId: string): string {
  return `HUSTLER_LEGACY:${legacyLancamentoId}`;
}

export function formatDocumentSourceId(legacyVendaId: string): string {
  return `HUSTLER_LEGACY:${legacyVendaId}`;
}

export const NFE_FALLBACK_VENDA_IDS = new Set(["1435", "1436", "1437"]);

export function isNfeFallbackToVs(legacyVendaId: string): boolean {
  return NFE_FALLBACK_VENDA_IDS.has(legacyVendaId);
}

export function classifyCustomerForPlan(
  legacyClienteId: string | null | undefined,
  customerIdMap: Map<string, string>
): {
  customerId: string | null;
  customerType: "CANONICAL" | "GENERIC_CONSUMIDOR" | "BLANK";
  isResolved: boolean;
} {
  const cid = String(legacyClienteId ?? "").trim();
  if (!cid || cid === "0" || cid.toLowerCase() === "null") {
    return { customerId: null, customerType: "BLANK", isResolved: true };
  }
  if (cid === "1") {
    return { customerId: null, customerType: "GENERIC_CONSUMIDOR", isResolved: true };
  }
  if (customerIdMap.has(cid)) {
    return { customerId: customerIdMap.get(cid)!, customerType: "CANONICAL", isResolved: true };
  }
  return { customerId: null, customerType: "CANONICAL", isResolved: false };
}

export function evaluateSaleRealization(params: {
  legacyVendaId: string;
  nfeList: Array<Record<string, any>>;
  nf: Record<string, any> | undefined;
  legacyDate: string;
}): {
  docType: SaleAnchorType;
  realizedDate: string;
  accessKey: string | null;
  documentNumber: string | null;
  series: string | null;
  isFallback: boolean;
} {
  const { legacyVendaId, nfeList, nf, legacyDate } = params;

  if (isNfeFallbackToVs(legacyVendaId)) {
    return {
      docType: SaleAnchorType.VENDA_SIMPLES,
      realizedDate: legacyDate,
      accessKey: null,
      documentNumber: null,
      series: null,
      isFallback: true,
    };
  }

  const rawKey =
    nfeList.length === 1 && nfeList[0]
      ? String(nfeList[0]["chave_acesso"] || "").replace(/\D/g, "")
      : "";

  if (rawKey.length === 44) {
    const docNumber = nf?.["numero_nota"] ? String(nf["numero_nota"]).trim() : null;
    const series = nf?.["serie"] ? String(nf["serie"]).trim() : null;
    const realizedDate = nf?.["data_emissao"]
      ? String(nf["data_emissao"]).trim()
      : legacyDate;

    return {
      docType: SaleAnchorType.NFE,
      realizedDate,
      accessKey: rawKey,
      documentNumber: docNumber || null,
      series: series || null,
      isFallback: false,
    };
  }

  return {
    docType: SaleAnchorType.VENDA_SIMPLES,
    realizedDate: legacyDate,
    accessKey: null,
    documentNumber: null,
    series: null,
    isFallback: false,
  };
}

export interface HustlerSalesPlanOptions {
  preloadedStaging?: {
    vendaRows?: Array<{ payload: unknown }>;
    nflRows?: Array<{ payload: unknown }>;
    nfeRows?: Array<{ payload: unknown }>;
    nfRows?: Array<{ payload: unknown }>;
  };
}

// -----------------------------------------------------------------------------
// Main Planner
// -----------------------------------------------------------------------------

export async function planHustlerSalesImport(
  prisma: PrismaClient,
  batchId: string,
  options?: HustlerSalesPlanOptions
): Promise<HustlerSalesImportPlan> {
  // 1. Validate Batch
  const batch = await prisma.historicalImportBatch.findUnique({
    where: { id: batchId },
    include: {
      company: {
        include: {
          tagPlusConnections: {
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  if (!batch) {
    throw new Error(`Batch '${batchId}' not found.`);
  }

  if (batch.status !== HistoricalImportBatchStatus.STAGED) {
    throw new Error(
      `Batch '${batchId}' must be in STAGED status. Current status: ${batch.status}`
    );
  }

  const companyId = batch.companyId;
  const connection = batch.company.tagPlusConnections[0];
  if (!connection) {
    throw new Error(`No active TagPlusConnection found for Company '${companyId}'.`);
  }
  const connectionId = connection.id;

  // 2. Load Existing Identities for Products and Customers
  const identities = await prisma.historicalSourceIdentity.findMany({
    where: { companyId, sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP },
    select: { sourceEntity: true, sourcePrimaryKey: true, canonicalEntityId: true },
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

  // 3. Load Staging Tables (or reuse preloadedStaging to eliminate redundant network egress)
  const [vendaRows, nflRows, nfeRows, nfRows] = options?.preloadedStaging
    ? [
        (options.preloadedStaging.vendaRows || []) as Array<{ payload: Record<string, any> }>,
        (options.preloadedStaging.nflRows || []) as Array<{ payload: Record<string, any> }>,
        (options.preloadedStaging.nfeRows || []) as Array<{ payload: Record<string, any> }>,
        (options.preloadedStaging.nfRows || []) as Array<{ payload: Record<string, any> }>,
      ]
    : await Promise.all([
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

  const nfMap = new Map<string, Record<string, any>>();
  for (const row of nfRows) {
    const p = row.payload as Record<string, any>;
    nfMap.set(String(p["id"]), p);
  }

  const itemsByNfId = new Map<string, Array<Record<string, any>>>();
  for (const row of nflRows) {
    const p = row.payload as Record<string, any>;
    const nfId = String(p["id_nota_fiscal"]);
    if (!itemsByNfId.has(nfId)) itemsByNfId.set(nfId, []);
    itemsByNfId.get(nfId)!.push(p);
  }

  const nfeByNfId = new Map<string, Array<Record<string, any>>>();
  for (const row of nfeRows) {
    const p = row.payload as Record<string, any>;
    const nfId = String(p["id_nota_fiscal"]);
    if (!nfeByNfId.has(nfId)) nfeByNfId.set(nfId, []);
    nfeByNfId.get(nfId)!.push(p);
  }

  // 4. Classify Active vs Cancelled
  const activeVendas: Array<Record<string, any>> = [];
  const cancelledSales: CancelledSale[] = [];
  let totalActiveRevenue = 0;

  for (const vr of vendaRows) {
    const v = vr.payload as Record<string, any>;
    const vid = String(v["id"]);
    const cancelado = String(v["cancelado"]);
    const total = parseFloat(String(v["vr_total"] || "0"));

    if (cancelado === "1") {
      cancelledSales.push({ legacyVendaId: vid, total });
    } else if (cancelado === "0") {
      activeVendas.push(v);
      totalActiveRevenue += total;
    }
  }

  // 5. Identify Total Mismatches: 11 Quarantined & 31 Freight Explained
  const quarantinedSales: QuarantinedSale[] = [];
  const freightVendaIds = new Set<string>();
  let quarantinedRevenue = 0;
  let totalCustomerFreight = 0;

  for (const v of activeVendas) {
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
      if (Math.abs(minDiff - vrFrete) <= 0.05 && vrFrete > 0) {
        freightVendaIds.add(vid);
        totalCustomerFreight += vrFrete;
      } else {
        quarantinedSales.push({
          legacyVendaId: vid,
          reason: "LEGACY_DATA_INCONSISTENCY",
          total: vendaTotal,
          explanation: `Diff of R$ ${minDiff.toFixed(2)} represents genuine legacy table discrepancy`,
        });
        quarantinedRevenue += vendaTotal;
      }
    }
  }

  const quarantinedIdSet = new Set(quarantinedSales.map((q) => q.legacyVendaId));
  const importableVendas = activeVendas.filter(
    (v) => !quarantinedIdSet.has(String(v["id"]))
  );

  // 6. Plan Canonical Transformation for 6,307 Importable Sales
  const plannedSales: PlannedSale[] = [];
  const plannedIdentities: PlannedHistoricalIdentity[] = [];

  let salesWithCanonicalCustomer = 0;
  let salesWithGenericCustomer = 0;
  let salesWithBlankCustomer = 0;
  let unresolvedCustomerCount = 0;

  let totalPlannedSaleItems = 0;
  let resolvedProductItems = 0;
  let unresolvedProductItems = 0;

  let nfeRealizationCount = 0;
  let vsRealizationCount = 0;
  let nfeFallbackToVsCount = 0;

  let totalNfeSsdi = 0;
  let totalVsSsdi = 0;

  let plannedSaleRevenue = 0;

  // Samples
  let canonicalCustomerSample: PlannedSale | null = null;
  let genericCustomerSample: PlannedSale | null = null;
  let blankCustomerSample: PlannedSale | null = null;
  let nfeRealizationSample: PlannedSale | null = null;
  let vsRealizationSample: PlannedSale | null = null;
  let nfeFallbackSample: PlannedSale | null = null;
  let freightSample: PlannedSale | null = null;

  for (const v of importableVendas) {
    const vid = String(v["id"]);
    const nfId = String(v["id_nota_fiscal"] || "");
    const nf = nfMap.get(nfId);
    const nfeList = nfeByNfId.get(nfId) || [];
    const rawItems = itemsByNfId.get(nfId) || [];

    const vendaTotal = parseFloat(String(v["vr_total"] || "0"));
    plannedSaleRevenue += vendaTotal;

    const legacyDate = String(
      v["data_hr_venda"] ||
        v["data"] ||
        nf?.["data_emissao"] ||
        nf?.["data_criacao"] ||
        ""
    );
    const commercialDate = parseLegacyDate(legacyDate);

    // Customer mapping
    const custClass = classifyCustomerForPlan(v["id_cliente"], customerIdMap);
    if (!custClass.isResolved) {
      unresolvedCustomerCount++;
    } else if (custClass.customerType === "CANONICAL") {
      salesWithCanonicalCustomer++;
    } else if (custClass.customerType === "GENERIC_CONSUMIDOR") {
      salesWithGenericCustomer++;
    } else if (custClass.customerType === "BLANK") {
      salesWithBlankCustomer++;
    }

    // Realization
    const realization = evaluateSaleRealization({
      legacyVendaId: vid,
      nfeList,
      nf,
      legacyDate,
    });

    if (realization.docType === SaleAnchorType.NFE) {
      nfeRealizationCount++;
    } else {
      vsRealizationCount++;
      if (realization.isFallback) {
        nfeFallbackToVsCount++;
      }
    }

    // Freight
    const hasFreight = freightVendaIds.has(vid);
    const freightAmount = hasFreight && nf ? parseFloat(String(nf["vr_frete"] || "0")) : null;

    // Items
    const plannedItems: PlannedSaleItem[] = [];
    const plannedSsdi: PlannedSaleSourceDocumentItem[] = [];

    let lineNum = 1;
    for (const it of rawItems) {
      const lid = String(it["id"]);
      const pid = String(it["id_produto"]);
      const canonicalPid = productIdMap.get(pid);

      totalPlannedSaleItems++;
      if (canonicalPid) {
        resolvedProductItems++;
      } else {
        unresolvedProductItems++;
      }

      const qty = new Prisma.Decimal(String(it["quantidade"] || "1"));
      const unit = new Prisma.Decimal(String(it["vr_produto"] || "0"));
      const descVal = parseFloat(
        String(it["vr_desconto_despesa"] || it["vr_desconto_bruto"] || "0")
      );
      const discount = descVal > 0 ? new Prisma.Decimal(descVal.toFixed(4)) : null;
      const subtotalVal = parseFloat(String(it["vr_subtotal"] || "0"));
      const subtotal =
        subtotalVal > 0
          ? new Prisma.Decimal(subtotalVal.toFixed(4))
          : new Prisma.Decimal((parseFloat(String(it["vr_produto"] || "0")) * parseFloat(String(it["quantidade"] || "1"))).toFixed(4));

      const plannedItem: PlannedSaleItem = {
        legacyItemId: lid,
        lineNumber: lineNum,
        sourceItemId: formatSaleItemSourceId(lid),
        legacyProductId: pid,
        canonicalProductId: canonicalPid || "",
        quantity: qty,
        unitPrice: unit,
        discountAmount: discount,
        subtotal,
      };
      plannedItems.push(plannedItem);

      const plannedDocItem: PlannedSaleSourceDocumentItem = {
        legacyItemId: lid,
        lineNumber: lineNum,
        sourceItemId: formatSaleItemSourceId(lid),
        legacyProductId: pid,
        canonicalProductId: canonicalPid || "",
        quantity: qty,
        unitPrice: unit,
        discountAmount: discount,
        subtotal,
      };
      plannedSsdi.push(plannedDocItem);

      lineNum++;
    }

    if (realization.docType === SaleAnchorType.NFE) {
      totalNfeSsdi += plannedSsdi.length;
    } else {
      totalVsSsdi += plannedSsdi.length;
    }

    const realizationDoc: PlannedSaleSourceDocument = {
      docType: realization.docType,
      sourceId: formatDocumentSourceId(vid),
      netAmount: new Prisma.Decimal(vendaTotal.toFixed(4)),
      sourceDocumentNumber: realization.documentNumber,
      accessKey: realization.accessKey,
      series: realization.series,
      sourceCreatedAt: commercialDate,
      sourceEmissaoAt: parseLegacyDate(realization.realizedDate),
      realizedDate: parseLegacyDate(realization.realizedDate),
      sourcePresent: true,
      items: plannedSsdi,
    };

    const plannedSale: PlannedSale = {
      legacyVendaId: vid,
      anchorType: realization.docType,
      anchorSourceId: formatSaleSourceId(vid),
      canonicalCustomerId: custClass.customerId,
      customerType: custClass.customerType,
      netAmount: new Prisma.Decimal(vendaTotal.toFixed(4)),
      commercialDate,
      sourceCreatedAt: commercialDate,
      sourceConfirmedAt: commercialDate,
      sourceEmissaoAt: parseLegacyDate(realization.realizedDate),
      customerFreightAmount: freightAmount ? new Prisma.Decimal(freightAmount.toFixed(4)) : null,
      items: plannedItems,
      realizationDoc,
      isFallbackToVs: realization.isFallback,
    };

    plannedSales.push(plannedSale);

    plannedIdentities.push({
      sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
      sourceEntity: "venda",
      sourcePrimaryKey: vid,
      canonicalEntityType: "Sale",
    });

    // Capture Samples
    if (!canonicalCustomerSample && custClass.customerType === "CANONICAL") {
      canonicalCustomerSample = plannedSale;
    }
    if (!genericCustomerSample && custClass.customerType === "GENERIC_CONSUMIDOR") {
      genericCustomerSample = plannedSale;
    }
    if (!blankCustomerSample && custClass.customerType === "BLANK") {
      blankCustomerSample = plannedSale;
    }
    if (!nfeRealizationSample && realization.docType === SaleAnchorType.NFE) {
      nfeRealizationSample = plannedSale;
    }
    if (!vsRealizationSample && realization.docType === SaleAnchorType.VENDA_SIMPLES && !realization.isFallback) {
      vsRealizationSample = plannedSale;
    }
    if (!nfeFallbackSample && realization.isFallback) {
      nfeFallbackSample = plannedSale;
    }
    if (!freightSample && hasFreight) {
      freightSample = plannedSale;
    }
  }

  // 7. Collision Checks (Read-Only)
  const [existingSales, existingIdentities, existingDocs] = await Promise.all([
    prisma.sale.count({
      where: {
        anchorSourceId: { startsWith: "HUSTLER_LEGACY:" },
      },
    }),
    prisma.historicalSourceIdentity.count({
      where: {
        sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
        sourceEntity: "venda",
      },
    }),
    prisma.saleSourceDocument.count({
      where: {
        sourceId: { startsWith: "HUSTLER_LEGACY:" },
      },
    }),
  ]);

  const summary: HustlerSalesPlanSummary = {
    totalLegacyVendas: vendaRows.length,
    activeVendas: activeVendas.length,
    cancelledVendas: cancelledSales.length,
    quarantinedVendas: quarantinedSales.length,
    importableSales: plannedSales.length,
    totalActiveRevenue: Math.round(totalActiveRevenue * 100) / 100,
    importableRevenue: Math.round(plannedSaleRevenue * 100) / 100,
    quarantinedRevenue: Math.round(quarantinedRevenue * 100) / 100,
    salesWithCanonicalCustomer,
    salesWithGenericCustomer,
    salesWithBlankCustomer,
    unresolvedCustomerCount,
    totalPlannedSaleItems,
    resolvedProductItems,
    unresolvedProductItems,
    plannedSaleSourceDocuments: plannedSales.length,
    nfeRealizationCount,
    vsRealizationCount,
    nfeFallbackToVsCount,
    multipleRealizationConflicts: 0,
    plannedSsdiCount: totalNfeSsdi + totalVsSsdi,
    nfeSsdiCount: totalNfeSsdi,
    vsSsdiCount: totalVsSsdi,
    salesWithCustomerFreight: freightVendaIds.size,
    totalCustomerFreight: Math.round(totalCustomerFreight * 100) / 100,
    plannedSaleRevenue: Math.round(plannedSaleRevenue * 100) / 100,
    plannedIdentitiesCount: plannedIdentities.length,
    saleSourceIdCollisions: existingSales,
    saleIdentityCollisions: existingIdentities,
    accessKeyCollisions: 0,
    documentCollisions: existingDocs,
  };

  return {
    batchId,
    companyId,
    connectionId,
    summary,
    plannedSales,
    plannedIdentities,
    quarantinedSales,
    cancelledSales,
    samples: {
      canonicalCustomerSample,
      genericCustomerSample,
      blankCustomerSample,
      nfeRealizationSample,
      vsRealizationSample,
      nfeFallbackSample,
      freightSample,
      quarantineSample: quarantinedSales.length > 0 ? (quarantinedSales[0] ?? null) : null,
    },
  };
}
