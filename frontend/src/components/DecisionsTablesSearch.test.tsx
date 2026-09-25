import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { DecisionsReplenishmentTable } from "./DecisionsReplenishmentTable";
import { DecisionsCapitalTable } from "./DecisionsCapitalTable";
import type { DecisionsProductItem, DecisionsReplenishmentGroups, DecisionsCapitalGroups } from "../api/bi";

describe("Decisions Tables — Local Text Search (Refinamento 3)", () => {
  const mockReplenishmentItems: DecisionsProductItem[] = [
    {
      productSourceId: "1431",
      code: "SKU-1431",
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
    {
      productSourceId: "1834",
      code: "SKU-1834",
      description: "Roda Spitfire Formula Four 54mm",
      active: true,
      categorySourceId: "60",
      categoryDescription: "Rodas",
      rootCategorySourceId: "49",
      rootCategoryDescription: "1 - NINECLOUDS",
      currentStock: 0,
      currentEffectiveCost: 150,
      currentInventoryCostValue: 0,
      currentInventoryListValue: 0,
      retailSalePrice: 300,
      physicalQuantityInWindow: 8,
      realizedRevenueInWindow: 2400,
      customerCountInWindow: 4,
      averageDailySales: 0.09,
      estimatedCoverageDays: null,
      lastPhysicalSaleDate: "2026-09-15",
      daysSinceLastPhysicalSale: 5,
      estimatedCOGSInWindow: 1200,
      estimatedGrossProfitInWindow: 1200,
      estimatedGrossMarginPercentInWindow: 50.0,
      channelsInWindow: ["VAREJO"],
    },
    {
      productSourceId: "2080",
      code: "TRUCK-999",
      description: "Truck Independent 139 Stage 11",
      active: true,
      categorySourceId: "70",
      categoryDescription: "Trucks",
      rootCategorySourceId: "50",
      rootCategoryDescription: "3 - HUSTLER",
      currentStock: 0,
      currentEffectiveCost: 200,
      currentInventoryCostValue: 0,
      currentInventoryListValue: 0,
      retailSalePrice: 400,
      physicalQuantityInWindow: 3,
      realizedRevenueInWindow: 1200,
      customerCountInWindow: 2,
      averageDailySales: 0.03,
      estimatedCoverageDays: null,
      lastPhysicalSaleDate: "2026-09-01",
      daysSinceLastPhysicalSale: 19,
      estimatedCOGSInWindow: 600,
      estimatedGrossProfitInWindow: 600,
      estimatedGrossMarginPercentInWindow: 50.0,
      channelsInWindow: ["ATACADO"],
    },
  ];

  const mockCapitalItems: DecisionsProductItem[] = [
    {
      productSourceId: "3001",
      code: "CAM-01",
      description: "Camiseta YourFace Classic",
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
    {
      productSourceId: "3002",
      code: "SHP-02",
      description: "Shape Hustler Maple 8.0",
      active: true,
      categorySourceId: "31",
      categoryDescription: "Shapes",
      rootCategorySourceId: "50",
      rootCategoryDescription: "3 - HUSTLER",
      currentStock: 10,
      currentEffectiveCost: 100,
      currentInventoryCostValue: 1000,
      currentInventoryListValue: 2000,
      retailSalePrice: 200,
      physicalQuantityInWindow: 0,
      realizedRevenueInWindow: 0,
      customerCountInWindow: 0,
      averageDailySales: 0,
      estimatedCoverageDays: null,
      lastPhysicalSaleDate: "2026-05-15",
      daysSinceLastPhysicalSale: 128,
      estimatedCOGSInWindow: null,
      estimatedGrossProfitInWindow: null,
      estimatedGrossMarginPercentInWindow: null,
      channelsInWindow: [],
    },
  ];

  const mockReplenishment: DecisionsReplenishmentGroups = {
    demandWithoutStock: mockReplenishmentItems,
    criticalCoverage: [],
    alertCoverage: [],
  };

  const mockCapital: DecisionsCapitalGroups = {
    inventoryWithoutSales: mockCapitalItems,
    highCoverage: [],
    inactiveWithStock: [],
  };

  const cleanHtml = (html: string) =>
    html.replace(/<!-- -->/g, "").replace(/\u00A0/g, " ");

  describe("A. Reposição Table — Search", () => {
    it("renders search box with correct placeholder and styling", () => {
      const html = cleanHtml(
        renderToString(
          <DecisionsReplenishmentTable
            replenishment={mockReplenishment}
            windowDays={90}
          />,
        ),
      );

      expect(html).toContain('placeholder="Buscar produto ou código..."');
      expect(html).toContain("tp-profit-search-input");
      expect(html).toContain("tp-decisions-search-wrap");
    });

    it("filters items by product description (name)", () => {
      const html = cleanHtml(
        renderToString(
          <DecisionsReplenishmentTable
            replenishment={mockReplenishment}
            windowDays={90}
            initialSearchTerm="Spitfire"
          />,
        ),
      );

      expect(html).toContain("Roda Spitfire Formula Four 54mm");
      expect(html).not.toContain("Shape Nineclouds Full Logo Branco 8.125");
      expect(html).not.toContain("Truck Independent 139 Stage 11");
    });

    it("filters items by product code / SKU", () => {
      const html = cleanHtml(
        renderToString(
          <DecisionsReplenishmentTable
            replenishment={mockReplenishment}
            windowDays={90}
            initialSearchTerm="TRUCK-999"
          />,
        ),
      );

      expect(html).toContain("Truck Independent 139 Stage 11");
      expect(html).not.toContain("Shape Nineclouds Full Logo Branco 8.125");
      expect(html).not.toContain("Roda Spitfire Formula Four 54mm");
    });

    it("filters items by productSourceId", () => {
      const html = cleanHtml(
        renderToString(
          <DecisionsReplenishmentTable
            replenishment={mockReplenishment}
            windowDays={90}
            initialSearchTerm="1431"
          />,
        ),
      );

      expect(html).toContain("Shape Nineclouds Full Logo Branco 8.125");
      expect(html).not.toContain("Roda Spitfire Formula Four 54mm");
      expect(html).not.toContain("Truck Independent 139 Stage 11");
    });

    it("performs case-insensitive search and trims whitespace", () => {
      const html = cleanHtml(
        renderToString(
          <DecisionsReplenishmentTable
            replenishment={mockReplenishment}
            windowDays={90}
            initialSearchTerm="   sPiTfIrE   "
          />,
        ),
      );

      expect(html).toContain("Roda Spitfire Formula Four 54mm");
      expect(html).not.toContain("Shape Nineclouds Full Logo Branco 8.125");
    });

    it("shows compact empty state when no items match the search query and no broken pagination", () => {
      const html = cleanHtml(
        renderToString(
          <DecisionsReplenishmentTable
            replenishment={mockReplenishment}
            windowDays={90}
            initialSearchTerm="Produto Inexistente 999"
          />,
        ),
      );

      expect(html).toContain("Nenhum produto encontrado para esta busca.");
      expect(html).not.toContain("Página 1 de 0");
      expect(html).not.toContain("tp-pagination-bar");
    });
  });

  describe("B. Capital Table — Search", () => {
    it("renders search box with correct placeholder and styling", () => {
      const html = cleanHtml(
        renderToString(
          <DecisionsCapitalTable
            capitalOptimization={mockCapital}
            windowDays={90}
          />,
        ),
      );

      expect(html).toContain('placeholder="Buscar produto ou código..."');
      expect(html).toContain("tp-profit-search-input");
      expect(html).toContain("tp-decisions-search-wrap");
    });

    it("filters items by product description (name)", () => {
      const html = cleanHtml(
        renderToString(
          <DecisionsCapitalTable
            capitalOptimization={mockCapital}
            windowDays={90}
            initialSearchTerm="YourFace"
          />,
        ),
      );

      expect(html).toContain("Camiseta YourFace Classic");
      expect(html).not.toContain("Shape Hustler Maple 8.0");
    });

    it("filters items by code / SKU", () => {
      const html = cleanHtml(
        renderToString(
          <DecisionsCapitalTable
            capitalOptimization={mockCapital}
            windowDays={90}
            initialSearchTerm="SHP-02"
          />,
        ),
      );

      expect(html).toContain("Shape Hustler Maple 8.0");
      expect(html).not.toContain("Camiseta YourFace Classic");
    });

    it("performs case-insensitive search and trims whitespace", () => {
      const html = cleanHtml(
        renderToString(
          <DecisionsCapitalTable
            capitalOptimization={mockCapital}
            windowDays={90}
            initialSearchTerm="   hUsTlEr   "
          />,
        ),
      );

      expect(html).toContain("Shape Hustler Maple 8.0");
      expect(html).not.toContain("Camiseta YourFace Classic");
    });

    it("shows compact empty state when no items match and avoids 'Página 1 de 0'", () => {
      const html = cleanHtml(
        renderToString(
          <DecisionsCapitalTable
            capitalOptimization={mockCapital}
            windowDays={90}
            initialSearchTerm="Sem correspondencia"
          />,
        ),
      );

      expect(html).toContain("Nenhum produto encontrado para esta busca.");
      expect(html).not.toContain("Página 1 de 0");
      expect(html).not.toContain("tp-pagination-bar");
    });
  });

  describe("C. Interaction with Sorting & Pagination", () => {
    it("preserves sorting on filtered search results", () => {
      // Both items match "90" or "e"
      const html = cleanHtml(
        renderToString(
          <DecisionsReplenishmentTable
            replenishment={mockReplenishment}
            windowDays={90}
            initialSearchTerm="Shape"
          />,
        ),
      );

      // Default sort is profit DESC -> 630.71
      expect(html).toContain("630,71");
      expect(html).toContain("Shape Nineclouds Full Logo Branco 8.125");
      // Pagination info reflects 1 product
      expect(html).toContain('de <span class="tp-font-medium">1</span> produtos');
    });
  });
});
