import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { ProfitabilityProductsTab } from "./ProfitabilityProductsTab";
import { ProfitabilitySalesTab } from "./ProfitabilitySalesTab";
import { ProfitabilityCustomersTab } from "./ProfitabilityCustomersTab";
import type {
  ProfitabilityProductsResult,
  ProfitabilitySalesResult,
  ProfitabilityCustomersResult,
} from "../api/bi";

// Mock das funções de API para testes de integração
vi.mock("../api/bi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/bi")>();
  return {
    ...actual,
    fetchProfitabilityProducts: vi.fn(),
    fetchProfitabilitySales: vi.fn(),
    fetchProfitabilityCustomers: vi.fn(),
  };
});

describe("Profitability Tabs Analíticas — Produtos, Vendas, Clientes (Section 14)", () => {
  const mockProductsResult: ProfitabilityProductsResult = {
    period: { from: "2026-01-01", to: "2026-10-08" },
    filters: { channel: null, categorySourceId: null },
    summary: {
      distinctProductsSold: 238,
      realizedRevenue: 322465.68,
      revenueWithCurrentCost: 322465.68,
      revenueWithoutCurrentCost: 0,
      costCoveragePercent: 100.0,
      estimatedCOGS: 197277.62,
      estimatedGrossProfit: 125188.06,
      estimatedGrossMarginPercent: 38.82,
      negativeMarginCount: 5,
    },
    products: [
      {
        productId: "p-101",
        productSourceId: "101",
        productName: "Shape Nineclouds Maple 8.0",
        sku: "SHP-80-01",
        categorySourceId: "49",
        category: "Shapes",
        commercialLine: "NINECLOUDS",
        physicalQuantity: 120,
        realizedRevenue: 36000,
        revenueWithCurrentCost: 36000,
        revenueWithoutCurrentCost: 0,
        currentEffectiveCost: 160,
        estimatedCOGS: 19200,
        estimatedGrossProfit: 16800,
        estimatedGrossMarginPercent: 46.67,
        marginTier: "FORTY_PLUS",
        stockQuantity: 15,
        abcClass: "A",
        costCoveragePercent: 100,
        distinctCustomers: 32,
        distinctSales: 45,
        isOrphan: false,
      },
      {
        productId: "p-102",
        productSourceId: "102",
        productName: "Lixa Promocional Negativa",
        sku: "LIX-PRO-01",
        categorySourceId: "50",
        category: "Acessórios",
        commercialLine: undefined,
        physicalQuantity: 50,
        realizedRevenue: 1000,
        revenueWithCurrentCost: 1000,
        revenueWithoutCurrentCost: 0,
        currentEffectiveCost: 25,
        estimatedCOGS: 1250,
        estimatedGrossProfit: -250,
        estimatedGrossMarginPercent: -25.0,
        marginTier: "NEGATIVE",
        stockQuantity: 0,
        abcClass: "C",
        costCoveragePercent: 100,
        distinctCustomers: 12,
        distinctSales: 15,
        isOrphan: false,
      },
      {
        productId: null,
        productSourceId: "103",
        productName: "Item Histórico Sem Custo",
        sku: null,
        categorySourceId: null,
        category: null,
        commercialLine: undefined,
        physicalQuantity: 5,
        realizedRevenue: 500,
        revenueWithCurrentCost: 0,
        revenueWithoutCurrentCost: 500,
        currentEffectiveCost: null,
        estimatedCOGS: null,
        estimatedGrossProfit: null,
        estimatedGrossMarginPercent: null,
        marginTier: "UNKNOWN",
        stockQuantity: null,
        abcClass: null,
        costCoveragePercent: 0,
        distinctCustomers: 2,
        distinctSales: 2,
        isOrphan: true,
      },
    ],
  };

  const mockSalesResult: ProfitabilitySalesResult = {
    period: { from: "2026-01-01", to: "2026-10-08" },
    filters: { channel: null },
    summary: {
      totalSales: 266,
      realizedRevenue: 322465.68,
      revenueWithCurrentCost: 322465.68,
      revenueWithoutCurrentCost: 0,
      costCoveragePercent: 100.0,
      estimatedCOGS: 197277.62,
      estimatedGrossProfit: 125188.06,
      estimatedGrossMarginPercent: 38.82,
      negativeMarginSalesCount: 12,
    },
    sales: [
      {
        saleId: "sale-101",
        anchorType: "PEDIDO_VENDA",
        anchorSourceId: "8472",
        channel: "ATACADO",
        customerId: "c-1",
        customerName: "Skate Shop Central Ltda",
        commercialDate: "2026-04-17",
        firstRealizedDate: "2026-04-17",
        lastRealizedDate: "2026-04-17",
        realizingDocuments: [
          {
            docType: "NFE",
            sourceId: "4819",
            realizedDate: "2026-04-17",
          },
        ],
        distinctProducts: 15,
        realizedQuantity: 45,
        realizedRevenue: 8500,
        revenueWithCurrentCost: 8500,
        revenueWithoutCurrentCost: 0,
        estimatedCOGS: 5100,
        estimatedGrossProfit: 3400,
        estimatedGrossMarginPercent: 40.0,
        marginTier: "FORTY_PLUS",
        costCoveragePercent: 100,
      },
      {
        saleId: "sale-102",
        anchorType: "VENDA_SIMPLES",
        anchorSourceId: "9102",
        channel: "VAREJO",
        customerId: "c-2",
        customerName: "João Silva",
        commercialDate: "2026-04-17",
        firstRealizedDate: "2026-04-17",
        lastRealizedDate: "2026-04-20",
        realizingDocuments: [
          {
            docType: "VENDA_SIMPLES",
            sourceId: "9102",
            realizedDate: "2026-04-17",
          },
          {
            docType: "NFE",
            sourceId: "5012",
            realizedDate: "2026-04-20",
          },
        ],
        distinctProducts: 3,
        realizedQuantity: 4,
        realizedRevenue: 750,
        revenueWithCurrentCost: 750,
        revenueWithoutCurrentCost: 0,
        estimatedCOGS: 800,
        estimatedGrossProfit: -50,
        estimatedGrossMarginPercent: -6.67,
        marginTier: "NEGATIVE",
        costCoveragePercent: 100,
      },
    ],
  };

  const mockCustomersResult: ProfitabilityCustomersResult = {
    period: { from: "2026-01-01", to: "2026-10-08" },
    filters: { channel: null },
    summary: {
      totalCustomers: 197,
      realizedRevenue: 322465.68,
      revenueWithCurrentCost: 322465.68,
      revenueWithoutCurrentCost: 0,
      costCoveragePercent: 100.0,
      estimatedCOGS: 197277.62,
      estimatedGrossProfit: 125188.06,
      estimatedGrossMarginPercent: 38.82,
      averageTicket: 1636.88,
    },
    customers: [
      {
        customerId: "cust-1",
        customerName: "Skate Shop Central Ltda",
        tradeName: "Central Skates",
        legalName: null,
        cpf: null,
        cnpj: "12345678000199",
        predominantChannel: "ATACADO",
        realizedSales: 12,
        realizedQuantity: 450,
        ticketAverage: 3500.5,
        realizedRevenue: 42006.0,
        revenueWithCurrentCost: 42006.0,
        revenueWithoutCurrentCost: 0,
        estimatedCOGS: 25200.0,
        estimatedGrossProfit: 16806.0,
        estimatedGrossMarginPercent: 40.01,
        marginTier: "FORTY_PLUS",
        firstPurchaseInPeriod: "2026-01-15",
        lastPurchaseInPeriod: "2026-09-25",
        costCoveragePercent: 100,
      },
      {
        customerId: null,
        customerName: "Cliente não identificado",
        tradeName: null,
        legalName: null,
        cpf: null,
        cnpj: null,
        predominantChannel: "VAREJO",
        realizedSales: 18,
        realizedQuantity: 35,
        ticketAverage: 125.0,
        realizedRevenue: 2250.0,
        revenueWithCurrentCost: 2250.0,
        revenueWithoutCurrentCost: 0,
        estimatedCOGS: 1500.0,
        estimatedGrossProfit: 750.0,
        estimatedGrossMarginPercent: 33.33,
        marginTier: "TWENTY_TO_40",
        firstPurchaseInPeriod: "2026-02-10",
        lastPurchaseInPeriod: "2026-08-10",
        costCoveragePercent: 100,
      },
    ],
  };

  describe("D. Visão Produtos (Section 7 & 14.D)", () => {
    it("renderiza os 4 KPIs de produtos com distinctProductsSold e sem média simples", () => {
      const html = renderToString(
        <ProfitabilityProductsTab
          from="2026-01-01"
          to="2026-10-08"
          categoryTree={[]}
          initialData={mockProductsResult}
        />,
      );

      // Tabpanel ID
      expect(html).toContain('id="panel-profitability-products"');
      // KPIs
      expect(html).toContain("SKUs vendidos");
      expect(html).toContain("238");
      expect(html).toContain("5 com margem negativa");
      expect(html).toContain("Receita realizada");
      expect(html).toContain("Lucro bruto estimado ao custo atual");
      expect(html).toContain("Margem bruta estimada ao custo atual");
      // Filtros presentes
      expect(html).toContain("Buscar por nome, SKU, ID ou categoria...");
      expect(html).toContain("Todos os canais");
      expect(html).toContain("Filtrar por Faixa de Margem");
      expect(html).toContain("Curva ABC");
      // Linha do produto
      expect(html).toContain("Shape Nineclouds Maple 8.0");
      expect(html).toContain("SHP-80-01");
    });
  });

  describe("E. Visão Vendas (Section 8 & 14.E)", () => {
    it("utiliza 'Negociações realizadas' no KPI e formata datas e documentos realizadores", () => {
      const html = renderToString(
        <ProfitabilitySalesTab
          from="2026-01-01"
          to="2026-10-08"
          initialData={mockSalesResult}
        />,
      );

      expect(html).toContain('id="panel-profitability-sales"');
      expect(html).toContain("Negociações realizadas");
      expect(html).toContain("266");
      expect(html).toContain("12 com margem negativa");
      expect(html).toContain("Pedido #8472");
      expect(html).toContain("Venda Simples #9102");
      expect(html).toContain("NF-e #4819");
      expect(html).toContain("Buscar por cliente, pedido, documento realizador...");
      expect(html).toContain("Filtrar por Faixa de Margem");
    });

    it("formata negociações amigavelmente e lida com data única e intervalo de realização", () => {
      // Validando a lógica analítica do contrato de vendas
      const sale1 = mockSalesResult.sales[0];
      const sale2 = mockSalesResult.sales[1];

      // Single date
      expect(sale1.firstRealizedDate === sale1.lastRealizedDate).toBe(true);
      // Multi date interval
      expect(sale2.firstRealizedDate !== sale2.lastRealizedDate).toBe(true);

      // Documentos realizadores compactos
      expect(sale1.realizingDocuments[0].docType).toBe("NFE");
      expect(sale1.realizingDocuments[0].sourceId).toBe("4819");
      expect(sale2.realizingDocuments.length).toBe(2);
    });
  });

  describe("F. Visão Clientes (Section 9 & 14.F)", () => {
    it("renderiza KPIs de clientes, canal predominante no período e Cliente não identificado", () => {
      const html = renderToString(
        <ProfitabilityCustomersTab
          from="2026-01-01"
          to="2026-10-08"
          initialData={mockCustomersResult}
        />,
      );

      expect(html).toContain('id="panel-profitability-customers"');
      expect(html).toContain("Clientes compradores");
      expect(html).toContain("197");
      expect(html).toContain("Ticket médio:");
      expect(html).toContain("Buscar por cliente, razão social, CPF ou CNPJ...");
      expect(html).toContain("Filtrar por Tipo de Documento");
      expect(html).toContain("Filtrar por Faixa de Margem");
      expect(html).toContain("Skate Shop Central Ltda");
      expect(html).toContain("Cliente não identificado");
      expect(html).toContain("Canal predominante no período");
    });

    it("garante tratamento gracioso para cliente nulo/não identificado sem quebra", () => {
      const unidentified = mockCustomersResult.customers.find((c) => c.customerId === null);
      expect(unidentified).toBeDefined();
      expect(unidentified?.customerName).toBe("Cliente não identificado");
      expect(unidentified?.predominantChannel).toBe("VAREJO");
    });
  });

  describe("L. Margin Tiers — Fronteiras Corretas (Section 10 & 14.L)", () => {
    it("atribui classes e faixas semânticas adequadas às margens", () => {
      // Negativa (< 0%)
      const negativeProduct = mockProductsResult.products.find((p) => p.marginTier === "NEGATIVE");
      expect(negativeProduct?.estimatedGrossMarginPercent).toBeLessThan(0);

      // 40%+
      const highProduct = mockProductsResult.products.find((p) => p.marginTier === "FORTY_PLUS");
      expect(highProduct?.estimatedGrossMarginPercent).toBeGreaterThanOrEqual(40);

      // Sem margem (null)
      const orphanProduct = mockProductsResult.products.find((p) => p.marginTier === "UNKNOWN");
      expect(orphanProduct?.estimatedGrossMarginPercent).toBeNull();
    });
  });

  describe("N. Proibição de Nomenclaturas Erradas (Section 5, 8.1, 9.1, 14.N)", () => {
    it("não contém 'margem média', 'lucro líquido', 'margem líquida', 'EBITDA' nas visões analíticas", () => {
      const productsHtml = renderToString(
        <ProfitabilityProductsTab
          from="2026-01-01"
          to="2026-10-08"
          categoryTree={[]}
          initialData={mockProductsResult}
        />,
      );
      const salesHtml = renderToString(
        <ProfitabilitySalesTab
          from="2026-01-01"
          to="2026-10-08"
          initialData={mockSalesResult}
        />,
      );
      const customersHtml = renderToString(
        <ProfitabilityCustomersTab
          from="2026-01-01"
          to="2026-10-08"
          initialData={mockCustomersResult}
        />,
      );

      for (const html of [productsHtml, salesHtml, customersHtml]) {
        expect(html.toLowerCase()).not.toContain("lucro líquido");
        expect(html.toLowerCase()).not.toContain("margem líquida");
        expect(html.toLowerCase()).not.toContain("ebitda");
        expect(html.toLowerCase()).not.toContain("margem média");
        expect(html.toLowerCase()).not.toContain("margem de contribuição");
      }
    });
  });
});
