import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { calculateInventoryOverview } from "../src/modules/bi/bi-inventory-calculator.js";
import { createBiRepository } from "../src/modules/bi/bi-repository.js";
import { createBiService } from "../src/modules/bi/bi-service.js";
import type { CategoryTreeResult } from "../src/modules/bi/bi-types.js";

describe("Category Tree & Hierarchical Foundation — Unit & Pure Tests", () => {
  it("A & B. Duas Categories diferentes com mesma description continuam agregadas separadamente por categorySourceId e InventoryCategoryItem carrega categorySourceId e category", () => {
    const result = calculateInventoryOverview({
      asOfDate: "2026-09-17",
      windowDays: 90,
      catalogProducts: [
        {
          id: "p-1",
          sourceId: "101",
          code: "SKU-1",
          description: "Shape Nineclouds Pro 8.0",
          categoryDescription: "Shape Nineclouds Pro Model",
          categorySourceId: "51",
          active: true,
          sourcePresent: true,
          stockQuantity: 10,
          effectiveCost: 100,
          averageCost: 100,
          retailSalePrice: 200,
          stockMinQuantity: 0,
          stockMaxQuantity: 50,
        },
        {
          id: "p-2",
          sourceId: "102",
          code: "SKU-2",
          description: "Outro Produto na mesma categoria",
          categoryDescription: "Shape Nineclouds Pro Model",
          categorySourceId: "51",
          active: true,
          sourcePresent: true,
          stockQuantity: 5,
          effectiveCost: 80,
          averageCost: 80,
          retailSalePrice: 160,
          stockMinQuantity: 0,
          stockMaxQuantity: 50,
        },
        {
          id: "p-3",
          sourceId: "103",
          code: "SKU-3",
          description: "Produto com mesma descrição mas categoria diferente",
          categoryDescription: "Shape Nineclouds Pro Model", // Mesma descrição
          categorySourceId: "99", // Mas sourceId diferente!
          active: true,
          sourcePresent: true,
          stockQuantity: 2,
          effectiveCost: 50,
          averageCost: 50,
          retailSalePrice: 100,
          stockMinQuantity: 0,
          stockMaxQuantity: 50,
        },
        {
          id: "p-4",
          sourceId: "104",
          code: "SKU-4",
          description: "Produto sem categoria",
          categoryDescription: null,
          categorySourceId: null,
          active: true,
          sourcePresent: true,
          stockQuantity: 1,
          effectiveCost: 10,
          averageCost: 10,
          retailSalePrice: 20,
          stockMinQuantity: 0,
          stockMaxQuantity: 10,
        },
      ],
      movementsInWindow: [],
    });

    // 1. Produtos contêm categorySourceId
    expect(result.products[0].categorySourceId).toBe("51");
    expect(result.products[1].categorySourceId).toBe("51");
    expect(result.products[2].categorySourceId).toBe("99");
    expect(result.products[3].categorySourceId).toBeNull();

    // 2. Categorias foram agregadas por categorySourceId, não por description colidida (Cenário A e B)
    const cat51 = result.categories.find((c) => c.categorySourceId === "51");
    const cat99 = result.categories.find((c) => c.categorySourceId === "99");
    const catNull = result.categories.find((c) => c.categorySourceId === null);

    expect(cat51).toBeDefined();
    expect(cat51?.products).toBe(2);
    expect(cat51?.category).toBe("Shape Nineclouds Pro Model");
    expect(cat51?.categorySourceId).toBe("51");

    expect(cat99).toBeDefined();
    expect(cat99?.products).toBe(1);
    expect(cat99?.category).toBe("Shape Nineclouds Pro Model");
    expect(cat99?.categorySourceId).toBe("99");

    expect(catNull).toBeDefined();
    expect(catNull?.products).toBe(1);
    expect(catNull?.category).toBe("Sem categoria");
  });

  it("D. Category tree de uma connection nunca contabiliza Product de outra connection", async () => {
    const mockPrisma = {
      tagPlusConnection: {
        findFirst: async ({ where }: any) => {
          if (where.status === "ACTIVE") return { id: "conn-alpha" };
          return null;
        },
      },
      category: {
        findMany: async ({ where }: any) => {
          // Apenas categorias da conexão 'conn-alpha'
          if (where.connectionId !== "conn-alpha") return [];
          return [
            {
              sourceId: "10",
              description: "Root Cat",
              parentSourceId: null,
              connectionId: "conn-alpha",
              sourcePresent: true,
            },
          ];
        },
      },
      product: {
        findMany: async ({ where }: any) => {
          // Apenas produtos da conexão solicitada
          if (where.connectionId === "conn-alpha") {
            return [{ categorySourceId: "10", connectionId: "conn-alpha" }];
          }
          // Se vazasse de conn-beta:
          return [{ categorySourceId: "10", connectionId: "conn-beta" }];
        },
      },
    } as any;

    const repository = createBiRepository(mockPrisma);
    const tree = await repository.findCategoryTree();

    expect(tree.categories).toHaveLength(1);
    expect(tree.categories[0].sourceId).toBe("10");
    // Deve contabilizar APENAS o produto de conn-alpha (1) e NUNCA de conn-beta
    expect(tree.categories[0].directProductCount).toBe(1);
    expect(tree.categories[0].descendantProductCount).toBe(1);
  });

  it("findCategoryTree constructs 4-level deep hierarchy, handles roots, directProductCount, descendantProductCount without double counting, and excludes sourcePresent=false", async () => {
    // Mock prisma for BiRepository
    const mockCategories = [
      // Raiz 1: NINECLOUDS
      {
        sourceId: "49",
        description: "1 - NINECLOUDS",
        parentSourceId: null,
        connectionId: "conn-1",
        sourcePresent: true,
      },
      // Filho: Shapes Nineclouds
      {
        sourceId: "50",
        description: "Shapes Nineclouds",
        parentSourceId: "49",
        connectionId: "conn-1",
        sourcePresent: true,
      },
      // Neto: Shape Nineclouds Maple
      {
        sourceId: "51",
        description: "Shape Nineclouds Maple",
        parentSourceId: "50",
        connectionId: "conn-1",
        sourcePresent: true,
      },
      // Bisneto (Nível 4): Shape Nineclouds Maple 8.0
      {
        sourceId: "52",
        description: "Shape Nineclouds Maple 8.0",
        parentSourceId: "51",
        connectionId: "conn-1",
        sourcePresent: true,
      },
      // Raiz 2: HUSTLER (possui 2 produtos diretos e 1 filho)
      {
        sourceId: "77",
        description: "3 - HUSTLER",
        parentSourceId: null,
        connectionId: "conn-1",
        sourcePresent: true,
      },
      {
        sourceId: "78",
        description: "Tenis Hustler",
        parentSourceId: "77",
        connectionId: "conn-1",
        sourcePresent: true,
      },
      // Raiz 3: Folha sem produtos
      {
        sourceId: "90",
        description: "X - DESATIVADOS",
        parentSourceId: null,
        connectionId: "conn-1",
        sourcePresent: true,
      },
      // Categoria antiga excluída (sourcePresent: false)
      {
        sourceId: "999",
        description: "Categoria Antiga Removida",
        parentSourceId: null,
        connectionId: "conn-1",
        sourcePresent: false,
      },
    ];

    const mockProducts = [
      // 1 produto no nível 4 (52)
      { categorySourceId: "52", connectionId: "conn-1" },
      // 2 produtos no nível 3 (51)
      { categorySourceId: "51", connectionId: "conn-1" },
      { categorySourceId: "51", connectionId: "conn-1" },
      // 1 produto no nível 2 (50)
      { categorySourceId: "50", connectionId: "conn-1" },
      // 0 produtos no nível 1 (49)

      // Hustler: 2 produtos diretos na raiz (77)
      { categorySourceId: "77", connectionId: "conn-1" },
      { categorySourceId: "77", connectionId: "conn-1" },
      // 3 produtos no filho (78)
      { categorySourceId: "78", connectionId: "conn-1" },
      { categorySourceId: "78", connectionId: "conn-1" },
      { categorySourceId: "78", connectionId: "conn-1" },

      // Produto de OUTRA conexão (não pode ser somado!)
      { categorySourceId: "77", connectionId: "conn-other" },
    ];

    const mockPrisma = {
      tagPlusConnection: {
        findFirst: async ({ where }: any) => {
          if (where.status === "ACTIVE") return { id: "conn-1" };
          return null;
        },
      },
      category: {
        findMany: async ({ where }: any) => {
          return mockCategories.filter(
            (c) =>
              c.connectionId === where.connectionId &&
              c.sourcePresent === where.sourcePresent,
          );
        },
      },
      product: {
        findMany: async ({ where }: any) => {
          return mockProducts.filter((p) => p.connectionId === where.connectionId);
        },
      },
    } as any;

    const repository = createBiRepository(mockPrisma);
    const tree = await repository.findCategoryTree();

    expect(tree.categories).toHaveLength(3); // 3 raízes (NINECLOUDS, HUSTLER, DESATIVADOS), 999 excluída

    // Valida Raiz 1: NINECLOUDS
    const nineclouds = tree.categories.find((c) => c.sourceId === "49")!;
    expect(nineclouds).toBeDefined();
    expect(nineclouds.description).toBe("1 - NINECLOUDS");
    expect(nineclouds.directProductCount).toBe(0);
    // Subárvore: 50 (1) + 51 (2) + 52 (1) = 4 produtos descendentes sem duplicar
    expect(nineclouds.descendantProductCount).toBe(4);
    expect(nineclouds.children).toHaveLength(1);

    const shapes = nineclouds.children[0];
    expect(shapes.sourceId).toBe("50");
    expect(shapes.directProductCount).toBe(1);
    expect(shapes.descendantProductCount).toBe(4); // 1 + 2 + 1 = 4
    expect(shapes.children).toHaveLength(1);

    const maple = shapes.children[0];
    expect(maple.sourceId).toBe("51");
    expect(maple.directProductCount).toBe(2);
    expect(maple.descendantProductCount).toBe(3); // 2 + 1 = 3
    expect(maple.children).toHaveLength(1);

    const maple80 = maple.children[0];
    expect(maple80.sourceId).toBe("52");
    expect(maple80.directProductCount).toBe(1);
    expect(maple80.descendantProductCount).toBe(1);
    expect(maple80.children).toHaveLength(0);

    // Valida Raiz 2: HUSTLER (nó com 2 produtos diretos E filhos com produtos)
    const hustler = tree.categories.find((c) => c.sourceId === "77")!;
    expect(hustler).toBeDefined();
    expect(hustler.directProductCount).toBe(2);
    // total descendentes = 2 diretos + 3 filhos = 5 (produto de conn-other ignorado)
    expect(hustler.descendantProductCount).toBe(5);
    expect(hustler.children).toHaveLength(1);
    expect(hustler.children[0].directProductCount).toBe(3);
    expect(hustler.children[0].descendantProductCount).toBe(3);

    // Valida Raiz 3: DESATIVADOS (folha com 0 produtos)
    const desativados = tree.categories.find((c) => c.sourceId === "90")!;
    expect(desativados).toBeDefined();
    expect(desativados.directProductCount).toBe(0);
    expect(desativados.descendantProductCount).toBe(0);
    expect(desativados.children).toHaveLength(0);
  });

  it("GET /bi/categories/tree HTTP route returns 200 with categories contract", async () => {
    const mockTreeResult: CategoryTreeResult = {
      categories: [
        {
          sourceId: "49",
          description: "1 - NINECLOUDS",
          parentSourceId: null,
          directProductCount: 0,
          descendantProductCount: 100,
          children: [],
        },
      ],
    };

    const mockRepo = {
      findRealizedSales: async () => [],
      findCategoryTree: async () => mockTreeResult,
    } as any;

    const biService = createBiService(mockRepo);
    const app = await buildApp({
      databaseHealth: { checkHealth: async () => ({ isConnected: true }) },
      frontendUrl: "http://localhost:5173",
      logger: false,
      biRepository: mockRepo,
      biService,
    });

    const response = await app.inject({
      method: "GET",
      url: "/bi/categories/tree",
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.body);
    expect(json).toHaveProperty("categories");
    expect(json.categories).toHaveLength(1);
    expect(json.categories[0].sourceId).toBe("49");
    expect(json.categories[0].description).toBe("1 - NINECLOUDS");
  });
});
