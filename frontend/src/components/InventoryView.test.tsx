import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { InventoryView } from "./InventoryView";
import { InventoryWindowSelector } from "./InventoryWindowSelector";
import { InventoryKpiGrid } from "./InventoryKpiGrid";
import { InventoryProblemCards } from "./InventoryProblemCards";
import { InventoryCoverageCard } from "./InventoryCoverageCard";
import { InventoryCategoryCapitalCard } from "./InventoryCategoryCapitalCard";
import { InventoryProductsTable } from "./InventoryProductsTable";
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
      demandWithoutStockCount: 41,
      activeDemandWithoutStockCount: 39,
      productsWithStockAndSales: 113,
      productsWithStockNoSales: 148,
      capitalWithSales: 119362.11,
      capitalWithoutSales: 29574.22,
      capitalWithoutSalesShare: 19.9,
      inactiveProductsWithStock: 18,
      inactiveStockCostValue: 8420.5,
    },
    coverageDistribution: {
      lt15: 16,
      from15to30: 22,
      from30to45: 18,
      from45to90: 24,
      gt90: 33,
      totalWithStockAndSales: 113,
      noSalesInWindow: 148,
    },
    products: [
      mockProductWithDemand,
      mockProductIdleCapital,
      mockInactiveProductIdleCapital,
      mockProductNegativeStock,
      mockProductWithNormalSales,
    ],
    categories: [
      {
        category: "Shapes",
        products: 50,
        productsWithStock: 45,
        stockUnits: 320,
        inventoryCostValue: 45000,
        inventoryListValue: 90000,
        quantityInWindow: 200,
        realizedRevenueInWindow: 40000,
        productsWithSales: 35,
        productsWithoutSales: 10,
        capitalWithoutSales: 9000,
        capitalWithoutSalesShare: 20.0,
        demandWithoutStockCount: 5,
        lowCoverageCount: 8,
        aggregatedEstimatedDaysOfStock: 48,
      },
    ],
    dataQuality: {
      negativeStockCount: 6,
      activeWithoutStockCount: 33,
      inactiveWithStockCount: 18,
      effectiveCostMissingOrZero: 0,
      retailSalePriceMissingOrZero: 0,
      averageCostMissingOrZero: 0,
      stockMinNotConfiguredCount: 15,
      stockMaxNotConfiguredCount: 20,
    },
  };

  it("1. InventoryWindowSelector: renders 30, 90, 180 options with active state", () => {
    const html = renderToString(
      <InventoryWindowSelector value={90} onChange={() => {}} />,
    );

    expect(html).toContain("Janela de velocidade");
    expect(html).toContain("30 dias");
    expect(html).toContain("90 dias");
    expect(html).toContain("180 dias");
    expect(html).toContain('aria-pressed="true"');
  });

  it("2. InventoryKpiGrid: renders 4 executive cards with exact required labels and context", () => {
    const html = renderToString(
      <InventoryKpiGrid
        summary={mockData.summary}
        dataQuality={mockData.dataQuality}
      />,
    );

    // KPI 1: Capital atual em estoque
    expect(html).toContain("Capital atual em estoque");
    expect(html).toContain("261 SKUs com estoque");

    // KPI 2: Valor de tabela com contexto obrigatório
    expect(html).toContain("Valor de tabela");
    expect(html).toContain("Estoque atual a preço cadastrado");

    // KPI 3: Demanda sem estoque (subconjunto operacional ativo: 39)
    expect(html).toContain("Demanda sem estoque");
    expect(html).toContain("39");
    expect(html).toContain("SKUs ativos com saída na janela");

    // KPI 4: Capital sem saída (capitalWithoutSales: 29.574,22 e 19,9%)
    expect(html).toContain("Capital sem saída");
    expect(html).toContain("19,9% do capital em estoque");

    // Context Strip
    expect(html).toContain("Estoque negativo:");
    expect(html).toContain("Ativos sem estoque:");
    expect(html).toContain("Inativos com estoque:");
    expect(html).toContain("Produtos vendidos na janela:");
  });

  it("3. InventoryProblemCards: shows Demanda sem estoque and Capital sem saída", () => {
    const html = renderToString(
      <InventoryProblemCards
        products={mockData.products}
        onViewAll={() => {}}
      />,
    );

    // Card A: Demanda sem estoque
    expect(html).toContain("Demanda sem estoque");
    expect(html).toContain("Produtos ativos com saída na janela e saldo atual ≤ 0");
    expect(html).toContain("Shape Nineclouds Maple 8.0");
    expect(html).toContain("35 un");
    // Estoque negativo com destaque
    expect(html).toContain("Estoque negativo (-3)");

    // Card B: Capital sem saída
    expect(html).toContain("Capital sem saída");
    expect(html).toContain("Estoque atual sem saída física na janela");
    expect(html).toContain("Roda Spitfire Formula Four 54mm");
    // Se lastPhysicalSaleDate é null: "Sem saída registrada" (NUNCA "Nunca vendeu")
    expect(html).toContain("Sem saída registrada");
    expect(html).not.toContain("Nunca vendeu");
    // Produto inativo: badge discreta "Inativo com estoque"
    expect(html).toContain("Inativo com estoque");
  });

  it("4. InventoryCoverageCard: renders segmented distribution and separate idle pill", () => {
    const html = renderToString(
      <InventoryCoverageCard distribution={mockData.coverageDistribution} />,
    );

    expect(html).toContain("Cobertura estimada");
    expect(html).toContain("Estoque atual ÷ velocidade média de saída da janela");
    expect(html).toContain("Base com venda:");
    expect(html).toContain("113 SKUs");
    expect(html).toContain("&lt; 15 dias");
    expect(html).toContain("&gt; 90 dias");
    // Sem saída na janela fora da distribuição matemática
    expect(html).toContain("Sem saída física na janela:");
    expect(html).toContain("148 SKUs");
  });

  it("5. InventoryCategoryCapitalCard: renders categories sorted by capital with idle share", () => {
    const html = renderToString(
      <InventoryCategoryCapitalCard categories={mockData.categories} />,
    );

    expect(html).toContain("Capital sem saída por categoria");
    expect(html).toContain("Shapes");
    expect(html).toContain("45 SKUs com estoque");
    expect(html).toContain("sem saída (20.0%)");
  });

  it("6. InventoryProductsTable: renders table headers, formatted statuses without STOCK_WITH_SALES, and correct coverage", () => {
    const html = renderToString(
      <InventoryProductsTable
        products={mockData.products}
        activeChip="ALL"
        onChipChange={() => {}}
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

    // Verifica que STOCK_WITH_SALES não vira badge poluída
    expect(html).not.toContain("STOCK_WITH_SALES");

    // Cobertura formatada como inteiro de dias
    expect(html).toContain("45 dias");
    // Cobertura com saldo <= 0
    expect(html).toContain("—");
    // Cobertura com saldo > 0 e zero venda
    expect(html).toContain("Sem saída");
  });

  it("7. InventoryView: renders full dashboard view with all blocks", () => {
    const html = renderToString(
      <InventoryView
        data={mockData}
        isLoading={false}
        error={null}
        onRetry={() => {}}
      />,
    );

    expect(html).toContain("tp-inventory-section");
    expect(html).toContain("Capital atual em estoque");
    expect(html).toContain("Demanda sem estoque");
    expect(html).toContain("Capital sem saída");
    expect(html).toContain("Cobertura estimada");
    expect(html).toContain("Capital sem saída por categoria");
    expect(html).toContain("Saúde do estoque");
  });

  it("8. InventoryView: renders skeleton state when loading with no previous data", () => {
    const html = renderToString(
      <InventoryView
        data={null}
        isLoading={true}
        error={null}
        onRetry={() => {}}
      />,
    );

    expect(html).toContain("tp-section-skeleton");
    expect(html).toContain("tp-skeleton-card");
  });

  it("9. InventoryView: renders error state with retry button", () => {
    const html = renderToString(
      <InventoryView
        data={null}
        isLoading={false}
        error="Falha de conexão com a API de Estoque"
        onRetry={() => {}}
      />,
    );

    expect(html).toContain("tp-state-error");
    expect(html).toContain("Falha de conexão com a API de Estoque");
    expect(html).toContain("Tentar novamente");
  });
});
