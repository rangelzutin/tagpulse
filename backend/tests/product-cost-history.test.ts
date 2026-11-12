import { describe, expect, it, vi } from "vitest";
import {
  resolveProductCostAtDate,
  createProductCost,
  type CreateProductCostInput,
} from "../src/modules/products/product-cost-history-service.js";

describe("Product Cost History & Temporal Resolver", () => {
  it("resolves cost with priority: PURCHASE over MANUAL", async () => {
    const mockPrisma = {
      productCostHistory: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "1",
            unitCost: "50.0000",
            costSource: "PURCHASE",
            validFrom: new Date("2026-01-01"),
            validTo: null,
          },
          {
            id: "2",
            unitCost: "45.0000",
            costSource: "MANUAL",
            validFrom: new Date("2026-01-01"),
            validTo: null,
          },
        ]),
      },
      product: {
        findFirst: vi.fn(),
      },
    } as any;

    const res = await resolveProductCostAtDate(mockPrisma, {
      productId: "prod_1",
      saleDate: new Date("2026-02-01"),
    });

    expect(res.unitCost).toBe(50);
    expect(res.costSource).toBe("PURCHASE");
  });

  it("resolves MANUAL cost when no purchase/stock adjustment exists", async () => {
    const mockPrisma = {
      productCostHistory: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "2",
            unitCost: "45.0000",
            costSource: "MANUAL",
            validFrom: new Date("2026-01-01"),
            validTo: null,
          },
        ]),
      },
      product: {
        findFirst: vi.fn(),
      },
    } as any;

    const res = await resolveProductCostAtDate(mockPrisma, {
      productId: "prod_1",
      saleDate: new Date("2026-02-01"),
    });

    expect(res.unitCost).toBe(45);
    expect(res.costSource).toBe("MANUAL");
  });

  it("falls back to CURRENT_COST_PROXY on Product when no history exists", async () => {
    const mockPrisma = {
      productCostHistory: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      product: {
        findFirst: vi.fn().mockResolvedValue({
          id: "prod_1",
          effectiveCost: "33.5000",
          averageCost: null,
        }),
      },
    } as any;

    const res = await resolveProductCostAtDate(mockPrisma, {
      productId: "prod_1",
      saleDate: new Date("2026-02-01"),
    });

    expect(res.unitCost).toBe(33.5);
    expect(res.costSource).toBe("CURRENT_COST_PROXY");
  });

  it("validates input and closes previous overlapping open records on create", async () => {
    const updateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const createMock = vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "hist_1", ...data }));
    const updateProductMock = vi.fn().mockResolvedValue({ id: "prod_1" });

    const mockPrisma = {
      product: {
        findFirst: vi.fn().mockResolvedValue({ id: "prod_1" }),
        update: updateProductMock,
      },
      productCostHistory: {
        updateMany: updateManyMock,
        create: createMock,
      },
    } as any;

    const input: CreateProductCostInput = {
      sourceProductId: "tagplus_999",
      unitCost: 28.5,
      costSource: "MANUAL",
      validFrom: "2026-01-01T00:00:00.000Z",
      note: "Custo cadastrado manualmente pelo gestor",
    };

    const created = await createProductCost(mockPrisma, input);

    expect(created.unitCost).toBe(28.5);
    expect(created.costSource).toBe("MANUAL");
    expect(updateManyMock).toHaveBeenCalledTimes(1);
    expect(updateProductMock).toHaveBeenCalledTimes(1);
  });

  it("enforces full hierarchy precedence: PURCHASE > MANUAL > ERP_SNAPSHOT > averageCost > effectiveCost", async () => {
    // 1. ERP_SNAPSHOT over catalog proxy
    const mockSnapshot = {
      productCostHistory: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "3",
            unitCost: "40.0000",
            costSource: "ERP_SNAPSHOT",
            validFrom: new Date("2026-01-01"),
            validTo: null,
          },
        ]),
      },
      product: {
        findFirst: vi.fn().mockResolvedValue({
          id: "prod_1",
          averageCost: "35.0000",
          effectiveCost: "62.5500",
        }),
      },
    } as any;

    const resSnap = await resolveProductCostAtDate(mockSnapshot, {
      productId: "prod_1",
      saleDate: new Date("2026-02-01"),
    });
    expect(resSnap.unitCost).toBe(40);
    expect(resSnap.costSource).toBe("ERP_SNAPSHOT");

    // 2. averageCost > 0 over effectiveCost when no temporal history exists
    const mockAvgOverEff = {
      productCostHistory: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      product: {
        findFirst: vi.fn().mockResolvedValue({
          id: "prod_1",
          averageCost: "58.2000",
          effectiveCost: "62.5500",
        }),
      },
    } as any;

    const resAvg = await resolveProductCostAtDate(mockAvgOverEff, {
      productId: "prod_1",
      saleDate: new Date("2026-02-01"),
    });
    expect(resAvg.unitCost).toBe(58.2);
    expect(resAvg.costSource).toBe("CURRENT_COST_PROXY");

    // 3. effectiveCost when averageCost is 0 or null
    const mockEffWhenAvgZero = {
      productCostHistory: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      product: {
        findFirst: vi.fn().mockResolvedValue({
          id: "prod_1",
          averageCost: "0.0000",
          effectiveCost: "62.5500",
        }),
      },
    } as any;

    const resEff = await resolveProductCostAtDate(mockEffWhenAvgZero, {
      productId: "prod_1",
      saleDate: new Date("2026-02-01"),
    });
    expect(resEff.unitCost).toBe(62.55);
    expect(resEff.costSource).toBe("CURRENT_COST_PROXY");
  });
});
