import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { ProductsView } from "./ProductsView";
import type { ProductsOverviewResult } from "../api/bi";

describe("ProductsView — Reorganização em Visões (Fase 3C)", () => {
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

  describe("A. Default = Visão Geral", () => {
    it("opens in Visão Geral with tab aria-selected=true and panel mounted", () => {
      const html = renderToString(
        <ProductsView
          data={mockFullData}
          isLoading={false}
          error={null}
          onRetry={() => {}}
        />,
      );

      // Tab list
      expect(html).toContain('role="tablist"');
      expect(html).toContain('id="tab-products-overview"');
      expect(html).toContain('aria-selected="true"');
      expect(html).toContain('id="panel-products-overview"');
      expect(html).toContain('aria-labelledby="tab-products-overview"');
    });
  });

  describe("B. Conteúdo da Visão Geral", () => {
    it("renders the 4 commercial KPIs, catalog context strip and compact highlights", () => {
      const html = renderToString(
        <ProductsView
          data={mockFullData}
          isLoading={false}
          error={null}
          onRetry={() => {}}
          initialTab="overview"
        />,
      );

      // KPI 1: Receita realizada
      expect(html).toContain("Receita realizada");
      expect(html).toContain("323.326,48");

      // KPI 2: Unidades vendidas
      expect(html).toContain("Unidades vendidas");
      expect(html).toContain("3.989");
      expect(html).toContain("142");
      expect(html).toContain("clientes compradores");

      // KPI 3: SKUs vendidos
      expect(html).toContain("SKUs vendidos");
      expect(html).toContain("238");
      expect(html).toContain("650");
      expect(html).toContain("ativos no catálogo");

      // KPI 4: Concentração Top 10
      expect(html).toContain("Concentração Top 10");
      expect(html).toContain("35,4%");
      expect(html).toContain("Participação dos 10 maiores SKUs no faturamento");

      // Faixa compacta de Catálogo & Estoque
      expect(html).toContain("Catálogo ativo:");
      expect(html).toContain("650");
      expect(html).toContain("Com estoque atualmente:");
      expect(html).toContain("480");
      expect(html).toContain("Vendidos no período:");
      expect(html).toContain("238");

      // Destaques do período (Mix)
      expect(html).toContain("Destaques do período");
      expect(html).toContain("Marca / Linha líder");
      expect(html).toContain("NINECLOUDS");
      expect(html).toContain("61,9% do faturamento");

      expect(html).toContain("Categoria líder");
      expect(html).toContain("Shapes");

      expect(html).toContain("Shape líder");
      expect(html).toContain('8.0&quot;');
      expect(html).toContain("37,5% do volume de shapes");

      expect(html).toContain("Canal líder");
      expect(html).toContain("Atacado");
      expect(html).toContain("77,3% do faturamento");

      // Link para ver análise detalhada de Mix
      expect(html).toContain("Ver análise de Mix");
    });
  });

  describe("C. Visão Geral NÃO renderiza componentes longos", () => {
    it("does NOT render full ranking table, full mix cards or stock radars in overview", () => {
      const html = renderToString(
        <ProductsView
          data={mockFullData}
          isLoading={false}
          error={null}
          onRetry={() => {}}
          initialTab="overview"
        />,
      );

      // Ranking table not in overview
      expect(html).not.toContain("Ranking Analítico de Produtos");
      expect(html).not.toContain("tp-analytical-table");

      // Mix 3-col section not in overview
      expect(html).not.toContain("Diagnóstico do Mix de Produtos");
      expect(html).not.toContain("tp-products-mix-grid");

      // Radars not in overview
      expect(html).not.toContain("Oportunidades de Estoque");
      expect(html).not.toContain("Vendidos no período e sem estoque hoje");
      expect(html).not.toContain("Estoque atual sem venda no período");

      // Profit KPI must NOT be primary in Produtos Visão Geral
      expect(html).not.toContain("Lucro bruto estimado ao custo atual");
    });
  });

  describe("D. Visão Ranking Isolada", () => {
    it("renders TopProductsCard at the top and does not render Mix or Radars", () => {
      const html = renderToString(
        <ProductsView
          data={mockFullData}
          isLoading={false}
          error={null}
          onRetry={() => {}}
          initialTab="ranking"
        />,
      );

      expect(html).toContain('id="panel-products-ranking"');
      expect(html).toContain("Ranking Analítico de Produtos");
      expect(html).toContain("Shape Nineclouds Maple 8.0 Pro");
      expect(html).toContain("Roda Spitfire F4 54mm");

      // Does not render other views' content
      expect(html).not.toContain("Diagnóstico do Mix de Produtos");
      expect(html).not.toContain("Destaques do período");
      expect(html).not.toContain("Oportunidades de Estoque");
    });
  });

  describe("E. Visão Mix Isolada", () => {
    it("renders the 3-column mix layout polished in 3B.5 and does not render Ranking or Radars", () => {
      const html = renderToString(
        <ProductsView
          data={mockFullData}
          isLoading={false}
          error={null}
          onRetry={() => {}}
          initialTab="mix"
        />,
      );

      expect(html).toContain('id="panel-products-mix"');
      expect(html).toContain("Diagnóstico do Mix de Produtos");
      expect(html).toContain("Mix por Marca / Linha");
      expect(html).toContain("Mix por Canal");
      expect(html).toContain("Mix por Categoria");
      expect(html).toContain("Shapes por Tamanho");

      // Does not render Ranking or Radars
      expect(html).not.toContain("Ranking Analítico de Produtos");
      expect(html).not.toContain("Oportunidades de Estoque");
      expect(html).not.toContain("Destaques do período");
    });
  });

  describe("F. Visão Oportunidades Isolada", () => {
    it("renders the 2 stock radars side-by-side and does not render Mix or Ranking", () => {
      const html = renderToString(
        <ProductsView
          data={mockFullData}
          isLoading={false}
          error={null}
          onRetry={() => {}}
          initialTab="opportunities"
        />,
      );

      expect(html).toContain('id="panel-products-opportunities"');
      expect(html).toContain("Oportunidades de Estoque");
      expect(html).toContain("Vendidos no período e sem estoque hoje");
      expect(html).toContain("Estoque atual sem venda no período");
      expect(html).toContain("Roda Spitfire F4 54mm");
      expect(html).toContain("Truck Thunder 149mm Hollow Light");

      // Does not render Mix or Ranking
      expect(html).not.toContain("Ranking Analítico de Produtos");
      expect(html).not.toContain("Diagnóstico do Mix de Produtos");
      expect(html).not.toContain("Destaques do período");
    });
  });

  describe("G. Troca de Visão e Isolamento de Chamadas", () => {
    it("preserves onRetry callback and does not invoke it during view rendering", () => {
      const onRetryMock = vi.fn();
      renderToString(
        <ProductsView
          data={mockFullData}
          isLoading={false}
          error={null}
          onRetry={onRetryMock}
          initialTab="overview"
        />,
      );
      renderToString(
        <ProductsView
          data={mockFullData}
          isLoading={false}
          error={null}
          onRetry={onRetryMock}
          initialTab="ranking"
        />,
      );
      renderToString(
        <ProductsView
          data={mockFullData}
          isLoading={false}
          error={null}
          onRetry={onRetryMock}
          initialTab="mix"
        />,
      );
      renderToString(
        <ProductsView
          data={mockFullData}
          isLoading={false}
          error={null}
          onRetry={onRetryMock}
          initialTab="opportunities"
        />,
      );

      expect(onRetryMock).not.toHaveBeenCalled();
    });
  });

  describe("H. Atualização de Dados e Período", () => {
    it("updates KPI values correctly when receiving fresh period data", () => {
      const updatedData: ProductsOverviewResult = {
        ...mockFullData,
        summary: {
          ...mockFullData.summary,
          realizedRevenue: 500000,
          realizedQuantity: 6000,
        },
      };

      const html = renderToString(
        <ProductsView
          data={updatedData}
          isLoading={false}
          error={null}
          onRetry={() => {}}
          initialTab="overview"
        />,
      );

      expect(html).toContain("500.000,00");
      expect(html).toContain("6.000");
    });
  });

  describe("I. Labels de Shape com Aspas Únicas", () => {
    it("formats shape size labels without duplicated quotes across views", () => {
      const htmlOverview = renderToString(
        <ProductsView
          data={mockFullData}
          isLoading={false}
          error={null}
          onRetry={() => {}}
          initialTab="overview"
        />,
      );
      // In overview top shape (rendered as HTML entity &quot;)
      expect(htmlOverview).toContain('8.0&quot;');
      expect(htmlOverview).not.toContain('8.0&quot;&quot;');

      const htmlMix = renderToString(
        <ProductsView
          data={mockFullData}
          isLoading={false}
          error={null}
          onRetry={() => {}}
          initialTab="mix"
        />,
      );
      expect(htmlMix).toContain('7.7&quot;');
      expect(htmlMix).toContain('7.8&quot;');
      expect(htmlMix).toContain('8.0&quot;');
      expect(htmlMix).not.toContain('7.7&quot;&quot;');
      expect(htmlMix).not.toContain('7.8&quot;&quot;');
      expect(htmlMix).not.toContain('8.0&quot;&quot;');
      expect(htmlMix).toContain("Outros");
      expect(htmlMix).toContain("Não classificado");
    });
  });

  describe("J. Ranking Mantém Filtros e Paginação", () => {
    it("renders search input, filter selects and pagination controls in Ranking view", () => {
      const html = renderToString(
        <ProductsView
          data={mockFullData}
          isLoading={false}
          error={null}
          onRetry={() => {}}
          initialTab="ranking"
        />,
      );

      expect(html).toContain("Buscar produto ou código...");
      expect(html).toContain("Todas as marcas/linhas");
      expect(html).toContain("Todas as categorias");
      expect(html).toContain("Todos os shapes");
      expect(html).toContain("Todas as classes ABC");
    });
  });

  describe("K. Estados de Carregamento, Erro e Reconciliação", () => {
    it("renders skeleton tabs and cards during initial load", () => {
      const html = renderToString(
        <ProductsView
          data={null}
          isLoading={true}
          error={null}
          onRetry={() => {}}
        />,
      );

      expect(html).toContain("tp-products-nav-tabs-skeleton");
      expect(html).toContain("tp-skeleton-tab-item");
      expect(html).toContain("tp-section-skeleton");
    });

    it("renders error state with retry button when error occurs without cached data", () => {
      const html = renderToString(
        <ProductsView
          data={null}
          isLoading={false}
          error="Falha de conexão com a API"
          onRetry={() => {}}
        />,
      );

      expect(html).toContain("Falha ao consultar indicadores de produtos");
      expect(html).toContain("Falha de conexão com a API");
      expect(html).toContain("Tentar novamente");
    });

    it("renders global reconciliation banner when adjustment > 0", () => {
      const reconciledData: ProductsOverviewResult = {
        ...mockFullData,
        reconciliation: {
          commercialRevenue: 323326.48,
          productsRevenue: 320000.0,
          adjustmentAmount: 3326.48,
          adjustments: [
            {
              type: "DOCUMENT_EXCLUSION",
              sourceDocumentId: "ord-1",
              sourceId: "1314",
              reason: "Divergência documental",
              amount: 3326.48,
            },
          ],
        },
      };

      const html = renderToString(
        <ProductsView
          data={reconciledData}
          isLoading={false}
          error={null}
          onRetry={() => {}}
          initialTab="overview"
        />,
      );

      expect(html).toContain("Aviso de Reconciliação Histórica");
      expect(html).toContain("Ajuste histórico identificado");
      expect(html).toContain("3.326,48");
    });
  });
});
