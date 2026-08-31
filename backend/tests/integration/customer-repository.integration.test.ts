import "dotenv/config";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { normalizeTagPlusCustomer } from "../../src/integrations/tagplus/customers/customer-normalizer.js";
import {
  createCustomerRepository,
  CustomerPersistenceError,
} from "../../src/modules/customers/customer-repository.js";
import { createTestPrismaClient } from "../helpers/test-prisma.js";

describe.sequential("customer repository on isolated PostgreSQL", () => {
  let prisma: PrismaClient;
  let companyId: string;
  let connectionA: string;
  let connectionB: string;
  const slug = `gate-c-synthetic-${process.pid}-${Date.now()}`;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    const company = await prisma.company.create({
      data: { name: "Gate C Synthetic", slug },
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
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.customer.deleteMany({
        where: { connectionId: { in: [connectionA, connectionB] } },
      });
      await prisma.tagPlusConnection.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } });
      await prisma.$disconnect();
    }
  });

  const observedAt = new Date("2026-08-29T12:00:00Z");
  const fixture = (overrides: Record<string, unknown> = {}) =>
    normalizeTagPlusCustomer({
      id: 123,
      razao_social: "Synthetic Customer",
      cpf: "000.000.000-00",
      cnpj: "00.000.000/0000-00",
      email: "synthetic-customer@example.invalid",
      contatos: [
        { id: 1, descricao: "A" },
        { id: 2, descricao: "B" },
      ],
      enderecos: [
        { id: 10, logradouro: "Synthetic Street" },
        { id: 11, logradouro: "Synthetic Avenue" },
      ],
      ...overrides,
    });

  it("inserts idempotently, updates source data and returns no PII", async () => {
    const repository = createCustomerRepository(prisma);
    const first = await repository.upsertCustomer({
      connectionId: connectionA,
      observedAt,
      customer: fixture(),
    });
    const second = await repository.upsertCustomer({
      connectionId: connectionA,
      observedAt: new Date("2026-08-29T13:00:00Z"),
      customer: fixture(),
    });
    const third = await repository.upsertCustomer({
      connectionId: connectionA,
      observedAt,
      customer: fixture({ razao_social: "Synthetic Customer Updated" }),
    });
    expect(first.outcome).toBe("INSERTED");
    expect(second.outcome).toBe("UNCHANGED");
    expect(third.outcome).toBe("UPDATED");
    expect(
      await prisma.customer.count({ where: { connectionId: connectionA } }),
    ).toBe(1);
    expect(await prisma.customerContact.count()).toBe(2);
    expect(await prisma.customerAddress.count()).toBe(2);
    expect(JSON.stringify(first)).not.toContain("synthetic-customer");
  });

  it("removes absent children, empties provided arrays and preserves missing arrays", async () => {
    const repository = createCustomerRepository(prisma);
    await repository.upsertCustomer({
      connectionId: connectionA,
      observedAt,
      customer: fixture(),
    });
    const reduced = await repository.upsertCustomer({
      connectionId: connectionA,
      observedAt,
      customer: fixture({
        contatos: [{ id: 2, descricao: "B" }],
        enderecos: [{ id: 11 }],
      }),
    });
    expect(reduced.contactsRemoved).toBe(2);
    expect(reduced.addressesRemoved).toBe(2);
    expect(reduced.outcome).toBe("UPDATED");
    const preserved = await repository.upsertCustomer({
      connectionId: connectionA,
      observedAt,
      customer: fixture({ contatos: undefined, enderecos: null }),
    });
    expect(preserved.contactsProcessed).toBe(0);
    expect(preserved.addressesProcessed).toBe(0);
    expect(await prisma.customerContact.count()).toBe(1);
    expect(await prisma.customerAddress.count()).toBe(1);
    await repository.upsertCustomer({
      connectionId: connectionA,
      observedAt,
      customer: fixture({ contatos: [], enderecos: [] }),
    });
    expect(await prisma.customerContact.count()).toBe(0);
    expect(await prisma.customerAddress.count()).toBe(0);
  });

  it("preserves duplicate child identifiers across resync, removal and reordering", async () => {
    const repository = createCustomerRepository(prisma);
    const duplicateChildren = fixture({
      contatos: [
        { id: "same-contact", descricao: "Synthetic Contact A" },
        { id: "same-contact", descricao: "Synthetic Contact B" },
      ],
      enderecos: [
        { id: "same-address", logradouro: "Synthetic Street A" },
        { id: "same-address", logradouro: "Synthetic Street B" },
      ],
    });

    const first = await repository.upsertCustomer({
      connectionId: connectionA,
      observedAt,
      customer: duplicateChildren,
    });
    const second = await repository.upsertCustomer({
      connectionId: connectionA,
      observedAt,
      customer: duplicateChildren,
    });
    expect(first.outcome).toBe("INSERTED");
    expect(second.outcome).toBe("UNCHANGED");
    expect(await prisma.customerContact.count()).toBe(2);
    expect(await prisma.customerAddress.count()).toBe(2);

    const reduced = await repository.upsertCustomer({
      connectionId: connectionA,
      observedAt,
      customer: fixture({
        contatos: [{ id: "same-contact", descricao: "Synthetic Contact A" }],
        enderecos: [{ id: "same-address", logradouro: "Synthetic Street A" }],
      }),
    });
    expect(reduced.outcome).toBe("UPDATED");
    expect(reduced.contactsRemoved).toBe(1);
    expect(reduced.addressesRemoved).toBe(1);

    const reordered = await repository.upsertCustomer({
      connectionId: connectionA,
      observedAt,
      customer: fixture({
        contatos: [
          { id: "same-contact", descricao: "Synthetic Contact B" },
          { id: "same-contact", descricao: "Synthetic Contact A" },
        ],
        enderecos: [
          { id: "same-address", logradouro: "Synthetic Street B" },
          { id: "same-address", logradouro: "Synthetic Street A" },
        ],
      }),
    });
    expect(reordered.outcome).toBe("UPDATED");
    expect(
      await prisma.customerContact.findMany({
        orderBy: { position: "asc" },
        select: { sourceId: true, position: true, description: true },
      }),
    ).toEqual([
      {
        sourceId: "same-contact",
        position: 0,
        description: "Synthetic Contact B",
      },
      {
        sourceId: "same-contact",
        position: 1,
        description: "Synthetic Contact A",
      },
    ]);
    expect(
      await prisma.customerAddress.findMany({
        orderBy: { position: "asc" },
        select: { sourceId: true, position: true, street: true },
      }),
    ).toEqual([
      {
        sourceId: "same-address",
        position: 0,
        street: "Synthetic Street B",
      },
      {
        sourceId: "same-address",
        position: 1,
        street: "Synthetic Street A",
      },
    ]);
  });

  it("isolates identity by connection and does not use documents as identity", async () => {
    const repository = createCustomerRepository(prisma);
    await repository.upsertCustomer({
      connectionId: connectionA,
      observedAt,
      customer: fixture(),
    });
    await repository.upsertCustomer({
      connectionId: connectionB,
      observedAt,
      customer: fixture(),
    });
    await repository.upsertCustomer({
      connectionId: connectionA,
      observedAt,
      customer: fixture({ id: 124 }),
    });
    const count = await prisma.customer.count({
  where: {
    connectionId: {
      in: [connectionA, connectionB],
    },
  },
});

expect(count).toBe(3);
  });

  it("rolls back parent changes when child persistence fails", async () => {
    const repository = createCustomerRepository(prisma);
    await repository.upsertCustomer({
      connectionId: connectionA,
      observedAt,
      customer: fixture(),
    });
    const invalid = fixture({ razao_social: "Must Roll Back" });
    if (invalid.contacts.state === "PROVIDED")
      invalid.contacts.items[0]!.position = 2_147_483_648;
    await expect(
      repository.upsertCustomer({
        connectionId: connectionA,
        observedAt,
        customer: invalid,
      }),
    ).rejects.toBeInstanceOf(CustomerPersistenceError);
    const stored = await prisma.customer.findUniqueOrThrow({
      where: {
        connectionId_sourceId: { connectionId: connectionA, sourceId: "123" },
      },
    });
    expect(stored.legalName).toBe("Synthetic Customer");
    expect(await prisma.customerContact.count()).toBe(2);
  });
});
