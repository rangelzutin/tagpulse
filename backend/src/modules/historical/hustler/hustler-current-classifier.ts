import { OperationUnit, SaleAnchorType } from "@prisma/client";

export const THIRD_PARTY_SKATE_SHOP_BRANDS = [
  "YOURFACE", "YOUR FACE", "OUS", "ÖUS", "DC -", "DC ", "HOCKS", "ECKO",
  "FATAL", "GRIZZLY", "RIPNDIP", "SPITFIRE", "RED BONES", "STARTER", "DGK",
  "PRIMITIVE", "JESSUP", "LYONS", "GENIUS", "REVENGE", "FLIP", "SANTA CRUZ",
  "NEW ERA", "DROP DEAD", "CISCO", "BLACK SHEEP", "KRAFT",
];

export interface ClassificationProductInput {
  id: string;
  sourceId: string;
  description: string | null;
  categoryDescription: string | null;
  brand: string | null;
}

export interface ClassificationSaleItemInput {
  productId: string | null;
  description?: string | null | undefined;
}

export interface ClassificationSaleInput {
  id: string;
  anchorType: SaleAnchorType;
  anchorSourceId: string;
  customerId: string | null;
  customerName?: string | null | undefined;
  hasCnpj?: boolean | undefined;
  hasPedido?: boolean | undefined;
  items: ClassificationSaleItemInput[];
}

export type ClassificationConfidence = "EXACT" | "STRONG" | "WEAK" | "UNRESOLVED";

export interface SaleClassificationOutput {
  candidateUnit: OperationUnit;
  confidence: ClassificationConfidence;
  reason: string;
}

export interface ProductCatalogClassification {
  hustlerExclusiveIds: Set<string>;
  ninecloudsExclusiveIds: Set<string>;
  sharedIds: Set<string>;
}

/**
 * Classifies product ownership deterministically into:
 * - Hustler Exclusive (created in 4G or explicit Hustler brand)
 * - Nineclouds Exclusive (pure TagPlus manufactured products)
 * - Shared (matched in 4D: skate goods sold at Hustler and present in TagPlus)
 */
export function classifyProductOwnership(
  products: ClassificationProductInput[],
  hustlerHistoricalEntityIds: Set<string>,
): ProductCatalogClassification {
  const hustlerExclusiveIds = new Set<string>();
  const ninecloudsExclusiveIds = new Set<string>();
  const sharedIds = new Set<string>();

  for (const p of products) {
    const isLegacyCreated = p.sourceId.startsWith("HUSTLER_LEGACY:");
    const isHistMatched = hustlerHistoricalEntityIds.has(p.id);
    const desc = (p.description || "").toUpperCase();
    const cat = (p.categoryDescription || "").toUpperCase();
    const brand = (p.brand || "").toUpperCase();

    const isExplicitHustler =
      desc.includes("HUSTLER") ||
      cat.includes("HUSTLER") ||
      brand.includes("HUSTLER");

    if (isLegacyCreated || (isExplicitHustler && !isHistMatched)) {
      hustlerExclusiveIds.add(p.id);
    } else if (isHistMatched) {
      sharedIds.add(p.id);
    } else {
      ninecloudsExclusiveIds.add(p.id);
    }
  }

  return {
    hustlerExclusiveIds,
    ninecloudsExclusiveIds,
    sharedIds,
  };
}

/**
 * Classifies a current TagPlus sale deterministically based on:
 * 1. Customer evidence (e.g. CONSUMIDOR HUSTLER -> EXACT)
 * 2. Channel / Document evidence (PEDIDO or CNPJ -> NINECLOUDS Wholesale)
 * 3. Item composition (Hustler skate shop multi-brand vs Nineclouds brand)
 */
export function classifyCurrentSale(
  sale: ClassificationSaleInput,
  catalog: ProductCatalogClassification,
): SaleClassificationOutput {
  const cName = (sale.customerName || "").toUpperCase();
  const isConsumidorHustler = cName.includes("CONSUMIDOR HUSTLER");

  let hustlerExclCount = 0;
  let ninecloudsExclCount = 0;
  let sharedCount = 0;
  let hasThirdParty = false;

  for (const it of sale.items) {
    const desc = (it.description || "").toUpperCase();
    if (THIRD_PARTY_SKATE_SHOP_BRANDS.some((b) => desc.includes(b))) {
      hasThirdParty = true;
    }

    if (!it.productId) continue;
    if (catalog.hustlerExclusiveIds.has(it.productId)) {
      hustlerExclCount++;
    } else if (catalog.ninecloudsExclusiveIds.has(it.productId)) {
      ninecloudsExclCount++;
    } else if (catalog.sharedIds.has(it.productId)) {
      sharedCount++;
    }
  }

  const totalItems = sale.items.length;
  const isWholesale = sale.hasPedido || sale.anchorType === SaleAnchorType.PEDIDO || sale.hasCnpj;

  // 1. Direct Consumidor Hustler retail counter sale
  if (isConsumidorHustler) {
    return {
      candidateUnit: OperationUnit.HUSTLER,
      confidence: "EXACT",
      reason: "Consumidor Hustler customer match",
    };
  }

  // 2. Wholesale B2B channel (PEDIDO or CNPJ customer)
  if (isWholesale) {
    if (hustlerExclCount > 0) {
      return {
        candidateUnit: OperationUnit.SHARED,
        confidence: "STRONG",
        reason: "Wholesale sale containing Hustler-exclusive items",
      };
    }
    return {
      candidateUnit: OperationUnit.NINECLOUDS,
      confidence: "STRONG",
      reason: "Wholesale B2B distribution of Nineclouds products",
    };
  }

  // 3. No items
  if (totalItems === 0) {
    return {
      candidateUnit: OperationUnit.UNRESOLVED,
      confidence: "UNRESOLVED",
      reason: "0 items in sale",
    };
  }

  // 4. Retail sale with 100% Hustler products
  if (hustlerExclCount > 0 && ninecloudsExclCount === 0) {
    return {
      candidateUnit: OperationUnit.HUSTLER,
      confidence: "STRONG",
      reason: "Retail sale with Hustler-exclusive products",
    };
  }

  // 5. Retail sale with multi-brand skate shop products (DC, YourFace, Öus, etc.)
  if (hasThirdParty && ninecloudsExclCount === 0) {
    return {
      candidateUnit: OperationUnit.HUSTLER,
      confidence: "STRONG",
      reason: "Retail sale with third-party skate shop brands (DC/YourFace/Öus/etc.)",
    };
  }

  // 6. 100% Nineclouds products in retail
  if (ninecloudsExclCount > 0 && hustlerExclCount === 0 && !hasThirdParty) {
    return {
      candidateUnit: OperationUnit.NINECLOUDS,
      confidence: "STRONG",
      reason: "Retail sale of pure Nineclouds brand products",
    };
  }

  // 7. Mixed retail basket
  if ((hustlerExclCount > 0 || hasThirdParty) && ninecloudsExclCount > 0) {
    return {
      candidateUnit: OperationUnit.SHARED,
      confidence: "STRONG",
      reason: "Mixed retail basket (Nineclouds items + Hustler/third-party items)",
    };
  }

  // 8. Shared skate accessories in retail
  if (sharedCount === totalItems) {
    if (sale.anchorType === SaleAnchorType.VENDA_SIMPLES) {
      return {
        candidateUnit: OperationUnit.HUSTLER,
        confidence: "WEAK",
        reason: "Retail Venda Simples of general skate hardware/accessories",
      };
    }
    return {
      candidateUnit: OperationUnit.SHARED,
      confidence: "WEAK",
      reason: "Direct NFE of general skate hardware/accessories",
    };
  }

  return {
    candidateUnit: OperationUnit.UNRESOLVED,
    confidence: "UNRESOLVED",
    reason: "Unresolved basket composition",
  };
}
