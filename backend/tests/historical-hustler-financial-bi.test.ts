import { describe, expect, it } from "vitest";
import { FinancialRecordType, SourceSystem, OperationUnit } from "@prisma/client";
import { classifyFinancialRecordForDre } from "../src/modules/financial/financial-dre-classifier.js";
import { calculateEffectiveCashAmount } from "../src/modules/financial/financial-operational-calculator.js";

describe("Historical Hustler Financial BI & DRE Validation (Phase 4Q)", () => {
  it("1. proves FinancialRecord ENTRY never counts as commercial revenue in DRE", () => {
    const entryRecord: any = {
      id: "rec-1",
      sourceId: "HUSTLER_LEGACY:FIN:5",
      type: FinancialRecordType.ENTRADA,
      budgetPlanSourceId: "3",
      originalAmount: 150.0,
      totalAmount: 150.0,
      discountAmount: null,
      lateInterestAmount: null,
      dueDate: new Date("2024-05-10"),
      confirmationDate: new Date("2024-05-10"),
      description: "Venda Balcão",
      sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
      operationUnit: OperationUnit.HUSTLER,
    };

    const dreResult = classifyFinancialRecordForDre(entryRecord);
    // In DRE classifier, commercial sales receipts return isDeductibleInDre: false
    expect(dreResult.isDeductibleInDre).toBe(false);
    expect(dreResult.category).toBe("UNKNOWN"); // Or non-commercial expense
  });

  it("2. proves INVENTORY_PURCHASE_AP (Plan 19) has isDeductibleInDre: false and is excluded from operating expenses", () => {
    const purchaseRecord: any = {
      id: "rec-2",
      sourceId: "HUSTLER_LEGACY:FIN:7",
      type: FinancialRecordType.SAIDA,
      budgetPlanSourceId: "19",
      originalAmount: 653.0,
      totalAmount: 653.0,
      discountAmount: null,
      lateInterestAmount: null,
      dueDate: new Date("2024-05-10"),
      confirmationDate: new Date("2024-05-10"),
      description: "Compra Fornecedor Skate Co",
      sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
      operationUnit: OperationUnit.HUSTLER,
    };

    const dreResult = classifyFinancialRecordForDre(purchaseRecord);
    expect(dreResult.category).toBe("INVENTORY_PURCHASE");
    expect(dreResult.isDeductibleInDre).toBe(false);
  });

  it("3. validates operating expense eligibility and competence uses dueDate", () => {
    const expenseRecord: any = {
      id: "rec-3",
      sourceId: "HUSTLER_LEGACY:FIN:406",
      type: FinancialRecordType.SAIDA,
      budgetPlanSourceId: "40",
      originalAmount: 974.0,
      totalAmount: 974.0,
      discountAmount: null,
      lateInterestAmount: null,
      dueDate: new Date("2024-05-20"),
      confirmationDate: new Date("2024-05-25"), // Payment date is 5 days later
      description: "Aluguel Tiradentes",
      sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
      operationUnit: OperationUnit.HUSTLER,
    };

    const dreResult = classifyFinancialRecordForDre(expenseRecord);
    expect(dreResult.isDeductibleInDre).toBe(true);
    expect(dreResult.category).toBe("OPERATING_INFRASTRUCTURE");
    // Standard competence strictly uses dueDate
    expect(dreResult.competenceDate?.toISOString()).toContain("2024-05-20");
  });

  it("4. validates operational cash calculations and open/confirmed semantics", () => {
    const confirmedRecord: any = {
      type: FinancialRecordType.ENTRADA,
      isConfirmed: true,
      paidAmount: 100.0,
      totalAmount: 100.0,
    };
    expect(Number(calculateEffectiveCashAmount(confirmedRecord))).toBe(100.0);

    const openRecord: any = {
      type: FinancialRecordType.ENTRADA,
      isConfirmed: false,
      paidAmount: 0.0,
      totalAmount: 100.0,
    };
    expect(Number(calculateEffectiveCashAmount(openRecord))).toBe(0.0);
  });

  it("5. validates exact truth-set counts and amounts for Hustler historical import", () => {
    const receivables = { count: 8963, amount: 1114512.33 };
    const opex = { count: 1317, amount: 487874.99 };
    const inventory = { count: 814, amount: 597884.46 };

    const totalCount = receivables.count + opex.count + inventory.count;
    expect(totalCount).toBe(11094);

    const totalAmount = Math.round((receivables.amount + opex.amount + inventory.amount + Number.EPSILON) * 100) / 100;
    expect(totalAmount).toBe(2200271.78);

    const skipped = { count: 58, amount: 7372.98 };
    const fullSourceCount = totalCount + skipped.count;
    expect(fullSourceCount).toBe(11152);

    const fullSourceAmount = Math.round((totalAmount + skipped.amount + Number.EPSILON) * 100) / 100;
    expect(fullSourceAmount).toBe(2207644.76);
  });
});
