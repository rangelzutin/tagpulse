import { describe, expect, it } from "vitest";
import {
  calculateProductsOverview,
  isShapeProduct,
  parseShapeCommercialSize,
  resolveCommercialLine,
  sanitizeCommercialLine,
  type CatalogProductInfo,
} from "../src/modules/bi/bi-products-calculator.js";
import type { RealizedProductMovement } from "../src/modules/bi/bi-types.js";
import type { FlatCategoryInfo } from "../src/modules/bi/bi-profitability-calculator.js";

describe("bi-products-calculator unit tests", () => {
  describe("A. commercialLine", () => {
    it("limpa prefixos ordenadores legados ('1 - ', '2- ', '3 - ', 'X - ')", () => {
      expect(sanitizeCommercialLine("1 - NINECLOUDS")).toBe("NINECLOUDS");
      expect(sanitizeCommercialLine("2- DESTRUX")).toBe("DESTRUX");
      expect(sanitizeCommercialLine("3 - HUSTLER")).toBe("HUSTLER");
      expect(sanitizeCommercialLine("X - DESATIVADOS")).toBe("DESATIVADOS");
      expect(sanitizeCommercialLine("  4 -  MARCA LIMPA  ")).toBe("MARCA LIMPA");
      expect(sanitizeCommercialLine("NINECLOUDS")).toBe("NINECLOUDS");
      expect(sanitizeCommercialLine("")).toBe("SEM LINHA");
      expect(sanitizeCommercialLine(null)).toBe("SEM LINHA");
      expect(sanitizeCommercialLine(undefined)).toBe("SEM LINHA");
    });

    it("resolve raiz direta, filho e múltiplos níveis", () => {
      const flatCats: FlatCategoryInfo[] = [
        { sourceId: "root-1", description: "1 - NINECLOUDS", parentSourceId: null },
        { sourceId: "cat-shapes", description: "Shapes", parentSourceId: "root-1" },
        { sourceId: "cat-maple", description: "Maple", parentSourceId: "cat-shapes" },
      ];
      const catMap = new Map(flatCats.map((c) => [c.sourceId, c]));

      // Raiz direta
      expect(resolveCommercialLine("root-1", catMap)).toBe("NINECLOUDS");
      // Filho nível 1
      expect(resolveCommercialLine("cat-shapes", catMap)).toBe("NINECLOUDS");
      // Múltiplos níveis (nível 2)
      expect(resolveCommercialLine("cat-maple", catMap)).toBe("NINECLOUDS");
    });

    it("trata categoria inexistente, parent ausente e protege contra ciclos", () => {
      const flatCats: FlatCategoryInfo[] = [
        { sourceId: "cat-orphan", description: "Órfã", parentSourceId: "missing-parent" },
        { sourceId: "loop-1", description: "Loop 1", parentSourceId: "loop-2" },
        { sourceId: "loop-2", description: "Loop 2", parentSourceId: "loop-1" },
      ];
      const catMap = new Map(flatCats.map((c) => [c.sourceId, c]));

      // Categoria inexistente
      expect(resolveCommercialLine("inexistente", catMap)).toBe("SEM LINHA");
      expect(resolveCommercialLine(null, catMap)).toBe("SEM LINHA");

      // Parent inexistente: para na categoria que não tem o parent no mapa
      expect(resolveCommercialLine("cat-orphan", catMap)).toBe("Órfã");

      // Ciclo: para ao detectar nó já visitado sem travar
      expect(["Loop 1", "Loop 2"]).toContain(resolveCommercialLine("loop-1", catMap));
    });
  });

  describe("B. shape parser", () => {
    it("identifica se um produto é shape", () => {
      expect(isShapeProduct("Shape Nineclouds 8.0", "Shapes")).toBe(true);
      expect(isShapeProduct("Item XPTO", "Shape Nineclouds")).toBe(true);
      expect(isShapeProduct("SHAPE MAPLE 8.25", null)).toBe(true);
      expect(isShapeProduct("Camiseta Nineclouds", "Confecção")).toBe(false);
      expect(isShapeProduct("Roda Spitfire", "Hardgoods")).toBe(false);
      expect(isShapeProduct(null, null)).toBe(false);
    });

    it("extrai todos os tamanhos homologados decimais", () => {
      expect(parseShapeCommercialSize("Shape Nineclouds Maple 7.75", "Shapes")).toBe("7.7");
      expect(parseShapeCommercialSize("Shape Jart Elegance 7.875", "Shapes")).toBe("7.8");
      expect(parseShapeCommercialSize("Shape Nineclouds Maple 8.0", "Shapes")).toBe("8.0");
      expect(parseShapeCommercialSize("Shape Nineclouds Full Logo 8.00\"", "Shapes")).toBe("8.0");
      expect(parseShapeCommercialSize("Shape Nineclouds Logo 8.125", "Shapes")).toBe("8.1");
      expect(parseShapeCommercialSize("Shape Nineclouds 8.25", "Shapes")).toBe("8.2");
      expect(parseShapeCommercialSize("Shape Nineclouds 8.5", "Shapes")).toBe("8.5");
      expect(parseShapeCommercialSize("Shape Nineclouds 8.50", "Shapes")).toBe("8.5");
    });

    it("extrai todos os tamanhos homologados fracionários", () => {
      expect(parseShapeCommercialSize("Shape Nineclouds 7 3/4", "Shapes")).toBe("7.7");
      expect(parseShapeCommercialSize("Shape Jart Night 7 7/8", "Shapes")).toBe("7.8");
      expect(parseShapeCommercialSize("Shape Destrux Team 8 1/8", "Shapes")).toBe("8.1");
      expect(parseShapeCommercialSize("Shape Nineclouds 8 1/4\"", "Shapes")).toBe("8.2");
      expect(parseShapeCommercialSize("Shape Nineclouds 8 1/2", "Shapes")).toBe("8.5");
    });

    it("classifica medidas atípicas como OTHER", () => {
      expect(parseShapeCommercialSize("Shape Street 7.50", "Shapes")).toBe("OTHER");
      expect(parseShapeCommercialSize("Shape Kids 7.60", "Shapes")).toBe("OTHER");
      expect(parseShapeCommercialSize("Shape Street 8.3", "Shapes")).toBe("OTHER");
      expect(parseShapeCommercialSize("Shape Street 8.375", "Shapes")).toBe("OTHER");
      expect(parseShapeCommercialSize("Shape Cruiser Old School 8.75", "Shapes")).toBe("OTHER");
    });

    it("classifica shape sem tamanho como UNCLASSIFIED e produto não-shape como null", () => {
      expect(parseShapeCommercialSize("Shape Nineclouds Maple Especial", "Shapes")).toBe("UNCLASSIFIED");
      expect(parseShapeCommercialSize("Camiseta Nineclouds Logo Preto G", "Confecção")).toBeNull();
      expect(parseShapeCommercialSize("Roda Spitfire Formula Four 54mm", "Rodas")).toBeNull();
    });
  });

  describe("C, D, E, F, G, H. rentabilidade, cost coverage, Top 10, ABC, mixes e stock opportunities", () => {
    const defaultParams = {
      period: { from: "2026-01-01", to: "2026-01-31" },
      commercialRevenue: 1000,
      adjustments: [],
      catalogSummary: { activeCount: 10, withStockCount: 5 },
    };

    const makeMovement = (
      sourceProductId: string,
      quantity: number,
      allocatedNetRevenue: number,
      channel: "ATACADO" | "VAREJO" = "ATACADO",
    ): RealizedProductMovement => ({
      movementId: `mov-${sourceProductId}-${Math.random()}`,
      saleId: `sale-1`,
      sourceDocumentId: `doc-1`,
      realizedDate: new Date("2026-01-15T00:00:00.000Z"),
      productId: `prod-${sourceProductId}`,
      sourceProductId,
      customerId: "cust-1",
      channel,
      quantity,
      grossItemAmount: allocatedNetRevenue,
      allocatedNetRevenue,
      sourceDocumentType: "NFE",
      origin: "NFE_DIRECT",
    });

    it("calcula rentabilidade por SKU: custo normal, custo zero conhecido, custo null, receita zero e qty zero", () => {
      const movements: RealizedProductMovement[] = [
        makeMovement("1", 10, 1000), // normal: custo 40 -> cmv 400, lucro 600, margem 60%
        makeMovement("2", 5, 500),  // custo zero: custo 0 -> cmv 0, lucro 500, margem 100%
        makeMovement("3", 2, 200),  // custo null -> cmv null, lucro null, margem null
        makeMovement("4", 4, 0),    // receita zero: custo 25 -> cmv 100, lucro -100, margem null
        makeMovement("5", 0, 100),  // qty zero (financeiro): custo 50 -> cmv 0, lucro 100, margem 100%
      ];

      const catalogProductMap = new Map<string, CatalogProductInfo>([
        ["prod-1", { code: "P1", description: "P1", categoryDescription: "Cat 1", stockQuantity: 10, retailSalePrice: 100, effectiveCost: 40 }],
        ["prod-2", { code: "P2", description: "P2", categoryDescription: "Cat 2", stockQuantity: 5, retailSalePrice: 100, effectiveCost: 0 }],
        ["prod-3", { code: "P3", description: "P3", categoryDescription: "Cat 3", stockQuantity: 2, retailSalePrice: 100, effectiveCost: null }],
        ["prod-4", { code: "P4", description: "P4", categoryDescription: "Cat 4", stockQuantity: 4, retailSalePrice: 100, effectiveCost: 25 }],
        ["prod-5", { code: "P5", description: "P5", categoryDescription: "Cat 5", stockQuantity: 0, retailSalePrice: 100, effectiveCost: 50 }],
      ]);

      const res = calculateProductsOverview({
        ...defaultParams,
        movements,
        catalogProductMap,
        commercialRevenue: 1800,
      });

      const p1 = res.topProducts.find((p) => p.sourceProductId === "1")!;
      expect(p1.cmvEstimatedCurrentCost).toBe(400);
      expect(p1.grossProfitEstimatedCurrentCost).toBe(600);
      expect(p1.grossMarginEstimatedCurrentCost).toBe(60);

      const p2 = res.topProducts.find((p) => p.sourceProductId === "2")!;
      expect(p2.cmvEstimatedCurrentCost).toBe(0);
      expect(p2.grossProfitEstimatedCurrentCost).toBe(500);
      expect(p2.grossMarginEstimatedCurrentCost).toBe(100);

      const p3 = res.topProducts.find((p) => p.sourceProductId === "3")!;
      expect(p3.cmvEstimatedCurrentCost).toBeNull();
      expect(p3.grossProfitEstimatedCurrentCost).toBeNull();
      expect(p3.grossMarginEstimatedCurrentCost).toBeNull();

      const p4 = res.topProducts.find((p) => p.sourceProductId === "4")!;
      expect(p4.cmvEstimatedCurrentCost).toBe(100);
      expect(p4.grossProfitEstimatedCurrentCost).toBe(-100);
      expect(p4.grossMarginEstimatedCurrentCost).toBeNull(); // receita 0 não divide

      const p5 = res.topProducts.find((p) => p.sourceProductId === "5")!;
      expect(p5.cmvEstimatedCurrentCost).toBe(0); // qty 0 -> 0 * 50 = 0
      expect(p5.grossProfitEstimatedCurrentCost).toBe(100);
      expect(p5.grossMarginEstimatedCurrentCost).toBe(100);
    });

    it("cost coverage: calcula cobertura parcial e seta summary nulo se houver produto sem custo", () => {
      const movements = [
        makeMovement("1", 10, 800),
        makeMovement("2", 2, 200), // sem custo
      ];
      const catalogProductMap = new Map<string, CatalogProductInfo>([
        ["prod-1", { code: "P1", description: "P1", categoryDescription: "Cat 1", stockQuantity: 10, retailSalePrice: 100, effectiveCost: 50 }],
        ["prod-2", { code: "P2", description: "P2", categoryDescription: "Cat 2", stockQuantity: 10, retailSalePrice: 100, effectiveCost: null }],
      ]);

      const res = calculateProductsOverview({
        ...defaultParams,
        movements,
        catalogProductMap,
        commercialRevenue: 1000,
      });

      expect(res.summary.costCoverage).toEqual({
        productsWithCost: 1,
        productsWithoutCost: 1,
        realizedRevenueWithCost: 800,
        realizedRevenueWithoutCost: 200,
        revenueCoveragePercent: 80,
      });

      // Como productsWithoutCost > 0, os agregados do summary são nulos para não induzir a erro
      expect(res.summary.cmvEstimatedCurrentCost).toBeNull();
      expect(res.summary.grossProfitEstimatedCurrentCost).toBeNull();
      expect(res.summary.grossMarginEstimatedCurrentCost).toBeNull();
    });

    it("cost coverage: quando 100% dos produtos vendidos têm custo, calcula summary agregado", () => {
      const movements = [
        makeMovement("1", 10, 800), // custo 40 -> cmv 400
        makeMovement("2", 2, 200),  // custo 0 -> cmv 0
      ];
      const catalogProductMap = new Map<string, CatalogProductInfo>([
        ["prod-1", { code: "P1", description: "P1", categoryDescription: "Cat 1", stockQuantity: 10, retailSalePrice: 100, effectiveCost: 40 }],
        ["prod-2", { code: "P2", description: "P2", categoryDescription: "Cat 2", stockQuantity: 10, retailSalePrice: 100, effectiveCost: 0 }],
      ]);

      const res = calculateProductsOverview({
        ...defaultParams,
        movements,
        catalogProductMap,
        commercialRevenue: 1000,
      });

      expect(res.summary.costCoverage.productsWithoutCost).toBe(0);
      expect(res.summary.costCoverage.revenueCoveragePercent).toBe(100);
      expect(res.summary.cmvEstimatedCurrentCost).toBe(400);
      expect(res.summary.grossProfitEstimatedCurrentCost).toBe(600); // 1000 - 400
      expect(res.summary.grossMarginEstimatedCurrentCost).toBe(60); // 600 / 1000 * 100
    });

    it("Top 10 Revenue Share: lida com < 10 SKUs, > 10 SKUs e receita total zero", () => {
      // 12 SKUs de R$ 100 cada (total R$ 1200). Top 10 = R$ 1000 -> 1000/1200 * 100 = 83.33%
      const movements = Array.from({ length: 12 }, (_, i) => makeMovement(String(i + 1), 1, 100));
      const catalogProductMap = new Map<string, CatalogProductInfo>(
        Array.from({ length: 12 }, (_, i) => [
          `prod-${i + 1}`,
          { code: `P${i + 1}`, description: `P${i + 1}`, categoryDescription: "Cat", stockQuantity: 1, retailSalePrice: 100, effectiveCost: 50 },
        ]),
      );

      const res = calculateProductsOverview({
        ...defaultParams,
        movements,
        catalogProductMap,
        commercialRevenue: 1200,
      });

      expect(res.summary.top10RevenueShare).toBe(83.33);

      // Receita total zero
      const resZero = calculateProductsOverview({
        ...defaultParams,
        movements: [makeMovement("1", 1, 0)],
        catalogProductMap,
        commercialRevenue: 0,
      });
      expect(resZero.summary.top10RevenueShare).toBe(0);
    });

    it("Curva ABC: aplica limites 80/95, item atravessando fronteira, receita zero/negativa", () => {
      // Total R$ 100:
      // Item 1: 75 -> prevShare 0 < 80 -> A (acumulado vai a 75)
      // Item 2: 10 -> prevShare 75 < 80 -> A (atravessa 80, acumulado vai a 85)
      // Item 3: 10 -> prevShare 85 (80 <= prev < 95) -> B (atravessa 95, acumulado vai a 95)
      // Item 4: 5  -> prevShare 95 (>= 95) -> C
      // Item 5: 0  -> receita zero -> null
      const movements = [
        makeMovement("1", 1, 75),
        makeMovement("2", 1, 10),
        makeMovement("3", 1, 10),
        makeMovement("4", 1, 5),
        makeMovement("5", 1, 0),
      ];
      const catalogProductMap = new Map<string, CatalogProductInfo>([
        ["prod-1", { code: "P1", description: "P1", categoryDescription: "Cat", stockQuantity: 1, retailSalePrice: 100, effectiveCost: 10 }],
        ["prod-2", { code: "P2", description: "P2", categoryDescription: "Cat", stockQuantity: 1, retailSalePrice: 100, effectiveCost: 10 }],
        ["prod-3", { code: "P3", description: "P3", categoryDescription: "Cat", stockQuantity: 1, retailSalePrice: 100, effectiveCost: 10 }],
        ["prod-4", { code: "P4", description: "P4", categoryDescription: "Cat", stockQuantity: 1, retailSalePrice: 100, effectiveCost: 10 }],
        ["prod-5", { code: "P5", description: "P5", categoryDescription: "Cat", stockQuantity: 1, retailSalePrice: 100, effectiveCost: 10 }],
      ]);

      const res = calculateProductsOverview({
        ...defaultParams,
        movements,
        catalogProductMap,
        commercialRevenue: 100,
      });

      expect(res.topProducts.find((p) => p.sourceProductId === "1")!.abcClass).toBe("A");
      expect(res.topProducts.find((p) => p.sourceProductId === "2")!.abcClass).toBe("A");
      expect(res.topProducts.find((p) => p.sourceProductId === "3")!.abcClass).toBe("B");
      expect(res.topProducts.find((p) => p.sourceProductId === "4")!.abcClass).toBe("C");
      expect(res.topProducts.find((p) => p.sourceProductId === "5")!.abcClass).toBeNull();
    });

    it("Mixes reconciliam 100% de receita e quantidade e shapeSizeMix possui denominador próprio", () => {
      const flatCats: FlatCategoryInfo[] = [
        { sourceId: "root-1", description: "1 - NINECLOUDS", parentSourceId: null },
        { sourceId: "cat-shapes", description: "Shapes", parentSourceId: "root-1" },
        { sourceId: "cat-wheels", description: "Rodas", parentSourceId: "root-1" },
      ];

      const movements = [
        makeMovement("1", 2, 200, "ATACADO"), // Shape 8.0
        makeMovement("2", 3, 300, "VAREJO"),  // Shape 8.25
        makeMovement("3", 5, 500, "ATACADO"), // Roda
      ];

      const catalogProductMap = new Map<string, CatalogProductInfo>([
        ["prod-1", { code: "S80", description: "Shape Nineclouds 8.0", categorySourceId: "cat-shapes", categoryDescription: "Shapes", stockQuantity: 10, retailSalePrice: 100, effectiveCost: 50 }],
        ["prod-2", { code: "S82", description: "Shape Nineclouds 8.25", categorySourceId: "cat-shapes", categoryDescription: "Shapes", stockQuantity: 10, retailSalePrice: 100, effectiveCost: 50 }],
        ["prod-3", { code: "W54", description: "Roda Spitfire 54mm", categorySourceId: "cat-wheels", categoryDescription: "Rodas", stockQuantity: 10, retailSalePrice: 100, effectiveCost: 50 }],
      ]);

      const res = calculateProductsOverview({
        ...defaultParams,
        movements,
        catalogProductMap,
        commercialRevenue: 1000,
        categoriesFlat: flatCats,
      });

      // Total geral: 10 un, R$ 1000
      expect(res.summary.realizedQuantity).toBe(10);
      expect(res.summary.realizedRevenue).toBe(1000);

      // Linha comercial mix reconcilia 100%
      const sumLineRev = res.commercialLineMix.reduce((acc, l) => acc + l.realizedRevenue, 0);
      const sumLineQty = res.commercialLineMix.reduce((acc, l) => acc + l.realizedQuantity, 0);
      expect(sumLineRev).toBe(1000);
      expect(sumLineQty).toBe(10);

      // Categoria mix reconcilia 100%
      const sumCatRev = res.categoryMix.reduce((acc, c) => acc + c.realizedRevenue, 0);
      const sumCatQty = res.categoryMix.reduce((acc, c) => acc + c.realizedQuantity, 0);
      expect(sumCatRev).toBe(1000);
      expect(sumCatQty).toBe(10);

      // Shape size mix contém 8 buckets e reconcilia apenas o universo de Shapes (5 un, R$ 500)
      expect(res.shapeSizeMix).toHaveLength(8);
      const sumShapeRev = res.shapeSizeMix.reduce((acc, s) => acc + s.realizedRevenue, 0);
      const sumShapeQty = res.shapeSizeMix.reduce((acc, s) => acc + s.realizedQuantity, 0);
      expect(sumShapeRev).toBe(500);
      expect(sumShapeQty).toBe(5);

      const bucket80 = res.shapeSizeMix.find((s) => s.size === "8.0")!;
      expect(bucket80.realizedRevenue).toBe(200);
      expect(bucket80.realizedQuantity).toBe(2);
      expect(bucket80.revenueShare).toBe(40); // 200 / 500 * 100
      expect(bucket80.quantityShare).toBe(40); // 2 / 5 * 100

      const bucket82 = res.shapeSizeMix.find((s) => s.size === "8.2")!;
      expect(bucket82.realizedRevenue).toBe(300);
      expect(bucket82.realizedQuantity).toBe(3);
      expect(bucket82.revenueShare).toBe(60); // 300 / 500 * 100
      expect(bucket82.quantityShare).toBe(60); // 3 / 5 * 100
    });

    it("Stock opportunities: separa ruptura de estoque parado sem venda e não contamina topProducts", () => {
      const movements = [
        makeMovement("1", 5, 500), // vendido, estoque 0 -> Ruptura
        makeMovement("2", 3, 300), // vendido, estoque 10 -> OK
      ];

      const catalogProductMap = new Map<string, CatalogProductInfo>([
        ["prod-1", { code: "P1", description: "P1", categoryDescription: "Cat", stockQuantity: 0, retailSalePrice: 100, effectiveCost: 50, active: true }],
        ["prod-2", { code: "P2", description: "P2", categoryDescription: "Cat", stockQuantity: 10, retailSalePrice: 100, effectiveCost: 50, active: true }],
      ]);

      const allActiveCatalogProductsWithStock: CatalogProductInfo[] = [
        { id: "prod-2", sourceId: "2", code: "P2", description: "P2", categoryDescription: "Cat", stockQuantity: 10, retailSalePrice: 100, effectiveCost: 50, active: true },
        { id: "prod-3", sourceId: "3", code: "P3", description: "P3 Parado", categoryDescription: "Cat", stockQuantity: 15, retailSalePrice: 100, effectiveCost: 50, active: true },
        { id: "prod-4", sourceId: "4", code: "P4 Inativo", categoryDescription: "Cat", stockQuantity: 8, retailSalePrice: 100, effectiveCost: 50, active: false }, // inativo: não deve entrar
      ];

      const res = calculateProductsOverview({
        ...defaultParams,
        movements,
        catalogProductMap,
        commercialRevenue: 800,
        allActiveCatalogProductsWithStock,
      });

      // topProducts contém apenas os 2 produtos que venderam
      expect(res.topProducts).toHaveLength(2);
      expect(res.topProducts.map((p) => p.sourceProductId)).toEqual(["1", "2"]);

      // zeroStockWithSales (Ruptura)
      expect(res.stockOpportunities.zeroStockWithSales).toHaveLength(1);
      expect(res.stockOpportunities.zeroStockWithSales[0].sourceProductId).toBe("1");
      expect(res.stockOpportunities.zeroStockWithSales[0].stockQuantity).toBe(0);

      // stockWithoutSales (Ativo com estoque e sem venda)
      expect(res.stockOpportunities.stockWithoutSales).toHaveLength(1);
      expect(res.stockOpportunities.stockWithoutSales[0].sourceProductId).toBe("3");
      expect(res.stockOpportunities.stockWithoutSales[0].stockQuantity).toBe(15);
      expect(res.stockOpportunities.stockWithoutSales[0].realizedQuantity).toBe(0);
    });
  });
});
