import type {
  CategoryTreeNode,
  CommercialChannel,
  ProfitabilityCategoryItem,
  ProfitabilityChannelItem,
  ProfitabilityCostSnapshot,
  ProfitabilityDataQuality,
  ProfitabilityOverviewResult,
  ProfitabilityProductItem,
  ProfitabilityRootCategoryItem,
  ProfitabilitySummary,
  ProfitabilityTrendPoint,
  RealizedProductMovement,
} from "./bi-types.js";

const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

export interface CatalogProductProfitabilityInfo {
  id: string;
  sourceId: string;
  code: string | null;
  description: string | null;
  categorySourceId: string | null;
  categoryDescription: string | null;
  effectiveCost: number | null;
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
function toLocalDateStr(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Formata data local em string YYYY-MM
 */
function toLocalMonthStr(d: Date): string {
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
  };
}
