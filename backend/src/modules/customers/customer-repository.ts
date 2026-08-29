import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  NormalizedCollection,
  NormalizedCustomer,
  NormalizedCustomerAddress,
  NormalizedCustomerContact,
} from "../../integrations/tagplus/customers/customer-normalizer.js";

export class CustomerPersistenceError extends Error {
  readonly category = "CUSTOMER_PERSISTENCE_ERROR";
  constructor() {
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
      try {
        return await client.$transaction((tx) => persistCustomer(tx, input));
      } catch {
        throw new CustomerPersistenceError();
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
): Promise<UpsertCustomerResult> {
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

  const contacts = await syncContacts(tx, customerId, input.customer.contacts);
  const addresses = await syncAddresses(
    tx,
    customerId,
    input.customer.addresses,
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
) {
  if (collection.state === "NOT_PROVIDED") {
    return { processed: 0, removed: 0, changed: false };
  }
  const before = await tx.customerContact.findMany({ where: { customerId } });
  const changed = collectionChanged(before, collection.items);
  for (const item of collection.items) {
    await tx.customerContact.upsert({
      where: { customerId_sourceId: { customerId, sourceId: item.sourceId } },
      create: { customerId, ...item },
      update: item,
    });
  }
  const removed = await tx.customerContact.deleteMany({
    where: {
      customerId,
      ...(collection.items.length
        ? { sourceId: { notIn: collection.items.map((item) => item.sourceId) } }
        : {}),
    },
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
) {
  if (collection.state === "NOT_PROVIDED") {
    return { processed: 0, removed: 0, changed: false };
  }
  const before = await tx.customerAddress.findMany({ where: { customerId } });
  const changed = collectionChanged(before, collection.items);
  for (const item of collection.items) {
    await tx.customerAddress.upsert({
      where: { customerId_sourceId: { customerId, sourceId: item.sourceId } },
      create: { customerId, ...item },
      update: item,
    });
  }
  const removed = await tx.customerAddress.deleteMany({
    where: {
      customerId,
      ...(collection.items.length
        ? { sourceId: { notIn: collection.items.map((item) => item.sourceId) } }
        : {}),
    },
  });
  return {
    processed: collection.items.length,
    removed: removed.count,
    changed,
  };
}

function collectionChanged<T extends { sourceId: string }>(
  existing: Array<{ sourceId: string }>,
  candidate: T[],
): boolean {
  if (existing.length !== candidate.length) return true;
  const bySourceId = new Map(existing.map((item) => [item.sourceId, item]));
  return candidate.some((item) => {
    const current = bySourceId.get(item.sourceId);
    return !current || !sameSourceData(current, item);
  });
}
