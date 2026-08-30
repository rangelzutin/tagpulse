import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { normalizeTagPlusCustomer } from "../src/integrations/tagplus/customers/customer-normalizer.js";
import {
  createCustomerRepository,
  CustomerPersistenceError,
} from "../src/modules/customers/customer-repository.js";

const customer = normalizeTagPlusCustomer({
  id: 1,
  contatos: [{ id: 2 }],
  enderecos: [{ id: 3 }],
});

function transactionClient() {
  return {
    customer: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "internal-customer-id" }),
      update: vi.fn(),
    },
    customerContact: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    customerAddress: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

function repositoryWithTransaction(transaction: ReturnType<typeof vi.fn>) {
  return createCustomerRepository({
    $transaction: transaction,
  } as unknown as Pick<PrismaClient, "$transaction">);
}

function input() {
  return {
    connectionId: "connection",
    observedAt: new Date("2026-08-30T12:00:00Z"),
    customer,
  };
}

describe("customer repository safe persistence diagnostics", () => {
  it("preserves valid persistence behavior", async () => {
    const tx = transactionClient();
    const repository = repositoryWithTransaction(
      vi.fn(async (callback) => callback(tx)),
    );
    await expect(repository.upsertCustomer(input())).resolves.toMatchObject({
      outcome: "INSERTED",
      contactsProcessed: 1,
      addressesProcessed: 1,
    });
  });

  it.each([
    ["CUSTOMER", "UPSERT", "VALUE_TOO_LONG", "customer", "findUnique", "P2000"],
    [
      "CONTACTS",
      "UPSERT",
      "FOREIGN_KEY_CONSTRAINT",
      "customerContact",
      "findMany",
      "P2003",
    ],
    [
      "ADDRESSES",
      "UPSERT",
      "NOT_NULL_CONSTRAINT",
      "customerAddress",
      "findMany",
      "P2011",
    ],
  ] as const)(
    "classifies a %s persistence failure",
    async (stage, operation, errorClass, delegate, method, code) => {
      const tx = transactionClient();
      tx[delegate][method].mockRejectedValueOnce({
        code,
        message: "RAW_DB_CANARY customer@example.invalid source-123",
      });
      const repository = repositoryWithTransaction(
        vi.fn(async (callback) => callback(tx)),
      );
      const error = await repository
        .upsertCustomer(input())
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(CustomerPersistenceError);
      expect(error).toMatchObject({
        diagnostics: {
          persistenceStage: stage,
          persistenceOperation: operation,
          persistenceErrorClass: errorClass,
        },
      });
      expect(JSON.stringify(error)).not.toContain("RAW_DB_CANARY");
      expect(JSON.stringify(error)).not.toContain("source-123");
    },
  );

  it("classifies a transaction commit failure", async () => {
    const tx = transactionClient();
    const repository = repositoryWithTransaction(
      vi.fn(async (callback) => {
        await callback(tx);
        throw { code: "P2028", message: "RAW_COMMIT_CANARY" };
      }),
    );
    const error = await repository
      .upsertCustomer(input())
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      diagnostics: {
        persistenceStage: "TRANSACTION",
        persistenceOperation: "COMMIT",
        persistenceErrorClass: "TRANSACTION_ERROR",
      },
    });
    expect(JSON.stringify(error)).not.toContain("RAW_COMMIT_CANARY");
  });

  it("classifies an unknown transaction failure without raw details", async () => {
    const repository = repositoryWithTransaction(
      vi.fn().mockRejectedValue(new Error("RAW_UNKNOWN_CANARY")),
    );
    const error = await repository
      .upsertCustomer(input())
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      diagnostics: {
        persistenceStage: "TRANSACTION",
        persistenceOperation: "UNKNOWN",
        persistenceErrorClass: "UNKNOWN_DATABASE_ERROR",
      },
    });
    expect(JSON.stringify(error)).not.toContain("RAW_UNKNOWN_CANARY");
  });
});
