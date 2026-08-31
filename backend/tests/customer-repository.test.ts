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

  it("uses a bounded 30 second interactive transaction timeout", async () => {
    const tx = transactionClient();
    const transaction = vi.fn(async (callback) => callback(tx));
    const repository = repositoryWithTransaction(transaction);

    await repository.upsertCustomer(input());

    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 30_000,
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

  it.each([
    [
      "Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms.",
      "TRANSACTION_EXPIRED",
    ],
    ["Transaction API error. Last state: 'Expired'", "TRANSACTION_EXPIRED"],
    [
      "Transaction already closed after a technical state transition",
      "TRANSACTION_ALREADY_CLOSED",
    ],
    [
      "Unclassified transaction detail secret-value-CANARY",
      "UNKNOWN_TRANSACTION_ERROR",
    ],
  ] as const)(
    "classifies a safe P2028 reason as %s",
    async (rawReason, expected) => {
      const tx = transactionClient();
      tx.customer.findUnique.mockRejectedValueOnce({
        code: "P2028",
        message: "raw-message-CANARY",
        meta: { error: `${rawReason} SELECT * email-canary@example.com` },
      });
      const repository = repositoryWithTransaction(
        vi.fn(async (callback) => callback(tx)),
      );
      const error = await repository
        .upsertCustomer(input())
        .catch((caught: unknown) => caught);
      expect(error).toMatchObject({
        diagnostics: {
          persistenceStage: "CUSTOMER",
          persistenceOperation: "UPSERT",
          persistenceErrorClass: "TRANSACTION_ERROR",
          transactionReason: expected,
        },
      });
      const serialized = JSON.stringify(error);
      for (const canary of [
        rawReason,
        "5000",
        "SELECT *",
        "email-canary@example.com",
        "raw-message-CANARY",
        "secret-value-CANARY",
      ]) {
        expect(serialized).not.toContain(canary);
      }
    },
  );

  it("does not attach a transaction reason to a non-P2028 error", async () => {
    const tx = transactionClient();
    tx.customer.findUnique.mockRejectedValueOnce({
      code: "P2000",
      meta: { error: "Transaction already closed" },
    });
    const repository = repositoryWithTransaction(
      vi.fn(async (callback) => callback(tx)),
    );
    const error = await repository
      .upsertCustomer(input())
      .catch((caught: unknown) => caught);
    expect(error.diagnostics).toMatchObject({
      persistenceErrorClass: "VALUE_TOO_LONG",
    });
    expect(error.diagnostics).not.toHaveProperty("transactionReason");
  });
});
