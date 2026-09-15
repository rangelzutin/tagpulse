import type {
  CoverageBucket,
  InventoryCategoryItem,
  InventoryCoverageDistribution,
  InventoryDataQuality,
  InventoryOperationalFlag,
  InventoryOverviewResult,
  InventoryOverviewSummary,
  InventoryProductItem,
  InventoryWindowDays,
  RealizedProductMovement,
} from "./bi-types.js";

const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

export interface CatalogInventoryProduct {
  id: string;
  sourceId: string;
  code: string | null;
  description: string | null;
  categoryDescription: string | null;
  active: boolean | null;
  sourcePresent: boolean;
  stockQuantity: number | null;
  effectiveCost: number | null;
  averageCost: number | null;
  retailSalePrice: number | null;
  stockMinQuantity: number | null;
  stockMaxQuantity: number | null;
}

export interface CalculateInventoryOverviewParams {
  asOfDate: string; // YYYY-MM-DD
  windowDays: InventoryWindowDays;
  catalogProducts: CatalogInventoryProduct[];
  movementsInWindow: RealizedProductMovement[];
  historicalLastPhysicalSales?: Map<string, Date>;
}

/**
 * Calcula a data inicial (fromDate) e a data final exclusiva (toExclusiveDate)
 * para a janela analítica correspondente a dias-calendário incluindo o asOfDate.
 *
 * Exemplo para asOfDate = "2026-09-14":
 * - windowDays = 30:  16/08/2026 a 14/09/2026 (30 dias calendário)
 * - windowDays = 90:  17/06/2026 a 14/09/2026 (90 dias calendário)
 * - windowDays = 180: 19/03/2026 a 14/09/2026 (180 dias calendário)
 */
export function calculateWindowDateRange(
  asOfDateStr: string,
  windowDays: InventoryWindowDays,
): { fromDate: Date; toExclusiveDate: Date; fromStr: string; toStr: string } {
  const parts = asOfDateStr.split("-").map(Number);
  const y = parts[0] ?? 2026;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;

  // Início do dia seguinte em UTC para cobrir todo o asOfDate
  const toExclusiveDate = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0));
  // fromDate = asOfDate - (windowDays - 1) dias
  const fromDate = new Date(Date.UTC(y, m - 1, d - (windowDays - 1), 0, 0, 0, 0));

  const fromStr = fromDate.toISOString().slice(0, 10);
  const toStr = asOfDateStr;

  return { fromDate, toExclusiveDate, fromStr, toStr };
}

/**
 * Motor central determinístico de cálculo de Estoque & Giro V1.
 */
export function calculateInventoryOverview(
  params: CalculateInventoryOverviewParams,
): InventoryOverviewResult {
  const {
    asOfDate,
    windowDays,
    catalogProducts,
    movementsInWindow,
    historicalLastPhysicalSales = new Map<string, Date>(),
  } = params;

  // Data de referência em UTC para cálculo de dias desde a última saída
  const [y, m, d] = asOfDate.split("-").map(Number);
  const refDateUtcMs = Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999);

  // Mapear movimentações da janela por sourceProductId e productId
  const movementsBySourceProd = new Map<string, RealizedProductMovement[]>();
  const movementsByProdId = new Map<string, RealizedProductMovement[]>();

  for (const mov of movementsInWindow) {
    if (!movementsBySourceProd.has(mov.sourceProductId)) {
      movementsBySourceProd.set(mov.sourceProductId, []);
    }
    movementsBySourceProd.get(mov.sourceProductId)!.push(mov);

    if (mov.productId) {
      if (!movementsByProdId.has(mov.productId)) {
        movementsByProdId.set(mov.productId, []);
      }
      movementsByProdId.get(mov.productId)!.push(mov);
    }
  }

  const products: InventoryProductItem[] = [];

  // Contadores para o summary
  let activeProducts = 0;
  let productsWithPositiveStock = 0;
  let productsWithZeroStock = 0;
  let productsWithNegativeStock = 0;
  let inventoryCostValue = 0;
  let inventoryListValue = 0;
  let demandWithoutStockCount = 0;
  let activeDemandWithoutStockCount = 0;
  let productsWithStockAndSales = 0;
  let productsWithStockNoSales = 0;
  let capitalWithSales = 0;
  let capitalWithoutSales = 0;
  let inactiveProductsWithStock = 0;
  let inactiveStockCostValue = 0;

  // Contadores de distribuição de cobertura
  let lt15 = 0;
  let from15to30 = 0;
  let from30to45 = 0;
  let from45to90 = 0;
  let gt90 = 0;

  // Contadores de qualidade de dados
  let effectiveCostMissingOrZero = 0;
  let retailSalePriceMissingOrZero = 0;
  let averageCostMissingOrZero = 0;
  let stockMinNotConfiguredCount = 0;
  let stockMaxNotConfiguredCount = 0;

  // Agregação por categoria
  interface CategoryAccumulator {
    category: string;
    products: number;
    productsWithStock: number;
    stockUnits: number;
    positiveStockUnits: number;
    inventoryCostValue: number;
    inventoryListValue: number;
    quantityInWindow: number;
    realizedRevenueInWindow: number;
    productsWithSales: number;
    productsWithoutSales: number;
    capitalWithoutSales: number;
    demandWithoutStockCount: number;
    lowCoverageCount: number;
  }

  const categoryMap = new Map<string, CategoryAccumulator>();

  for (const prod of catalogProducts) {
    const active = prod.active ?? false;
    if (active) {
      activeProducts++;
    }

    const stock = prod.stockQuantity !== null ? Number(prod.stockQuantity) : 0;
    const effectiveCost =
      prod.effectiveCost !== null ? Number(prod.effectiveCost) : 0;
    const averageCost = prod.averageCost !== null ? Number(prod.averageCost) : 0;
    const retailPrice =
      prod.retailSalePrice !== null ? Number(prod.retailSalePrice) : 0;
    const stockMin =
      prod.stockMinQuantity !== null ? Number(prod.stockMinQuantity) : 0;
    const stockMax =
      prod.stockMaxQuantity !== null ? Number(prod.stockMaxQuantity) : 0;

    // Auditoria de qualidade
    if (effectiveCost <= 0) effectiveCostMissingOrZero++;
    if (retailPrice <= 0) retailSalePriceMissingOrZero++;
    if (averageCost <= 0) averageCostMissingOrZero++;
    if (stockMin <= 0) stockMinNotConfiguredCount++;
    if (stockMax <= 0) stockMaxNotConfiguredCount++;

    const isPositiveStock = stock > 0;
    const isZeroStock = stock === 0;
    const isNegativeStock = stock < 0;

    if (isPositiveStock) productsWithPositiveStock++;
    else if (isZeroStock) productsWithZeroStock++;
    else productsWithNegativeStock++;

    const stockCostValue = round2(Math.max(stock, 0) * effectiveCost);
    const stockListValue = round2(Math.max(stock, 0) * retailPrice);

    inventoryCostValue += stockCostValue;
    inventoryListValue += stockListValue;

    if (!active && isPositiveStock) {
      inactiveProductsWithStock++;
      inactiveStockCostValue += stockCostValue;
    }

    // Unir movimentações deste produto sem duplicidade de objeto
    const movsBySrc = movementsBySourceProd.get(prod.sourceId) || [];
    const movsById = movementsByProdId.get(prod.id) || [];
    const uniqueMovs = Array.from(new Set([...movsBySrc, ...movsById]));

    let quantityInWindow = 0;
    let realizedRevenueInWindow = 0;
    let latestPhysicalSaleInWindow: Date | null = null;
    const distinctCustomersSet = new Set<string>();

    for (const m of uniqueMovs) {
      // Receita líquida realizada pode incluir complemento puramente financeiro
      realizedRevenueInWindow += m.allocatedNetRevenue;

      // Saída física estrita (apenas quantity > 0)
      if (m.quantity > 0) {
        quantityInWindow += m.quantity;
        if (m.customerId) {
          distinctCustomersSet.add(m.customerId);
        }
        if (
          !latestPhysicalSaleInWindow ||
          m.realizedDate > latestPhysicalSaleInWindow
        ) {
          latestPhysicalSaleInWindow = m.realizedDate;
        }
      }
    }

    realizedRevenueInWindow = round2(realizedRevenueInWindow);
    const hasPhysicalSalesInWindow = quantityInWindow > 0;

    // Determinar última saída física considerando o histórico total disponível
    let lastPhysicalSaleDateObj: Date | null = latestPhysicalSaleInWindow;
    if (!lastPhysicalSaleDateObj) {
      const historicalDate =
        historicalLastPhysicalSales.get(prod.sourceId) ??
        historicalLastPhysicalSales.get(prod.id);
      if (historicalDate) {
        lastPhysicalSaleDateObj = historicalDate;
      }
    }

    const lastPhysicalSaleDate = lastPhysicalSaleDateObj
      ? lastPhysicalSaleDateObj.toISOString().slice(0, 10)
      : null;

    let daysSinceLastPhysicalSale: number | null = null;
    if (lastPhysicalSaleDateObj) {
      const saleUtcMs = Date.UTC(
        lastPhysicalSaleDateObj.getUTCFullYear(),
        lastPhysicalSaleDateObj.getUTCMonth(),
        lastPhysicalSaleDateObj.getUTCDate(),
        0,
        0,
        0,
        0,
      );
      daysSinceLastPhysicalSale = Math.max(
        0,
        Math.floor((refDateUtcMs - saleUtcMs) / 86400000),
      );
    }

    const exactAds = quantityInWindow / windowDays;
    const averageDailySales = round2(exactAds);

    // Cobertura estimada: estritamente quando stock > 0 E averageDailySales > 0
    let estimatedDaysOfStock: number | null = null;
    let coverageBucket: CoverageBucket | null = null;

    if (isPositiveStock && exactAds > 0) {
      estimatedDaysOfStock = round2(stock / exactAds);

      if (estimatedDaysOfStock < 15) {
        coverageBucket = "LT_15";
        lt15++;
      } else if (estimatedDaysOfStock < 30) {
        coverageBucket = "15_TO_30";
        from15to30++;
      } else if (estimatedDaysOfStock < 45) {
        coverageBucket = "30_TO_45";
        from30to45++;
      } else if (estimatedDaysOfStock <= 90) {
        coverageBucket = "45_TO_90";
        from45to90++;
      } else {
        coverageBucket = "GT_90";
        gt90++;
      }
    }

    // Flags operacionais
    const operationalFlags: InventoryOperationalFlag[] = [];

    if (isNegativeStock) {
      operationalFlags.push("NEGATIVE_STOCK");
    }

    if (stock <= 0 && hasPhysicalSalesInWindow) {
      operationalFlags.push("DEMAND_WITHOUT_STOCK");
      demandWithoutStockCount++;
      if (active && prod.sourcePresent) {
        activeDemandWithoutStockCount++;
      }
    }

    if (isPositiveStock) {
      if (hasPhysicalSalesInWindow) {
        operationalFlags.push("STOCK_WITH_SALES");
        productsWithStockAndSales++;
        capitalWithSales += stockCostValue;

        if (
          active &&
          estimatedDaysOfStock !== null &&
          estimatedDaysOfStock < 30
        ) {
          operationalFlags.push("LOW_ESTIMATED_COVERAGE");
        }
        if (estimatedDaysOfStock !== null && estimatedDaysOfStock > 90) {
          operationalFlags.push("LONG_ESTIMATED_COVERAGE");
        }
      } else {
        operationalFlags.push("NO_SALES_IN_WINDOW");
        productsWithStockNoSales++;
        capitalWithoutSales += stockCostValue;
      }
    }

    if (!active && isPositiveStock) {
      operationalFlags.push("INACTIVE_WITH_STOCK");
    }

    const categoryName = prod.categoryDescription?.trim() || "Sem categoria";

    // Acumulador de categoria
    let catAcc = categoryMap.get(categoryName);
    if (!catAcc) {
      catAcc = {
        category: categoryName,
        products: 0,
        productsWithStock: 0,
        stockUnits: 0,
        positiveStockUnits: 0,
        inventoryCostValue: 0,
        inventoryListValue: 0,
        quantityInWindow: 0,
        realizedRevenueInWindow: 0,
        productsWithSales: 0,
        productsWithoutSales: 0,
        capitalWithoutSales: 0,
        demandWithoutStockCount: 0,
        lowCoverageCount: 0,
      };
      categoryMap.set(categoryName, catAcc);
    }

    catAcc.products++;
    if (isPositiveStock) {
      catAcc.productsWithStock++;
      catAcc.positiveStockUnits += stock;
    }
    catAcc.stockUnits += stock;
    catAcc.inventoryCostValue += stockCostValue;
    catAcc.inventoryListValue += stockListValue;
    catAcc.quantityInWindow += quantityInWindow;
    catAcc.realizedRevenueInWindow += realizedRevenueInWindow;

    if (hasPhysicalSalesInWindow) {
      catAcc.productsWithSales++;
    }
    if (isPositiveStock && !hasPhysicalSalesInWindow) {
      catAcc.productsWithoutSales++;
      catAcc.capitalWithoutSales += stockCostValue;
    }
    if (stock <= 0 && hasPhysicalSalesInWindow) {
      catAcc.demandWithoutStockCount++;
    }
    if (
      isPositiveStock &&
      hasPhysicalSalesInWindow &&
      estimatedDaysOfStock !== null &&
      estimatedDaysOfStock < 30
    ) {
      catAcc.lowCoverageCount++;
    }

    products.push({
      productId: prod.id,
      sourceProductId: prod.sourceId,
      code: prod.code || "S/C",
      description: prod.description || "Sem descrição",
      category: categoryName,
      active,
      currentStock: stock,
      effectiveCost,
      retailSalePrice: retailPrice,
      stockCostValue,
      stockListValue,
      quantityInWindow,
      realizedRevenueInWindow,
      averageDailySales,
      lastPhysicalSaleDate,
      daysSinceLastPhysicalSale,
      estimatedDaysOfStock,
      coverageBucket,
      distinctCustomersInWindow: distinctCustomersSet.size,
      operationalFlags,
    });
  }

  // Fechamento e arredondamentos finais de summary
  inventoryCostValue = round2(inventoryCostValue);
  inventoryListValue = round2(inventoryListValue);
  capitalWithSales = round2(capitalWithSales);
  capitalWithoutSales = round2(capitalWithoutSales);
  inactiveStockCostValue = round2(inactiveStockCostValue);

  const capitalWithoutSalesShare =
    inventoryCostValue > 0
      ? round2((capitalWithoutSales / inventoryCostValue) * 100)
      : 0;

  const distinctSoldProductsCount = products.filter(
    (p) => p.quantityInWindow > 0,
  ).length;

  const totalWithStockAndSales =
    lt15 + from15to30 + from30to45 + from45to90 + gt90;

  const summary: InventoryOverviewSummary = {
    totalProducts: catalogProducts.length,
    activeProducts,
    productsWithPositiveStock,
    productsWithZeroStock,
    productsWithNegativeStock,
    inventoryCostValue,
    inventoryListValue,
    productsSoldInWindow: distinctSoldProductsCount,
    demandWithoutStockCount,
    activeDemandWithoutStockCount,
    productsWithStockAndSales,
    productsWithStockNoSales,
    capitalWithSales,
    capitalWithoutSales,
    capitalWithoutSalesShare,
    inactiveProductsWithStock,
    inactiveStockCostValue,
  };

  const coverageDistribution: InventoryCoverageDistribution = {
    lt15,
    from15to30,
    from30to45,
    from45to90,
    gt90,
    totalWithStockAndSales,
    noSalesInWindow: productsWithStockNoSales,
  };

  // Formatar lista de categorias
  const categories: InventoryCategoryItem[] = Array.from(categoryMap.values())
    .map((cat) => {
      const catCost = round2(cat.inventoryCostValue);
      const capNoSale = round2(cat.capitalWithoutSales);
      const capShare =
        catCost > 0 ? round2((capNoSale / catCost) * 100) : 0;

      let aggregatedEstimatedDaysOfStock: number | null = null;
      if (cat.quantityInWindow > 0) {
        const catDailySales = cat.quantityInWindow / windowDays;
        aggregatedEstimatedDaysOfStock = round2(
          cat.positiveStockUnits / catDailySales,
        );
      }

      return {
        category: cat.category,
        products: cat.products,
        productsWithStock: cat.productsWithStock,
        stockUnits: round2(cat.stockUnits),
        inventoryCostValue: catCost,
        inventoryListValue: round2(cat.inventoryListValue),
        quantityInWindow: round2(cat.quantityInWindow),
        realizedRevenueInWindow: round2(cat.realizedRevenueInWindow),
        productsWithSales: cat.productsWithSales,
        productsWithoutSales: cat.productsWithoutSales,
        capitalWithoutSales: capNoSale,
        capitalWithoutSalesShare: capShare,
        demandWithoutStockCount: cat.demandWithoutStockCount,
        lowCoverageCount: cat.lowCoverageCount,
        aggregatedEstimatedDaysOfStock,
      };
    })
    .sort((a, b) => b.inventoryCostValue - a.inventoryCostValue);

  const dataQuality: InventoryDataQuality = {
    negativeStockCount: productsWithNegativeStock,
    activeWithoutStockCount: products.filter(
      (p) => p.active && p.currentStock <= 0,
    ).length,
    inactiveWithStockCount: inactiveProductsWithStock,
    effectiveCostMissingOrZero,
    retailSalePriceMissingOrZero,
    averageCostMissingOrZero,
    stockMinNotConfiguredCount,
    stockMaxNotConfiguredCount,
  };

  return {
    asOfDate,
    windowDays,
    summary,
    coverageDistribution,
    products,
    categories,
    dataQuality,
  };
}
