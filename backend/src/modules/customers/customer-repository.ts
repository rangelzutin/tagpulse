import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  NormalizedCollection,
  NormalizedCustomer,
  NormalizedCustomerAddress,
  NormalizedCustomerContact,
} from "../../integrations/tagplus/customers/customer-normalizer.js";

const CUSTOMER_TRANSACTION_TIMEOUT_MS = 30_000;

export type CustomerPersistenceStage =
  "CUSTOMER" | "CONTACTS" | "ADDRESSES" | "TRANSACTION" | "UNKNOWN";

export type CustomerPersistenceOperation =
  "UPSERT" | "DELETE_MISSING_CHILDREN" | "COMMIT" | "UNKNOWN";

export type CustomerPersistenceErrorClass =
  | "UNIQUE_CONSTRAINT"
  | "FOREIGN_KEY_CONSTRAINT"
  | "NOT_NULL_CONSTRAINT"
  | "VALUE_TOO_LONG"
  | "INVALID_DATABASE_VALUE"
  | "TRANSACTION_ERROR"
  | "DATABASE_UNAVAILABLE"
  | "UNKNOWN_DATABASE_ERROR";

export type CustomerTransactionReason =
  | "TRANSACTION_EXPIRED"
  | "TRANSACTION_ALREADY_CLOSED"
  | "UNKNOWN_TRANSACTION_ERROR";

export interface CustomerPersistenceDiagnostics {
  persistenceStage: CustomerPersistenceStage;
  persistenceOperation: CustomerPersistenceOperation;
  persistenceErrorClass: CustomerPersistenceErrorClass;
  transactionReason?: CustomerTransactionReason;
}

interface PersistenceContext {
  stage: CustomerPersistenceStage;
  operation: CustomerPersistenceOperation;
}

export class CustomerPersistenceError extends Error {
  readonly category = "CUSTOMER_PERSISTENCE_ERROR";
  constructor(public readonly diagnostics: CustomerPersistenceDiagnostics) {
    super("CUSTOMER_PERSISTENCE_ERROR");
    this.name = "CustomerPersistenceError";
  }
}

export interface UpsertCustomerInput {
  connectionId: string;
  syncRunId?: string | null;
  observedAt: Date;
  customer: NormalizedCustomer;
}

export interface UpsertCustomerResult {
  outcome: "INSERTED" | "UPDATED" | "UNCHANGED";
  contactsProcessed: number;
  contactsRemoved: number;
  addressesProcessed: number;
  addressesRemoved: number;
}

export function createCustomerRepository(
  client: Pick<PrismaClient, "$transaction">,
) {
  return {
    async upsertCustomer(
      input: UpsertCustomerInput,
    ): Promise<UpsertCustomerResult> {
      const context: PersistenceContext = {
        stage: "TRANSACTION",
        operation: "UNKNOWN",
      };
      let transactionCallbackCompleted = false;
      try {
        return await client.$transaction(
          async (tx) => {
            const result = await persistCustomer(tx, input, context);
            transactionCallbackCompleted = true;
            return result;
          },
          { timeout: CUSTOMER_TRANSACTION_TIMEOUT_MS },
        );
      } catch (error: unknown) {
        const persistenceErrorClass = classifyPersistenceError(
          error,
          transactionCallbackCompleted,
        );
        const transactionReason =
          persistenceErrorClass === "TRANSACTION_ERROR"
            ? classifyTransactionReason(error)
            : undefined;
        throw new CustomerPersistenceError({
          persistenceStage: transactionCallbackCompleted
            ? "TRANSACTION"
            : context.stage,
          persistenceOperation: transactionCallbackCompleted
            ? "COMMIT"
            : context.operation,
          persistenceErrorClass,
          ...(transactionReason ? { transactionReason } : {}),
        });
      }
    },
  };
}

const customerSourceSelect = {
  sourceEntityId: true,
  code: true,
  externalCode: true,
  type: true,
  legalName: true,
  tradeName: true,
  sourceActive: true,
  cpf: true,
  cnpj: true,
  email: true,
  phone: true,
  acceptsEmail: true,
  sourceCreatedAt: true,
  sourceUpdatedAt: true,
  birthDate: true,
  stateRegistration: true,
  municipalRegistration: true,
  cnae: true,
  suframa: true,
  ieIndicator: true,
  foreignCustomer: true,
} satisfies Prisma.CustomerSelect;

async function persistCustomer(
  tx: Prisma.TransactionClient,
  input: UpsertCustomerInput,
  context: PersistenceContext,
): Promise<UpsertCustomerResult> {
  context.stage = "CUSTOMER";
  context.operation = "UPSERT";
  const key = {
    connectionId_sourceId: {
      connectionId: input.connectionId,
      sourceId: input.customer.sourceId,
    },
  };
  const existing = await tx.customer.findUnique({
    where: key,
    select: { id: true, ...customerSourceSelect },
  });
  const sourceData = toCustomerSourceData(input.customer);
  const metadata = {
    sourcePresent: true,
    lastSeenAt: input.observedAt,
    lastSyncedAt: input.observedAt,
    lastSeenSyncRunId: input.syncRunId ?? null,
  };
  let customerId: string;
  let outcome: UpsertCustomerResult["outcome"];
  let parentChanged = false;
  if (!existing) {
    const created = await tx.customer.create({
      data: {
        connectionId: input.connectionId,
        sourceId: input.customer.sourceId,
        ...sourceData,
        ...metadata,
      },
      select: { id: true },
    });
    customerId = created.id;
    outcome = "INSERTED";
  } else {
    customerId = existing.id;
    parentChanged = !sameSourceData(existing, sourceData);
    await tx.customer.update({
      where: { id: customerId },
      data: { ...(parentChanged ? sourceData : {}), ...metadata },
    });
    outcome = parentChanged ? "UPDATED" : "UNCHANGED";
  }

  const contacts = await syncContacts(
    tx,
    customerId,
    input.customer.contacts,
    context,
  );
  const addresses = await syncAddresses(
    tx,
    customerId,
    input.customer.addresses,
    context,
  );
  if (existing && (parentChanged || contacts.changed || addresses.changed)) {
    outcome = "UPDATED";
  }
  return {
    outcome,
    contactsProcessed: contacts.processed,
    contactsRemoved: contacts.removed,
    addressesProcessed: addresses.processed,
    addressesRemoved: addresses.removed,
  };
}

function toCustomerSourceData(customer: NormalizedCustomer) {
  return {
    sourceEntityId: customer.sourceEntityId,
    code: customer.code,
    externalCode: customer.externalCode,
    type: customer.type,
    legalName: customer.legalName,
    tradeName: customer.tradeName,
    sourceActive: customer.sourceActive,
    cpf: customer.cpf,
    cnpj: customer.cnpj,
    email: customer.email,
    phone: customer.phone,
    acceptsEmail: customer.acceptsEmail,
    sourceCreatedAt: customer.sourceCreatedAt,
    sourceUpdatedAt: customer.sourceUpdatedAt,
    birthDate: customer.birthDate,
    stateRegistration: customer.stateRegistration,
    municipalRegistration: customer.municipalRegistration,
    cnae: customer.cnae,
    suframa: customer.suframa,
    ieIndicator: customer.ieIndicator,
    foreignCustomer: customer.foreignCustomer,
  };
}

function sameSourceData(existing: object, candidate: object): boolean {
  const existingRecord = existing as Record<string, unknown>;
  return Object.entries(candidate).every(([key, value]) => {
    const current = existingRecord[key];
    return current instanceof Date && value instanceof Date
      ? current.getTime() === value.getTime()
      : current === value;
  });
}

async function syncContacts(
  tx: Prisma.TransactionClient,
  customerId: string,
  collection: NormalizedCollection<NormalizedCustomerContact>,
  context: PersistenceContext,
) {
  if (collection.state === "NOT_PROVIDED") {
    return { processed: 0, removed: 0, changed: false };
  }
  context.stage = "CONTACTS";
  context.operation = "UPSERT";
  const before = await tx.customerContact.findMany({ where: { customerId } });
  const changed = collectionChanged(before, collection.items);
  for (const item of collection.items) {
    await tx.customerContact.upsert({
      where: {
        customerId_sourceId_position: {
          customerId,
          sourceId: item.sourceId,
          position: item.position,
        },
      },
      create: { customerId, ...item },
      update: item,
    });
  }
  context.operation = "DELETE_MISSING_CHILDREN";
  const obsoleteIds = missingChildIds(before, collection.items);
  const removed = await tx.customerContact.deleteMany({
    where: { customerId, id: { in: obsoleteIds } },
  });
  return {
    processed: collection.items.length,
    removed: removed.count,
    changed,
  };
}

async function syncAddresses(
  tx: Prisma.TransactionClient,
  customerId: string,
  collection: NormalizedCollection<NormalizedCustomerAddress>,
  context: PersistenceContext,
) {
  if (collection.state === "NOT_PROVIDED") {
    return { processed: 0, removed: 0, changed: false };
  }
  context.stage = "ADDRESSES";
  context.operation = "UPSERT";
  const before = await tx.customerAddress.findMany({ where: { customerId } });
  const changed = collectionChanged(before, collection.items);
  for (const item of collection.items) {
    await tx.customerAddress.upsert({
      where: {
        customerId_sourceId_position: {
          customerId,
          sourceId: item.sourceId,
          position: item.position,
        },
      },
      create: { customerId, ...item },
      update: item,
    });
  }
  context.operation = "DELETE_MISSING_CHILDREN";
  const obsoleteIds = missingChildIds(before, collection.items);
  const removed = await tx.customerAddress.deleteMany({
    where: { customerId, id: { in: obsoleteIds } },
  });
  return {
    processed: collection.items.length,
    removed: removed.count,
    changed,
  };
}

function classifyPersistenceError(
  error: unknown,
  transactionCallbackCompleted: boolean,
): CustomerPersistenceErrorClass {
  if (transactionCallbackCompleted) return "TRANSACTION_ERROR";
  const code = safePrismaCode(error);
  if (code === "P2002") return "UNIQUE_CONSTRAINT";
  if (code === "P2003") return "FOREIGN_KEY_CONSTRAINT";
  if (code === "P2011") return "NOT_NULL_CONSTRAINT";
  if (code === "P2000") return "VALUE_TOO_LONG";
  if (code === "P2006") return "INVALID_DATABASE_VALUE";
  if (code === "P2028") return "TRANSACTION_ERROR";
  if (code === "P2024" || /^P10\d{2}$/.test(code ?? ""))
    return "DATABASE_UNAVAILABLE";
  return "UNKNOWN_DATABASE_ERROR";
}

function safePrismaCode(error: unknown): string | undefined {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    typeof error.code !== "string"
  ) {
    return undefined;
  }
  return /^P\d{4}$/.test(error.code) ? error.code : undefined;
}

function classifyTransactionReason(
  error: unknown,
): CustomerTransactionReason | undefined {
  if (safePrismaCode(error) !== "P2028") return undefined;
  const technicalReason = safePrismaMetaError(error);
  if (!technicalReason) return "UNKNOWN_TRANSACTION_ERROR";
  if (
    /expired transaction/i.test(technicalReason) ||
    /last state:\s*['"]?expired/i.test(technicalReason) ||
    /transaction timeout/i.test(technicalReason) ||
    /timeout for this transaction/i.test(technicalReason)
  ) {
    return "TRANSACTION_EXPIRED";
  }
  if (/transaction already closed/i.test(technicalReason)) {
    return "TRANSACTION_ALREADY_CLOSED";
  }
  return "UNKNOWN_TRANSACTION_ERROR";
}

function safePrismaMetaError(error: unknown): string | undefined {
  if (
    typeof error !== "object" ||
    error === null ||
    !("meta" in error) ||
    typeof error.meta !== "object" ||
    error.meta === null ||
    !("error" in error.meta) ||
    typeof error.meta.error !== "string"
  ) {
    return undefined;
  }
  return error.meta.error;
}

function collectionChanged<T extends { sourceId: string; position: number }>(
  existing: Array<{ sourceId: string; position: number }>,
  candidate: T[],
): boolean {
  if (existing.length !== candidate.length) return true;
  return candidate.some((item) => {
    const current = existing.find(
      (stored) =>
        stored.sourceId === item.sourceId && stored.position === item.position,
    );
    return !current || !sameSourceData(current, item);
  });
}

function missingChildIds<T extends { sourceId: string; position: number }>(
  existing: Array<{ id: string; sourceId: string; position: number }>,
  candidate: T[],
): string[] {
  return existing
    .filter(
      (stored) =>
        !candidate.some(
          (item) =>
            item.sourceId === stored.sourceId &&
            item.position === stored.position,
        ),
    )
    .map((stored) => stored.id);
}
