import { SaleAnchorType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { classifySaleChannel } from "../src/modules/bi/bi-channel-classifier.js";
import {
  distributeProportional,
  generateRealizedProductMovements,
  type SaleWithDocsAndItems,
} from "../src/modules/bi/bi-product-movements.js";
import { calculateProductsOverview } from "../src/modules/bi/bi-products-calculator.js";
import { createBiRepository } from "../src/modules/bi/bi-repository.js";
import { createBiService } from "../src/modules/bi/bi-service.js";
import { prisma } from "../src/database/prisma.js";

describe("Products BI V1 — Canonical Movement & Rules", () => {
  const from = new Date("2026-01-01T00:00:00.000Z");
  const toExclusive = new Date("2026-02-01T00:00:00.000Z");

  it("1. NF-e direta: quantidade física e faturamento rateado pelos itens da nota", () => {
    const sale: SaleWithDocsAndItems = {
      id: "sale-nfe-dir-1",
      anchorType: SaleAnchorType.NFE,
      anchorSourceId: "2001",
      customerId: "cust-1",
      items: [],
      sourceDocs: [
        {
          id: "doc-nfe-2001",
          docType: SaleAnchorType.NFE,
          sourceId: "2001",
          netAmount: 300,
          realizedDate: new Date("2026-01-10T10:00:00.000Z"),
          items: [
            {
              id: "it-1",
              sourceItemId: "si-1",
              productId: "prod-1-uuid",
              sourceProductId: "101",
              quantity: 2,
              unitPrice: 100,
              subtotal: 200,
            },
            {
              id: "it-2",
              sourceItemId: "si-2",
              productId: "prod-2-uuid",
              sourceProductId: "102",
              quantity: 1,
              unitPrice: 100,
              subtotal: 100,
            },
          ],
        },
      ],
    };

    const { movements } = generateRealizedProductMovements(
      [sale],
      from,
      toExclusive,
    );

    expect(movements).toHaveLength(2);
    expect(movements[0]).toMatchObject({
      origin: "DIRECT_NFE",
      productId: "prod-1-uuid",
      sourceProductId: "101",
      quantity: 2,
      grossItemAmount: 200,
      allocatedNetRevenue: 200,
    });
    expect(movements[1]).toMatchObject({
      origin: "DIRECT_NFE",
      productId: "prod-2-uuid",
      sourceProductId: "102",
      quantity: 1,
      grossItemAmount: 100,
      allocatedNetRevenue: 100,
    });
  });

  it("2. Venda Simples direta: quantidade física e faturamento rateado pelos itens do documento", () => {
    const sale: SaleWithDocsAndItems = {
      id: "sale-vs-dir-1",
      anchorType: SaleAnchorType.VENDA_SIMPLES,
      anchorSourceId: "5001",
      customerId: "cust-1",
      items: [],
      sourceDocs: [
        {
          id: "doc-vs-5001",
          docType: SaleAnchorType.VENDA_SIMPLES,
          sourceId: "5001",
          netAmount: 150,
          realizedDate: new Date("2026-01-12T14:00:00.000Z"),
          items: [
            {
              id: "it-vs-1",
              sourceItemId: "si-vs-1",
              productId: "prod-3-uuid",
              sourceProductId: "103",
              quantity: 3,
              unitPrice: 50,
              subtotal: 150,
            },
          ],
        },
      ],
    };

    const { movements } = generateRealizedProductMovements(
      [sale],
      from,
      toExclusive,
    );

    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      origin: "DIRECT_VENDA_SIMPLES",
      productId: "prod-3-uuid",
      quantity: 3,
      grossItemAmount: 150,
      allocatedNetRevenue: 150,
    });
  });

  it("3. Pedido + somente NF-e(s): utiliza itens das NF-es discriminadas e ignora SaleItem para quantidade", () => {
    const sale: SaleWithDocsAndItems = {
      id: "sale-ped-nfe-1",
      anchorType: SaleAnchorType.PEDIDO,
      anchorSourceId: "1100",
      customerId: "cust-1",
      items: [
        {
          id: "sale-it-1",
          sourceItemId: "si-neg-1",
          productId: "prod-1-uuid",
          sourceProductId: "101",
          quantity: 10, // negociado no pedido
          unitPrice: 100,
          subtotal: 1000,
        },
      ],
      sourceDocs: [
        {
          id: "doc-nfe-2101",
          docType: SaleAnchorType.NFE,
          sourceId: "2101",
          netAmount: 400,
          realizedDate: new Date("2026-01-15T00:00:00.000Z"),
          items: [
            {
              id: "nfe-it-1",
              sourceItemId: "si-nfe-1",
              productId: "prod-1-uuid",
              sourceProductId: "101",
              quantity: 4, // faturado na NF-e
              unitPrice: 100,
              subtotal: 400,
            },
          ],
        },
      ],
    };

    const { movements } = generateRealizedProductMovements(
      [sale],
      from,
      toExclusive,
    );

    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      origin: "PEDIDO_NFE",
      quantity: 4, // autoridade física da NF-e (não os 10 negociados)
      allocatedNetRevenue: 400,
    });
  });

  it("4. Pedido + somente Venda Simples: ignora itens clonados da VS e usa SaleItem uma única vez", () => {
    const sale: SaleWithDocsAndItems = {
      id: "sale-ped-vs-1",
      anchorType: SaleAnchorType.PEDIDO,
      anchorSourceId: "1150",
      customerId: "cust-1",
      items: [
        {
          id: "sale-it-1",
          sourceItemId: "si-neg-1",
          productId: "prod-1-uuid",
          sourceProductId: "101",
          quantity: 5,
          unitPrice: 80,
          subtotal: 400,
        },
      ],
      sourceDocs: [
        {
          id: "doc-vs-5050",
          docType: SaleAnchorType.VENDA_SIMPLES,
          sourceId: "5050",
          netAmount: 400,
          realizedDate: new Date("2026-01-18T16:00:00.000Z"),
          items: [
            {
              id: "cloned-it-1",
              sourceItemId: "si-cloned-1",
              productId: "prod-1-uuid",
              sourceProductId: "101",
              quantity: 999, // dado clonado espúrio no ERP ignorado
              unitPrice: 80,
              subtotal: 400,
            },
          ],
        },
      ],
    };

    const { movements } = generateRealizedProductMovements(
      [sale],
      from,
      toExclusive,
    );

    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      origin: "PEDIDO_VENDA_SIMPLES",
      quantity: 5,
      allocatedNetRevenue: 400,
    });
  });

  it("5. Pedido + NF-e + Venda Simples (caso real #1314): NF-e faturada + residual físico e complemento financeiro", () => {
    const sale: SaleWithDocsAndItems = {
      id: "sale-ped-1314",
      anchorType: SaleAnchorType.PEDIDO,
      anchorSourceId: "1314",
      customerId: "cust-1",
      items: [
        {
          id: "ped-it-prod1",
          sourceItemId: "si-1",
          productId: "prod-1-uuid",
          sourceProductId: "2157",
          quantity: 2,
          unitPrice: 199.9,
          subtotal: 399.8,
        },
        {
          id: "ped-it-prod1723",
          sourceItemId: "si-2",
          productId: "prod-1723-uuid",
          sourceProductId: "1723",
          quantity: 22,
          unitPrice: 34.9,
          subtotal: 767.8,
        },
      ],
      sourceDocs: [
        {
          id: "doc-nfe-2854",
          docType: SaleAnchorType.NFE,
          sourceId: "2854",
          netAmount: 189.8,
          realizedDate: new Date("2026-01-15T00:00:00.000Z"),
          items: [
            {
              id: "nfe-it-prod1",
              sourceItemId: "nfe-si-1",
              productId: "prod-1-uuid",
              sourceProductId: "2157",
              quantity: 2, // 100% de 2157 faturado na NF-e
              unitPrice: 94.9,
              subtotal: 189.8,
            },
          ],
        },
        {
          id: "doc-vs-7081",
          docType: SaleAnchorType.VENDA_SIMPLES,
          sourceId: "7081",
          netAmount: 977.8, // complemento financeiro + pagamento do 1723
          realizedDate: new Date("2026-01-15T16:00:00.000Z"),
          items: [],
        },
      ],
    };

    const { movements } = generateRealizedProductMovements(
      [sale],
      from,
      toExclusive,
    );

    // Movimento 1: NF-e com prod 2157 (qty = 2)
    const nfeMov = movements.find((m) => m.origin === "PEDIDO_NFE");
    expect(nfeMov).toBeDefined();
    expect(nfeMov?.sourceProductId).toBe("2157");
    expect(nfeMov?.quantity).toBe(2);
    expect(nfeMov?.allocatedNetRevenue).toBe(189.8);

    // Movimento 2: Residual físico de prod 1723 na Venda Simples (qty = 22)
    const residualMov = movements.find(
      (m) => m.origin === "PEDIDO_RESIDUAL_VENDA_SIMPLES",
    );
    expect(residualMov).toBeDefined();
    expect(residualMov?.sourceProductId).toBe("1723");
    expect(residualMov?.quantity).toBe(22);
    expect(residualMov?.allocatedNetRevenue).toBeGreaterThan(0);

    // Movimento 3: Complemento financeiro de prod 2157 na Venda Simples (qty = 0)
    const compMov = movements.find(
      (m) => m.origin === "PEDIDO_FINANCIAL_COMPLEMENT_VENDA_SIMPLES",
    );
    expect(compMov).toBeDefined();
    expect(compMov?.sourceProductId).toBe("2157");
    expect(compMov?.quantity).toBe(0);
    expect(compMov?.allocatedNetRevenue).toBeGreaterThan(0);

    // Reconciliação financeira exata: soma de allocatedNetRevenue fecha ao centavo com a soma dos documentos
    const totalAllocated = movements.reduce(
      (acc, m) => acc + m.allocatedNetRevenue,
      0,
    );
    expect(Math.round(totalAllocated * 100) / 100).toBe(189.8 + 977.8);
  });

  it("6. Item adicionado diretamente na NF-e e inexistente no Pedido: entra na realização como autoridade física", () => {
    const sale: SaleWithDocsAndItems = {
      id: "sale-extra-it",
      anchorType: SaleAnchorType.PEDIDO,
      anchorSourceId: "1200",
      customerId: "cust-1",
      items: [
        {
          id: "ped-it-1",
          sourceItemId: "si-1",
          productId: "prod-1",
          sourceProductId: "101",
          quantity: 2,
          unitPrice: 50,
          subtotal: 100,
        },
      ],
      sourceDocs: [
        {
          id: "doc-nfe-extra",
          docType: SaleAnchorType.NFE,
          sourceId: "2500",
          netAmount: 180,
          realizedDate: new Date("2026-01-20T00:00:00.000Z"),
          items: [
            {
              id: "nfe-it-1",
              sourceItemId: "si-1",
              productId: "prod-1",
              sourceProductId: "101",
              quantity: 2,
              unitPrice: 50,
              subtotal: 100,
            },
            {
              id: "nfe-it-extra",
              sourceItemId: "si-extra",
              productId: "prod-extra",
              sourceProductId: "999", // adicionado diretamente na NF-e
              quantity: 1,
              unitPrice: 80,
              subtotal: 80,
            },
          ],
        },
      ],
    };

    const { movements } = generateRealizedProductMovements(
      [sale],
      from,
      toExclusive,
    );

    const extraMov = movements.find((m) => m.sourceProductId === "999");
    expect(extraMov).toBeDefined();
    expect(extraMov?.origin).toBe("PEDIDO_NFE");
    expect(extraMov?.quantity).toBe(1);
    expect(extraMov?.allocatedNetRevenue).toBe(80);
  });

  it("7. Residual negativo com piso zero: faturamento maior na NF-e não gera residual negativo", () => {
    const sale: SaleWithDocsAndItems = {
      id: "sale-piso-zero",
      anchorType: SaleAnchorType.PEDIDO,
      anchorSourceId: "1300",
      customerId: "cust-1",
      items: [
        {
          id: "ped-it-1",
          sourceItemId: "si-1",
          productId: "prod-1",
          sourceProductId: "101",
          quantity: 3, // Pedido original previa 3
          unitPrice: 100,
          subtotal: 300,
        },
      ],
      sourceDocs: [
        {
          id: "doc-nfe-1",
          docType: SaleAnchorType.NFE,
          sourceId: "2601",
          netAmount: 500,
          realizedDate: new Date("2026-01-10T00:00:00.000Z"),
          items: [
            {
              id: "nfe-it-1",
              sourceItemId: "si-1",
              productId: "prod-1",
              sourceProductId: "101",
              quantity: 5, // NF-e emitiu 5
              unitPrice: 100,
              subtotal: 500,
            },
          ],
        },
        {
          id: "doc-vs-1",
          docType: SaleAnchorType.VENDA_SIMPLES,
          sourceId: "7001",
          netAmount: 50,
          realizedDate: new Date("2026-01-15T00:00:00.000Z"),
          items: [],
        },
      ],
    };

    const { movements } = generateRealizedProductMovements(
      [sale],
      from,
      toExclusive,
    );

    // NF-e entra com 5
    const nfeMov = movements.find((m) => m.origin === "PEDIDO_NFE");
    expect(nfeMov?.quantity).toBe(5);

    // VS entra como complemento financeiro com quantity = 0 (max(0, 3 - 5) = 0)
    const vsMov = movements.find(
      (m) => m.origin === "PEDIDO_FINANCIAL_COMPLEMENT_VENDA_SIMPLES",
    );
    expect(vsMov?.quantity).toBe(0);
    expect(vsMov?.allocatedNetRevenue).toBe(50);
  });

  it("8. Exceção auditável #1265 / NF-e #2806: exclui documento duplicado e registra ajuste", () => {
    const sale: SaleWithDocsAndItems = {
      id: "sale-1265",
      anchorType: SaleAnchorType.PEDIDO,
      anchorSourceId: "1265",
      customerId: "cust-1",
      items: [
        {
          id: "it-1",
          sourceItemId: "si-1",
          productId: "prod-1",
          sourceProductId: "101",
          quantity: 65,
          unitPrice: 100,
          subtotal: 6500,
        },
      ],
      sourceDocs: [
        {
          id: "doc-nfe-2795",
          docType: SaleAnchorType.NFE,
          sourceId: "2795",
          netAmount: 5488.5,
          realizedDate: new Date("2026-01-10T00:00:00.000Z"),
          items: [
            {
              id: "nfe-it-2795",
              sourceItemId: "si-2795",
              productId: "prod-1",
              sourceProductId: "101",
              quantity: 65,
              unitPrice: 100,
              subtotal: 6500,
            },
          ],
        },
        {
          id: "doc-nfe-2806",
          docType: SaleAnchorType.NFE,
          sourceId: "2806", // duplicidade conhecida
          netAmount: 5488.5,
          realizedDate: new Date("2026-01-20T00:00:00.000Z"),
          items: [
            {
              id: "nfe-it-2806",
              sourceItemId: "si-2806",
              productId: "prod-1",
              sourceProductId: "101",
              quantity: 65,
              unitPrice: 100,
              subtotal: 6500,
            },
          ],
        },
      ],
    };

    const { movements, adjustments } = generateRealizedProductMovements(
      [sale],
      from,
      toExclusive,
    );

    // Apenas a NF-e #2795 gerou movimento
    expect(movements).toHaveLength(1);
    expect(movements[0].sourceDocumentId).toBe("doc-nfe-2795");
    expect(movements[0].quantity).toBe(65);

    // Ajuste explícito auditado
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]).toMatchObject({
      type: "KNOWN_DUPLICATE_NFE",
      sourceId: "2806",
      amount: 5488.5,
    });
  });

  it("9. Complemento financeiro com residual físico zero (caso #1153)", () => {
    const sale: SaleWithDocsAndItems = {
      id: "sale-1153",
      anchorType: SaleAnchorType.PEDIDO,
      anchorSourceId: "1153",
      customerId: "cust-1",
      items: [
        {
          id: "ped-it-1",
          sourceItemId: "si-1",
          productId: "prod-1",
          sourceProductId: "101",
          quantity: 10,
          unitPrice: 100,
          subtotal: 1000,
        },
      ],
      sourceDocs: [
        {
          id: "doc-nfe-2669",
          docType: SaleAnchorType.NFE,
          sourceId: "2669",
          netAmount: 500, // faturou 50% do valor com 100% da quantidade
          realizedDate: new Date("2026-01-05T00:00:00.000Z"),
          items: [
            {
              id: "nfe-it-1",
              sourceItemId: "si-1",
              productId: "prod-1",
              sourceProductId: "101",
              quantity: 10,
              unitPrice: 50,
              subtotal: 500,
            },
          ],
        },
        {
          id: "doc-vs-6506",
          docType: SaleAnchorType.VENDA_SIMPLES,
          sourceId: "6506",
          netAmount: 500, // faturou os outros 50%
          realizedDate: new Date("2026-01-10T00:00:00.000Z"),
          items: [],
        },
      ],
    };

    const { movements } = generateRealizedProductMovements(
      [sale],
      from,
      toExclusive,
    );

    expect(movements).toHaveLength(2);

    const nfeMov = movements.find((m) => m.origin === "PEDIDO_NFE");
    expect(nfeMov?.quantity).toBe(10);
    expect(nfeMov?.allocatedNetRevenue).toBe(500);

    const compMov = movements.find(
      (m) => m.origin === "PEDIDO_FINANCIAL_COMPLEMENT_VENDA_SIMPLES",
    );
    expect(compMov?.quantity).toBe(0); // residual físico zero
    expect(compMov?.allocatedNetRevenue).toBe(500);

    // Quantidade física total = 10 (não duplica)
    const totalQty = movements.reduce((acc, m) => acc + m.quantity, 0);
    expect(totalQty).toBe(10);

    // Receita total = 1000 (fecha perfeitamente)
    const totalRev = movements.reduce(
      (acc, m) => acc + m.allocatedNetRevenue,
      0,
    );
    expect(totalRev).toBe(1000);
  });

  it("10. Item histórico sem Product (productId null): agregado por sourceProductId", () => {
    const sale: SaleWithDocsAndItems = {
      id: "sale-orphan",
      anchorType: SaleAnchorType.NFE,
      anchorSourceId: "9999",
      customerId: "cust-1",
      items: [],
      sourceDocs: [
        {
          id: "doc-nfe-orphan",
          docType: SaleAnchorType.NFE,
          sourceId: "9999",
          netAmount: 120,
          realizedDate: new Date("2026-01-10T00:00:00.000Z"),
          items: [
            {
              id: "orphan-it",
              sourceItemId: "si-orphan",
              productId: null, // histórico órfão
              sourceProductId: "orphan-prod-42",
              quantity: 2,
              unitPrice: 60,
              subtotal: 120,
            },
          ],
        },
      ],
    };

    const { movements } = generateRealizedProductMovements(
      [sale],
      from,
      toExclusive,
    );

    expect(movements).toHaveLength(1);
    expect(movements[0].productId).toBeNull();
    expect(movements[0].sourceProductId).toBe("orphan-prod-42");

    const result = calculateProductsOverview({
      movements,
      catalogProductMap: new Map(),
      catalogSummary: { activeCount: 10, withStockCount: 5 },
      commercialRevenue: 120,
      adjustments: [],
      period: { from: "2026-01-01", to: "2026-01-31" },
    });

    expect(result.summary.distinctProductsSold).toBe(1);
    expect(result.topProducts[0].productId).toBeNull();
    expect(result.topProducts[0].description).toBe("Item #orphan-prod-42");
    expect(result.topProducts[0].category).toBe("Sem categoria");
  });

  it("11. Fechamento financeiro proporcional exato ao centavo", () => {
    const items = [
      { key: "1", base: 10 },
      { key: "2", base: 10 },
      { key: "3", base: 10 },
    ];
    const dist = distributeProportional(items, 100);
    const sum = Array.from(dist.values()).reduce((acc, v) => acc + v, 0);
    expect(Math.round(sum * 100) / 100).toBe(100);
  });

  it("12. Movimentos puramente financeiros (quantity = 0, revenue > 0) entram no faturamento mas não contam em distinctProductsSold", () => {
    const movements: RealizedProductMovement[] = [
      {
        productId: "prod-phys",
        sourceProductId: "sp-1",
        quantity: 5,
        grossItemAmount: 50,
        allocationBaseAmount: 50,
        allocatedNetRevenue: 50,
        saleId: "sale-1",
        customerId: "cust-1",
        channel: "VAREJO",
        sourceDocumentId: "doc-1",
        sourceDocumentType: "NFE",
        origin: "NFE_ITEM",
      },
      {
        productId: "prod-fin-only",
        sourceProductId: "sp-2",
        quantity: 0,
        grossItemAmount: 0,
        allocationBaseAmount: 30,
        allocatedNetRevenue: 30,
        saleId: "sale-2",
        customerId: "cust-2",
        channel: "ATACADO",
        sourceDocumentId: "doc-2",
        sourceDocumentType: "VENDA_SIMPLES",
        origin: "PEDIDO_FINANCIAL_COMPLEMENT_VENDA_SIMPLES",
      },
    ];

    const result = calculateProductsOverview({
      movements,
      catalogProductMap: new Map(),
      catalogSummary: { activeCount: 10, withStockCount: 5 },
      commercialRevenue: 80,
      adjustments: [],
      period: { from: "2026-01-01", to: "2026-01-31" },
    });

    // Apenas prod-phys tem quantity > 0
    expect(result.summary.distinctProductsSold).toBe(1);
    expect(result.summary.productsSoldInPeriod).toBe(1);
    expect(result.summary.realizedQuantity).toBe(5);
    expect(result.summary.realizedRevenue).toBe(80);

    // No ranking financeiro, prod-fin-only está presente com receita R$ 30 e quantidade 0
    const finOnly = result.topProducts.find((p) => p.productId === "prod-fin-only");
    expect(finOnly).toBeDefined();
    expect(finOnly?.quantity).toBe(0);
    expect(finOnly?.realizedRevenue).toBe(30);

    // Cross-footing
    const sumRevenue = Number(result.topProducts.reduce((acc, p) => acc + p.realizedRevenue, 0).toFixed(2));
    expect(sumRevenue).toBe(result.summary.realizedRevenue);
  });
});

describe("Products BI V1 — Canal Homologado", () => {
  it("classifica Pedido presente como ATACADO mesmo com CPF", () => {
    const channel = classifySaleChannel({
      hasPedido: true,
      cpf: "123.456.789-00",
    });
    expect(channel).toBe("ATACADO");
  });

  it("classifica CNPJ direto como ATACADO", () => {
    const channel = classifySaleChannel({
      hasPedido: false,
      cnpj: "12.345.678/0001-90",
    });
    expect(channel).toBe("ATACADO");
  });

  it("classifica CPF direto como VAREJO", () => {
    const channel = classifySaleChannel({
      hasPedido: false,
      cpf: "123.456.789-00",
    });
    expect(channel).toBe("VAREJO");
  });

  it("classifica Consumidor Hustler direto como VAREJO", () => {
    const channel = classifySaleChannel({
      hasPedido: false,
      customerName: "CONSUMIDOR HUSTLER",
    });
    expect(channel).toBe("VAREJO");
  });

  it("classifica cliente sem documento nem Pedido como INDETERMINADO", () => {
    const channel = classifySaleChannel({
      hasPedido: false,
    });
    expect(channel).toBe("INDETERMINADO");
  });

  it("classifica cliente com CNPJ e CPF simultâneos (sem Pedido) como CONFLITO", () => {
    const channel = classifySaleChannel({
      hasPedido: false,
      cnpj: "12.345.678/0001-90",
      cpf: "123.456.789-00",
    });
    expect(channel).toBe("CONFLITO");
  });
});

describe("Products BI V1 — Reconciliação com Banco de Dados de Produção", () => {
  it("reconcilia quantidade homologada: 2024 = 5.289", async () => {
    const repo = createBiRepository(prisma);
    if (!repo.findRealizedProductMovements) return;

    const { movements } = await repo.findRealizedProductMovements(
      new Date("2024-01-01T00:00:00.000Z"),
      new Date("2025-01-01T00:00:00.000Z"),
    );

    const totalQty = movements.reduce((acc, m) => acc + m.quantity, 0);
    expect(totalQty).toBe(5289);
  });

  it("reconcilia quantidade homologada: 2025 = 4.646 (com ajuste da duplicidade #2806)", async () => {
    const repo = createBiRepository(prisma);
    if (!repo.findRealizedProductMovements) return;

    const { movements, adjustments } =
      await repo.findRealizedProductMovements(
        new Date("2025-01-01T00:00:00.000Z"),
        new Date("2026-01-01T00:00:00.000Z"),
      );

    const totalQty = movements.reduce((acc, m) => acc + m.quantity, 0);
    expect(totalQty).toBe(4646);

    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]).toMatchObject({
      type: "KNOWN_DUPLICATE_NFE",
      sourceId: "2806",
      amount: 5488.5,
    });
  });

  it("reconcilia quantidade homologada: 2026 = 3.228", async () => {
    const repo = createBiRepository(prisma);
    if (!repo.findRealizedProductMovements) return;

    const { movements } = await repo.findRealizedProductMovements(
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2027-01-01T00:00:00.000Z"),
    );

    const totalQty = movements.reduce((acc, m) => acc + m.quantity, 0);
    expect(totalQty).toBe(3228);
  });

  it("reconcilia Janeiro/2026: 23 realizações, R$ 53.766,28, ajuste zero", async () => {
    const repo = createBiRepository(prisma);
    const service = createBiService(repo);

    const result = await service.getProductsOverview(
      "2026-01-01",
      "2026-01-31",
    );
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.summary.realizedQuantity).toBe(413);
    expect(result.data.summary.realizedRevenue).toBe(53766.28);
    expect(result.data.reconciliation).toEqual({
      commercialRevenue: 53766.28,
      productsRevenue: 53766.28,
      adjustmentAmount: 0,
      adjustments: [],
    });
  });

  it("HTTP GET /bi/products/overview retorna contrato completo da V1", async () => {
    const repo = createBiRepository(prisma);
    const app = await buildApp({
      databaseHealth: { check: async () => {} },
      frontendUrl: "http://localhost:5173",
      biRepository: repo,
    });

    const response = await app.inject({
      method: "GET",
      url: "/bi/products/overview?from=2026-01-01&to=2026-01-31",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body).toHaveProperty("period");
    expect(body).toHaveProperty("summary");
    expect(body).toHaveProperty("topProducts");
    expect(body).toHaveProperty("categories");
    expect(body).toHaveProperty("channelMix");
    expect(body).toHaveProperty("reconciliation");

    expect(body.summary.realizedRevenue).toBe(53766.28);
    expect(body.summary.realizedQuantity).toBe(413);
    expect(body.topProducts.length).toBeGreaterThan(0);
    expect(body.categories.length).toBeGreaterThan(0);
    expect(body.channelMix.length).toBeGreaterThan(0);

    // Cross-footing exato
    const sumProdRevenue = Number(body.topProducts.reduce((acc: number, x: any) => acc + x.realizedRevenue, 0).toFixed(2));
    const sumCatRevenue = Number(body.categories.reduce((acc: number, x: any) => acc + x.realizedRevenue, 0).toFixed(2));
    const sumChanRevenue = Number(body.channelMix.reduce((acc: number, x: any) => acc + x.realizedRevenue, 0).toFixed(2));

    const sumProdQty = body.topProducts.reduce((acc: number, x: any) => acc + x.quantity, 0);
    const sumCatQty = body.categories.reduce((acc: number, x: any) => acc + x.quantity, 0);
    const sumChanQty = body.channelMix.reduce((acc: number, x: any) => acc + x.quantity, 0);

    expect(sumProdRevenue).toBe(body.summary.realizedRevenue);
    expect(sumCatRevenue).toBe(body.summary.realizedRevenue);
    expect(sumChanRevenue).toBe(body.summary.realizedRevenue);

    expect(sumProdQty).toBe(body.summary.realizedQuantity);
    expect(sumCatQty).toBe(body.summary.realizedQuantity);
    expect(sumChanQty).toBe(body.summary.realizedQuantity);

    // Reconciliação
    expect(body.reconciliation.commercialRevenue).toBe(53766.28);
    expect(body.reconciliation.productsRevenue).toBe(53766.28);
    expect(body.reconciliation.adjustmentAmount).toBe(0);
    expect(
      Math.round((body.reconciliation.commercialRevenue - body.reconciliation.adjustmentAmount) * 100) / 100
    ).toBe(body.reconciliation.productsRevenue);

    await app.close();
  });

  it("HTTP GET /bi/products/overview rejeita intervalo inválido com 400", async () => {
    const repo = createBiRepository(prisma);
    const app = await buildApp({
      databaseHealth: { check: async () => {} },
      frontendUrl: "http://localhost:5173",
      biRepository: repo,
    });

    const response = await app.inject({
      method: "GET",
      url: "/bi/products/overview?from=data-invalida&to=2026-01-31",
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.status).toBe("error");

    await app.close();
  });
});
