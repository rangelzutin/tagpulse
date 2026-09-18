import type { Prisma, SaleAnchorType } from "@prisma/client";

export interface SalesOverviewPeriod {
  from: string;
  to: string;
}

export interface SalesOverviewSummary {
  sales: number;
  revenue: number;
  avgTicket: number;
  customers: number;
  salesWithoutCustomer: number;
}

export interface SalesOverviewMonthly {
  month: string;
  sales: number;
  revenue: number;
  avgTicket: number;
  customers: number;
}

export type SalesTrendGranularity = "daily" | "weekly" | "monthly";

export interface SalesTrendPoint {
  key: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  revenue: number;
  sales: number;
  averageTicket: number;
  customers: number;
}

export interface SalesTrend {
  granularity: SalesTrendGranularity;
  points: SalesTrendPoint[];
}

export interface SalesOverviewResult {
  period: SalesOverviewPeriod;
  summary: SalesOverviewSummary;
  monthly: SalesOverviewMonthly[];
  trend: SalesTrend;
}

export interface BiDataRangeResult {
  firstRealizedDate: string | null;
  lastRealizedDate: string | null;
}

export interface BiSaleRecord {
  id: string;
  netAmount: Prisma.Decimal;
  customerId: string | null;
  commercialDate: Date;
}

export interface CustomerOverviewPeriod {
  from: string;
  to: string;
  asOfDate: string;
}

export interface CustomerOverviewMetrics {
  buyingCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  recurrenceRate: number;
}

export interface CustomerLifetimeMetrics {
  customers: number;
  singlePurchaseCustomers: number;
  repeatCustomers: number;
  repeatRate: number;
}

export interface CustomerRankingItem {
  customerId: string;
  code: string | null;
  displayName: string;
  revenue: number;
  purchaseCount: number;
  averageTicket: number;
  revenueSharePercent: number;
  cumulativeRevenueSharePercent: number;
}

export interface CustomerRecencySegment {
  key:
    | "0-30"
    | "31-60"
    | "61-90"
    | "91-180"
    | "181-365"
    | "366-730"
    | "731-1095"
    | "1096+";
  label: string;
  customerCount: number;
  percentage: number;
}

export type ConcreteCustomerDocumentType = "cnpj" | "cpf" | "no_document";
export type CustomerDocumentType = "all" | ConcreteCustomerDocumentType;

export interface CustomerOverviewResult {
  period: CustomerOverviewPeriod;
  customers: CustomerOverviewMetrics;
  lifetime: CustomerLifetimeMetrics;
  ranking: CustomerRankingItem[];
  recency: CustomerRecencySegment[];
  documentType?: CustomerDocumentType;
}

export interface BiPeriodCustomerDoc {
  id: string;
  saleId: string;
  customerId: string;
  netAmount: Prisma.Decimal;
  realizedDate: Date;
  customer: {
    id: string;
    sourceId: string;
    code: string | null;
    legalName: string | null;
    tradeName: string | null;
  };
}

export interface BiSaleRealizationRecord {
  saleId: string;
  customerId: string;
  realizedDate: Date;
  netAmount?: Prisma.Decimal | undefined;
}

export type CustomerRecencyBucket =
  | "0-30"
  | "31-60"
  | "61-90"
  | "91-180"
  | "181-365"
  | "366-730"
  | "731-1095"
  | "1096+";

export type CustomerSegmentType =
  | "buyers"
  | "new"
  | "returning"
  | "historical"
  | "single"
  | "repeat"
  | "risk"
  | "inactive"
  | "recency";

export type CustomerSegmentSort =
  | "revenue_desc"
  | "purchases_desc"
  | "last_purchase_desc"
  | "name_asc";

export interface CustomerSegmentItem {
  customerId: string;
  code: string | null;
  legalName: string | null;
  tradeName: string | null;
  displayName: string;
  cpfCnpj: string | null;
  purchasesInPeriod: number;
  revenueInPeriod: number;
  averageTicketInPeriod: number;
  firstPurchaseDate: string | null;
  lastPurchaseDate: string | null;
  lifetimePurchaseCount: number;
  lifetimeRevenue: number;
  daysSinceLastPurchase: number | null;
}

export interface CustomerSegmentResult {
  segment: CustomerSegmentType;
  recencyBucket?: CustomerRecencyBucket | null;
  documentType?: CustomerDocumentType;
  period: {
    from: string;
    to: string;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalRecords: number;
    totalPages: number;
  };
  summary: {
    segmentCustomerCount: number;
    segmentTotalRevenueInPeriod: number;
  };
  customers: CustomerSegmentItem[];
}

export interface CustomerDetailOverviewResult {
  identity: {
    customerId: string;
    sourceId: string;
    code: string | null;
    legalName: string | null;
    tradeName: string | null;
    displayName: string;
    cpfCnpj: string | null;
    city: string | null;
    state: string | null;
  };
  classification: {
    isNewInPeriod: boolean;
    isReturningInPeriod: boolean;
    hasPeriodActivity: boolean;
  };
  period: {
    from: string;
    to: string;
    revenue: number;
    purchaseCount: number;
    averageTicket: number;
    revenueSharePercent: number;
  };
  lifetime: {
    asOfDate: string;
    firstPurchaseDate: string | null;
    lastPurchaseDate: string | null;
    purchaseCount: number;
    revenue: number;
    averageTicket: number;
    daysSinceLastPurchase: number | null;
  };
}

export type CustomerSalesScope = "period" | "history";

export interface CustomerSaleDocument {
  id: string;
  docType: string;
  sourceId: string;
  status: string | null;
  netAmount: number | null;
  realizedDate: string | null;
  sourceConfirmedAt: string | null;
  sourceEmissaoAt: string | null;
  isRealizedDoc: boolean;
}

export interface CustomerSaleItem {
  saleId: string;
  anchorType: string;
  anchorSourceId: string;
  hasPedido: boolean;
  pedidoSourceId: string | null;
  commercialDate: string | null;
  saleRealizedDate: string;
  totalRealizedAmount: number;
  realizedDocCount: number;
  documents: CustomerSaleDocument[];
}

export interface CustomerSalesResult {
  customerId: string;
  pagination: {
    page: number;
    pageSize: number;
    totalRecords: number;
    totalPages: number;
  };
  sales: CustomerSaleItem[];
}

export interface BiCustomerMetadata {
  id: string;
  sourceId: string;
  code: string | null;
  legalName: string | null;
  tradeName: string | null;
  cpf: string | null;
  cnpj: string | null;
  city: string | null;
  state: string | null;
}

export interface BiCustomerSaleRawDoc {
  id: string;
  docType: string;
  sourceId: string;
  status: string | null;
  netAmount: Prisma.Decimal | null;
  realizedDate: Date | null;
  sourceConfirmedAt: Date | null;
  sourceEmissaoAt: Date | null;
  sourcePresent: boolean;
}

export interface BiCustomerSaleRawRecord {
  id: string;
  anchorType: string;
  anchorSourceId: string;
  commercialDate: Date | null;
  sourceDocs: BiCustomerSaleRawDoc[];
}

export type RealizedProductMovementOrigin =
  | "DIRECT_NFE"
  | "DIRECT_VENDA_SIMPLES"
  | "PEDIDO_NFE"
  | "PEDIDO_VENDA_SIMPLES"
  | "PEDIDO_RESIDUAL_VENDA_SIMPLES"
  | "PEDIDO_FINANCIAL_COMPLEMENT_VENDA_SIMPLES";

export type CommercialChannel =
  | "ATACADO"
  | "VAREJO"
  | "INDETERMINADO"
  | "CONFLITO";

export interface RealizedProductMovement {
  productId: string | null;
  sourceProductId: string;
  realizedDate: Date;
  quantity: number;
  grossItemAmount: number;
  allocationBaseAmount: number;
  allocatedNetRevenue: number;
  saleId: string;
  customerId: string | null;
  channel: CommercialChannel;
  sourceDocumentId: string;
  sourceDocumentType: SaleAnchorType;
  origin: RealizedProductMovementOrigin;
  auditFlag?: string | null;
}

export interface ProductsOverviewSummary {
  realizedRevenue: number;
  realizedQuantity: number;
  /**
   * Quantidade de produtos distintos com realização física no período (soma de quantity > 0).
   * Movimentos puramente financeiros (quantity = 0 / allocatedNetRevenue > 0) não incrementam este contador.
   */
  distinctProductsSold: number;
  distinctCustomers: number;
  activeCatalogProducts: number;
  productsWithStock: number;
  /**
   * Redundância contratual: semanticamente idêntico a `distinctProductsSold`.
   * Mantido para compatibilidade de schema. O frontend deve renderizar apenas um card de KPI.
   */
  productsSoldInPeriod: number;
}

export interface TopProductItem {
  productId: string | null;
  code: string | null;
  description: string | null;
  category: string;
  quantity: number;
  grossItemAmount: number;
  realizedRevenue: number;
  distinctSales: number;
  distinctCustomers: number;
  currentStockQuantity: number | null;
  retailSalePrice: number | null;
  effectiveCost: number | null;
}

export interface ProductCategoryItem {
  category: string;
  quantity: number;
  realizedRevenue: number;
  distinctProducts: number;
  shareOfRevenue: number;
}

export interface ProductChannelMixItem {
  channel: CommercialChannel;
  quantity: number;
  realizedRevenue: number;
  distinctProducts: number;
}

export interface ProductReconciliationAdjustment {
  type: string;
  sourceDocumentId: string;
  sourceId?: string;
  amount: number;
  reason: string;
}

export interface ProductReconciliation {
  commercialRevenue: number;
  productsRevenue: number;
  adjustmentAmount: number;
  adjustments: ProductReconciliationAdjustment[];
}

export interface ProductsOverviewResult {
  period: {
    from: string;
    to: string;
  };
  summary: ProductsOverviewSummary;
  topProducts: TopProductItem[];
  categories: ProductCategoryItem[];
  channelMix: ProductChannelMixItem[];
  reconciliation: ProductReconciliation;
}

// ====================================================
// Inventory & Turnover (Estoque & Giro) V1 Types
// ====================================================

export type InventoryWindowDays = 30 | 90 | 180;

export type CoverageBucket =
  | "LT_15"
  | "15_TO_30"
  | "30_TO_45"
  | "45_TO_90"
  | "GT_90";

export type InventoryOperationalFlag =
  | "DEMAND_WITHOUT_STOCK"
  | "LOW_ESTIMATED_COVERAGE"
  | "LONG_ESTIMATED_COVERAGE"
  | "NO_SALES_IN_WINDOW"
  | "INACTIVE_WITH_STOCK"
  | "NEGATIVE_STOCK"
  | "STOCK_WITH_SALES";

/**
 * Resumo global de estoque e giro atual (17 campos exatos).
 */
export interface InventoryOverviewSummary {
  /** 1. Total de produtos cadastrados no catálogo */
  totalProducts: number;
  /** 2. Total de produtos com active === true */
  activeProducts: number;
  /** 3. Produtos com estoque atual > 0 (ativos e inativos) */
  productsWithPositiveStock: number;
  /** 4. Produtos com estoque atual = 0 */
  productsWithZeroStock: number;
  /** 5. Produtos com estoque atual < 0 */
  productsWithNegativeStock: number;
  /** 6. Capital total em estoque a custo: SUM(max(stock, 0) * effectiveCost) */
  inventoryCostValue: number;
  /** 7. Valor total de tabela do estoque atual: SUM(max(stock, 0) * retailSalePrice) */
  inventoryListValue: number;
  /** 8. Produtos distintos com saída física realizada na janela (quantity > 0) */
  productsSoldInWindow: number;
  /** 9. Produtos atuais com estoque <= 0 e saída física na janela (todos) */
  demandWithoutStockCount: number;
  /** 10. Produtos atuais ativos e sourcePresent com estoque <= 0 e saída física na janela */
  activeDemandWithoutStockCount: number;
  /** 11. Produtos com estoque atual > 0 e saída física na janela */
  productsWithStockAndSales: number;
  /** 12. Produtos com estoque atual > 0 e zero saída física na janela */
  productsWithStockNoSales: number;
  /** 13. Capital a custo dos produtos com estoque > 0 e saída física na janela */
  capitalWithSales: number;
  /** 14. Capital a custo dos produtos com estoque > 0 e zero saída física na janela */
  capitalWithoutSales: number;
  /** 15. Percentual do capital sem saída sobre o inventoryCostValue total */
  capitalWithoutSalesShare: number;
  /** 16. Quantidade de produtos inativos (active === false) com estoque > 0 */
  inactiveProductsWithStock: number;
  /** 17. Capital a custo imobilizado em produtos inativos com estoque > 0 */
  inactiveStockCostValue: number;
}

export interface InventoryCoverageDistribution {
  /** Cobertura estimada < 15 dias */
  lt15: number;
  /** Cobertura estimada de 15 a < 30 dias */
  from15to30: number;
  /** Cobertura estimada de 30 a < 45 dias */
  from30to45: number;
  /** Cobertura estimada de 45 a 90 dias */
  from45to90: number;
  /** Cobertura estimada > 90 dias */
  gt90: number;
  /** Total de produtos com estoque > 0 e venda na janela (soma exata das faixas acima) */
  totalWithStockAndSales: number;
  /** Produtos com estoque > 0 e zero saída física na janela (fora das faixas matemáticas) */
  noSalesInWindow: number;
}

export interface InventoryProductItem {
  productId: string | null;
  sourceProductId: string;
  code: string;
  description: string;
  category: string;
  categorySourceId: string | null;
  active: boolean;
  currentStock: number;
  effectiveCost: number;
  retailSalePrice: number;
  stockCostValue: number;
  stockListValue: number;
  quantityInWindow: number;
  realizedRevenueInWindow: number;
  averageDailySales: number;
  lastPhysicalSaleDate: string | null;
  daysSinceLastPhysicalSale: number | null;
  estimatedDaysOfStock: number | null;
  coverageBucket: CoverageBucket | null;
  distinctCustomersInWindow: number;
  operationalFlags: InventoryOperationalFlag[];
}

export interface InventoryCategoryItem {
  categorySourceId: string | null;
  category: string;
  products: number;
  productsWithStock: number;
  stockUnits: number;
  inventoryCostValue: number;
  inventoryListValue: number;
  quantityInWindow: number;
  realizedRevenueInWindow: number;
  productsWithSales: number;
  productsWithoutSales: number;
  capitalWithoutSales: number;
  capitalWithoutSalesShare: number;
  demandWithoutStockCount: number;
  lowCoverageCount: number;
  aggregatedEstimatedDaysOfStock: number | null;
}

export interface CategoryTreeNode {
  sourceId: string;
  description: string;
  parentSourceId: string | null;
  directProductCount: number;
  descendantProductCount: number;
  children: CategoryTreeNode[];
}

export interface CategoryTreeResult {
  categories: CategoryTreeNode[];
}

export interface InventoryDataQuality {
  negativeStockCount: number;
  activeWithoutStockCount: number;
  inactiveWithStockCount: number;
  effectiveCostMissingOrZero: number;
  retailSalePriceMissingOrZero: number;
  averageCostMissingOrZero: number;
  stockMinNotConfiguredCount: number;
  stockMaxNotConfiguredCount: number;
}

export interface InventoryOverviewResult {
  asOfDate: string;
  windowDays: InventoryWindowDays;
  summary: InventoryOverviewSummary;
  coverageDistribution: InventoryCoverageDistribution;
  products: InventoryProductItem[];
  categories: InventoryCategoryItem[];
  dataQuality: InventoryDataQuality;
}

// ====================================================
// Profitability (Rentabilidade Estimada ao Custo Atual) V1 Types
// ====================================================

export interface ProfitabilitySummary {
  realizedRevenue: number;
  revenueWithCurrentCost: number;
  revenueWithoutCurrentCost: number;
  costCoveragePercent: number | null;
  estimatedCOGS: number;
  estimatedGrossProfit: number;
  estimatedGrossMarginPercent: number | null;
}

export interface ProfitabilityCostSnapshot {
  completedAt: string | null;
  source: "PRODUCT_SYNC_RUN" | "PRODUCT_LAST_SEEN_FALLBACK";
}

export interface ProfitabilityDataQuality {
  movementsTotal: number;
  movementsWithCurrentCost: number;
  movementsWithoutCurrentCost: number;
  realizedRevenue: number;
  revenueWithCurrentCost: number;
  revenueWithoutCurrentCost: number;
  costCoveragePercent: number | null;
  financialComplementMovementCount: number;
  financialComplementRevenue: number;
  movementsWithoutCurrentProduct: number;
  revenueWithoutCurrentProduct: number;
  currentCategoryCoveragePercent: number | null;
  costBasis: "CURRENT_PRODUCT_EFFECTIVE_COST";
  categoryBasis: "CURRENT_PRODUCT_CATEGORY";
}

export interface ProfitabilityTrendPoint {
  period: string;
  realizedRevenue: number;
  revenueWithCurrentCost: number;
  revenueWithoutCurrentCost: number;
  estimatedCOGS: number;
  estimatedGrossProfit: number;
  estimatedGrossMarginPercent: number | null;
  costCoveragePercent: number | null;
}

export interface ProfitabilityChannelItem {
  channel: CommercialChannel;
  realizedRevenue: number;
  revenueWithCurrentCost: number;
  estimatedCOGS: number;
  estimatedGrossProfit: number;
  estimatedGrossMarginPercent: number | null;
  costCoveragePercent: number | null;
  physicalQuantity: number;
}

export interface ProfitabilityRootCategoryItem {
  categorySourceId: string;
  category: string;
  realizedRevenue: number;
  revenueWithCurrentCost: number;
  estimatedCOGS: number;
  estimatedGrossProfit: number;
  estimatedGrossMarginPercent: number | null;
  costCoveragePercent: number | null;
  physicalQuantity: number;
}

export interface ProfitabilityCategoryItem {
  categorySourceId: string;
  category: string;
  realizedRevenue: number;
  revenueWithCurrentCost: number;
  estimatedCOGS: number;
  estimatedGrossProfit: number;
  estimatedGrossMarginPercent: number | null;
  costCoveragePercent: number | null;
  physicalQuantity: number;
}

export interface ProfitabilityProductItem {
  productSourceId: string;
  sku: string | null;
  productName: string;
  categorySourceId: string | null;
  category: string | null;
  rootCategorySourceId: string | null;
  rootCategory: string | null;
  physicalQuantity: number;
  realizedRevenue: number;
  currentEffectiveCost: number | null;
  revenueWithCurrentCost: number;
  revenueWithoutCurrentCost: number;
  estimatedCOGS: number | null;
  estimatedGrossProfit: number | null;
  estimatedGrossMarginPercent: number | null;
  costCoveragePercent: number | null;
  lastRealizedDate: string | null;
}

export interface ProfitabilityOverviewResult {
  period: {
    from: string;
    to: string;
  };
  filters: {
    channel: CommercialChannel | null;
    categorySourceId: string | null;
  };
  summary: ProfitabilitySummary;
  costSnapshot: ProfitabilityCostSnapshot;
  dataQuality: ProfitabilityDataQuality;
  trendGranularity: "DAY" | "MONTH";
  trend: ProfitabilityTrendPoint[];
  channels: ProfitabilityChannelItem[];
  rootCategories: ProfitabilityRootCategoryItem[];
  categories: ProfitabilityCategoryItem[];
  products: ProfitabilityProductItem[];
}
