import "dotenv/config";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createProductFullSync } from "../../src/modules/products/product-full-sync.js";
import { createProductRepository } from "../../src/modules/products/product-repository.js";
import { createProductSyncRepository } from "../../src/modules/products/product-sync-repository.js";
import { createTestPrismaClient } from "../helpers/test-prisma.js";

const fixture = (id: number, desc = `Synthetic Product ${id}`) => ({
  id,
  codigo: `PROD-${id}`,
  descricao: desc,
  valor_venda_varejo: 10.0 * id,
  estoque: { qtd_revenda: id },
});

describe.sequential("product full sync on isolated PostgreSQL", () => {
  let prisma: PrismaClient;
  let companyId: string;
  let connectionA: string;
  let connectionB: string;
  const slug = `product-sync-synthetic-${process.pid}-${Date.now()}`;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    const company = await prisma.company.create({
      data: { name: "Product Sync Synthetic", slug },
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

  function syncFor(connectionId: string, pages: unknown[]) {
    const pageFetcher = vi.fn(async ({ page }: { page: number }) => {
      const value = pages[page - 1];
      if (value instanceof Error) throw value;
      return value;
    });
    return createProductFullSync({
      pageFetcher,
      productRepository: createProductRepository(prisma),
      syncRepository: createProductSyncRepository(prisma),
      now: () => new Date("2026-09-04T12:00:00Z"),
    })(connectionId);
  }

  it("persists multiple pages, is idempotent and reconciles missing products", async () => {
    const first = await syncFor(connectionA, [[fixture(1)], [fixture(2)], []]);
    expect(first).toMatchObject({
      status: "COMPLETED",
      pagesFetched: 3,
      recordsFetched: 2,
      recordsInserted: 2,
      terminalEmptyPage: 3,
    });
    const stored = await prisma.product.findMany({
      where: { connectionId: connectionA },
    });
    expect(stored).toHaveLength(2);
    expect(
      stored.every(
        (item) => item.sourcePresent && item.lastSeenSyncRunId === first.runId,
      ),
    ).toBe(true);

    const second = await syncFor(connectionA, [[fixture(2)], []]);
    expect(second.recordsNoLongerObserved).toBe(1);

    const [p1, p2] = await Promise.all([
      prisma.product.findUniqueOrThrow({
        where: {
          connectionId_sourceId: { connectionId: connectionA, sourceId: "1" },
        },
      }),
      prisma.product.findUniqueOrThrow({
        where: {
          connectionId_sourceId: { connectionId: connectionA, sourceId: "2" },
        },
      }),
    ]);
    expect(p1.sourcePresent).toBe(false);
    expect(p2.sourcePresent).toBe(true);
  });
});
