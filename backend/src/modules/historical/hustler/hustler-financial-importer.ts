import crypto from "crypto";
import {
  PrismaClient,
  Prisma,
  SourceSystem,
  OperationUnit,
  HistoricalImportBatchStatus,
} from "@prisma/client";
import {
  planHustlerFinancialImport,
  HustlerFinancialImportPlan,
  assertSafeDatabaseUrl,
} from "./hustler-financial-planner.js";

export interface HustlerFinancialImportOptions {
  batchId: string;
  dryRun?: boolean;
  chunkSize?: number;
  plan?: HustlerFinancialImportPlan;
}

export interface HustlerFinancialImportResult {
  batchId: string;
  dryRun: boolean;
  preflight: {
    totalSourceRows: number;
    plannedFinancialRecords: number;
    plannedFinancialAmount: number;
    saleReceivableCount: number;
    saleReceivableAmount: number;
    operatingExpenseCount: number;
    operatingExpenseAmount: number;
    inventoryPurchaseCount: number;
    inventoryPurchaseAmount: number;
    totalSkippedCount: number;
    totalSkippedAmount: number;
    skippedOtherIncomeCount: number;
    skippedOtherIncomeAmount: number;
    quarantinedCount: number;
    quarantinedAmount: number;
    unresolvedCount: number;
    unresolvedAmount: number;
    conflicts: number;
    preflightPassed: boolean;
  };
  counts: {
    created: number;
    alreadyExisting: number;
    skipped: number;
    conflicts: number;
    failed: number;
  };
  byClass?: {
    saleReceivable: { count: number; amount: number };
    operatingExpense: { count: number; amount: number };
    inventoryPurchaseAp: { count: number; amount: number };
  };
  postValidation?: {
    baselineCounts: {
      products: number;
      customers: number;
      sales: number;
      saleItems: number;
      saleSourceDocs: number;
      saleSourceDocItems: number;
      financialRecordsBefore: number;
      historicalIdentities: number;
    };
    postCounts: {
      financialRecordsAfter: number;
      historicalFinancialRecords: number;
      productsUnchanged: boolean;
      customersUnchanged: boolean;
      salesUnchanged: boolean;
      saleItemsUnchanged: boolean;
      ssdUnchanged: boolean;
      ssdiUnchanged: boolean;
      identitiesUnchanged: boolean;
    };
    revenueValidation: {
      commercialRevenueBefore: number;
      commercialRevenueAfter: number;
      commercialRevenueUnchanged: boolean;
    };
    skippedIntegrity: {
      skippedSourceIdsPersisted: number;
    };
    statusBreakdown: {
      openReceivablesCount: number;
      openReceivablesAmount: number;
      confirmedReceivablesCount: number;
      confirmedReceivablesAmount: number;
      openPayablesCount: number;
      openPayablesAmount: number;
      confirmedPayablesCount: number;
      confirmedPayablesAmount: number;
    };
    saleLinkage: {
      linkedReceivables: number;
      linkedAmount: number;
      unlinkedReceivables: number;
      unlinkedAmount: number;
      ambiguous: number;
    };
    batchStatus: string;
  };
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export async function importHustlerFinancial(
  prisma: PrismaClient,
  options: HustlerFinancialImportOptions
): Promise<HustlerFinancialImportResult> {
  const { batchId, dryRun = true, chunkSize = 500 } = options;

  // 1. Verify batch and guards
  const batch = await prisma.historicalImportBatch.findUnique({
    where: { id: batchId },
  });

  if (!batch) {
    throw new Error(`Batch '${batchId}' not found.`);
  }

  if (batch.sourceSystem !== SourceSystem.HUSTLER_LEGACY_DUMP) {
    throw new Error(
      `Invalid sourceSystem '${batch.sourceSystem}'. Expected '${SourceSystem.HUSTLER_LEGACY_DUMP}'.`
    );
  }

  if (batch.status !== HistoricalImportBatchStatus.STAGED) {
    throw new Error(
      `Batch '${batchId}' must be in STAGED status. Current status: ${batch.status}`
    );
  }

  // 2. Pre-flight Validation using Phase 4O authoritative planner (or reuse provided plan to eliminate redundant egress)
  const plan: HustlerFinancialImportPlan =
    options.plan || (await planHustlerFinancialImport(prisma, batchId));
  const s = plan.summary;

  const preflightPassed =
    s.totalSourceRows === 11152 &&
    s.plannedFinancialRecordsCount === 11094 &&
    s.plannedFinancialRecordsAmount === 2200271.78 &&
    s.classes.SALE_RECEIVABLE.count === 8963 &&
    s.classes.SALE_RECEIVABLE.total === 1114512.33 &&
    s.classes.OPERATING_EXPENSE.count === 1317 &&
    s.classes.OPERATING_EXPENSE.total === 487874.99 &&
    s.classes.INVENTORY_PURCHASE_AP.count === 814 &&
    s.classes.INVENTORY_PURCHASE_AP.total === 597884.46 &&
    s.totalSkippedCount === 58 &&
    s.totalSkippedAmount === 7372.98 &&
    s.skippedOtherIncomeCount === 28 &&
    s.skippedOtherIncomeAmount === 2785.54 &&
    s.quarantinedCount === 24 &&
    s.quarantineSalesFinancialAmount === 2743.94 &&
    s.unresolvedCount === 6 &&
    s.classes.UNRESOLVED.total === 1843.5;

  if (!preflightPassed) {
    throw new Error(
      `PREFLIGHT FAILED: Planned financial metrics diverge from Phase 4O specifications. Aborting.`
    );
  }

  // 3. Baseline Canonical State (sequential queries for connection pool stability)
  const productsBefore = await prisma.product.count();
  const customersBefore = await prisma.customer.count();
  const salesBefore = await prisma.sale.count();
  const saleItemsBefore = await prisma.saleItem.count();
  const ssdBefore = await prisma.saleSourceDocument.count();
  const ssdiBefore = await prisma.saleSourceDocumentItem.count();
  const identitiesBefore = await prisma.historicalSourceIdentity.count();
  const financialBefore = await prisma.financialRecord.count();
  const revenueBeforeAgg = await prisma.saleSourceDocument.aggregate({
    where: { sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP },
    _sum: { netAmount: true },
  });

  const commercialRevenueBefore = round2(Number(revenueBeforeAgg._sum.netAmount || 0));

  // 4. Preload existing FinancialRecords for HUSTLER_LEGACY_DUMP
  const importableRecords = plan.plannedRecords.filter((r) => r.importable);

  const existingFinancialRecords = await prisma.financialRecord.findMany({
    where: {
      connectionId: plan.connectionId,
      sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
    },
    select: {
      id: true,
      sourceId: true,
      sourceSystem: true,
      importBatchId: true,
      originalAmount: true,
      type: true,
    },
  });

  const existingRecordMap = new Map<string, typeof existingFinancialRecords[0]>();
  let conflicts = 0;

  for (const ef of existingFinancialRecords) {
    existingRecordMap.set(ef.sourceId, ef);
    if (ef.sourceSystem !== SourceSystem.HUSTLER_LEGACY_DUMP || ef.importBatchId !== batchId) {
      conflicts++;
    }
  }

  if (conflicts > 0) {
    throw new Error(`ABORT: Found ${conflicts} conflicting FinancialRecord(s) with mismatched sourceSystem/batch.`);
  }

  const toCreate = importableRecords.filter((r) => !existingRecordMap.has(r.sourceId));
  const alreadyExisting = importableRecords.length - toCreate.length;

  const preflight = {
    totalSourceRows: s.totalSourceRows,
    plannedFinancialRecords: s.plannedFinancialRecordsCount,
    plannedFinancialAmount: s.plannedFinancialRecordsAmount,
    saleReceivableCount: s.classes.SALE_RECEIVABLE.count,
    saleReceivableAmount: s.classes.SALE_RECEIVABLE.total,
    operatingExpenseCount: s.classes.OPERATING_EXPENSE.count,
    operatingExpenseAmount: s.classes.OPERATING_EXPENSE.total,
    inventoryPurchaseCount: s.classes.INVENTORY_PURCHASE_AP.count,
    inventoryPurchaseAmount: s.classes.INVENTORY_PURCHASE_AP.total,
    totalSkippedCount: s.totalSkippedCount,
    totalSkippedAmount: s.totalSkippedAmount,
    skippedOtherIncomeCount: s.skippedOtherIncomeCount,
    skippedOtherIncomeAmount: s.skippedOtherIncomeAmount,
    quarantinedCount: s.quarantinedCount,
    quarantinedAmount: s.quarantineSalesFinancialAmount,
    unresolvedCount: s.unresolvedCount,
    unresolvedAmount: s.classes.UNRESOLVED.total,
    conflicts,
    preflightPassed: true,
  };

  // If DRY-RUN mode, return simulated result
  if (dryRun) {
    return {
      batchId,
      dryRun: true,
      preflight,
      counts: {
        created: toCreate.length,
        alreadyExisting,
        skipped: s.totalSkippedCount,
        conflicts: 0,
        failed: 0,
      },
      byClass: {
        saleReceivable: {
          count: s.classes.SALE_RECEIVABLE.count,
          amount: s.classes.SALE_RECEIVABLE.total,
        },
        operatingExpense: {
          count: s.classes.OPERATING_EXPENSE.count,
          amount: s.classes.OPERATING_EXPENSE.total,
        },
        inventoryPurchaseAp: {
          count: s.classes.INVENTORY_PURCHASE_AP.count,
          amount: s.classes.INVENTORY_PURCHASE_AP.total,
        },
      },
    };
  }

  // 5. PERSISTENCE MODE: Process in Atomic Chunks
  let created = 0;
  let failed = 0;
  const now = new Date();

  for (let i = 0; i < toCreate.length; i += chunkSize) {
    const chunk = toCreate.slice(i, i + chunkSize);

    try {
      await prisma.$transaction(async (tx) => {
        const createData: Prisma.FinancialRecordCreateManyInput[] = chunk.map((r) => {
          const payload = (r.rawPayload || {}) as any;
          return {
            id: crypto.randomUUID(),
            connectionId: plan.connectionId,
            sourceId: r.sourceId,
            type: r.canonicalFinancialType,
            isConfirmed: r.isConfirmed,
            isTransfer: false,
            description: r.description || payload.descricao || null,
            documentNumber: r.documentNumber || (payload.documento ? String(payload.documento) : null),
            dueDate: r.dueDate,
            confirmationDate: r.confirmedDate,
            sourceCompetenceDate: r.competenceDate,
            postingDate: r.confirmedDate ?? r.dueDate,
            originalAmount: new Prisma.Decimal(r.amountOriginal),
            grossAmount: new Prisma.Decimal(r.amountOriginal),
            paidAmount: r.amountPaid > 0 ? new Prisma.Decimal(r.amountPaid) : null,
            totalAmount: new Prisma.Decimal(r.amountOriginal),
            installmentNumber: r.installmentNumber,
            installmentCount: r.installmentCount,
            budgetPlanSourceId: r.budgetPlanSourceId,
            paymentMethodSourceId: r.paymentMethod,
            entitySourceId: r.customerId,
            sourcePayload: payload as Prisma.InputJsonValue,
            sourcePresent: true,
            lastSeenAt: now,
            sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
            operationUnit: OperationUnit.HUSTLER,
            importBatchId: batchId,
          };
        });

        await tx.financialRecord.createMany({
          data: createData,
        });
      });

      created += chunk.length;
    } catch (err) {
      console.error(`Error persisting financial chunk starting at index ${i}:`, err);
      failed += chunk.length;
      throw err;
    }
  }

  // 6. Post-Validation (sequential queries for stability)
  const productsAfter = await prisma.product.count();
  const customersAfter = await prisma.customer.count();
  const salesAfter = await prisma.sale.count();
  const saleItemsAfter = await prisma.saleItem.count();
  const ssdAfter = await prisma.saleSourceDocument.count();
  const ssdiAfter = await prisma.saleSourceDocumentItem.count();
  const identitiesAfter = await prisma.historicalSourceIdentity.count();
  const financialAfter = await prisma.financialRecord.count();
  const revenueAfterAgg = await prisma.saleSourceDocument.aggregate({
    where: { sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP },
    _sum: { netAmount: true },
  });
  const historicalFinancialRecords = await prisma.financialRecord.count({
    where: {
      sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
      importBatchId: batchId,
    },
  });
  const skippedSourceIds = plan.plannedRecords.filter((r) => !r.importable).map((r) => r.sourceId);
  const skippedInDb = await prisma.financialRecord.count({
    where: {
      sourceId: { in: skippedSourceIds },
    },
  });

  const commercialRevenueAfter = round2(Number(revenueAfterAgg._sum.netAmount || 0));

  // Compute breakdown metrics
  let openRecCount = 0;
  let openRecAmt = 0;
  let confRecCount = 0;
  let confRecAmt = 0;
  let openPayCount = 0;
  let openPayAmt = 0;
  let confPayCount = 0;
  let confPayAmt = 0;

  for (const r of importableRecords) {
    if (r.direction === "E") {
      if (r.isConfirmed) {
        confRecCount++;
        confRecAmt += r.amountOriginal;
      } else {
        openRecCount++;
        openRecAmt += r.amountOriginal;
      }
    } else {
      if (r.isConfirmed) {
        confPayCount++;
        confPayAmt += r.amountOriginal;
      } else {
        openPayCount++;
        openPayAmt += r.amountOriginal;
      }
    }
  }

  return {
    batchId,
    dryRun: false,
    preflight,
    counts: {
      created,
      alreadyExisting,
      skipped: s.totalSkippedCount,
      conflicts: 0,
      failed,
    },
    byClass: {
      saleReceivable: {
        count: s.classes.SALE_RECEIVABLE.count,
        amount: s.classes.SALE_RECEIVABLE.total,
      },
      operatingExpense: {
        count: s.classes.OPERATING_EXPENSE.count,
        amount: s.classes.OPERATING_EXPENSE.total,
      },
      inventoryPurchaseAp: {
        count: s.classes.INVENTORY_PURCHASE_AP.count,
        amount: s.classes.INVENTORY_PURCHASE_AP.total,
      },
    },
    postValidation: {
      baselineCounts: {
        products: productsBefore,
        customers: customersBefore,
        sales: salesBefore,
        saleItems: saleItemsBefore,
        saleSourceDocs: ssdBefore,
        saleSourceDocItems: ssdiBefore,
        financialRecordsBefore: financialBefore,
        historicalIdentities: identitiesBefore,
      },
      postCounts: {
        financialRecordsAfter: financialAfter,
        historicalFinancialRecords,
        productsUnchanged: productsAfter === productsBefore,
        customersUnchanged: customersAfter === customersBefore,
        salesUnchanged: salesAfter === salesBefore,
        saleItemsUnchanged: saleItemsAfter === saleItemsBefore,
        ssdUnchanged: ssdAfter === ssdBefore,
        ssdiUnchanged: ssdiAfter === ssdiBefore,
        identitiesUnchanged: identitiesAfter === identitiesBefore,
      },
      revenueValidation: {
        commercialRevenueBefore,
        commercialRevenueAfter,
        commercialRevenueUnchanged: commercialRevenueBefore === commercialRevenueAfter,
      },
      skippedIntegrity: {
        skippedSourceIdsPersisted: skippedInDb,
      },
      statusBreakdown: {
        openReceivablesCount: openRecCount,
        openReceivablesAmount: round2(openRecAmt),
        confirmedReceivablesCount: confRecCount,
        confirmedReceivablesAmount: round2(confRecAmt),
        openPayablesCount: openPayCount,
        openPayablesAmount: round2(openPayAmt),
        confirmedPayablesCount: confPayCount,
        confirmedPayablesAmount: round2(confPayAmt),
      },
      saleLinkage: {
        linkedReceivables: s.linkedToCanonicalSalesCount,
        linkedAmount: s.linkedCanonicalAmount,
        unlinkedReceivables: s.classes.SALE_RECEIVABLE.count - s.linkedToCanonicalSalesCount,
        unlinkedAmount: round2(s.classes.SALE_RECEIVABLE.total - s.linkedCanonicalAmount),
        ambiguous: 0,
      },
      batchStatus: batch.status,
    },
  };
}
