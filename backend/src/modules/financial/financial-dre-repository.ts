import type { PrismaClient } from "@prisma/client";
import type { BiRepository } from "../bi/bi-repository.js";
import { calculateProfitabilityOverview } from "../bi/bi-profitability-calculator.js";
import type { MonthlyCommercialTrend } from "./financial-dre-calculator.js";
import type { ClassifierRecordInput } from "./financial-dre-classifier.js";

export interface DreRepositoryData {
  commercialTrend: MonthlyCommercialTrend[];
  totalRealizedRevenue: number;
  totalEstimatedCOGS: number;
  recordsForClassifier: ClassifierRecordInput[];
}

export interface FinancialDreRepository {
  findDreData(from: Date, toExclusive: Date): Promise<DreRepositoryData>;
}

export function createPrismaFinancialDreRepository(
  prisma: PrismaClient,
  biRepository: BiRepository,
): FinancialDreRepository {
  return {
    async findDreData(from: Date, toExclusive: Date): Promise<DreRepositoryData> {
      const connection = await prisma.tagPlusConnection.findFirst({
        where: { status: "ACTIVE" },
        select: { id: true },
      });

      if (!connection) {
        return {
          commercialTrend: [],
          totalRealizedRevenue: 0,
          totalEstimatedCOGS: 0,
          recordsForClassifier: [],
        };
      }

      const connectionId = connection.id;

      // 1. Camada Comercial Canônica (Rentabilidade / BI)
      let commercialTrend: MonthlyCommercialTrend[] = [];
      let totalRealizedRevenue = 0;
      let totalEstimatedCOGS = 0;

      if (biRepository.findProfitabilityContext) {
        const fromStr = from.toISOString().slice(0, 10);
        const toStr = new Date(toExclusive.getTime() - 1).toISOString().slice(0, 10);

        const biCtx = await biRepository.findProfitabilityContext(from, toExclusive);
        const overview = calculateProfitabilityOverview({
          movements: biCtx.movements,
          catalogProductsMap: biCtx.catalogProductsMap,
          categoriesFlat: biCtx.categoriesFlat,
          categoryTree: biCtx.categoryTree,
          period: { from: fromStr, to: toStr },
          filters: {},
          costSnapshot: biCtx.costSnapshot,
        });

        totalRealizedRevenue = overview.summary.realizedRevenue;
        totalEstimatedCOGS = overview.summary.estimatedCOGS;

        commercialTrend = overview.trend.map((t) => ({
          month: t.period,
          realizedRevenue: t.realizedRevenue,
          estimatedCOGS: t.estimatedCOGS,
          estimatedGrossProfit: t.estimatedGrossProfit,
          grossMarginPercent: t.estimatedGrossMarginPercent,
        }));
      }

      // 2. Registros Financeiros (com janela estendida para suportar competência real)
      const bufferStart = new Date(from.getTime() - 60 * 24 * 60 * 60 * 1000); // 60 dias antes
      const bufferEnd = new Date(toExclusive.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 dias depois

      const rawRecords = await prisma.financialRecord.findMany({
        where: {
          connectionId,
          sourcePresent: true,
          OR: [
            { dueDate: { gte: bufferStart, lte: bufferEnd } },
            { sourceCompetenceDate: { gte: bufferStart, lte: bufferEnd } },
            { confirmationDate: { gte: bufferStart, lte: bufferEnd } },
          ],
        },
        orderBy: { dueDate: "asc" },
      });

      // 3. Vínculo determinístico de Taxas de Pagamento (Plano 1) com Vendas
      const customers = await prisma.customer.findMany({
        where: { connectionId },
        select: { id: true, sourceId: true, sourceEntityId: true },
      });
      const custByEntityId = new Map(
        customers.filter((c) => c.sourceEntityId).map((c) => [c.sourceEntityId!, c]),
      );
      const custBySourceId = new Map(
        customers.filter((c) => c.sourceId).map((c) => [c.sourceId!, c]),
      );

      const allSales = await prisma.sale.findMany({
        where: { connectionId },
        select: {
          id: true,
          customerId: true,
          netAmount: true,
          commercialDate: true,
          sourceDocs: { select: { realizedDate: true } },
        },
      });

      type SaleWithDocs = (typeof allSales)[0];

      const recordsForClassifier: ClassifierRecordInput[] = rawRecords.map((r) => {
        let linkedSaleRealizedDate: Date | null = null;

        // Se for Plano 1 com desconto de taxa, buscar venda vinculada
        if (r.budgetPlanSourceId === "1" && r.discountAmount && Number(r.discountAmount) > 0) {
          const cust = r.entitySourceId
            ? custByEntityId.get(r.entitySourceId) ?? custBySourceId.get(r.entitySourceId)
            : null;
          const custSales = cust ? allSales.filter((s) => s.customerId === cust.id) : [];

          let linkedSale: SaleWithDocs | null = null;
          let linkedDoc: { realizedDate: Date | null } | null = null;

          if (custSales.length === 1) {
            const firstSale = custSales[0];
            if (firstSale) {
              linkedSale = firstSale;
              linkedDoc = firstSale.sourceDocs[0] ?? null;
            }
          } else if (custSales.length > 1) {
            const rAmt = Number(r.originalAmount);
            const amtMatches = custSales.filter(
              (s) => Math.abs(Number(s.netAmount) - rAmt) < 0.01,
            );
            if (amtMatches.length === 1 && amtMatches[0]) {
              linkedSale = amtMatches[0];
              linkedDoc = amtMatches[0].sourceDocs[0] ?? null;
            } else {
              const rDue = r.dueDate.getTime();
              const pastSales = custSales.filter(
                (s) => s.commercialDate != null && s.commercialDate.getTime() <= rDue,
              );
              if (pastSales.length > 0) {
                pastSales.sort((a, b) => {
                  const bTime = b.commercialDate?.getTime() ?? 0;
                  const aTime = a.commercialDate?.getTime() ?? 0;
                  return bTime - aTime;
                });
                const closest = pastSales[0];
                if (closest) {
                  linkedSale = closest;
                  linkedDoc = closest.sourceDocs[0] ?? null;
                }
              }
            }
          }

          linkedSaleRealizedDate =
            linkedDoc?.realizedDate ?? linkedSale?.commercialDate ?? null;
        }

        return {
          id: r.id,
          sourceId: r.sourceId,
          type: r.type,
          isTransfer: r.isTransfer,
          budgetPlanSourceId: r.budgetPlanSourceId,
          description: r.description,
          dueDate: r.dueDate,
          confirmationDate: r.confirmationDate,
          sourceCompetenceDate: r.sourceCompetenceDate,
          originalAmount: r.originalAmount,
          totalAmount: r.totalAmount,
          discountAmount: r.discountAmount,
          surchargeAmount: r.surchargeAmount,
          lateInterestAmount: r.lateInterestAmount,
          entityName: r.entityName,
          linkedSaleRealizedDate,
        };
      });

      return {
        commercialTrend,
        totalRealizedRevenue,
        totalEstimatedCOGS,
        recordsForClassifier,
      };
    },
  };
}
