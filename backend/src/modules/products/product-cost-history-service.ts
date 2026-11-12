import { PrismaClient, ProductCostSource } from "@prisma/client";

export interface CreateProductCostInput {
  productId?: string | null;
  sourceProductId: string;
  unitCost: number;
  validFrom: string | Date;
  validTo?: string | Date | null;
  note?: string | null;
  createdBy?: string | null;
  costSource?: ProductCostSource;
}

export interface MissingCostItemDto {
  saleId: string;
  saleItemId: string;
  saleDate: string;
  documentNumber: string;
  productName: string;
  sourceProductId: string;
  productCode: string | null;
  quantity: number;
  soldValue: number;
  currentCost: number | null;
  reason: string;
  status: "PENDENTE" | "RESOLVIDO";
}

export interface CostQualitySummaryDto {
  coveragePercent: number;
  coveredRevenue: number;
  uncoveredRevenue: number;
  totalRevenue: number;
  missingProductCount: number;
  missingSaleItemCount: number;
  qualityStatus: "FINAL" | "HIGH_CONFIDENCE_ESTIMATE" | "PROVISIONAL_ESTIMATE" | "INSUFFICIENT_COST_COVERAGE";
}

const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export async function resolveProductCostAtDate(
  prisma: PrismaClient,
  params: {
    productId?: string | null;
    sourceProductId?: string | null;
    saleDate: Date;
  },
): Promise<{ unitCost: number | null; costSource: ProductCostSource | null }> {
  const { productId, sourceProductId, saleDate } = params;

  // 1. Busca no histórico temporal ordenado por prioridade de fonte e proximidade
  if (productId || sourceProductId) {
    const history = await prisma.productCostHistory.findMany({
      where: {
        OR: [
          ...(productId ? [{ productId }] : []),
          ...(sourceProductId ? [{ sourceProductId }] : []),
        ],
        validFrom: { lte: saleDate },
        AND: [
          {
            OR: [
              { validTo: null },
              { validTo: { gt: saleDate } },
            ],
          },
        ],
      },
      orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }],
    });

    if (history.length > 0) {
      // Prioridade 1: PURCHASE / STOCK_ADJUSTMENT
      const explicit = history.find(
        (h) => h.costSource === "PURCHASE" || h.costSource === "STOCK_ADJUSTMENT",
      );
      if (explicit) return { unitCost: Number(explicit.unitCost), costSource: explicit.costSource };

      // Prioridade 2: MANUAL
      const manual = history.find((h) => h.costSource === "MANUAL");
      if (manual) return { unitCost: Number(manual.unitCost), costSource: manual.costSource };

      // Prioridade 4: ERP_SNAPSHOT
      const erp = history.find((h) => h.costSource === "ERP_SNAPSHOT");
      if (erp) return { unitCost: Number(erp.unitCost), costSource: erp.costSource };

      // Outro histórico
      const first = history[0];
      if (first) {
        return { unitCost: Number(first.unitCost), costSource: first.costSource };
      }
    }
  }

  // Prioridade 4 & 5: Custo Médio válido (> 0) seguido por Valor de Custo / effectiveCost (> 0)
  if (productId || sourceProductId) {
    const product = await prisma.product.findFirst({
      where: {
        OR: [
          ...(productId ? [{ id: productId }] : []),
          ...(sourceProductId ? [{ sourceId: sourceProductId }] : []),
        ],
      },
      select: { effectiveCost: true, averageCost: true },
    });

    if (product) {
      const avgCost = product.averageCost ? Number(product.averageCost) : null;
      const effCost = product.effectiveCost ? Number(product.effectiveCost) : null;
      const cost =
        avgCost !== null && avgCost > 0
          ? avgCost
          : effCost !== null && effCost > 0
          ? effCost
          : null;
      if (cost !== null && cost > 0) {
        return { unitCost: cost, costSource: "CURRENT_COST_PROXY" as ProductCostSource };
      }
    }
  }

  // 6. Unknown
  return { unitCost: null, costSource: null };
}

export async function createProductCost(
  prisma: PrismaClient,
  input: CreateProductCostInput,
) {
  if (typeof input.unitCost !== "number" || isNaN(input.unitCost) || input.unitCost <= 0) {
    throw new Error("O custo unitário deve ser um número maior que zero.");
  }

  const validFrom = typeof input.validFrom === "string" ? new Date(input.validFrom) : input.validFrom;
  if (isNaN(validFrom.getTime())) {
    throw new Error("Data de início de vigência inválida.");
  }

  const validTo = input.validTo ? (typeof input.validTo === "string" ? new Date(input.validTo) : input.validTo) : null;
  if (validTo && isNaN(validTo.getTime())) {
    throw new Error("Data de término de vigência inválida.");
  }

  let resolvedProductId = input.productId ?? null;
  if (!resolvedProductId && input.sourceProductId) {
    const p = await prisma.product.findFirst({
      where: { sourceId: input.sourceProductId },
      select: { id: true },
    });
    if (p) resolvedProductId = p.id;
  }

  // Fechar registros anteriores abertos do mesmo produto quando houver sobreposição
  if (input.sourceProductId || resolvedProductId) {
    await prisma.productCostHistory.updateMany({
      where: {
        OR: [
          ...(resolvedProductId ? [{ productId: resolvedProductId }] : []),
          ...(input.sourceProductId ? [{ sourceProductId: input.sourceProductId }] : []),
        ],
        validTo: null,
        validFrom: { lte: validFrom },
      },
      data: {
        validTo: validFrom,
      },
    });
  }

  const created = await prisma.productCostHistory.create({
    data: {
      productId: resolvedProductId,
      sourceProductId: input.sourceProductId,
      unitCost: input.unitCost,
      costSource: input.costSource ?? "MANUAL",
      validFrom,
      validTo,
      note: input.note ?? null,
      createdBy: input.createdBy ?? null,
    },
  });

  if (resolvedProductId && (!validTo || validTo.getTime() >= Date.now())) {
    try {
      await prisma.product.update({
        where: { id: resolvedProductId },
        data: {
          effectiveCost: input.unitCost,
          updatedAt: new Date(),
        },
      });
    } catch {
      // Non-fatal if product not found
    }
  }

  return created;
}

export async function getProductCostHistory(
  prisma: PrismaClient,
  identifier: string,
) {
  return prisma.productCostHistory.findMany({
    where: {
      OR: [
        { productId: identifier },
        { sourceProductId: identifier },
      ],
    },
    orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }],
    include: {
      product: {
        select: {
          id: true,
          code: true,
          description: true,
          sourceId: true,
        },
      },
    },
  });
}

export async function getMissingCosts(
  prisma: PrismaClient,
  params: {
    from?: string;
    to?: string;
    operationUnit?: string;
    page?: number;
    pageSize?: number;
  },
): Promise<{ items: MissingCostItemDto[]; total: number; page: number; pageSize: number }> {
  const fromDate = params.from ? new Date(`${params.from}T00:00:00.000Z`) : new Date("2026-01-01T00:00:00.000Z");
  const toDate = params.to ? new Date(`${params.to}T23:59:59.999Z`) : new Date();
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.max(1, Math.min(100, params.pageSize || 20));

  // Consulta itens de vendas no período onde o produto não tem custo cadastrado
  const saleItems = await prisma.saleItem.findMany({
    where: {
      sale: {
        commercialDate: { gte: fromDate, lte: toDate },
        ...(params.operationUnit ? { operationUnit: params.operationUnit as any } : {}),
      },
    },
    include: {
      sale: {
        select: {
          id: true,
          commercialDate: true,
          anchorType: true,
          anchorSourceId: true,
          sourceDocs: {
            select: {
              sourceId: true,
              docType: true,
            },
          },
        },
      },
      product: {
        select: {
          id: true,
          code: true,
          description: true,
          effectiveCost: true,
          averageCost: true,
        },
      },
    },
    orderBy: {
      sale: {
        commercialDate: "desc",
      },
    },
  });

  // Preload all cost history records into memory to resolve without N+1 queries
  const historyRecords = await prisma.productCostHistory.findMany({
    orderBy: { validFrom: "desc" },
  });

  const missingList: MissingCostItemDto[] = [];

  for (const item of saleItems) {
    const saleDate = item.sale.commercialDate || new Date();
    const avgCost = item.product?.averageCost ? Number(item.product.averageCost) : null;
    const effCost = item.product?.effectiveCost ? Number(item.product.effectiveCost) : null;
    const currentCost =
      avgCost !== null && avgCost > 0
        ? avgCost
        : effCost !== null && effCost > 0
        ? effCost
        : null;

    // Resolve temporal cost in-memory with strict source priority
    let resolvedUnitCost: number | null = null;
    let resolvedCostSource: string = "NONE";

    const matchingHistory = historyRecords.filter(
      (h) =>
        ((item.productId && h.productId === item.productId) ||
          (item.sourceProductId && h.sourceProductId === item.sourceProductId)) &&
        (!h.validFrom || h.validFrom <= saleDate) &&
        (!h.validTo || h.validTo > saleDate),
    );

    if (matchingHistory.length > 0) {
      const explicit = matchingHistory.find(
        (h) => h.costSource === "PURCHASE" || h.costSource === "STOCK_ADJUSTMENT",
      );
      const manual = matchingHistory.find((h) => h.costSource === "MANUAL");
      const erp = matchingHistory.find((h) => h.costSource === "ERP_SNAPSHOT");
      const best = explicit || manual || erp || matchingHistory[0];
      if (best) {
        resolvedUnitCost = Number(best.unitCost);
        resolvedCostSource = best.costSource;
      }
    }

    if (resolvedUnitCost === null && currentCost !== null && currentCost > 0) {
      resolvedUnitCost = currentCost;
      resolvedCostSource = "CATALOG_EFFECTIVE_OR_AVERAGE";
    }

    if (resolvedUnitCost === null || resolvedUnitCost <= 0) {
      let reason = "PRODUTO_SEM_CUSTO_CADASTRADO";
      if (!item.product) {
        reason = "PRODUTO_NAO_ENCONTRADO_NO_CATALOGO";
      }

      const docNumber =
        item.sale.sourceDocs[0]?.sourceId ||
        `${item.sale.anchorType} #${item.sale.anchorSourceId}`;

      missingList.push({
        saleId: item.saleId,
        saleItemId: item.id,
        saleDate: saleDate.toISOString().slice(0, 10),
        documentNumber: docNumber,
        productName: item.product?.description || `Produto ${item.sourceProductId}`,
        sourceProductId: item.sourceProductId,
        productCode: item.product?.code || null,
        quantity: Number(item.quantity),
        soldValue: Number(item.subtotal),
        currentCost,
        reason,
        status: "PENDENTE",
      });
    }
  }

  const total = missingList.length;
  const start = (page - 1) * pageSize;
  const paginated = missingList.slice(start, start + pageSize);

  return {
    items: paginated,
    total,
    page,
    pageSize,
  };
}

export async function getCostQualitySummary(
  prisma: PrismaClient,
  params: {
    from?: string;
    to?: string;
    operationUnit?: string;
  },
): Promise<CostQualitySummaryDto> {
  const missing = await getMissingCosts(prisma, { ...params, pageSize: 10000 });
  const missingProductIds = new Set(missing.items.map((i) => i.sourceProductId));
  const missingSaleItemCount = missing.total;
  const uncoveredRevenue = r2(missing.items.reduce((acc, i) => acc + i.soldValue, 0));

  return {
    coveragePercent: 0, // Será integrado no DRE
    coveredRevenue: 0,
    uncoveredRevenue,
    totalRevenue: 0,
    missingProductCount: missingProductIds.size,
    missingSaleItemCount,
    qualityStatus: "INSUFFICIENT_COST_COVERAGE",
  };
}
