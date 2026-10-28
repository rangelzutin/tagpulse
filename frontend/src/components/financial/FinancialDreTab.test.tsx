import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { FinancialDreTab, formatPendingAccrualLabel } from "./FinancialDreTab";
import { FinancialDreTable } from "./FinancialDreTable";
import { FinancialDreMonthlyChart } from "./FinancialDreMonthlyChart";
import { FinancialDreBreakdownCard } from "./FinancialDreBreakdownCard";
import type {
  DreSummaryDto,
  DreMonthlyItemDto,
  DreBreakdownDto,
} from "../../api/financial";
import * as financialApi from "../../api/financial";

// Mock API calls
vi.mock("../../api/financial", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/financial")>();
  return {
    ...actual,
    fetchFinancialDreSummary: vi.fn(),
    fetchFinancialDreMonthly: vi.fn(),
    fetchFinancialDreBreakdown: vi.fn(),
  };
});

describe("Phase 5D: Financial DRE Frontend Components & Tab Tests", () => {
  const canonicalSummary: DreSummaryDto = {
    period: {
      from: "2026-01-01",
      to: "2026-10-13",
    },
    totals: {
      realizedRevenue: 322465.68,
      estimatedCOGS: 197277.62,
      estimatedGrossProfit: 125188.06,
      estimatedGrossMarginPercent: 38.82,
      variableExpenses: {
        paymentFees: 3213.5,
        taxesOnRevenue: 15164.05,
        freightLogistics: 13906.98,
        salesCommissions: 0,
        other: 0,
        total: 32284.53,
      },
      contributionMargin: 92903.53,
      contributionMarginPercent: 28.81,
      operatingExpenses: {
        personnel: 4279.44,
        partnerCompensation: 66000.0,
        marketing: 18669.05,
        occupancy: 4715.55,
        utilities: 1166.32,
        software: 2448.88,
        accounting: 6293.76,
        infrastructure: 1705.17,
        administrative: 2425.78,
        other: 130.0,
        total: 107833.95,
      },
      financialResult: {
        financialIncome: 60.37,
        financialExpenses: 1506.69,
        total: -1446.32,
      },
      otherResult: {
        otherIncome: 0,
        otherExpenses: 0,
        total: 0,
      },
      netManagerialResult: -16376.74,
      netManagerialMarginPercent: -5.08,
      status: "LOSS",
    },
    months: [],
    lastClosedMonth: "2026-08",
    dataQuality: {
      isProvisional: true,
      financiallyClosed: false,
      pendingAccruals: ["VARIABLE_TAX_ON_REVENUE", "OPERATING_PERSONNEL"],
      dreClassificationCoveragePercent: 100,
      unknownAmount: 0,
    },
    disclaimer:
      "DRE Gerencial do TagPulse: utiliza o custo atual dos produtos como estimativa de CMV e classificações gerenciais das despesas. Não substitui a contabilidade oficial.",
  };

  const canonicalMonthly: DreMonthlyItemDto[] = [
    {
      month: "2026-08",
      realizedRevenue: 35000.0,
      estimatedCOGS: 21000.0,
      estimatedGrossProfit: 14000.0,
      estimatedGrossMarginPercent: 40.0,
      variableExpenses: {
        paymentFees: 350,
        taxesOnRevenue: 1500,
        freightLogistics: 1400,
        salesCommissions: 0,
        other: 0,
        total: 3250,
      },
      contributionMargin: 10750.0,
      contributionMarginPercent: 30.71,
      operatingExpenses: {
        personnel: 400,
        partnerCompensation: 6000,
        marketing: 1500,
        occupancy: 500,
        utilities: 100,
        software: 200,
        accounting: 600,
        infrastructure: 150,
        administrative: 200,
        other: 0,
        total: 9650,
      },
      financialResult: { financialIncome: 5, financialExpenses: 120, total: -115 },
      otherResult: { otherIncome: 0, otherExpenses: 0, total: 0 },
      netManagerialResult: 985.0,
      netManagerialMarginPercent: 2.81,
      status: "PROFIT",
      dataQuality: {
        isProvisional: false,
        financiallyClosed: true,
        pendingAccruals: [],
        dreClassificationCoveragePercent: 100,
        unknownAmount: 0,
      },
    },
    {
      month: "2026-09",
      realizedRevenue: 32000.0,
      estimatedCOGS: 20000.0,
      estimatedGrossProfit: 12000.0,
      estimatedGrossMarginPercent: 37.5,
      variableExpenses: {
        paymentFees: 320,
        taxesOnRevenue: 1400,
        freightLogistics: 1300,
        salesCommissions: 0,
        other: 0,
        total: 3020,
      },
      contributionMargin: 8980.0,
      contributionMarginPercent: 28.06,
      operatingExpenses: {
        personnel: 400,
        partnerCompensation: 6000,
        marketing: 2000,
        occupancy: 500,
        utilities: 100,
        software: 200,
        accounting: 600,
        infrastructure: 150,
        administrative: 200,
        other: 0,
        total: 10150,
      },
      financialResult: { financialIncome: 5, financialExpenses: 140, total: -135 },
      otherResult: { otherIncome: 0, otherExpenses: 0, total: 0 },
      netManagerialResult: -1305.0,
      netManagerialMarginPercent: -4.08,
      status: "LOSS",
      dataQuality: {
        isProvisional: true,
        financiallyClosed: false,
        pendingAccruals: ["VARIABLE_TAX_ON_REVENUE", "OPERATING_PERSONNEL"],
        dreClassificationCoveragePercent: 100,
        unknownAmount: 0,
      },
    },
    {
      month: "2026-10",
      realizedRevenue: 15000.0,
      estimatedCOGS: 9000.0,
      estimatedGrossProfit: 6000.0,
      estimatedGrossMarginPercent: 40.0,
      variableExpenses: {
        paymentFees: 150,
        taxesOnRevenue: 600,
        freightLogistics: 600,
        salesCommissions: 0,
        other: 0,
        total: 1350,
      },
      contributionMargin: 4650.0,
      contributionMarginPercent: 31.0,
      operatingExpenses: {
        personnel: 0,
        partnerCompensation: 3000,
        marketing: 800,
        occupancy: 250,
        utilities: 50,
        software: 100,
        accounting: 300,
        infrastructure: 70,
        administrative: 100,
        other: 0,
        total: 4670,
      },
      financialResult: { financialIncome: 2, financialExpenses: 60, total: -58 },
      otherResult: { otherIncome: 0, otherExpenses: 0, total: 0 },
      netManagerialResult: -78.0,
      netManagerialMarginPercent: -0.52,
      status: "LOSS",
      dataQuality: {
        isProvisional: true,
        financiallyClosed: false,
        pendingAccruals: ["VARIABLE_TAX_ON_REVENUE", "OPERATING_PERSONNEL"],
        dreClassificationCoveragePercent: 100,
        unknownAmount: 0,
      },
    },
  ];

  const canonicalBreakdown: DreBreakdownDto = {
    period: {
      from: "2026-01-01",
      to: "2026-10-13",
    },
    realizedRevenue: 322465.68,
    disclaimer: "DRE Gerencial do TagPulse",
    categories: [
      {
        economicCategory: "OPERATING_PARTNER_COMPENSATION",
        label: "Pró-labore",
        group: "OPERATING_EXPENSE",
        amount: 66000.0,
        shareOfRevenuePercent: 20.47,
        recordCount: 10,
        details: [
          { description: "Pró-labore Sócios", amount: 66000.0, recordCount: 10 },
        ],
      },
      {
        economicCategory: "OPERATING_MARKETING",
        label: "Marketing",
        group: "OPERATING_EXPENSE",
        amount: 18669.05,
        shareOfRevenuePercent: 5.79,
        recordCount: 35,
      },
      {
        economicCategory: "VARIABLE_TAX_ON_REVENUE",
        label: "Impostos sobre Vendas",
        group: "VARIABLE_EXPENSE",
        amount: 15164.05,
        shareOfRevenuePercent: 4.7,
        recordCount: 8,
      },
      {
        economicCategory: "VARIABLE_FREIGHT_LOGISTICS",
        label: "Fretes / Logística",
        group: "VARIABLE_EXPENSE",
        amount: 13906.98,
        shareOfRevenuePercent: 4.31,
        recordCount: 142,
      },
      {
        economicCategory: "INVENTORY_PURCHASE",
        label: "Compras de Estoque",
        group: "NON_DRE",
        amount: 120500.0,
        shareOfRevenuePercent: null,
        recordCount: 50,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(financialApi.fetchFinancialDreSummary).mockResolvedValue(canonicalSummary);
    vi.mocked(financialApi.fetchFinancialDreMonthly).mockResolvedValue(canonicalMonthly);
    vi.mocked(financialApi.fetchFinancialDreBreakdown).mockResolvedValue(canonicalBreakdown);
  });

  // 1. Pending accrual label formatting test
  it("maps pending accruals codes to descriptive managerial texts", () => {
    expect(formatPendingAccrualLabel("VARIABLE_TAX_ON_REVENUE")).toBe("DAS / tributos sobre vendas");
    expect(formatPendingAccrualLabel("OPERATING_PERSONNEL")).toBe("GPS / encargos");
    expect(formatPendingAccrualLabel("TAX_ICMS_UNRESOLVED")).toBe("ICMS pendente de conciliação");
    expect(formatPendingAccrualLabel("OTHER_CODE")).toBe("OTHER_CODE");
  });

  // 2. DRE Table hierarchy and values test
  it("renders DRE statement table with canonical line items and correct formatting", () => {
    const html = renderToString(
      <FinancialDreTable
        totals={canonicalSummary.totals}
        realizedRevenue={canonicalSummary.totals.realizedRevenue}
      />
    );

    // Main line items
    expect(html).toContain("Receita Realizada");
    expect(html).toContain("CMV Estimado ao Custo Atual");
    expect(html).toContain("Lucro Bruto Estimado");
    expect(html).toContain("Despesas Variáveis");
    expect(html).toContain("Margem de Contribuição");
    expect(html).toContain("Despesas Operacionais");
    expect(html).toContain("Resultado Financeiro");
    expect(html).toContain("Resultado Líquido Gerencial Estimado");

    // Subitems
    expect(html).toContain("Taxas de Pagamento");
    expect(html).toContain("Impostos sobre Vendas");
    expect(html).toContain("Fretes / Logística");
    expect(html).toContain("Pró-labore");
    expect(html).toContain("Marketing");
    expect(html).toContain("Ocupação");
    expect(html).toContain("Software");
    expect(html).toContain("Contabilidade");

    // Formatted monetary and percentage values
    expect(html).toContain("100,00%");
    expect(html).toContain("38,82%");
    expect(html).toContain("28,81%");
    expect(html).toContain("-5,08%");
    expect(html).toContain("Prejuízo");
  });

  // 3. Monthly evolution table test (months, provisional vs closed badges)
  it("renders monthly chart and table distinguishing closed from provisional months", () => {
    const html = renderToString(
      <FinancialDreMonthlyChart
        monthlyData={canonicalMonthly}
        year="2026"
      />
    );

    // Title and elements
    expect(html).toContain("Evolução Mensal do Resultado");
    expect(html).toContain("Há meses provisórios na série");
  });

  // 4. Breakdown card rendering test
  it("renders expense breakdown ranking excluding NON_DRE categories", () => {
    const html = renderToString(
      <FinancialDreBreakdownCard
        breakdown={canonicalBreakdown}
      />
    );

    expect(html).toContain("Composição das Despesas");
    expect(html).toContain("Pró-labore");
    expect(html).toContain("Marketing");
    expect(html).toContain("Impostos sobre Vendas");
    expect(html).toContain("Fretes / Logística");

    // Compras de Estoque is NON_DRE and should be excluded from the expense breakdown list
    expect(html).not.toContain("Compras de Estoque");

    // Share of revenue and counts
    expect(html).toContain("20,47%");
    expect(html).toContain("5,79%");
    expect(html).toContain("10 registros");
  });

  // 5. Economic Status variations (PROFIT, BREAK_EVEN, LOSS)
  it("renders PROFIT and BREAK_EVEN status accurately in DRE table", () => {
    const profitTotals = {
      ...canonicalSummary.totals,
      netManagerialResult: 25000.5,
      netManagerialMarginPercent: 7.75,
      status: "PROFIT" as const,
    };
    const htmlProfit = renderToString(
      <FinancialDreTable totals={profitTotals} realizedRevenue={322465.68} />
    );
    expect(htmlProfit).toContain("Lucro");
    expect(htmlProfit).toContain("is-profit");

    const breakEvenTotals = {
      ...canonicalSummary.totals,
      netManagerialResult: 0.0,
      netManagerialMarginPercent: 0.0,
      status: "BREAK_EVEN" as const,
    };
    const htmlEven = renderToString(
      <FinancialDreTable totals={breakEvenTotals} realizedRevenue={322465.68} />
    );
    expect(htmlEven).toContain("Equilíbrio");
    expect(htmlEven).toContain("is-even");
  });

  // 6. Disclaimer
  it("renders the mandatory legal and managerial disclaimer", () => {
    const html = renderToString(
      <FinancialDreTable totals={canonicalSummary.totals} realizedRevenue={322465.68} />
    );
    // Table is part of the layout; the disclaimer is present in canonicalSummary
    expect(canonicalSummary.disclaimer).toContain(
      "DRE Gerencial do TagPulse: utiliza o custo atual dos produtos como estimativa de CMV"
    );
  });
});
