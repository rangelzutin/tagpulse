import type {
  BiCustomerMetadata,
  CategoryTreeNode,
  CommercialChannel,
  ProfitabilityCategoryItem,
  ProfitabilityChannelItem,
  ProfitabilityCostSnapshot,
  ProfitabilityCustomerItem,
  ProfitabilityCustomersResult,
  ProfitabilityDataQuality,
  ProfitabilityOverviewHighlights,
  ProfitabilityOverviewResult,
  ProfitabilityProductHighlight,
  ProfitabilityProductItem,
  ProfitabilityProductsResult,
  ProfitabilityRealizingDocument,
  ProfitabilityRootCategoryItem,
  ProfitabilitySaleItem,
  ProfitabilitySalesResult,
  ProfitabilitySummary,
  ProfitabilityTrendPoint,
  RealizedProductMovement,
  BiSaleMetadata,
  BiDocumentMetadata,
} from "./bi-types.js";
import {
  calculateAbcClasses,
  classifyMarginTier,
  computeProfitabilityItemMetrics,
  parseShapeCommercialSize,
  resolveCommercialLine,
  round2,
} from "./bi-analytics-helpers.js";

export { classifyMarginTier };

export interface CatalogProductProfitabilityInfo {
  id: string;
  sourceId: string;
  code: string | null;
  description: string | null;
  categorySourceId: string | null;
  categoryDescription: string | null;
  effectiveCost: number | null;
  stockQuantity?: number | null;
}

export interface FlatCategoryInfo {
  sourceId: string;
  description: string;
  parentSourceId: string | null;
}

export interface CalculateProfitabilityInput {
  movements: RealizedProductMovement[];
  catalogProductsMap: Map<string, CatalogProductProfitabilityInfo>; // keyed by sourceId
  categoriesFlat: FlatCategoryInfo[];
  categoryTree: CategoryTreeNode[];
  period: {
    from: string;
    to: string;
  };
  filters?: {
    channel?: CommercialChannel | null;
    categorySourceId?: string | null;
  };
  costSnapshot: ProfitabilityCostSnapshot;
  salesMetadataMap?: Map<string, BiSaleMetadata> | undefined;
  documentsMetadataMap?: Map<string, BiDocumentMetadata> | undefined;
  customersMetadataMap?: Map<string, BiCustomerMetadata> | undefined;
}


/**
 * Coleta recursivamente o sourceId informado e todos os seus descendentes na árvore de categorias.
 */
export function getCategorySubtreeSourceIds(
  rootSourceId: string,
  categoriesFlat: FlatCategoryInfo[],
): Set<string> {
  const result = new Set<string>();
  result.add(rootSourceId);

  // Mapeia parentSourceId -> filhos
  const childrenMap = new Map<string, string[]>();
  for (const cat of categoriesFlat) {
    if (cat.parentSourceId) {
      const list = childrenMap.get(cat.parentSourceId) ?? [];
      list.push(cat.sourceId);
      childrenMap.set(cat.parentSourceId, list);
    }
  }

  const queue = [rootSourceId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = childrenMap.get(current) ?? [];
    for (const childId of children) {
      if (!result.has(childId)) {
        result.add(childId);
        queue.push(childId);
      }
    }
  }

  return result;
}

/**
 * Mapeia cada categoria para sua categoria raiz ancestral.
 */
export function buildCategoryToRootMap(
  categoriesFlat: FlatCategoryInfo[],
): Map<string, { rootSourceId: string; rootDescription: string }> {
  const catMap = new Map<string, FlatCategoryInfo>();
  for (const c of categoriesFlat) {
    catMap.set(c.sourceId, c);
  }

  const rootMap = new Map<string, { rootSourceId: string; rootDescription: string }>();

  for (const c of categoriesFlat) {
    let curr = c;
    const visited = new Set<string>([curr.sourceId]);
    while (curr.parentSourceId && catMap.has(curr.parentSourceId)) {
      const parent = catMap.get(curr.parentSourceId)!;
      if (visited.has(parent.sourceId)) break; // Proteção contra ciclo
      visited.add(parent.sourceId);
      curr = parent;
    }
    rootMap.set(c.sourceId, {
      rootSourceId: curr.sourceId,
      rootDescription: curr.description,
    });
  }

  return rootMap;
}

/**
 * Formata data local em string YYYY-MM-DD
 */
function toLocalDateStr(d: Date | string): string {
  if (typeof d === "string") {
    return d.substring(0, 10);
  }
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Formata data local em string YYYY-MM
 */
function toLocalMonthStr(d: Date | string): string {
  if (typeof d === "string") {
    return d.substring(0, 7);
  }
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function calculateProfitabilityOverview(
  input: CalculateProfitabilityInput,
): ProfitabilityOverviewResult {
  const {
    movements,
    catalogProductsMap,
    categoriesFlat,
    categoryTree,
    period,
    filters = {},
    costSnapshot,
  } = input;

  const selectedChannel = filters.channel ?? null;
  const selectedCategorySourceId = filters.categorySourceId ?? null;

  // 1. Resolução do filtro hierárquico de categorias se fornecido
  let allowedCategorySourceIds: Set<string> | null = null;
  if (selectedCategorySourceId) {
    allowedCategorySourceIds = getCategorySubtreeSourceIds(
      selectedCategorySourceId,
      categoriesFlat,
    );
  }

  // 2. Filtragem dos movimentos
  const filteredMovements: RealizedProductMovement[] = [];
  for (const m of movements) {
    if (selectedChannel && m.channel !== selectedChannel) {
      continue;
    }

    if (allowedCategorySourceIds) {
      const prod = catalogProductsMap.get(m.sourceProductId);
      // Movimento cujo produto não existe ou não tem categoria fica fora se há filtro de categoria ativo
      if (!prod || !prod.categorySourceId || !allowedCategorySourceIds.has(prod.categorySourceId)) {
        continue;
      }
    }

    filteredMovements.push(m);
  }

  // 3. Resolução do mapa de raízes
  const categoryToRootMap = buildCategoryToRootMap(categoriesFlat);

  // 4. Agregações para Summary e Data Quality
  let totalRealizedRevenue = 0;
  let revenueWithCurrentCost = 0;
  let estimatedCOGS = 0;
  let movementsWithCurrentCost = 0;
  let movementsWithoutCurrentCost = 0;
  let financialComplementCount = 0;
  let financialComplementRevenue = 0;
  let movementsWithoutCurrentProduct = 0;
  let revenueWithoutCurrentProduct = 0;

  const distinctProductSourceIds = new Set<string>();

  for (const m of filteredMovements) {
    distinctProductSourceIds.add(m.sourceProductId);
    const rev = m.allocatedNetRevenue;
    totalRealizedRevenue += rev;

    const prod = catalogProductsMap.get(m.sourceProductId);
    const hasProduct = Boolean(prod);
    const hasCost = prod?.effectiveCost !== null && prod?.effectiveCost !== undefined && prod.effectiveCost > 0;

    if (!hasProduct) {
      movementsWithoutCurrentProduct++;
      revenueWithoutCurrentProduct += rev;
    }

    if (m.origin === "PEDIDO_FINANCIAL_COMPLEMENT_VENDA_SIMPLES") {
      financialComplementCount++;
      financialComplementRevenue += rev;
    }

    if (hasCost) {
      movementsWithCurrentCost++;
      revenueWithCurrentCost += rev;
      // Regra canônica: se quantity = 0 => estimatedCOGS = 0
      if (m.quantity > 0) {
        estimatedCOGS += m.quantity * Number(prod!.effectiveCost);
      }
    } else {
      movementsWithoutCurrentCost++;
    }
  }

  let productsWithCurrentCost = 0;
  for (const sourceId of distinctProductSourceIds) {
    const prod = catalogProductsMap.get(sourceId);
    if (prod?.effectiveCost !== null && prod?.effectiveCost !== undefined) {
      productsWithCurrentCost++;
    }
  }
  const productsTotal = distinctProductSourceIds.size;
  const productsWithoutCurrentCost = productsTotal - productsWithCurrentCost;

  totalRealizedRevenue = round2(totalRealizedRevenue);
  revenueWithCurrentCost = round2(revenueWithCurrentCost);
  const revenueWithoutCurrentCost = round2(totalRealizedRevenue - revenueWithCurrentCost);
  estimatedCOGS = round2(estimatedCOGS);
  revenueWithoutCurrentProduct = round2(revenueWithoutCurrentProduct);
  financialComplementRevenue = round2(financialComplementRevenue);

  const estimatedGrossProfit = round2(revenueWithCurrentCost - estimatedCOGS);
  const estimatedGrossMarginPercent =
    revenueWithCurrentCost > 0
      ? round2((estimatedGrossProfit / revenueWithCurrentCost) * 100)
      : null;
  const costCoveragePercent =

    totalRealizedRevenue > 0
      ? round2((revenueWithCurrentCost / totalRealizedRevenue) * 100)
      : null;
  const currentCategoryCoveragePercent =
    totalRealizedRevenue > 0
      ? round2(((totalRealizedRevenue - revenueWithoutCurrentProduct) / totalRealizedRevenue) * 100)
      : null;

  const summary: ProfitabilitySummary = {
    realizedRevenue: totalRealizedRevenue,
    revenueWithCurrentCost,
    revenueWithoutCurrentCost,
    costCoveragePercent,
    estimatedCOGS,
    estimatedGrossProfit,
    estimatedGrossMarginPercent,
  };

  const dataQuality: ProfitabilityDataQuality = {
    movementsTotal: filteredMovements.length,
    movementsWithCurrentCost,
    movementsWithoutCurrentCost,
    productsTotal,
    productsWithCurrentCost,
    productsWithoutCurrentCost,
    realizedRevenue: totalRealizedRevenue,
    revenueWithCurrentCost,
    revenueWithoutCurrentCost,
    costCoveragePercent,
    financialComplementMovementCount: financialComplementCount,
    financialComplementRevenue,
    movementsWithoutCurrentProduct,
    revenueWithoutCurrentProduct,
    currentCategoryCoveragePercent,
    costBasis: "CURRENT_PRODUCT_EFFECTIVE_COST",
    categoryBasis: "CURRENT_PRODUCT_CATEGORY",
  };

  // 5. Série Temporal (trend)
  const fromDate = new Date(`${period.from}T00:00:00.000Z`);
  const toDate = new Date(`${period.to}T00:00:00.000Z`);
  const diffDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const trendGranularity: "DAY" | "MONTH" = diffDays <= 45 ? "DAY" : "MONTH";

  interface BucketData {
    period: string;
    realizedRevenue: number;
    revenueWithCurrentCost: number;
    estimatedCOGS: number;
  }
  const trendBucketMap = new Map<string, BucketData>();

  // Preenche todos os buckets contínuos para evitar furos no gráfico
  if (trendGranularity === "DAY") {
    const cur = new Date(fromDate.getTime());
    while (cur <= toDate) {
      const key = toLocalDateStr(cur);
      trendBucketMap.set(key, {
        period: key,
        realizedRevenue: 0,
        revenueWithCurrentCost: 0,
        estimatedCOGS: 0,
      });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  } else {
    const startYear = fromDate.getUTCFullYear();
    const startMonth = fromDate.getUTCMonth();
    const endYear = toDate.getUTCFullYear();
    const endMonth = toDate.getUTCMonth();

    let y = startYear;
    let m = startMonth;
    while (y < endYear || (y === endYear && m <= endMonth)) {
      const key = `${y}-${String(m + 1).padStart(2, "0")}`;
      trendBucketMap.set(key, {
        period: key,
        realizedRevenue: 0,
        revenueWithCurrentCost: 0,
        estimatedCOGS: 0,
      });
      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
    }
  }

  for (const m of filteredMovements) {
    const key = trendGranularity === "DAY" ? toLocalDateStr(m.realizedDate) : toLocalMonthStr(m.realizedDate);
    let bucket = trendBucketMap.get(key);
    if (!bucket) {
      bucket = {
        period: key,
        realizedRevenue: 0,
        revenueWithCurrentCost: 0,
        estimatedCOGS: 0,
      };
      trendBucketMap.set(key, bucket);
    }

    const rev = m.allocatedNetRevenue;
    bucket.realizedRevenue += rev;

    const prod = catalogProductsMap.get(m.sourceProductId);
    const hasCost = prod?.effectiveCost !== null && prod?.effectiveCost !== undefined && prod.effectiveCost > 0;
    if (hasCost) {
      bucket.revenueWithCurrentCost += rev;
      if (m.quantity > 0) {
        bucket.estimatedCOGS += m.quantity * Number(prod!.effectiveCost);
      }
    }
  }

  const sortedBucketKeys = Array.from(trendBucketMap.keys()).sort();
  const trend: ProfitabilityTrendPoint[] = sortedBucketKeys.map((key) => {
    const b = trendBucketMap.get(key)!;
    const relRev = round2(b.realizedRevenue);
    const withCost = round2(b.revenueWithCurrentCost);
    const withoutCost = round2(relRev - withCost);
    const cogs = round2(b.estimatedCOGS);
    const profit = round2(withCost - cogs);
    const margin = withCost > 0 ? round2((profit / withCost) * 100) : null;
    const coverage = relRev > 0 ? round2((withCost / relRev) * 100) : null;

    return {
      period: b.period,
      realizedRevenue: relRev,
      revenueWithCurrentCost: withCost,
      revenueWithoutCurrentCost: withoutCost,
      estimatedCOGS: cogs,
      estimatedGrossProfit: profit,
      estimatedGrossMarginPercent: margin,
      costCoveragePercent: coverage,
    };
  });

  // 6. Breakdown por Canal (channels[])
  const channelsAggregation = new Map<
    CommercialChannel,
    {
      realizedRevenue: number;
      revenueWithCurrentCost: number;
      estimatedCOGS: number;
      physicalQuantity: number;
    }
  >();

  for (const m of filteredMovements) {
    let item = channelsAggregation.get(m.channel);
    if (!item) {
      item = {
        realizedRevenue: 0,
        revenueWithCurrentCost: 0,
        estimatedCOGS: 0,
        physicalQuantity: 0,
      };
      channelsAggregation.set(m.channel, item);
    }

    const rev = m.allocatedNetRevenue;
    item.realizedRevenue += rev;
    item.physicalQuantity += m.quantity;

    const prod = catalogProductsMap.get(m.sourceProductId);
    const hasCost = prod?.effectiveCost !== null && prod?.effectiveCost !== undefined && prod.effectiveCost > 0;
    if (hasCost) {
      item.revenueWithCurrentCost += rev;
      if (m.quantity > 0) {
        item.estimatedCOGS += m.quantity * Number(prod!.effectiveCost);
      }
    }
  }

  const channels: ProfitabilityChannelItem[] = Array.from(channelsAggregation.entries())
    .map(([channel, val]) => {
      const relRev = round2(val.realizedRevenue);
      const withCost = round2(val.revenueWithCurrentCost);
      const cogs = round2(val.estimatedCOGS);
      const profit = round2(withCost - cogs);
      const margin = withCost > 0 ? round2((profit / withCost) * 100) : null;
      const coverage = relRev > 0 ? round2((withCost / relRev) * 100) : null;

      return {
        channel,
        realizedRevenue: relRev,
        revenueWithCurrentCost: withCost,
        estimatedCOGS: cogs,
        estimatedGrossProfit: profit,
        estimatedGrossMarginPercent: margin,
        costCoveragePercent: coverage,
        physicalQuantity: val.physicalQuantity,
      };
    })
    .sort((a, b) => b.realizedRevenue - a.realizedRevenue);

  // 7. Breakdown por Categoria Raiz (rootCategories[])
  const rootCategoryAgg = new Map<
    string,
    {
      category: string;
      realizedRevenue: number;
      revenueWithCurrentCost: number;
      estimatedCOGS: number;
      physicalQuantity: number;
    }
  >();

  for (const m of filteredMovements) {
    const prod = catalogProductsMap.get(m.sourceProductId);
    if (!prod || !prod.categorySourceId) continue; // Órfãos não entram em roots

    const rootInfo = categoryToRootMap.get(prod.categorySourceId);
    if (!rootInfo) continue;

    let rItem = rootCategoryAgg.get(rootInfo.rootSourceId);
    if (!rItem) {
      rItem = {
        category: rootInfo.rootDescription,
        realizedRevenue: 0,
        revenueWithCurrentCost: 0,
        estimatedCOGS: 0,
        physicalQuantity: 0,
      };
      rootCategoryAgg.set(rootInfo.rootSourceId, rItem);
    }

    const rev = m.allocatedNetRevenue;
    rItem.realizedRevenue += rev;
    rItem.physicalQuantity += m.quantity;

    const hasCost = prod.effectiveCost !== null && prod.effectiveCost !== undefined && prod.effectiveCost > 0;
    if (hasCost) {
      rItem.revenueWithCurrentCost += rev;
      if (m.quantity > 0) {
        rItem.estimatedCOGS += m.quantity * Number(prod.effectiveCost);
      }
    }
  }

  const rootCategories: ProfitabilityRootCategoryItem[] = Array.from(rootCategoryAgg.entries())
    .map(([categorySourceId, val]) => {
      const relRev = round2(val.realizedRevenue);
      const withCost = round2(val.revenueWithCurrentCost);
      const cogs = round2(val.estimatedCOGS);
      const profit = round2(withCost - cogs);
      const margin = withCost > 0 ? round2((profit / withCost) * 100) : null;
      const coverage = relRev > 0 ? round2((withCost / relRev) * 100) : null;

      return {
        categorySourceId,
        category: val.category,
        realizedRevenue: relRev,
        revenueWithCurrentCost: withCost,
        estimatedCOGS: cogs,
        estimatedGrossProfit: profit,
        estimatedGrossMarginPercent: margin,
        costCoveragePercent: coverage,
        physicalQuantity: val.physicalQuantity,
      };
    })
    .sort((a, b) => b.realizedRevenue - a.realizedRevenue);

  // 8. Breakdown por Categoria (categories[])
  const categoryAgg = new Map<
    string,
    {
      category: string;
      realizedRevenue: number;
      revenueWithCurrentCost: number;
      estimatedCOGS: number;
      physicalQuantity: number;
    }
  >();

  for (const m of filteredMovements) {
    const prod = catalogProductsMap.get(m.sourceProductId);
    if (!prod || !prod.categorySourceId) continue;

    let cItem = categoryAgg.get(prod.categorySourceId);
    if (!cItem) {
      cItem = {
        category: prod.categoryDescription ?? "Sem descrição",
        realizedRevenue: 0,
        revenueWithCurrentCost: 0,
        estimatedCOGS: 0,
        physicalQuantity: 0,
      };
      categoryAgg.set(prod.categorySourceId, cItem);
    }

    const rev = m.allocatedNetRevenue;
    cItem.realizedRevenue += rev;
    cItem.physicalQuantity += m.quantity;

    const hasCost = prod.effectiveCost !== null && prod.effectiveCost !== undefined && prod.effectiveCost > 0;
    if (hasCost) {
      cItem.revenueWithCurrentCost += rev;
      if (m.quantity > 0) {
        cItem.estimatedCOGS += m.quantity * Number(prod.effectiveCost);
      }
    }
  }

  const categories: ProfitabilityCategoryItem[] = Array.from(categoryAgg.entries())
    .map(([categorySourceId, val]) => {
      const relRev = round2(val.realizedRevenue);
      const withCost = round2(val.revenueWithCurrentCost);
      const cogs = round2(val.estimatedCOGS);
      const profit = round2(withCost - cogs);
      const margin = withCost > 0 ? round2((profit / withCost) * 100) : null;
      const coverage = relRev > 0 ? round2((withCost / relRev) * 100) : null;

      return {
        categorySourceId,
        category: val.category,
        realizedRevenue: relRev,
        revenueWithCurrentCost: withCost,
        estimatedCOGS: cogs,
        estimatedGrossProfit: profit,
        estimatedGrossMarginPercent: margin,
        costCoveragePercent: coverage,
        physicalQuantity: val.physicalQuantity,
      };
    })
    .sort((a, b) => b.realizedRevenue - a.realizedRevenue);

  // 9. Agregação por Produto (products[])
  interface ProductAggItem {
    productSourceId: string;
    physicalQuantity: number;
    realizedRevenue: number;
    revenueWithCurrentCost: number;
    estimatedCOGS: number;
    lastRealizedDate: Date | null;
  }

  const prodAggMap = new Map<string, ProductAggItem>();

  for (const m of filteredMovements) {
    let pItem = prodAggMap.get(m.sourceProductId);
    if (!pItem) {
      pItem = {
        productSourceId: m.sourceProductId,
        physicalQuantity: 0,
        realizedRevenue: 0,
        revenueWithCurrentCost: 0,
        estimatedCOGS: 0,
        lastRealizedDate: null,
      };
      prodAggMap.set(m.sourceProductId, pItem);
    }

    const rev = m.allocatedNetRevenue;
    pItem.realizedRevenue += rev;
    pItem.physicalQuantity += m.quantity;

    if (!pItem.lastRealizedDate || m.realizedDate > pItem.lastRealizedDate) {
      pItem.lastRealizedDate = m.realizedDate;
    }

    const prod = catalogProductsMap.get(m.sourceProductId);
    const hasCost = prod?.effectiveCost !== null && prod?.effectiveCost !== undefined && prod.effectiveCost > 0;
    if (hasCost) {
      pItem.revenueWithCurrentCost += rev;
      if (m.quantity > 0) {
        pItem.estimatedCOGS += m.quantity * Number(prod!.effectiveCost);
      }
    }
  }

  const products: ProfitabilityProductItem[] = Array.from(prodAggMap.values())
    .map((item) => {
      const prod = catalogProductsMap.get(item.productSourceId);
      const hasProduct = Boolean(prod);
      const hasCost = prod?.effectiveCost !== null && prod?.effectiveCost !== undefined && prod.effectiveCost > 0;

      const relRev = round2(item.realizedRevenue);
      const withCost = round2(item.revenueWithCurrentCost);
      const withoutCost = round2(relRev - withCost);

      let sku: string | null = null;
      let productName: string;
      let categorySourceId: string | null = null;
      let category: string | null = null;
      let rootCategorySourceId: string | null = null;
      let rootCategory: string | null = null;
      let currentEffectiveCost: number | null = null;
      let pCogs: number | null = null;
      let pProfit: number | null = null;
      let pMargin: number | null = null;
      let pCoverage: number | null = null;

      if (hasProduct) {
        sku = prod!.code;
        productName = prod!.description ?? `Produto ${item.productSourceId}`;
        categorySourceId = prod!.categorySourceId;
        category = prod!.categoryDescription;

        if (prod!.categorySourceId) {
          const rootInfo = categoryToRootMap.get(prod!.categorySourceId);
          if (rootInfo) {
            rootCategorySourceId = rootInfo.rootSourceId;
            rootCategory = rootInfo.rootDescription;
          }
        }

        if (hasCost) {
          currentEffectiveCost = Number(prod!.effectiveCost);
          pCogs = round2(item.estimatedCOGS);
          pProfit = round2(withCost - pCogs);
          pMargin = withCost > 0 ? round2((pProfit / withCost) * 100) : null;
          pCoverage = relRev > 0 ? round2((withCost / relRev) * 100) : null;
        } else {
          currentEffectiveCost = null;
          pCogs = null;
          pProfit = null;
          pMargin = null;
          pCoverage = 0;
        }
      } else {
        // Produto órfão (excluído do catálogo atual)
        sku = null;
        productName = `Produto não disponível no catálogo atual (ID: ${item.productSourceId})`;
        categorySourceId = null;
        category = null;
        rootCategorySourceId = null;
        rootCategory = null;
        currentEffectiveCost = null;
        pCogs = null;
        pProfit = null;
        pMargin = null;
        pCoverage = 0;
      }

      return {
        productSourceId: item.productSourceId,
        sku,
        productName,
        categorySourceId,
        category,
        rootCategorySourceId,
        rootCategory,
        physicalQuantity: item.physicalQuantity,
        realizedRevenue: relRev,
        currentEffectiveCost,
        revenueWithCurrentCost: withCost,
        revenueWithoutCurrentCost: withoutCost,
        estimatedCOGS: pCogs,
        estimatedGrossProfit: pProfit,
        estimatedGrossMarginPercent: pMargin,
        costCoveragePercent: pCoverage,
        lastRealizedDate: item.lastRealizedDate ? toLocalDateStr(item.lastRealizedDate) : null,
      };
    })
    .sort((a, b) => {
      // Ordenação padrão: estimatedGrossProfit DESC (nulos vão para o final)
      if (a.estimatedGrossProfit === null && b.estimatedGrossProfit === null) {
        return b.realizedRevenue - a.realizedRevenue;
      }
      if (a.estimatedGrossProfit === null) return 1;
      if (b.estimatedGrossProfit === null) return -1;
      return b.estimatedGrossProfit - a.estimatedGrossProfit;
    });

  const productsWithProfit = products.filter((p) => p.estimatedGrossProfit !== null);
  const topProfitProducts: ProfitabilityProductHighlight[] = productsWithProfit
    .slice(0, 3)
    .map((p) => ({
      productSourceId: p.productSourceId,
      sku: p.sku,
      productName: p.productName,
      realizedRevenue: p.realizedRevenue,
      estimatedGrossProfit: p.estimatedGrossProfit,
      estimatedGrossMarginPercent: p.estimatedGrossMarginPercent,
    }));

  const negativeMarginProductsCount = products.filter(
    (p) =>
      p.estimatedGrossMarginPercent !== null &&
      p.estimatedGrossMarginPercent < 0,
  ).length;

  const productsWithMargin = products.filter(
    (p) => p.estimatedGrossMarginPercent !== null,
  );
  const worstMarginProducts: ProfitabilityProductHighlight[] = [
    ...productsWithMargin,
  ]
    .sort(
      (a, b) =>
        (a.estimatedGrossMarginPercent ?? 0) -
        (b.estimatedGrossMarginPercent ?? 0),
    )
    .slice(0, 3)
    .map((p) => ({
      productSourceId: p.productSourceId,
      sku: p.sku,
      productName: p.productName,
      realizedRevenue: p.realizedRevenue,
      estimatedGrossProfit: p.estimatedGrossProfit,
      estimatedGrossMarginPercent: p.estimatedGrossMarginPercent,
    }));

  const highlights: ProfitabilityOverviewHighlights = {
    topProfitProducts,
    negativeMarginProductsCount,
    worstMarginProducts,
  };

  return {
    period,
    filters: {
      channel: selectedChannel,
      categorySourceId: selectedCategorySourceId,
    },
    summary,
    costSnapshot,
    dataQuality,
    trendGranularity,
    trend,
    channels,
    rootCategories,
    categories,
    products,
    highlights,
  };
}

/**
 * Canal predominante de um cliente com resolução determinística de 3 critérios:
 * 1. Maior receita realizada no período;
 * 2. Empate -> maior quantidade física;
 * 3. Empate -> prioridade canônica: ATACADO > VAREJO > INDETERMINADO > CONFLITO.
 */
const CHANNEL_PRIORITY: Record<CommercialChannel, number> = {
  ATACADO: 4,
  VAREJO: 3,
  INDETERMINADO: 2,
  CONFLITO: 1,
};

export function resolvePredominantChannel(
  channelStats:
    | Map<CommercialChannel, { revenue: number; quantity: number }>
    | Array<{ channel: CommercialChannel; revenue: number; quantity: number }>,
): CommercialChannel {
  let entries: Array<[CommercialChannel, { revenue: number; quantity: number }]>;
  if (channelStats instanceof Map) {
    entries = Array.from(channelStats.entries());
  } else if (Array.isArray(channelStats)) {
    entries = channelStats.map((item) => [
      item.channel,
      { revenue: item.revenue, quantity: item.quantity },
    ]);
  } else {
    return "INDETERMINADO";
  }

  let bestChannel: CommercialChannel = "INDETERMINADO";
  let bestRevenue = -1;
  let bestQuantity = -1;
  let bestPriority = -1;

  for (const [channel, stats] of entries) {
    const rev = stats.revenue;
    const qty = stats.quantity;
    const prio = CHANNEL_PRIORITY[channel] ?? 0;

    if (rev > bestRevenue) {
      bestChannel = channel;
      bestRevenue = rev;
      bestQuantity = qty;
      bestPriority = prio;
    } else if (Math.abs(rev - bestRevenue) < 0.001) {
      if (qty > bestQuantity) {
        bestChannel = channel;
        bestRevenue = rev;
        bestQuantity = qty;
        bestPriority = prio;
      } else if (Math.abs(qty - bestQuantity) < 0.001) {
        if (prio > bestPriority) {
          bestChannel = channel;
          bestRevenue = rev;
          bestQuantity = qty;
          bestPriority = prio;
        }
      }
    }
  }

  return bestChannel;
}

/**
 * Calculador canônico da visão de Rentabilidade por Produto.
 */
export function calculateProfitabilityProducts(
  input: CalculateProfitabilityInput,
): ProfitabilityProductsResult {
  const {
    movements,
    catalogProductsMap,
    categoriesFlat,
    period,
    filters = {},
  } = input;

  const selectedChannel = filters.channel ?? null;
  const selectedCategorySourceId = filters.categorySourceId ?? null;

  let allowedCategorySourceIds: Set<string> | null = null;
  if (selectedCategorySourceId) {
    allowedCategorySourceIds = getCategorySubtreeSourceIds(
      selectedCategorySourceId,
      categoriesFlat,
    );
  }

  const categoryToRootMap = buildCategoryToRootMap(categoriesFlat);
  const flatCategoryMap = new Map<string, FlatCategoryInfo>();
  for (const c of categoriesFlat) {
    flatCategoryMap.set(c.sourceId, c);
  }

  interface ProductAgg {
    productSourceId: string;
    physicalQuantity: number;
    realizedRevenue: number;
    revenueWithCurrentCost: number;
    estimatedCOGS: number;
    sales: Set<string>;
    customers: Set<string>;
    lastRealizedDate: Date | null;
  }

  const prodAggMap = new Map<string, ProductAgg>();

  let totalRevenue = 0;
  let totalWithCost = 0;
  let totalCOGS = 0;

  for (const m of movements) {
    if (selectedChannel && m.channel !== selectedChannel) {
      continue;
    }

    const dateStr = toLocalDateStr(m.realizedDate);
    if (period?.from && dateStr < period.from) {
      continue;
    }
    if (period?.to && dateStr > period.to) {
      continue;
    }

    const prod = catalogProductsMap.get(m.sourceProductId);

    if (allowedCategorySourceIds) {
      if (!prod || !prod.categorySourceId || !allowedCategorySourceIds.has(prod.categorySourceId)) {
        continue;
      }
    }

    let pItem = prodAggMap.get(m.sourceProductId);
    if (!pItem) {
      pItem = {
        productSourceId: m.sourceProductId,
        physicalQuantity: 0,
        realizedRevenue: 0,
        revenueWithCurrentCost: 0,
        estimatedCOGS: 0,
        sales: new Set(),
        customers: new Set(),
        lastRealizedDate: null,
      };
      prodAggMap.set(m.sourceProductId, pItem);
    }

    const rev = m.allocatedNetRevenue;
    pItem.realizedRevenue += rev;
    pItem.physicalQuantity += m.quantity;
    pItem.sales.add(m.saleId);
    if (m.customerId) {
      pItem.customers.add(m.customerId);
    }

    if (!pItem.lastRealizedDate || m.realizedDate > pItem.lastRealizedDate) {
      pItem.lastRealizedDate = m.realizedDate;
    }

    totalRevenue += rev;

    const hasCost = prod?.effectiveCost !== null && prod?.effectiveCost !== undefined && prod.effectiveCost >= 0;
    if (hasCost) {
      pItem.revenueWithCurrentCost += rev;
      totalWithCost += rev;
      if (m.quantity > 0) {
        const cogs = m.quantity * Number(prod!.effectiveCost);
        pItem.estimatedCOGS += cogs;
        totalCOGS += cogs;
      }
    }
  }

  const products: ProfitabilityProductItem[] = Array.from(prodAggMap.values())
    .map((item) => {
      const prod = catalogProductsMap.get(item.productSourceId);
      const hasProduct = Boolean(prod);
      const hasCost = prod?.effectiveCost !== null && prod?.effectiveCost !== undefined && prod.effectiveCost >= 0;

      const metrics = computeProfitabilityItemMetrics(
        item.realizedRevenue,
        item.revenueWithCurrentCost,
        item.estimatedCOGS,
        hasCost,
      );

      let sku: string | null = null;
      let productName: string;
      let categorySourceId: string | null = null;
      let category: string | null = null;
      let rootCategorySourceId: string | null = null;
      let rootCategory: string | null = null;
      let commercialLine = "SEM LINHA";
      let shapeSize = null;

      if (hasProduct) {
        sku = prod!.code;
        productName = prod!.description ?? `Produto ${item.productSourceId}`;
        categorySourceId = prod!.categorySourceId;
        category = prod!.categoryDescription;
        commercialLine = resolveCommercialLine(prod!.categorySourceId, flatCategoryMap);
        shapeSize = parseShapeCommercialSize(prod!.description, prod!.categoryDescription);

        if (prod!.categorySourceId) {
          const rootInfo = categoryToRootMap.get(prod!.categorySourceId);
          if (rootInfo) {
            rootCategorySourceId = rootInfo.rootSourceId;
            rootCategory = rootInfo.rootDescription;
          }
        }
      } else {
        productName = `Produto não disponível no catálogo atual (ID: ${item.productSourceId})`;
      }

      return {
        productId: prod?.id ?? null,
        productSourceId: item.productSourceId,
        sku,
        productName,
        commercialLine,
        categorySourceId,
        category,
        rootCategorySourceId,
        rootCategory,
        shapeSize,
        physicalQuantity: item.physicalQuantity,
        realizedRevenue: metrics.realizedRevenue,
        revenueWithCurrentCost: metrics.revenueWithCurrentCost,
        revenueWithoutCurrentCost: metrics.revenueWithoutCurrentCost,
        costCoveragePercent: metrics.costCoveragePercent,
        currentEffectiveCost: hasCost ? Number(prod!.effectiveCost) : null,
        estimatedCOGS: metrics.estimatedCOGS,
        estimatedGrossProfit: metrics.estimatedGrossProfit,
        estimatedGrossMarginPercent: metrics.estimatedGrossMarginPercent,
        stockQuantity: prod?.stockQuantity !== undefined && prod?.stockQuantity !== null ? Number(prod.stockQuantity) : null,
        abcClass: null,
        distinctCustomers: item.customers.size,
        distinctSales: item.sales.size,
        marginTier: classifyMarginTier(metrics.estimatedGrossMarginPercent),
        isOrphan: !hasProduct,
        lastRealizedDate: item.lastRealizedDate ? toLocalDateStr(item.lastRealizedDate) : null,
      };
    });

  // Curva ABC sobre receita realizada decrescente
  products.sort((a, b) => b.realizedRevenue - a.realizedRevenue);
  calculateAbcClasses(products, round2(totalRevenue));

  // Ordenação final: estimatedGrossProfit DESC (nulos ao final), realizedRevenue DESC, sku ASC
  products.sort((a, b) => {
    if (a.estimatedGrossProfit === null && b.estimatedGrossProfit === null) {
      return (
        b.realizedRevenue - a.realizedRevenue ||
        (a.sku ?? "").localeCompare(b.sku ?? "") ||
        a.productSourceId.localeCompare(b.productSourceId)
      );
    }
    if (a.estimatedGrossProfit === null) return 1;
    if (b.estimatedGrossProfit === null) return -1;
    if (Math.abs(b.estimatedGrossProfit - a.estimatedGrossProfit) > 0.001) {
      return b.estimatedGrossProfit - a.estimatedGrossProfit;
    }
    return (
      b.realizedRevenue - a.realizedRevenue ||
      (a.sku ?? "").localeCompare(b.sku ?? "") ||
      a.productSourceId.localeCompare(b.productSourceId)
    );
  });

  const summaryMetrics = computeProfitabilityItemMetrics(
    totalRevenue,
    totalWithCost,
    totalCOGS,
  );

  const distinctProductsSold = products.filter(
    (p) => p.physicalQuantity > 0 || p.realizedRevenue > 0,
  ).length;

  const negativeMarginCount = products.filter(
    (p) =>
      p.estimatedGrossMarginPercent !== null &&
      p.estimatedGrossMarginPercent < 0,
  ).length;

  return {
    period,
    filters: {
      channel: selectedChannel,
      categorySourceId: selectedCategorySourceId,
    },
    summary: {
      realizedRevenue: summaryMetrics.realizedRevenue,
      revenueWithCurrentCost: summaryMetrics.revenueWithCurrentCost,
      revenueWithoutCurrentCost: summaryMetrics.revenueWithoutCurrentCost,
      costCoveragePercent: summaryMetrics.costCoveragePercent,
      estimatedCOGS: summaryMetrics.estimatedCOGS ?? 0,
      estimatedGrossProfit: summaryMetrics.estimatedGrossProfit ?? 0,
      estimatedGrossMarginPercent: summaryMetrics.estimatedGrossMarginPercent,
      distinctProductsSold,
      negativeMarginCount,
    },
    products,
  };
}

/**
 * Calculador canônico da visão de Rentabilidade por Venda/Negociação.
 */
export function calculateProfitabilitySales(
  input: CalculateProfitabilityInput,
): ProfitabilitySalesResult {
  const {
    movements,
    catalogProductsMap,
    period,
    filters = {},
    salesMetadataMap,
    documentsMetadataMap,
  } = input;

  const selectedChannel = filters.channel ?? null;

  interface SaleAgg {
    saleId: string;
    customerId: string | null;
    channel: CommercialChannel;
    physicalQuantity: number;
    distinctProducts: Set<string>;
    realizedRevenue: number;
    revenueWithCurrentCost: number;
    estimatedCOGS: number;
    hasCostMovement: boolean;
    realizedDates: Date[];
    docsMap: Map<string, ProfitabilityRealizingDocument>;
  }

  const salesAggMap = new Map<string, SaleAgg>();

  let totalRevenue = 0;
  let totalWithCost = 0;
  let totalCOGS = 0;

  for (const m of movements) {
    if (selectedChannel && m.channel !== selectedChannel) {
      continue;
    }

    const dateStr = toLocalDateStr(m.realizedDate);
    if (period?.from && dateStr < period.from) {
      continue;
    }
    if (period?.to && dateStr > period.to) {
      continue;
    }

    let sItem = salesAggMap.get(m.saleId);
    if (!sItem) {
      sItem = {
        saleId: m.saleId,
        customerId: m.customerId,
        channel: m.channel,
        physicalQuantity: 0,
        distinctProducts: new Set(),
        realizedRevenue: 0,
        revenueWithCurrentCost: 0,
        estimatedCOGS: 0,
        hasCostMovement: false,
        realizedDates: [],
        docsMap: new Map(),
      };
      salesAggMap.set(m.saleId, sItem);
    }

    const rev = m.allocatedNetRevenue;
    sItem.realizedRevenue += rev;
    sItem.physicalQuantity += m.quantity;
    sItem.distinctProducts.add(m.sourceProductId);
    sItem.realizedDates.push(m.realizedDate);

    totalRevenue += rev;

    const prod = catalogProductsMap.get(m.sourceProductId);
    const hasCost = prod?.effectiveCost !== null && prod?.effectiveCost !== undefined && prod.effectiveCost >= 0;
    if (hasCost) {
      sItem.hasCostMovement = true;
      sItem.revenueWithCurrentCost += rev;
      totalWithCost += rev;
      if (m.quantity > 0) {
        const cogs = m.quantity * Number(prod!.effectiveCost);
        sItem.estimatedCOGS += cogs;
        totalCOGS += cogs;
      }
    }

    if (!sItem.docsMap.has(m.sourceDocumentId)) {
      const docMeta = documentsMetadataMap?.get(m.sourceDocumentId);
      sItem.docsMap.set(m.sourceDocumentId, {
        docType: docMeta?.docType ?? m.sourceDocumentType,
        sourceId: docMeta?.sourceId ?? m.sourceDocumentId,
        realizedDate: toLocalDateStr(docMeta?.realizedDate ?? m.realizedDate),
      });
    }
  }

  const sales: ProfitabilitySaleItem[] = Array.from(salesAggMap.values())
    .map((item) => {
      const metrics = computeProfitabilityItemMetrics(
        item.realizedRevenue,
        item.revenueWithCurrentCost,
        item.estimatedCOGS,
        item.hasCostMovement,
      );

      const saleMeta = salesMetadataMap?.get(item.saleId);
      const anchorType = saleMeta?.anchorType ?? "PEDIDO";
      const anchorSourceId = saleMeta?.anchorSourceId ?? item.saleId;
      const commercialDate = saleMeta?.commercialDate
        ? toLocalDateStr(saleMeta.commercialDate)
        : null;

      let customerName: string | null = null;
      if (saleMeta) {
        customerName =
          saleMeta.customerName ||
          saleMeta.tradeName ||
          saleMeta.legalName ||
          (item.customerId ? `Cliente ${item.customerId}` : null);
      } else if (item.customerId) {
        customerName = `Cliente ${item.customerId}`;
      }

      let minDate = item.realizedDates[0]!;
      let maxDate = item.realizedDates[0]!;
      for (const d of item.realizedDates) {
        if (d < minDate) minDate = d;
        if (d > maxDate) maxDate = d;
      }

      const realizingDocuments = Array.from(item.docsMap.values()).sort(
        (a, b) => a.realizedDate.localeCompare(b.realizedDate) || a.sourceId.localeCompare(b.sourceId),
      );

      return {
        saleId: item.saleId,
        anchorType,
        anchorSourceId,
        customerId: item.customerId,
        customerName,
        channel: item.channel,
        commercialDate,
        firstRealizedDate: toLocalDateStr(minDate),
        lastRealizedDate: toLocalDateStr(maxDate),
        realizedQuantity: item.physicalQuantity,
        distinctProducts: item.distinctProducts.size,
        realizedRevenue: metrics.realizedRevenue,
        revenueWithCurrentCost: metrics.revenueWithCurrentCost,
        revenueWithoutCurrentCost: metrics.revenueWithoutCurrentCost,
        costCoveragePercent: metrics.costCoveragePercent,
        estimatedCOGS: metrics.estimatedCOGS,
        estimatedGrossProfit: metrics.estimatedGrossProfit,
        estimatedGrossMarginPercent: metrics.estimatedGrossMarginPercent,
        marginTier: classifyMarginTier(metrics.estimatedGrossMarginPercent),
        realizingDocuments,
      };
    })
    .sort((a, b) => {
      if (a.estimatedGrossProfit === null && b.estimatedGrossProfit === null) {
        return (
          b.realizedRevenue - a.realizedRevenue ||
          a.saleId.localeCompare(b.saleId)
        );
      }
      if (a.estimatedGrossProfit === null) return 1;
      if (b.estimatedGrossProfit === null) return -1;
      if (Math.abs(b.estimatedGrossProfit - a.estimatedGrossProfit) > 0.001) {
        return b.estimatedGrossProfit - a.estimatedGrossProfit;
      }
      return (
        b.realizedRevenue - a.realizedRevenue ||
        a.saleId.localeCompare(b.saleId)
      );
    });

  const summaryMetrics = computeProfitabilityItemMetrics(
    totalRevenue,
    totalWithCost,
    totalCOGS,
  );

  const negativeMarginSalesCount = sales.filter(
    (s) =>
      s.estimatedGrossMarginPercent !== null &&
      s.estimatedGrossMarginPercent < 0,
  ).length;

  return {
    period,
    filters: {
      channel: selectedChannel,
    },
    summary: {
      realizedRevenue: summaryMetrics.realizedRevenue,
      revenueWithCurrentCost: summaryMetrics.revenueWithCurrentCost,
      revenueWithoutCurrentCost: summaryMetrics.revenueWithoutCurrentCost,
      costCoveragePercent: summaryMetrics.costCoveragePercent,
      estimatedCOGS: summaryMetrics.estimatedCOGS ?? 0,
      estimatedGrossProfit: summaryMetrics.estimatedGrossProfit ?? 0,
      estimatedGrossMarginPercent: summaryMetrics.estimatedGrossMarginPercent,
      totalSales: sales.length,
      negativeMarginSalesCount,
    },
    sales,
  };
}

/**
 * Calculador canônico da visão de Rentabilidade por Cliente.
 */
export function calculateProfitabilityCustomers(
  input: CalculateProfitabilityInput,
): ProfitabilityCustomersResult {
  const {
    movements,
    catalogProductsMap,
    period,
    filters = {},
    customersMetadataMap,
  } = input;

  const selectedChannel = filters.channel ?? null;

  interface CustomerAgg {
    customerId: string | null;
    sales: Set<string>;
    physicalQuantity: number;
    realizedRevenue: number;
    revenueWithCurrentCost: number;
    estimatedCOGS: number;
    hasCostMovement: boolean;
    firstPurchaseDate: Date;
    lastPurchaseDate: Date;
    channelStats: Map<CommercialChannel, { revenue: number; quantity: number }>;
  }

  const custAggMap = new Map<string, CustomerAgg>();

  let totalRevenue = 0;
  let totalWithCost = 0;
  let totalCOGS = 0;
  const allUniqueSales = new Set<string>();

  for (const m of movements) {
    if (selectedChannel && m.channel !== selectedChannel) {
      continue;
    }

    const dateStr = toLocalDateStr(m.realizedDate);
    if (period?.from && dateStr < period.from) {
      continue;
    }
    if (period?.to && dateStr > period.to) {
      continue;
    }

    const key = m.customerId ?? "__SYNTHETIC_NULL_CUSTOMER__";

    let cItem = custAggMap.get(key);
    if (!cItem) {
      cItem = {
        customerId: m.customerId,
        sales: new Set(),
        physicalQuantity: 0,
        realizedRevenue: 0,
        revenueWithCurrentCost: 0,
        estimatedCOGS: 0,
        hasCostMovement: false,
        firstPurchaseDate: m.realizedDate,
        lastPurchaseDate: m.realizedDate,
        channelStats: new Map(),
      };
      custAggMap.set(key, cItem);
    }

    const rev = m.allocatedNetRevenue;
    cItem.realizedRevenue += rev;
    cItem.physicalQuantity += m.quantity;
    cItem.sales.add(m.saleId);
    allUniqueSales.add(m.saleId);

    if (m.realizedDate < cItem.firstPurchaseDate) {
      cItem.firstPurchaseDate = m.realizedDate;
    }
    if (m.realizedDate > cItem.lastPurchaseDate) {
      cItem.lastPurchaseDate = m.realizedDate;
    }

    const chStat = cItem.channelStats.get(m.channel) ?? { revenue: 0, quantity: 0 };
    chStat.revenue += rev;
    chStat.quantity += m.quantity;
    cItem.channelStats.set(m.channel, chStat);

    totalRevenue += rev;

    const prod = catalogProductsMap.get(m.sourceProductId);
    const hasCost = prod?.effectiveCost !== null && prod?.effectiveCost !== undefined && prod.effectiveCost >= 0;
    if (hasCost) {
      cItem.hasCostMovement = true;
      cItem.revenueWithCurrentCost += rev;
      totalWithCost += rev;
      if (m.quantity > 0) {
        const cogs = m.quantity * Number(prod!.effectiveCost);
        cItem.estimatedCOGS += cogs;
        totalCOGS += cogs;
      }
    }
  }

  const customers: ProfitabilityCustomerItem[] = Array.from(custAggMap.values())
    .map((item) => {
      const metrics = computeProfitabilityItemMetrics(
        item.realizedRevenue,
        item.revenueWithCurrentCost,
        item.estimatedCOGS,
        item.hasCostMovement,
      );

      let customerName: string;
      let tradeName: string | null = null;
      let legalName: string | null = null;
      let cpf: string | null = null;
      let cnpj: string | null = null;

      if (item.customerId === null) {
        customerName = "Cliente não identificado";
      } else {
        const meta = customersMetadataMap?.get(item.customerId);
        tradeName = meta?.tradeName ?? null;
        legalName = meta?.legalName ?? null;
        cpf = meta?.cpf ?? null;
        cnpj = meta?.cnpj ?? null;

        customerName =
          meta?.tradeName ||
          meta?.legalName ||
          (meta?.sourceId ? `Cliente ${meta.sourceId}` : `Cliente ${item.customerId}`);
      }

      const realizedSales = item.sales.size;
      const ticketAverage =
        realizedSales > 0
          ? round2(metrics.realizedRevenue / realizedSales)
          : 0;

      const predominantChannel = resolvePredominantChannel(item.channelStats);

      return {
        customerId: item.customerId,
        customerName,
        tradeName,
        legalName,
        cpf,
        cnpj,
        predominantChannel,
        realizedSales,
        realizedQuantity: item.physicalQuantity,
        realizedRevenue: metrics.realizedRevenue,
        ticketAverage,
        revenueWithCurrentCost: metrics.revenueWithCurrentCost,
        revenueWithoutCurrentCost: metrics.revenueWithoutCurrentCost,
        costCoveragePercent: metrics.costCoveragePercent,
        estimatedCOGS: metrics.estimatedCOGS,
        estimatedGrossProfit: metrics.estimatedGrossProfit,
        estimatedGrossMarginPercent: metrics.estimatedGrossMarginPercent,
        marginTier: classifyMarginTier(metrics.estimatedGrossMarginPercent),
        firstPurchaseInPeriod: toLocalDateStr(item.firstPurchaseDate),
        lastPurchaseInPeriod: toLocalDateStr(item.lastPurchaseDate),
      };
    })
    .sort((a, b) => {
      if (a.estimatedGrossProfit === null && b.estimatedGrossProfit === null) {
        return (
          b.realizedRevenue - a.realizedRevenue ||
          a.customerName.localeCompare(b.customerName)
        );
      }
      if (a.estimatedGrossProfit === null) return 1;
      if (b.estimatedGrossProfit === null) return -1;
      if (Math.abs(b.estimatedGrossProfit - a.estimatedGrossProfit) > 0.001) {
        return b.estimatedGrossProfit - a.estimatedGrossProfit;
      }
      return (
        b.realizedRevenue - a.realizedRevenue ||
        a.customerName.localeCompare(b.customerName)
      );
    });

  const summaryMetrics = computeProfitabilityItemMetrics(
    totalRevenue,
    totalWithCost,
    totalCOGS,
  );

  const averageTicket =
    allUniqueSales.size > 0
      ? round2(summaryMetrics.realizedRevenue / allUniqueSales.size)
      : 0;

  return {
    period,
    filters: {
      channel: selectedChannel,
    },
    summary: {
      realizedRevenue: summaryMetrics.realizedRevenue,
      revenueWithCurrentCost: summaryMetrics.revenueWithCurrentCost,
      revenueWithoutCurrentCost: summaryMetrics.revenueWithoutCurrentCost,
      costCoveragePercent: summaryMetrics.costCoveragePercent,
      estimatedCOGS: summaryMetrics.estimatedCOGS ?? 0,
      estimatedGrossProfit: summaryMetrics.estimatedGrossProfit ?? 0,
      estimatedGrossMarginPercent: summaryMetrics.estimatedGrossMarginPercent,
      totalCustomers: customers.length,
      averageTicket,
    },
    customers,
  };
}
