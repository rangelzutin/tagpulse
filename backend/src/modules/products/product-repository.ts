import { Prisma, type PrismaClient } from "@prisma/client";
import type { NormalizedProduct } from "../../integrations/tagplus/products/product-normalizer.js";

const PRODUCT_TRANSACTION_TIMEOUT_MS = 30_000;

export type ProductPersistenceStage = "PRODUCT" | "TRANSACTION" | "UNKNOWN";

export type ProductPersistenceOperation = "UPSERT" | "COMMIT" | "UNKNOWN";

export type ProductPersistenceErrorClass =
  | "UNIQUE_CONSTRAINT"
  | "FOREIGN_KEY_CONSTRAINT"
  | "NOT_NULL_CONSTRAINT"
  | "VALUE_TOO_LONG"
  | "INVALID_DATABASE_VALUE"
  | "TRANSACTION_ERROR"
  | "DATABASE_UNAVAILABLE"
  | "UNKNOWN_DATABASE_ERROR";

export type ProductTransactionReason =
  | "TRANSACTION_EXPIRED"
  | "TRANSACTION_ALREADY_CLOSED"
  | "UNKNOWN_TRANSACTION_ERROR";

export interface ProductPersistenceDiagnostics {
  persistenceStage: ProductPersistenceStage;
  persistenceOperation: ProductPersistenceOperation;
  persistenceErrorClass: ProductPersistenceErrorClass;
  transactionReason?: ProductTransactionReason;
}

interface PersistenceContext {
  stage: ProductPersistenceStage;
  operation: ProductPersistenceOperation;
}

export class ProductPersistenceError extends Error {
  readonly category = "PRODUCT_PERSISTENCE_ERROR";
  constructor(public readonly diagnostics: ProductPersistenceDiagnostics) {
    super("PRODUCT_PERSISTENCE_ERROR");
    this.name = "ProductPersistenceError";
  }
}

export interface UpsertProductInput {
  connectionId: string;
  syncRunId?: string | null;
  observedAt: Date;
  product: NormalizedProduct;
}

export interface UpsertProductResult {
  outcome: "INSERTED" | "UPDATED" | "UNCHANGED";
}

export function createProductRepository(
  client: Pick<PrismaClient, "$transaction">,
) {
  return {
    async upsertProduct(
      input: UpsertProductInput,
    ): Promise<UpsertProductResult> {
      const context: PersistenceContext = {
        stage: "TRANSACTION",
        operation: "UNKNOWN",
      };
      let transactionCallbackCompleted = false;
      try {
        return await client.$transaction(
          async (tx) => {
            const result = await persistProduct(tx, input, context);
            transactionCallbackCompleted = true;
            return result;
          },
          { timeout: PRODUCT_TRANSACTION_TIMEOUT_MS },
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
        throw new ProductPersistenceError({
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

const productSourceSelect = {
  code: true,
  externalCode: true,
  barcode: true,
  taxableBarcode: true,
  gradeCode: true,
  description: true,
  shortDescription: true,
  active: true,
  moved: true,
  commercializable: true,
  soldSeparately: true,
  type: true,
  purpose: true,
  brand: true,
  parentSourceId: true,
  categorySourceId: true,
  categoryDescription: true,
  departmentSourceId: true,
  departmentDescription: true,
  retailSalePrice: true,
  offerPrice: true,
  effectiveCost: true,
  averageCost: true,
  otherExpensesCost: true,
  stockQuantity: true,
  stockMinQuantity: true,
  stockMaxQuantity: true,
  outputUnitSourceId: true,
  outputUnitAbbreviation: true,
  outputUnitDescription: true,
  outputUnitFractioned: true,
  sourceCreatedAt: true,
  sourceUpdatedAt: true,
} satisfies Prisma.ProductSelect;

async function persistProduct(
  tx: Prisma.TransactionClient,
  input: UpsertProductInput,
  context: PersistenceContext,
): Promise<UpsertProductResult> {
  context.stage = "PRODUCT";
  context.operation = "UPSERT";
  const key = {
    connectionId_sourceId: {
      connectionId: input.connectionId,
      sourceId: input.product.sourceId,
    },
  };
  const existing = await tx.product.findUnique({
    where: key,
    select: { id: true, ...productSourceSelect },
  });
  const sourceData = toProductSourceData(input.product);
  const metadata = {
    sourcePresent: true,
    lastSeenAt: input.observedAt,
    lastSyncedAt: input.observedAt,
    lastSeenSyncRunId: input.syncRunId ?? null,
  };

  if (!existing) {
    await tx.product.create({
      data: {
        connectionId: input.connectionId,
        sourceId: input.product.sourceId,
        ...sourceData,
        ...metadata,
      },
      select: { id: true },
    });
    return { outcome: "INSERTED" };
  }

  const changed = !sameProductSourceData(existing, sourceData);
  await tx.product.update({
    where: { id: existing.id },
    data: { ...(changed ? sourceData : {}), ...metadata },
  });
  return { outcome: changed ? "UPDATED" : "UNCHANGED" };
}

function toProductSourceData(product: NormalizedProduct) {
  return {
    code: product.code,
    externalCode: product.externalCode,
    barcode: product.barcode,
    taxableBarcode: product.taxableBarcode,
    gradeCode: product.gradeCode,
    description: product.description,
    shortDescription: product.shortDescription,
    active: product.active,
    moved: product.moved,
    commercializable: product.commercializable,
    soldSeparately: product.soldSeparately,
    type: product.type,
    purpose: product.purpose,
    brand: product.brand,
    parentSourceId: product.parentSourceId,
    categorySourceId: product.categorySourceId,
    categoryDescription: product.categoryDescription,
    departmentSourceId: product.departmentSourceId,
    departmentDescription: product.departmentDescription,
    retailSalePrice:
      product.retailSalePrice !== null
        ? new Prisma.Decimal(product.retailSalePrice)
        : null,
    offerPrice:
      product.offerPrice !== null
        ? new Prisma.Decimal(product.offerPrice)
        : null,
    effectiveCost:
      product.effectiveCost !== null
        ? new Prisma.Decimal(product.effectiveCost)
        : null,
    averageCost:
      product.averageCost !== null
        ? new Prisma.Decimal(product.averageCost)
        : null,
    otherExpensesCost:
      product.otherExpensesCost !== null
        ? new Prisma.Decimal(product.otherExpensesCost)
        : null,
    stockQuantity:
      product.stockQuantity !== null
        ? new Prisma.Decimal(product.stockQuantity)
        : null,
    stockMinQuantity:
      product.stockMinQuantity !== null
        ? new Prisma.Decimal(product.stockMinQuantity)
        : null,
    stockMaxQuantity:
      product.stockMaxQuantity !== null
        ? new Prisma.Decimal(product.stockMaxQuantity)
        : null,
    outputUnitSourceId: product.outputUnitSourceId,
    outputUnitAbbreviation: product.outputUnitAbbreviation,
    outputUnitDescription: product.outputUnitDescription,
    outputUnitFractioned: product.outputUnitFractioned,
    sourceCreatedAt: product.sourceCreatedAt,
    sourceUpdatedAt: product.sourceUpdatedAt,
  };
}

function sameProductSourceData(
  existing: Record<string, unknown>,
  source: ReturnType<typeof toProductSourceData>,
): boolean {
  for (const [key, sourceValue] of Object.entries(source)) {
    const existingValue = existing[key];
    if (sourceValue instanceof Prisma.Decimal) {
      if (
        !(existingValue instanceof Prisma.Decimal) ||
        !existingValue.equals(sourceValue)
      ) {
        return false;
      }
      continue;
    }
    if (sourceValue instanceof Date) {
      if (
        !(existingValue instanceof Date) ||
        existingValue.getTime() !== sourceValue.getTime()
      ) {
        return false;
      }
      continue;
    }
    if (existingValue !== sourceValue) {
      return false;
    }
  }
  return true;
}

function classifyPersistenceError(
  error: unknown,
  callbackCompleted: boolean,
): ProductPersistenceErrorClass {
  if (callbackCompleted) return "TRANSACTION_ERROR";
  const code = safePrismaCode(error);
  if (code === "P2002") return "UNIQUE_CONSTRAINT";
  if (code === "P2003") return "FOREIGN_KEY_CONSTRAINT";
  if (code === "P2011") return "NOT_NULL_CONSTRAINT";
  if (code === "P2000") return "VALUE_TOO_LONG";
  if (code === "P2006" || code === "P2007") return "INVALID_DATABASE_VALUE";
  if (code === "P2028") return "TRANSACTION_ERROR";
  if (code === "P2024" || /^P10\d{2}$/.test(code ?? "")) {
    return "DATABASE_UNAVAILABLE";
  }
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
): ProductTransactionReason | undefined {
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
