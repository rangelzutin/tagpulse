import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { ProfitabilityView } from "./ProfitabilityView";
import { ProfitabilityKpiGrid } from "./ProfitabilityKpiGrid";
import { ProfitabilityBreakdowns } from "./ProfitabilityBreakdowns";
import { ProfitabilityProductsTable } from "./ProfitabilityProductsTable";
import type { ProfitabilityOverviewResult } from "../api/bi";

describe("ProfitabilityView & Components", () => {
  const mockProfitabilityData: ProfitabilityOverviewResult = {
    period: {
      from: "2026-01-01",
      to: "2026-01-31",
    },
    filters: {
      channel: null,
      categorySourceId: null,
    },
    summary: {
      realizedRevenue: 53766.28,
      revenueWithCurrentCost: 50084.7,
      revenueWithoutCurrentCost: 3681.58,
      costCoveragePercent: 93.15,
      estimatedCOGS: 36143.45,
      estimatedGrossProfit: 13941.25,
      estimatedGrossMarginPercent: 27.84,
    },
    costSnapshot: {
      asOf: "2026-09-17T21:00:00.000Z",
      lastProductSyncAt: "2026-09-17T20:30:00.000Z",
      lastProductSyncStatus: "SUCCESS",
      totalCatalogProducts: 500,
      productsWithCostCount: 490,
      productsWithoutCostCount: 10,
    },
    dataQuality: {
      movementsWithCurrentCost: 150,
      movementsWithoutCurrentCost: 12,
      financialComplementCount: 5,
      financialComplementRevenue: 450,
      movementsWithoutCurrentProduct: 8,
      revenueWithoutCurrentProduct: 2500,
      currentCategoryCoveragePercent: 95.35,
      costBasis: "CURRENT_PRODUCT_EFFECTIVE_COST",
      categoryBasis: "CURRENT_PRODUCT_CATEGORY",
    },
    trendGranularity: "DAY",
    trend: [
      {
        period: "2026-01-01",
        realizedRevenue: 1500,
        revenueWithCurrentCost: 1500,
        revenueWithoutCurrentCost: 0,
        estimatedCOGS: 900,
        estimatedGrossProfit: 600,
        estimatedGrossMarginPercent: 40,
        costCoveragePercent: 100,
      },
    ],
    channels: [
      {
        channel: "ATACADO",
        realizedRevenue: 40000,
        revenueWithCurrentCost: 40000,
        estimatedCOGS: 26000,
        estimatedGrossProfit: 14000,
        estimatedGrossMarginPercent: 35,
        costCoveragePercent: 100,
        physicalQuantity: 200,
      },
      {
        channel: "VAREJO",
        realizedRevenue: 13766.28,
        revenueWithCurrentCost: 10084.7,
        estimatedCOGS: 10143.45,
        estimatedGrossProfit: -58.75,
        estimatedGrossMarginPercent: -0.58,
        costCoveragePercent: 73.26,
        physicalQuantity: 80,
      },
    ],
    rootCategories: [
      {
        categorySourceId: "49",
        category: "1 - NINECLOUDS",
        realizedRevenue: 45000,
        revenueWithCurrentCost: 45000,
        revenueWithoutCurrentCost: 0,
        estimatedCOGS: 30000,
        estimatedGrossProfit: 15000,
        estimatedGrossMarginPercent: 33.33,
        costCoveragePercent: 100,
        physicalQuantity: 250,
      },
      {
        categorySourceId: "78",
        category: "X - DESATIVADOS",
        realizedRevenue: 5084.7,
        revenueWithCurrentCost: 5084.7,
        revenueWithoutCurrentCost: 0,
        estimatedCOGS: 4000,
        estimatedGrossProfit: 1084.7,
        estimatedGrossMarginPercent: 21.33,
        costCoveragePercent: 100,
        physicalQuantity: 30,
      },
    ],
    categories: [],
    products: [
      {
        productId: "p1",
        productSourceId: "101",
        sku: "SKU-PRO-01",
        productName: "Shape Nineclouds Maple 8.0",
        category: "Shapes",
        categorySourceId: "50",
        currentEffectiveCost: 85,
        physicalQuantity: 50,
        realizedRevenue: 10000,
        revenueWithCurrentCost: 10000,
        revenueWithoutCurrentCost: 0,
        estimatedCOGS: 4250,
        estimatedGrossProfit: 5750,
        estimatedGrossMarginPercent: 57.5,
        costCoveragePercent: 100,
        isOrphan: false,
      },
      {
        // Produto histórico órfão (excluído do catálogo ERP)
        productId: null,
        productSourceId: "645",
        sku: null,
        productName: "Produto não disponível no catálogo atual (ID: 645)",
        category: null,
        categorySourceId: null,
        currentEffectiveCost: null,
        physicalQuantity: 10,
        realizedRevenue: 2500,
        revenueWithCurrentCost: 0,
        revenueWithoutCurrentCost: 2500,
        estimatedCOGS: null,
        estimatedGrossProfit: null,
        estimatedGrossMarginPercent: null,
        costCoveragePercent: 0,
        isOrphan: true,
      },
    ],
  };

  it("1. Renderiza os 4 KPIs com a nomenclatura canônica e valores formatados", () => {
    const html = renderToString(
      <ProfitabilityKpiGrid summary={mockProfitabilityData.summary} />,
    );

    expect(html).toContain("Receita realizada");
    expect(html).toContain("CMV estimado ao custo atual");
    expect(html).toContain("Lucro bruto estimado ao custo atual");
    expect(html).toContain("Margem bruta estimada ao custo atual");
    // Não pode conter termos vedados
    expect(html).not.toContain("CMV realizado");
    expect(html).not.toContain("Margem realizada");
    expect(html).not.toContain("Margem histórica");
  });

  it("2. Renderiza o aviso canônico de premissa (disclaimer) e timestamp do snapshot", () => {
    const html = renderToString(
      <ProfitabilityView
        data={mockProfitabilityData}
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

    expect(html).toContain("Premissa Canônica de Custo Atual de Catálogo");
    expect(html).toContain(
      "Esta análise não representa o CMV histórico apurado no momento de cada venda",
    );
    expect(html).toContain("Catálogo TagPlus:");
  });

  it("3. Renderiza o bloco de cobertura de custo e nota de produtos históricos", () => {
    const html = renderToString(
      <ProfitabilityView
        data={mockProfitabilityData}
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

    expect(html).toContain("Cobertura de Custo Atual");
    expect(html).toContain("93,15%");
    expect(html).toContain("produtos históricos descontinuados");
  });

  it("4. Renderiza os breakdowns de canais e famílias com nomenclatura neutra de raízes", () => {
    const html = renderToString(
      <ProfitabilityBreakdowns
        channels={mockProfitabilityData.channels}
        rootCategories={mockProfitabilityData.rootCategories}
        selectedChannel={null}
        onSelectChannel={vi.fn()}
        selectedCategorySourceId={null}
        onSelectCategorySourceId={vi.fn()}
      />,
    );

    expect(html).toContain("Rentabilidade por Canal");
    expect(html).toContain("Atacado");
    expect(html).toContain("Varejo");
    // Nomenclatura requerida: Família / Categoria Mãe (evitar tratar como Marca)
    expect(html).toContain("Rentabilidade por Família / Categoria Mãe");
    expect(html).toContain("1 - NINECLOUDS");
    expect(html).toContain("X - DESATIVADOS");
  });

  it("5. Renderiza a tabela de produtos preservando produtos órfãos com apresentação neutra", () => {
    const html = renderToString(
      <ProfitabilityProductsTable
        products={mockProfitabilityData.products}
        categoryTree={[]}
        selectedChannel={null}
        onSelectChannel={vi.fn()}
        selectedCategorySourceId={null}
        onSelectCategorySourceId={vi.fn()}
        onResetFilters={vi.fn()}
      />,
    );

    // Produto normal
    expect(html).toContain("Shape Nineclouds Maple 8.0");
    expect(html).toContain("SKU-PRO-01");

    // Produto órfão
    expect(html).toContain("Produto não disponível no catálogo atual");
    expect(html).toContain("ID TagPlus: 645 • Histórico");
  });

  it("6. Renderiza estado de loading (skeleton) e erro de forma graciosa", () => {
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
    expect(errorHtml).toContain("Falha de conexão com a API");
  });
});
