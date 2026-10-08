import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { ProductsView } from "./ProductsView";
import type { ProductsOverviewResult } from "../api/bi";

describe("ProductsView — Integração Analítica Completa (Fase 3B)", () => {
  const mockFullData: ProductsOverviewResult = {
    period: { from: "2026-01-01", to: "2026-10-08" },
    summary: {
      realizedRevenue: 323326.48,
      realizedQuantity: 3989,
      distinctProductsSold: 238,
      distinctCustomers: 142,
      activeCatalogProducts: 650,
      productsWithStock: 480,
      productsSoldInPeriod: 238,
      cmvEstimatedCurrentCost: 161663.24,
      grossProfitEstimatedCurrentCost: 161663.24,
      grossMarginEstimatedCurrentCost: 50.0,
      top10RevenueShare: 35.4,
      costCoverage: {
        productsWithCost: 238,
        productsWithoutCost: 0,
        realizedRevenueWithCost: 323326.48,
        realizedRevenueWithoutCost: 0,
        revenueCoveragePercent: 100.0,
      },
    },
    topProducts: [
      {
        productId: "p-1",
        sourceProductId: "101",
        code: "SHP-80-01",
        description: "Shape Nineclouds Maple 8.0 Pro",
        category: "Shapes",
        commercialLine: "NINECLOUDS",
        quantity: 120,
        realizedQuantity: 120,
        grossItemAmount: 36000,
        realizedRevenue: 36000,
        revenueShare: 11.13,
        distinctSales: 45,
        distinctCustomers: 32,
        currentStockQuantity: 15,
        stockQuantity: 15,
        retailSalePrice: 320,
        effectiveCost: 160,
        cmvEstimatedCurrentCost: 19200,
        grossProfitEstimatedCurrentCost: 16800,
        grossMarginEstimatedCurrentCost: 46.67,
        shapeCommercialSize: "8.0",
        abcClass: "A",
      },
      {
        productId: "p-2",
        sourceProductId: "102",
        code: "ROD-54",
        description: "Roda Spitfire F4 54mm",
        category: "Rodas",
        commercialLine: "SPITFIRE",
        quantity: 80,
        realizedQuantity: 80,
        grossItemAmount: 24000,
        realizedRevenue: 24000,
        revenueShare: 7.42,
        distinctSales: 40,
        distinctCustomers: 28,
        currentStockQuantity: 0,
        stockQuantity: 0,
        retailSalePrice: 310,
        effectiveCost: 155,
        cmvEstimatedCurrentCost: 12400,
        grossProfitEstimatedCurrentCost: 11600,
        grossMarginEstimatedCurrentCost: 48.33,
        shapeCommercialSize: null,
        abcClass: "A",
      },
      {
        productId: "p-3",
        sourceProductId: "103",
        code: "SHP-78-01",
        description: "Shape Nineclouds Maple 7.8 Street",
        category: "Shapes",
        commercialLine: "NINECLOUDS",
        quantity: 50,
        realizedQuantity: 50,
        grossItemAmount: 15000,
        realizedRevenue: 15000,
        revenueShare: 4.64,
        distinctSales: 25,
        distinctCustomers: 20,
        currentStockQuantity: 8,
        stockQuantity: 8,
        retailSalePrice: 320,
        effectiveCost: 160,
        cmvEstimatedCurrentCost: 8000,
        grossProfitEstimatedCurrentCost: 7000,
        grossMarginEstimatedCurrentCost: 46.67,
        shapeCommercialSize: "7.8",
        abcClass: "B",
      },
    ],
    categories: [
      {
        category: "Shapes",
        quantity: 800,
        realizedQuantity: 800,
        realizedRevenue: 200000,
        distinctProducts: 80,
        shareOfRevenue: 61.86,
      },
      {
        category: "Rodas",
        quantity: 400,
        realizedQuantity: 400,
        realizedRevenue: 123326.48,
        distinctProducts: 40,
        shareOfRevenue: 38.14,
      },
    ],
    categoryMix: [
      {
        category: "Shapes",
        label: "Shapes",
        quantity: 800,
        realizedQuantity: 800,
        realizedRevenue: 200000,
        distinctProducts: 80,
        shareOfRevenue: 61.86,
        revenueShare: 61.86,
        quantityShare: 55.0,
      },
      {
        category: "Rodas",
        label: "Rodas",
        quantity: 400,
        realizedQuantity: 400,
        realizedRevenue: 123326.48,
        distinctProducts: 40,
        shareOfRevenue: 38.14,
        revenueShare: 38.14,
        quantityShare: 45.0,
      },
    ],
    commercialLineMix: [
      {
        label: "NINECLOUDS",
        realizedRevenue: 200000,
        realizedQuantity: 800,
        revenueShare: 61.86,
        quantityShare: 55.0,
        distinctProducts: 80,
      },
      {
        label: "SPITFIRE",
        realizedRevenue: 123326.48,
        realizedQuantity: 400,
        revenueShare: 38.14,
        quantityShare: 45.0,
        distinctProducts: 40,
      },
    ],
    shapeSizeMix: [
      {
        size: "7.7",
        label: "7.7",
        realizedRevenue: 25000,
        realizedQuantity: 100,
        revenueShare: 12.5,
        quantityShare: 12.5,
        distinctProducts: 10,
      },
      {
        size: "7.8",
        label: "7.8",
        realizedRevenue: 35000,
        realizedQuantity: 150,
        revenueShare: 17.5,
        quantityShare: 18.75,
        distinctProducts: 15,
      },
      {
        size: "8.0",
        label: "8.0",
        realizedRevenue: 75000,
        realizedQuantity: 300,
        revenueShare: 37.5,
        quantityShare: 37.5,
        distinctProducts: 30,
      },
      {
        size: "OTHER",
        label: "Outros",
        realizedRevenue: 10000,
        realizedQuantity: 40,
        revenueShare: 5.0,
        quantityShare: 5.0,
        distinctProducts: 4,
      },
      {
        size: "UNCLASSIFIED",
        label: "Não classificado",
        realizedRevenue: 5000,
        realizedQuantity: 20,
        revenueShare: 2.5,
        quantityShare: 2.5,
        distinctProducts: 2,
      },
    ],
    channelMix: [
      {
        channel: "ATACADO",
        quantity: 3000,
        realizedQuantity: 3000,
        realizedRevenue: 250000,
        distinctProducts: 200,
        revenueShare: 77.32,
        quantityShare: 75.2,
      },
      {
        channel: "VAREJO",
        quantity: 989,
        realizedQuantity: 989,
        realizedRevenue: 73326.48,
        distinctProducts: 120,
        revenueShare: 22.68,
        quantityShare: 24.8,
      },
    ],
    stockOpportunities: {
      zeroStockWithSales: [
        {
          productId: "p-2",
          sourceProductId: "102",
          code: "ROD-54",
          description: "Roda Spitfire F4 54mm",
          category: "Rodas",
          commercialLine: "SPITFIRE",
          active: true,
          stockQuantity: 0,
          realizedQuantity: 80,
          realizedRevenue: 24000,
          effectiveCost: 155,
        },
      ],
      stockWithoutSales: [
        {
          productId: "p-99",
          sourceProductId: "199",
          code: "TRK-149",
          description: "Truck Thunder 149mm Hollow Light",
          category: "Trucks",
          commercialLine: "THUNDER",
          active: true,
          stockQuantity: 45,
          realizedQuantity: 0,
          realizedRevenue: 0,
          effectiveCost: 210,
        },
      ],
    },
    reconciliation: {
      commercialRevenue: 323326.48,
      productsRevenue: 323326.48,
      adjustmentAmount: 0,
      adjustments: [],
    },
  };

  describe("A. Contrato e KPIs Executivos", () => {
    it("renders the 4 executive KPI cards with exact business values", () => {
      const html = renderToString(
        <ProductsView
          data={mockFullData}
          isLoading={false}
          error={null}
          onRetry={() => {}}
        />,
      );

      // Card 1: Receita realizada
      expect(html).toContain("Receita realizada");
      expect(html).toContain("323.326,48");

      // Card 2: Unidades vendidas
      expect(html).toContain("Unidades vendidas");
      expect(html).toContain("3.989");
      expect(html).toContain("238");
      expect(html).toContain("SKUs vendidos");
      expect(html).toContain("142");
      expect(html).toContain("clientes compradores");

      // Card 3: Lucro bruto estimado ao custo atual
      expect(html).toContain("Lucro bruto estimado ao custo atual");
      expect(html).toContain("161.663,24");
      expect(html).toContain("Margem bruta estimada:");
      expect(html).toContain("50,0%");
      expect(html).toContain("CMV estimado:");
      expect(html).toContain("Cobertura de custo atual: 100%");

      // Card 4: Concentração Top 10
      expect(html).toContain("Concentração Top 10");
      expect(html).toContain("35,4%");
      expect(html).toContain("Participação dos 10 maiores SKUs no faturamento");

      // Faixa compacta integrada de Catálogo & Estoque
      expect(html).toContain("Catálogo ativo:");
      expect(html).toContain("650");
      expect(html).toContain("Com estoque atualmente:");
      expect(html).toContain("480");
      expect(html).toContain("Vendidos no período:");
    });

    it("renders cost coverage warning and null metrics when cost coverage is incomplete", () => {
      const incompleteData: ProductsOverviewResult = {
        ...mockFullData,
        summary: {
          ...mockFullData.summary,
          cmvEstimatedCurrentCost: null,
          grossProfitEstimatedCurrentCost: null,
          grossMarginEstimatedCurrentCost: null,
          costCoverage: {
            productsWithCost: 200,
            productsWithoutCost: 38,
            realizedRevenueWithCost: 280000,
            realizedRevenueWithoutCost: 43326.48,
            revenueCoveragePercent: 86.6,
          },
        },
      };

      const html = renderToString(
        <ProductsView
          data={incompleteData}
          isLoading={false}
          error={null}
          onRetry={() => {}}
        />,
      );

      expect(html).toContain("Cobertura de custo atual:");
      expect(html).toContain("86,6%");
      expect(html).toContain("38");
      expect(html).toContain("SKUs sem custo");
      expect(html).toContain("43.326,48");
      expect(html).toContain("sem cobertura");
      // Aggregate profit must display dash
      expect(html).toContain("—");
    });
  });

  describe("B. Diagnóstico do Mix (4 Cards Analíticos)", () => {
    it("renders CommercialLine, Category, ShapeSize and Channel mix cards", () => {
      const html = renderToString(
        <ProductsView
          data={mockFullData}
          isLoading={false}
          error={null}
          onRetry={() => {}}
        />,
      );

      // Card 1: Mix por Marca / Linha
      expect(html).toContain("Mix por Marca / Linha");
      expect(html).toContain("NINECLOUDS");
      expect(html).toContain("SPITFIRE");

      // Card 2: Mix por Categoria
      expect(html).toContain("Mix por Categoria");
      expect(html).toContain("Shapes");
      expect(html).toContain("Rodas");

      // Card 3: Shapes por Tamanho
      expect(html).toContain("Shapes por Tamanho");
      expect(html).toContain('7.7"');
      expect(html).toContain('7.8"');
      expect(html).toContain('8.0"');
      expect(html).toContain("Outros");
      expect(html).toContain("Não classificado");

      // Card 4: Mix por Canal
      expect(html).toContain("Mix por Canal");
      expect(html).toContain("Atacado");
      expect(html).toContain("Varejo");
    });
  });

  describe("C. Oportunidades de Estoque (Ruptura & Sem Giro)", () => {
    it("renders zero stock with sales and stock without sales cards", () => {
      const html = renderToString(
        <ProductsView
          data={mockFullData}
          isLoading={false}
          error={null}
          onRetry={() => {}}
        />,
      );

      // Card A: Vendidos no período e sem estoque hoje
      expect(html).toContain("Vendidos no período e sem estoque hoje");
      expect(html).toContain("Roda Spitfire F4 54mm");
      expect(html).toContain("80");
      expect(html).toContain("un vendidas");
      expect(html).toContain("Saldo:");

      // Card B: Estoque atual sem venda no período
      expect(html).toContain("Estoque atual sem venda no período");
      expect(html).toContain("Truck Thunder 149mm Hollow Light");
      expect(html).toContain("45");
      expect(html).toContain("un em estoque");
      expect(html).toContain("Zero saída no período");
    });
  });

  describe("D. Estados de Carregamento e Erro", () => {
    it("renders skeleton state while initial loading", () => {
      const html = renderToString(
        <ProductsView
          data={null}
          isLoading={true}
          error={null}
          onRetry={() => {}}
        />,
      );

      expect(html).toContain("tp-section-skeleton");
      expect(html).toContain("tp-skeleton-card");
    });

    it("renders error state with retry button when fetch fails", () => {
      const html = renderToString(
        <ProductsView
          data={null}
          isLoading={false}
          error="Falha de conexão com o banco"
          onRetry={() => {}}
        />,
      );

      expect(html).toContain("Falha ao consultar indicadores de produtos");
      expect(html).toContain("Falha de conexão com o banco");
      expect(html).toContain("Tentar novamente");
    });
  });
});
