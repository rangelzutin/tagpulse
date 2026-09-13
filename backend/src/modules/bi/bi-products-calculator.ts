import type {
  CommercialChannel,
  ProductCategoryItem,
  ProductChannelMixItem,
  ProductReconciliation,
  ProductReconciliationAdjustment,
  ProductsOverviewResult,
  ProductsOverviewSummary,
  RealizedProductMovement,
  TopProductItem,
} from "./bi-types.js";

const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

export interface CatalogProductInfo {
  code: string | null;
  description: string | null;
  categoryDescription: string | null;
  stockQuantity: number | null;
  retailSalePrice: number | null;
  effectiveCost: number | null;
}

export interface CalculateProductsOverviewParams {
  movements: RealizedProductMovement[];
  catalogProductMap: Map<string, CatalogProductInfo>;
  catalogSummary: {
    activeCount: number;
    withStockCount: number;
  };
  commercialRevenue: number;
  adjustments: ProductReconciliationAdjustment[];
  period: {
    from: string;
    to: string;
  };
}

export function calculateProductsOverview(
  params: CalculateProductsOverviewParams,
): ProductsOverviewResult {
  const {
    movements,
    catalogProductMap,
    catalogSummary,
    commercialRevenue,
    adjustments,
    period,
  } = params;

  // 1. Agregação por produto
  const productMap = new Map<
    string,
    {
      productId: string | null;
      sourceProductId: string;
      quantity: number;
      grossItemAmount: number;
      realizedRevenue: number;
      sales: Set<string>;
      customers: Set<string>;
    }
  >();

  // 2. Agregação por categoria
  const categoryMap = new Map<
    string,
    {
      category: string;
      quantity: number;
      realizedRevenue: number;
      distinctProducts: Set<string>;
    }
  >();

  // 3. Agregação por canal
  const channelMap = new Map<
    CommercialChannel,
    {
      channel: CommercialChannel;
      quantity: number;
      realizedRevenue: number;
      distinctProducts: Set<string>;
    }
  >();

  const allDistinctProductKeys = new Set<string>();
  const allDistinctCustomerIds = new Set<string>();
  let totalRealizedQuantity = 0;
  let totalRealizedRevenueRaw = 0;

  for (const m of movements) {
    const productKey = m.productId ?? `source:${m.sourceProductId}`;
    allDistinctProductKeys.add(productKey);
    if (m.customerId) {
      allDistinctCustomerIds.add(m.customerId);
    }

    totalRealizedQuantity += m.quantity;
    totalRealizedRevenueRaw += m.allocatedNetRevenue;

    // Agregação de produto
    let prodEntry = productMap.get(productKey);
    if (!prodEntry) {
      prodEntry = {
        productId: m.productId,
        sourceProductId: m.sourceProductId,
        quantity: 0,
        grossItemAmount: 0,
        realizedRevenue: 0,
        sales: new Set<string>(),
        customers: new Set<string>(),
      };
      productMap.set(productKey, prodEntry);
    }
    prodEntry.quantity += m.quantity;
    prodEntry.grossItemAmount += m.grossItemAmount;
    prodEntry.realizedRevenue += m.allocatedNetRevenue;
    prodEntry.sales.add(m.saleId);
    if (m.customerId) {
      prodEntry.customers.add(m.customerId);
    }

    // Identificação de metadados do catálogo
    const catalogInfo =
      (m.productId ? catalogProductMap.get(m.productId) : undefined) ??
      catalogProductMap.get(`source:${m.sourceProductId}`);
    const categoryName = catalogInfo?.categoryDescription?.trim() || "Sem categoria";

    // Agregação de categoria
    let catEntry = categoryMap.get(categoryName);
    if (!catEntry) {
      catEntry = {
        category: categoryName,
        quantity: 0,
        realizedRevenue: 0,
        distinctProducts: new Set<string>(),
      };
      categoryMap.set(categoryName, catEntry);
    }
    catEntry.quantity += m.quantity;
    catEntry.realizedRevenue += m.allocatedNetRevenue;
    catEntry.distinctProducts.add(productKey);

    // Agregação de canal
    let chanEntry = channelMap.get(m.channel);
    if (!chanEntry) {
      chanEntry = {
        channel: m.channel,
        quantity: 0,
        realizedRevenue: 0,
        distinctProducts: new Set<string>(),
      };
      channelMap.set(m.channel, chanEntry);
    }
    chanEntry.quantity += m.quantity;
    chanEntry.realizedRevenue += m.allocatedNetRevenue;
    chanEntry.distinctProducts.add(productKey);
  }

  const totalRealizedRevenue = round2(totalRealizedRevenueRaw);

  // Summary
  const summary: ProductsOverviewSummary = {
    realizedRevenue: totalRealizedRevenue,
    realizedQuantity: totalRealizedQuantity,
    distinctProductsSold: allDistinctProductKeys.size,
    distinctCustomers: allDistinctCustomerIds.size,
    activeCatalogProducts: catalogSummary.activeCount,
    productsWithStock: catalogSummary.withStockCount,
    productsSoldInPeriod: allDistinctProductKeys.size,
  };

  // Top Products
  const topProducts: TopProductItem[] = Array.from(productMap.values())
    .map((p) => {
      const catalogInfo =
        (p.productId ? catalogProductMap.get(p.productId) : undefined) ??
        catalogProductMap.get(`source:${p.sourceProductId}`);

      return {
        productId: p.productId,
        code: catalogInfo?.code ?? null,
        description:
          catalogInfo?.description ?? `Item #${p.sourceProductId}`,
        category: catalogInfo?.categoryDescription?.trim() || "Sem categoria",
        quantity: p.quantity,
        grossItemAmount: round2(p.grossItemAmount),
        realizedRevenue: round2(p.realizedRevenue),
        distinctSales: p.sales.size,
        distinctCustomers: p.customers.size,
        currentStockQuantity: catalogInfo?.stockQuantity ?? null,
        retailSalePrice: catalogInfo?.retailSalePrice ?? null,
        effectiveCost: catalogInfo?.effectiveCost ?? null,
      };
    })
    .sort((a, b) => b.realizedRevenue - a.realizedRevenue);

  // Categories
  const categories: ProductCategoryItem[] = Array.from(categoryMap.values())
    .map((c) => ({
      category: c.category,
      quantity: c.quantity,
      realizedRevenue: round2(c.realizedRevenue),
      distinctProducts: c.distinctProducts.size,
      shareOfRevenue:
        totalRealizedRevenue > 0
          ? round2((c.realizedRevenue / totalRealizedRevenue) * 100)
          : 0,
    }))
    .sort((a, b) => b.realizedRevenue - a.realizedRevenue);

  // Channel Mix
  const channelMix: ProductChannelMixItem[] = Array.from(channelMap.values())
    .map((c) => ({
      channel: c.channel,
      quantity: c.quantity,
      realizedRevenue: round2(c.realizedRevenue),
      distinctProducts: c.distinctProducts.size,
    }))
    .sort((a, b) => b.realizedRevenue - a.realizedRevenue);

  // Reconciliation
  const adjustmentAmount = round2(
    adjustments.reduce((acc, a) => acc + a.amount, 0),
  );

  const reconciliation: ProductReconciliation = {
    commercialRevenue: round2(commercialRevenue),
    productsRevenue: totalRealizedRevenue,
    adjustmentAmount,
    adjustments,
  };

  return {
    period,
    summary,
    topProducts,
    categories,
    channelMix,
    reconciliation,
  };
}
