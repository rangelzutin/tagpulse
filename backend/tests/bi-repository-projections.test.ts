import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { createBiRepository } from "../src/modules/bi/bi-repository.js";

describe("bi repository - projection & SQL aggregation hardening (P1.2, P1.3)", () => {
  it("uses prisma.product.groupBy for category product count aggregation", async () => {
    const groupByMock = vi.fn().mockResolvedValue([
      { categorySourceId: "cat-1", _count: { id: 10 } },
      { categorySourceId: "cat-2", _count: { id: 5 } },
    ]);
    const findManyProductMock = vi.fn();

    const mockPrisma = {
      tagPlusConnection: {
        findFirst: vi.fn().mockResolvedValue({ id: "conn-1" }),
      },
      category: {
        findMany: vi.fn().mockResolvedValue([
          { sourceId: "cat-1", description: "Cat 1", parentSourceId: null },
          { sourceId: "cat-2", description: "Cat 2", parentSourceId: "cat-1" },
        ]),
      },
      product: {
        groupBy: groupByMock,
        findMany: findManyProductMock,
      },
    } as unknown as PrismaClient;

    const repo = createBiRepository(mockPrisma);
    const result = await repo.findCategoryTree();

    expect(groupByMock).toHaveBeenCalledTimes(1);
    expect(groupByMock).toHaveBeenCalledWith({
      by: ["categorySourceId"],
      where: {
        connectionId: "conn-1",
        categorySourceId: { not: null },
      },
      _count: {
        id: true,
      },
    });
    expect(findManyProductMock).not.toHaveBeenCalled();

    const cat1 = result.categories.find((c) => c.sourceId === "cat-1");
    expect(cat1?.directProductCount).toBe(10);
    expect(cat1?.descendantProductCount).toBe(15);
  });

  it("applies narrow select projection to findCustomersMetadata", async () => {
    const findManyCustomerMock = vi.fn().mockResolvedValue([
      {
        id: "c-1",
        sourceId: "src-1",
        code: "COD1",
        legalName: "Empresa 1",
        tradeName: "Empresa 1 Fantasia",
        cpf: null,
        cnpj: "12345678000199",
        addresses: [{ cityName: "São Paulo", stateAbbreviation: "SP" }],
      },
    ]);

    const mockPrisma = {
      customer: {
        findMany: findManyCustomerMock,
      },
    } as unknown as PrismaClient;

    const repo = createBiRepository(mockPrisma);
    const result = await repo.findCustomersMetadata!(["c-1"]);

    expect(findManyCustomerMock).toHaveBeenCalledWith({
      where: { id: { in: ["c-1"] } },
      select: {
        id: true,
        sourceId: true,
        code: true,
        legalName: true,
        tradeName: true,
        cpf: true,
        cnpj: true,
        addresses: {
          orderBy: [{ primary: "desc" }, { position: "asc" }],
          take: 1,
          select: {
            cityName: true,
            stateAbbreviation: true,
          },
        },
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].city).toBe("São Paulo");
  });

  it("applies narrow select projection to findRealizedProductMovements", async () => {
    const findManyDocsMock = vi.fn().mockResolvedValue([
      { id: "doc-1", saleId: "sale-1" },
    ]);
    const findManySalesMock = vi.fn().mockResolvedValue([]);

    const mockPrisma = {
      saleSourceDocument: {
        findMany: findManyDocsMock,
      },
      sale: {
        findMany: findManySalesMock,
      },
    } as unknown as PrismaClient;

    const repo = createBiRepository(mockPrisma);
    await repo.findRealizedProductMovements!(
      new Date("2026-09-01"),
      new Date("2026-10-01"),
    );

    expect(findManySalesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["sale-1"] } },
        select: expect.objectContaining({
          id: true,
          anchorType: true,
          anchorSourceId: true,
          customerId: true,
          customer: expect.any(Object),
          items: expect.any(Object),
          sourceDocs: expect.any(Object),
        }),
      }),
    );
  });
});
