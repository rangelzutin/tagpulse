import type { PrismaClient } from "@prisma/client";
import { Prisma, SaleAnchorType } from "@prisma/client";
import type { NormalizedSale } from "../../integrations/tagplus/sales/sales-normalizers.js";
import { computeRealizedDate } from "../../integrations/tagplus/sales/sales-normalizers.js";
import { computeCommercialDate } from "./commercial-date.js";

export const SALES_TRANSACTION_TIMEOUT_MS = 30000;

export interface SalesRepository {
  persistPedido(
    connectionId: string,
    pedido: NormalizedSale,
    observedAt: Date,
  ): Promise<void>;

  persistChildSale(
    connectionId: string,
    childSale: NormalizedSale,
    observedAt: Date,
  ): Promise<void>;

  reconcileAbsentSourceDocs(
    connectionId: string,
    docType: SaleAnchorType,
    observedSourceIds: Set<string>,
  ): Promise<number>;

  removeConfirmedInboundNfeSales(
    connectionId: string,
    confirmedInboundSourceIds: Set<string>,
  ): Promise<number>;
}

export function createSalesRepository(prisma: PrismaClient): SalesRepository {
  return {
    async persistPedido(connectionId, pedido, observedAt) {
      await prisma.$transaction(async (tx) => {
        let customerId: string | null = null;
        if (pedido.customerSourceId) {
          const customer = await tx.customer.findUnique({
            where: {
              connectionId_sourceId: {
                connectionId,
                sourceId: pedido.customerSourceId,
              },
            },
            select: { id: true },
          });
          customerId = customer?.id ?? null;
        }

        const commercialDate = computeCommercialDate({
          sourceConfirmedAt: pedido.sourceConfirmedAt,
          sourceCreatedAt: pedido.sourceCreatedAt,
        });

        const sale = await tx.sale.upsert({
          where: {
            connectionId_anchorType_anchorSourceId: {
              connectionId,
              anchorType: SaleAnchorType.PEDIDO,
              anchorSourceId: pedido.sourceId,
            },
          },
          create: {
            connectionId,
            anchorType: SaleAnchorType.PEDIDO,
            anchorSourceId: pedido.sourceId,
            netAmount: new Prisma.Decimal(pedido.netAmount),
            customerId,
            sourceCreatedAt: pedido.sourceCreatedAt,
            sourceConfirmedAt: pedido.sourceConfirmedAt,
            sourceEmissaoAt: pedido.sourceEmissaoAt,
            commercialDate,
          },
          update: {
            netAmount: new Prisma.Decimal(pedido.netAmount),
            customerId,
            sourceCreatedAt: pedido.sourceCreatedAt,
            sourceConfirmedAt: pedido.sourceConfirmedAt,
            sourceEmissaoAt: pedido.sourceEmissaoAt,
            commercialDate,
          },
        });

        await tx.saleItem.deleteMany({
          where: { saleId: sale.id },
        });

        if (pedido.items.length > 0) {
          const itemsToCreate = [];
          for (const item of pedido.items) {
            let productId: string | null = null;
            if (item.sourceProductId) {
              const product = await tx.product.findUnique({
                where: {
                  connectionId_sourceId: {
                    connectionId,
                    sourceId: item.sourceProductId,
                  },
                },
                select: { id: true },
              });
              productId = product?.id ?? null;
            }

            itemsToCreate.push({
              saleId: sale.id,
              sourceItemId: item.sourceItemId,
              lineNumber: item.lineNumber,
              productId,
              sourceProductId: item.sourceProductId,
              quantity: new Prisma.Decimal(item.quantity),
              unitPrice: new Prisma.Decimal(item.unitPrice),
              discountAmount: item.discountAmount
                ? new Prisma.Decimal(item.discountAmount)
                : null,
              subtotal: new Prisma.Decimal(item.subtotal),
            });
          }

          await tx.saleItem.createMany({
            data: itemsToCreate,
          });
        }

        await tx.saleSourceDocument.upsert({
          where: {
            connectionId_docType_sourceId: {
              connectionId,
              docType: SaleAnchorType.PEDIDO,
              sourceId: pedido.sourceId,
            },
          },
          create: {
            saleId: sale.id,
            connectionId,
            docType: SaleAnchorType.PEDIDO,
            sourceId: pedido.sourceId,
            netAmount: new Prisma.Decimal(pedido.netAmount),
            status: pedido.status,
            sourceCreatedAt: pedido.sourceCreatedAt,
            sourceConfirmedAt: pedido.sourceConfirmedAt,
            sourceEmissaoAt: pedido.sourceEmissaoAt,
            realizedDate: null,
            sourcePresent: true,
            lastSeenAt: observedAt,
          },
          update: {
            saleId: sale.id,
            netAmount: new Prisma.Decimal(pedido.netAmount),
            status: pedido.status,
            sourceCreatedAt: pedido.sourceCreatedAt,
            sourceConfirmedAt: pedido.sourceConfirmedAt,
            sourceEmissaoAt: pedido.sourceEmissaoAt,
            realizedDate: null,
            sourcePresent: true,
            lastSeenAt: observedAt,
          },
        });
      }, { timeout: SALES_TRANSACTION_TIMEOUT_MS });
    },

    async persistChildSale(connectionId, childSale, observedAt) {
      await prisma.$transaction(async (tx) => {
        const childRealizedDate = computeRealizedDate({
          anchorType: childSale.anchorType,
          status: childSale.status,
          sourceConfirmedAt: childSale.sourceConfirmedAt,
          sourceEmissaoAt: childSale.sourceEmissaoAt,
        });

        let parentSale: { id: string } | null = null;
        if (childSale.parentPedidoSourceId) {
          parentSale = await tx.sale.findUnique({
            where: {
              connectionId_anchorType_anchorSourceId: {
                connectionId,
                anchorType: SaleAnchorType.PEDIDO,
                anchorSourceId: childSale.parentPedidoSourceId,
              },
            },
            select: { id: true },
          });
        }

        if (parentSale) {
          // Parent PEDIDO Sale is canonical.
          const existingDoc = await tx.saleSourceDocument.findUnique({
            where: {
              connectionId_docType_sourceId: {
                connectionId,
                docType: childSale.anchorType,
                sourceId: childSale.sourceId,
              },
            },
          });

          if (!existingDoc) {
            // Case A: Create directly under parentSale
            await tx.saleSourceDocument.create({
              data: {
                saleId: parentSale.id,
                connectionId,
                docType: childSale.anchorType,
                sourceId: childSale.sourceId,
                netAmount: new Prisma.Decimal(childSale.netAmount),
                status: childSale.status,
                sourceCreatedAt: childSale.sourceCreatedAt,
                sourceConfirmedAt: childSale.sourceConfirmedAt,
                sourceEmissaoAt: childSale.sourceEmissaoAt,
                realizedDate: childRealizedDate,
                sourcePresent: true,
                lastSeenAt: observedAt,
              },
            });
          } else if (existingDoc.saleId === parentSale.id) {
            // Case B: Idempotent update
            await tx.saleSourceDocument.update({
              where: { id: existingDoc.id },
              data: {
                netAmount: new Prisma.Decimal(childSale.netAmount),
                status: childSale.status,
                sourceCreatedAt: childSale.sourceCreatedAt,
                sourceConfirmedAt: childSale.sourceConfirmedAt,
                sourceEmissaoAt: childSale.sourceEmissaoAt,
                realizedDate: childRealizedDate,
                sourcePresent: true,
                lastSeenAt: observedAt,
              },
            });
          } else {
            // Case C: Move from oldSale S1 to parentSale S2
            const oldSaleId = existingDoc.saleId;
            await tx.saleSourceDocument.update({
              where: { id: existingDoc.id },
              data: {
                saleId: parentSale.id,
                netAmount: new Prisma.Decimal(childSale.netAmount),
                status: childSale.status,
                sourceCreatedAt: childSale.sourceCreatedAt,
                sourceConfirmedAt: childSale.sourceConfirmedAt,
                sourceEmissaoAt: childSale.sourceEmissaoAt,
                realizedDate: childRealizedDate,
                sourcePresent: true,
                lastSeenAt: observedAt,
              },
            });

            // If oldSale S1 no longer owns any source documents, delete it
            const remainingDocs = await tx.saleSourceDocument.count({
              where: { saleId: oldSaleId },
            });
            if (remainingDocs === 0) {
              await tx.sale.delete({
                where: { id: oldSaleId },
              });
            }
          }
        } else {
          // Direct Venda Simples or Direct NFe
          let customerId: string | null = null;
          if (childSale.customerSourceId) {
            const customer = await tx.customer.findUnique({
              where: {
                connectionId_sourceId: {
                  connectionId,
                  sourceId: childSale.customerSourceId,
                },
              },
              select: { id: true },
            });
            customerId = customer?.id ?? null;
          }

          const commercialDate = computeCommercialDate({
            sourceConfirmedAt: childSale.sourceConfirmedAt,
            sourceCreatedAt: childSale.sourceCreatedAt,
          });

          const directSale = await tx.sale.upsert({
            where: {
              connectionId_anchorType_anchorSourceId: {
                connectionId,
                anchorType: childSale.anchorType,
                anchorSourceId: childSale.sourceId,
              },
            },
            create: {
              connectionId,
              anchorType: childSale.anchorType,
              anchorSourceId: childSale.sourceId,
              netAmount: new Prisma.Decimal(childSale.netAmount),
              customerId,
              sourceCreatedAt: childSale.sourceCreatedAt,
              sourceConfirmedAt: childSale.sourceConfirmedAt,
              sourceEmissaoAt: childSale.sourceEmissaoAt,
              commercialDate,
            },
            update: {
              netAmount: new Prisma.Decimal(childSale.netAmount),
              customerId,
              sourceCreatedAt: childSale.sourceCreatedAt,
              sourceConfirmedAt: childSale.sourceConfirmedAt,
              sourceEmissaoAt: childSale.sourceEmissaoAt,
              commercialDate,
            },
          });

          await tx.saleItem.deleteMany({
            where: { saleId: directSale.id },
          });

          if (childSale.items.length > 0) {
            const itemsToCreate = [];
            for (const item of childSale.items) {
              let productId: string | null = null;
              if (item.sourceProductId) {
                const product = await tx.product.findUnique({
                  where: {
                    connectionId_sourceId: {
                      connectionId,
                      sourceId: item.sourceProductId,
                    },
                  },
                  select: { id: true },
                });
                productId = product?.id ?? null;
              }

              itemsToCreate.push({
                saleId: directSale.id,
                sourceItemId: item.sourceItemId,
                lineNumber: item.lineNumber,
                productId,
                sourceProductId: item.sourceProductId,
                quantity: new Prisma.Decimal(item.quantity),
                unitPrice: new Prisma.Decimal(item.unitPrice),
                discountAmount: item.discountAmount
                  ? new Prisma.Decimal(item.discountAmount)
                  : null,
                subtotal: new Prisma.Decimal(item.subtotal),
              });
            }

            await tx.saleItem.createMany({
              data: itemsToCreate,
            });
          }

          await tx.saleSourceDocument.upsert({
            where: {
              connectionId_docType_sourceId: {
                connectionId,
                docType: childSale.anchorType,
                sourceId: childSale.sourceId,
              },
            },
            create: {
              saleId: directSale.id,
              connectionId,
              docType: childSale.anchorType,
              sourceId: childSale.sourceId,
              netAmount: new Prisma.Decimal(childSale.netAmount),
              status: childSale.status,
              sourceCreatedAt: childSale.sourceCreatedAt,
              sourceConfirmedAt: childSale.sourceConfirmedAt,
              sourceEmissaoAt: childSale.sourceEmissaoAt,
              realizedDate: childRealizedDate,
              sourcePresent: true,
              lastSeenAt: observedAt,
            },
            update: {
              saleId: directSale.id,
              netAmount: new Prisma.Decimal(childSale.netAmount),
              status: childSale.status,
              sourceCreatedAt: childSale.sourceCreatedAt,
              sourceConfirmedAt: childSale.sourceConfirmedAt,
              sourceEmissaoAt: childSale.sourceEmissaoAt,
              realizedDate: childRealizedDate,
              sourcePresent: true,
              lastSeenAt: observedAt,
            },
          });
        }
      }, { timeout: SALES_TRANSACTION_TIMEOUT_MS });
    },

    async reconcileAbsentSourceDocs(connectionId, docType, observedSourceIds) {
      const result = await prisma.saleSourceDocument.updateMany({
        where: {
          connectionId,
          docType,
          sourcePresent: true,
          sourceId: { notIn: Array.from(observedSourceIds) },
        },
        data: {
          sourcePresent: false,
        },
      });

      return result.count;
    },

    async removeConfirmedInboundNfeSales(connectionId, confirmedInboundSourceIds) {
      if (confirmedInboundSourceIds.size === 0) {
        return 0;
      }

      const inboundIds = Array.from(confirmedInboundSourceIds);

      const spuriousSales = await prisma.sale.findMany({
        where: {
          connectionId,
          anchorType: SaleAnchorType.NFE,
          anchorSourceId: { in: inboundIds },
          sourceDocs: {
            none: {
              OR: [
                { docType: { not: SaleAnchorType.NFE } },
                { sourceId: { notIn: inboundIds } },
              ],
            },
          },
        },
        select: { id: true },
      });

      if (spuriousSales.length === 0) {
        return 0;
      }

      const deleteResult = await prisma.sale.deleteMany({
        where: {
          id: { in: spuriousSales.map((s) => s.id) },
        },
      });

      return deleteResult.count;
    },
  };
}
