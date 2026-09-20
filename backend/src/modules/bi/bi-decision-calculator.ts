import type {
  CommercialChannel,
  DecisionsCapitalGroups,
  DecisionsDataQuality,
  DecisionsKpis,
  DecisionsMeta,
  DecisionsOverviewResult,
  DecisionsProductItem,
  DecisionsReplenishmentGroups,
  InventoryWindowDays,
  RealizedProductMovement,
} from "./bi-types.js";
import type { CatalogInventoryProduct } from "./bi-inventory-calculator.js";
import {
  buildCategoryToRootMap,
  getCategorySubtreeSourceIds,
  type FlatCategoryInfo,
} from "./bi-profitability-calculator.js";

const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

export interface CalculateDecisionsOverviewParams {
  asOfDate: string; // YYYY-MM-DD
  windowDays: InventoryWindowDays; // 30 | 90 | 180
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  catalogProducts: CatalogInventoryProduct[];
  movementsInWindow: RealizedProductMovement[];
  categoriesFlat: FlatCategoryInfo[];
  historicalLastPhysicalSales: Map<string, Date>;
  filters?: {
    categorySourceId?: string | null;
  };
}

/**
 * Comparador determinístico para listas de reposição:
 * 1. Lucro bruto estimado DESC (valores conhecidos primeiro, null por último)
 * 2. Receita realizada DESC
 * 3. Quantidade física DESC
 */
export function compareReplenishmentItems(
  a: DecisionsProductItem,
  b: DecisionsProductItem,
): number {
  const profitA = a.estimatedGrossProfitInWindow;
  const profitB = b.estimatedGrossProfitInWindow;

  if (profitA !== null && profitB !== null) {
    if (profitB !== profitA) return profitB - profitA;
  } else if (profitA !== null && profitB === null) {
    return -1;
  } else if (profitA === null && profitB !== null) {
    return 1;
  }

  // Desempate 1: Receita realizada
  if (b.realizedRevenueInWindow !== a.realizedRevenueInWindow) {
    return b.realizedRevenueInWindow - a.realizedRevenueInWindow;
  }

  // Desempate 2: Quantidade física
  if (b.physicalQuantityInWindow !== a.physicalQuantityInWindow) {
    return b.physicalQuantityInWindow - a.physicalQuantityInWindow;
  }

  // Desempate estável por ID
  return a.productSourceId.localeCompare(b.productSourceId, "pt-BR");
}

/**
 * Comparador determinístico para listas de capital:
 * 1. Capital atual a custo DESC (valores conhecidos primeiro, null por último)
 * 2. Saldo de estoque DESC
 * 3. Dias sem saída física DESC (maior tempo sem venda primeiro)
 */
export function compareCapitalItems(
  a: DecisionsProductItem,
  b: DecisionsProductItem,
): number {
  const capA = a.currentInventoryCostValue;
  const capB = b.currentInventoryCostValue;

  if (capA !== null && capB !== null) {
    if (capB !== capA) return capB - capA;
  } else if (capA !== null && capB === null) {
    return -1;
  } else if (capA === null && capB !== null) {
    return 1;
  }

  // Desempate 1: Saldo de estoque
  if (b.currentStock !== a.currentStock) {
    return b.currentStock - a.currentStock;
  }

  // Desempate 2: Dias sem saída física
  const daysA = a.daysSinceLastPhysicalSale ?? -1;
  const daysB = b.daysSinceLastPhysicalSale ?? -1;
  if (daysB !== daysA) {
    return daysB - daysA;
  }

  // Desempate estável por ID
  return a.productSourceId.localeCompare(b.productSourceId, "pt-BR");
}

/**
 * Motor puro de cálculo para a Central de Decisões V1.
 */
export function calculateDecisionsOverview(
  params: CalculateDecisionsOverviewParams,
): DecisionsOverviewResult {
  const {
    asOfDate,
    windowDays,
    startDate,
    endDate,
    catalogProducts,
    movementsInWindow,
    categoriesFlat,
    historicalLastPhysicalSales,
    filters,
  } = params;

  // 1. Mapeamento de categorias e raízes
  const categoryToRootMap = buildCategoryToRootMap(categoriesFlat);
  const categoriesMapById = new Map<string, FlatCategoryInfo>();
  for (const cat of categoriesFlat) {
    categoriesMapById.set(cat.sourceId, cat);
  }

  // 2. Filtro de categoria (nó + descendentes)
  let allowedCategoryIds: Set<string> | null = null;
  let appliedCategoryDescription: string | null = null;

  if (filters?.categorySourceId && filters.categorySourceId.trim()) {
    const targetCatId = filters.categorySourceId.trim();
    allowedCategoryIds = getCategorySubtreeSourceIds(targetCatId, categoriesFlat);
    const catInfo = categoriesMapById.get(targetCatId);
    appliedCategoryDescription = catInfo?.description ?? targetCatId;
  }

  // 3. Filtrar catálogo se categoria informada
  const eligibleProducts = allowedCategoryIds
    ? catalogProducts.filter(
        (p) => p.categorySourceId && allowedCategoryIds!.has(p.categorySourceId),
      )
    : catalogProducts;

  // 4. Agrupar movimentações realizadas por sourceProductId
  interface MovementAgg {
    quantity: number;
    allocatedNetRevenue: number;
    customerIds: Set<string>;
    channels: Set<CommercialChannel>;
    lastRealizedDate: Date | null;
  }

  const movAggMap = new Map<string, MovementAgg>();
  for (const m of movementsInWindow) {
    if (!m.sourceProductId) continue;
    let agg = movAggMap.get(m.sourceProductId);
    if (!agg) {
      agg = {
        quantity: 0,
        allocatedNetRevenue: 0,
        customerIds: new Set<string>(),
        channels: new Set<CommercialChannel>(),
        lastRealizedDate: null,
      };
      movAggMap.set(m.sourceProductId, agg);
    }
    agg.quantity += m.quantity;
    agg.allocatedNetRevenue += m.allocatedNetRevenue;
    if (m.customerId) agg.customerIds.add(m.customerId);
    if (m.channel) agg.channels.add(m.channel);
    if (!agg.lastRealizedDate || m.realizedDate > agg.lastRealizedDate) {
      agg.lastRealizedDate = m.realizedDate;
    }
  }

  // Timestamp de referência em UTC para cálculo de dias desde a última saída
  const asOfDateParts = asOfDate.split("-").map(Number);
  const asOfDateUtcMs = Date.UTC(
    asOfDateParts[0] ?? 2026,
    (asOfDateParts[1] ?? 1) - 1,
    asOfDateParts[2] ?? 1,
  );

  // 5. Construir itens analíticos para cada produto elegível
  const items: DecisionsProductItem[] = [];

  let productsTotalWithSales = 0;
  let productsWithCostCount = 0;
  let productsWithoutCostCount = 0;
  let totalRevenueWithCost = 0;
  let totalRevenueWithoutCost = 0;
  let totalRealizedRevenue = 0;
  let totalGrossProfit = 0;

  for (const p of eligibleProducts) {
    const agg = movAggMap.get(p.sourceId);
    const physQty = agg ? round2(agg.quantity) : 0;
    const netRev = agg ? round2(agg.allocatedNetRevenue) : 0;
    const customerCount = agg ? agg.customerIds.size : 0;

    const channelsInWindow: CommercialChannel[] = agg
      ? Array.from(agg.channels).sort()
      : [];

    const stock = p.stockQuantity ?? 0;
    const cost = p.effectiveCost !== null ? Number(p.effectiveCost) : null;
    const retailPrice =
      p.retailSalePrice !== null ? Number(p.retailSalePrice) : null;

    // Capital atual a custo:
    // Segue a semântica canônica de Inventory: estoque positivo e custo conhecido
    let currentInventoryCostValue: number | null = null;
    if (cost !== null) {
      currentInventoryCostValue = stock > 0 ? round2(stock * cost) : 0;
    }

    // Valor de tabela:
    let currentInventoryListValue: number | null = null;
    if (retailPrice !== null) {
      currentInventoryListValue = stock > 0 ? round2(stock * retailPrice) : 0;
    }

    // Velocidade diária (ADS)
    const ads = round2(physQty / windowDays);

    // Cobertura estimada:
    // Somente quando currentStock > 0 && ads > 0. Caso contrário = null
    let estimatedCoverageDays: number | null = null;
    if (stock > 0 && ads > 0) {
      estimatedCoverageDays = round2(stock / ads);
    }

    // Rentabilidade estimada ao custo atual:
    // Custo ausente nunca se torna zero
    let estimatedCOGS: number | null = null;
    let estimatedGrossProfit: number | null = null;
    let estimatedGrossMarginPercent: number | null = null;

    if (cost !== null && physQty > 0) {
      estimatedCOGS = round2(physQty * cost);
      estimatedGrossProfit = round2(netRev - estimatedCOGS);
      estimatedGrossMarginPercent =
        netRev !== 0 ? round2((estimatedGrossProfit / netRev) * 100) : null;
    } else if (cost !== null) {
      estimatedCOGS = 0;
      estimatedGrossProfit = 0;
      estimatedGrossMarginPercent = null;
    }

    // Data da última saída física
    let lastSaleDateObj: Date | null = null;
    if (agg?.lastRealizedDate) {
      lastSaleDateObj = agg.lastRealizedDate;
    } else {
      lastSaleDateObj = historicalLastPhysicalSales.get(p.sourceId) ?? null;
    }

    let lastPhysicalSaleDate: string | null = null;
    let daysSinceLastPhysicalSale: number | null = null;
    if (lastSaleDateObj) {
      lastPhysicalSaleDate = lastSaleDateObj.toISOString().slice(0, 10);
      const saleDateParts = lastPhysicalSaleDate.split("-").map(Number);
      const saleDateUtcMs = Date.UTC(
        saleDateParts[0] ?? 2026,
        (saleDateParts[1] ?? 1) - 1,
        saleDateParts[2] ?? 1,
      );
      daysSinceLastPhysicalSale = Math.max(
        0,
        Math.floor((asOfDateUtcMs - saleDateUtcMs) / (1000 * 60 * 60 * 24)),
      );
    }

    // Categoria raiz / família
    let rootCategorySourceId: string | null = null;
    let rootCategoryDescription: string | null = null;
    if (p.categorySourceId) {
      const root = categoryToRootMap.get(p.categorySourceId);
      if (root) {
        rootCategorySourceId = root.rootSourceId;
        rootCategoryDescription = root.rootDescription;
      }
    }

    const item: DecisionsProductItem = {
      productSourceId: p.sourceId,
      code: p.code ?? null,
      description: p.description ?? null,
      active: p.active === true,
      categorySourceId: p.categorySourceId ?? null,
      categoryDescription: p.categoryDescription ?? null,
      rootCategorySourceId,
      rootCategoryDescription,
      currentStock: stock,
      currentEffectiveCost: cost,
      currentInventoryCostValue,
      currentInventoryListValue,
      retailSalePrice: retailPrice,
      physicalQuantityInWindow: physQty,
      realizedRevenueInWindow: netRev,
      customerCountInWindow: customerCount,
      averageDailySales: ads,
      estimatedCoverageDays,
      lastPhysicalSaleDate,
      daysSinceLastPhysicalSale,
      estimatedCOGSInWindow: estimatedCOGS,
      estimatedGrossProfitInWindow: estimatedGrossProfit,
      estimatedGrossMarginPercentInWindow: estimatedGrossMarginPercent,
      channelsInWindow,
    };

    items.push(item);

    // Contabilidade para Data Quality e Agregados
    if (physQty > 0) {
      productsTotalWithSales++;
      totalRealizedRevenue += netRev;
      if (cost !== null) {
        productsWithCostCount++;
        totalRevenueWithCost += netRev;
        if (estimatedGrossProfit !== null) {
          totalGrossProfit += estimatedGrossProfit;
        }
      } else {
        productsWithoutCostCount++;
        totalRevenueWithoutCost += netRev;
      }
    }
  }

  totalRealizedRevenue = round2(totalRealizedRevenue);
  totalRevenueWithCost = round2(totalRevenueWithCost);
  totalRevenueWithoutCost = round2(totalRevenueWithoutCost);
  totalGrossProfit = round2(totalGrossProfit);

  const costCoveragePercent =
    totalRealizedRevenue > 0
      ? round2((totalRevenueWithCost / totalRealizedRevenue) * 100)
      : null;

  const dataQuality: DecisionsDataQuality = {
    productsTotal: productsTotalWithSales,
    productsWithCurrentCost: productsWithCostCount,
    productsWithoutCurrentCost: productsWithoutCostCount,
    revenueWithCurrentCost: totalRevenueWithCost,
    revenueWithoutCurrentCost: totalRevenueWithoutCost,
    costCoveragePercent,
  };

  // 6. Grupos de Reposição (Restritos a active = true)
  const demandWithoutStock = items
    .filter(
      (i) => i.active && i.currentStock <= 0 && i.physicalQuantityInWindow > 0,
    )
    .sort(compareReplenishmentItems);

  const criticalCoverage = items
    .filter(
      (i) =>
        i.active &&
        i.currentStock > 0 &&
        i.physicalQuantityInWindow > 0 &&
        i.estimatedCoverageDays !== null &&
        i.estimatedCoverageDays < 15,
    )
    .sort(compareReplenishmentItems);

  const alertCoverage = items
    .filter(
      (i) =>
        i.active &&
        i.currentStock > 0 &&
        i.physicalQuantityInWindow > 0 &&
        i.estimatedCoverageDays !== null &&
        i.estimatedCoverageDays >= 15 &&
        i.estimatedCoverageDays < 30,
    )
    .sort(compareReplenishmentItems);

  const replenishment: DecisionsReplenishmentGroups = {
    demandWithoutStock,
    criticalCoverage,
    alertCoverage,
  };

  // 7. Grupos de Capital
  // A. Sem saída na janela (ativos com estoque positivo e sem vendas)
  const inventoryWithoutSales = items
    .filter(
      (i) => i.active && i.currentStock > 0 && i.physicalQuantityInWindow === 0,
    )
    .sort(compareCapitalItems);

  // B. Cobertura alta > 90 dias (ativos com estoque positivo e vendas com cobertura > 90)
  const highCoverage = items
    .filter(
      (i) =>
        i.active &&
        i.currentStock > 0 &&
        i.physicalQuantityInWindow > 0 &&
        i.estimatedCoverageDays !== null &&
        i.estimatedCoverageDays > 90,
    )
    .sort(compareCapitalItems);

  // C. Inativos com estoque (active = false com estoque positivo)
  const inactiveWithStock = items
    .filter((i) => !i.active && i.currentStock > 0)
    .sort(compareCapitalItems);

  const capitalOptimization: DecisionsCapitalGroups = {
    inventoryWithoutSales,
    highCoverage,
    inactiveWithStock,
  };

  // 8. KPIs Executivos
  // Capital em estoque: total de produtos elegíveis com saldo positivo a custo conhecido
  const currentInventoryCapital = round2(
    items.reduce((sum, i) => {
      if (i.currentStock > 0 && i.currentInventoryCostValue !== null) {
        return sum + i.currentInventoryCostValue;
      }
      return sum;
    }, 0),
  );

  // Capital sem saída — ativos: soma exclusivamente de inventoryWithoutSales
  const capitalWithoutSalesActive = round2(
    inventoryWithoutSales.reduce((sum, i) => {
      if (i.currentInventoryCostValue !== null) {
        return sum + i.currentInventoryCostValue;
      }
      return sum;
    }, 0),
  );

  const kpis: DecisionsKpis = {
    currentInventoryCapital,
    capitalWithoutSalesActive,
    demandWithoutStockCount: demandWithoutStock.length,
    lowCoverageCount: criticalCoverage.length + alertCoverage.length,
    criticalCoverageCount: criticalCoverage.length,
    alertCoverageCount: alertCoverage.length,
    estimatedGrossProfitInWindow: totalGrossProfit,
    realizedRevenueInWindow: totalRealizedRevenue,
  };

  const meta: DecisionsMeta = {
    asOfDate,
    windowDays,
    startDate,
    endDate,
    totalCatalogProducts: catalogProducts.length,
    activeCatalogProducts: catalogProducts.filter((p) => p.active === true)
      .length,
    appliedFilters: {
      categorySourceId: filters?.categorySourceId ?? null,
      categoryDescription: appliedCategoryDescription,
    },
    dataQuality,
  };

  return {
    meta,
    kpis,
    replenishment,
    capitalOptimization,
  };
}
