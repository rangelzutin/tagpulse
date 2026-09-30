import { Prisma } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import type {
  FinancialOperationalRepository,
  FinancialOperationalService,
  PayablesListItem,
  ReceivablesListItem,
} from "../src/modules/financial/index.js";
import { createFinancialOperationalService } from "../src/modules/financial/index.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function createMockRepository(): FinancialOperationalRepository {
  const mockReceivables: ReceivablesListItem[] = [
    {
      sourceId: "rec-1",
      description: "Venda #101",
      documentNumber: "DOC-101",
      entitySourceId: "ent-1",
      entityName: "Skate Shop ABC",
      dueDate: "2026-09-20",
      confirmationDate: null,
      totalAmount: 500.0,
      effectiveCashAmount: null,
      status: "OVERDUE",
      installmentNumber: 1,
      installmentCount: 1,
      paymentMethodSourceId: "pm-1",
      budgetPlanSourceId: "bp-1",
    },
    {
      sourceId: "rec-2",
      description: "Venda #102",
      documentNumber: "DOC-102",
      entitySourceId: "ent-2",
      entityName: "Cliente Particular",
      dueDate: "2026-09-27",
      confirmationDate: null,
      totalAmount: 250.0,
      effectiveCashAmount: null,
      status: "DUE_TODAY",
      installmentNumber: 1,
      installmentCount: 2,
      paymentMethodSourceId: "pm-2",
      budgetPlanSourceId: null,
    },
    {
      sourceId: "rec-3",
      description: "Venda #103",
      documentNumber: null,
      entitySourceId: "ent-3",
      entityName: "Distribuidora XYZ",
      dueDate: "2026-10-10",
      confirmationDate: null,
      totalAmount: 1200.0,
      effectiveCashAmount: null,
      status: "FUTURE",
      installmentNumber: null,
      installmentCount: null,
      paymentMethodSourceId: null,
      budgetPlanSourceId: null,
    },
    {
      sourceId: "rec-4",
      description: "Venda Confirmada",
      documentNumber: "DOC-104",
      entitySourceId: "ent-1",
      entityName: "Skate Shop ABC",
      dueDate: "2026-09-15",
      confirmationDate: "2026-09-16",
      totalAmount: 350.0,
      effectiveCashAmount: 350.0,
      status: "CONFIRMED",
      installmentNumber: 1,
      installmentCount: 1,
      paymentMethodSourceId: "pm-1",
      budgetPlanSourceId: null,
    },
  ];

  const mockPayables: PayablesListItem[] = [
    {
      sourceId: "pay-1",
      description: "Fornecedor Madeiras",
      documentNumber: "NF-999",
      entitySourceId: "ent-forn-1",
      entityName: "Madeiras do Sul",
      dueDate: "2026-09-25",
      confirmationDate: null,
      totalAmount: 650.0,
      effectiveCashAmount: null,
      status: "OVERDUE",
      budgetPlanSourceId: "bp-materia-prima",
      budgetPlanDescription: "Matéria-prima",
      paymentMethodSourceId: "pm-boleto",
      departmentSourceId: "dept-fabrica",
      installmentNumber: 1,
      installmentCount: 1,
      installments: { number: 1, count: 1 },
    },
  ];

  return {
    async findOpenRecordsForSummary(type) {
      if (type === "ENTRADA") {
        return [
          { dueDate: new Date("2026-09-20T00:00:00Z"), totalAmount: new Prisma.Decimal("500.00"), isConfirmed: false },
          { dueDate: new Date("2026-09-27T00:00:00Z"), totalAmount: new Prisma.Decimal("250.00"), isConfirmed: false },
          { dueDate: new Date("2026-10-10T00:00:00Z"), totalAmount: new Prisma.Decimal("1200.00"), isConfirmed: false },
        ];
      }
      return [
        { dueDate: new Date("2026-09-25T00:00:00Z"), totalAmount: new Prisma.Decimal("650.00"), isConfirmed: false },
      ];
    },

    async findReceivablesList(params) {
      let filtered = [...mockReceivables];
      const statusFilter = params.status ?? "OPEN";
      if (statusFilter === "OPEN") {
        filtered = filtered.filter((r) => r.status !== "CONFIRMED");
      } else if (statusFilter !== "ALL") {
        filtered = filtered.filter((r) => r.status === statusFilter);
      }
      if (params.search) {
        const s = params.search.toLowerCase();
        filtered = filtered.filter((r) => r.entityName?.toLowerCase().includes(s));
      }

      const total = filtered.length;
      const page = Number(params.page) || 1;
      const pageSize = Number(params.pageSize) || 50;

      return {
        items: filtered,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    },

    async findPayablesList() {
      return {
        items: mockPayables,
        total: mockPayables.length,
        page: 1,
        pageSize: 50,
        totalPages: 1,
      };
    },

    async findConfirmedCashRecords() {
      return [
        {
          sourceId: "c-1",
          type: "ENTRADA",
          confirmationDate: new Date("2026-01-15T00:00:00Z"),
          paidAmount: new Prisma.Decimal("1500.00"),
          totalAmount: new Prisma.Decimal("1500.00"),
          isConfirmed: true,
          isTransfer: false,
          sourcePresent: true,
        },
        {
          sourceId: "c-2",
          type: "SAIDA",
          confirmationDate: new Date("2026-01-20T00:00:00Z"),
          paidAmount: new Prisma.Decimal("500.00"),
          totalAmount: new Prisma.Decimal("500.00"),
          isConfirmed: true,
          isTransfer: false,
          sourcePresent: true,
        },
        // Undated record
        {
          sourceId: "c-undated",
          type: "ENTRADA",
          confirmationDate: null,
          paidAmount: new Prisma.Decimal(0),
          totalAmount: new Prisma.Decimal("770.00"),
          isConfirmed: true,
          isTransfer: false,
          sourcePresent: true,
        },
      ];
    },

    async findUndatedConfirmedCashRecords() {
      return [
        {
          sourceId: "c-undated",
          type: "ENTRADA",
          description: "Pagamento confirmado via Inter",
          documentNumber: null,
          entityName: "Cliente Sem Data",
          dueDate: "2026-08-17",
          totalAmount: 770.0,
          effectiveCashAmount: 770.0,
          paidAmount: 0,
        },
      ];
    },

    async findExcludedNonCashStockAdjustmentSummary() {
      return { count: 0, amount: 0 };
    },

    async findBudgetPlanMap() {
      return new Map([["bp-materia-prima", "Matéria-prima"]]);
    },
  };
}

async function createTestApp(service?: FinancialOperationalService) {
  const repo = createMockRepository();
  const serv = service ?? createFinancialOperationalService(repo, {
    getNow: () => new Date("2026-09-27T12:00:00Z"),
  });

  const app = await buildApp({
    databaseHealth: { check: vi.fn() },
    frontendUrl: "http://localhost:5173",
    logger: false,
    financialService: serv,
  });
  apps.push(app);
  return app;
}

describe("Financial Operational Routes — Contracts and Integration", () => {
  describe("GET /financial/receivables/overview", () => {
    it("returns 200 with canonical summary and aging", async () => {
      const app = await createTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/financial/receivables/overview?referenceDate=2026-09-27",
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.type).toBe("ENTRADA");
      expect(data.referenceDate).toBe("2026-09-27");
      expect(data.openCount).toBe(3);
      expect(data.openTotal).toBe(1950.0);
      expect(data.overdueCount).toBe(1);
      expect(data.overdueTotal).toBe(500.0);
      expect(data.dueTodayCount).toBe(1);
      expect(data.dueTodayTotal).toBe(250.0);
      expect(data.futureCount).toBe(1);
      expect(data.futureTotal).toBe(1200.0);
      expect(data.aging.d1_30.count).toBe(1);
      expect(data.aging.d1_30.total).toBe(500.0);
    });

    it("rejects invalid referenceDate with 400", async () => {
      const app = await createTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/financial/receivables/overview?referenceDate=invalid-date",
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().status).toBe("error");
    });
  });

  describe("GET /financial/receivables", () => {
    it("returns 200 with paginated list and filtered fields (no sourcePayload)", async () => {
      const app = await createTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/financial/receivables?status=OPEN&referenceDate=2026-09-27",
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.items).toHaveLength(3);
      expect(data.total).toBe(3);
      expect(data.page).toBe(1);
      expect(data.pageSize).toBe(50);

      // Verify returned fields and omission of sourcePayload
      const first = data.items[0];
      expect(first).toHaveProperty("sourceId");
      expect(first).toHaveProperty("description");
      expect(first).toHaveProperty("documentNumber");
      expect(first).toHaveProperty("entityName");
      expect(first).toHaveProperty("dueDate");
      expect(first).toHaveProperty("totalAmount");
      expect(first).toHaveProperty("status");
      expect(first).not.toHaveProperty("sourcePayload");
    });

    it("filters by status=OVERDUE", async () => {
      const app = await createTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/financial/receivables?status=OVERDUE&referenceDate=2026-09-27",
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.items).toHaveLength(1);
      expect(data.items[0].sourceId).toBe("rec-1");
      expect(data.items[0].status).toBe("OVERDUE");
    });

    it("filters by entity search", async () => {
      const app = await createTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/financial/receivables?search=Skate&referenceDate=2026-09-27",
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.items).toHaveLength(1);
      expect(data.items[0].entityName).toBe("Skate Shop ABC");
    });
  });

  describe("GET /financial/payables/overview", () => {
    it("returns 200 with payables summary and aging", async () => {
      const app = await createTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/financial/payables/overview?referenceDate=2026-09-27",
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.type).toBe("SAIDA");
      expect(data.openCount).toBe(1);
      expect(data.openTotal).toBe(650.0);
      expect(data.overdueCount).toBe(1);
      expect(data.overdueTotal).toBe(650.0);
    });
  });

  describe("GET /financial/payables", () => {
    it("returns 200 with payables list containing budgetPlan and department info", async () => {
      const app = await createTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/financial/payables?referenceDate=2026-09-27",
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.items).toHaveLength(1);
      const item = data.items[0];
      expect(item.sourceId).toBe("pay-1");
      expect(item.budgetPlanSourceId).toBe("bp-materia-prima");
      expect(item.budgetPlanDescription).toBe("Matéria-prima");
      expect(item.departmentSourceId).toBe("dept-fabrica");
      expect(item.paymentMethodSourceId).toBe("pm-boleto");
      expect(item.installments).toEqual({ number: 1, count: 1 });
    });
  });

  describe("GET /financial/cash-flow/overview", () => {
    it("returns 200 with monthly timeseries and undated summary", async () => {
      const app = await createTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/financial/cash-flow/overview?granularity=month",
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.granularity).toBe("month");
      expect(data.series).toHaveLength(1);
      expect(data.series[0]).toEqual({
        period: "2026-01",
        inflows: 1500.0,
        outflows: 500.0,
        netCashFlow: 1000.0,
        inflowCount: 1,
        outflowCount: 1,
        totalCount: 2,
      });

      // Undated summary
      expect(data.undated).toEqual({
        undatedConfirmedCount: 1,
        undatedConfirmedInflows: 770.0,
        undatedConfirmedOutflows: 0.0,
        undatedConfirmedNet: 770.0,
      });

      // Excluded non-cash adjustments summary
      expect(data.excludedNonCashStockAdjustments).toEqual({
        count: 0,
        amount: 0,
      });
    });

    it("rejects invalid granularity with 400", async () => {
      const app = await createTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/financial/cash-flow/overview?granularity=year",
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("granularity");
    });
  });

  describe("GET /financial/cash-flow/undated", () => {
    it("returns 200 with undated records audit trail and summary", async () => {
      const app = await createTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/financial/cash-flow/undated",
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.summary.undatedConfirmedCount).toBe(1);
      expect(data.summary.undatedConfirmedInflows).toBe(770.0);
      expect(data.records).toHaveLength(1);
      expect(data.records[0].sourceId).toBe("c-undated");
      expect(data.records[0].effectiveCashAmount).toBe(770.0);
    });
  });
});
