import type {
  AbcClass,
  CommercialChannel,
  ProductCategoryItem,
  ProductChannelMixItem,
  ProductCostCoverage,
  ProductMixItem,
  ProductReconciliation,
  ProductReconciliationAdjustment,
  ProductsOverviewResult,
  ProductsOverviewSummary,
  ProductStockOpportunities,
  ProductStockOpportunityItem,
  RealizedProductMovement,
  ShapeCommercialSize,
  ShapeSizeMixItem,
  TopProductItem,
} from "./bi-types.js";
import type { FlatCategoryInfo } from "./bi-profitability-calculator.js";

const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

export interface CatalogProductInfo {
  id?: string | null | undefined;
  sourceId?: string | undefined;
  code: string | null;
  description: string | null;
  categorySourceId?: string | null | undefined;
  categoryDescription: string | null;
  active?: boolean | null | undefined;
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
  categoriesFlat?: FlatCategoryInfo[];
  allActiveCatalogProductsWithStock?: CatalogProductInfo[];
}

/**
 * Limpa prefixos ordenadores legados do ERP TagPlus (ex: "1 - ", "2- ", "3 - ", "X - ").
 */
export function sanitizeCommercialLine(
  description: string | null | undefined,
): string {
  if (!description) return "SEM LINHA";
  const cleaned = description
    .trim()
    .replace(/^(?:[0-9]+|[A-Za-z])\s*[-–]\s*/, "")
    .trim();
  return cleaned || "SEM LINHA";
}

/**
 * Percorre recursivamente os ancestrais de uma categoria até a raiz e extrai a linha comercial.
 */
export function resolveCommercialLine(
  categorySourceId: string | null | undefined,
  categoryMap: Map<string, FlatCategoryInfo>,
): string {
  if (!categorySourceId || !categoryMap.has(categorySourceId)) {
    return "SEM LINHA";
  }

  let curr = categoryMap.get(categorySourceId)!;
  const visited = new Set<string>([curr.sourceId]);

  while (curr.parentSourceId && categoryMap.has(curr.parentSourceId)) {
    const parent = categoryMap.get(curr.parentSourceId)!;
    if (visited.has(parent.sourceId)) break; // Proteção contra ciclos
    visited.add(parent.sourceId);
    curr = parent;
  }

  return sanitizeCommercialLine(curr.description);
}

/**
 * Identifica deterministicamente se um produto pertence à categoria / universo de Shapes.
 */
export function isShapeProduct(
  description: string | null | undefined,
  categoryDescription: string | null | undefined,
): boolean {
  const text = `${description || ""} ${categoryDescription || ""}`;
  return /\bSHAPES?\b/i.test(text);
}

/**
 * Parser determinístico para tamanhos comerciais de Shape.
 * Mapeamentos homologados:
 * 7.75 / 7 3/4 -> "7.7"
 * 7.875 / 7 7/8 -> "7.8"
 * 8.0 / 8.00 -> "8.0"
 * 8.125 / 8 1/8 -> "8.1"
 * 8.25 / 8 1/4 -> "8.2"
 * 8.5 / 8.50 / 8 1/2 -> "8.5"
 * Outras medidas detectáveis -> "OTHER"
 * Shape sem medida detectável -> "UNCLASSIFIED"
 * Não-shape -> null
 */
export function parseShapeCommercialSize(
  description: string | null | undefined,
  categoryDescription: string | null | undefined,
): ShapeCommercialSize | null {
  if (!isShapeProduct(description, categoryDescription)) {
    return null;
  }

  const desc = description || "";

  // 1. Frações explícitas (ex: 7 3/4, 7 7/8, 8 1/8, 8 1/4, 8 1/2)
  const fractionMatch = desc.match(
    /(?:^|[\s"'])(\b[789])\s*([1357]\/[248])(?:[\s"']|$)/i,
  );
  if (fractionMatch && fractionMatch[1] && fractionMatch[2]) {
    const whole = Number(fractionMatch[1]);
    const fractionParts = fractionMatch[2].split("/");
    const num = Number(fractionParts[0]);
    const den = Number(fractionParts[1]);
    if (!Number.isNaN(whole) && !Number.isNaN(num) && !Number.isNaN(den) && den > 0) {
      const val = whole + num / den;

      if (Math.abs(val - 7.75) < 0.001) return "7.7";
      if (Math.abs(val - 7.875) < 0.001) return "7.8";
      if (Math.abs(val - 8.125) < 0.001) return "8.1";
      if (Math.abs(val - 8.25) < 0.001) return "8.2";
      if (Math.abs(val - 8.5) < 0.001) return "8.5";
      return "OTHER";
    }
  }

  // 2. Decimais explícitos (ex: 7.75, 7.875, 8.0, 8.00, 8.125, 8.25, 8.5, 8.50)
  const decimalMatch = desc.match(
    /(?:^|[\s"'])([789]\.[0-9]{1,3})(?:[\s"']|$)/i,
  );
  if (decimalMatch && decimalMatch[1]) {
    const num = Number(decimalMatch[1]);
    if (!Number.isNaN(num)) {
      if (Math.abs(num - 7.75) < 0.001) return "7.7";
      if (Math.abs(num - 7.875) < 0.001) return "7.8";
      if (Math.abs(num - 8.0) < 0.001) return "8.0";
      if (Math.abs(num - 8.125) < 0.001) return "8.1";
      if (Math.abs(num - 8.25) < 0.001) return "8.2";
      if (Math.abs(num - 8.5) < 0.001) return "8.5";
      return "OTHER";
    }
  }

  return "UNCLASSIFIED";
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
    categoriesFlat = [],
    allActiveCatalogProductsWithStock = [],
  } = params;

  // Mapa de categorias planas para resolução de linha comercial
  const flatCategoryMap = new Map<string, FlatCategoryInfo>();
  for (const c of categoriesFlat) {
    flatCategoryMap.set(c.sourceId, c);
  }

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

  // 2. Agregação por categoria direta
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

  // 4. Agregação por linha comercial
  const commercialLineMap = new Map<
    string,
    {
      commercialLine: string;
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
    const categoryName =
      catalogInfo?.categoryDescription?.trim() || "Sem categoria";

    // Resolução da linha comercial
    const lineName = resolveCommercialLine(
      catalogInfo?.categorySourceId,
      flatCategoryMap,
    );

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
    if (m.quantity > 0) {
      catEntry.distinctProducts.add(productKey);
    }

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
    if (m.quantity > 0) {
      chanEntry.distinctProducts.add(productKey);
    }

    // Agregação de linha comercial
    let lineEntry = commercialLineMap.get(lineName);
    if (!lineEntry) {
      lineEntry = {
        commercialLine: lineName,
        quantity: 0,
        realizedRevenue: 0,
        distinctProducts: new Set<string>(),
      };
      commercialLineMap.set(lineName, lineEntry);
    }
    lineEntry.quantity += m.quantity;
    lineEntry.realizedRevenue += m.allocatedNetRevenue;
    if (m.quantity > 0) {
      lineEntry.distinctProducts.add(productKey);
    }
  }

  const totalRealizedRevenue = round2(totalRealizedRevenueRaw);

  // Produtos vendidos fisicamente no período (soma de quantity > 0)
  const distinctProductsSold = Array.from(productMap.values()).filter(
    (p) => p.quantity > 0,
  ).length;

  // 5. Construção dos itens de Top Products com Rentabilidade e Classificações
  const rawTopProducts = Array.from(productMap.values()).map((p) => {
    const catalogInfo =
      (p.productId ? catalogProductMap.get(p.productId) : undefined) ??
      catalogProductMap.get(`source:${p.sourceProductId}`);

    const desc = catalogInfo?.description ?? `Item #${p.sourceProductId}`;
    const catDesc =
      catalogInfo?.categoryDescription?.trim() || "Sem categoria";
    const lineName = resolveCommercialLine(
      catalogInfo?.categorySourceId,
      flatCategoryMap,
    );

    const realizedRev = round2(p.realizedRevenue);
    const realizedQty = p.quantity;
    const effCost = catalogInfo?.effectiveCost ?? null;

    // Fórmulas canônicas de rentabilidade
    let cmvEstimated: number | null = null;
    let grossProfitEstimated: number | null = null;
    let grossMarginEstimated: number | null = null;

    if (effCost !== null) {
      cmvEstimated = round2(realizedQty * effCost);
      grossProfitEstimated = round2(realizedRev - cmvEstimated);
      if (realizedRev > 0) {
        grossMarginEstimated = round2(
          (grossProfitEstimated / realizedRev) * 100,
        );
      }
    }

    const shapeSize = parseShapeCommercialSize(desc, catDesc);

    const revenueShare =
      totalRealizedRevenue > 0
        ? round2((realizedRev / totalRealizedRevenue) * 100)
        : 0;

    return {
      productId: p.productId,
      sourceProductId: p.sourceProductId,
      code: catalogInfo?.code ?? null,
      description: desc,
      category: catDesc,
      commercialLine: lineName,
      quantity: realizedQty,
      realizedQuantity: realizedQty,
      grossItemAmount: round2(p.grossItemAmount),
      realizedRevenue: realizedRev,
      revenueShare,
      distinctSales: p.sales.size,
      distinctCustomers: p.customers.size,
      currentStockQuantity: catalogInfo?.stockQuantity ?? null,
      stockQuantity: catalogInfo?.stockQuantity ?? null,
      retailSalePrice: catalogInfo?.retailSalePrice ?? null,
      effectiveCost: effCost,
      cmvEstimatedCurrentCost: cmvEstimated,
      grossProfitEstimatedCurrentCost: grossProfitEstimated,
      grossMarginEstimatedCurrentCost: grossMarginEstimated,
      shapeCommercialSize: shapeSize,
      abcClass: null as AbcClass | null,
    };
  });

  // Ordenação primária decrescente de faturamento para Top Products
  rawTopProducts.sort((a, b) => b.realizedRevenue - a.realizedRevenue);

  // 6. Curva ABC (Base exclusivamente em Receita Realizada)
  if (totalRealizedRevenue > 0) {
    let prevCumulativeRevenue = 0;
    for (const item of rawTopProducts) {
      if (item.realizedRevenue <= 0) {
        item.abcClass = null;
        continue;
      }
      const prevShare = (prevCumulativeRevenue / totalRealizedRevenue) * 100;
      if (prevShare < 80) {
        item.abcClass = "A";
      } else if (prevShare < 95) {
        item.abcClass = "B";
      } else {
        item.abcClass = "C";
      }
      prevCumulativeRevenue += item.realizedRevenue;
    }
  }

  const topProducts: TopProductItem[] = rawTopProducts;

  // 7. Cobertura de Custo (considerando somente SKUs com movimentação realizada no período)
  let productsWithCost = 0;
  let productsWithoutCost = 0;
  let realizedRevenueWithCost = 0;
  let realizedRevenueWithoutCost = 0;
  let totalCmvKnown = 0;

  for (const item of topProducts) {
    const hasActivity = item.realizedQuantity !== 0 || item.realizedRevenue !== 0;
    if (!hasActivity) continue;

    if (item.effectiveCost !== null) {
      productsWithCost++;
      realizedRevenueWithCost += item.realizedRevenue;
      if (item.cmvEstimatedCurrentCost !== null) {
        totalCmvKnown += item.cmvEstimatedCurrentCost;
      }
    } else {
      productsWithoutCost++;
      realizedRevenueWithoutCost += item.realizedRevenue;
    }
  }

  realizedRevenueWithCost = round2(realizedRevenueWithCost);
  realizedRevenueWithoutCost = round2(realizedRevenueWithoutCost);

  const revenueCoveragePercent =
    totalRealizedRevenue > 0
      ? round2((realizedRevenueWithCost / totalRealizedRevenue) * 100)
      : null;

  const costCoverage: ProductCostCoverage = {
    productsWithCost,
    productsWithoutCost,
    realizedRevenueWithCost,
    realizedRevenueWithoutCost,
    revenueCoveragePercent,
  };

  // 8. Agregados de Rentabilidade no Summary
  let summaryCmv: number | null = null;
  let summaryGrossProfit: number | null = null;
  let summaryGrossMargin: number | null = null;

  if (productsWithoutCost === 0) {
    summaryCmv = round2(totalCmvKnown);
    summaryGrossProfit = round2(totalRealizedRevenue - summaryCmv);
    summaryGrossMargin =
      totalRealizedRevenue > 0
        ? round2((summaryGrossProfit / totalRealizedRevenue) * 100)
        : null;
  }

  // 9. Concentração Top 10 Revenue Share
  const top10RevenueSum = topProducts
    .slice(0, 10)
    .reduce((acc, p) => acc + p.realizedRevenue, 0);

  const top10RevenueShare =
    totalRealizedRevenue > 0
      ? round2((top10RevenueSum / totalRealizedRevenue) * 100)
      : 0;

  // Summary V2
  const summary: ProductsOverviewSummary = {
    realizedRevenue: totalRealizedRevenue,
    realizedQuantity: totalRealizedQuantity,
    distinctProductsSold,
    distinctCustomers: allDistinctCustomerIds.size,
    activeCatalogProducts: catalogSummary.activeCount,
    productsWithStock: catalogSummary.withStockCount,
    productsSoldInPeriod: distinctProductsSold,
    cmvEstimatedCurrentCost: summaryCmv,
    grossProfitEstimatedCurrentCost: summaryGrossProfit,
    grossMarginEstimatedCurrentCost: summaryGrossMargin,
    top10RevenueShare,
    costCoverage,
  };

  // 10. Mix por Categoria
  const categories: ProductCategoryItem[] = Array.from(categoryMap.values())
    .map((c) => {
      const rev = round2(c.realizedRevenue);
      const shareOfRev =
        totalRealizedRevenue > 0
          ? round2((rev / totalRealizedRevenue) * 100)
          : 0;
      const shareOfQty =
        totalRealizedQuantity > 0
          ? round2((c.quantity / totalRealizedQuantity) * 100)
          : 0;

      return {
        category: c.category,
        label: c.category,
        quantity: c.quantity,
        realizedQuantity: c.quantity,
        realizedRevenue: rev,
        distinctProducts: c.distinctProducts.size,
        shareOfRevenue: shareOfRev,
        revenueShare: shareOfRev,
        quantityShare: shareOfQty,
      };
    })
    .sort((a, b) => b.realizedRevenue - a.realizedRevenue);

  // 11. Mix por Linha Comercial
  const commercialLineMix: ProductMixItem[] = Array.from(
    commercialLineMap.values(),
  )
    .map((l) => {
      const rev = round2(l.realizedRevenue);
      const revShare =
        totalRealizedRevenue > 0
          ? round2((rev / totalRealizedRevenue) * 100)
          : 0;
      const qtyShare =
        totalRealizedQuantity > 0
          ? round2((l.quantity / totalRealizedQuantity) * 100)
          : 0;

      return {
        label: l.commercialLine,
        realizedRevenue: rev,
        realizedQuantity: l.quantity,
        revenueShare: revShare,
        quantityShare: qtyShare,
        distinctProducts: l.distinctProducts.size,
      };
    })
    .sort((a, b) => b.realizedRevenue - a.realizedRevenue);

  // 12. Mix por Tamanho de Shape (somente produtos Shape; denominador é o universo Shape)
  const shapeBuckets: ShapeCommercialSize[] = [
    "7.7",
    "7.8",
    "8.0",
    "8.1",
    "8.2",
    "8.5",
    "OTHER",
    "UNCLASSIFIED",
  ];

  const bucketLabelMap: Record<ShapeCommercialSize, string> = {
    "7.7": '7.7"',
    "7.8": '7.8"',
    "8.0": '8.0"',
    "8.1": '8.1"',
    "8.2": '8.2"',
    "8.5": '8.5"',
    OTHER: "Outros",
    UNCLASSIFIED: "Não classificado",
  };

  const shapeBucketData = new Map<
    ShapeCommercialSize,
    {
      revenue: number;
      quantity: number;
      distinctProducts: Set<string>;
    }
  >();

  for (const b of shapeBuckets) {
    shapeBucketData.set(b, {
      revenue: 0,
      quantity: 0,
      distinctProducts: new Set<string>(),
    });
  }

  let totalShapeRevenue = 0;
  let totalShapeQuantity = 0;

  for (const p of topProducts) {
    if (p.shapeCommercialSize !== null) {
      totalShapeRevenue += p.realizedRevenue;
      totalShapeQuantity += p.realizedQuantity;

      const bData = shapeBucketData.get(p.shapeCommercialSize);
      if (bData) {
        bData.revenue += p.realizedRevenue;
        bData.quantity += p.realizedQuantity;
        if (p.realizedQuantity > 0) {
          bData.distinctProducts.add(
            p.productId ?? `source:${p.sourceProductId}`,
          );
        }
      }
    }
  }

  totalShapeRevenue = round2(totalShapeRevenue);

  const shapeSizeMix: ShapeSizeMixItem[] = shapeBuckets.map((size) => {
    const data = shapeBucketData.get(size)!;
    const rev = round2(data.revenue);
    const revShare =
      totalShapeRevenue > 0 ? round2((rev / totalShapeRevenue) * 100) : 0;
    const qtyShare =
      totalShapeQuantity > 0
        ? round2((data.quantity / totalShapeQuantity) * 100)
        : 0;

    return {
      size,
      label: bucketLabelMap[size],
      realizedRevenue: rev,
      realizedQuantity: data.quantity,
      revenueShare: revShare,
      quantityShare: qtyShare,
      distinctProducts: data.distinctProducts.size,
    };
  });

  // 13. Channel Mix
  const channelMix: ProductChannelMixItem[] = Array.from(channelMap.values())
    .map((c) => {
      const rev = round2(c.realizedRevenue);
      const revShare =
        totalRealizedRevenue > 0
          ? round2((rev / totalRealizedRevenue) * 100)
          : 0;
      const qtyShare =
        totalRealizedQuantity > 0
          ? round2((c.quantity / totalRealizedQuantity) * 100)
          : 0;

      return {
        channel: c.channel,
        label: String(c.channel),
        quantity: c.quantity,
        realizedQuantity: c.quantity,
        realizedRevenue: rev,
        distinctProducts: c.distinctProducts.size,
        revenueShare: revShare,
        quantityShare: qtyShare,
      };
    })
    .sort((a, b) => b.realizedRevenue - a.realizedRevenue);

  // 14. Radar de Estoque e Oportunidades
  // A. Ruptura / Risco comercial: vendeu no período e estoque <= 0
  const zeroStockWithSales: ProductStockOpportunityItem[] = topProducts
    .filter((p) => p.realizedQuantity > 0 && (p.stockQuantity ?? 0) <= 0)
    .map((p) => {
      const catInfo =
        (p.productId ? catalogProductMap.get(p.productId) : undefined) ??
        catalogProductMap.get(`source:${p.sourceProductId}`);

      return {
        productId: p.productId,
        sourceProductId: p.sourceProductId,
        code: p.code,
        description: p.description,
        category: p.category,
        commercialLine: p.commercialLine,
        active: catInfo?.active ?? true,
        stockQuantity: p.stockQuantity ?? 0,
        realizedQuantity: p.realizedQuantity,
        realizedRevenue: p.realizedRevenue,
        effectiveCost: p.effectiveCost,
      };
    })
    .sort((a, b) => b.realizedRevenue - a.realizedRevenue);

  // B. Estoque parado: ativo, estoque > 0, sem venda no período
  const soldSourceProductIds = new Set<string>();
  const soldProductIds = new Set<string>();
  for (const p of topProducts) {
    if (p.realizedQuantity > 0) {
      soldSourceProductIds.add(p.sourceProductId);
      if (p.productId) soldProductIds.add(p.productId);
    }
  }

  const stockWithoutSales: ProductStockOpportunityItem[] =
    allActiveCatalogProductsWithStock
      .filter((p) => {
        if (!p.active) return false;
        const stock = p.stockQuantity ?? 0;
        if (stock <= 0) return false;

        const isSold =
          (p.sourceId && soldSourceProductIds.has(p.sourceId)) ||
          (p.id && soldProductIds.has(p.id));

        return !isSold;
      })
      .map((p) => {
        const lineName = resolveCommercialLine(
          p.categorySourceId,
          flatCategoryMap,
        );
        return {
          productId: p.id ?? null,
          sourceProductId: p.sourceId ?? "",
          code: p.code,
          description: p.description,
          category: p.categoryDescription?.trim() || "Sem categoria",
          commercialLine: lineName,
          active: true,
          stockQuantity: p.stockQuantity ?? 0,
          realizedQuantity: 0,
          realizedRevenue: 0,
          effectiveCost: p.effectiveCost,
        };
      })
      .sort((a, b) => b.stockQuantity - a.stockQuantity);

  const stockOpportunities: ProductStockOpportunities = {
    zeroStockWithSales,
    stockWithoutSales,
  };

  // 15. Reconciliation
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
    categoryMix: categories,
    commercialLineMix,
    shapeSizeMix,
    channelMix,
    stockOpportunities,
    reconciliation,
  };
}
