import { describe, expect, it } from "vitest";
import {
  calculateProfitabilityOverview,
  type CatalogProductProfitabilityInfo,
  type FlatCategoryInfo,
} from "../src/modules/bi/bi-profitability-calculator.js";
import type {
  CategoryTreeNode,
  CommercialChannel,
  ProfitabilityCostSnapshot,
  RealizedProductMovement,
} from "../src/modules/bi/bi-types.js";

describe("Profitability BI V1 — Deterministic Calculator", () => {
  const defaultCostSnapshot: ProfitabilityCostSnapshot = {
    asOf: new Date("2026-09-17T21:00:00.000Z"),
    lastProductSyncAt: new Date("2026-09-17T20:30:00.000Z"),
    lastProductSyncStatus: "SUCCESS",
    totalCatalogProducts: 10,
    productsWithCostCount: 9,
    productsWithoutCostCount: 1,
  };

  const sampleFlatCategories: FlatCategoryInfo[] = [
    {
      sourceId: "1",
      description: "HARDGOODS",
      parentSourceId: null,
    },
    {
      sourceId: "11",
      description: "SHAPES",
      parentSourceId: "1",
    },
    {
      sourceId: "111",
      description: "MARFIM",
      parentSourceId: "11",
    },
    {
      sourceId: "2",
      description: "X - DESATIVADOS",
      parentSourceId: null,
    },
  ];

  const sampleCategoryTree: CategoryTreeNode[] = [
    {
      sourceId: "1",
      description: "HARDGOODS",
      parentId: null,
      parentSourceId: null,
      active: true,
      childrenCount: 1,
      children: [
        {
          sourceId: "11",
          description: "SHAPES",
          parentId: "cat-1",
          parentSourceId: "1",
          active: true,
          childrenCount: 1,
          children: [
            {
              sourceId: "111",
              description: "MARFIM",
              parentId: "cat-11",
              parentSourceId: "11",
              active: true,
              childrenCount: 0,
              children: [],
            },
          ],
        },
      ],
    },
    {
      sourceId: "2",
      description: "X - DESATIVADOS",
      parentId: null,
      parentSourceId: null,
      active: true,
      childrenCount: 0,
      children: [],
    },
  ];

  const sampleProducts: CatalogProductProfitabilityInfo[] = [
    {
      id: "prod-1",
      sourceId: "101",
      code: "SHP-01",
      description: "Shape Maple Pro",
      categorySourceId: "111",
      categoryDescription: "MARFIM",
      effectiveCost: 80,
    },
    {
      id: "prod-2",
      sourceId: "102",
      code: "SHP-02",
      description: "Shape Sem Custo",
      categorySourceId: "111",
      categoryDescription: "MARFIM",
      effectiveCost: null, // Sem custo cadastrado
    },
    {
      id: "prod-3",
      sourceId: "103",
      code: "ROD-01",
      description: "Roda 52mm",
      categorySourceId: "1",
      categoryDescription: "HARDGOODS",
      effectiveCost: 40,
    },
  ];

  const catalogProductsMap = new Map<string, CatalogProductProfitabilityInfo>();
  for (const p of sampleProducts) {
    catalogProductsMap.set(p.sourceId, p);
  }

  function runCalculator(options: {
    movements: RealizedProductMovement[];
    from?: string;
    to?: string;
    channel?: CommercialChannel | null;
    categorySourceId?: string | null;
  }) {
    return calculateProfitabilityOverview({
      movements: options.movements,
      catalogProductsMap,
      categoriesFlat: sampleFlatCategories,
      categoryTree: sampleCategoryTree,
      period: {
        from: options.from ?? "2026-01-01",
        to: options.to ?? "2026-01-31",
      },
      filters: {
        channel: options.channel,
        categorySourceId: options.categorySourceId,
      },
      costSnapshot: defaultCostSnapshot,
    });
  }

  it("1. Fórmulas canônicas: calcula CMV estimado, lucro bruto, margem e cobertura corretamente", () => {
    const movements: RealizedProductMovement[] = [
      {
        productId: "prod-1",
        sourceProductId: "101",
        realizedDate: new Date("2026-01-10T14:00:00.000Z"),
        quantity: 10,
        grossItemAmount: 2000,
        allocationBaseAmount: 2000,
        allocatedNetRevenue: 2000,
        saleId: "sale-1",
        customerId: "cust-1",
        channel: "ATACADO",
        sourceDocumentId: "doc-1",
        sourceDocumentType: "NFE" as any,
        origin: "DIRECT_NFE",
      },
    ];

    const result = runCalculator({ movements });

    // prod-1: cost 80. 10 * 80 = 800 COGS. Revenue = 2000. Profit = 1200. Margin = 60%. Coverage = 100%.
    expect(result.summary.realizedRevenue).toBe(2000);
    expect(result.summary.revenueWithCurrentCost).toBe(2000);
    expect(result.summary.revenueWithoutCurrentCost).toBe(0);
    expect(result.summary.costCoveragePercent).toBe(100);
    expect(result.summary.estimatedCOGS).toBe(800);
    expect(result.summary.estimatedGrossProfit).toBe(1200);
    expect(result.summary.estimatedGrossMarginPercent).toBe(60);
  });

  it("2. Item sem custo cadastrado: NÃO assume custo zero, separa receita sem custo e não distorce margem", () => {
    const movements: RealizedProductMovement[] = [
      {
        productId: "prod-1",
        sourceProductId: "101",
        realizedDate: new Date("2026-01-10T14:00:00.000Z"),
        quantity: 5,
        grossItemAmount: 1000,
        allocationBaseAmount: 1000,
        allocatedNetRevenue: 1000,
        saleId: "sale-1",
        customerId: "cust-1",
        channel: "ATACADO",
        sourceDocumentId: "doc-1",
        sourceDocumentType: "NFE" as any,
        origin: "DIRECT_NFE",
      },
      {
        productId: "prod-2", // effectiveCost = null
        sourceProductId: "102",
        realizedDate: new Date("2026-01-12T14:00:00.000Z"),
        quantity: 2,
        grossItemAmount: 500,
        allocationBaseAmount: 500,
        allocatedNetRevenue: 500,
        saleId: "sale-2",
        customerId: "cust-2",
        channel: "ECOMMERCE",
        sourceDocumentId: "doc-2",
        sourceDocumentType: "NFE" as any,
        origin: "DIRECT_NFE",
      },
    ];

    const result = runCalculator({ movements });

    expect(result.summary.realizedRevenue).toBe(1500);
    expect(result.summary.revenueWithCurrentCost).toBe(1000);
    expect(result.summary.revenueWithoutCurrentCost).toBe(500);
    expect(result.summary.costCoveragePercent).toBe(66.67);
    // COGS apenas do prod-1 (5 * 80 = 400). Prod-2 NÃO entra como custo zero!
    expect(result.summary.estimatedCOGS).toBe(400);
    expect(result.summary.estimatedGrossProfit).toBe(600);
    expect(result.summary.estimatedGrossMarginPercent).toBe(60); // 600 / 1000 * 100
  });

  it("3. Complemento financeiro com quantity = 0: preserva receita e adiciona CMV zero", () => {
    const movements: RealizedProductMovement[] = [
      {
        productId: "prod-1",
        sourceProductId: "101",
        realizedDate: new Date("2026-01-05T10:00:00.000Z"),
        quantity: 10,
        grossItemAmount: 1000,
        allocationBaseAmount: 1000,
        allocatedNetRevenue: 1000,
        saleId: "sale-1",
        customerId: "cust-1",
        channel: "ATACADO",
        sourceDocumentId: "nfe-1",
        sourceDocumentType: "NFE" as any,
        origin: "DIRECT_NFE",
      },
      {
        // Complemento financeiro da venda simples
        productId: "prod-1",
        sourceProductId: "101",
        realizedDate: new Date("2026-01-08T10:00:00.000Z"),
        quantity: 0,
        grossItemAmount: 150,
        allocationBaseAmount: 150,
        allocatedNetRevenue: 150,
        saleId: "sale-1",
        customerId: "cust-1",
        channel: "ATACADO",
        sourceDocumentId: "sale-1",
        sourceDocumentType: "VENDA_FATURADA" as any,
        origin: "RESIDUAL_SALE_DIFF",
      },
    ];

    const result = runCalculator({ movements });

    expect(result.summary.realizedRevenue).toBe(1150);
    expect(result.summary.revenueWithCurrentCost).toBe(1150);
    // COGS: 10 * 80 + 0 * 80 = 800
    expect(result.summary.estimatedCOGS).toBe(800);
    expect(result.summary.estimatedGrossProfit).toBe(350); // 1150 - 800 = 350
    expect(result.summary.estimatedGrossMarginPercent).toBe(30.43); // (350 / 1150) * 100
  });

  it("4. Produtos históricos órfãos (excluídos do catálogo ERP): preserva receita, neutraliza exibição e reconcilia", () => {
    const movements: RealizedProductMovement[] = [
      {
        productId: "prod-1",
        sourceProductId: "101",
        realizedDate: new Date("2026-01-10T10:00:00.000Z"),
        quantity: 5,
        grossItemAmount: 500,
        allocationBaseAmount: 500,
        allocatedNetRevenue: 500,
        saleId: "sale-1",
        customerId: "cust-1",
        channel: "ATACADO",
        sourceDocumentId: "doc-1",
        sourceDocumentType: "NFE" as any,
        origin: "DIRECT_NFE",
      },
      {
        // Movimento histórico cujo produto foi excluído da tabela Product
        productId: null,
        sourceProductId: "999", // ID histórico não existente no catálogo atual
        realizedDate: new Date("2026-01-15T10:00:00.000Z"),
        quantity: 2,
        grossItemAmount: 300,
        allocationBaseAmount: 300,
        allocatedNetRevenue: 300,
        saleId: "sale-2",
        customerId: "cust-2",
        channel: "VAREJO",
        sourceDocumentId: "doc-2",
        sourceDocumentType: "NFE" as any,
        origin: "DIRECT_NFE",
      },
    ];

    const result = runCalculator({ movements });

    // A. Receita total do summary preserva todos os movimentos
    expect(result.summary.realizedRevenue).toBe(800);
    expect(result.summary.revenueWithCurrentCost).toBe(500);
    expect(result.summary.revenueWithoutCurrentCost).toBe(300);

    // B. dataQuality captura movimentos e receita de produtos ausentes
    expect(result.dataQuality.movementsWithoutCurrentProduct).toBe(1);
    expect(result.dataQuality.revenueWithoutCurrentProduct).toBe(300);
    expect(result.dataQuality.currentCategoryCoveragePercent).toBe(62.5); // (500 / 800) * 100

    // C. Reconciliação canônica: summary.realizedRevenue = soma(rootCategories) + revenueWithoutCurrentProduct
    const sumRoots = result.rootCategories.reduce((acc, r) => acc + r.realizedRevenue, 0);
    expect(sumRoots).toBe(500);
    expect(result.summary.realizedRevenue).toBe(sumRoots + result.dataQuality.revenueWithoutCurrentProduct);

    // D. Item órfão aparece em products[] com apresentação neutra e métricas null
    const orphanItem = result.products.find((p) => p.productSourceId === "999");
    expect(orphanItem).toBeDefined();
    expect(orphanItem!.productName).toBe("Produto não disponível no catálogo atual (ID: 999)");
    expect(orphanItem!.sku).toBeNull();
    expect(orphanItem!.currentEffectiveCost).toBeNull();
    expect(orphanItem!.estimatedCOGS).toBeNull();
    expect(orphanItem!.estimatedGrossProfit).toBeNull();
    expect(orphanItem!.estimatedGrossMarginPercent).toBeNull();
    expect(orphanItem!.realizedRevenue).toBe(300);
    expect(orphanItem!.revenueWithoutCurrentCost).toBe(300);
  });

  it("5. Filtro de categoria hierárquico (subtree): filtrar por categoria pai inclui todas as subcategorias descendentes", () => {
    const movements: RealizedProductMovement[] = [
      {
        productId: "prod-1", // categorySourceId: 111 (filha de 11, neta de 1)
        sourceProductId: "101",
        realizedDate: new Date("2026-01-10T10:00:00.000Z"),
        quantity: 2,
        grossItemAmount: 400,
        allocationBaseAmount: 400,
        allocatedNetRevenue: 400,
        saleId: "sale-1",
        customerId: "cust-1",
        channel: "ATACADO",
        sourceDocumentId: "doc-1",
        sourceDocumentType: "NFE" as any,
        origin: "DIRECT_NFE",
      },
      {
        productId: "prod-3", // categorySourceId: 1 (raiz 1)
        sourceProductId: "103",
        realizedDate: new Date("2026-01-12T10:00:00.000Z"),
        quantity: 5,
        grossItemAmount: 250,
        allocationBaseAmount: 250,
        allocatedNetRevenue: 250,
        saleId: "sale-2",
        customerId: "cust-2",
        channel: "ATACADO",
        sourceDocumentId: "doc-2",
        sourceDocumentType: "NFE" as any,
        origin: "DIRECT_NFE",
      },
    ];

    // Filtrando pela subcategoria 11 (SHAPES): deve incluir prod-1 (111) mas excluir prod-3 (1)
    const resultSubtree = runCalculator({
      movements,
      categorySourceId: "11",
    });

    expect(resultSubtree.summary.realizedRevenue).toBe(400);
    expect(resultSubtree.products).toHaveLength(1);
    expect(resultSubtree.products[0]!.productSourceId).toBe("101");
  });

  it("6. Filtro por canal: isola faturamento e custos do canal selecionado", () => {
    const movements: RealizedProductMovement[] = [
      {
        productId: "prod-1",
        sourceProductId: "101",
        realizedDate: new Date("2026-01-10T10:00:00.000Z"),
        quantity: 2,
        grossItemAmount: 400,
        allocationBaseAmount: 400,
        allocatedNetRevenue: 400,
        saleId: "sale-1",
        customerId: "cust-1",
        channel: "ATACADO",
        sourceDocumentId: "doc-1",
        sourceDocumentType: "NFE" as any,
        origin: "DIRECT_NFE",
      },
      {
        productId: "prod-1",
        sourceProductId: "101",
        realizedDate: new Date("2026-01-12T10:00:00.000Z"),
        quantity: 1,
        grossItemAmount: 200,
        allocationBaseAmount: 200,
        allocatedNetRevenue: 200,
        saleId: "sale-2",
        customerId: "cust-2",
        channel: "ECOMMERCE",
        sourceDocumentId: "doc-2",
        sourceDocumentType: "NFE" as any,
        origin: "DIRECT_NFE",
      },
    ];

    const result = runCalculator({
      movements,
      channel: "ECOMMERCE",
    });

    expect(result.summary.realizedRevenue).toBe(200);
    expect(result.summary.estimatedCOGS).toBe(80); // 1 * 80
    expect(result.channels).toHaveLength(1);
    expect(result.channels[0]!.channel).toBe("ECOMMERCE");
  });

  it("7. Preenchimento contínuo de série temporal (trend) diário para períodos curtos", () => {
    const movements: RealizedProductMovement[] = [
      {
        productId: "prod-1",
        sourceProductId: "101",
        realizedDate: new Date("2026-01-02T10:00:00.000Z"),
        quantity: 1,
        grossItemAmount: 100,
        allocationBaseAmount: 100,
        allocatedNetRevenue: 100,
        saleId: "sale-1",
        customerId: "cust-1",
        channel: "ATACADO",
        sourceDocumentId: "doc-1",
        sourceDocumentType: "NFE" as any,
        origin: "DIRECT_NFE",
      },
    ];

    const result = runCalculator({
      movements,
      from: "2026-01-01",
      to: "2026-01-03",
    });

    expect(result.trendGranularity).toBe("DAY");
    expect(result.trend).toHaveLength(3); // 2026-01-01, 2026-01-02, 2026-01-03
    expect(result.trend[0]!.period).toBe("2026-01-01");
    expect(result.trend[0]!.realizedRevenue).toBe(0);
    expect(result.trend[1]!.period).toBe("2026-01-02");
    expect(result.trend[1]!.realizedRevenue).toBe(100);
    expect(result.trend[2]!.period).toBe("2026-01-03");
    expect(result.trend[2]!.realizedRevenue).toBe(0);
  });

  it("8. DataQuality: calcula productsTotal, productsWithCurrentCost e productsWithoutCurrentCost corretamente", () => {
    // 3 movimentos:
    // - prod-1 (101): tem custo (80)
    // - prod-2 (102): sem custo (null)
    // - órfão (999): não existe no catálogo
    const movements: RealizedProductMovement[] = [
      {
        productId: "prod-1",
        sourceProductId: "101",
        realizedDate: new Date("2026-01-02T10:00:00.000Z"),
        quantity: 1,
        grossItemAmount: 100,
        allocationBaseAmount: 100,
        allocatedNetRevenue: 100,
        saleId: "sale-1",
        customerId: "cust-1",
        channel: "ATACADO",
        sourceDocumentId: "doc-1",
        sourceDocumentType: "NFE" as any,
        origin: "DIRECT_NFE",
      },
      {
        productId: "prod-2",
        sourceProductId: "102",
        realizedDate: new Date("2026-01-02T10:00:00.000Z"),
        quantity: 1,
        grossItemAmount: 100,
        allocationBaseAmount: 100,
        allocatedNetRevenue: 100,
        saleId: "sale-1",
        customerId: "cust-1",
        channel: "ATACADO",
        sourceDocumentId: "doc-1",
        sourceDocumentType: "NFE" as any,
        origin: "DIRECT_NFE",
      },
      {
        productId: null,
        sourceProductId: "999",
        realizedDate: new Date("2026-01-02T10:00:00.000Z"),
        quantity: 1,
        grossItemAmount: 50,
        allocationBaseAmount: 50,
        allocatedNetRevenue: 50,
        saleId: "sale-2",
        customerId: "cust-1",
        channel: "ATACADO",
        sourceDocumentId: "doc-2",
        sourceDocumentType: "NFE" as any,
        origin: "DIRECT_NFE",
      },
    ];

    const result = runCalculator({ movements });

    expect(result.dataQuality.productsTotal).toBe(3);
    expect(result.dataQuality.productsWithCurrentCost).toBe(1);
    expect(result.dataQuality.productsWithoutCurrentCost).toBe(2);

    // Caso de zero movimentos
    const emptyResult = runCalculator({ movements: [] });
    expect(emptyResult.dataQuality.productsTotal).toBe(0);
    expect(emptyResult.dataQuality.productsWithCurrentCost).toBe(0);
    expect(emptyResult.dataQuality.productsWithoutCurrentCost).toBe(0);
  });
});
