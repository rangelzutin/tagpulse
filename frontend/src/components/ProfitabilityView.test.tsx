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
      completedAt: "2026-09-17T21:00:00.000Z",
      source: "PRODUCT_SYNC_RUN",
    },
    dataQuality: {
      movementsWithCurrentCost: 150,
      movementsWithoutCurrentCost: 12,
      productsTotal: 42,
      productsWithCurrentCost: 42,
      productsWithoutCurrentCost: 0,
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

  it("1. Renderiza os 4 KPIs com estrutura padronizada e valores preservados (H)", () => {
    const html = renderToString(
      <ProfitabilityKpiGrid summary={mockProfitabilityData.summary} />,
    );

    expect(html).toContain("Receita realizada");
    expect(html).toContain("CMV estimado ao custo atual");
    expect(html).toContain("Lucro bruto estimado ao custo atual");
    expect(html).toContain("Margem bruta estimada ao custo atual");
    expect(html).toContain("53.766,28");
    expect(html).toContain("36.143,45");
    expect(html).toContain("13.941,25");
    expect(html).toContain("27,84%");
    expect(html).toContain("tp-profit-kpi-card");
    expect(html).toContain("tp-profit-kpi-header");
    expect(html).toContain("tp-profit-kpi-value-wrap");
    expect(html).toContain("tp-profit-kpi-footer");
  });

  it("2. Snapshot presente: não exibe 'Catálogo TagPlus: Não disponível' e exibe timestamp formatado (A, B)", () => {
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

    expect(html).not.toContain("Catálogo TagPlus: Não disponível");
    expect(html).toContain("Custos atuais atualizados em");
    expect(html).toContain("Sobre esta estimativa:");
    expect(html).toContain("Rentabilidade estimada com o custo atual dos produtos");
    expect(html).toContain("Saiba mais");
  });

  it("3. Snapshot ausente: exibe fallback semanticamente correto e nunca 'Catálogo TagPlus: Não disponível' (A)", () => {
    const dataWithoutSnapshot = {
      ...mockProfitabilityData,
      costSnapshot: { completedAt: null, source: "PRODUCT_SYNC_RUN" as const },
    };
    const html = renderToString(
      <ProfitabilityView
        data={dataWithoutSnapshot}
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

    expect(html).not.toContain("Catálogo TagPlus: Não disponível");
    expect(html).toContain("Data de atualização dos custos indisponível");
  });

  it("4. Renderiza produtos vendidos com custo atual e nunca NaN (C, D)", () => {
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

    expect(html).not.toContain("NaN");
    expect(html).toContain("Produtos vendidos com custo atual:");
    expect(html).toContain("42 de 42 (100%)");
  });

  it("5. Zero produtos nunca gera NaN nem (100%) (C)", () => {
    const zeroData = {
      ...mockProfitabilityData,
      dataQuality: {
        ...mockProfitabilityData.dataQuality,
        productsTotal: 0,
        productsWithCurrentCost: 0,
        productsWithoutCurrentCost: 0,
      },
    };
    const html = renderToString(
      <ProfitabilityView
        data={zeroData}
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

    expect(html).not.toContain("NaN");
    expect(html).toContain("0 de 0");
    expect(html).not.toContain("0 de 0 (100%)");
  });

  it("6. Produto normal mostra Código e não mostra ID TagPlus; órfão mostra ID TagPlus + Histórico (E, F)", () => {
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
    expect(html).toContain("Código: SKU-PRO-01");
    expect(html).not.toContain("ID: 101");
    expect(html).not.toContain("ID TagPlus: 101");

    // Produto órfão
    expect(html).toContain("Produto não disponível no catálogo atual");
    expect(html).toContain("ID TagPlus: 645 • Histórico");
  });

  it("7. Filtros por canal, categoria e busca estão presentes no DOM estilizado (G)", () => {
    const html = renderToString(
      <ProfitabilityProductsTable
        products={mockProfitabilityData.products}
        categoryTree={[]}
        selectedChannel="ATACADO"
        onSelectChannel={vi.fn()}
        selectedCategorySourceId={null}
        onSelectCategorySourceId={vi.fn()}
        onResetFilters={vi.fn()}
      />,
    );

    expect(html).toContain("Atacado");
    expect(html).toContain("tp-channel-combobox");
    expect(html).toContain("tp-profit-search-wrap");
    expect(html).toContain("Buscar produto ou código...");
    expect(html).toContain("Limpar filtros");
  });

  it("8. Renderiza breakdowns de canais e famílias com nomenclatura canônica", () => {
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
    expect(html).toContain("Rentabilidade por Família / Categoria Mãe");
    expect(html).toContain("1 - NINECLOUDS");
  });

  it("9. Renderiza loading (skeleton) e estado de erro graciosamente", () => {
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
  });
});
