import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { TopProductsCard } from "./TopProductsCard";
import type { TopProductItem } from "../api/bi";

describe("TopProductsCard — Busca + Ordenação do Ranking (Refinamento 4)", () => {
  const mockProducts: TopProductItem[] = [
    {
      productId: "pid-1",
      code: "SHP-001",
      description: "Shape Nineclouds Maple 8.0",
      category: "Shapes",
      quantity: 15,
      grossItemAmount: 4500,
      realizedRevenue: 4500,
      distinctSales: 10,
      distinctCustomers: 8,
      currentStockQuantity: 20,
      retailSalePrice: 300,
      effectiveCost: 150,
    },
    {
      productId: "pid-2",
      code: "ROD-002",
      description: "Roda Spitfire Classic 52mm",
      category: "Rodas",
      quantity: 25,
      grossItemAmount: 6250,
      realizedRevenue: 6000,
      distinctSales: 18,
      distinctCustomers: 14,
      currentStockQuantity: 5,
      retailSalePrice: 250,
      effectiveCost: 120,
    },
    {
      productId: "pid-3",
      code: "TRK-003",
      description: "Truck Independent Stage 11 139mm",
      category: "Trucks",
      quantity: 8,
      grossItemAmount: 4000,
      realizedRevenue: 4000,
      distinctSales: 7,
      distinctCustomers: 6,
      currentStockQuantity: null, // Null stock to test nulls last
      retailSalePrice: 500,
      effectiveCost: 280,
    },
    {
      productId: "pid-4",
      code: "ROL-004",
      description: "Rolamento Bones Reds",
      category: "Rolamentos",
      quantity: 40,
      grossItemAmount: 4800,
      realizedRevenue: 4800,
      distinctSales: 22,
      distinctCustomers: 20,
      currentStockQuantity: 0, // Zero stock
      retailSalePrice: 120,
      effectiveCost: 60,
    },
    {
      productId: "pid-5",
      code: "LIX-005",
      description: "Lixa Jessup Original",
      category: "Lixas",
      quantity: 50,
      grossItemAmount: 2500,
      realizedRevenue: 2500,
      distinctSales: 35,
      distinctCustomers: 30,
      currentStockQuantity: 50,
      retailSalePrice: 50,
      effectiveCost: 20,
    },
  ];

  const totalRevenue = 21800;
  const totalQuantity = 138;

  describe("1. Renderização Padrão & Default Sort", () => {
    it("renders table with default sort Faturamento DESC and active SortableTh", () => {
      const html = renderToString(
        <TopProductsCard
          products={mockProducts}
          totalRevenue={totalRevenue}
          totalQuantity={totalQuantity}
        />,
      );

      // Search input present with placeholder
      expect(html).toContain('placeholder="Buscar produto ou código..."');
      // Sortable headers present
      expect(html).toContain("Produto");
      expect(html).toContain("Faturamento");
      expect(html).toContain("Unidades");
      expect(html).toContain("Participação");
      expect(html).toContain("Clientes");
      expect(html).toContain("Estoque");

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
      expect(html).toContain("1 item");
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
      expect(html).toContain("1 item");
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

    it("trims whitespace from search term", () => {
      const html = renderToString(
        <TopProductsCard
          products={mockProducts}
          totalRevenue={totalRevenue}
          totalQuantity={totalQuantity}
          initialSearchTerm="   Bones   "
        />,
      );

      expect(html).toContain("Rolamento Bones Reds");
      expect(html).not.toContain("Lixa Jessup Original");
    });

    it("renders empty state message when no items match and does NOT show pagination 'Página 1 de 0'", () => {
      const html = renderToString(
        <TopProductsCard
          products={mockProducts}
          totalRevenue={totalRevenue}
          totalQuantity={totalQuantity}
          initialSearchTerm="inexistente xyz"
        />,
      );

      expect(html).toContain("Nenhum produto encontrado para esta busca.");
      expect(html).toContain("0 itens");
      // Must not render pagination or "Página 1 de 0"
      expect(html).not.toContain("Página 1 de 0");
      expect(html).not.toContain("tp-pagination-bar");
    });
  });

  describe("3. Ordenação de Colunas Relevantes", () => {
    it("sorts by Produto ASC (first click alphabetical order)", () => {
      const html = renderToString(
        <TopProductsCard
          products={mockProducts}
          totalRevenue={totalRevenue}
          totalQuantity={totalQuantity}
          initialSortField="product"
          initialSortDirection="asc"
        />,
      );

      // Alphabetical ASC: Lixa Jessup -> Roda Spitfire -> Rolamento Bones -> Shape Nineclouds -> Truck Independent
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

    it("sorts by Quantidade vendida (Unidades) DESC", () => {
      const html = renderToString(
        <TopProductsCard
          products={mockProducts}
          totalRevenue={totalRevenue}
          totalQuantity={totalQuantity}
          initialSortField="quantity"
          initialSortDirection="desc"
        />,
      );

      // Quantities: Lixa (50) -> Rolamento (40) -> Roda (25) -> Shape (15) -> Truck (8)
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

    it("sorts by Clientes distintos DESC", () => {
      const html = renderToString(
        <TopProductsCard
          products={mockProducts}
          totalRevenue={totalRevenue}
          totalQuantity={totalQuantity}
          initialSortField="customers"
          initialSortDirection="desc"
        />,
      );

      // Customers: Lixa (30) -> Rolamento (20) -> Roda (14) -> Shape (8) -> Truck (6)
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

    it("sorts by Estoque with NULL always last (both DESC and ASC)", () => {
      // DESC: Lixa (50) -> Shape (20) -> Roda (5) -> Rolamento (0) -> Truck (null - last)
      const htmlDesc = renderToString(
        <TopProductsCard
          products={mockProducts}
          totalRevenue={totalRevenue}
          totalQuantity={totalQuantity}
          initialSortField="stock"
          initialSortDirection="desc"
        />,
      );

      const lixaDesc = htmlDesc.indexOf("Lixa Jessup Original");
      const shapeDesc = htmlDesc.indexOf("Shape Nineclouds Maple 8.0");
      const rodaDesc = htmlDesc.indexOf("Roda Spitfire Classic 52mm");
      const rolDesc = htmlDesc.indexOf("Rolamento Bones Reds");
      const truckDesc = htmlDesc.indexOf("Truck Independent Stage 11 139mm");

      expect(lixaDesc).toBeLessThan(shapeDesc);
      expect(shapeDesc).toBeLessThan(rodaDesc);
      expect(rodaDesc).toBeLessThan(rolDesc);
      expect(rolDesc).toBeLessThan(truckDesc);

      // ASC: Rolamento (0) -> Roda (5) -> Shape (20) -> Lixa (50) -> Truck (null - still last!)
      const htmlAsc = renderToString(
        <TopProductsCard
          products={mockProducts}
          totalRevenue={totalRevenue}
          totalQuantity={totalQuantity}
          initialSortField="stock"
          initialSortDirection="asc"
        />,
      );

      const rolAsc = htmlAsc.indexOf("Rolamento Bones Reds");
      const rodaAsc = htmlAsc.indexOf("Roda Spitfire Classic 52mm");
      const shapeAsc = htmlAsc.indexOf("Shape Nineclouds Maple 8.0");
      const lixaAsc = htmlAsc.indexOf("Lixa Jessup Original");
      const truckAsc = htmlAsc.indexOf("Truck Independent Stage 11 139mm");

      expect(rolAsc).toBeLessThan(rodaAsc);
      expect(rodaAsc).toBeLessThan(shapeAsc);
      expect(shapeAsc).toBeLessThan(lixaAsc);
      expect(lixaAsc).toBeLessThan(truckAsc);
    });
  });

  describe("4. Pipeline Completo: Base Filter -> Busca -> Ordenação -> Paginação", () => {
    // Generate 35 mock items to test pagination
    const manyProducts: TopProductItem[] = Array.from({ length: 35 }, (_, i) => ({
      productId: `gen-${i + 1}`,
      code: `GEN-${String(i + 1).padStart(3, "0")}`,
      description: `Produto Alfa ${String(i + 1).padStart(2, "0")}`,
      category: "Geral",
      quantity: (i + 1) * 2,
      grossItemAmount: (i + 1) * 100,
      realizedRevenue: (i + 1) * 100,
      distinctSales: i + 1,
      distinctCustomers: i + 1,
      currentStockQuantity: (i + 1) * 10,
      retailSalePrice: 100,
      effectiveCost: 50,
    }));

    it("applies search before pagination (35 items filtered to 3)", () => {
      // Searching for 'Produto Alfa 0' should match: 01, 02, 03, 04, 05, 06, 07, 08, 09 (9 items)
      const html = renderToString(
        <TopProductsCard
          products={manyProducts}
          totalRevenue={10000}
          totalQuantity={1000}
          initialSearchTerm="Produto Alfa 0"
        />,
      );

      expect(html).toContain("9 itens");
      expect(html).toContain("Produto Alfa 01");
      expect(html).toContain("Produto Alfa 09");
      expect(html).not.toContain("Produto Alfa 10");
      // 9 items fit on page 1 (PAGE_SIZE = 15), so no pagination bar needed
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

      expect(html).toContain("35 itens");
      expect(html).toContain("tp-pagination-bar");
      expect(html).toContain("1 / 3");
      expect(html).toContain("Mostrando 1–15 de 35 produtos");
    });

    it("combines search + sort + pagination together", () => {
      // Search 'Produto Alfa', sorted by quantity DESC
      const html = renderToString(
        <TopProductsCard
          products={manyProducts}
          totalRevenue={10000}
          totalQuantity={1000}
          initialSearchTerm="Alfa 2" // Matches 20, 21, 22, 23, 24, 25, 26, 27, 28, 29 (10 items)
          initialSortField="quantity"
          initialSortDirection="desc"
        />,
      );

      expect(html).toContain("10 itens");
      // In DESC order: Alfa 29 should come before Alfa 20
      const idx29 = html.indexOf("Produto Alfa 29");
      const idx20 = html.indexOf("Produto Alfa 20");
      expect(idx29).toBeLessThan(idx20);
    });
  });
});
