import { describe, expect, it } from "vitest";
import {
  classifyMarginTier,
  resolvePredominantChannel,
  calculateProfitabilityProducts,
  calculateProfitabilitySales,
  calculateProfitabilityCustomers,
  calculateProfitabilityOverview,
  type CatalogProductProfitabilityInfo,
  type FlatCategoryInfo,
} from "../src/modules/bi/bi-profitability-calculator.js";
import type {
  CategoryTreeNode,
  RealizedProductMovement,
  BiSaleMetadata,
  BiDocumentMetadata,
  BiCustomerMetadata,
  ProfitabilityCostSnapshot,
} from "../src/modules/bi/bi-types.js";

describe("Profitability BI V1 — Fase 4C Testes Avançados e Canônicos", () => {
  const sampleFlatCategories: FlatCategoryInfo[] = [
    { sourceId: "1", description: "HARDGOODS", parentSourceId: null },
    { sourceId: "11", description: "SHAPES", parentSourceId: "1" },
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
          childrenCount: 0,
          children: [],
        },
      ],
    },
  ];

  const costSnapshot: ProfitabilityCostSnapshot = {
    asOf: new Date("2026-10-09T00:00:00.000Z"),
    lastProductSyncAt: new Date("2026-10-09T00:00:00.000Z"),
    lastProductSyncStatus: "SUCCESS",
    totalCatalogProducts: 10,
    productsWithCostCount: 9,
    productsWithoutCostCount: 1,
  };

  // N. Classificação de faixas de margem (classifyMarginTier)
  describe("N & M & L: Classificação de faixas de margem (classifyMarginTier)", () => {
    it("deve classificar faixas de margem estritamente conforme o contrato", () => {
      // null -> UNKNOWN
      expect(classifyMarginTier(null)).toBe("UNKNOWN");
      expect(classifyMarginTier(undefined)).toBe("UNKNOWN");

      // < 0 -> NEGATIVE
      expect(classifyMarginTier(-0.01)).toBe("NEGATIVE");
      expect(classifyMarginTier(-10)).toBe("NEGATIVE");

      // 0 <= margin < 20 -> ZERO_TO_20
      expect(classifyMarginTier(0)).toBe("ZERO_TO_20");
      expect(classifyMarginTier(19.999)).toBe("ZERO_TO_20");

      // 20 <= margin < 40 -> TWENTY_TO_40
      expect(classifyMarginTier(20)).toBe("TWENTY_TO_40");
      expect(classifyMarginTier(39.999)).toBe("TWENTY_TO_40");

      // >= 40 -> FORTY_PLUS
      expect(classifyMarginTier(40)).toBe("FORTY_PLUS");
      expect(classifyMarginTier(85.5)).toBe("FORTY_PLUS");
    });
  });

  // K. Canal predominante do cliente (resolvePredominantChannel)
  describe("K: Resolução determinística do canal predominante", () => {
    it("deve escolher o canal de maior receita", () => {
      const channel = resolvePredominantChannel([
        { channel: "ATACADO", revenue: 100, quantity: 10 },
        { channel: "VAREJO", revenue: 200, quantity: 2 },
      ]);
      expect(channel).toBe("VAREJO");
    });

    it("em empate de receita, deve desempatar pela maior quantidade realizada", () => {
      const channel = resolvePredominantChannel([
        { channel: "ATACADO", revenue: 500, quantity: 50 },
        { channel: "VAREJO", revenue: 500, quantity: 20 },
      ]);
      expect(channel).toBe("ATACADO");
    });

    it("em empate de receita e quantidade, deve desempatar pela prioridade ATACADO > VAREJO > INDETERMINADO > CONFLITO", () => {
      // ATACADO vs VAREJO
      expect(
        resolvePredominantChannel([
          { channel: "VAREJO", revenue: 300, quantity: 15 },
          { channel: "ATACADO", revenue: 300, quantity: 15 },
        ]),
      ).toBe("ATACADO");

      // VAREJO vs INDETERMINADO
      expect(
        resolvePredominantChannel([
          { channel: "INDETERMINADO", revenue: 300, quantity: 15 },
          { channel: "VAREJO", revenue: 300, quantity: 15 },
        ]),
      ).toBe("VAREJO");

      // INDETERMINADO vs CONFLITO
      expect(
        resolvePredominantChannel([
          { channel: "CONFLITO", revenue: 300, quantity: 15 },
          { channel: "INDETERMINADO", revenue: 300, quantity: 15 },
        ]),
      ).toBe("INDETERMINADO");
    });

    it("se lista vazia, retorna INDETERMINADO", () => {
      expect(resolvePredominantChannel([])).toBe("INDETERMINADO");
    });
  });

  // A, B, C, D: Tratamento de movimentos canônicos em Vendas
  describe("A, B, C, D, I, J: Movimentos canônicos em Vendas e Datas de Realização", () => {
    it("A, B, C, D: Agrupa NFE + VS sem duplicação e trata complemento financeiro com quantity=0 e residual físico", () => {
      const catalogMap = new Map<string, CatalogProductProfitabilityInfo>();
      catalogMap.set("101", {
        id: "p1",
        sourceId: "101",
        code: "SKU1",
        description: "Shape Maple",
        categorySourceId: "11",
        categoryDescription: "SHAPES",
        effectiveCost: 50,
      });

      const movements: RealizedProductMovement[] = [
        // A & D: NFE principal
        {
          productId: "p1",
          sourceProductId: "101",
          quantity: 2,
          grossItemAmount: 200,
          allocationBaseAmount: 200,
          allocatedNetRevenue: 200,
          realizedDate: new Date("2026-05-10T12:00:00.000Z"),
          channel: "VAREJO",
          saleId: "sale-1",
          sourceDocumentType: "NFE" as any,
          sourceDocumentId: "nfe-100",
          customerId: "cust-1",
          origin: "DIRECT_NFE",
        },
        // B: Residual físico (ex: entrega residual ou VS complementar)
        {
          productId: "p1",
          sourceProductId: "101",
          quantity: 1,
          grossItemAmount: 100,
          allocationBaseAmount: 100,
          allocatedNetRevenue: 100,
          realizedDate: new Date("2026-05-12T12:00:00.000Z"),
          channel: "VAREJO",
          saleId: "sale-1",
          sourceDocumentType: "PEDIDO_VENDA" as any,
          sourceDocumentId: "vs-200",
          customerId: "cust-1",
          origin: "ORDER_PHYSICAL_RESIDUAL",
        },
        // C: Complemento financeiro com quantity = 0: receita preservada, CMV adicional = 0
        {
          productId: "p1",
          sourceProductId: "101",
          quantity: 0,
          grossItemAmount: 30,
          allocationBaseAmount: 30,
          allocatedNetRevenue: 30,
          realizedDate: new Date("2026-05-12T12:00:00.000Z"),
          channel: "VAREJO",
          saleId: "sale-1",
          sourceDocumentType: "PEDIDO_VENDA" as any,
          sourceDocumentId: "vs-200",
          customerId: "cust-1",
          origin: "PEDIDO_FINANCIAL_COMPLEMENT_NFE",
        },
      ];

      const salesMetadataMap = new Map<string, BiSaleMetadata>([
        [
          "sale-1",
          {
            saleId: "sale-1",
            anchorType: "PEDIDO_VENDA",
            anchorSourceId: "vs-200",
            customerId: "cust-1",
            commercialDate: "2026-05-01",
          },
        ],
      ]);

      const documentsMetadataMap = new Map<string, BiDocumentMetadata>([
        [
          "nfe-100",
          {
            sourceId: "nfe-100",
            docType: "NFE",
            sourcePresent: true,
            issueDate: "2026-05-10",
          },
        ],
        [
          "vs-200",
          {
            sourceId: "vs-200",
            docType: "PEDIDO_VENDA",
            sourcePresent: true,
            issueDate: "2026-05-12",
          },
        ],
      ]);

      const customersMetadataMap = new Map<string, BiCustomerMetadata>([
        [
          "cust-1",
          {
            customerId: "cust-1",
            customerName: "Skatista Pro Shop",
            tradeName: "Pro Shop",
            legalName: "Pro Shop LTDA",
            cpf: null,
            cnpj: "12.345.678/0001-90",
          },
        ],
      ]);

      const res = calculateProfitabilitySales({
        movements,
        catalogProductsMap: catalogMap,
        salesMetadataMap,
        documentsMetadataMap,
        customersMetadataMap,
        period: { from: "2026-05-01", to: "2026-05-31" },
        filters: {},
      });

      expect(res.sales).toHaveLength(1);
      const sale = res.sales[0];

      // Quantidade total realizada = 2 + 1 + 0 = 3
      expect(sale.realizedQuantity).toBe(3);
      // Receita realizada total = 200 + 100 + 30 = 330
      expect(sale.realizedRevenue).toBe(330);
      // Custo unitário = 50. Quantidade com custo = 3 (ou 2+1+0).
      // CMV = 2 * 50 + 1 * 50 + 0 * 50 = 150!
      // Complemento financeiro com quantity=0 preservou receita (30) e gerou CMV adicional = 0.
      expect(sale.estimatedCOGS).toBe(150);
      expect(sale.estimatedGrossProfit).toBe(180); // 330 - 150 = 180
      expect(sale.estimatedGrossMarginPercent).toBe(54.55); // 180 / 330 * 100 = 54.545... -> 54.55%
      expect(sale.costCoveragePercent).toBe(100);

      // I: firstRealizedDate e lastRealizedDate
      expect(sale.firstRealizedDate).toBe("2026-05-10");
      expect(sale.lastRealizedDate).toBe("2026-05-12");

      // Documentos realizadores (deve conter ambos nfe-100 e vs-200 sem duplicações indevidas)
      expect(sale.realizingDocuments).toHaveLength(2);
      expect(sale.realizingDocuments.map((d) => d.sourceId)).toEqual(
        expect.arrayContaining(["nfe-100", "vs-200"]),
      );
    });

    it("J: Sale parcialmente dentro do período considera apenas movimentos no intervalo", () => {
      const catalogMap = new Map<string, CatalogProductProfitabilityInfo>();
      catalogMap.set("101", {
        id: "p1",
        sourceId: "101",
        code: "SKU1",
        description: "Shape Maple",
        categorySourceId: "11",
        categoryDescription: "SHAPES",
        effectiveCost: 50,
      });

      // Movimentos com datas diferentes
      const movements: RealizedProductMovement[] = [
        {
          productId: "p1",
          sourceProductId: "101",
          quantity: 2,
          grossItemAmount: 200,
          allocationBaseAmount: 200,
          allocatedNetRevenue: 200,
          realizedDate: new Date("2026-04-20T12:00:00.000Z"), // FORA do período de Maio
          channel: "VAREJO",
          saleId: "sale-multi",
          sourceDocumentType: "PEDIDO_VENDA" as any,
          sourceDocumentId: "vs-1",
          customerId: "cust-1",
          origin: "DIRECT_VENDA_SIMPLES",
        },
        {
          productId: "p1",
          sourceProductId: "101",
          quantity: 3,
          grossItemAmount: 300,
          allocationBaseAmount: 300,
          allocatedNetRevenue: 300,
          realizedDate: new Date("2026-05-15T12:00:00.000Z"), // DENTRO do período de Maio
          channel: "VAREJO",
          saleId: "sale-multi",
          sourceDocumentType: "NFE" as any,
          sourceDocumentId: "nfe-2",
          customerId: "cust-1",
          origin: "DIRECT_NFE",
        },
      ];

      const res = calculateProfitabilitySales({
        movements,
        catalogProductsMap: catalogMap,
        salesMetadataMap: new Map(),
        documentsMetadataMap: new Map(),
        customersMetadataMap: new Map(),
        period: { from: "2026-05-01", to: "2026-05-31" },
        filters: {},
      });

      expect(res.sales).toHaveLength(1);
      const sale = res.sales[0];
      // Apenas o movimento de 2026-05-15 deve ser computado
      expect(sale.realizedQuantity).toBe(3);
      expect(sale.realizedRevenue).toBe(300);
      expect(sale.estimatedCOGS).toBe(150);
      expect(sale.firstRealizedDate).toBe("2026-05-15");
      expect(sale.lastRealizedDate).toBe("2026-05-15");
    });
  });

  // F & G: Produto sem custo vs effectiveCost = 0
  describe("F & G: Tratamento de custos nulos vs effectiveCost = 0", () => {
    it("G: effectiveCost = 0 é reconhecido como custo conhecido (cobertura 100%, CMV = 0, lucro = receita)", () => {
      const catalogMap = new Map<string, CatalogProductProfitabilityInfo>();
      catalogMap.set("101", {
        id: "p1",
        sourceId: "101",
        code: "BRINDE",
        description: "Adesivo Brinde (custo zero)",
        categorySourceId: "11",
        categoryDescription: "SHAPES",
        effectiveCost: 0, // Custo conhecido de 0 reais
      });

      const movements: RealizedProductMovement[] = [
        {
          productId: "p1",
          sourceProductId: "101",
          quantity: 10,
          grossItemAmount: 100,
          allocationBaseAmount: 100,
          allocatedNetRevenue: 100,
          realizedDate: new Date("2026-06-01T12:00:00.000Z"),
          channel: "VAREJO",
          saleId: "s1",
          sourceDocumentType: "NFE" as any,
          sourceDocumentId: "doc1",
          customerId: "c1",
          origin: "DIRECT_NFE",
        },
      ];

      const res = calculateProfitabilityProducts({
        movements,
        catalogProductsMap: catalogMap,
        categoriesFlat: sampleFlatCategories,
        categoryTree: sampleCategoryTree,
        period: { from: "2026-06-01", to: "2026-06-30" },
        filters: {},
      });

      expect(res.products).toHaveLength(1);
      const item = res.products[0];
      expect(item.currentEffectiveCost).toBe(0);
      expect(item.revenueWithCurrentCost).toBe(100);
      expect(item.revenueWithoutCurrentCost).toBe(0);
      expect(item.costCoveragePercent).toBe(100);
      expect(item.estimatedCOGS).toBe(0);
      expect(item.estimatedGrossProfit).toBe(100);
      expect(item.estimatedGrossMarginPercent).toBe(100);
      expect(item.marginTier).toBe("FORTY_PLUS");
    });

    it("F: Produto sem custo (effectiveCost = null) gera cobertura 0%, CMV = null, lucro = null, tier = UNKNOWN", () => {
      const catalogMap = new Map<string, CatalogProductProfitabilityInfo>();
      catalogMap.set("102", {
        id: "p2",
        sourceId: "102",
        code: "SEM-CUSTO",
        description: "Produto Sem Custo",
        categorySourceId: "11",
        categoryDescription: "SHAPES",
        effectiveCost: null,
      });

      const movements: RealizedProductMovement[] = [
        {
          productId: "p2",
          sourceProductId: "102",
          quantity: 5,
          grossItemAmount: 500,
          allocationBaseAmount: 500,
          allocatedNetRevenue: 500,
          realizedDate: new Date("2026-06-01T12:00:00.000Z"),
          channel: "VAREJO",
          saleId: "s2",
          sourceDocumentType: "NFE" as any,
          sourceDocumentId: "doc2",
          customerId: "c1",
          origin: "DIRECT_NFE",
        },
      ];

      const res = calculateProfitabilityProducts({
        movements,
        catalogProductsMap: catalogMap,
        categoriesFlat: sampleFlatCategories,
        categoryTree: sampleCategoryTree,
        period: { from: "2026-06-01", to: "2026-06-30" },
        filters: {},
      });

      expect(res.products).toHaveLength(1);
      const item = res.products[0];
      expect(item.currentEffectiveCost).toBeNull();
      expect(item.realizedRevenue).toBe(500);
      expect(item.revenueWithCurrentCost).toBe(0);
      expect(item.revenueWithoutCurrentCost).toBe(500);
      expect(item.costCoveragePercent).toBe(0);
      expect(item.estimatedCOGS).toBeNull();
      expect(item.estimatedGrossProfit).toBeNull();
      expect(item.estimatedGrossMarginPercent).toBeNull();
      expect(item.marginTier).toBe("UNKNOWN");
    });
  });

  // H: Tratamento de customerId = null (Bucket "Cliente não identificado")
  describe("H: Bucket 'Cliente não identificado' para customerId = null", () => {
    it("deve agrupar movimentos sem customerId na entidade sintética sem descartá-los", () => {
      const catalogMap = new Map<string, CatalogProductProfitabilityInfo>();
      catalogMap.set("101", {
        id: "p1",
        sourceId: "101",
        code: "SKU1",
        description: "Produto P1",
        categorySourceId: "11",
        categoryDescription: "SHAPES",
        effectiveCost: 20,
      });

      const movements: RealizedProductMovement[] = [
        {
          productId: "p1",
          sourceProductId: "101",
          quantity: 5,
          grossItemAmount: 250,
          allocationBaseAmount: 250,
          allocatedNetRevenue: 250,
          realizedDate: new Date("2026-07-01T12:00:00.000Z"),
          channel: "VAREJO",
          saleId: "s-null-1",
          sourceDocumentType: "NFE" as any,
          sourceDocumentId: "doc-1",
          customerId: null, // sem cliente
          origin: "DIRECT_NFE",
        },
        {
          productId: "p1",
          sourceProductId: "101",
          quantity: 3,
          grossItemAmount: 150,
          allocationBaseAmount: 150,
          allocatedNetRevenue: 150,
          realizedDate: new Date("2026-07-05T12:00:00.000Z"),
          channel: "VAREJO",
          saleId: "s-null-2",
          sourceDocumentType: "NFE" as any,
          sourceDocumentId: "doc-2",
          customerId: null, // sem cliente
          origin: "DIRECT_NFE",
        },
        {
          productId: "p1",
          sourceProductId: "101",
          quantity: 10,
          grossItemAmount: 600,
          allocationBaseAmount: 600,
          allocatedNetRevenue: 600,
          realizedDate: new Date("2026-07-02T12:00:00.000Z"),
          channel: "ATACADO",
          saleId: "s-identified",
          sourceDocumentType: "NFE" as any,
          sourceDocumentId: "doc-3",
          customerId: "cust-real",
          origin: "DIRECT_NFE",
        },
      ];

      const customersMetadataMap = new Map<string, BiCustomerMetadata>([
        [
          "cust-real",
          {
            customerId: "cust-real",
            customerName: "Cliente Real",
            tradeName: null,
            legalName: null,
            cpf: null,
            cnpj: null,
          },
        ],
      ]);

      const res = calculateProfitabilityCustomers({
        movements,
        catalogProductsMap: catalogMap,
        customersMetadataMap,
        period: { from: "2026-07-01", to: "2026-07-31" },
        filters: {},
      });

      expect(res.customers).toHaveLength(2);

      const unident = res.customers.find((c) => c.customerId === null);
      expect(unident).toBeDefined();
      expect(unident?.customerName).toBe("Cliente não identificado");
      expect(unident?.realizedSales).toBe(2); // s-null-1 e s-null-2
      expect(unident?.realizedRevenue).toBe(400); // 250 + 150
      expect(unident?.estimatedCOGS).toBe(160); // (5+3) * 20 = 160
      expect(unident?.estimatedGrossProfit).toBe(240); // 400 - 160
      expect(unident?.ticketAverage).toBe(200); // 400 / 2

      // Reconciliação do summary de clientes com a soma dos clientes
      const sumRevenue = res.customers.reduce((acc, c) => acc + c.realizedRevenue, 0);
      expect(sumRevenue).toBe(res.summary.realizedRevenue);
      expect(res.summary.realizedRevenue).toBe(1000);
      expect(res.summary.estimatedCOGS).toBe(360);
      expect(res.summary.estimatedGrossProfit).toBe(640);
    });
  });

  // O. Reconciliação ao centavo entre Products, Sales e Customers
  describe("O: Reconciliação multi-entidade ao centavo", () => {
    it("deve reconciliar perfeitamente Revenue, COGS e Gross Profit entre Products, Sales e Customers", () => {
      const catalogMap = new Map<string, CatalogProductProfitabilityInfo>();
      catalogMap.set("101", {
        id: "p1",
        sourceId: "101",
        code: "SKU1",
        description: "Produto 1",
        categorySourceId: "11",
        categoryDescription: "SHAPES",
        effectiveCost: 45.5,
      });
      catalogMap.set("102", {
        id: "p2",
        sourceId: "102",
        code: "SKU2",
        description: "Produto 2",
        categorySourceId: "11",
        categoryDescription: "SHAPES",
        effectiveCost: 12.3,
      });

      const movements: RealizedProductMovement[] = [
        {
          productId: "p1",
          sourceProductId: "101",
          quantity: 14,
          grossItemAmount: 1250.75,
          allocationBaseAmount: 1250.75,
          allocatedNetRevenue: 1250.75,
          realizedDate: new Date("2026-08-01T12:00:00.000Z"),
          channel: "VAREJO",
          saleId: "s1",
          sourceDocumentType: "NFE" as any,
          sourceDocumentId: "nfe-1",
          customerId: "cust-1",
          origin: "DIRECT_NFE",
        },
        {
          productId: "p2",
          sourceProductId: "102",
          quantity: 25,
          grossItemAmount: 650.25,
          allocationBaseAmount: 650.25,
          allocatedNetRevenue: 650.25,
          realizedDate: new Date("2026-08-01T12:00:00.000Z"),
          channel: "VAREJO",
          saleId: "s1",
          sourceDocumentType: "NFE" as any,
          sourceDocumentId: "nfe-1",
          customerId: "cust-1",
          origin: "DIRECT_NFE",
        },
        {
          productId: "p1",
          sourceProductId: "101",
          quantity: 8,
          grossItemAmount: 720.0,
          allocationBaseAmount: 720.0,
          allocatedNetRevenue: 720.0,
          realizedDate: new Date("2026-08-05T12:00:00.000Z"),
          channel: "ATACADO",
          saleId: "s2",
          sourceDocumentType: "NFE" as any,
          sourceDocumentId: "nfe-2",
          customerId: "cust-2",
          origin: "DIRECT_NFE",
        },
      ];

      const period = { from: "2026-08-01", to: "2026-08-31" };

      const productsResult = calculateProfitabilityProducts({
        movements,
        catalogProductsMap: catalogMap,
        categoriesFlat: sampleFlatCategories,
        categoryTree: sampleCategoryTree,
        period,
        filters: {},
      });

      const salesResult = calculateProfitabilitySales({
        movements,
        catalogProductsMap: catalogMap,
        salesMetadataMap: new Map(),
        documentsMetadataMap: new Map(),
        customersMetadataMap: new Map(),
        period,
        filters: {},
      });

      const customersResult = calculateProfitabilityCustomers({
        movements,
        catalogProductsMap: catalogMap,
        customersMetadataMap: new Map(),
        period,
        filters: {},
      });

      // 1. Revenue
      expect(productsResult.summary.realizedRevenue).toBe(2621.0);
      expect(salesResult.summary.realizedRevenue).toBe(2621.0);
      expect(customersResult.summary.realizedRevenue).toBe(2621.0);

      // 2. COGS
      // p1: 14*45.5 = 637.0 + 8*45.5 = 364.0 = 1001.0
      // p2: 25*12.3 = 307.5
      // Total COGS = 1308.5
      expect(productsResult.summary.estimatedCOGS).toBe(1308.5);
      expect(salesResult.summary.estimatedCOGS).toBe(1308.5);
      expect(customersResult.summary.estimatedCOGS).toBe(1308.5);

      // 3. Gross Profit
      // 2621.0 - 1308.5 = 1312.5
      expect(productsResult.summary.estimatedGrossProfit).toBe(1312.5);
      expect(salesResult.summary.estimatedGrossProfit).toBe(1312.5);
      expect(customersResult.summary.estimatedGrossProfit).toBe(1312.5);

      // 4. Margem
      // 1312.5 / 2621.0 * 100 = 50.0763... -> 50.08
      expect(productsResult.summary.estimatedGrossMarginPercent).toBe(50.08);
      expect(salesResult.summary.estimatedGrossMarginPercent).toBe(50.08);
      expect(customersResult.summary.estimatedGrossMarginPercent).toBe(50.08);

      // 5. Cobertura de custo
      expect(productsResult.summary.costCoveragePercent).toBe(100);
      expect(salesResult.summary.costCoveragePercent).toBe(100);
      expect(customersResult.summary.costCoveragePercent).toBe(100);
    });
  });

  // Overview Highlights
  describe("Overview Highlights", () => {
    it("deve preencher highlights de produtos no overview sem quebrar contrato anterior", () => {
      const catalogMap = new Map<string, CatalogProductProfitabilityInfo>();
      catalogMap.set("101", {
        id: "p1",
        sourceId: "101",
        code: "SKU1",
        description: "Produto Lucrativo",
        categorySourceId: "11",
        categoryDescription: "SHAPES",
        effectiveCost: 10,
      });
      catalogMap.set("102", {
        id: "p2",
        sourceId: "102",
        code: "SKU2",
        description: "Produto Margem Negativa",
        categorySourceId: "11",
        categoryDescription: "SHAPES",
        effectiveCost: 200,
      });

      const movements: RealizedProductMovement[] = [
        {
          productId: "p1",
          sourceProductId: "101",
          quantity: 10,
          grossItemAmount: 1000,
          allocationBaseAmount: 1000,
          allocatedNetRevenue: 1000, // CMV: 100, Lucro: 900, Margem: 90%
          realizedDate: new Date("2026-09-01T12:00:00.000Z"),
          channel: "VAREJO",
          saleId: "s1",
          sourceDocumentType: "NFE" as any,
          sourceDocumentId: "nfe-1",
          customerId: "c1",
          origin: "DIRECT_NFE",
        },
        {
          productId: "p2",
          sourceProductId: "102",
          quantity: 5,
          grossItemAmount: 500,
          allocationBaseAmount: 500,
          allocatedNetRevenue: 500, // CMV: 1000, Lucro: -500, Margem: -100%
          realizedDate: new Date("2026-09-01T12:00:00.000Z"),
          channel: "VAREJO",
          saleId: "s2",
          sourceDocumentType: "NFE" as any,
          sourceDocumentId: "nfe-2",
          customerId: "c2",
          origin: "DIRECT_NFE",
        },
      ];

      const res = calculateProfitabilityOverview({
        movements,
        catalogProductsMap: catalogMap,
        categoriesFlat: sampleFlatCategories,
        categoryTree: sampleCategoryTree,
        period: { from: "2026-09-01", to: "2026-09-30" },
        filters: {},
        costSnapshot,
      });

      // Mantém products[] para retrocompatibilidade
      expect(res.products).toHaveLength(2);

      // Highlights presentes
      expect(res.highlights).toBeDefined();
      expect(res.highlights?.topProfitProducts).toHaveLength(2);
      expect(res.highlights?.topProfitProducts[0].productSourceId).toBe("101");
      expect(res.highlights?.negativeMarginProductsCount).toBe(1);
      expect(res.highlights?.worstMarginProducts).toHaveLength(2);
      expect(res.highlights?.worstMarginProducts[0].productSourceId).toBe("102");
    });
  });
});
