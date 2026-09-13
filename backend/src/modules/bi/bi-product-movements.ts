import { SaleAnchorType } from "@prisma/client";
import { classifySaleChannel } from "./bi-channel-classifier.js";
import type {
  ProductReconciliationAdjustment,
  RealizedProductMovement,
} from "./bi-types.js";

/**
 * Exceção conhecida homologada do histórico de 2025:
 * No Pedido #1265, a NF-e #2806 foi emitida em 2025-10-20 como reemissão/duplicidade
 * operacional comprovada da NF-e #2795 (emitida em 2025-09-24).
 * Ambas possuem os mesmos itens, quantidades (65 unidades) e valor (R$ 5.488,50).
 * A NF-e #2806 é excluída explicitamente do BI de Produtos para evitar duplicação física e de receita.
 *
 * NOTA TÉCNICA:
 * Não foi criada regra genérica silenciosa de exclusão automática.
 * Futuras possíveis duplicidades devem ser sinalizadas para revisão operacional e auditadas aqui.
 */
export const KNOWN_DUPLICATE_SOURCE_IDS = new Set<string>(["2806"]);

export const KNOWN_DUPLICATE_AUDIT_INFO: Record<
  string,
  { reason: string; expectedAmount: number }
> = {
  "2806": {
    reason:
      "Duplicidade operacional comprovada da NF-e #2795 vinculada ao Pedido #1265.",
    expectedAmount: 5488.5,
  },
};

const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Realiza rateio proporcional financeiro com garantia de fechamento exato ao centavo.
 * A eventual diferença de centavos decorrente do arredondamento é absorvida pelo último item.
 */
export function distributeProportional(
  items: Array<{ key: string; base: number }>,
  totalAmount: number,
): Map<string, number> {
  const result = new Map<string, number>();
  if (items.length === 0 || totalAmount === 0) return result;

  const totalBase = items.reduce((acc, it) => acc + it.base, 0);

  if (totalBase === 0) {
    const equalShare = round2(totalAmount / items.length);
    let distributed = 0;
    items.forEach((it, idx) => {
      if (idx === items.length - 1) {
        result.set(it.key, round2(totalAmount - distributed));
      } else {
        result.set(it.key, equalShare);
        distributed = round2(distributed + equalShare);
      }
    });
    return result;
  }

  let distributed = 0;
  items.forEach((it, idx) => {
    if (idx === items.length - 1) {
      result.set(it.key, round2(totalAmount - distributed));
    } else {
      const share = round2((it.base / totalBase) * totalAmount);
      result.set(it.key, share);
      distributed = round2(distributed + share);
    }
  });

  return result;
}

export interface SaleWithDocsAndItems {
  id: string;
  anchorType: SaleAnchorType;
  anchorSourceId: string;
  customerId: string | null;
  customer?: {
    cnpj: string | null;
    cpf: string | null;
    legalName: string | null;
    tradeName: string | null;
  } | null;
  items: Array<{
    id: string;
    sourceItemId: string;
    productId: string | null;
    sourceProductId: string;
    quantity: unknown;
    unitPrice: unknown;
    subtotal: unknown;
  }>;
  sourceDocs: Array<{
    id: string;
    docType: SaleAnchorType;
    sourceId: string;
    netAmount: unknown;
    realizedDate: Date | null;
    items: Array<{
      id: string;
      sourceItemId: string;
      productId: string | null;
      sourceProductId: string;
      quantity: unknown;
      unitPrice: unknown;
      subtotal: unknown;
    }>;
  }>;
}

export interface MovementGenerationResult {
  movements: RealizedProductMovement[];
  adjustments: ProductReconciliationAdjustment[];
}

/**
 * Função canônica central de agregação de movimentações de produtos realizados.
 *
 * Princípios homologados:
 * 1. DIMENSÃO FÍSICA (QUANTIDADE):
 *    - NF-e direta ou vinculada é autoridade física dos itens discriminados.
 *    - Venda Simples direta é autoridade dos itens vendidos diretamente.
 *    - Venda Simples vinculada a Pedido: itens clonados não geram quantidade física;
 *      gera apenas o residual físico (residualQty = max(0, Pedido.qty - SUM(NFe.qty))).
 * 2. DIMENSÃO FINANCEIRA (RECEITA LÍQUIDA RATEADA):
 *    - Cada documento realizado aloca seu netAmount exatamente uma vez (sem fan-out).
 *    - NF-e e Venda Simples direta rateiam sobre seus próprios itens.
 *    - Venda Simples vinculada a Pedido rateia sobre a cesta da negociação (SaleItem).
 *    - Quando residualQty = 0 mas há receita na Venda Simples complementar,
 *      o movimento financeiro é gerado com quantity = 0 e
 *      origem = "PEDIDO_FINANCIAL_COMPLEMENT_VENDA_SIMPLES".
 */
export function generateRealizedProductMovements(
  sales: SaleWithDocsAndItems[],
  from: Date,
  toExclusive: Date,
): MovementGenerationResult {
  const movements: RealizedProductMovement[] = [];
  const adjustments: ProductReconciliationAdjustment[] = [];

  for (const sale of sales) {
    const hasPedido =
      sale.anchorType === SaleAnchorType.PEDIDO ||
      sale.sourceDocs.some((d) => d.docType === SaleAnchorType.PEDIDO);

    const channel = classifySaleChannel({
      hasPedido,
      cnpj: sale.customer?.cnpj,
      cpf: sale.customer?.cpf,
      customerName: sale.customer?.legalName ?? sale.customer?.tradeName,
    });

    // Filtra documentos realizados elegíveis
    const realizedDocs = sale.sourceDocs.filter(
      (d) =>
        (d.docType === SaleAnchorType.NFE ||
          d.docType === SaleAnchorType.VENDA_SIMPLES) &&
        d.realizedDate !== null &&
        d.netAmount !== null,
    );

    // Identifica e audita exceções conhecidas no período consultado
    for (const doc of realizedDocs) {
      if (
        KNOWN_DUPLICATE_SOURCE_IDS.has(doc.sourceId) &&
        doc.realizedDate! >= from &&
        doc.realizedDate! < toExclusive
      ) {
        const audit = KNOWN_DUPLICATE_AUDIT_INFO[doc.sourceId];
        adjustments.push({
          type: "KNOWN_DUPLICATE_NFE",
          sourceDocumentId: doc.id,
          sourceId: doc.sourceId,
          amount: Number(doc.netAmount),
          reason: audit?.reason ?? "Duplicidade operacional auditada.",
        });
      }
    }

    // Documentos que entram nas movimentações de produtos (excluindo duplicidades auditadas)
    const validRealizedDocs = realizedDocs.filter(
      (d) => !KNOWN_DUPLICATE_SOURCE_IDS.has(d.sourceId),
    );

    if (sale.anchorType === SaleAnchorType.NFE) {
      // 1. NF-e DIRETA
      for (const doc of validRealizedDocs) {
        if (
          doc.docType === SaleAnchorType.NFE &&
          doc.realizedDate! >= from &&
          doc.realizedDate! < toExclusive
        ) {
          const docNet = Number(doc.netAmount);
          const distribution = distributeProportional(
            doc.items.map((it) => ({
              key: it.id,
              base: Number(it.subtotal),
            })),
            docNet,
          );

          for (const item of doc.items) {
            const allocatedNet = distribution.get(item.id) ?? 0;
            const subtotal = Number(item.subtotal);
            movements.push({
              saleId: sale.id,
              customerId: sale.customerId,
              channel,
              sourceDocumentId: doc.id,
              sourceDocumentType: doc.docType,
              realizedDate: doc.realizedDate!,
              productId: item.productId,
              sourceProductId: item.sourceProductId,
              quantity: Number(item.quantity),
              grossItemAmount: subtotal,
              allocationBaseAmount: subtotal,
              allocatedNetRevenue: allocatedNet,
              origin: "DIRECT_NFE",
            });
          }
        }
      }
    } else if (sale.anchorType === SaleAnchorType.VENDA_SIMPLES) {
      // 2. VENDA SIMPLES DIRETA
      for (const doc of validRealizedDocs) {
        if (
          doc.docType === SaleAnchorType.VENDA_SIMPLES &&
          doc.realizedDate! >= from &&
          doc.realizedDate! < toExclusive
        ) {
          const docNet = Number(doc.netAmount);
          const distribution = distributeProportional(
            doc.items.map((it) => ({
              key: it.id,
              base: Number(it.subtotal),
            })),
            docNet,
          );

          for (const item of doc.items) {
            const allocatedNet = distribution.get(item.id) ?? 0;
            const subtotal = Number(item.subtotal);
            movements.push({
              saleId: sale.id,
              customerId: sale.customerId,
              channel,
              sourceDocumentId: doc.id,
              sourceDocumentType: doc.docType,
              realizedDate: doc.realizedDate!,
              productId: item.productId,
              sourceProductId: item.sourceProductId,
              quantity: Number(item.quantity),
              grossItemAmount: subtotal,
              allocationBaseAmount: subtotal,
              allocatedNetRevenue: allocatedNet,
              origin: "DIRECT_VENDA_SIMPLES",
            });
          }
        }
      }
    } else if (sale.anchorType === SaleAnchorType.PEDIDO) {
      // 3. PEDIDO
      const nfeDocs = validRealizedDocs.filter(
        (d) => d.docType === SaleAnchorType.NFE,
      );
      const vsDocs = validRealizedDocs.filter(
        (d) => d.docType === SaleAnchorType.VENDA_SIMPLES,
      );

      if (nfeDocs.length > 0 && vsDocs.length === 0) {
        // Pedido + somente NF-e(s)
        for (const doc of nfeDocs) {
          if (doc.realizedDate! >= from && doc.realizedDate! < toExclusive) {
            const docNet = Number(doc.netAmount);
            const distribution = distributeProportional(
              doc.items.map((it) => ({
                key: it.id,
                base: Number(it.subtotal),
              })),
              docNet,
            );

            for (const item of doc.items) {
              const allocatedNet = distribution.get(item.id) ?? 0;
              const subtotal = Number(item.subtotal);
              movements.push({
                saleId: sale.id,
                customerId: sale.customerId,
                channel,
                sourceDocumentId: doc.id,
                sourceDocumentType: doc.docType,
                realizedDate: doc.realizedDate!,
                productId: item.productId,
                sourceProductId: item.sourceProductId,
                quantity: Number(item.quantity),
                grossItemAmount: subtotal,
                allocationBaseAmount: subtotal,
                allocatedNetRevenue: allocatedNet,
                origin: "PEDIDO_NFE",
              });
            }
          }
        }
      } else if (nfeDocs.length === 0 && vsDocs.length > 0) {
        // Pedido + somente Venda Simples (itens clonados ignorados; usa SaleItem uma vez)
        for (const vsDoc of vsDocs) {
          if (vsDoc.realizedDate! >= from && vsDoc.realizedDate! < toExclusive) {
            const docNet = Number(vsDoc.netAmount);
            const distribution = distributeProportional(
              sale.items.map((it) => ({
                key: it.id,
                base: Number(it.subtotal),
              })),
              docNet,
            );

            for (const item of sale.items) {
              const allocatedNet = distribution.get(item.id) ?? 0;
              const subtotal = Number(item.subtotal);
              movements.push({
                saleId: sale.id,
                customerId: sale.customerId,
                channel,
                sourceDocumentId: vsDoc.id,
                sourceDocumentType: vsDoc.docType,
                realizedDate: vsDoc.realizedDate!,
                productId: item.productId,
                sourceProductId: item.sourceProductId,
                quantity: Number(item.quantity),
                grossItemAmount: subtotal,
                allocationBaseAmount: subtotal,
                allocatedNetRevenue: allocatedNet,
                origin: "PEDIDO_VENDA_SIMPLES",
              });
            }
          }
        }
      } else if (nfeDocs.length > 0 && vsDocs.length > 0) {
        // Pedido + NF-e(s) + Venda Simples (Misto)
        const nfeQtyByProd = new Map<string, number>();

        // 1. Processa as NF-es realizadas
        for (const doc of nfeDocs) {
          const docNet = Number(doc.netAmount);
          const distribution = distributeProportional(
            doc.items.map((it) => ({
              key: it.id,
              base: Number(it.subtotal),
            })),
            docNet,
          );

          for (const item of doc.items) {
            const current = nfeQtyByProd.get(item.sourceProductId) ?? 0;
            nfeQtyByProd.set(
              item.sourceProductId,
              current + Number(item.quantity),
            );

            if (doc.realizedDate! >= from && doc.realizedDate! < toExclusive) {
              const allocatedNet = distribution.get(item.id) ?? 0;
              const subtotal = Number(item.subtotal);
              movements.push({
                saleId: sale.id,
                customerId: sale.customerId,
                channel,
                sourceDocumentId: doc.id,
                sourceDocumentType: doc.docType,
                realizedDate: doc.realizedDate!,
                productId: item.productId,
                sourceProductId: item.sourceProductId,
                quantity: Number(item.quantity),
                grossItemAmount: subtotal,
                allocationBaseAmount: subtotal,
                allocatedNetRevenue: allocatedNet,
                origin: "PEDIDO_NFE",
              });
            }
          }
        }

        // 2. Processa a Venda Simples (residual físico + complemento financeiro conforme OPÇÃO A)
        for (const vsDoc of vsDocs) {
          if (
            vsDoc.realizedDate! >= from &&
            vsDoc.realizedDate! < toExclusive
          ) {
            const docNet = Number(vsDoc.netAmount);
            // Rateio financeiro utiliza a cesta negociada (SaleItem) como base proporcional
            const distribution = distributeProportional(
              sale.items.map((it) => ({
                key: it.id,
                base: Number(it.subtotal),
              })),
              docNet,
            );

            for (const item of sale.items) {
              const nfeQty = nfeQtyByProd.get(item.sourceProductId) ?? 0;
              const residualQty = Math.max(0, Number(item.quantity) - nfeQty);
              const allocatedNet = distribution.get(item.id) ?? 0;
              const unitPrice = Number(item.unitPrice);
              const subtotal = Number(item.subtotal);

              if (residualQty > 0) {
                // Residual físico positivo com sua fatia da Venda Simples
                movements.push({
                  saleId: sale.id,
                  customerId: sale.customerId,
                  channel,
                  sourceDocumentId: vsDoc.id,
                  sourceDocumentType: vsDoc.docType,
                  realizedDate: vsDoc.realizedDate!,
                  productId: item.productId,
                  sourceProductId: item.sourceProductId,
                  quantity: residualQty,
                  grossItemAmount: unitPrice * residualQty,
                  allocationBaseAmount: subtotal,
                  allocatedNetRevenue: allocatedNet,
                  origin: "PEDIDO_RESIDUAL_VENDA_SIMPLES",
                });
              } else {
                // Complemento puramente financeiro (item físico já realizado em NF-e anterior)
                movements.push({
                  saleId: sale.id,
                  customerId: sale.customerId,
                  channel,
                  sourceDocumentId: vsDoc.id,
                  sourceDocumentType: vsDoc.docType,
                  realizedDate: vsDoc.realizedDate!,
                  productId: item.productId,
                  sourceProductId: item.sourceProductId,
                  quantity: 0, // Realização física é zero
                  grossItemAmount: 0,
                  allocationBaseAmount: subtotal,
                  allocatedNetRevenue: allocatedNet,
                  origin: "PEDIDO_FINANCIAL_COMPLEMENT_VENDA_SIMPLES",
                });
              }
            }
          }
        }
      }
    }
  }

  return { movements, adjustments };
}
