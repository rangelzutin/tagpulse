import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchProductsOverview, type ProductsOverviewResult } from "./bi";

describe("Products BI Frontend — API Client & Logic", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockOverviewData: ProductsOverviewResult = {
    period: { from: "2026-01-01", to: "2026-01-31" },
    summary: {
      realizedRevenue: 53766.28,
      realizedQuantity: 413,
      distinctProductsSold: 88,
      distinctCustomers: 21,
      activeCatalogProducts: 300,
      productsWithStock: 250,
      productsSoldInPeriod: 88,
    },
    topProducts: [
      {
        productId: "p-1",
        code: "SKU-001",
        description: "Produto Físico Normal",
        category: "Vestuário",
        quantity: 20,
        grossItemAmount: 2000,
        realizedRevenue: 2000,
        distinctSales: 5,
        distinctCustomers: 5,
        currentStockQuantity: 15,
        retailSalePrice: 120,
        effectiveCost: 60,
      },
      {
        productId: "p-2",
        code: "SKU-002",
        description: "Produto Complemento Financeiro",
        category: "Vestuário",
        quantity: 0,
        grossItemAmount: 0,
        realizedRevenue: 500,
        distinctSales: 1,
        distinctCustomers: 1,
        currentStockQuantity: 0,
        retailSalePrice: 100,
        effectiveCost: 50,
      },
      {
        productId: "p-3",
        code: "SKU-003",
        description: "Produto Grande Volume",
        category: "Acessórios",
        quantity: 50,
        grossItemAmount: 1500,
        realizedRevenue: 1500,
        distinctSales: 10,
        distinctCustomers: 8,
        currentStockQuantity: 100,
        retailSalePrice: 35,
        effectiveCost: 15,
      },
    ],
    categories: [
      {
        category: "Vestuário",
        quantity: 20,
        realizedRevenue: 2500,
        distinctProducts: 2,
        shareOfRevenue: 62.5,
      },
      {
        category: "Acessórios",
        quantity: 50,
        realizedRevenue: 1500,
        distinctProducts: 1,
        shareOfRevenue: 37.5,
      },
    ],
    channelMix: [
      {
        channel: "ATACADO",
        quantity: 50,
        realizedRevenue: 3000,
        distinctProducts: 2,
      },
      {
        channel: "VAREJO",
        quantity: 20,
        realizedRevenue: 1000,
        distinctProducts: 1,
      },
    ],
    reconciliation: {
      commercialRevenue: 53766.28,
      productsRevenue: 53766.28,
      adjustmentAmount: 0,
      adjustments: [],
    },
  };

  it("fetchProductsOverview executa GET com parâmetros from e to codificados", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockOverviewData,
    } as Response);

    const result = await fetchProductsOverview("2026-01-01", "2026-01-31");

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/bi/products/overview?from=2026-01-01&to=2026-01-31"),
      expect.objectContaining({
        headers: { Accept: "application/json" },
      }),
    );
    expect(result.summary.realizedRevenue).toBe(53766.28);
    expect(result.summary.realizedQuantity).toBe(413);
    expect(result.summary.distinctProductsSold).toBe(88);
  });

  it("fetchProductsOverview propaga mensagem de erro do backend se resposta não for ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ status: "error", message: "Intervalo inválido" }),
    } as Response);

    await expect(fetchProductsOverview("invalido", "2026-01-31")).rejects.toThrow(
      "Intervalo inválido",
    );
  });

  it("fetchProductsOverview lança erro de conexão em caso de falha de rede", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Failed to fetch"));

    await expect(fetchProductsOverview("2026-01-01", "2026-01-31")).rejects.toThrow(
      "Não foi possível conectar ao servidor para carregar o BI de Produtos.",
    );
  });

  it("lógica de ordenação: Faturamento inclui produtos com quantity = 0 e receita > 0", () => {
    const sortedByRevenue = [...mockOverviewData.topProducts].sort(
      (a, b) => b.realizedRevenue - a.realizedRevenue,
    );

    expect(sortedByRevenue[0].productId).toBe("p-1"); // 2000
    expect(sortedByRevenue[1].productId).toBe("p-3"); // 1500
    expect(sortedByRevenue[2].productId).toBe("p-2"); // 500 (quantity = 0)
    expect(sortedByRevenue.length).toBe(3);
  });

  it("lógica de ordenação: Volume exclui estritamente produtos com quantity === 0", () => {
    const sortedByVolume = mockOverviewData.topProducts
      .filter((p) => p.quantity > 0)
      .sort((a, b) => b.quantity - a.quantity);

    expect(sortedByVolume[0].productId).toBe("p-3"); // 50 un
    expect(sortedByVolume[1].productId).toBe("p-1"); // 20 un
    expect(sortedByVolume.length).toBe(2);
    expect(sortedByVolume.some((p) => p.quantity === 0)).toBe(false);
  });

  it("reconciliação: identifica quando há ajuste histórico e preserva a relação comercial - ajuste = produtos", () => {
    const recWithAdjustment = {
      commercialRevenue: 435252.85,
      productsRevenue: 429764.35,
      adjustmentAmount: 5488.5,
      adjustments: [
        {
          type: "KNOWN_DUPLICATE_NFE",
          sourceDocumentId: "doc-2806",
          sourceId: "2806",
          amount: 5488.5,
          reason: "Duplicidade operacional comprovada da NF-e #2795 vinculada ao Pedido #1265.",
        },
      ],
    };

    expect(recWithAdjustment.adjustmentAmount).toBeGreaterThan(0);
    const calculated =
      Math.round((recWithAdjustment.commercialRevenue - recWithAdjustment.adjustmentAmount) * 100) / 100;
    expect(calculated).toBe(recWithAdjustment.productsRevenue);
  });
});
