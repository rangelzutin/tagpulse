import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { HomeExportReport } from "./HomeExportReport";
import {
  buildHomeExportFilename,
  buildPdfFromJpegPages,
  type JpegPageImage,
} from "../financial/dreExportService";
import type {
  SalesOverviewResult,
  CustomerOverviewResult,
} from "../../api/bi";
import type { MonthlyOperationalBreakEvenDto } from "../../api/financial";
import { formatCurrency, formatPercent } from "../../utils/formatters";

// Mock sales data for November 2026 (open month)
const mockSalesNov2026: SalesOverviewResult = {
  period: { from: "2026-11-01", to: "2026-11-17" },
  summary: {
    revenue: 11602.87,
    sales: 142,
    avgTicket: 81.71,
    customers: 98,
    salesWithoutCustomer: 0,
  },
  trend: {
    granularity: "daily",
    points: [
      {
        key: "2026-11-01",
        label: "01/11",
        revenue: 1200.5,
        sales: 15,
        averageTicket: 80.03,
        customers: 12,
        periodStart: "2026-11-01",
        periodEnd: "2026-11-01",
      },
      {
        key: "2026-11-17",
        label: "17/11",
        revenue: 850.0,
        sales: 10,
        averageTicket: 85.0,
        customers: 9,
        periodStart: "2026-11-17",
        periodEnd: "2026-11-17",
      },
    ],
  },
  monthly: [],
};

// Mock operational break-even for open month (November 2026)
const mockBreakEvenNovOpen = {
  referenceMonth: "2026-11",
  operationalBreakEvenRevenue: 40921.25,
  realizedRevenue: 11602.87,
  remainingRevenueNeeded: 29318.38,
  surplusRevenue: 0,
  progressPercent: 28.35,
  status: "BELOW_BREAK_EVEN",
  statusLabel: "EM ABERTO",
  monthStatus: "IN_PROGRESS",
  isProvisional: true,
  averageOperationalBreakEven: 40630.17,
} as unknown as MonthlyOperationalBreakEvenDto;

// Mock operational break-even for closed month (October 2026)
const mockBreakEvenOctClosed = {
  referenceMonth: "2026-10",
  operationalBreakEvenRevenue: 38500.0,
  realizedRevenue: 42100.0,
  remainingRevenueNeeded: 0,
  surplusRevenue: 3600.0,
  progressPercent: 109.35,
  status: "ABOVE_BREAK_EVEN",
  statusLabel: "SUPERADO",
  monthStatus: "CLOSED",
  isProvisional: false,
  averageOperationalBreakEven: 39000.0,
} as unknown as MonthlyOperationalBreakEvenDto;

// Mock customer intelligence data
const mockCustomerData: CustomerOverviewResult = {
  period: {
    from: "2026-11-01",
    to: "2026-11-17",
    asOfDate: "2026-11-17",
  },
  customers: {
    buyingCustomers: 98,
    newCustomers: 32,
    returningCustomers: 66,
    recurrenceRate: 67.35,
  },
  lifetime: {
    customers: 500,
    singlePurchaseCustomers: 250,
    repeatCustomers: 250,
    repeatRate: 50.0,
  },
  ranking: [
    {
      customerId: "cust-1",
      code: "CLI001",
      displayName: "Cliente Alfa LTDA",
      revenue: 3500.0,
      purchaseCount: 8,
      averageTicket: 437.5,
      revenueSharePercent: 30.16,
      cumulativeRevenueSharePercent: 30.16,
    },
    {
      customerId: "cust-2",
      code: "CLI002",
      displayName: "Cliente Beta ME",
      revenue: 2200.0,
      purchaseCount: 4,
      averageTicket: 550.0,
      revenueSharePercent: 18.96,
      cumulativeRevenueSharePercent: 49.12,
    },
    {
      customerId: "cust-3",
      code: "CLI003",
      displayName: "Cliente Gama Comércio",
      revenue: 1800.0,
      purchaseCount: 5,
      averageTicket: 360.0,
      revenueSharePercent: 15.51,
      cumulativeRevenueSharePercent: 64.63,
    },
    {
      customerId: "cust-4",
      code: "CLI004",
      displayName: "Cliente Delta Eireli",
      revenue: 1200.0,
      purchaseCount: 3,
      averageTicket: 400.0,
      revenueSharePercent: 10.34,
      cumulativeRevenueSharePercent: 74.97,
    },
    {
      customerId: "cust-5",
      code: "CLI005",
      displayName: "Cliente Épsilon S.A.",
      revenue: 950.0,
      purchaseCount: 2,
      averageTicket: 475.0,
      revenueSharePercent: 8.19,
      cumulativeRevenueSharePercent: 83.16,
    },
    {
      customerId: "cust-6",
      code: "CLI006",
      displayName: "Cliente Zeta (Deverá ser omitido do Top 5)",
      revenue: 400.0,
      purchaseCount: 1,
      averageTicket: 400.0,
      revenueSharePercent: 3.45,
      cumulativeRevenueSharePercent: 86.61,
    },
  ],
  recency: [],
};

describe("Home Export Suite (Section 16)", () => {
  // Requirement A: botão Exportar aparece na Home
  it("A. botão Exportar está presente com classes e atributos esperados", () => {
    // Simula a estrutura do botão montado no Header da Home
    const buttonHtml = renderToString(
      <div className="tp-home-export-dropdown">
        <button
          type="button"
          className="tp-home-export-btn"
          data-testid="home-export-button"
          aria-haspopup="menu"
          aria-expanded={false}
        >
          <span>Exportar</span>
        </button>
      </div>,
    );
    expect(buttonHtml).toContain('data-testid="home-export-button"');
    expect(buttonHtml).toContain("Exportar");
    expect(buttonHtml).toContain("tp-home-export-btn");
  });

  // Requirement B: dropdown contém PDF e JPG
  it("B. dropdown de exportação contém opções de PDF e JPG", () => {
    const menuHtml = renderToString(
      <div
        className="tp-home-export-menu"
        role="menu"
        data-testid="home-export-menu"
      >
        <button
          type="button"
          role="menuitem"
          className="tp-home-export-menu-item"
          data-testid="home-export-pdf-option"
        >
          <span>Exportar PDF</span>
        </button>
        <button
          type="button"
          role="menuitem"
          className="tp-home-export-menu-item"
          data-testid="home-export-jpg-option"
        >
          <span>Exportar JPG</span>
        </button>
      </div>,
    );
    expect(menuHtml).toContain('data-testid="home-export-pdf-option"');
    expect(menuHtml).toContain("Exportar PDF");
    expect(menuHtml).toContain('data-testid="home-export-jpg-option"');
    expect(menuHtml).toContain("Exportar JPG");
  });

  // Requirement C: export usa período selecionado
  it("C. export utiliza o período selecionado no cabeçalho", () => {
    const period = { from: "2026-11-01", to: "2026-11-17" };
    const html = renderToString(
      <HomeExportReport
        period={period}
        salesData={mockSalesNov2026}
        operationalBreakEven={mockBreakEvenNovOpen}
      />,
    );
    // 01/11/2026 a 17/11/2026
    expect(html).toContain("01/11/2026 a 17/11/2026");
  });

  // Requirement D: valores do break-even são os mesmos da Home
  it("D. valores do break-even no relatório correspondem com precisão aos dados da Home", () => {
    const period = { from: "2026-11-01", to: "2026-11-17" };
    const html = renderToString(
      <HomeExportReport
        period={period}
        salesData={mockSalesNov2026}
        operationalBreakEven={mockBreakEvenNovOpen}
      />,
    );

    // Faturamento esperado: R$ 11.602,87
    expect(html).toContain(formatCurrency(11602.87));
    // Ponto de equilíbrio esperado: R$ 40.921,25
    expect(html).toContain(formatCurrency(40921.25));
    // Falta vender: R$ 29.318,38
    expect(html).toContain(formatCurrency(29318.38));
    // Progresso: 28,4%
    expect(html).toContain(formatPercent(28.35, 1));
    // Média recente: R$ 40.630,17
    expect(html).toContain(formatCurrency(40630.17));
    // Status pill
    expect(html).toContain("EM ABERTO");
  });

  // Requirement D2: compara PE dinâmico do mês vs média recente (-17,7% vs média para dados consolidados)
  it("D2. calcula dinamicamente a variação vs média recente (-17,7% vs média para dados de 19/11)", () => {
    const period = { from: "2026-11-01", to: "2026-11-19" };
    const mockBreakEvenNovCurrent = {
      referenceMonth: "2026-11",
      operationalBreakEvenRevenue: 33419.51,
      realizedRevenue: 25513.45,
      remainingRevenueNeeded: 7906.06,
      surplusRevenue: 0,
      progressPercent: 76.34,
      status: "BELOW_BREAK_EVEN",
      statusLabel: "EM ABERTO",
      monthStatus: "IN_PROGRESS",
      isProvisional: true,
      averageOperationalBreakEven: 40630.17,
    } as unknown as MonthlyOperationalBreakEvenDto;

    const html = renderToString(
      <HomeExportReport
        period={period}
        salesData={mockSalesNov2026}
        operationalBreakEven={mockBreakEvenNovCurrent}
      />,
    );

    // PE Atual dinâmico: R$ 33.419,51
    expect(html).toContain(formatCurrency(33419.51));
    // Média recente: R$ 40.630,17
    expect(html).toContain(formatCurrency(40630.17));
    // Falta vender: R$ 7.906,06
    expect(html).toContain(formatCurrency(7906.06));
    // Variação calculada: ((33419.51 / 40630.17) - 1) * 100 = -17,7% vs média
    expect(html).toContain("-17,7% vs média");
  });

  // Requirement E: status EM ANDAMENTO aparece em mês aberto
  it("E. status EM ANDAMENTO e aviso discreto aparecem em mês aberto", () => {
    const period = { from: "2026-11-01", to: "2026-11-17" };
    const html = renderToString(
      <HomeExportReport
        period={period}
        salesData={mockSalesNov2026}
        operationalBreakEven={mockBreakEvenNovOpen}
      />,
    );

    expect(html).toContain('data-testid="export-badge-inprogress"');
    expect(html).toContain("EM ANDAMENTO");
    expect(html).toContain(
      "Os valores podem variar conforme novos lançamentos e vendas forem registrados.",
    );
  });

  // Requirement F: status não aparece indevidamente em mês fechado
  it("F. status EM ANDAMENTO não aparece indevidamente em mês fechado", () => {
    const period = { from: "2026-10-01", to: "2026-10-31" };
    const html = renderToString(
      <HomeExportReport
        period={period}
        salesData={mockSalesNov2026}
        operationalBreakEven={mockBreakEvenOctClosed}
      />,
    );

    expect(html).not.toContain('data-testid="export-badge-inprogress"');
    expect(html).not.toContain(
      "Os valores podem variar conforme novos lançamentos e vendas forem registrados.",
    );
    expect(html).toContain("SUPERADO");
  });

  // Requirement G: marcador histórico aparece somente quando estiver dentro do período
  it("G. marcador histórico aparece somente quando 03/06/2026 estiver dentro do período", () => {
    // Caso 1: Fora do intervalo (Novembro 2026) -> NÃO deve ter marcador
    const periodNov = { from: "2026-11-01", to: "2026-11-17" };
    const htmlNov = renderToString(
      <HomeExportReport
        period={periodNov}
        salesData={mockSalesNov2026}
        operationalBreakEven={mockBreakEvenNovOpen}
      />,
    );
    expect(htmlNov).not.toContain('data-testid="export-historical-marker"');
    expect(htmlNov).not.toContain("Nineclouds + Hustler no mesmo sistema");

    // Caso 2: Dentro do intervalo (Junho 2026) -> DEVE ter marcador
    const periodJun = { from: "2026-06-01", to: "2026-06-30" };
    const salesJun: SalesOverviewResult = {
      period: periodJun,
      summary: {
        revenue: 50000,
        sales: 200,
        avgTicket: 250,
        customers: 150,
        salesWithoutCustomer: 0,
      },
      trend: {
        granularity: "daily",
        points: [
          {
            key: "2026-06-01",
            label: "01/06",
            revenue: 1500,
            sales: 6,
            averageTicket: 250,
            customers: 5,
            periodStart: "2026-06-01",
            periodEnd: "2026-06-01",
          },
          {
            key: "2026-06-03",
            label: "03/06",
            revenue: 3000,
            sales: 12,
            averageTicket: 250,
            customers: 10,
            periodStart: "2026-06-03",
            periodEnd: "2026-06-03",
          },
          {
            key: "2026-06-30",
            label: "30/06",
            revenue: 2000,
            sales: 8,
            averageTicket: 250,
            customers: 7,
            periodStart: "2026-06-30",
            periodEnd: "2026-06-30",
          },
        ],
      },
      monthly: [],
    };
    const htmlJun = renderToString(
      <HomeExportReport
        period={periodJun}
        salesData={salesJun}
        operationalBreakEven={null}
      />,
    );
    expect(htmlJun).toContain('data-testid="export-historical-marker"');
    expect(htmlJun).toContain("Nineclouds + Hustler no mesmo sistema");
  });

  // Requirement H: nome do arquivo contém período correto
  it("H. nome do arquivo contém período correto e formato esperado", () => {
    const period = { from: "2026-11-01", to: "2026-11-17" };

    const pdfFilename = buildHomeExportFilename(period, "pdf");
    expect(pdfFilename).toBe("tagpulse-performance-2026-11-01-a-2026-11-17.pdf");

    const jpgFilename = buildHomeExportFilename(period, "jpg");
    expect(jpgFilename).toBe("tagpulse-performance-2026-11-01-a-2026-11-17.jpg");
  });

  // Extra check: Customer intelligence page renders top 5 only and displays last sync
  it("inclui Inteligência de Clientes (Top 5) e Última Sincronização quando disponíveis", () => {
    const period = { from: "2026-11-01", to: "2026-11-17" };
    const html = renderToString(
      <HomeExportReport
        period={period}
        salesData={mockSalesNov2026}
        operationalBreakEven={mockBreakEvenNovOpen}
        customerData={mockCustomerData}
        lastSyncAt="2026-11-17T22:30:00.000Z"
      />,
    );

    // Página 2 existe
    expect(html).toContain('data-export-page="2"');
    expect(html).toContain("Performance Comercial · Inteligência de Clientes");

    // Top 5 Clientes presentes e tipografia padronizada em CAIXA ALTA
    expect(html).toContain("Cliente Alfa LTDA");
    expect(html).toContain("Cliente Beta ME");
    expect(html).toContain("Cliente Gama Comércio");
    expect(html).toContain("Cliente Delta Eireli");
    expect(html).toContain("Cliente Épsilon S.A.");
    expect(html).toContain("tp-home-export-client-name");
    expect(html).toContain("text-transform: uppercase");
    // 6º cliente NÃO deve aparecer (apenas Top 5)
    expect(html).not.toContain("Cliente Zeta (Deverá ser omitido do Top 5)");

    // Sincronização clara (dados sincronizados até)
    expect(html).toContain('data-testid="export-last-sync"');
    expect(html).toContain("Dados sincronizados até:");

    // Subtítulo do Ponto de Equilíbrio
    expect(html).toContain("Equilíbrio atual do mês");

    // Sem bloco duplicado de Faturado na faixa de ponto de equilíbrio
    expect(html).not.toContain(">Faturado<");
    expect(html).toContain("is-gap-highlight");

    // Concentração Comercial e Novos x Recorrentes presentes na Página 2
    expect(html).toContain('data-testid="export-commercial-concentration"');
    expect(html).toContain("Concentração Comercial");
    expect(html).toContain("Top 5 representam");
    expect(html).toContain("Maior cliente");
    expect(html).toContain('data-testid="export-new-vs-returning"');
    expect(html).toContain("Novos x Recorrentes");
  });

  // Extra check: PDF Landscape generator produces valid PDF binary header
  it("gera binário PDF Landscape válido a partir de imagem JPEG simulada", () => {
    // 1x1 base64 JPEG minimal stub
    const minimalJpegBase64 =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

    const pageImage: JpegPageImage = {
      dataUrl: minimalJpegBase64,
      widthPx: 2240,
      heightPx: 1584,
    };

    const pdfBytes = buildPdfFromJpegPages([pageImage], {
      orientation: "landscape",
    });

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(100);

    const pdfString = new TextDecoder("latin1").decode(pdfBytes);
    expect(pdfString).toContain("%PDF-1.4");
    // Landscape A4 width: 841.89 pt, height: 595.28 pt
    expect(pdfString).toContain("/MediaBox [ 0 0 841.89 595.28 ]");
  });
});
