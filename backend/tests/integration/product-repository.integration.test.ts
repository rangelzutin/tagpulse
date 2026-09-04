import "dotenv/config";
import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { normalizeTagPlusProduct } from "../../src/integrations/tagplus/products/product-normalizer.js";
import {
  createProductRepository,
  ProductPersistenceError,
} from "../../src/modules/products/product-repository.js";
import { createTestPrismaClient } from "../helpers/test-prisma.js";

describe.sequential("product repository on isolated PostgreSQL", () => {
  let prisma: PrismaClient;
  let companyId: string;
  let connectionA: string;
  let connectionB: string;
  const slug = `product-repo-synthetic-${process.pid}-${Date.now()}`;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    const company = await prisma.company.create({
      data: { name: "Product Repo Synthetic", slug },
    });
    companyId = company.id;
    const [a, b] = await Promise.all([
      prisma.tagPlusConnection.create({
        data: {
          companyId,
          name: "Synthetic Product Connection A",
          status: "ACTIVE",
          apiVersion: "2.0",
        },
      }),
      prisma.tagPlusConnection.create({
        data: {
          companyId,
          name: "Synthetic Product Connection B",
          status: "ACTIVE",
          apiVersion: "2.0",
        },
      }),
    ]);
    connectionA = a.id;
    connectionB = b.id;
  });

  beforeEach(async () => {
    await prisma.product.deleteMany({
      where: { connectionId: { in: [connectionA, connectionB] } },
    });
    await prisma.productSyncRun.deleteMany({
      where: { connectionId: { in: [connectionA, connectionB] } },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.product.deleteMany({
        where: { connectionId: { in: [connectionA, connectionB] } },
      });
      await prisma.productSyncRun.deleteMany({
        where: { connectionId: { in: [connectionA, connectionB] } },
      });
      await prisma.tagPlusConnection.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } });
      await prisma.$disconnect();
    }
  });

  const observedAt = new Date("2026-09-04T12:00:00Z");
  const fixture = (overrides: Record<string, unknown> = {}) =>
    normalizeTagPlusProduct({
      id: 100,
      codigo: "SKU-PROD-1",
      descricao: "Synthetic Product 100",
      valor_venda_varejo: 199.99,
      estoque: { qtd_revenda: 50.5 },
      ...overrides,
    });

  it("inserts idempotently, updates source data and preserves Decimals", async () => {
    const repository = createProductRepository(prisma);
    const first = await repository.upsertProduct({
      connectionId: connectionA,
      observedAt,
      product: fixture(),
    });
    const second = await repository.upsertProduct({
      connectionId: connectionA,
      observedAt: new Date("2026-09-04T13:00:00Z"),
      product: fixture(),
    });
    const third = await repository.upsertProduct({
      connectionId: connectionA,
      observedAt,
      product: fixture({ valor_venda_varejo: 249.99 }),
    });

    expect(first.outcome).toBe("INSERTED");
    expect(second.outcome).toBe("UNCHANGED");
    expect(third.outcome).toBe("UPDATED");

    const dbRecord = await prisma.product.findUniqueOrThrow({
      where: {
        connectionId_sourceId: {
          connectionId: connectionA,
          sourceId: "100",
        },
      },
    });

    expect(dbRecord.retailSalePrice).toEqual(new Prisma.Decimal("249.99"));
    expect(dbRecord.stockQuantity).toEqual(new Prisma.Decimal("50.5"));
    expect(dbRecord.sourcePresent).toBe(true);
  });

  it("isolates identity by connectionId and sourceId", async () => {
    const repository = createProductRepository(prisma);
    await repository.upsertProduct({
      connectionId: connectionA,
      observedAt,
      product: fixture(),
    });
    await repository.upsertProduct({
      connectionId: connectionB,
      observedAt,
      product: fixture(),
    });
    const count = await prisma.product.count({
      where: { connectionId: { in: [connectionA, connectionB] } },
    });
    expect(count).toBe(2);
  });

  it("links lastSeenSyncRunId FK to product_sync_runs when provided", async () => {
    const repository = createProductRepository(prisma);
    const syncRun = await prisma.productSyncRun.create({
      data: { connectionId: connectionA, status: "RUNNING" },
    });
    await repository.upsertProduct({
      connectionId: connectionA,
      syncRunId: syncRun.id,
      observedAt,
      product: fixture(),
    });

    const stored = await prisma.product.findUniqueOrThrow({
      where: {
        connectionId_sourceId: {
          connectionId: connectionA,
          sourceId: "100",
        },
      },
    });
    expect(stored.lastSeenSyncRunId).toBe(syncRun.id);
  });

  it("catches foreign key / database constraint violation and returns ProductPersistenceError", async () => {
    const repository = createProductRepository(prisma);
    await repository.upsertProduct({
      connectionId: connectionA,
      observedAt,
      product: fixture(),
    });
    await expect(
      repository.upsertProduct({
        connectionId: connectionA,
        syncRunId: "00000000-0000-0000-0000-000000000000",
        observedAt,
        product: fixture({ id: 101 }),
      }),
    ).rejects.toThrow(ProductPersistenceError);
  });
});
