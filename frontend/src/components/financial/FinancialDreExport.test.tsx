import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { FinancialDreTab } from "./FinancialDreTab";
import {
  FinancialDreExportReport,
  DRE_EXPORT_DISCLAIMER_TEXT,
} from "./FinancialDreExportReport";
import {
  buildDreExportFilename,
  sanitizeCompanySlug,
  buildPdfFromJpegPages,
  formatExportGeneratedAt,
} from "./dreExportService";
import type {
  DreSummaryDto,
  DreMonthlyItemDto,
  DreBreakdownDto,
} from "../../api/financial";

function makeMonthlyItem(
  month: string,
  overrides?: Partial<{
    realizedRevenue: number;
    estimatedCOGS: number;
    variableTotal: number;
    operatingTotal: number;
    financialTotal: number;
    isProvisional: boolean;
    pendingAccruals: string[];
    costCoveragePercent: number;
    fullManagerialResultAvailable: boolean;
    netManagerialResult: number | null;
  }>,
): DreMonthlyItemDto {
  const rev = overrides?.realizedRevenue ?? 30000;
  const cogs = overrides?.estimatedCOGS ?? 18000;
  const gross = rev - cogs;
  const varTotal = overrides?.variableTotal ?? 3000;
  const cm = gross - varTotal;
  const opTotal = overrides?.operatingTotal ?? 7000;
  const finTotal = overrides?.financialTotal ?? 0;
  const calculatedNet = cm - opTotal + finTotal;
  const net =
    overrides?.netManagerialResult !== undefined
      ? overrides.netManagerialResult
      : calculatedNet;
  const isProvisional = overrides?.isProvisional ?? false;
  const pendingAccruals =
    overrides?.pendingAccruals ??
    (isProvisional ? ["VARIABLE_TAX_ON_REVENUE", "OPERATING_PERSONNEL"] : []);

  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  return {
    month,
    realizedRevenue: rev,
    estimatedCOGS: cogs,
    estimatedGrossProfit: gross,
    estimatedGrossMarginPercent: rev > 0 ? r2((gross / rev) * 100) : null,
    costCoveragePercent: overrides?.costCoveragePercent ?? 100,
    fullManagerialResultAvailable:
      overrides?.fullManagerialResultAvailable ?? (overrides?.netManagerialResult !== null),
    variableExpenses: {
      paymentFees: varTotal * 0.1,
      taxesOnRevenue: varTotal * 0.5,
      freightLogistics: varTotal * 0.4,
      salesCommissions: 0,
      other: 0,
      total: varTotal,
    },
    contributionMargin: cm,
    contributionMarginPercent: rev > 0 ? r2((cm / rev) * 100) : null,
    operatingExpenses: {
      personnel: 534.93,
      partnerCompensation: opTotal - 534.93,
      marketing: 0,
      occupancy: 0,
      utilities: 0,
      software: 0,
      accounting: 0,
      infrastructure: 0,
      administrative: 0,
      other: 0,
      total: opTotal,
    },
    financialResult: {
      financialIncome: finTotal > 0 ? finTotal : 0,
      financialExpenses: finTotal < 0 ? Math.abs(finTotal) : 0,
      total: finTotal,
    },
    otherResult: {
      otherIncome: 0,
      otherExpenses: 0,
      total: 0,
    },
    netManagerialResult: net,
    netManagerialMarginPercent:
      net !== null && rev > 0 ? r2((net / rev) * 100) : null,
    status:
      net === null ? "BREAK_EVEN" : net > 0 ? "PROFIT" : net < 0 ? "LOSS" : "BREAK_EVEN",
    dataQuality: {
      isProvisional,
      financiallyClosed: !isProvisional,
      pendingAccruals,
      dreClassificationCoveragePercent: 100,
      unknownAmount: 0,
    },
  };
}

describe("Phase 5D.6: DRE Gerencial Shareable Export (PDF / JPG)", () => {
  const sampleSummary: DreSummaryDto = {
    period: { from: "2026-01-01", to: "2026-10-31" },
    totals: {
      realizedRevenue: 322465.68,
      estimatedCOGS: 197277.62,
      estimatedGrossProfit: 125188.06,
      estimatedGrossMarginPercent: 38.82,
      variableExpenses: {
        paymentFees: 3505.35,
        taxesOnRevenue: 16611.4,
        freightLogistics: 14919.37,
        salesCommissions: 0,
        other: 0,
        total: 35036.12,
      },
      contributionMargin: 90151.94,
      contributionMarginPercent: 27.96,
      operatingExpenses: {
        personnel: 4814.37,
        partnerCompensation: 65000.0,
        marketing: 20426.31,
        occupancy: 4715.55,
        utilities: 1391.8,
        software: 2607.88,
        accounting: 7064.06,
        infrastructure: 2093.67,
        administrative: 2458.41,
        other: 0,
        total: 110572.05,
      },
      financialResult: {
        financialIncome: 60.37,
        financialExpenses: 1547.01,
        total: -1486.64,
      },
      otherResult: {
        otherIncome: 0,
        otherExpenses: 0,
        total: 0,
      },
      netManagerialResult: -21906.75,
      netManagerialMarginPercent: -6.79,
      status: "LOSS",
    },
    months: [],
    lastClosedMonth: "2026-09",
    dataQuality: {
      isProvisional: true,
      financiallyClosed: false,
      pendingAccruals: ["VARIABLE_TAX_ON_REVENUE", "OPERATING_PERSONNEL"],
      dreClassificationCoveragePercent: 100,
      unknownAmount: 0,
    },
    disclaimer: DRE_EXPORT_DISCLAIMER_TEXT,
  };

  const sampleMonthly: DreMonthlyItemDto[] = [
    makeMonthlyItem("2026-04"),
    makeMonthlyItem("2026-05"),
    makeMonthlyItem("2026-06"),
    makeMonthlyItem("2026-07"),
    makeMonthlyItem("2026-08"),
    makeMonthlyItem("2026-09"),
    makeMonthlyItem("2026-10", {
      isProvisional: true,
      pendingAccruals: ["VARIABLE_TAX_ON_REVENUE", "OPERATING_PERSONNEL"],
    }),
  ];

  const sampleBreakdown: DreBreakdownDto = {
    period: { from: "2026-01-01", to: "2026-10-31" },
    realizedRevenue: 322465.68,
    disclaimer: DRE_EXPORT_DISCLAIMER_TEXT,
    categories: [
      {
        economicCategory: "OPERATING_PARTNER_COMPENSATION",
        label: "Pró-labore",
        group: "OPERATING_EXPENSE",
        amount: 65000.0,
        shareOfRevenuePercent: 20.16,
        recordCount: 10,
      },
      {
        economicCategory: "OPERATING_MARKETING",
        label: "Marketing",
        group: "OPERATING_EXPENSE",
        amount: 20426.31,
        shareOfRevenuePercent: 6.33,
        recordCount: 38,
      },
      {
        economicCategory: "VARIABLE_TAX_ON_REVENUE",
        label: "Impostos sobre Vendas",
        group: "VARIABLE_EXPENSE",
        amount: 16611.4,
        shareOfRevenuePercent: 5.15,
        recordCount: 12,
      },
      {
        economicCategory: "INVENTORY_PURCHASE",
        label: "Compras de Estoque",
        group: "NON_DRE",
        amount: 120000.0,
        shareOfRevenuePercent: null,
        recordCount: 45,
      },
    ],
  };

  // A. botão Exportar aparece
  it("A. renders the Exportar button in FinancialDreTab header", () => {
    const html = renderToString(
      <FinancialDreTab
        currentPeriod={{ from: "2026-01-01", to: "2026-10-31" }}
        initialSummary={sampleSummary}
        initialMonthly={sampleMonthly}
        initialBreakdown={sampleBreakdown}
      />,
    );

    expect(html).toContain('data-testid="dre-export-button"');
    expect(html).toContain("Exportar");
  });

  // B. opções PDF/JPG aparecem
  it("B. renders Exportar PDF and Exportar JPG options when menu is open", () => {
    const html = renderToString(
      <FinancialDreTab
        currentPeriod={{ from: "2026-01-01", to: "2026-10-31" }}
        initialSummary={sampleSummary}
        initialMonthly={sampleMonthly}
        initialBreakdown={sampleBreakdown}
        defaultExportMenuOpen={true}
      />,
    );

    expect(html).toContain('data-testid="dre-export-menu"');
    expect(html).toContain('data-testid="dre-export-pdf-option"');
    expect(html).toContain("Exportar PDF");
    expect(html).toContain('data-testid="dre-export-jpg-option"');
    expect(html).toContain("Exportar JPG");
  });

  // C & D. export usa período global e recebe dados atuais sem recálculo
  it("C & D. reuses the exact global period and pre-calculated DRE data in the export report", () => {
    const html = renderToString(
      <FinancialDreExportReport
        companyName="Nineclouds"
        period={{ from: "2026-07-01", to: "2026-08-31" }}
        generatedAt={new Date(2026, 10, 2, 14, 30)}
        summaryData={sampleSummary}
        monthlyData={sampleMonthly}
        breakdownData={sampleBreakdown}
      />,
    );

    // Header metadata
    expect(html).toContain("Nineclouds");
    expect(html).toContain("DRE Gerencial");
    expect(html).toContain("01/07/2026 a 31/08/2026");
    expect(html).toContain("02/11/2026 14:30");

    // 4 Primary KPIs + 5 Secondary Metrics + DRE Table + Expense Breakdown
    expect(html).toContain("322.465,68");
    expect(html).toContain("90.151,94");
    expect(html).toContain("27,96%");
    expect(html).toContain("21.906,75");
    expect(html).toContain("-6,79%");
    expect(html).toContain("197.277,62");
    expect(html).toContain("125.188,06");
    expect(html).toContain("38,82%");
    expect(html).toContain("110.572,05");
    expect(html).toContain("1.486,64");

    // Expense breakdown excludes NON_DRE (Compras de Estoque)
    expect(html).toContain("Pró-labore");
    expect(html).toContain("20,16%");
    expect(html).not.toContain("Compras de Estoque");

    // Taxas de Meio de Pagamento (corrected nomenclature)
    expect(html).toContain("Taxas de Meio de Pagamento");
    expect(html).not.toContain(">Taxas de Pagamento<");

    // Mandatory order of sections (1..8 including 4b-monthly-table)
    const idxHeader = html.indexOf('data-export-section="1-header"');
    const idxKpis = html.indexOf('data-export-section="2-kpis"');
    const idxSec = html.indexOf('data-export-section="3-secondary"');
    const idxChart = html.indexOf('data-export-section="4-chart"');
    const idxMonthlyTable = html.indexOf('data-export-section="4b-monthly-table"');
    const idxTable = html.indexOf('data-export-section="5-dre-table"');
    const idxBreakdown = html.indexOf('data-export-section="6-breakdown"');
    const idxQuality = html.indexOf('data-export-section="7-quality"');
    const idxDisclaimer = html.indexOf('data-export-section="8-disclaimer"');

    expect(idxHeader).toBeGreaterThan(-1);
    expect(idxKpis).toBeGreaterThan(idxHeader);
    expect(idxSec).toBeGreaterThan(idxKpis);
    expect(idxChart).toBeGreaterThan(idxSec);
    expect(idxMonthlyTable).toBeGreaterThan(idxChart);
    expect(idxTable).toBeGreaterThan(idxMonthlyTable);
    expect(idxBreakdown).toBeGreaterThan(idxTable);
    expect(idxQuality).toBeGreaterThan(idxBreakdown);
    expect(idxDisclaimer).toBeGreaterThan(idxQuality);
  });

  // E. nome do arquivo contém empresa/período
  it("E. generates deterministic sanitized filenames for PDF and JPG", () => {
    expect(
      buildDreExportFilename(
        "Nineclouds",
        { from: "2026-01-01", to: "2026-10-31" },
        "pdf",
      ),
    ).toBe("dre-nineclouds-2026-01-01-a-2026-10-31.pdf");

    expect(
      buildDreExportFilename(
        "Nineclouds",
        { from: "2026-01-01", to: "2026-10-31" },
        "jpg",
      ),
    ).toBe("dre-nineclouds-2026-01-01-a-2026-10-31.jpg");

    expect(
      sanitizeCompanySlug("Nineclouds - Comércio de Skate & Equipamentos LTDA"),
    ).toBe("nineclouds-comercio-de-skate-equipamentos-ltda");

    expect(formatExportGeneratedAt(new Date(2026, 10, 2, 14, 30))).toBe(
      "02/11/2026 14:30",
    );
  });

  // F, G, H. gráfico presente, lógica adaptativa reutilizada e sem tooltip no modo export
  it("F, G, H. includes static SVG chart using adaptive evolution helper and omits interactive tooltip/toggles", () => {
    // Short period (Jul/26) -> 6-month context window
    const shortPeriodHtml = renderToString(
      <FinancialDreExportReport
        companyName="Nineclouds"
        period={{ from: "2026-07-01", to: "2026-07-31" }}
        summaryData={sampleSummary}
        monthlyData={sampleMonthly}
        breakdownData={sampleBreakdown}
      />,
    );

    // F. SVG chart is rendered synchronously in export mode
    expect(shortPeriodHtml).toContain('data-testid="dre-export-chart-section"');
    expect(shortPeriodHtml).toContain("<svg");
    expect(shortPeriodHtml).toContain("Evolução Mensal do Resultado");

    // G. Adaptive 6-month context notice is present for 1-month selection
    expect(shortPeriodHtml).toContain(
      "Contexto de 6 meses — período selecionado: Jul/26",
    );
    expect(shortPeriodHtml).toContain('data-selected-buckets="Jul/26"');

    // H. No interactive Gráfico/Tabela toggle buttons and no tooltip wrapper in export mode
    expect(shortPeriodHtml).not.toContain("tp-chart-toggle-group");
    expect(shortPeriodHtml).not.toContain('aria-label="Visualização em Tabela"');
    expect(shortPeriodHtml).not.toContain("recharts-tooltip-wrapper");
  });

  // I & J. provisório aparece quando necessário, labels amigáveis e raw keys ausentes
  it("I & J. displays provisional warnings and friendly pending labels without any raw technical keys", () => {
    const html = renderToString(
      <FinancialDreExportReport
        companyName="Nineclouds"
        period={{ from: "2026-01-01", to: "2026-10-31" }}
        summaryData={sampleSummary}
        monthlyData={sampleMonthly}
        breakdownData={sampleBreakdown}
        layoutMode="continuous"
      />,
    );

    expect(html).toContain("Há competências provisórias no período.");
    expect(html).toContain("Este relatório contém competências provisórias.");
    expect(html).toContain("Impostos sobre vendas");
    expect(html).toContain("Pessoal / encargos");

    // Raw keys must NEVER appear in the rendered export report
    expect(html).not.toContain("VARIABLE_TAX_ON_REVENUE");
    expect(html).not.toContain("OPERATING_PERSONNEL");
    expect(html).not.toContain("OPERATING_PARTNER_COMPENSATION");
  });

  // K. sidebar/nav não aparecem no relatório exportado
  it("K. does not include application sidebar, navigation tabs, or calendar filter in the export report", () => {
    const html = renderToString(
      <FinancialDreExportReport
        companyName="Nineclouds"
        period={{ from: "2026-01-01", to: "2026-10-31" }}
        summaryData={sampleSummary}
        monthlyData={sampleMonthly}
        breakdownData={sampleBreakdown}
      />,
    );

    expect(html).not.toContain("tp-sidebar");
    expect(html).not.toContain("Navegação Principal");
    expect(html).not.toContain("Subnavegação do Módulo Financeiro");
    expect(html).not.toContain("Sincronizar Dados");
  });

  // L & M. falha de exportação tratada e estado "Gerando..." funciona
  it("L & M. displays loading feedback ('Gerando PDF...' / 'Gerando imagem...') and friendly error alert on failure", () => {
    const pdfBusyHtml = renderToString(
      <FinancialDreTab
        currentPeriod={{ from: "2026-01-01", to: "2026-10-31" }}
        initialSummary={sampleSummary}
        initialMonthly={sampleMonthly}
        initialBreakdown={sampleBreakdown}
        initialExportingFormat="pdf"
      />,
    );
    expect(pdfBusyHtml).toContain("Gerando PDF...");
    expect(pdfBusyHtml).toContain("disabled");

    const jpgBusyHtml = renderToString(
      <FinancialDreTab
        currentPeriod={{ from: "2026-01-01", to: "2026-10-31" }}
        initialSummary={sampleSummary}
        initialMonthly={sampleMonthly}
        initialBreakdown={sampleBreakdown}
        initialExportingFormat="jpg"
      />,
    );
    expect(jpgBusyHtml).toContain("Gerando imagem...");
    expect(jpgBusyHtml).toContain("disabled");

    const errorHtml = renderToString(
      <FinancialDreTab
        currentPeriod={{ from: "2026-01-01", to: "2026-10-31" }}
        initialSummary={sampleSummary}
        initialMonthly={sampleMonthly}
        initialBreakdown={sampleBreakdown}
        initialExportError="Falha simulada ao gerar o arquivo PDF."
      />,
    );
    expect(errorHtml).toContain('data-testid="dre-export-error"');
    expect(errorHtml).toContain("Não foi possível exportar o DRE");
    expect(errorHtml).toContain("Falha simulada ao gerar o arquivo PDF.");
  });

  // PDF binary builder validation
  it("builds a valid multi-page A4 Portrait PDF 1.4 binary from JPEG page images", () => {
    // 1x1 white JPEG base64 fixture
    const tinyJpegDataUrl =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

    const pdfBytes = buildPdfFromJpegPages([
      { dataUrl: tinyJpegDataUrl, widthPx: 1680, heightPx: 2376 },
      { dataUrl: tinyJpegDataUrl, widthPx: 1680, heightPx: 2376 },
      { dataUrl: tinyJpegDataUrl, widthPx: 1680, heightPx: 2376 },
    ]);

    const pdfText = new TextDecoder("latin1").decode(pdfBytes);
    expect(pdfText.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdfText).toContain("/Count 3");
    expect(pdfText).toContain("/MediaBox [ 0 0 595.28 841.89 ]");
    expect(pdfText).toContain("/Filter /DCTDecode");
    expect(pdfText.trim().endsWith("%%EOF")).toBe(true);
  });

  // N. Tabela mensal presente nos exportáveis com todas as 10 colunas
  it("N. renders the monthly results table with all 10 canonical columns", () => {
    const html = renderToString(
      <FinancialDreExportReport
        companyName="Nineclouds"
        period={{ from: "2026-04-01", to: "2026-10-31" }}
        summaryData={sampleSummary}
        monthlyData={sampleMonthly}
        breakdownData={sampleBreakdown}
      />,
    );

    expect(html).toContain('data-testid="dre-export-monthly-table"');
    expect(html).toContain('data-export-section="4b-monthly-table"');
    expect(html).toContain("Evolução Mensal do Resultado — Tabela");

    // All 10 column headers
    expect(html).toContain(">Mês<");
    expect(html).toContain(">Receita<");
    expect(html).toContain(">MC (R$)<");
    expect(html).toContain(">MC (%)<");
    expect(html).toContain(">Resultado Líquido<");
    expect(html).toContain(">Margem Líq.<");
    expect(html).toContain(">Ponto de Equilíbrio<");
    expect(html).toContain(">Gap Equilíbrio<");
    expect(html).toContain(">Status<");
    expect(html).toContain(">Qualidade<");
  });

  // O. Renderiza todos os meses do período selecionado e formatações monetárias/percentuais
  it("O. renders all selected months with accurate values and badges", () => {
    const html = renderToString(
      <FinancialDreExportReport
        companyName="Nineclouds"
        period={{ from: "2026-04-01", to: "2026-10-31" }}
        summaryData={sampleSummary}
        monthlyData={sampleMonthly}
        breakdownData={sampleBreakdown}
      />,
    );

    // 7 months rendered in the monthly table
    expect(html).toContain("Abr/26");
    expect(html).toContain("Mai/26");
    expect(html).toContain("Jun/26");
    expect(html).toContain("Jul/26");
    expect(html).toContain("Ago/26");
    expect(html).toContain("Set/26");
    expect(html).toContain("Out/26");

    // Status badges
    expect(html).toContain("Lucro");
    // Quality badges
    expect(html).toContain("Fechado");
    expect(html).toContain("Provisório");
  });

  // P. Semântica de null-safety, cobertura parcial e inviabilidade
  it("P. handles null safety, partial cost coverage, and unviable margin in the monthly table", () => {
    const customMonthly: DreMonthlyItemDto[] = [
      // 1. Mês com resultado nulo (cobertura parcial)
      makeMonthlyItem("2026-01", {
        realizedRevenue: 50000,
        estimatedCOGS: 25000,
        variableTotal: 5000,
        netManagerialResult: null,
        costCoveragePercent: 45,
        fullManagerialResultAvailable: false,
      }),
      // 2. Mês com margem de contribuição zero/negativa (ponto de equilíbrio inviável)
      makeMonthlyItem("2026-02", {
        realizedRevenue: 20000,
        estimatedCOGS: 25000,
        variableTotal: 5000,
        operatingTotal: 4000,
      }),
      // 3. Mês lucrativo (gap equilíbrio superado)
      makeMonthlyItem("2026-03", {
        realizedRevenue: 60000,
        estimatedCOGS: 20000,
        variableTotal: 5000,
        operatingTotal: 10000,
      }),
    ];

    const html = renderToString(
      <FinancialDreExportReport
        companyName="Nineclouds"
        period={{ from: "2026-01-01", to: "2026-03-31" }}
        summaryData={{
          ...sampleSummary,
          period: { from: "2026-01-01", to: "2026-03-31" },
        }}
        monthlyData={customMonthly}
        breakdownData={sampleBreakdown}
      />,
    );

    // Mês 1: Resultado Líquido Indisponível e Ponto de Equilíbrio Cobertura parcial
    expect(html).toContain("Indisponível");
    expect(html).toContain("Cobertura parcial");

    // Mês 2: Ponto de Equilíbrio Inviável
    expect(html).toContain("Inviável");

    // Mês 3: Gap Equilíbrio Superado
    expect(html).toContain("Superado");
  });

  // Q. Tabela presente no layout contínuo (JPG) e paginado (PDF Page 1)
  it("Q. positions monthly table directly below chart in both continuous and paginated layouts", () => {
    const continuousHtml = renderToString(
      <FinancialDreExportReport
        companyName="Nineclouds"
        period={{ from: "2026-05-01", to: "2026-07-31" }}
        summaryData={sampleSummary}
        monthlyData={sampleMonthly}
        breakdownData={sampleBreakdown}
        layoutMode="continuous"
      />,
    );
    expect(continuousHtml).toContain('data-layout-mode="continuous"');
    const contChartIdx = continuousHtml.indexOf('data-export-section="4-chart"');
    const contTableIdx = continuousHtml.indexOf(
      'data-export-section="4b-monthly-table"',
    );
    const contDreIdx = continuousHtml.indexOf('data-export-section="5-dre-table"');
    expect(contTableIdx).toBeGreaterThan(contChartIdx);
    expect(contDreIdx).toBeGreaterThan(contTableIdx);

    const paginatedHtml = renderToString(
      <FinancialDreExportReport
        companyName="Nineclouds"
        period={{ from: "2026-05-01", to: "2026-07-31" }}
        summaryData={sampleSummary}
        monthlyData={sampleMonthly}
        breakdownData={sampleBreakdown}
        layoutMode="paginated"
      />,
    );
    expect(paginatedHtml).toContain('data-layout-mode="paginated"');
    // Ensure both chart and monthly table are inside page 1
    const page1Html = paginatedHtml.slice(
      paginatedHtml.indexOf('data-export-page="1"'),
      paginatedHtml.indexOf('data-export-page="2"'),
    );
    expect(page1Html).toContain('data-export-section="4-chart"');
    expect(page1Html).toContain('data-export-section="4b-monthly-table"');
  });
});
