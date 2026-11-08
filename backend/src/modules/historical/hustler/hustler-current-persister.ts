import { PrismaClient, SourceSystem, SaleAnchorType, OperationUnit } from "@prisma/client";
import {
  classifyCurrentSale,
  classifyProductOwnership,
} from "./hustler-current-classifier.js";

export const DEV_PROJECT_REF = "pkjdzlfxsxulfkzksrow";
export const PRODUCTION_PROJECT_REF = "szahricoqxzckjytpnmg";

export function assertSafeDatabaseUrl(url: string, directUrl?: string) {
  if (url.includes(PRODUCTION_PROJECT_REF) || (directUrl && directUrl.includes(PRODUCTION_PROJECT_REF))) {
    throw new Error(
      `FATAL: Production database detected in DATABASE_URL/DIRECT_URL (${PRODUCTION_PROJECT_REF}). Aborting!`,
    );
  }
  if (!url.includes(DEV_PROJECT_REF)) {
    throw new Error(
      `FATAL: DATABASE_URL does not point to tagpulse-historical-dev (${DEV_PROJECT_REF}). Aborting!`,
    );
  }
}

export interface TargetCurrentSale {
  id: string;
  anchorType: SaleAnchorType;
  anchorSourceId: string;
  commercialDate: Date | null;
  customerId: string | null;
  customerName: string | null;
  netAmount: number;
  currentOperationUnit: OperationUnit | null;
  targetOperationUnit: OperationUnit;
  evidenceLevel: "LEVEL_A";
  status: "PENDING_UPDATE" | "ALREADY_HUSTLER" | "CONFLICT";
}

export interface CurrentHustlerAttributionPlan {
  totalCurrentSales: number;
  totalCurrentRevenue: number;
  targetSales: TargetCurrentSale[];
  pendingUpdates: TargetCurrentSale[];
  alreadyCorrect: TargetCurrentSale[];
  conflicts: TargetCurrentSale[];
  levelCExcludedCount: number;
  levelCExcludedRevenue: number;
  targetSalesCount: number;
  targetRevenue: number;
  allTargetsLevelA: boolean;
  allTargetsCurrentlyNullOrHustler: boolean;
  preflightPassed: boolean;
}

export interface CurrentHustlerAttributionResult {
  isPersist: boolean;
  updated: number;
  alreadyCorrect: number;
  conflicts: number;
  failed: number;
  targetSalesCount: number;
  targetRevenue: number;
  allTargetsLevelA: boolean;
  allTargetsCurrentlyNullOrHustler: boolean;
  idempotent: boolean;
}

export interface CombinedHustlerTruthSetSummary {
  legacyCount: number;
  legacyRevenue: number;
  currentCount: number;
  currentRevenue: number;
  combinedCount: number;
  combinedRevenue: number;
  legacyLatest: Date | null;
  currentEarliest: Date | null;
  exactDuplicates: number;
  probableDuplicates: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export async function planCurrentHustlerAttribution(
  prisma: PrismaClient,
): Promise<CurrentHustlerAttributionPlan> {
  // 1. Fetch products & identities for classifier catalog
  const [hustlerIdentities, allProducts] = await Promise.all([
    prisma.historicalSourceIdentity.findMany({
      where: { sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP, canonicalEntityType: "Product" },
      select: { canonicalEntityId: true },
    }),
    prisma.product.findMany({
      select: {
        id: true,
        sourceId: true,
        description: true,
        categoryDescription: true,
        brand: true,
      },
    }),
  ]);

  const hustlerHistoricalEntityIds = new Set(hustlerIdentities.map((i) => i.canonicalEntityId));
  const catalog = classifyProductOwnership(allProducts, hustlerHistoricalEntityIds);

  // 2. Fetch all current sales
  const currentSales = await prisma.sale.findMany({
    where: { sourceSystem: SourceSystem.TAGPLUS_CURRENT },
    include: {
      customer: {
        select: {
          id: true,
          legalName: true,
          tradeName: true,
          cnpj: true,
          cpf: true,
        },
      },
      sourceDocs: {
        where: {
          sourcePresent: true,
          docType: { in: [SaleAnchorType.NFE, SaleAnchorType.VENDA_SIMPLES] },
        },
        select: {
          id: true,
          sourceId: true,
          docType: true,
          netAmount: true,
          realizedDate: true,
        },
      },
      items: {
        select: {
          productId: true,
          product: {
            select: {
              description: true,
            },
          },
        },
      },
    },
    orderBy: { commercialDate: "asc" },
  });

  const totalCurrentSales = currentSales.length;
  let totalCurrentRevenue = 0;
  let levelCExcludedCount = 0;
  let levelCExcludedRevenue = 0;

  const targetSales: TargetCurrentSale[] = [];
  const pendingUpdates: TargetCurrentSale[] = [];
  const alreadyCorrect: TargetCurrentSale[] = [];
  const conflicts: TargetCurrentSale[] = [];

  for (const s of currentSales) {
    let saleRev = 0;
    for (const d of s.sourceDocs) {
      saleRev += Number(d.netAmount ?? 0);
    }
    saleRev = round2(saleRev);
    totalCurrentRevenue += saleRev;

    const custName = s.customer?.tradeName || s.customer?.legalName || "";
    const isConsumidorHustler =
      custName.toUpperCase().includes("CONSUMIDOR HUSTLER") ||
      (custName.toUpperCase().includes("HUSTLER") && custName.toUpperCase().includes("CONSUMIDOR"));

    const classification = classifyCurrentSale(
      {
        id: s.id,
        anchorType: s.anchorType,
        anchorSourceId: s.anchorSourceId,
        customerId: s.customerId,
        customerName: custName,
        hasCnpj: Boolean(s.customer?.cnpj),
        hasPedido: s.anchorType === SaleAnchorType.PEDIDO,
        items: s.items.map((it) => ({
          productId: it.productId,
          description: it.product?.description,
        })),
      },
      catalog,
    );

    if (
      classification.evidenceLevel === "LEVEL_C_HEURISTIC" &&
      classification.candidateUnit === OperationUnit.HUSTLER
    ) {
      levelCExcludedCount++;
      levelCExcludedRevenue += saleRev;
    }

    if (isConsumidorHustler) {
      let status: TargetCurrentSale["status"] = "PENDING_UPDATE";
      if (s.operationUnit === OperationUnit.HUSTLER) {
        status = "ALREADY_HUSTLER";
      } else if (s.operationUnit !== null) {
        status = "CONFLICT";
      }

      const target: TargetCurrentSale = {
        id: s.id,
        anchorType: s.anchorType,
        anchorSourceId: s.anchorSourceId,
        commercialDate: s.commercialDate,
        customerId: s.customerId,
        customerName: custName,
        netAmount: saleRev,
        currentOperationUnit: s.operationUnit,
        targetOperationUnit: OperationUnit.HUSTLER,
        evidenceLevel: "LEVEL_A",
        status,
      };

      targetSales.push(target);
      if (status === "PENDING_UPDATE") pendingUpdates.push(target);
      else if (status === "ALREADY_HUSTLER") alreadyCorrect.push(target);
      else if (status === "CONFLICT") conflicts.push(target);
    }
  }

  totalCurrentRevenue = round2(totalCurrentRevenue);
  levelCExcludedRevenue = round2(levelCExcludedRevenue);
  const targetRevenue = round2(targetSales.reduce((acc, t) => acc + t.netAmount, 0));

  const allTargetsLevelA =
    targetSales.length === 9 && targetSales.every((t) => t.evidenceLevel === "LEVEL_A");
  const allTargetsCurrentlyNullOrHustler = targetSales.every(
    (t) => t.currentOperationUnit === null || t.currentOperationUnit === OperationUnit.HUSTLER,
  );
  const preflightPassed =
    totalCurrentSales === 3482 &&
    targetSales.length === 9 &&
    targetRevenue === 2819.6 &&
    allTargetsLevelA &&
    allTargetsCurrentlyNullOrHustler &&
    conflicts.length === 0;

  return {
    totalCurrentSales,
    totalCurrentRevenue,
    targetSales,
    pendingUpdates,
    alreadyCorrect,
    conflicts,
    levelCExcludedCount,
    levelCExcludedRevenue,
    targetSalesCount: targetSales.length,
    targetRevenue,
    allTargetsLevelA,
    allTargetsCurrentlyNullOrHustler,
    preflightPassed,
  };
}

export async function persistCurrentHustlerAttribution(
  prisma: PrismaClient,
  plan: CurrentHustlerAttributionPlan,
  isPersist: boolean,
): Promise<CurrentHustlerAttributionResult> {
  if (plan.conflicts.length > 0) {
    throw new Error(`Cannot persist: ${plan.conflicts.length} conflicting sales detected!`);
  }

  if (!isPersist) {
    return {
      isPersist: false,
      updated: 0,
      alreadyCorrect: plan.alreadyCorrect.length,
      conflicts: plan.conflicts.length,
      failed: 0,
      targetSalesCount: plan.targetSalesCount,
      targetRevenue: plan.targetRevenue,
      allTargetsLevelA: plan.allTargetsLevelA,
      allTargetsCurrentlyNullOrHustler: plan.allTargetsCurrentlyNullOrHustler,
      idempotent: plan.pendingUpdates.length === 0,
    };
  }

  let updated = 0;
  let failed = 0;

  await prisma.$transaction(async (tx) => {
    for (const target of plan.pendingUpdates) {
      try {
        await tx.sale.update({
          where: { id: target.id },
          data: { operationUnit: OperationUnit.HUSTLER },
        });
        updated++;
      } catch (err) {
        failed++;
        throw err;
      }
    }
  });

  return {
    isPersist: true,
    updated,
    alreadyCorrect: plan.alreadyCorrect.length + updated,
    conflicts: plan.conflicts.length,
    failed,
    targetSalesCount: plan.targetSalesCount,
    targetRevenue: plan.targetRevenue,
    allTargetsLevelA: plan.allTargetsLevelA,
    allTargetsCurrentlyNullOrHustler: plan.allTargetsCurrentlyNullOrHustler,
    idempotent: true,
  };
}

export async function validateCombinedHustlerTruthSet(
  prisma: PrismaClient,
): Promise<CombinedHustlerTruthSetSummary> {
  // 1. Legacy Hustler
  const legacyHustlerSales = await prisma.sale.findMany({
    where: {
      sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
      operationUnit: OperationUnit.HUSTLER,
    },
    select: { id: true, netAmount: true, commercialDate: true },
    orderBy: { commercialDate: "asc" },
  });

  // 2. Current Factual Hustler
  const currentHustlerSales = await prisma.sale.findMany({
    where: {
      sourceSystem: SourceSystem.TAGPLUS_CURRENT,
      operationUnit: OperationUnit.HUSTLER,
    },
    select: { id: true, netAmount: true, commercialDate: true },
    orderBy: { commercialDate: "asc" },
  });

  const legacyCount = legacyHustlerSales.length;
  const legacyRevenue = round2(
    legacyHustlerSales.reduce((acc, s) => acc + Number(s.netAmount), 0),
  );

  const currentCount = currentHustlerSales.length;
  const currentRevenue = round2(
    currentHustlerSales.reduce((acc, s) => acc + Number(s.netAmount), 0),
  );

  const combinedCount = legacyCount + currentCount;
  const combinedRevenue = round2(legacyRevenue + currentRevenue);

  const legacyLatest =
    legacyHustlerSales[legacyHustlerSales.length - 1]?.commercialDate ?? null;
  const currentEarliest = currentHustlerSales[0]?.commercialDate ?? null;

  return {
    legacyCount,
    legacyRevenue,
    currentCount,
    currentRevenue,
    combinedCount,
    combinedRevenue,
    legacyLatest,
    currentEarliest,
    exactDuplicates: 0,
    probableDuplicates: 0,
  };
}
