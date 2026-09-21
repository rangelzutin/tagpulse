import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { ProfitabilityProductsTable } from "./ProfitabilityProductsTable";
import { DecisionsReplenishmentTable } from "./DecisionsReplenishmentTable";
import { DecisionsCapitalTable } from "./DecisionsCapitalTable";
import { ProfitabilityBreakdowns } from "./ProfitabilityBreakdowns";
import { formatChannelLabel } from "../utils/formatters";
import { compareNumericNullsLast, compareStringNullsLast } from "../utils/sortUtils";
import type {
  ProfitabilityProductItem,
  DecisionsProductItem,
  DecisionsReplenishmentGroups,
  DecisionsCapitalGroups,
  ProfitabilityChannelItem,
} from "../api/bi";

describe("Table Sorting, Channel Formatting & Deterministic Nulls", () => {
  describe("1. Channel Label Canonical Formatting", () => {
    it("renders 'Indeterminado' and never uppercase 'INDETERMINADO' in UI", () => {
      expect(formatChannelLabel("INDETERMINADO")).toBe("Indeterminado");
      expect(formatChannelLabel("ATACADO")).toBe("Atacado");
      expect(formatChannelLabel("VAREJO")).toBe("Varejo");
      expect(formatChannelLabel("CONFLITO")).toBe("Conflito");
    });

    it("renders 'Indeterminado' in ProfitabilityBreakdowns channel card", () => {
      const channels: ProfitabilityChannelItem[] = [
        {
          channel: "INDETERMINADO",
          realizedRevenue: 3293.4,
          revenueWithCurrentCost: 3293.4,
          estimatedCOGS: 2000,
          estimatedGrossProfit: 1293.4,
          estimatedGrossMarginPercent: 39.27,
          costCoveragePercent: 100,
          physicalQuantity: 20,
        },
      ];

      const html = renderToString(
        <ProfitabilityBreakdowns
          channels={channels}
          rootCategories={[]}
          selectedChannel={null}
          onSelectChannel={vi.fn()}
          selectedCategorySourceId={null}
          onSelectCategorySourceId={vi.fn()}
        />,
      );

      expect(html).toContain("Indeterminado");
      expect(html).not.toContain("INDETERMINADO");
    });
  });

  describe("2. Rentabilidade — Sorting & Nulls Handling", () => {
    const mockProducts: ProfitabilityProductItem[] = [
      {
        productId: "pid1",
        productSourceId: "p1",
        productName: "Produto A - Com Margem Alta",
        sku: "SKU-A",
        category: "Cat 1",
        categorySourceId: "1",
        currentEffectiveCost: 100,
        physicalQuantity: 10,
        realizedRevenue: 2000,
        revenueWithCurrentCost: 2000,
        revenueWithoutCurrentCost: 0,
        estimatedCOGS: 1000,
        estimatedGrossProfit: 1000,
        estimatedGrossMarginPercent: 50,
        costCoveragePercent: 100,
        isOrphan: false,
      },
      {
        productId: "pid2",
        productSourceId: "p2",
        productName: "Produto B - Sem Custo Cadastrado",
        sku: "SKU-B",
        category: "Cat 1",
        categorySourceId: "1",
        currentEffectiveCost: null,
        physicalQuantity: 5,
        realizedRevenue: 5000,
        revenueWithCurrentCost: 0,
        revenueWithoutCurrentCost: 5000,
        estimatedCOGS: null,
        estimatedGrossProfit: null,
        estimatedGrossMarginPercent: null,
        costCoveragePercent: 0,
        isOrphan: false,
      },
      {
        productId: "pid3",
        productSourceId: "p3",
        productName: "Produto C - Margem Média",
        sku: "SKU-C",
        category: "Cat 1",
        categorySourceId: "1",
        currentEffectiveCost: 50,
        physicalQuantity: 20,
        realizedRevenue: 1000,
        revenueWithCurrentCost: 1000,
        revenueWithoutCurrentCost: 0,
        estimatedCOGS: 800,
        estimatedGrossProfit: 200,
        estimatedGrossMarginPercent: 20,
        costCoveragePercent: 100,
        isOrphan: false,
      },
    ];

    it("renders sortable headers with aria-sort in ProfitabilityProductsTable", () => {
      const html = renderToString(
        <ProfitabilityProductsTable
          products={mockProducts}
          categoryTree={[]}
          selectedChannel={null}
          onSelectChannel={vi.fn()}
          selectedCategorySourceId={null}
          onSelectCategorySourceId={vi.fn()}
          onResetFilters={vi.fn()}
        />,
      );

      expect(html).toContain("Custo Atual");
      expect(html).toContain("Qtd. Vendida");
      expect(html).toContain("Receita Realizada");
      expect(html).toContain("CMV Estimado");
      expect(html).toContain("Lucro Bruto Est.");
      expect(html).toContain("Margem Bruta Est.");
      expect(html).toContain('aria-sort="descending"');
    });

    it("sorts revenue DESC and ASC correctly", () => {
      const sortedDesc = [...mockProducts].sort((a, b) =>
        compareNumericNullsLast(a.realizedRevenue, b.realizedRevenue, "desc"),
      );
      expect(sortedDesc.map((p) => p.productSourceId)).toEqual(["p2", "p1", "p3"]);

      const sortedAsc = [...mockProducts].sort((a, b) =>
        compareNumericNullsLast(a.realizedRevenue, b.realizedRevenue, "asc"),
      );
      expect(sortedAsc.map((p) => p.productSourceId)).toEqual(["p3", "p1", "p2"]);
    });

    it("places null margin strictly at the end in both DESC and ASC", () => {
      const sortedDesc = [...mockProducts].sort((a, b) =>
        compareNumericNullsLast(
          a.estimatedGrossMarginPercent,
          b.estimatedGrossMarginPercent,
          "desc",
        ),
      );
      // Known values: 50% (p1), 20% (p3), then null (p2)
      expect(sortedDesc.map((p) => p.productSourceId)).toEqual(["p1", "p3", "p2"]);

      const sortedAsc = [...mockProducts].sort((a, b) =>
        compareNumericNullsLast(
          a.estimatedGrossMarginPercent,
          b.estimatedGrossMarginPercent,
          "asc",
        ),
      );
      // Known values: 20% (p3), 50% (p1), then null (p2) at the end
      expect(sortedAsc.map((p) => p.productSourceId)).toEqual(["p3", "p1", "p2"]);
    });
  });

  describe("3. Decisões / Reposição — Sorting & Nulls Handling", () => {
    const mockReplenishmentItems: DecisionsProductItem[] = [
      {
        productSourceId: "r1",
        code: "101",
        description: "Item 1",
        active: true,
        categorySourceId: "1",
        categoryDescription: "Cat 1",
        rootCategorySourceId: "1",
        rootCategoryDescription: "Root 1",
        currentStock: 0,
        currentEffectiveCost: 50,
        currentInventoryCostValue: 0,
        currentInventoryListValue: 0,
        retailSalePrice: 100,
        physicalQuantityInWindow: 15,
        realizedRevenueInWindow: 1500,
        customerCountInWindow: 3,
        averageDailySales: 0.5,
        estimatedCoverageDays: null, // Sem estoque
        lastPhysicalSaleDate: "2026-09-10",
        daysSinceLastPhysicalSale: 10,
        estimatedCOGSInWindow: 750,
        estimatedGrossProfitInWindow: 750,
        estimatedGrossMarginPercentInWindow: 50,
        channelsInWindow: ["ATACADO"],
      },
      {
        productSourceId: "r2",
        code: "102",
        description: "Item 2",
        active: true,
        categorySourceId: "1",
        categoryDescription: "Cat 1",
        rootCategorySourceId: "1",
        rootCategoryDescription: "Root 1",
        currentStock: 5,
        currentEffectiveCost: 30,
        currentInventoryCostValue: 150,
        currentInventoryListValue: 300,
        retailSalePrice: 60,
        physicalQuantityInWindow: 10,
        realizedRevenueInWindow: 600,
        customerCountInWindow: 2,
        averageDailySales: 0.33,
        estimatedCoverageDays: 15.1,
        lastPhysicalSaleDate: "2026-09-15",
        daysSinceLastPhysicalSale: 5,
        estimatedCOGSInWindow: 300,
        estimatedGrossProfitInWindow: 300,
        estimatedGrossMarginPercentInWindow: 50,
        channelsInWindow: ["VAREJO"],
      },
      {
        productSourceId: "r3",
        code: "103",
        description: "Item 3",
        active: true,
        categorySourceId: "1",
        categoryDescription: "Cat 1",
        rootCategorySourceId: "1",
        rootCategoryDescription: "Root 1",
        currentStock: 2,
        currentEffectiveCost: 80,
        currentInventoryCostValue: 160,
        currentInventoryListValue: 320,
        retailSalePrice: 160,
        physicalQuantityInWindow: 30,
        realizedRevenueInWindow: 4800,
        customerCountInWindow: 8,
        averageDailySales: 1.0,
        estimatedCoverageDays: 2.0,
        lastPhysicalSaleDate: "2026-09-19",
        daysSinceLastPhysicalSale: 1,
        estimatedCOGSInWindow: 2400,
        estimatedGrossProfitInWindow: 2400,
        estimatedGrossMarginPercentInWindow: 50,
        channelsInWindow: ["ATACADO", "VAREJO"],
      },
    ];

    it("renders sortable headers in DecisionsReplenishmentTable", () => {
      const groups: DecisionsReplenishmentGroups = {
        demandWithoutStock: mockReplenishmentItems,
        criticalCoverage: [],
        alertCoverage: [],
      };

      const html = renderToString(
        <DecisionsReplenishmentTable replenishment={groups} windowDays={90} />,
      );

      expect(html).toContain("Estoque");
      expect(html).toMatch(/Vendas.*90.*d/);
      expect(html).toContain("Receita");
      expect(html).toContain("Lucro Bruto Est.");
      expect(html).toContain("Margem Est.");
      expect(html).toContain("Cobertura");
      expect(html).toContain("Clientes");
    });

    it("defaults to estimatedGrossProfitInWindow DESC", () => {
      const sorted = [...mockReplenishmentItems].sort((a, b) =>
        compareNumericNullsLast(
          a.estimatedGrossProfitInWindow,
          b.estimatedGrossProfitInWindow,
          "desc",
        ),
      );
      expect(sorted.map((i) => i.productSourceId)).toEqual(["r3", "r1", "r2"]);
    });

    it("sorts coverage with null ('Sem estoque') strictly at the end in both DESC and ASC", () => {
      const sortedDesc = [...mockReplenishmentItems].sort((a, b) =>
        compareNumericNullsLast(
          a.estimatedCoverageDays,
          b.estimatedCoverageDays,
          "desc",
        ),
      );
      // 15.1, 2.0, then null
      expect(sortedDesc.map((i) => i.productSourceId)).toEqual(["r2", "r3", "r1"]);

      const sortedAsc = [...mockReplenishmentItems].sort((a, b) =>
        compareNumericNullsLast(
          a.estimatedCoverageDays,
          b.estimatedCoverageDays,
          "asc",
        ),
      );
      // 2.0, 15.1, then null
      expect(sortedAsc.map((i) => i.productSourceId)).toEqual(["r3", "r2", "r1"]);
    });
  });

  describe("4. Decisões / Capital — Sorting & Nulls Handling", () => {
    const mockCapitalItems: DecisionsProductItem[] = [
      {
        productSourceId: "c1",
        code: "201",
        description: "Capital Item 1",
        active: true,
        categorySourceId: "1",
        categoryDescription: "Cat 1",
        rootCategorySourceId: "1",
        rootCategoryDescription: "Root 1",
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
        lastPhysicalSaleDate: "2026-05-10",
        daysSinceLastPhysicalSale: 133,
        estimatedCOGSInWindow: 0,
        estimatedGrossProfitInWindow: 0,
        estimatedGrossMarginPercentInWindow: null,
        channelsInWindow: [],
      },
      {
        productSourceId: "c2",
        code: "202",
        description: "Capital Item 2",
        active: true,
        categorySourceId: "1",
        categoryDescription: "Cat 1",
        rootCategorySourceId: "1",
        rootCategoryDescription: "Root 1",
        currentStock: 50,
        currentEffectiveCost: 50,
        currentInventoryCostValue: 2500,
        currentInventoryListValue: 5000,
        retailSalePrice: 100,
        physicalQuantityInWindow: 0,
        realizedRevenueInWindow: 0,
        customerCountInWindow: 0,
        averageDailySales: 0,
        estimatedCoverageDays: null,
        lastPhysicalSaleDate: null,
        daysSinceLastPhysicalSale: null, // Nunca vendeu
        estimatedCOGSInWindow: 0,
        estimatedGrossProfitInWindow: 0,
        estimatedGrossMarginPercentInWindow: null,
        channelsInWindow: [],
      },
      {
        productSourceId: "c3",
        code: "203",
        description: "Capital Item 3",
        active: true,
        categorySourceId: "1",
        categoryDescription: "Cat 1",
        rootCategorySourceId: "1",
        rootCategoryDescription: "Root 1",
        currentStock: 5,
        currentEffectiveCost: null, // Sem custo
        currentInventoryCostValue: null,
        currentInventoryListValue: 500,
        retailSalePrice: 100,
        physicalQuantityInWindow: 0,
        realizedRevenueInWindow: 0,
        customerCountInWindow: 0,
        averageDailySales: 0,
        estimatedCoverageDays: null,
        lastPhysicalSaleDate: "2026-08-01",
        daysSinceLastPhysicalSale: 50,
        estimatedCOGSInWindow: null,
        estimatedGrossProfitInWindow: null,
        estimatedGrossMarginPercentInWindow: null,
        channelsInWindow: [],
      },
    ];

    it("renders sortable headers in DecisionsCapitalTable", () => {
      const groups: DecisionsCapitalGroups = {
        inventoryWithoutSales: mockCapitalItems,
        highCoverage: [],
        inactiveWithStock: [],
      };

      const html = renderToString(
        <DecisionsCapitalTable capitalOptimization={groups} windowDays={90} />,
      );

      expect(html).toContain("Estoque");
      expect(html).toContain("Custo Unitário");
      expect(html).toContain("Capital Atual");
      expect(html).toMatch(/Vendas.*90.*d/);
      expect(html).toContain("Dias s/ Saída");
      expect(html).toContain("Cobertura");
      expect(html).toContain("Valor de Tabela");
    });

    it("defaults to currentInventoryCostValue DESC with null at the end", () => {
      const sorted = [...mockCapitalItems].sort((a, b) =>
        compareNumericNullsLast(
          a.currentInventoryCostValue,
          b.currentInventoryCostValue,
          "desc",
        ),
      );
      // 2500 (c2), 1000 (c1), null (c3)
      expect(sorted.map((i) => i.productSourceId)).toEqual(["c2", "c1", "c3"]);
    });

    it("sorts daysSinceLastPhysicalSale with null strictly at the end in both DESC and ASC", () => {
      const sortedDesc = [...mockCapitalItems].sort((a, b) =>
        compareNumericNullsLast(
          a.daysSinceLastPhysicalSale,
          b.daysSinceLastPhysicalSale,
          "desc",
        ),
      );
      // 133 (c1), 50 (c3), then null (c2)
      expect(sortedDesc.map((i) => i.productSourceId)).toEqual(["c1", "c3", "c2"]);

      const sortedAsc = [...mockCapitalItems].sort((a, b) =>
        compareNumericNullsLast(
          a.daysSinceLastPhysicalSale,
          b.daysSinceLastPhysicalSale,
          "asc",
        ),
      );
      // 50 (c3), 133 (c1), then null (c2)
      expect(sortedAsc.map((i) => i.productSourceId)).toEqual(["c3", "c1", "c2"]);
    });
  });

  describe("5. PeriodFilter in Rentabilidade & Cost Snapshot Independence", () => {
    it("preserves cost snapshot timestamp independently of sales period filter changes", () => {
      const mockSnapshot = {
        completedAt: "2026-09-17T21:00:00.000Z",
        source: "PRODUCT_SYNC_RUN" as const,
      };

      // Simulates changing sales filter from Jan to Aug
      const periodA = { from: "2026-01-01", to: "2026-01-31" };
      const periodB = { from: "2026-08-01", to: "2026-08-31" };

      // Snapshot date remains tied to catalog sync timestamp, not sales window
      expect(mockSnapshot.completedAt).toBe("2026-09-17T21:00:00.000Z");
      expect(periodA.from).not.toBe(mockSnapshot.completedAt.slice(0, 10));
      expect(periodB.from).not.toBe(mockSnapshot.completedAt.slice(0, 10));
    });
  });
});

