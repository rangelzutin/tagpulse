import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { TopProductsCard } from "./TopProductsCard";
import type { TopProductItem } from "../api/bi";

describe("TopProductsCard — Ranking Analítico de Produtos (Fase 3B)", () => {
  const mockProducts: TopProductItem[] = [
    {
      productId: "pid-1",
      code: "SHP-001",
      description: "Shape Nineclouds Maple 8.0",
      category: "Shapes",
      commercialLine: "NINECLOUDS",
      quantity: 15,
      realizedQuantity: 15,
      grossItemAmount: 4500,
      realizedRevenue: 4500,
      revenueShare: 20.64,
      distinctSales: 10,
      distinctCustomers: 8,
      currentStockQuantity: 20,
      retailSalePrice: 300,
      effectiveCost: 150,
      cmvEstimatedCurrentCost: 2250,
      grossProfitEstimatedCurrentCost: 2250,
      grossMarginEstimatedCurrentCost: 50.0,
      shapeCommercialSize: "8.0",
      abcClass: "B",
    },
    {
      productId: "pid-2",
      code: "ROD-002",
      description: "Roda Spitfire Classic 52mm",
      category: "Rodas",
      commercialLine: "SPITFIRE",
      quantity: 25,
      realizedQuantity: 25,
      grossItemAmount: 6250,
      realizedRevenue: 6000,
      revenueShare: 27.52,
      distinctSales: 18,
      distinctCustomers: 14,
      currentStockQuantity: 5,
      retailSalePrice: 250,
      effectiveCost: 120,
      cmvEstimatedCurrentCost: 3000,
      grossProfitEstimatedCurrentCost: 3000,
      grossMarginEstimatedCurrentCost: 50.0,
      shapeCommercialSize: null,
      abcClass: "A",
    },
    {
      productId: "pid-3",
      code: "TRK-003",
      description: "Truck Independent Stage 11 139mm",
      category: "Trucks",
      commercialLine: "INDEPENDENT",
      quantity: 8,
      realizedQuantity: 8,
      grossItemAmount: 4000,
      realizedRevenue: 4000,
      revenueShare: 18.35,
      distinctSales: 7,
      distinctCustomers: 6,
      currentStockQuantity: null, // Null stock
      retailSalePrice: 500,
      effectiveCost: 280,
      cmvEstimatedCurrentCost: 2240,
      grossProfitEstimatedCurrentCost: 1760,
      grossMarginEstimatedCurrentCost: 44.0,
      shapeCommercialSize: null,
      abcClass: "B",
    },
    {
      productId: "pid-4",
      code: "ROL-004",
      description: "Rolamento Bones Reds",
      category: "Rolamentos",
      commercialLine: "BONES",
      quantity: 40,
      realizedQuantity: 40,
      grossItemAmount: 4800,
      realizedRevenue: 4800,
      revenueShare: 22.02,
      distinctSales: 22,
      distinctCustomers: 20,
      currentStockQuantity: 0, // Zero stock
      retailSalePrice: 120,
      effectiveCost: 60,
      cmvEstimatedCurrentCost: 2400,
      grossProfitEstimatedCurrentCost: 2400,
      grossMarginEstimatedCurrentCost: 50.0,
      shapeCommercialSize: null,
      abcClass: "A",
    },
    {
      productId: "pid-5",
      code: "LIX-005",
      description: "Lixa Jessup Original",
      category: "Lixas",
      commercialLine: "JESSUP",
      quantity: 50,
      realizedQuantity: 50,
      grossItemAmount: 2500,
      realizedRevenue: 2500,
      revenueShare: 11.47,
      distinctSales: 35,
      distinctCustomers: 30,
      currentStockQuantity: 50,
      retailSalePrice: 50,
      effectiveCost: null, // Null cost / no margin
      cmvEstimatedCurrentCost: null,
      grossProfitEstimatedCurrentCost: null,
      grossMarginEstimatedCurrentCost: null,
      shapeCommercialSize: null,
      abcClass: "C",
    },
  ];

  const totalRevenue = 21800;
  const totalQuantity = 138;

  describe("1. Renderização e Estrutura de Colunas", () => {
    it("renders analytical table with all required columns and default sort Faturamento DESC", () => {
      const html = renderToString(
        <TopProductsCard
          products={mockProducts}
          totalRevenue={totalRevenue}
          totalQuantity={totalQuantity}
        />,
      );

      // Search input present with placeholder
      expect(html).toContain('placeholder="Buscar produto ou código..."');

      // Título e colunas da tabela analítica
      expect(html).toContain("Ranking de Produtos");
      expect(html).toContain("Produto / SKU");
      expect(html).toContain("Marca-Linha / Categoria");
      expect(html).toContain("Faturamento");
      expect(html).toContain("Unidades");
      expect(html).toContain("Resultado estimado");
      expect(html).toContain("Margem estimada");
      expect(html).toContain("Estoque");
      expect(html).toContain("ABC");

      // Default sort is revenue DESC -> Roda Spitfire (6000) should be #1, followed by Rolamento Bones (4800)
      const spitfireIdx = html.indexOf("Roda Spitfire Classic 52mm");
      const rolamentoIdx = html.indexOf("Rolamento Bones Reds");
      const shapeIdx = html.indexOf("Shape Nineclouds Maple 8.0");
      const truckIdx = html.indexOf("Truck Independent Stage 11 139mm");
      const lixaIdx = html.indexOf("Lixa Jessup Original");

      expect(spitfireIdx).toBeLessThan(rolamentoIdx);
      expect(rolamentoIdx).toBeLessThan(shapeIdx);
      expect(shapeIdx).toBeLessThan(truckIdx);
      expect(truckIdx).toBeLessThan(lixaIdx);

      // Shape size badge presente no produto de shape
      expect(html).toContain('8.0"');

      // Classes ABC presentes
      expect(html).toContain("tp-abc-a");
      expect(html).toContain("tp-abc-b");
      expect(html).toContain("tp-abc-c");
    });
  });

  describe("2. Busca Textual Local", () => {
    it("filters products by description", () => {
      const html = renderToString(
        <TopProductsCard
          products={mockProducts}
          totalRevenue={totalRevenue}
          totalQuantity={totalQuantity}
          initialSearchTerm="Spitfire"
        />,
      );

      expect(html).toContain("Roda Spitfire Classic 52mm");
      expect(html).not.toContain("Shape Nineclouds Maple 8.0");
      expect(html).not.toContain("Truck Independent Stage 11 139mm");
      expect(html).toContain("1 de 5 produtos");
    });

    it("filters products by code / SKU", () => {
      const html = renderToString(
        <TopProductsCard
          products={mockProducts}
          totalRevenue={totalRevenue}
          totalQuantity={totalQuantity}
          initialSearchTerm="TRK-003"
        />,
      );

      expect(html).toContain("Truck Independent Stage 11 139mm");
      expect(html).not.toContain("Roda Spitfire Classic 52mm");
      expect(html).toContain("1 de 5 produtos");
    });

    it("performs case-insensitive search", () => {
      const html = renderToString(
        <TopProductsCard
          products={mockProducts}
          totalRevenue={totalRevenue}
          totalQuantity={totalQuantity}
          initialSearchTerm="nineclouds"
        />,
      );

      expect(html).toContain("Shape Nineclouds Maple 8.0");
      expect(html).not.toContain("Rolamento Bones Reds");
    });

    it("renders empty state message when no items match and does NOT show pagination", () => {
      const html = renderToString(
        <TopProductsCard
          products={mockProducts}
          totalRevenue={totalRevenue}
          totalQuantity={totalQuantity}
          initialSearchTerm="inexistente xyz"
        />,
      );

      expect(html).toContain("Nenhum produto encontrado com os filtros selecionados.");
      expect(html).toContain("0 de 5 produtos");
      expect(html).not.toContain("tp-pagination-bar");
    });
  });

  describe("3. Ordenação Analítica e Nulls Last", () => {
    it("sorts by Produto ASC", () => {
      const html = renderToString(
        <TopProductsCard
          products={mockProducts}
          totalRevenue={totalRevenue}
          totalQuantity={totalQuantity}
          initialSortField="product"
          initialSortDirection="asc"
        />,
      );

      const lixaIdx = html.indexOf("Lixa Jessup Original");
      const rodaIdx = html.indexOf("Roda Spitfire Classic 52mm");
      const rolIdx = html.indexOf("Rolamento Bones Reds");
      const shapeIdx = html.indexOf("Shape Nineclouds Maple 8.0");
      const truckIdx = html.indexOf("Truck Independent Stage 11 139mm");

      expect(lixaIdx).toBeLessThan(rodaIdx);
      expect(rodaIdx).toBeLessThan(rolIdx);
      expect(rolIdx).toBeLessThan(shapeIdx);
      expect(shapeIdx).toBeLessThan(truckIdx);
    });

    it("sorts by Quantidade (Volume) DESC", () => {
      const html = renderToString(
        <TopProductsCard
          products={mockProducts}
          totalRevenue={totalRevenue}
          totalQuantity={totalQuantity}
          initialSortField="quantity"
          initialSortDirection="desc"
        />,
      );

      // Lixa (50) -> Rolamento (40) -> Roda (25) -> Shape (15) -> Truck (8)
      const lixaIdx = html.indexOf("Lixa Jessup Original");
      const rolIdx = html.indexOf("Rolamento Bones Reds");
      const rodaIdx = html.indexOf("Roda Spitfire Classic 52mm");
      const shapeIdx = html.indexOf("Shape Nineclouds Maple 8.0");
      const truckIdx = html.indexOf("Truck Independent Stage 11 139mm");

      expect(lixaIdx).toBeLessThan(rolIdx);
      expect(rolIdx).toBeLessThan(rodaIdx);
      expect(rodaIdx).toBeLessThan(shapeIdx);
      expect(shapeIdx).toBeLessThan(truckIdx);
    });

    it("sorts by Lucro estimado DESC with nulls last", () => {
      const html = renderToString(
        <TopProductsCard
          products={mockProducts}
          totalRevenue={totalRevenue}
          totalQuantity={totalQuantity}
          initialSortField="profit"
          initialSortDirection="desc"
        />,
      );

      // Lucro: Roda (3000) -> Rolamento (2400) -> Shape (2250) -> Truck (1760) -> Lixa (null - last)
      const rodaIdx = html.indexOf("Roda Spitfire Classic 52mm");
      const rolIdx = html.indexOf("Rolamento Bones Reds");
      const shapeIdx = html.indexOf("Shape Nineclouds Maple 8.0");
      const truckIdx = html.indexOf("Truck Independent Stage 11 139mm");
      const lixaIdx = html.indexOf("Lixa Jessup Original");

      expect(rodaIdx).toBeLessThan(rolIdx);
      expect(rolIdx).toBeLessThan(shapeIdx);
      expect(shapeIdx).toBeLessThan(truckIdx);
      expect(truckIdx).toBeLessThan(lixaIdx);
    });

    it("sorts by Margem estimada with nulls last", () => {
      const html = renderToString(
        <TopProductsCard
          products={mockProducts}
          totalRevenue={totalRevenue}
          totalQuantity={totalQuantity}
          initialSortField="margin"
          initialSortDirection="desc"
        />,
      );

      // Lixa has null margin, must be last!
      const lixaIdx = html.indexOf("Lixa Jessup Original");
      const truckIdx = html.indexOf("Truck Independent Stage 11 139mm");
      expect(truckIdx).toBeLessThan(lixaIdx);
    });

    it("sorts by Estoque with NULL always last", () => {
      const htmlDesc = renderToString(
        <TopProductsCard
          products={mockProducts}
          totalRevenue={totalRevenue}
          totalQuantity={totalQuantity}
          initialSortField="stock"
          initialSortDirection="desc"
        />,
      );

      // DESC: Lixa (50) -> Shape (20) -> Roda (5) -> Rolamento (0) -> Truck (null - last)
      const lixaDesc = htmlDesc.indexOf("Lixa Jessup Original");
      const shapeDesc = htmlDesc.indexOf("Shape Nineclouds Maple 8.0");
      const rodaDesc = htmlDesc.indexOf("Roda Spitfire Classic 52mm");
      const rolDesc = htmlDesc.indexOf("Rolamento Bones Reds");
      const truckDesc = htmlDesc.indexOf("Truck Independent Stage 11 139mm");

      expect(lixaDesc).toBeLessThan(shapeDesc);
      expect(shapeDesc).toBeLessThan(rodaDesc);
      expect(rodaDesc).toBeLessThan(rolDesc);
      expect(rolDesc).toBeLessThan(truckDesc);
    });

    it("sorts by Curva ABC (A first, then B, then C, null last)", () => {
      const html = renderToString(
        <TopProductsCard
          products={mockProducts}
          totalRevenue={totalRevenue}
          totalQuantity={totalQuantity}
          initialSortField="abc"
          initialSortDirection="asc"
        />,
      );

      // Classes A: Roda Spitfire (6000), Rolamento Bones (4800)
      // Classes B: Shape Nineclouds (4500), Truck Independent (4000)
      // Classes C: Lixa Jessup (2500)
      const rodaIdx = html.indexOf("Roda Spitfire Classic 52mm");
      const shapeIdx = html.indexOf("Shape Nineclouds Maple 8.0");
      const lixaIdx = html.indexOf("Lixa Jessup Original");

      expect(rodaIdx).toBeLessThan(shapeIdx);
      expect(shapeIdx).toBeLessThan(lixaIdx);
    });
  });

  describe("4. Paginação", () => {
    const manyProducts: TopProductItem[] = Array.from({ length: 35 }, (_, i) => ({
      productId: `gen-${i + 1}`,
      code: `GEN-${String(i + 1).padStart(3, "0")}`,
      description: `Produto Alfa ${String(i + 1).padStart(2, "0")}`,
      category: "Geral",
      commercialLine: "MARCA_ALFA",
      quantity: (i + 1) * 2,
      realizedQuantity: (i + 1) * 2,
      grossItemAmount: (i + 1) * 100,
      realizedRevenue: (i + 1) * 100,
      revenueShare: 1.0,
      distinctSales: i + 1,
      distinctCustomers: i + 1,
      currentStockQuantity: (i + 1) * 10,
      retailSalePrice: 100,
      effectiveCost: 50,
      cmvEstimatedCurrentCost: (i + 1) * 50,
      grossProfitEstimatedCurrentCost: (i + 1) * 50,
      grossMarginEstimatedCurrentCost: 50.0,
      shapeCommercialSize: null,
      abcClass: "A",
    }));

    it("applies search before pagination", () => {
      const html = renderToString(
        <TopProductsCard
          products={manyProducts}
          totalRevenue={10000}
          totalQuantity={1000}
          initialSearchTerm="Produto Alfa 0"
        />,
      );

      expect(html).toContain("9 de 35 produtos");
      expect(html).toContain("Produto Alfa 01");
      expect(html).toContain("Produto Alfa 09");
      expect(html).not.toContain("Produto Alfa 10");
      expect(html).not.toContain("tp-pagination-bar");
    });

    it("paginates 35 items into pages and displays pagination controls", () => {
      const html = renderToString(
        <TopProductsCard
          products={manyProducts}
          totalRevenue={10000}
          totalQuantity={1000}
        />,
      );

      expect(html).toContain("35 produtos");
      expect(html).toContain("tp-pagination-bar");
      expect(html).toContain("1 / 3");
      expect(html).toContain("Mostrando 1–15 de 35 produtos");
    });
  });
});
