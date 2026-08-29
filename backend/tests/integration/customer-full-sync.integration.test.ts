import "dotenv/config";
import type { PrismaClient } from "@prisma/client";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createCustomerFullSync } from "../../src/modules/customers/customer-full-sync.js";
import { createCustomerRepository } from "../../src/modules/customers/customer-repository.js";
import { createCustomerSyncRepository } from "../../src/modules/customers/customer-sync-repository.js";
import { createTestPrismaClient } from "../helpers/test-prisma.js";

const fixture = (id: number, name = `Synthetic Customer ${id}`) => ({
  id,
  razao_social: name,
  email: `synthetic-customer-${id}@example.invalid`,
  contatos: [],
  enderecos: [],
});

describe.sequential("customer full sync on isolated PostgreSQL", () => {
  let prisma: PrismaClient;
  let companyId: string;
  let connectionA: string;
  let connectionB: string;
  const slug = `gate-d-synthetic-${process.pid}-${Date.now()}`;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    const company = await prisma.company.create({
      data: { name: "Gate D Synthetic", slug },
    });
    companyId = company.id;
    const [a, b] = await Promise.all([
      prisma.tagPlusConnection.create({
        data: {
          companyId,
          name: "Synthetic A",
          status: "ACTIVE",
          apiVersion: "2.0",
        },
      }),
      prisma.tagPlusConnection.create({
        data: {
          companyId,
          name: "Synthetic B",
          status: "ACTIVE",
          apiVersion: "2.0",
        },
      }),
    ]);
    connectionA = a.id;
    connectionB = b.id;
  });

  beforeEach(async () => {
    await prisma.customer.deleteMany({
      where: { connectionId: { in: [connectionA, connectionB] } },
    });
    await prisma.customerSyncRun.deleteMany({
      where: { connectionId: { in: [connectionA, connectionB] } },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.customer.deleteMany({
        where: { connectionId: { in: [connectionA, connectionB] } },
      });
      await prisma.customerSyncRun.deleteMany({
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
    return createCustomerFullSync({
      pageFetcher,
      customerRepository: createCustomerRepository(prisma),
      syncRepository: createCustomerSyncRepository(prisma),
      now: () => new Date("2026-08-29T12:00:00Z"),
    })(connectionId);
  }

  it("persists multiple pages, is idempotent and detects an update", async () => {
    const first = await syncFor(connectionA, [[fixture(1)], [fixture(2)], []]);
    expect(first).toMatchObject({
      status: "COMPLETED",
      pagesFetched: 3,
      recordsFetched: 2,
      recordsInserted: 2,
      terminalEmptyPage: 3,
    });
    const stored = await prisma.customer.findMany({
      where: { connectionId: connectionA },
    });
    expect(stored).toHaveLength(2);
    expect(
      stored.every(
        (item) => item.sourcePresent && item.lastSeenSyncRunId === first.runId,
      ),
    ).toBe(true);
    expect(
      await prisma.customerSyncRun.findUnique({ where: { id: first.runId } }),
    ).toMatchObject({ status: "COMPLETED", lastCompletedPage: 2 });

    const second = await syncFor(connectionA, [[fixture(1), fixture(2)], []]);
    expect(second).toMatchObject({
      recordsInserted: 0,
      recordsUpdated: 0,
      recordsUnchanged: 2,
    });
    const third = await syncFor(connectionA, [
      [fixture(1, "Synthetic Customer Updated"), fixture(2)],
      [],
    ]);
    expect(third).toMatchObject({
      recordsInserted: 0,
      recordsUpdated: 1,
      recordsUnchanged: 1,
    });
  });

  it("marks only customers missing from a completed scan as absent", async () => {
    await syncFor(connectionA, [[fixture(1), fixture(2)], []]);
    const second = await syncFor(connectionA, [[fixture(2)], []]);
    expect(second.recordsNoLongerObserved).toBe(1);
    const [a, b] = await Promise.all([
      prisma.customer.findUniqueOrThrow({
        where: {
          connectionId_sourceId: { connectionId: connectionA, sourceId: "1" },
        },
      }),
      prisma.customer.findUniqueOrThrow({
        where: {
          connectionId_sourceId: { connectionId: connectionA, sourceId: "2" },
        },
      }),
    ]);
    expect(a.sourcePresent).toBe(false);
    expect(b.sourcePresent).toBe(true);
  });

  it("does not reconcile after a partial failed scan", async () => {
    await syncFor(connectionA, [[fixture(1), fixture(2)], []]);
    await expect(
      syncFor(connectionA, [[fixture(1)], new Error("fetch failure")]),
    ).rejects.toMatchObject({ category: "CUSTOMER_SYNC_FETCH_ERROR" });
    const b = await prisma.customer.findUniqueOrThrow({
      where: {
        connectionId_sourceId: { connectionId: connectionA, sourceId: "2" },
      },
    });
    expect(b.sourcePresent).toBe(true);
    expect(
      await prisma.customerSyncRun.findFirst({
        where: { connectionId: connectionA },
        orderBy: { createdAt: "desc" },
      }),
    ).toMatchObject({ status: "FAILED", recordsNoLongerObserved: 0 });
  });

  it("isolates equal source IDs and reconciliation by connection", async () => {
    await syncFor(connectionA, [[fixture(123)], []]);
    await syncFor(connectionB, [[fixture(123)], []]);
    await syncFor(connectionA, [[]]);
    const [a, b] = await Promise.all([
      prisma.customer.findUniqueOrThrow({
        where: {
          connectionId_sourceId: { connectionId: connectionA, sourceId: "123" },
        },
      }),
      prisma.customer.findUniqueOrThrow({
        where: {
          connectionId_sourceId: { connectionId: connectionB, sourceId: "123" },
        },
      }),
    ]);
    expect(a.sourcePresent).toBe(false);
    expect(b.sourcePresent).toBe(true);
  });

  it("rejects a second run when a RUNNING row exists", async () => {
    await prisma.customerSyncRun.create({
      data: { connectionId: connectionA, status: "RUNNING" },
    });
    await expect(syncFor(connectionA, [[]])).rejects.toMatchObject({
      category: "CUSTOMER_SYNC_ALREADY_RUNNING",
    });
    expect(
      await prisma.customerSyncRun.count({
        where: { connectionId: connectionA, status: "RUNNING" },
      }),
    ).toBe(1);
  });
});
