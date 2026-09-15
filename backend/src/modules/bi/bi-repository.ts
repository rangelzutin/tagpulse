import type { PrismaClient } from "@prisma/client";
import { SaleAnchorType } from "@prisma/client";
import { generateRealizedProductMovements } from "./bi-product-movements.js";
import type { CatalogProductInfo } from "./bi-products-calculator.js";
import type {
  BiCustomerMetadata,
  BiCustomerSaleRawRecord,
  BiDataRangeResult,
  BiPeriodCustomerDoc,
  BiSaleRealizationRecord,
  BiSaleRecord,
  ProductReconciliationAdjustment,
  RealizedProductMovement,
} from "./bi-types.js";

export interface BiRepository {
  findRealizedSales(from: Date, toExclusive: Date): Promise<BiSaleRecord[]>;
  findDataRange?(): Promise<BiDataRangeResult>;
  findPeriodCustomerDocuments?(
    from: Date,
    toExclusive: Date,
  ): Promise<BiPeriodCustomerDoc[]>;
  findSalesRealizationRecordsUntil?(
    toExclusive: Date,
  ): Promise<BiSaleRealizationRecord[]>;
  findCustomersMetadata?(
    customerIds?: string[],
  ): Promise<BiCustomerMetadata[]>;
  findCustomerDetail?(
    customerId: string,
  ): Promise<BiCustomerMetadata | null>;
  findCustomerSales?(
    customerId: string,
  ): Promise<BiCustomerSaleRawRecord[]>;
  findRealizedProductMovements?(
    from: Date,
    toExclusive: Date,
  ): Promise<{
    movements: RealizedProductMovement[];
    adjustments: ProductReconciliationAdjustment[];
  }>;
  findCatalogProductSummary?(): Promise<{
    activeCount: number;
    withStockCount: number;
  }>;
  findCatalogProductsMetadata?(
    productIds: string[],
    sourceProductIds: string[],
  ): Promise<Map<string, CatalogProductInfo>>;
  findCatalogInventoryProducts?(): Promise<import("./bi-inventory-calculator.js").CatalogInventoryProduct[]>;
  findHistoricalLastPhysicalSales?(
    toExclusive: Date,
  ): Promise<Map<string, Date>>;
}

export function createBiRepository(prisma: PrismaClient): BiRepository {
  return {
    async findDataRange(): Promise<BiDataRangeResult> {
      const agg = await prisma.saleSourceDocument.aggregate({
        where: {
          sourcePresent: true,
          docType: {
            in: [SaleAnchorType.NFE, SaleAnchorType.VENDA_SIMPLES],
          },
          realizedDate: {
            not: null,
          },
          netAmount: {
            not: null,
          },
        },
        _min: {
          realizedDate: true,
        },
        _max: {
          realizedDate: true,
        },
      });

      const formatDate = (d: Date | null): string | null => {
        if (!d || !(d instanceof Date) || isNaN(d.getTime())) return null;
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, "0");
        const day = String(d.getUTCDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      };

      return {
        firstRealizedDate: formatDate(agg._min.realizedDate),
        lastRealizedDate: formatDate(agg._max.realizedDate),
      };
    },

    async findRealizedSales(from: Date, toExclusive: Date): Promise<BiSaleRecord[]> {
      const records = await prisma.saleSourceDocument.findMany({
        where: {
          sourcePresent: true,
          docType: {
            in: [SaleAnchorType.NFE, SaleAnchorType.VENDA_SIMPLES],
          },
          realizedDate: {
            gte: from,
            lt: toExclusive,
          },
          netAmount: {
            not: null,
          },
        },
        select: {
          id: true,
          netAmount: true,
          realizedDate: true,
          sale: {
            select: {
              customerId: true,
            },
          },
        },
        orderBy: {
          realizedDate: "asc",
        },
      });

      const validRecords: BiSaleRecord[] = [];
      for (const record of records) {
        if (record.realizedDate instanceof Date && record.netAmount !== null) {
          validRecords.push({
            id: record.id,
            netAmount: record.netAmount,
            customerId: record.sale.customerId,
            commercialDate: record.realizedDate,
          });
        }
      }

      return validRecords;
    },

    async findPeriodCustomerDocuments(
      from: Date,
      toExclusive: Date,
    ): Promise<BiPeriodCustomerDoc[]> {
      const records = await prisma.saleSourceDocument.findMany({
        where: {
          sourcePresent: true,
          docType: {
            in: [SaleAnchorType.NFE, SaleAnchorType.VENDA_SIMPLES],
          },
          realizedDate: {
            gte: from,
            lt: toExclusive,
          },
          netAmount: {
            not: null,
          },
          sale: {
            customerId: {
              not: null,
            },
          },
        },
        select: {
          id: true,
          saleId: true,
          netAmount: true,
          realizedDate: true,
          sale: {
            select: {
              customerId: true,
              customer: {
                select: {
                  id: true,
                  sourceId: true,
                  code: true,
                  legalName: true,
                  tradeName: true,
                },
              },
            },
          },
        },
        orderBy: {
          realizedDate: "asc",
        },
      });

      const validRecords: BiPeriodCustomerDoc[] = [];
      for (const record of records) {
        if (
          record.realizedDate instanceof Date &&
          record.netAmount !== null &&
          record.sale.customerId !== null
        ) {
          validRecords.push({
            id: record.id,
            saleId: record.saleId,
            customerId: record.sale.customerId,
            netAmount: record.netAmount,
            realizedDate: record.realizedDate,
            customer: record.sale.customer ?? {
              id: record.sale.customerId,
              sourceId: record.sale.customerId,
              code: null,
              legalName: null,
              tradeName: null,
            },
          });
        }
      }

      return validRecords;
    },

    async findSalesRealizationRecordsUntil(
      toExclusive: Date,
    ): Promise<BiSaleRealizationRecord[]> {
      const records = await prisma.saleSourceDocument.findMany({
        where: {
          sourcePresent: true,
          docType: {
            in: [SaleAnchorType.NFE, SaleAnchorType.VENDA_SIMPLES],
          },
          realizedDate: {
            lt: toExclusive,
          },
          netAmount: {
            not: null,
          },
          sale: {
            customerId: {
              not: null,
            },
          },
        },
        select: {
          saleId: true,
          realizedDate: true,
          netAmount: true,
          sale: {
            select: {
              customerId: true,
            },
          },
        },
      });

      const validRecords: BiSaleRealizationRecord[] = [];
      for (const record of records) {
        if (
          record.realizedDate instanceof Date &&
          record.sale.customerId !== null
        ) {
          validRecords.push({
            saleId: record.saleId,
            customerId: record.sale.customerId,
            realizedDate: record.realizedDate,
            netAmount: record.netAmount ?? undefined,
          });
        }
      }

      return validRecords;
    },

    async findCustomersMetadata(customerIds?: string[]): Promise<BiCustomerMetadata[]> {
      const records = await prisma.customer.findMany({
        ...(customerIds && customerIds.length > 0 ? { where: { id: { in: customerIds } } } : {}),
        include: {
          addresses: {
            orderBy: [{ primary: "desc" }, { position: "asc" }],
            take: 1,
            select: {
              cityName: true,
              stateAbbreviation: true,
            },
          },
        },
      });

      return records.map((c) => ({
        id: c.id,
        sourceId: c.sourceId,
        code: c.code,
        legalName: c.legalName,
        tradeName: c.tradeName,
        cpf: c.cpf,
        cnpj: c.cnpj,
        city: c.addresses[0]?.cityName ?? null,
        state: c.addresses[0]?.stateAbbreviation ?? null,
      }));
    },

    async findCustomerDetail(customerId: string): Promise<BiCustomerMetadata | null> {
      const c = await prisma.customer.findUnique({
        where: { id: customerId },
        include: {
          addresses: {
            orderBy: [{ primary: "desc" }, { position: "asc" }],
            take: 1,
            select: {
              cityName: true,
              stateAbbreviation: true,
            },
          },
        },
      });

      if (!c) return null;

      return {
        id: c.id,
        sourceId: c.sourceId,
        code: c.code,
        legalName: c.legalName,
        tradeName: c.tradeName,
        cpf: c.cpf,
        cnpj: c.cnpj,
        city: c.addresses[0]?.cityName ?? null,
        state: c.addresses[0]?.stateAbbreviation ?? null,
      };
    },

    async findCustomerSales(customerId: string): Promise<BiCustomerSaleRawRecord[]> {
      const sales = await prisma.sale.findMany({
        where: {
          customerId,
        },
        include: {
          sourceDocs: {
            orderBy: [{ realizedDate: "desc" }, { createdAt: "desc" }],
          },
        },
        orderBy: [{ commercialDate: "desc" }, { createdAt: "desc" }],
      });

      return sales.map((s) => ({
        id: s.id,
        anchorType: s.anchorType,
        anchorSourceId: s.anchorSourceId,
        commercialDate: s.commercialDate,
        sourceDocs: s.sourceDocs.map((d) => ({
          id: d.id,
          docType: d.docType,
          sourceId: d.sourceId,
          status: d.status,
          netAmount: d.netAmount,
          realizedDate: d.realizedDate,
          sourceConfirmedAt: d.sourceConfirmedAt,
          sourceEmissaoAt: d.sourceEmissaoAt,
          sourcePresent: d.sourcePresent,
        })),
      }));
    },

    async findRealizedProductMovements(
      from: Date,
      toExclusive: Date,
    ): Promise<{
      movements: RealizedProductMovement[];
      adjustments: ProductReconciliationAdjustment[];
    }> {
      // 1. Localiza documentos realizados no período usando índice de realizedDate
      const periodDocs = await prisma.saleSourceDocument.findMany({
        where: {
          sourcePresent: true,
          docType: { in: [SaleAnchorType.NFE, SaleAnchorType.VENDA_SIMPLES] },
          realizedDate: { gte: from, lt: toExclusive },
          netAmount: { not: null },
        },
        select: {
          id: true,
          saleId: true,
        },
      });

      if (periodDocs.length === 0) {
        return { movements: [], adjustments: [] };
      }

      const saleIds = Array.from(new Set(periodDocs.map((d) => d.saleId)));

      // 2. Carrega as negociações correspondentes com seus itens e documentos realizados
      const sales = await prisma.sale.findMany({
        where: { id: { in: saleIds } },
        include: {
          customer: {
            select: {
              id: true,
              cnpj: true,
              cpf: true,
              legalName: true,
              tradeName: true,
            },
          },
          items: {
            select: {
              id: true,
              sourceItemId: true,
              productId: true,
              sourceProductId: true,
              quantity: true,
              unitPrice: true,
              subtotal: true,
            },
          },
          sourceDocs: {
            where: {
              sourcePresent: true,
              docType: {
                in: [
                  SaleAnchorType.NFE,
                  SaleAnchorType.VENDA_SIMPLES,
                  SaleAnchorType.PEDIDO,
                ],
              },
            },
            include: {
              items: {
                select: {
                  id: true,
                  sourceItemId: true,
                  productId: true,
                  sourceProductId: true,
                  quantity: true,
                  unitPrice: true,
                  subtotal: true,
                },
              },
            },
          },
        },
      });

      // 3. Aplica a agregação central canônica de movimentações de produtos
      return generateRealizedProductMovements(sales, from, toExclusive);
    },

    async findCatalogProductSummary(): Promise<{
      activeCount: number;
      withStockCount: number;
    }> {
      const [activeCount, withStockCount] = await Promise.all([
        prisma.product.count({
          where: { sourcePresent: true, active: true },
        }),
        prisma.product.count({
          where: {
            sourcePresent: true,
            active: true,
            stockQuantity: { gt: 0 },
          },
        }),
      ]);

      return { activeCount, withStockCount };
    },

    async findCatalogProductsMetadata(
      productIds: string[],
      sourceProductIds: string[],
    ): Promise<Map<string, CatalogProductInfo>> {
      const map = new Map<string, CatalogProductInfo>();

      const orConditions: Array<{ id?: { in: string[] }; sourceId?: { in: string[] } }> = [];
      if (productIds.length > 0) {
        orConditions.push({ id: { in: productIds } });
      }
      if (sourceProductIds.length > 0) {
        orConditions.push({ sourceId: { in: sourceProductIds } });
      }

      if (orConditions.length === 0) {
        return map;
      }

      const products = await prisma.product.findMany({
        where: { OR: orConditions },
        select: {
          id: true,
          sourceId: true,
          code: true,
          description: true,
          categoryDescription: true,
          stockQuantity: true,
          retailSalePrice: true,
          effectiveCost: true,
        },
      });

      for (const p of products) {
        const info: CatalogProductInfo = {
          code: p.code,
          description: p.description,
          categoryDescription: p.categoryDescription,
          stockQuantity:
            p.stockQuantity !== null ? Number(p.stockQuantity) : null,
          retailSalePrice:
            p.retailSalePrice !== null ? Number(p.retailSalePrice) : null,
          effectiveCost:
            p.effectiveCost !== null ? Number(p.effectiveCost) : null,
        };
        map.set(p.id, info);
        map.set(`source:${p.sourceId}`, info);
      }

      return map;
    },

    async findCatalogInventoryProducts() {
      const products = await prisma.product.findMany({
        select: {
          id: true,
          sourceId: true,
          code: true,
          description: true,
          categoryDescription: true,
          active: true,
          sourcePresent: true,
          stockQuantity: true,
          effectiveCost: true,
          averageCost: true,
          retailSalePrice: true,
          stockMinQuantity: true,
          stockMaxQuantity: true,
        },
      });

      return products.map((p) => ({
        id: p.id,
        sourceId: p.sourceId,
        code: p.code,
        description: p.description,
        categoryDescription: p.categoryDescription,
        active: p.active,
        sourcePresent: p.sourcePresent,
        stockQuantity:
          p.stockQuantity !== null ? Number(p.stockQuantity) : null,
        effectiveCost:
          p.effectiveCost !== null ? Number(p.effectiveCost) : null,
        averageCost: p.averageCost !== null ? Number(p.averageCost) : null,
        retailSalePrice:
          p.retailSalePrice !== null ? Number(p.retailSalePrice) : null,
        stockMinQuantity:
          p.stockMinQuantity !== null ? Number(p.stockMinQuantity) : null,
        stockMaxQuantity:
          p.stockMaxQuantity !== null ? Number(p.stockMaxQuantity) : null,
      }));
    },

    async findHistoricalLastPhysicalSales(toExclusive: Date) {
      // Reutiliza a camada canônica de movimentações para todo o histórico disponível
      const { movements } = await this.findRealizedProductMovements!(
        new Date(0),
        toExclusive,
      );

      const map = new Map<string, Date>();
      for (const m of movements) {
        if (m.quantity > 0) {
          const prevSrc = map.get(m.sourceProductId);
          if (!prevSrc || m.realizedDate > prevSrc) {
            map.set(m.sourceProductId, m.realizedDate);
          }
          if (m.productId) {
            const prevId = map.get(m.productId);
            if (!prevId || m.realizedDate > prevId) {
              map.set(m.productId, m.realizedDate);
            }
          }
        }
      }

      return map;
    },
  };
}
