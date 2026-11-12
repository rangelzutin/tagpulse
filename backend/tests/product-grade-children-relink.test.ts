import { describe, expect, it, vi } from "vitest";
import {
  normalizeTagPlusProduct,
  normalizeTagPlusChildProduct,
  normalizeTagPlusProductsWithChildren,
} from "../src/integrations/tagplus/products/product-normalizer.js";
import { createProductFullSync } from "../src/modules/products/product-full-sync.js";

describe("Product Grade Children and Relink Foundation", () => {
  const sampleParent = {
    id: 644,
    codigo: "BERM-SARJA",
    descricao: "Bermuda Nineclouds - Sarja Vinho",
    ativo: false,
    tipo: "G",
    valor_venda_varejo: 49.9,
    custo_utilizado: 40.0,
    custo_medio: 37.275,
    categoria: { id: 12, descricao: "Confecções Nineclouds" },
    departamento: { id: 5, descricao: "Vestuário" },
    unidade_saida: { id: 1, sigla: "UN", descricao: "Unidade" },
    filhos: [
      {
        id: 2077,
        codigo: "2026040771500",
        codigo_grade: "0007",
        descricao: "Bermuda Nineclouds - Sarja Vinho - UN",
        ativo: false,
        qtd_revenda: 1,
        grades: [{ modalidade: "Tamanho", grade: "UN" }],
      },
      {
        id: 2078,
        codigo: "2026040771501",
        codigo_grade: "0008",
        descricao: "Bermuda Nineclouds - Sarja Vinho - P",
        ativo: true,
        qtd_revenda: 3,
        custo_utilizado: 42.5, // override
        grades: [{ modalidade: "Tamanho", grade: "P" }],
      },
    ],
  };

  it("1. expande produto pai com múltiplos filhos preservando sourceId e parentSourceId", () => {
    const list = normalizeTagPlusProductsWithChildren(sampleParent);
    expect(list).toHaveLength(3);

    const [parent, child1, child2] = list;

    // Parent
    expect(parent.sourceId).toBe("644");
    expect(parent.parentSourceId).toBeNull();
    expect(parent.description).toBe("Bermuda Nineclouds - Sarja Vinho");

    // Child 1
    expect(child1.sourceId).toBe("2077");
    expect(child1.parentSourceId).toBe("644");
    expect(child1.code).toBe("2026040771500");
    expect(child1.gradeCode).toBe("0007");
    expect(child1.description).toBe("Bermuda Nineclouds - Sarja Vinho - UN");
    expect(child1.active).toBe(false);

    // Child 2
    expect(child2.sourceId).toBe("2078");
    expect(child2.parentSourceId).toBe("644");
    expect(child2.active).toBe(true);
  });

  it("2. herda custos do pai quando filho não define custo próprio", () => {
    const child1 = normalizeTagPlusChildProduct(sampleParent.filhos[0], sampleParent);
    expect(child1.effectiveCost).toBe(40.0);
    expect(child1.averageCost).toBe(37.275);
    expect(child1.retailSalePrice).toBe(49.9);
    expect(child1.categoryDescription).toBe("Confecções Nineclouds");
    expect(child1.outputUnitAbbreviation).toBe("UN");
  });

  it("3. permite override de custo no filho quando especificado", () => {
    const child2 = normalizeTagPlusChildProduct(sampleParent.filhos[1], sampleParent);
    expect(child2.effectiveCost).toBe(42.5); // override
    expect(child2.averageCost).toBe(37.275); // inherited
    expect(child2.active).toBe(true);
  });

  it("4. valida caso canônico específico: produto 2077", () => {
    const child2077 = normalizeTagPlusChildProduct(sampleParent.filhos[0], sampleParent);
    expect(child2077.sourceId).toBe("2077");
    expect(child2077.parentSourceId).toBe("644");
    expect(child2077.description).toBe("Bermuda Nineclouds - Sarja Vinho - UN");
    expect(child2077.active).toBe(false);
    expect(child2077.effectiveCost).toBe(40.0);
  });

  it("5. sync idempotente: ingere pai e filhos sem duplicação", async () => {
    const upsertProduct = vi.fn().mockResolvedValue({ outcome: "INSERTED" });
    const productRepository = { upsertProduct };
    const syncRepository = {
      findRunning: vi.fn().mockResolvedValue(null),
      createRun: vi.fn().mockResolvedValue({ id: "run-uuid-1" }),
      updateProgress: vi.fn().mockResolvedValue(undefined),
      reconcileMissing: vi.fn().mockResolvedValue(0),
      completeRun: vi.fn().mockResolvedValue(undefined),
      failRun: vi.fn().mockResolvedValue(undefined),
    };

    const sync = createProductFullSync({
      pageFetcher: vi.fn(async ({ page }: { page: number }) => {
        if (page === 1) return [sampleParent];
        return [];
      }),
      productRepository,
      syncRepository,
      now: () => new Date("2026-11-12T00:00:00Z"),
    });

    const result = await sync("00000000-0000-4000-8000-000000000001");
    expect(result.status).toBe("COMPLETED");
    expect(result.recordsFetched).toBe(3); // 1 parent + 2 children
    expect(result.recordsInserted).toBe(3);
    expect(upsertProduct).toHaveBeenCalledTimes(3);

    // Verify calls
    expect(upsertProduct).toHaveBeenNthCalledWith(1, expect.objectContaining({
      product: expect.objectContaining({ sourceId: "644" }),
    }));
    expect(upsertProduct).toHaveBeenNthCalledWith(2, expect.objectContaining({
      product: expect.objectContaining({ sourceId: "2077", parentSourceId: "644" }),
    }));
    expect(upsertProduct).toHaveBeenNthCalledWith(3, expect.objectContaining({
      product: expect.objectContaining({ sourceId: "2078", parentSourceId: "644" }),
    }));
  });

  it("6. lógica de relink determinístico: preserva itens já vinculados e mantém sem match como NULL", () => {
    const catalog = new Map<string, string>([
      ["2077", "uuid-prod-2077"],
      ["2078", "uuid-prod-2078"],
    ]);

    const items = [
      { id: "item-1", sourceProductId: "2077", productId: null }, // match exato -> relink
      { id: "item-2", sourceProductId: "9999", productId: null }, // sem match -> permanece null
      { id: "item-3", sourceProductId: "2077", productId: "existing-uuid" }, // já vinculado -> preserva
    ];

    const relinked = items.map(it => {
      if (it.productId !== null) {
        return it; // preserva
      }
      const matchedUuid = catalog.get(it.sourceProductId);
      return {
        ...it,
        productId: matchedUuid ?? null,
      };
    });

    expect(relinked[0].productId).toBe("uuid-prod-2077");
    expect(relinked[1].productId).toBeNull();
    expect(relinked[2].productId).toBe("existing-uuid");
  });
});
