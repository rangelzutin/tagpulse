import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { DecisionsView } from "./DecisionsView";
import { DecisionsKpiGrid } from "./DecisionsKpiGrid";
import { DecisionsReplenishmentTable } from "./DecisionsReplenishmentTable";
import { DecisionsCapitalTable } from "./DecisionsCapitalTable";
import type { DecisionsOverviewResult } from "../api/bi";

describe("DecisionsView & Components", () => {
  const mockData: DecisionsOverviewResult = {
    meta: {
      asOfDate: "2026-09-20",
      windowDays: 90,
      startDate: "2026-06-23",
      endDate: "2026-09-20",
      totalCatalogProducts: 1757,
      activeCatalogProducts: 292,
      appliedFilters: {
        categorySourceId: null,
        categoryDescription: null,
      },
      dataQuality: {
        productsTotal: 148,
        productsWithCurrentCost: 148,
        productsWithoutCurrentCost: 0,
        revenueWithCurrentCost: 83469.47,
        revenueWithoutCurrentCost: 0,
        costCoveragePercent: 100,
      },
    },
    kpis: {
      currentInventoryCapital: 146662.73,
      capitalWithoutSalesActive: 31302.57,
      demandWithoutStockCount: 20,
      lowCoverageCount: 6,
      criticalCoverageCount: 4,
      alertCoverageCount: 2,
      estimatedGrossProfitInWindow: 35262.87,
      realizedRevenueInWindow: 83469.47,
    },
    replenishment: {
      demandWithoutStock: [
        {
          productSourceId: "1431",
          code: "1431",
          description: "Shape Nineclouds Full Logo Branco 8.125",
          active: true,
          categorySourceId: "51",
          categoryDescription: "Shape Nineclouds Logo",
          rootCategorySourceId: "49",
          rootCategoryDescription: "1 - NINECLOUDS",
          currentStock: 0,
          currentEffectiveCost: 125,
          currentInventoryCostValue: 0,
          currentInventoryListValue: 0,
          retailSalePrice: 250,
          physicalQuantityInWindow: 5,
          realizedRevenueInWindow: 1255.71,
          customerCountInWindow: 5,
          averageDailySales: 0.06,
          estimatedCoverageDays: null,
          lastPhysicalSaleDate: "2026-09-11",
          daysSinceLastPhysicalSale: 9,
          estimatedCOGSInWindow: 625,
          estimatedGrossProfitInWindow: 630.71,
          estimatedGrossMarginPercentInWindow: 50.23,
          channelsInWindow: ["ATACADO", "VAREJO"],
        },
      ],
      criticalCoverage: [
        {
          productSourceId: "1834",
          code: "1834",
          description: "Shape Nineclouds Logo Escrito Branco 8.25",
          active: true,
          categorySourceId: "51",
          categoryDescription: "Shape Nineclouds Logo",
          rootCategorySourceId: "49",
          rootCategoryDescription: "1 - NINECLOUDS",
          currentStock: 1,
          currentEffectiveCost: 125,
          currentInventoryCostValue: 125,
          currentInventoryListValue: 250,
          retailSalePrice: 250,
          physicalQuantityInWindow: 8,
          realizedRevenueInWindow: 1902.22,
          customerCountInWindow: 7,
          averageDailySales: 0.09,
          estimatedCoverageDays: 11.11,
          lastPhysicalSaleDate: "2026-09-15",
          daysSinceLastPhysicalSale: 5,
          estimatedCOGSInWindow: 1000,
          estimatedGrossProfitInWindow: 902.22,
          estimatedGrossMarginPercentInWindow: 47.43,
          channelsInWindow: ["VAREJO"],
        },
      ],
      alertCoverage: [],
    },
    capitalOptimization: {
      inventoryWithoutSales: [
        {
          productSourceId: "2080",
          code: "2080",
          description: "Camiseta YourFace",
          active: true,
          categorySourceId: "30",
          categoryDescription: "Camisetas",
          rootCategorySourceId: "50",
          rootCategoryDescription: "3 - HUSTLER",
          currentStock: 19,
          currentEffectiveCost: 59.9,
          currentInventoryCostValue: 1138.1,
          currentInventoryListValue: 3420,
          retailSalePrice: 180,
          physicalQuantityInWindow: 0,
          realizedRevenueInWindow: 0,
          customerCountInWindow: 0,
          averageDailySales: 0,
          estimatedCoverageDays: null,
          lastPhysicalSaleDate: "2026-06-08",
          daysSinceLastPhysicalSale: 104,
          estimatedCOGSInWindow: null,
          estimatedGrossProfitInWindow: null,
          estimatedGrossMarginPercentInWindow: null,
          channelsInWindow: [],
        },
      ],
      highCoverage: [],
      inactiveWithStock: [],
    },
  };

  const cleanHtml = (html: string) =>
    html.replace(/<!-- -->/g, "").replace(/\u00A0/g, " ");

  it("renders KPIs correctly without NaN and with BRL formatting", () => {
    const rawHtml = renderToString(
      <DecisionsKpiGrid kpis={mockData.kpis} windowDays={90} />,
    );
    const html = cleanHtml(rawHtml);

    // Capital em estoque
    expect(html).toContain("Capital em estoque");
    expect(html).toContain("146.662,73");

    // Capital sem saída — ativos
    expect(html).toContain("Capital sem saída — ativos");
    expect(html).toContain("31.302,57");

    // Demanda sem estoque
    expect(html).toContain("Demanda sem estoque");
    expect(html).toContain("20");
    expect(html).toContain("SKUs");

    // Baixa cobertura < 30 dias (HTML-encoded as &lt;)
    expect(html).toContain("Baixa cobertura");
    expect(html).toContain("&lt; 30 dias");
    expect(html).toContain("6");

    // Lucro bruto estimado
    expect(html).toContain("Lucro bruto estimado ao custo atual");
    expect(html).toContain("35.262,87");

    // Não deve conter NaN
    expect(html).not.toContain("NaN");
  });

  it("displays 'Sem estoque' in replenishment table for item with zero stock, never '0 dias' in badge", () => {
    const html = cleanHtml(
      renderToString(
        <DecisionsReplenishmentTable
          replenishment={mockData.replenishment}
          windowDays={90}
        />,
      ),
    );

    expect(html).toContain("Sem estoque");
    expect(html).not.toContain(">0 dias<");
    expect(html).not.toContain(">0.0 dias<");
  });

  it("renders replenishment items and channels correctly", () => {
    const html = cleanHtml(
      renderToString(
        <DecisionsReplenishmentTable
          replenishment={mockData.replenishment}
          windowDays={90}
        />,
      ),
    );

    expect(html).toContain("Shape Nineclouds Full Logo Branco 8.125");
    expect(html).toContain("Atacado");
    expect(html).toContain("Varejo");
    expect(html).toContain("630,71");
    expect(html).toContain("50.2%");
  });

  it("renders capital items correctly", () => {
    const html = cleanHtml(
      renderToString(
        <DecisionsCapitalTable
          capitalOptimization={mockData.capitalOptimization}
          windowDays={90}
        />,
      ),
    );

    expect(html).toContain("Camiseta YourFace");
    expect(html).toContain("104 dias");
    expect(html).toContain("1.138,10");
  });

  it("renders full DecisionsView in loaded state", () => {
    const html = cleanHtml(
      renderToString(
        <DecisionsView
          data={mockData}
          isLoading={false}
          error={null}
          windowDays={90}
          onSelectWindowDays={vi.fn()}
          categoryTree={[]}
          selectedCategorySourceId={null}
          onSelectCategorySourceId={vi.fn()}
          onRefresh={vi.fn()}
        />,
      ),
    );

    expect(html).toContain("Central de Decisões");
    expect(html).toContain("20/09/2026");
    expect(html).toContain("Reposição — Onde Repor Primeiro");
    expect(html).toContain("Capital — Onde Evitar Compra");
  });
});
