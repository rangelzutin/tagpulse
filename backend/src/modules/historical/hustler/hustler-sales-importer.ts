import crypto from "crypto";
import {
  PrismaClient,
  Prisma,
  SourceSystem,
  OperationUnit,
  SalesChannel,
  SaleAnchorType,
  HistoricalImportBatchStatus,
} from "@prisma/client";
import {
  planHustlerSalesImport,
  HustlerSalesImportPlan,
} from "./hustler-sales-planner.js";

export interface HustlerSalesImportOptions {
  batchId: string;
  dryRun?: boolean;
  chunkSize?: number;
}

export interface HustlerSalesImportResult {
  batchId: string;
  dryRun: boolean;
  preflight: {
    plannedSales: number;
    plannedSaleItems: number;
    plannedSsd: number;
    plannedSsdi: number;
    plannedIdentities: number;
    plannedRevenue: number;
    conflicts: number;
    preflightPassed: boolean;
  };
  counts: {
    salesCreated: number;
    saleItemsCreated: number;
    ssdCreated: number;
    ssdiCreated: number;
    identitiesCreated: number;
    skippedExisting: number;
    conflicts: number;
    failed: number;
  };
  postValidation?: {
    canonicalCounts: {
      products: number;
      customers: number;
      sales: number;
      saleItems: number;
      saleSourceDocs: number;
      saleSourceDocItems: number;
      financialRecords: number;
      historicalIdentities: number;
    };
    historicalFactCounts: {
      historicalSales: number;
      historicalSaleItems: number;
      historicalSsd: number;
      historicalSsdi: number;
      historicalIdentities: number;
    };
    realizationCounts: {
      nfeSsd: number;
      vsSsd: number;
      nfeSsdi: number;
      vsSsdi: number;
      multipleRealization: number;
    };
    customerCounts: {
      canonicalCustomerSales: number;
      genericNullSales: number;
      blankNullSales: number;
      unresolved: number;
    };
    quarantineCounts: {
      quarantinedSalesImported: number;
      cancelledSalesImported: number;
    };
    revenue: {
      realizedHistoricalRevenue: number;
      expectedRevenue: number;
      revenueReconciles: boolean;
    };
    transition: {
      apr2026Count: number;
      apr2026Revenue: number;
      may2026Count: number;
      may2026Revenue: number;
      jun2026Count: number;
      jun2026Revenue: number;
      earliestSaleDate: string | null;
      latestSaleDate: string | null;
    };
    entityIntegrity: {
      historicalSaleWithoutIdentity: number;
      historicalSaleWithoutSsd: number;
      historicalSaleWithMultipleSsd: number;
      saleItemsUnresolved: number;
      ssdiUnresolved: number;
    };
    batchStatus: string;
  };
}

export async function importHustlerSales(
  prisma: PrismaClient,
  options: HustlerSalesImportOptions
): Promise<HustlerSalesImportResult> {
  const { batchId, dryRun = true, chunkSize = 50 } = options;

  // 1. Load batch and verify guards
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

  // 2. Pre-flight Validation using Phase 4H authoritative planner
  const plan: HustlerSalesImportPlan = await planHustlerSalesImport(prisma, batchId);
  const s = plan.summary;

  // Check how many identities for this batch already exist (for resume / idempotency)
  const existingBatchIdentitiesCount = await prisma.historicalSourceIdentity.count({
    where: {
      importBatchId: batchId,
      sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
      sourceEntity: "venda",
    },
  });

  const hasUnexpectedCollisions =
    s.saleSourceIdCollisions > existingBatchIdentitiesCount ||
    s.saleIdentityCollisions > existingBatchIdentitiesCount ||
    s.documentCollisions > existingBatchIdentitiesCount ||
    s.accessKeyCollisions > 0;

  const preflightPassed =
    s.importableSales === 6307 &&
    s.totalPlannedSaleItems === 11167 &&
    s.plannedSaleSourceDocuments === 6307 &&
    s.plannedSsdiCount === 11167 &&
    s.plannedIdentitiesCount === 6307 &&
    s.plannedSaleRevenue === 1141693.14 &&
    s.unresolvedCustomerCount === 0 &&
    s.unresolvedProductItems === 0 &&
    !hasUnexpectedCollisions &&
    s.quarantinedVendas === 11;

  if (!preflightPassed) {
    throw new Error(
      `PREFLIGHT FAILED: Planned metrics diverge from Phase 4H specifications. Aborting.`
    );
  }

  const unexpectedConflicts =
    (s.saleSourceIdCollisions - existingBatchIdentitiesCount) +
    (s.saleIdentityCollisions - existingBatchIdentitiesCount) +
    (s.documentCollisions - existingBatchIdentitiesCount);

  const preflight = {
    plannedSales: s.importableSales,
    plannedSaleItems: s.totalPlannedSaleItems,
    plannedSsd: s.plannedSaleSourceDocuments,
    plannedSsdi: s.plannedSsdiCount,
    plannedIdentities: s.plannedIdentitiesCount,
    plannedRevenue: s.plannedSaleRevenue,
    conflicts: unexpectedConflicts,
    preflightPassed: true,
  };

  // 3. Preload product catalog sourceIds for accurate sourceProductId mapping
  const canonicalProductIds = Array.from(
    new Set(
      plan.plannedSales.flatMap((sale) =>
        sale.items.map((it) => it.canonicalProductId).filter(Boolean)
      )
    )
  );

  const catalogProducts = await prisma.product.findMany({
    where: { id: { in: canonicalProductIds } },
    select: { id: true, sourceId: true },
  });

  const productSourceIdMap = new Map<string, string>();
  for (const p of catalogProducts) {
    if (p.sourceId) productSourceIdMap.set(p.id, p.sourceId);
  }

  // 4. Preload existing identities for this batch / company
  const existingIdentities = await prisma.historicalSourceIdentity.findMany({
    where: {
      companyId: plan.companyId,
      sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
      sourceEntity: "venda",
    },
    select: { sourcePrimaryKey: true, canonicalEntityId: true },
  });

  const identityMap = new Map<string, string>();
  for (const idRow of existingIdentities) {
    identityMap.set(idRow.sourcePrimaryKey, idRow.canonicalEntityId);
  }

  // 5. Preload existing Sales with HUSTLER_LEGACY namespace
  const existingSales = await prisma.sale.findMany({
    where: {
      connectionId: plan.connectionId,
      anchorSourceId: { startsWith: "HUSTLER_LEGACY:" },
    },
    select: { id: true, anchorSourceId: true },
  });

  const existingSaleSourceMap = new Map<string, string>();
  for (const sRow of existingSales) {
    existingSaleSourceMap.set(sRow.anchorSourceId, sRow.id);
  }

  // 6. Partition Planned Sales into to-create vs already-persisted vs conflicts
  const toProcessSales = [];
  let skippedExisting = 0;
  let conflicts = 0;

  for (const planned of plan.plannedSales) {
    const legacyVendaId = planned.legacyVendaId;
    const existingEntityId = identityMap.get(legacyVendaId);
    const existingSaleId = existingSaleSourceMap.get(planned.anchorSourceId);

    if (existingEntityId && existingSaleId) {
      if (existingEntityId === existingSaleId) {
        // Cleanly existing and idempotent
        skippedExisting++;
        continue;
      } else {
        // Identity points to a different Sale ID -> Conflict
        conflicts++;
        throw new Error(
          `CONFLICT: Identity for legacy venda '${legacyVendaId}' points to '${existingEntityId}' but Sale has id '${existingSaleId}'.`
        );
      }
    } else if (existingSaleId && !existingEntityId) {
      // Sale exists without identity -> Inconsistent state
      conflicts++;
      throw new Error(
        `CONFLICT: Sale '${planned.anchorSourceId}' exists in DB without matching HistoricalSourceIdentity.`
      );
    } else if (existingEntityId && !existingSaleId) {
      // Identity exists without Sale -> Inconsistent state
      conflicts++;
      throw new Error(
        `CONFLICT: HistoricalSourceIdentity for '${legacyVendaId}' exists but Sale '${planned.anchorSourceId}' is missing.`
      );
    } else {
      toProcessSales.push(planned);
    }
  }

  // If DRY-RUN mode, return simulated result without touching DB
  if (dryRun) {
    return {
      batchId,
      dryRun: true,
      preflight,
      counts: {
        salesCreated: toProcessSales.length,
        saleItemsCreated: toProcessSales.reduce((acc, s) => acc + s.items.length, 0),
        ssdCreated: toProcessSales.length,
        ssdiCreated: toProcessSales.reduce((acc, s) => acc + s.realizationDoc.items.length, 0),
        identitiesCreated: toProcessSales.length,
        skippedExisting,
        conflicts,
        failed: 0,
      },
    };
  }

  // 7. PERSISTENCE MODE: Process in Atomic Batches
  let salesCreated = 0;
  let saleItemsCreated = 0;
  let ssdCreated = 0;
  let ssdiCreated = 0;
  let identitiesCreated = 0;
  let failed = 0;

  const now = new Date();

  for (let i = 0; i < toProcessSales.length; i += chunkSize) {
    const chunk = toProcessSales.slice(i, i + chunkSize);

    try {
      await prisma.$transaction(
        async (tx) => {
          const salesData: Prisma.SaleCreateManyInput[] = [];
          const saleItemsData: Prisma.SaleItemCreateManyInput[] = [];
          const docsData: Prisma.SaleSourceDocumentCreateManyInput[] = [];
          const docItemsData: Prisma.SaleSourceDocumentItemCreateManyInput[] = [];
          const identitiesData: Prisma.HistoricalSourceIdentityCreateManyInput[] = [];

          for (const s of chunk) {
            const saleId = crypto.randomUUID();
            const docId = crypto.randomUUID();

            salesData.push({
              id: saleId,
              connectionId: plan.connectionId,
              anchorType: s.anchorType,
              anchorSourceId: s.anchorSourceId,
              netAmount: s.netAmount,
              customerId: s.canonicalCustomerId,
              sourceCreatedAt: s.sourceCreatedAt,
              sourceConfirmedAt: s.sourceConfirmedAt,
              sourceEmissaoAt: s.sourceEmissaoAt,
              commercialDate: s.commercialDate,
              sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
              operationUnit: OperationUnit.HUSTLER,
              salesChannel: SalesChannel.VAREJO,
              importBatchId: batchId,
            });

            for (const it of s.items) {
              const srcProd =
                productSourceIdMap.get(it.canonicalProductId) ||
                `HUSTLER_LEGACY:${it.legacyProductId}`;

              saleItemsData.push({
                id: crypto.randomUUID(),
                saleId,
                sourceItemId: it.sourceItemId,
                lineNumber: it.lineNumber,
                productId: it.canonicalProductId,
                sourceProductId: srcProd,
                quantity: it.quantity,
                unitPrice: it.unitPrice,
                discountAmount: it.discountAmount,
                subtotal: it.subtotal,
              });
            }

            docsData.push({
              id: docId,
              saleId,
              connectionId: plan.connectionId,
              docType: s.realizationDoc.docType,
              sourceId: s.realizationDoc.sourceId,
              netAmount: s.realizationDoc.netAmount,
              status:
                s.realizationDoc.docType === SaleAnchorType.NFE
                  ? "AUTORIZADA"
                  : "REALIZADA",
              sourceCreatedAt: s.realizationDoc.sourceCreatedAt,
              sourceConfirmedAt: s.commercialDate,
              sourceEmissaoAt: s.realizationDoc.sourceEmissaoAt,
              realizedDate: s.realizationDoc.realizedDate,
              sourcePresent: true,
              lastSeenAt: now,
              sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
              operationUnit: OperationUnit.HUSTLER,
              importBatchId: batchId,
            });

            for (const it of s.realizationDoc.items) {
              const srcProd =
                productSourceIdMap.get(it.canonicalProductId) ||
                `HUSTLER_LEGACY:${it.legacyProductId}`;

              docItemsData.push({
                id: crypto.randomUUID(),
                saleSourceDocumentId: docId,
                sourceItemId: it.sourceItemId,
                lineNumber: it.lineNumber,
                productId: it.canonicalProductId,
                sourceProductId: srcProd,
                quantity: it.quantity,
                unitPrice: it.unitPrice,
                discountAmount: it.discountAmount,
                subtotal: it.subtotal,
              });
            }

            identitiesData.push({
              id: crypto.randomUUID(),
              companyId: plan.companyId,
              importBatchId: batchId,
              sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
              sourceEntity: "venda",
              sourcePrimaryKey: s.legacyVendaId,
              canonicalEntityType: "Sale",
              canonicalEntityId: saleId,
            });
          }

          // Execute bulk inserts atomically
          await tx.sale.createMany({ data: salesData });
          await tx.saleItem.createMany({ data: saleItemsData });
          await tx.saleSourceDocument.createMany({ data: docsData });
          await tx.saleSourceDocumentItem.createMany({ data: docItemsData });
          await tx.historicalSourceIdentity.createMany({ data: identitiesData });
        },
        { timeout: 30000, maxWait: 10000 }
      );

      salesCreated += chunk.length;
      saleItemsCreated += chunk.reduce((acc, s) => acc + s.items.length, 0);
      ssdCreated += chunk.length;
      ssdiCreated += chunk.reduce((acc, s) => acc + s.realizationDoc.items.length, 0);
      identitiesCreated += chunk.length;
    } catch (err) {
      failed += chunk.length;
      console.error(`Error persisting chunk starting at index ${i}:`, err);
      throw err;
    }
  }

  // 8. Post-Persistence Exhaustive Validation Queries
  const [
    productsCount,
    customersCount,
    salesCount,
    saleItemsCount,
    saleSourceDocsCount,
    saleSourceDocItemsCount,
    financialRecordsCount,
    historicalIdentitiesCount,
  ] = await Promise.all([
    prisma.product.count(),
    prisma.customer.count(),
    prisma.sale.count(),
    prisma.saleItem.count(),
    prisma.saleSourceDocument.count(),
    prisma.saleSourceDocumentItem.count(),
    prisma.financialRecord.count(),
    prisma.historicalSourceIdentity.count(),
  ]);

  // Historical Fact Counts
  const [
    historicalSales,
    historicalSaleItems,
    historicalSsd,
    historicalSsdi,
    historicalIdentities,
  ] = await Promise.all([
    prisma.sale.count({
      where: {
        sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
        importBatchId: batchId,
      },
    }),
    prisma.saleItem.count({
      where: {
        sale: {
          sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
          importBatchId: batchId,
        },
      },
    }),
    prisma.saleSourceDocument.count({
      where: {
        sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
        importBatchId: batchId,
      },
    }),
    prisma.saleSourceDocumentItem.count({
      where: {
        saleSourceDocument: {
          sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
          importBatchId: batchId,
        },
      },
    }),
    prisma.historicalSourceIdentity.count({
      where: {
        sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
        importBatchId: batchId,
        sourceEntity: "venda",
      },
    }),
  ]);

  // Realization Counts
  const [nfeSsd, vsSsd, nfeSsdi, vsSsdi] = await Promise.all([
    prisma.saleSourceDocument.count({
      where: {
        sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
        importBatchId: batchId,
        docType: SaleAnchorType.NFE,
      },
    }),
    prisma.saleSourceDocument.count({
      where: {
        sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
        importBatchId: batchId,
        docType: SaleAnchorType.VENDA_SIMPLES,
      },
    }),
    prisma.saleSourceDocumentItem.count({
      where: {
        saleSourceDocument: {
          sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
          importBatchId: batchId,
          docType: SaleAnchorType.NFE,
        },
      },
    }),
    prisma.saleSourceDocumentItem.count({
      where: {
        saleSourceDocument: {
          sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
          importBatchId: batchId,
          docType: SaleAnchorType.VENDA_SIMPLES,
        },
      },
    }),
  ]);

  // Customer Distribution
  const [canonicalCustomerSales, genericNullSales, blankNullSales] =
    await Promise.all([
      prisma.sale.count({
        where: {
          sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
          importBatchId: batchId,
          customerId: { not: null },
        },
      }),
      // Generic & blank have customerId null
      prisma.sale.count({
        where: {
          sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
          importBatchId: batchId,
          customerId: null,
          anchorSourceId: {
            in: plan.plannedSales
              .filter((ps) => ps.customerType === "GENERIC_CONSUMIDOR")
              .map((ps) => ps.anchorSourceId),
          },
        },
      }),
      prisma.sale.count({
        where: {
          sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
          importBatchId: batchId,
          customerId: null,
          anchorSourceId: {
            in: plan.plannedSales
              .filter((ps) => ps.customerType === "BLANK")
              .map((ps) => ps.anchorSourceId),
          },
        },
      }),
    ]);

  // Realized Revenue Sum (using SaleSourceDocument.netAmount)
  const revenueAgg = await prisma.saleSourceDocument.aggregate({
    where: {
      sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
      importBatchId: batchId,
    },
    _sum: { netAmount: true },
  });

  const realizedHistoricalRevenue = revenueAgg._sum.netAmount
    ? Math.round(Number(revenueAgg._sum.netAmount) * 100) / 100
    : 0;

  // Monthly Transition Aggregations
  const transitionDocs = await prisma.saleSourceDocument.findMany({
    where: {
      sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
      importBatchId: batchId,
      realizedDate: {
        gte: new Date("2026-04-01T00:00:00.000Z"),
        lt: new Date("2026-07-01T00:00:00.000Z"),
      },
    },
    select: { realizedDate: true, netAmount: true },
  });

  let apr2026Count = 0;
  let apr2026Revenue = 0;
  let may2026Count = 0;
  let may2026Revenue = 0;
  let jun2026Count = 0;
  let jun2026Revenue = 0;

  for (const doc of transitionDocs) {
    if (!doc.realizedDate) continue;
    const iso = doc.realizedDate.toISOString();
    const val = doc.netAmount ? Number(doc.netAmount) : 0;
    if (iso.startsWith("2026-04")) {
      apr2026Count++;
      apr2026Revenue += val;
    } else if (iso.startsWith("2026-05")) {
      may2026Count++;
      may2026Revenue += val;
    } else if (iso.startsWith("2026-06")) {
      jun2026Count++;
      jun2026Revenue += val;
    }
  }

  // Earliest and Latest Dates
  const dateAgg = await prisma.sale.aggregate({
    where: {
      sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
      importBatchId: batchId,
    },
    _min: { commercialDate: true },
    _max: { commercialDate: true },
  });

  // Quarantine & Cancelled Checks
  const quarantinedVendaIds = plan.quarantinedSales.map((q) => `HUSTLER_LEGACY:${q.legacyVendaId}`);
  const cancelledVendaIds = plan.cancelledSales.map((c) => `HUSTLER_LEGACY:${c.legacyVendaId}`);

  const [quarantinedSalesImported, cancelledSalesImported] = await Promise.all([
    prisma.sale.count({
      where: {
        sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
        anchorSourceId: { in: quarantinedVendaIds },
      },
    }),
    prisma.sale.count({
      where: {
        sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
        anchorSourceId: { in: cancelledVendaIds },
      },
    }),
  ]);

  // Entity Integrity Checks
  const [
    salesWithoutIdentity,
    salesWithoutSsd,
    salesWithMultipleSsdRaw,
    saleItemsUnresolved,
    ssdiUnresolved,
  ] = await Promise.all([
    prisma.sale.count({
      where: {
        sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
        importBatchId: batchId,
        id: {
          notIn: (
            await prisma.historicalSourceIdentity.findMany({
              where: {
                sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
                importBatchId: batchId,
                canonicalEntityType: "Sale",
              },
              select: { canonicalEntityId: true },
            })
          ).map((idRow) => idRow.canonicalEntityId),
        },
      },
    }),
    prisma.sale.count({
      where: {
        sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
        importBatchId: batchId,
        sourceDocs: { none: {} },
      },
    }),
    prisma.saleSourceDocument.groupBy({
      by: ["saleId"],
      where: {
        sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
        importBatchId: batchId,
      },
      _count: { id: true },
      having: {
        id: { _count: { gt: 1 } },
      },
    }),
    prisma.saleItem.count({
      where: {
        sale: {
          sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
          importBatchId: batchId,
        },
        productId: null,
      },
    }),
    prisma.saleSourceDocumentItem.count({
      where: {
        saleSourceDocument: {
          sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
          importBatchId: batchId,
        },
        productId: null,
      },
    }),
  ]);

  return {
    batchId,
    dryRun: false,
    preflight,
    counts: {
      salesCreated,
      saleItemsCreated,
      ssdCreated,
      ssdiCreated,
      identitiesCreated,
      skippedExisting,
      conflicts,
      failed,
    },
    postValidation: {
      canonicalCounts: {
        products: productsCount,
        customers: customersCount,
        sales: salesCount,
        saleItems: saleItemsCount,
        saleSourceDocs: saleSourceDocsCount,
        saleSourceDocItems: saleSourceDocItemsCount,
        financialRecords: financialRecordsCount,
        historicalIdentities: historicalIdentitiesCount,
      },
      historicalFactCounts: {
        historicalSales,
        historicalSaleItems,
        historicalSsd,
        historicalSsdi,
        historicalIdentities,
      },
      realizationCounts: {
        nfeSsd,
        vsSsd,
        nfeSsdi,
        vsSsdi,
        multipleRealization: salesWithMultipleSsdRaw.length,
      },
      customerCounts: {
        canonicalCustomerSales,
        genericNullSales,
        blankNullSales,
        unresolved: 0,
      },
      quarantineCounts: {
        quarantinedSalesImported,
        cancelledSalesImported,
      },
      revenue: {
        realizedHistoricalRevenue,
        expectedRevenue: 1141693.14,
        revenueReconciles: realizedHistoricalRevenue === 1141693.14,
      },
      transition: {
        apr2026Count,
        apr2026Revenue: Math.round(apr2026Revenue * 100) / 100,
        may2026Count,
        may2026Revenue: Math.round(may2026Revenue * 100) / 100,
        jun2026Count,
        jun2026Revenue: Math.round(jun2026Revenue * 100) / 100,
        earliestSaleDate: dateAgg._min.commercialDate
          ? dateAgg._min.commercialDate.toISOString()
          : null,
        latestSaleDate: dateAgg._max.commercialDate
          ? dateAgg._max.commercialDate.toISOString()
          : null,
      },
      entityIntegrity: {
        historicalSaleWithoutIdentity: salesWithoutIdentity,
        historicalSaleWithoutSsd: salesWithoutSsd,
        historicalSaleWithMultipleSsd: salesWithMultipleSsdRaw.length,
        saleItemsUnresolved,
        ssdiUnresolved,
      },
      batchStatus: batch.status,
    },
  };
}
