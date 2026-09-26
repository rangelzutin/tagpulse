/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { createFinancialReferenceRepository } from "../src/modules/financial/financial-reference-repository.js";
import type {
  NormalizedBudgetPlan,
  NormalizedBankAccount,
  NormalizedPaymentMethod,
  NormalizedDepartment,
} from "../src/integrations/tagplus/financial/index.js";

function createInMemoryPrismaMock() {
  const budgetPlanTable = new Map<string, any>();
  const bankAccountTable = new Map<string, any>();
  const paymentMethodTable = new Map<string, any>();
  const departmentTable = new Map<string, any>();

  function createTableOperations(table: Map<string, any>, prefix: string) {
    return {
      async findMany({ where }: { where: { connectionId: string } }) {
        return Array.from(table.values()).filter(
          (r) => r.connectionId === where.connectionId,
        );
      },
      async create({ data }: { data: any }) {
        const key = `${data.connectionId}:${data.sourceId}`;
        const record = { ...data, id: `${prefix}-${data.sourceId}` };
        table.set(key, record);
        return record;
      },
      async update({
        where,
        data,
      }: {
        where: { connectionId_sourceId: { connectionId: string; sourceId: string } };
        data: any;
      }) {
        const key = `${where.connectionId_sourceId.connectionId}:${where.connectionId_sourceId.sourceId}`;
        const existing = table.get(key);
        if (!existing) throw new Error("Not found");
        const updated = { ...existing, ...data };
        table.set(key, updated);
        return updated;
      },
    };
  }

  const tx = {
    financialBudgetPlan: createTableOperations(budgetPlanTable, "fbp"),
    bankAccount: createTableOperations(bankAccountTable, "ba"),
    paymentMethod: createTableOperations(paymentMethodTable, "pm"),
    department: createTableOperations(departmentTable, "dep"),
  };

  return {
    ...tx,
    async $transaction<T>(fn: (txParam: any) => Promise<T>): Promise<T> {
      return fn(tx);
    },
    _tables: {
      budgetPlanTable,
      bankAccountTable,
      paymentMethodTable,
      departmentTable,
    },
  };
}

describe("Financial Reference Repository", () => {
  const connectionId = "conn-finance-1";

  describe("saveBudgetPlans", () => {
    it("handles initial insertion, self-referential hierarchy and position as string", async () => {
      const mockPrisma = createInMemoryPrismaMock();
      const repo = createFinancialReferenceRepository(mockPrisma as any);

      const plans: NormalizedBudgetPlan[] = [
        {
          sourceId: "1",
          parentSourceId: null,
          type: "E",
          description: "1 - RECEITAS",
          position: "1",
          isProtected: true,
          sourceDreClassification: null,
        },
        {
          sourceId: "39",
          parentSourceId: "2",
          type: "S",
          description: "Retirada Mensal",
          position: "2.10",
          isProtected: false,
          sourceDreClassification: null,
        },
        {
          sourceId: "2",
          parentSourceId: null,
          type: "S",
          description: "2 - DESPESAS",
          position: "2",
          isProtected: true,
          sourceDreClassification: null,
        },
      ];

      const res = await repo.saveBudgetPlans(connectionId, plans);
      expect(res.fetched).toBe(3);
      expect(res.inserted).toBe(3);
      expect(res.updated).toBe(0);
      expect(res.unchanged).toBe(0);
      expect(res.noLongerObserved).toBe(0);

      // Verify stored records
      const plan39 = mockPrisma._tables.budgetPlanTable.get(`${connectionId}:39`);
      expect(plan39).toBeDefined();
      expect(plan39.position).toBe("2.10");
      expect(plan39.parentSourceId).toBe("2");
      expect(plan39.sourcePresent).toBe(true);
      expect(plan39.noLongerObservedAt).toBeNull();
    });

    it("is idempotent on unchanged data and updates modified fields", async () => {
      const mockPrisma = createInMemoryPrismaMock();
      const repo = createFinancialReferenceRepository(mockPrisma as any);

      const plans: NormalizedBudgetPlan[] = [
        {
          sourceId: "1",
          parentSourceId: null,
          type: "E",
          description: "Receitas",
          position: "1",
          isProtected: true,
          sourceDreClassification: null,
        },
      ];

      // First run: insert
      await repo.saveBudgetPlans(connectionId, plans);

      // Second run: exactly same data -> unchanged
      const secondRes = await repo.saveBudgetPlans(connectionId, plans);
      expect(secondRes.inserted).toBe(0);
      expect(secondRes.updated).toBe(0);
      expect(secondRes.unchanged).toBe(1);

      // Third run: updated description
      const modifiedPlans = [
        {
          ...plans[0],
          description: "Receitas Operacionais Atualizadas",
        },
      ];
      const thirdRes = await repo.saveBudgetPlans(connectionId, modifiedPlans);
      expect(thirdRes.inserted).toBe(0);
      expect(thirdRes.updated).toBe(1);
      expect(thirdRes.unchanged).toBe(0);
    });

    it("marks disappeared items as sourcePresent=false and handles reappearance", async () => {
      const mockPrisma = createInMemoryPrismaMock();
      const repo = createFinancialReferenceRepository(mockPrisma as any);

      const t1 = new Date("2026-09-01T10:00:00Z");
      const t2 = new Date("2026-09-02T10:00:00Z");
      const t3 = new Date("2026-09-03T10:00:00Z");

      const planA: NormalizedBudgetPlan = {
        sourceId: "A",
        parentSourceId: null,
        type: "E",
        description: "Plan A",
        position: "1",
        isProtected: false,
        sourceDreClassification: null,
      };

      const planB: NormalizedBudgetPlan = {
        sourceId: "B",
        parentSourceId: null,
        type: "S",
        description: "Plan B",
        position: "2",
        isProtected: false,
        sourceDreClassification: null,
      };

      // Run 1: Both A and B observed
      await repo.saveBudgetPlans(connectionId, [planA, planB], t1);
      expect(mockPrisma._tables.budgetPlanTable.get(`${connectionId}:B`).sourcePresent).toBe(true);

      // Run 2: B disappeared from ERP
      const res2 = await repo.saveBudgetPlans(connectionId, [planA], t2);
      expect(res2.noLongerObserved).toBe(1);
      const recordB = mockPrisma._tables.budgetPlanTable.get(`${connectionId}:B`);
      expect(recordB.sourcePresent).toBe(false);
      expect(recordB.noLongerObservedAt).toEqual(t2);

      // Run 3: B reappeared in ERP
      const res3 = await repo.saveBudgetPlans(connectionId, [planA, planB], t3);
      expect(res3.updated).toBe(1); // B transitioned back from absent
      const reappearedB = mockPrisma._tables.budgetPlanTable.get(`${connectionId}:B`);
      expect(reappearedB.sourcePresent).toBe(true);
      expect(reappearedB.noLongerObservedAt).toBeNull();
      expect(reappearedB.lastSeenAt).toEqual(t3);
    });
  });

  describe("saveBankAccounts", () => {
    it("persists BankAccount with rawDetails and handles updates idempotently", async () => {
      const mockPrisma = createInMemoryPrismaMock();
      const repo = createFinancialReferenceRepository(mockPrisma as any);

      const accounts: NormalizedBankAccount[] = [
        {
          sourceId: "10",
          description: "Itaú Corrente",
          rawDetails: { banco: "341", custom: "val" },
        },
      ];

      const res1 = await repo.saveBankAccounts(connectionId, accounts);
      expect(res1.inserted).toBe(1);

      const stored = mockPrisma._tables.bankAccountTable.get(`${connectionId}:10`);
      expect(stored.description).toBe("Itaú Corrente");
      expect(stored.rawDetails).toEqual({ banco: "341", custom: "val" });

      const res2 = await repo.saveBankAccounts(connectionId, accounts);
      expect(res2.unchanged).toBe(1);
    });
  });

  describe("savePaymentMethods", () => {
    it("preserves sourceActive flag correctly and handles idempotency", async () => {
      const mockPrisma = createInMemoryPrismaMock();
      const repo = createFinancialReferenceRepository(mockPrisma as any);

      const methods: NormalizedPaymentMethod[] = [
        { sourceId: "1", description: "Boleto", sourceActive: true },
        { sourceId: "2", description: "Cheque", sourceActive: false },
      ];

      const res = await repo.savePaymentMethods(connectionId, methods);
      expect(res.inserted).toBe(2);

      const stored1 = mockPrisma._tables.paymentMethodTable.get(`${connectionId}:1`);
      const stored2 = mockPrisma._tables.paymentMethodTable.get(`${connectionId}:2`);
      expect(stored1.sourceActive).toBe(true);
      expect(stored2.sourceActive).toBe(false);

      const resUnchanged = await repo.savePaymentMethods(connectionId, methods);
      expect(resUnchanged.unchanged).toBe(2);
    });
  });

  describe("saveDepartments", () => {
    it("persists Department records idempotently", async () => {
      const mockPrisma = createInMemoryPrismaMock();
      const repo = createFinancialReferenceRepository(mockPrisma as any);

      const deps: NormalizedDepartment[] = [
        { sourceId: "1", description: "Comercial" },
        { sourceId: "2", description: "Logística" },
      ];

      const res = await repo.saveDepartments(connectionId, deps);
      expect(res.inserted).toBe(2);

      const res2 = await repo.saveDepartments(connectionId, deps);
      expect(res2.unchanged).toBe(2);
    });
  });
});
