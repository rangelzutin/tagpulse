import { describe, expect, it } from "vitest";
import { classifyFinancialRecordForDre } from "../src/modules/financial/financial-dre-classifier.js";

describe("Financial DRE Classifier", () => {
  it("classifies Plano 19 as INVENTORY_PURCHASE and non-deductible in DRE", () => {
    const res = classifyFinancialRecordForDre({
      id: "rec-1",
      sourceId: "101",
      budgetPlanSourceId: "19",
      description: "Compra Fornecedor X",
      dueDate: new Date("2026-03-15T00:00:00Z"),
      originalAmount: 5000,
      totalAmount: 5000,
    });

    expect(res.category).toBe("INVENTORY_PURCHASE");
    expect(res.isDeductibleInDre).toBe(false);
    expect(res.baseAmount).toBe(5000);
  });

  it("classifies Plano 1 payment fees by discountAmount and linked sale realizedDate", () => {
    const res = classifyFinancialRecordForDre({
      id: "rec-2",
      sourceId: "102",
      budgetPlanSourceId: "1",
      description: "Recebível Cartão",
      dueDate: new Date("2026-01-15T00:00:00Z"),
      originalAmount: 100,
      discountAmount: 3.5,
      linkedSaleRealizedDate: new Date("2025-12-28T00:00:00Z"),
    });

    expect(res.category).toBe("VARIABLE_PAYMENT_FEE");
    expect(res.isDeductibleInDre).toBe(true);
    expect(res.baseAmount).toBe(3.5);
    expect(res.referenceMonth).toBe("2025-12");
  });

  it("classifies Plano 27 DAS as VARIABLE_TAX_ON_REVENUE with previous month competence", () => {
    const res = classifyFinancialRecordForDre({
      id: "rec-3",
      sourceId: "10540",
      budgetPlanSourceId: "27",
      description: "Simples Nacional",
      dueDate: new Date("2026-02-20T00:00:00Z"),
      originalAmount: 2257.69,
      totalAmount: 2257.69,
    });

    expect(res.category).toBe("VARIABLE_TAX_ON_REVENUE");
    expect(res.isDeductibleInDre).toBe(true);
    expect(res.baseAmount).toBe(2257.69);
    expect(res.referenceMonth).toBe("2026-01");
  });

  it("classifies Plano 27 GPS as OPERATING_PERSONNEL with previous month competence", () => {
    const res = classifyFinancialRecordForDre({
      id: "rec-4",
      sourceId: "10541",
      budgetPlanSourceId: "27",
      description: "GPS",
      dueDate: new Date("2026-02-20T00:00:00Z"),
      originalAmount: 534.93,
      totalAmount: 534.93,
    });

    expect(res.category).toBe("OPERATING_PERSONNEL");
    expect(res.isDeductibleInDre).toBe(true);
    expect(res.baseAmount).toBe(534.93);
    expect(res.referenceMonth).toBe("2026-01");
  });

  it("classifies Plano 27 ICMS base as VARIABLE_TAX_ON_REVENUE and penalty as FINANCIAL_EXPENSE", () => {
    const res = classifyFinancialRecordForDre({
      id: "rec-5",
      sourceId: "10906",
      budgetPlanSourceId: "27",
      description: "ICMS",
      dueDate: new Date("2026-05-29T00:00:00Z"),
      confirmationDate: new Date("2026-06-10T00:00:00Z"),
      originalAmount: 861.42,
      totalAmount: 878.64,
    });

    expect(res.category).toBe("VARIABLE_TAX_ON_REVENUE");
    expect(res.isDeductibleInDre).toBe(true);
    expect(res.baseAmount).toBe(861.42);
    expect(res.referenceMonth).toBe("2026-05");
    expect(res.financialAdjustment).toBeDefined();
    expect(res.financialAdjustment?.type).toBe("FINANCIAL_EXPENSE");
    expect(res.financialAdjustment?.amount).toBe(17.22);
  });

  it("classifies Plano 8 freight prefixes as VARIABLE_FREIGHT_LOGISTICS", () => {
    const res = classifyFinancialRecordForDre({
      id: "rec-6",
      sourceId: "106",
      budgetPlanSourceId: "8",
      description: "RTE Rodonaves CTE 12345",
      dueDate: new Date("2026-04-10T00:00:00Z"),
      originalAmount: 450,
      totalAmount: 450,
    });

    expect(res.category).toBe("VARIABLE_FREIGHT_LOGISTICS");
    expect(res.isDeductibleInDre).toBe(true);
    expect(res.baseAmount).toBe(450);
  });

  it("classifies Plano 8 Bradesco as FINANCIAL_EXPENSE", () => {
    const res = classifyFinancialRecordForDre({
      id: "rec-7",
      sourceId: "107",
      budgetPlanSourceId: "8",
      description: "Tarifa Bancária Bradesco",
      dueDate: new Date("2026-04-10T00:00:00Z"),
      originalAmount: 75.5,
      totalAmount: 75.5,
    });

    expect(res.category).toBe("FINANCIAL_EXPENSE");
    expect(res.isDeductibleInDre).toBe(true);
    expect(res.baseAmount).toBe(75.5);
  });

  it("classifies Plano 8 categories: Occupancy, Utilities, Software, Accounting", () => {
    const aluguel = classifyFinancialRecordForDre({
      id: "rec-8",
      sourceId: "108",
      budgetPlanSourceId: "8",
      description: "Aluguel Galpão",
      dueDate: new Date("2026-04-10T00:00:00Z"),
      originalAmount: 1200,
    });
    expect(aluguel.category).toBe("OPERATING_OCCUPANCY");

    const elektro = classifyFinancialRecordForDre({
      id: "rec-9",
      sourceId: "109",
      budgetPlanSourceId: "8",
      description: "Elektro Eletricidade",
      dueDate: new Date("2026-04-10T00:00:00Z"),
      originalAmount: 250,
    });
    expect(elektro.category).toBe("OPERATING_UTILITIES");

    const tagplus = classifyFinancialRecordForDre({
      id: "rec-10",
      sourceId: "110",
      budgetPlanSourceId: "8",
      description: "Mensalidade TagPlus",
      dueDate: new Date("2026-04-10T00:00:00Z"),
      originalAmount: 318,
    });
    expect(tagplus.category).toBe("OPERATING_SOFTWARE");

    const ortiz = classifyFinancialRecordForDre({
      id: "rec-11",
      sourceId: "111",
      budgetPlanSourceId: "8",
      description: "Escritório Ortiz Contabilidade",
      dueDate: new Date("2026-04-10T00:00:00Z"),
      originalAmount: 786,
    });
    expect(ortiz.category).toBe("OPERATING_ACCOUNTING");
  });

  it("classifies Plano 8 insurance (11003) as administrative with financial income discount", () => {
    const seguro = classifyFinancialRecordForDre({
      id: "rec-12",
      sourceId: "11003",
      budgetPlanSourceId: "8",
      description: "Seguro Empresarial",
      dueDate: new Date("2026-06-15T00:00:00Z"),
      originalAmount: 99.9,
      discountAmount: 4.5,
      totalAmount: 95.4,
    });
    expect(seguro.category).toBe("OPERATING_ADMINISTRATIVE");
    expect(seguro.baseAmount).toBe(99.9);
    expect(seguro.financialAdjustment?.type).toBe("FINANCIAL_INCOME");
    expect(seguro.financialAdjustment?.amount).toBe(4.5);
  });

  it("classifies Plano 39 as OPERATING_PARTNER_COMPENSATION", () => {
    const res = classifyFinancialRecordForDre({
      id: "rec-13",
      sourceId: "113",
      budgetPlanSourceId: "39",
      description: "Retirada Pró-labore",
      dueDate: new Date("2026-05-05T00:00:00Z"),
      originalAmount: 6600,
    });
    expect(res.category).toBe("OPERATING_PARTNER_COMPENSATION");
    expect(res.isDeductibleInDre).toBe(true);
  });

  it("classifies Plano 23 and 32 as OPERATING_MARKETING", () => {
    const p23 = classifyFinancialRecordForDre({
      id: "rec-14",
      sourceId: "114",
      budgetPlanSourceId: "23",
      description: "Google Ads",
      dueDate: new Date("2026-05-10T00:00:00Z"),
      originalAmount: 2000,
    });
    expect(p23.category).toBe("OPERATING_MARKETING");

    const p32 = classifyFinancialRecordForDre({
      id: "rec-15",
      sourceId: "115",
      budgetPlanSourceId: "32",
      description: "Anúncios Meta",
      dueDate: new Date("2026-05-10T00:00:00Z"),
      originalAmount: 350,
    });
    expect(p32.category).toBe("OPERATING_MARKETING");
  });

  it("classifies Plano 2 audit-verified operational expenses as OPERATING_OTHER", () => {
    const cafe = classifyFinancialRecordForDre({
      id: "rec-16",
      sourceId: "10599",
      budgetPlanSourceId: "2",
      description: "Café para escritório",
      dueDate: new Date("2026-03-01T00:00:00Z"),
      originalAmount: 65,
    });
    expect(cafe.category).toBe("OPERATING_OTHER");
    expect(cafe.isDeductibleInDre).toBe(true);
  });

  it("classifies Plano 2 interest received as FINANCIAL_INCOME", () => {
    const juros = classifyFinancialRecordForDre({
      id: "rec-17",
      sourceId: "11362",
      budgetPlanSourceId: "2",
      description: "Juros recebidos de cliente",
      dueDate: new Date("2026-09-01T00:00:00Z"),
      originalAmount: 21.67,
    });
    expect(juros.category).toBe("FINANCIAL_INCOME");
    expect(juros.isDeductibleInDre).toBe(true);
  });

  it("does not classify unknown plans as other silently", () => {
    const unknown = classifyFinancialRecordForDre({
      id: "rec-18",
      sourceId: "999",
      budgetPlanSourceId: "999",
      description: "Despesa Misteriosa",
      dueDate: new Date("2026-04-01T00:00:00Z"),
      originalAmount: 500,
    });
    expect(unknown.category).toBe("UNKNOWN");
    expect(unknown.isDeductibleInDre).toBe(false);
  });
});
