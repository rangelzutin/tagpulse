import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { InventoryView } from "./InventoryView";
import { InventoryWindowSelector } from "./InventoryWindowSelector";
import { InventoryKpiGrid } from "./InventoryKpiGrid";
import { InventoryProblemCards } from "./InventoryProblemCards";
import { InventoryCategorySalesCard } from "./InventoryCategorySalesCard";
import { InventoryCoverageCard } from "./InventoryCoverageCard";
import { InventoryCategoryCapitalCard } from "./InventoryCategoryCapitalCard";
import { InventoryProductsTable } from "./InventoryProductsTable";
import { InventoryCategoryCombobox } from "./InventoryCategoryCombobox";
import type {
  InventoryOverviewResult,
  InventoryProductItem,
} from "../api/bi";

describe("InventoryView & Components", () => {
  const mockProductWithDemand: InventoryProductItem = {
    productId: "p-1",
    sourceProductId: "101",
    code: "SKU-001",
    description: "Shape Nineclouds Maple 8.0",
    category: "Shapes",
    active: true,
    currentStock: 0,
    effectiveCost: 80,
    retailSalePrice: 150,
    stockCostValue: 0,
    stockListValue: 0,
    quantityInWindow: 35,
    realizedRevenueInWindow: 5250,
    averageDailySales: 0.39,
    lastPhysicalSaleDate: "2026-09-12",
    daysSinceLastPhysicalSale: 2,
    estimatedDaysOfStock: null,
    coverageBucket: null,
    distinctCustomersInWindow: 8,
    operationalFlags: ["DEMAND_WITHOUT_STOCK"],
  };

  const mockProductIdleCapital: InventoryProductItem = {
    productId: "p-2",
    sourceProductId: "102",
    code: "SKU-002",
    description: "Roda Spitfire Formula Four 54mm",
    category: "Rodas",
    active: true,
    currentStock: 12,
    effectiveCost: 120,
    retailSalePrice: 250,
    stockCostValue: 1440,
    stockListValue: 3000,
    quantityInWindow: 0,
    realizedRevenueInWindow: 0,
    averageDailySales: 0,
    lastPhysicalSaleDate: null,
    daysSinceLastPhysicalSale: null,
    estimatedDaysOfStock: null,
    coverageBucket: null,
    distinctCustomersInWindow: 0,
    operationalFlags: ["NO_SALES_IN_WINDOW"],
  };

  const mockInactiveProductIdleCapital: InventoryProductItem = {
    productId: "p-3",
    sourceProductId: "103",
    code: "SKU-003",
    description: "Truck Independent 139 Stage 11",
    category: "Trucks",
    active: false,
    currentStock: 5,
    effectiveCost: 200,
    retailSalePrice: 400,
    stockCostValue: 1000,
    stockListValue: 2000,
    quantityInWindow: 0,
    realizedRevenueInWindow: 0,
    averageDailySales: 0,
    lastPhysicalSaleDate: "2026-05-10",
    daysSinceLastPhysicalSale: 127,
    estimatedDaysOfStock: null,
    coverageBucket: null,
    distinctCustomersInWindow: 0,
    operationalFlags: ["NO_SALES_IN_WINDOW", "INACTIVE_WITH_STOCK"],
  };

  const mockProductNegativeStock: InventoryProductItem = {
    productId: "p-4",
    sourceProductId: "104",
    code: "SKU-004",
    description: "Lixa Jessup Ultra Grip",
    category: "Acessórios",
    active: true,
    currentStock: -3,
    effectiveCost: 25,
    retailSalePrice: 50,
    stockCostValue: 0,
    stockListValue: 0,
    quantityInWindow: 15,
    realizedRevenueInWindow: 750,
    averageDailySales: 0.17,
    lastPhysicalSaleDate: "2026-09-08",
    daysSinceLastPhysicalSale: 6,
    estimatedDaysOfStock: null,
    coverageBucket: null,
    distinctCustomersInWindow: 5,
    operationalFlags: ["DEMAND_WITHOUT_STOCK", "NEGATIVE_STOCK"],
  };

  const mockProductWithNormalSales: InventoryProductItem = {
    productId: "p-5",
    sourceProductId: "105",
    code: "SKU-005",
    description: "Rolamento Red Bones",
    category: "Rolamentos",
    active: true,
    currentStock: 20,
    effectiveCost: 60,
    retailSalePrice: 120,
    stockCostValue: 1200,
    stockListValue: 2400,
    quantityInWindow: 40,
    realizedRevenueInWindow: 4800,
    averageDailySales: 0.44,
    lastPhysicalSaleDate: "2026-09-14",
    daysSinceLastPhysicalSale: 0,
    estimatedDaysOfStock: 45.45,
    coverageBucket: "45_TO_90",
    distinctCustomersInWindow: 15,
    operationalFlags: ["STOCK_WITH_SALES"],
  };

  const mockProductLt15: InventoryProductItem = {
    productId: "p-6",
    sourceProductId: "106",
    code: "SKU-006",
    description: "Tênis Skate Pro Low",
    category: "Tenis",
    active: true,
    currentStock: 3,
    effectiveCost: 150,
    retailSalePrice: 300,
    stockCostValue: 450,
    stockListValue: 900,
    quantityInWindow: 20,
    realizedRevenueInWindow: 6000,
    averageDailySales: 0.35,
    lastPhysicalSaleDate: "2026-09-15",
    daysSinceLastPhysicalSale: 1,
    estimatedDaysOfStock: 8.5,
    coverageBucket: "LT_15",
    distinctCustomersInWindow: 12,
    operationalFlags: ["STOCK_WITH_SALES"],
  };

  const mockInactiveZeroStock: InventoryProductItem = {
    productId: "p-7",
    sourceProductId: "107",
    code: "SKU-007",
    description: "Shape Hustler - Completo",
    category: "3 - HUSTLER",
    active: false,
    currentStock: 0,
    effectiveCost: 80,
    retailSalePrice: 160,
    stockCostValue: 0,
    stockListValue: 0,
    quantityInWindow: 0,
    realizedRevenueInWindow: 0,
    averageDailySales: 0,
    lastPhysicalSaleDate: null,
    daysSinceLastPhysicalSale: null,
    estimatedDaysOfStock: null,
    coverageBucket: null,
    distinctCustomersInWindow: 0,
    operationalFlags: [],
  };

  const allMockProducts = [
    mockProductWithDemand,
    mockProductIdleCapital,
    mockInactiveProductIdleCapital,
    mockProductNegativeStock,
    mockProductWithNormalSales,
    mockProductLt15,
    mockInactiveZeroStock,
  ];

  const mockData: InventoryOverviewResult = {
    asOfDate: "2026-09-14",
    windowDays: 90,
    summary: {
      totalProducts: 300,
      activeProducts: 250,
      productsWithPositiveStock: 261,
      productsWithZeroStock: 33,
      productsWithNegativeStock: 6,
      inventoryCostValue: 148936.33,
      inventoryListValue: 518727.6,
      productsSoldInWindow: 154,
      demandWithoutStockCount: 42,
      activeDemandWithoutStockCount: 39,
      productsWithStockAndSales: 113,
      productsWithStockNoSales: 148,
      capitalWithSales: 119362.11,
      capitalWithoutSales: 29574.22,
      capitalWithoutSalesShare: 19.9,
      inactiveProductsWithStock: 18,
      inactiveStockCostValue: 12000,
    },
    coverageDistribution: {
      lt15: 12,
      from15to30: 25,
      from30to45: 35,
      from45to90: 28,
      gt90: 13,
      totalWithStockAndSales: 113,
      noSalesInWindow: 148,
    },
    categories: [
      {
        category: "Shapes",
        products: 50,
        productsWithStock: 45,
        stockUnits: 320,
        inventoryCostValue: 35000,
        inventoryListValue: 70000,
        quantityInWindow: 120,
        realizedRevenueInWindow: 15000,
        productsWithSales: 30,
        productsWithoutSales: 20,
        capitalWithoutSales: 7000,
        capitalWithoutSalesShare: 20.0,
        demandWithoutStockCount: 5,
        lowCoverageCount: 3,
        aggregatedEstimatedDaysOfStock: 45,
      },
      {
        category: "Rodas",
        products: 30,
        productsWithStock: 25,
        stockUnits: 150,
        inventoryCostValue: 15000,
        inventoryListValue: 30000,
        quantityInWindow: 60,
        realizedRevenueInWindow: 8000,
        productsWithSales: 20,
        productsWithoutSales: 10,
        capitalWithoutSales: 3000,
        capitalWithoutSalesShare: 20.0,
        demandWithoutStockCount: 2,
        lowCoverageCount: 1,
        aggregatedEstimatedDaysOfStock: 60,
      },
    ],
    products: allMockProducts,
    dataQuality: {
      negativeStockCount: 6,
      activeWithoutStockCount: 33,
      inactiveWithStockCount: 18,
      effectiveCostMissingOrZero: 5,
      retailSalePriceMissingOrZero: 0,
      averageCostMissingOrZero: 5,
      stockMinNotConfiguredCount: 10,
      stockMaxNotConfiguredCount: 10,
    },
  };

  it("1. InventoryWindowSelector: renders 30, 90, 180 options with active state", () => {
    const html = renderToString(
      <InventoryWindowSelector value={90} onChange={() => {}} />,
    );

    expect(html).toContain("30 dias");
    expect(html).toContain("90 dias");
    expect(html).toContain("180 dias");
    expect(html).toContain("is-active");
  });

  it("2. InventoryKpiGrid: renders 4 executive cards and 4 independent Situação do estoque mini-cards", () => {
    const html = renderToString(
      <InventoryKpiGrid
        summary={mockData.summary}
        dataQuality={mockData.dataQuality}
      />,
    );

    // KPI 1: Capital atual em estoque
    expect(html).toContain("Capital atual em estoque");
    expect(html).toContain("R$ 148.936,33");
    expect(html).toContain("261 SKUs com estoque");

    // KPI 2: Valor de tabela
    expect(html).toContain("Valor de tabela");
    expect(html).toContain("R$ 518.727,60");

    // KPI 3: Demanda sem estoque (subconjunto ativo)
    expect(html).toContain("Demanda sem estoque");
    expect(html).toContain("39");
    expect(html).toContain("SKUs ativos com saída na janela");

    // KPI 4: Capital sem saída
    expect(html).toContain("Capital sem saída");
    expect(html).toContain("19,9% do capital em estoque");

    // LINHA 2: 4 Cards independentes de Situação do Estoque
    expect(html).toContain("tp-situation-cards-grid");
    expect(html).toContain("tp-situation-mini-card");
    expect(html).toContain("Estoque negativo");
    expect(html).toContain("Ativos sem estoque");
    expect(html).toContain("Inativos com estoque");
    expect(html).toContain("Vendidos na janela");
  });

  it("3. InventoryProblemCards: shows Demanda sem estoque and Capital sem saída", () => {
    const html = renderToString(
      <InventoryProblemCards
        products={mockData.products}
        onViewAll={() => {}}
      />,
    );

    expect(html).toContain("Demanda sem estoque");
    expect(html).toContain("Produtos ativos com saída na janela e saldo atual ≤ 0");
    expect(html).toContain("Shape Nineclouds Maple 8.0");
    expect(html).toContain("35 un");
    expect(html).toContain("Estoque negativo (-3)");

    expect(html).toContain("Capital sem saída");
    expect(html).toContain("Estoque atual sem saída física na janela");
    expect(html).toContain("Roda Spitfire Formula Four 54mm");
    expect(html).toContain("Sem saída registrada");
    expect(html).not.toContain("Nunca vendeu");
    expect(html).toContain("Inativo com estoque");
  });

  it("4. InventoryCoverageCard: renders compact segmented distribution and clickable buttons", () => {
    const html = renderToString(
      <InventoryCoverageCard distribution={mockData.coverageDistribution} />,
    );

    expect(html).toContain("Cobertura estimada");
    expect(html).toContain("Estoque atual ÷ velocidade média de saída da janela");
    expect(html).toContain("Base com venda:");
    expect(html).toContain("113 SKUs");
    expect(html).toContain("&lt; 15 dias");
    expect(html).toContain("&gt; 90 dias");
    expect(html).toContain("Sem saída física na janela:");
    expect(html).toContain("148 SKUs");
    expect(html).toContain("tp-coverage-compact");
  });

  it("5. InventoryCategoryCapitalCard: renders categories sorted by capital with interactive buttons", () => {
    const html = renderToString(
      <InventoryCategoryCapitalCard categories={mockData.categories} />,
    );

    expect(html).toContain("Capital sem saída por categoria");
    expect(html).toContain("Shapes");
    expect(html).toContain("45 SKUs com estoque");
    expect(html).toContain("sem saída (20.0%)");
    expect(html).toContain("tp-cat-capital-left-btn");
    expect(html).toContain("tp-cat-capital-idle-btn");
  });

  it("6. InventoryProductsTable: renders combobox, table headers, and correct badges", () => {
    const html = renderToString(
      <InventoryProductsTable
        products={mockData.products}
        statusFilter="ALL"
      />,
    );

    expect(html).toContain("Saúde do estoque");
    expect(html).toContain("PRODUTO");
    expect(html).toContain("STATUS");
    expect(html).toContain("ESTOQUE");
    expect(html).toContain("CAPITAL");
    expect(html).toContain("SAÍDA");
    expect(html).toContain("RECEITA");
    expect(html).toContain("ÚLTIMA SAÍDA");
    expect(html).toContain("COBERTURA");

    // Verifica combobox de categorias
    expect(html).toContain("tp-combobox-trigger");
    expect(html).toContain("Todas as categorias");

    // Verifica que STOCK_WITH_SALES não vira badge poluída
    expect(html).not.toContain("STOCK_WITH_SALES");
  });

  it("7. Bug Fix: Inativo com estoque=0 NÃO exibe 'Inativo com estoque'", () => {
    const html = renderToString(
      <InventoryProductsTable
        products={[mockInactiveZeroStock, mockInactiveProductIdleCapital]}
        statusFilter="ALL"
      />,
    );

    // mockInactiveZeroStock (active=false, currentStock=0) não deve ter a badge
    expect(html).toContain("Shape Hustler - Completo");
    // O mockInactiveProductIdleCapital (active=false, currentStock=5) DEVE ter a badge
    expect(html).toContain("Truck Independent 139 Stage 11");
    expect(html).toContain("Inativo com estoque");

    // Apenas 1 ocorrência de "Inativo com estoque" (pertencente ao Truck Independent)
    const matches = html.match(/Inativo com estoque/g);
    expect(matches).toHaveLength(1);
  });

  it("8. InventoryProductsTable: filters by coverageBucket LT_15 correctly", () => {
    const html = renderToString(
      <InventoryProductsTable
        products={allMockProducts}
        coverageBucket="LT_15"
      />,
    );

    expect(html).toContain("Tênis Skate Pro Low");
    expect(html).not.toContain("Shape Nineclouds Maple 8.0");
    expect(html).toContain("Cobertura:");
    expect(html).toContain("&lt; 15 dias");
    expect(html).toContain("Limpar filtros");
  });

  it("9. InventoryProductsTable: filters by selectedCategory correctly with exact match", () => {
    const html = renderToString(
      <InventoryProductsTable
        products={allMockProducts}
        selectedCategory="Shapes"
      />,
    );

    expect(html).toContain("Shape Nineclouds Maple 8.0");
    expect(html).not.toContain("Tênis Skate Pro Low");
    expect(html).toContain("Categoria:");
    expect(html).toContain("Shapes");
    expect(html).toContain("Limpar filtros");
  });

  it("10. InventoryProductsTable: filters by selectedCategory + NO_SALES_IN_WINDOW (clique no vermelho)", () => {
    const html = renderToString(
      <InventoryProductsTable
        products={allMockProducts}
        selectedCategory="Rodas"
        statusFilter="NO_SALES_IN_WINDOW"
      />,
    );

    expect(html).toContain("Roda Spitfire Formula Four 54mm");
    expect(html).not.toContain("Shape Nineclouds Maple 8.0");
    expect(html).toContain("Categoria:");
    expect(html).toContain("Rodas");
    expect(html).toContain("Status:");
    expect(html).toContain("Sem saída");
  });

  it("11. InventoryProductsTable: filters by SITUAÇÃO DO ESTOQUE indicators", () => {
    // 1. Estoque negativo
    const htmlNeg = renderToString(
      <InventoryProductsTable
        products={allMockProducts}
        statusFilter="NEGATIVE_STOCK"
      />,
    );
    expect(htmlNeg).toContain("Lixa Jessup Ultra Grip");
    expect(htmlNeg).not.toContain("Rolamento Red Bones");

    // 2. Ativos sem estoque
    const htmlActiveNoStock = renderToString(
      <InventoryProductsTable
        products={allMockProducts}
        statusFilter="ACTIVE_WITHOUT_STOCK"
      />,
    );
    expect(htmlActiveNoStock).toContain("Shape Nineclouds Maple 8.0");
    expect(htmlActiveNoStock).not.toContain("Roda Spitfire Formula Four 54mm");

    // 3. Inativos com estoque
    const htmlInactiveWithStock = renderToString(
      <InventoryProductsTable
        products={allMockProducts}
        statusFilter="INACTIVE_WITH_STOCK"
      />,
    );
    expect(htmlInactiveWithStock).toContain("Truck Independent 139 Stage 11");
    expect(htmlInactiveWithStock).not.toContain("Shape Hustler - Completo");

    // 4. Vendidos na janela
    const htmlSoldInWindow = renderToString(
      <InventoryProductsTable
        products={allMockProducts}
        statusFilter="SOLD_IN_WINDOW"
      />,
    );
    expect(htmlSoldInWindow).toContain("Rolamento Red Bones");
    expect(htmlSoldInWindow).not.toContain("Roda Spitfire Formula Four 54mm");
  });

  it("12. InventoryView: renders full dashboard with 6-line layout hierarchy", () => {
    const html = renderToString(
      <InventoryView
        data={mockData}
        isLoading={false}
        error={null}
        onRetry={() => {}}
      />,
    );

    expect(html).toContain("tp-inventory-section");
    // LINHA 1: 4 KPIs principais
    expect(html).toContain("Capital atual em estoque");
    expect(html).toContain("Valor de tabela");
    // LINHA 2: 4 cards Situação do estoque
    expect(html).toContain("tp-situation-cards-grid");
    expect(html).toContain("Estoque negativo");
    expect(html).toContain("Ativos sem estoque");
    expect(html).toContain("Inativos com estoque");
    expect(html).toContain("Vendidos na janela");
    // LINHA 3: Demanda sem estoque | Capital sem saída
    expect(html).toContain("Demanda sem estoque");
    expect(html).toContain("Capital sem saída");
    // LINHA 4: Saída recente por categoria | Capital sem saída por categoria
    expect(html).toContain("Saída recente por categoria");
    expect(html).toContain("Capital sem saída por categoria");
    // LINHA 5: Cobertura estimada — FULL WIDTH
    expect(html).toContain("Cobertura estimada");
    expect(html).toContain("tp-coverage-fullwidth");
    // LINHA 6: Saúde do estoque — FULL WIDTH
    expect(html).toContain("Saúde do estoque");
  });

  it("13. InventoryCategorySalesCard: renders top categories sorted by realizedRevenueInWindow DESC", () => {
    const html = renderToString(
      <InventoryCategorySalesCard categories={mockData.categories} />,
    );

    expect(html).toContain("Saída recente por categoria");
    expect(html).toContain("Faturamento realizado e unidades vendidas na janela");
    expect(html).toContain("Shapes");
    expect(html).toContain("120 un na janela");
    expect(html).toContain("R$ 15.000,00");
    expect(html).toContain("Rodas");
    expect(html).toContain("60 un na janela");
    expect(html).toContain("R$ 8.000,00");
    expect(html).toContain("tp-cat-sales-progress-fill");
  });

  it("14. InventoryProductsTable: filters by selectedCategory + SOLD_IN_WINDOW correctly", () => {
    const html = renderToString(
      <InventoryProductsTable
        products={allMockProducts}
        selectedCategory="Rolamentos"
        statusFilter="SOLD_IN_WINDOW"
      />,
    );

    expect(html).toContain("Rolamento Red Bones");
    expect(html).not.toContain("Roda Spitfire Formula Four 54mm");
    expect(html).toContain("Categoria:");
    expect(html).toContain("Rolamentos");
    expect(html).toContain("Status:");
    expect(html).toContain("Vendidos na janela");
  });

  it("15. InventoryCoverageCard: full width layout renders all buckets and NO_SALES_IN_WINDOW pill", () => {
    const html = renderToString(
      <InventoryCoverageCard
        distribution={mockData.coverageDistribution}
        activeBucket="LT_15"
        isNoSalesActive={false}
      />,
    );

    expect(html).toContain("tp-coverage-fullwidth");
    expect(html).toContain("&lt; 15 dias");
    expect(html).toContain("15–30 dias");
    expect(html).toContain("30–45 dias");
    expect(html).toContain("45–90 dias");
    expect(html).toContain("&gt; 90 dias");
    expect(html).toContain("Sem saída física na janela:");
    expect(html).toContain("148 SKUs");
  });
});
