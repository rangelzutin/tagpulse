import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { InventoryCategoryTreeSelector } from "./InventoryCategoryTreeSelector";
import type { CategoryTreeNode } from "../api/bi";

describe("InventoryCategoryTreeSelector Component", () => {
  const mockTree: CategoryTreeNode[] = [
    {
      sourceId: "49",
      description: "1 - NINECLOUDS",
      parentSourceId: null,
      directProductCount: 0,
      descendantProductCount: 5,
      children: [
        {
          sourceId: "50",
          description: "Shapes Nineclouds",
          parentSourceId: "49",
          directProductCount: 1,
          descendantProductCount: 3,
          children: [
            {
              sourceId: "51",
              description: "Shape Nineclouds Maple",
              parentSourceId: "50",
              directProductCount: 1,
              descendantProductCount: 2,
              children: [
                {
                  sourceId: "52",
                  description: "Shape Nineclouds Collection",
                  parentSourceId: "51",
                  directProductCount: 1,
                  descendantProductCount: 1,
                  children: [],
                },
              ],
            },
          ],
        },
        {
          sourceId: "60",
          description: "Rodas Nineclouds",
          parentSourceId: "49",
          directProductCount: 2,
          descendantProductCount: 2,
          children: [],
        },
      ],
    },
    {
      sourceId: "78",
      description: "2 - DESTRUX",
      parentSourceId: null,
      directProductCount: 0,
      descendantProductCount: 10,
      children: [],
    },
    {
      sourceId: "77",
      description: "3 - HUSTLER",
      parentSourceId: null,
      directProductCount: 2,
      descendantProductCount: 15,
      children: [],
    },
    {
      sourceId: "48",
      description: "X - DESATIVADOS",
      parentSourceId: null,
      directProductCount: 0,
      descendantProductCount: 0,
      children: [],
    },
  ];

  it("renders closed trigger displaying 'Todas as categorias' and total catalog products when selectedCategorySourceId is null", () => {
    const html = renderToString(
      <InventoryCategoryTreeSelector
        categories={mockTree}
        selectedCategorySourceId={null}
        onSelectCategorySourceId={() => {}}
      />,
    );

    expect(html).toContain("Todas as categorias (30 produtos)");
    expect(html).toContain("tp-tree-trigger");
    expect(html).not.toContain("tp-tree-popover");
  });

  it("renders selected category label on trigger when selectedCategorySourceId is active", () => {
    const html = renderToString(
      <InventoryCategoryTreeSelector
        categories={mockTree}
        selectedCategorySourceId="52"
        onSelectCategorySourceId={() => {}}
      />,
    );

    expect(html).toContain("Shape Nineclouds Collection");
    expect(html).toContain("is-filtered");
  });

  it("renders tree popover with 4 roots when initialOpen=true", () => {
    const html = renderToString(
      <InventoryCategoryTreeSelector
        categories={mockTree}
        selectedCategorySourceId={null}
        onSelectCategorySourceId={() => {}}
        initialOpen={true}
      />,
    );

    expect(html).toContain("tp-tree-popover");
    expect(html).toContain("Buscar categoria...");
    expect(html).toContain("Todas as categorias");
    expect(html).toContain("1 - NINECLOUDS");
    expect(html).toContain("2 - DESTRUX");
    expect(html).toContain("3 - HUSTLER");
    expect(html).toContain("X - DESATIVADOS");
  });

  it("renders category with 0 products with is-zero badge", () => {
    const html = renderToString(
      <InventoryCategoryTreeSelector
        categories={mockTree}
        selectedCategorySourceId={null}
        onSelectCategorySourceId={() => {}}
        initialOpen={true}
      />,
    );

    // X - DESATIVADOS tem 0 produtos
    expect(html).toContain("X - DESATIVADOS");
    expect(html).toContain("is-zero");
  });
});
