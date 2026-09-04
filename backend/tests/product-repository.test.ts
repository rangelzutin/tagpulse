import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { normalizeTagPlusProduct } from "../src/integrations/tagplus/products/product-normalizer.js";
import {
  createProductRepository,
  ProductPersistenceError,
} from "../src/modules/products/product-repository.js";

const product = normalizeTagPlusProduct({
  id: 100,
  codigo: "SKU-1",
  descricao: "Test Product",
  valor_venda_varejo: 99.9,
  estoque: { qtd_revenda: 10 },
});

function transactionClient(existing: Record<string, unknown> | null = null) {
  return {
    product: {
      findUnique: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockResolvedValue({ id: "internal-product-id" }),
      update: vi.fn().mockResolvedValue({ id: "internal-product-id" }),
    },
  };
}

function repositoryWithTransaction(transaction: ReturnType<typeof vi.fn>) {
  return createProductRepository({
    $transaction: transaction,
  } as unknown as Pick<PrismaClient, "$transaction">);
}

function input(p = product) {
  return {
    connectionId: "00000000-0000-4000-8000-000000000001",
    observedAt: new Date("2026-09-04T12:00:00Z"),
    product: p,
  };
}

describe("product repository safe persistence", () => {
  it("inserts new product when not existing", async () => {
    const tx = transactionClient(null);
    const repository = repositoryWithTransaction(
      vi.fn(async (callback) => callback(tx)),
    );
    const result = await repository.upsertProduct(input());
    expect(result.outcome).toBe("INSERTED");
    expect(tx.product.create).toHaveBeenCalledOnce();
  });

  it("marks UNCHANGED when existing product has same data", async () => {
    const existing = {
      id: "internal-product-id",
      code: "SKU-1",
      externalCode: null,
      barcode: null,
      taxableBarcode: null,
      gradeCode: null,
      description: "Test Product",
      shortDescription: null,
      active: null,
      moved: null,
      commercializable: null,
      soldSeparately: null,
      type: null,
      purpose: null,
      brand: null,
      parentSourceId: null,
      categorySourceId: null,
      categoryDescription: null,
      departmentSourceId: null,
      departmentDescription: null,
      retailSalePrice: new Prisma.Decimal("99.9"),
      offerPrice: null,
      effectiveCost: null,
      averageCost: null,
      otherExpensesCost: null,
      stockQuantity: new Prisma.Decimal("10"),
      stockMinQuantity: null,
      stockMaxQuantity: null,
      outputUnitSourceId: null,
      outputUnitAbbreviation: null,
      outputUnitDescription: null,
      outputUnitFractioned: null,
      sourceCreatedAt: null,
      sourceUpdatedAt: null,
    };
    const tx = transactionClient(existing);
    const repository = repositoryWithTransaction(
      vi.fn(async (callback) => callback(tx)),
    );
    const result = await repository.upsertProduct(input());
    expect(result.outcome).toBe("UNCHANGED");
    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourcePresent: true,
          lastSeenAt: input().observedAt,
        }),
      }),
    );
  });

  it("marks UPDATED when material fields change", async () => {
    const existing = {
      id: "internal-product-id",
      code: "SKU-OLD",
      description: "Old Description",
      retailSalePrice: new Prisma.Decimal("50.0"),
      stockQuantity: new Prisma.Decimal("5"),
    };
    const tx = transactionClient(existing);
    const repository = repositoryWithTransaction(
      vi.fn(async (callback) => callback(tx)),
    );
    const result = await repository.upsertProduct(input());
    expect(result.outcome).toBe("UPDATED");
    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: "SKU-1",
          description: "Test Product",
        }),
      }),
    );
  });

  it("classifies P2002 as UNIQUE_CONSTRAINT without leaking PII", async () => {
    const tx = transactionClient(null);
    tx.product.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed on source-CANARY",
        { code: "P2002", clientVersion: "6.15.0" },
      ),
    );
    const repository = repositoryWithTransaction(
      vi.fn(async (callback) => callback(tx)),
    );
    await expect(repository.upsertProduct(input())).rejects.toThrow(
      ProductPersistenceError,
    );
    try {
      await repository.upsertProduct(input());
    } catch (error) {
      expect(error).toMatchObject({
        category: "PRODUCT_PERSISTENCE_ERROR",
        diagnostics: {
          persistenceStage: "PRODUCT",
          persistenceOperation: "UPSERT",
          persistenceErrorClass: "UNIQUE_CONSTRAINT",
        },
      });
      expect(JSON.stringify(error)).not.toContain("source-CANARY");
    }
  });

  it("classifies transaction timeout errors", async () => {
    const tx = transactionClient(null);
    tx.product.findUnique.mockRejectedValueOnce({
      code: "P2028",
      message: "Transaction already closed: expired",
      meta: {
        error:
          "Transaction already closed: A query cannot be executed on an expired transaction.",
      },
    });
    const repository = repositoryWithTransaction(
      vi.fn(async (callback) => callback(tx)),
    );
    await expect(repository.upsertProduct(input())).rejects.toMatchObject({
      diagnostics: {
        persistenceStage: "PRODUCT",
        persistenceOperation: "UPSERT",
        persistenceErrorClass: "TRANSACTION_ERROR",
        transactionReason: "TRANSACTION_EXPIRED",
      },
    });
  });
});
