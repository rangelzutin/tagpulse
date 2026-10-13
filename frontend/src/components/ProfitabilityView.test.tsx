import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { ProfitabilityView } from "./ProfitabilityView";
import { ProfitabilityKpiGrid } from "./ProfitabilityKpiGrid";
import { ProfitabilityBreakdowns } from "./ProfitabilityBreakdowns";
import { ProfitabilityOverviewTab } from "./ProfitabilityOverviewTab";
import { ProfitabilityHighlightsCard } from "./ProfitabilityHighlightsCard";
import type {
  ProfitabilityOverviewResult,
  ProfitabilityProductsResult,
  ProfitabilitySalesResult,
  ProfitabilityCustomersResult,
} from "../api/bi";

describe("ProfitabilityView & Subviews (Fase 4D — Arquitetura V1 Completa)", () => {
  const mockProfitabilityOverview: ProfitabilityOverviewResult = {
    period: {
      from: "2026-01-01",
      to: "2026-10-08",
    },
    filters: {
      channel: null,
      categorySourceId: null,
    },
    summary: {
      realizedRevenue: 322465.68,
      revenueWithCurrentCost: 322465.68,
      revenueWithoutCurrentCost: 0,
      costCoveragePercent: 100.0,
      estimatedCOGS: 197277.62,
      estimatedGrossProfit: 125188.06,
      estimatedGrossMarginPercent: 38.82,
    },
    costSnapshot: {
      completedAt: "2026-09-17T21:00:00.000Z",
      source: "PRODUCT_SYNC_RUN",
    },
    dataQuality: {
      movementsWithCurrentCost: 3989,
      movementsWithoutCurrentCost: 0,
      productsTotal: 238,
      productsWithCurrentCost: 238,
      productsWithoutCurrentCost: 0,
      financialComplementCount: 0,
      financialComplementRevenue: 0,
      movementsWithoutCurrentProduct: 0,
      revenueWithoutCurrentProduct: 0,
      currentCategoryCoveragePercent: 100.0,
      costBasis: "CURRENT_PRODUCT_EFFECTIVE_COST",
      categoryBasis: "CURRENT_PRODUCT_CATEGORY",
    },
    trendGranularity: "MONTH",
    trend: [
      {
        period: "2026-01",
        realizedRevenue: 40000,
        revenueWithCurrentCost: 40000,
        revenueWithoutCurrentCost: 0,
        estimatedCOGS: 24000,
        estimatedGrossProfit: 16000,
        estimatedGrossMarginPercent: 40.0,
        costCoveragePercent: 100,
      },
    ],
    channels: [
      {
        channel: "ATACADO",
        realizedRevenue: 249000,
        revenueWithCurrentCost: 249000,
        estimatedCOGS: 152000,
        estimatedGrossProfit: 97000,
        estimatedGrossMarginPercent: 38.95,
        costCoveragePercent: 100,
        physicalQuantity: 3000,
      },
      {
        channel: "VAREJO",
        realizedRevenue: 73465.68,
        revenueWithCurrentCost: 73465.68,
        estimatedCOGS: 45277.62,
        estimatedGrossProfit: 28188.06,
        estimatedGrossMarginPercent: 38.37,
        costCoveragePercent: 100,
        physicalQuantity: 989,
      },
    ],
    rootCategories: [
      {
        categorySourceId: "49",
        category: "1 - NINECLOUDS",
        realizedRevenue: 280000,
        revenueWithCurrentCost: 280000,
        revenueWithoutCurrentCost: 0,
        estimatedCOGS: 170000,
        estimatedGrossProfit: 110000,
        estimatedGrossMarginPercent: 39.28,
        costCoveragePercent: 100,
        physicalQuantity: 3500,
      },
    ],
    categories: [],
    products: [],
    highlights: {
      topProfitProducts: [
        {
          productSourceId: "101",
          productName: "Shape Nineclouds Maple 8.0",
          sku: "SHP-80-01",
          realizedRevenue: 31750,
          estimatedGrossProfit: 15400,
          estimatedGrossMarginPercent: 48.5,
        },
        {
          productSourceId: "102",
          productName: "Shape Nineclouds Maple 8.25",
          sku: "SHP-825-01",
          realizedRevenue: 25900,
          estimatedGrossProfit: 12200,
          estimatedGrossMarginPercent: 47.1,
        },
      ],
      negativeMarginProductsCount: 3,
      worstMarginProducts: [
        {
          productSourceId: "991",
          productName: "Lixa Emborrachada Promocional",
          sku: "LIX-EMB",
          realizedRevenue: 1417.65,
          estimatedGrossProfit: -120.5,
          estimatedGrossMarginPercent: -8.5,
        },
      ],
    },
  };

  describe("A. Navegação Interna e Default (Section 3)", () => {
    it("abre por padrão na Visão Geral e renderiza as quatro abas com WAI-ARIA", () => {
      const html = renderToString(
        <ProfitabilityView
          data={mockProfitabilityOverview}
          isLoading={false}
          error={null}
          onRetry={vi.fn()}
          selectedChannel={null}
          onSelectChannel={vi.fn()}
          selectedCategorySourceId={null}
          onSelectCategorySourceId={vi.fn()}
          categoryTree={[]}
        />,
      );

      // Tablist container
      expect(html).toContain('role="tablist"');
      expect(html).toContain('aria-label="Subnavegação do Módulo Rentabilidade"');

      // 4 tabs
      expect(html).toContain('id="tab-profitability-overview"');
      expect(html).toContain('id="tab-profitability-products"');
      expect(html).toContain('id="tab-profitability-sales"');
      expect(html).toContain('id="tab-profitability-customers"');

      // Default active tab is Visão Geral
      expect(html).toContain('aria-selected="true"');
      expect(html).toContain('aria-controls="panel-profitability-overview"');
      expect(html).toContain("Visão Geral");
      expect(html).toContain("Produtos");
      expect(html).toContain("Vendas");
      expect(html).toContain("Clientes");
    });
  });

  describe("B. Premissa e Metodologia de Rentabilidade (Section 5)", () => {
    it("exibe a premissa obrigatória em callout expansível com terminologia canônica", () => {
      const html = renderToString(
        <ProfitabilityView
          data={mockProfitabilityOverview}
          isLoading={false}
          error={null}
          onRetry={vi.fn()}
          selectedChannel={null}
          onSelectChannel={vi.fn()}
          selectedCategorySourceId={null}
          onSelectCategorySourceId={vi.fn()}
          categoryTree={[]}
        />,
      );

      expect(html).toContain("Sobre esta estimativa:");
      expect(html).toContain(
        "Rentabilidade estimada com o custo atual dos produtos. Não representa o custo histórico na data da venda.",
      );
      expect(html).toContain("Saiba mais");
    });
  });

  describe("C. Visão Geral (Section 6)", () => {
    it("renderiza 4 KPIs canônicos, cobertura secundária, gráfico, canais, categorias e highlights", () => {
      const html = renderToString(
        <ProfitabilityOverviewTab
          data={mockProfitabilityOverview}
          selectedChannel={null}
          onSelectChannel={vi.fn()}
          selectedCategorySourceId={null}
          onSelectCategorySourceId={vi.fn()}
          categoryTree={[]}
        />,
      );

      // KPIs
      expect(html).toContain("Receita realizada");
      expect(html).toContain("322.465,68");
      expect(html).toContain("CMV estimado ao custo atual");
      expect(html).toContain("197.277,62");
      expect(html).toContain("Lucro bruto estimado ao custo atual");
      expect(html).toContain("125.188,06");
      expect(html).toContain("Margem bruta estimada ao custo atual");
      expect(html).toContain("38,82%");

      // Cobertura de custo secundária
      expect(html).toContain("Cobertura de custo atual:");
      expect(html).toContain("100%");

      // Evolução temporal & Highlights (Row 2)
      expect(html).toContain("tp-profit-overview-row2");
      expect(html).toContain("tp-profit-overview-chart-col");
      expect(html).toContain("tp-profit-overview-highlights-col");
      expect(html).toContain("Destaques de Rentabilidade");
      expect(html).toContain("Top Lucro Bruto");
      expect(html).toContain("Shape Nineclouds Maple 8.0");
      expect(html).toContain("3 com margem negativa");

      // Canais e Categorias (Row 3)
      expect(html).toContain("tp-profit-overview-row3");
      expect(html).toContain("Rentabilidade por Canal");
      expect(html).toContain("Atacado");
      expect(html).toContain("Varejo");
      expect(html).toContain("1 - NINECLOUDS");

      // NÃO mostra a tabela longa de produtos na Visão Geral
      expect(html).not.toContain("tp-profit-products-table");
      expect(html).not.toContain("tp-products-table");
      expect(html).not.toContain("Buscar produto ou código...");
    });
  });

  describe("D. Destaques e Alertas (Section 6.6)", () => {
    it("renderiza no máximo 3 itens por lista e destaca margem negativa", () => {
      const html = renderToString(
        <ProfitabilityHighlightsCard highlights={mockProfitabilityOverview.highlights} />,
      );

      expect(html).toContain("Destaques de Rentabilidade");
      expect(html).toContain("Top Lucro Bruto");
      expect(html).toContain("Menores Margens");
      expect(html).toContain("Lixa Emborrachada Promocional");
      expect(html).toContain("-8,5%");
      expect(html).toContain("3 com margem negativa");
    });
  });

  describe("E. Nomenclatura Estrita em Todo o Módulo (Section 5 & 14.N)", () => {
    it("NUNCA utiliza termos proibidos (lucro líquido, margem líquida, EBITDA, margem média)", () => {
      const htmlOverview = renderToString(
        <ProfitabilityOverviewTab
          data={mockProfitabilityOverview}
          selectedChannel={null}
          onSelectChannel={vi.fn()}
          selectedCategorySourceId={null}
          onSelectCategorySourceId={vi.fn()}
          categoryTree={[]}
        />,
      );

      expect(htmlOverview.toLowerCase()).not.toContain("lucro líquido");
      expect(htmlOverview.toLowerCase()).not.toContain("margem líquida");
      expect(htmlOverview.toLowerCase()).not.toContain("ebitda");
      expect(htmlOverview.toLowerCase()).not.toContain("margem média");
      expect(htmlOverview.toLowerCase()).not.toContain("margem de contribuição");
    });
  });

  describe("F. Estados de Carregamento e Erro (Section 12)", () => {
    it("renderiza skeleton ao carregar e tela de erro com botão retry", () => {
      const loadingHtml = renderToString(
        <ProfitabilityView
          data={null}
          isLoading={true}
          error={null}
          onRetry={vi.fn()}
          selectedChannel={null}
          onSelectChannel={vi.fn()}
          selectedCategorySourceId={null}
          onSelectCategorySourceId={vi.fn()}
          categoryTree={[]}
        />,
      );
      expect(loadingHtml).toContain("tp-section-skeleton");

      const errorHtml = renderToString(
        <ProfitabilityView
          data={null}
          isLoading={false}
          error="Falha de conexão com a API"
          onRetry={vi.fn()}
          selectedChannel={null}
          onSelectChannel={vi.fn()}
          selectedCategorySourceId={null}
          onSelectCategorySourceId={vi.fn()}
          categoryTree={[]}
        />,
      );
      expect(errorHtml).toContain("Falha ao consultar indicadores de rentabilidade");
      expect(errorHtml).toContain("Tentar novamente");
    });
  });
});
