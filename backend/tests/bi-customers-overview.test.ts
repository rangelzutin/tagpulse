import type { PrismaClient } from "@prisma/client";
import { Prisma, SaleAnchorType } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import {
  createBiRepository,
  type BiPeriodCustomerDoc,
  type BiRepository,
  type BiSaleRealizationRecord,
  type CustomerRecencySegment,
} from "../src/modules/bi/index.js";

interface RawTestDoc {
  id: string;
  saleId?: string;
  docType?: SaleAnchorType;
  sourcePresent?: boolean;
  netAmount?: string | number | Prisma.Decimal | null;
  realizedDate?: Date | null;
  customerId?: string | null;
  customer?: {
    id?: string;
    sourceId?: string;
    code?: string | null;
    legalName?: string | null;
    tradeName?: string | null;
  };
}

function createFakeCustomerBiRepository(docs: RawTestDoc[]): BiRepository {
  const isEligible = (doc: RawTestDoc): boolean => {
    const isPresent = doc.sourcePresent ?? true;
    if (!isPresent) return false;

    const dt = doc.docType ?? SaleAnchorType.NFE;
    if (dt !== SaleAnchorType.NFE && dt !== SaleAnchorType.VENDA_SIMPLES) {
      return false;
    }

    if (!doc.realizedDate) return false;
    if (doc.netAmount === null || doc.netAmount === undefined) return false;
    if (!doc.customerId) return false;

    return true;
  };

  return {
    async findRealizedSales() {
      return [];
    },

    async findPeriodCustomerDocuments(
      from: Date,
      toExclusive: Date,
    ): Promise<BiPeriodCustomerDoc[]> {
      const eligible = docs.filter((d) => {
        if (!isEligible(d)) return false;
        return d.realizedDate! >= from && d.realizedDate! < toExclusive;
      });

      return eligible.map((d) => ({
        id: d.id,
        saleId: d.saleId ?? d.id,
        customerId: d.customerId!,
        netAmount: new Prisma.Decimal(d.netAmount!),
        realizedDate: d.realizedDate!,
        customer: {
          id: d.customerId!,
          sourceId: d.customer?.sourceId ?? d.customerId!,
          code: d.customer?.code ?? null,
          legalName: d.customer?.legalName ?? null,
          tradeName: d.customer?.tradeName ?? null,
        },
      }));
    },

    async findSalesRealizationRecordsUntil(
      toExclusive: Date,
    ): Promise<BiSaleRealizationRecord[]> {
      const eligible = docs.filter((d) => {
        if (!isEligible(d)) return false;
        return d.realizedDate! < toExclusive;
      });

      return eligible.map((d) => ({
        saleId: d.saleId ?? d.id,
        customerId: d.customerId!,
        realizedDate: d.realizedDate!,
      }));
    },
  };
}

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function createApp(repository: BiRepository) {
  const app = await buildApp({
    databaseHealth: { check: vi.fn() },
    frontendUrl: "http://localhost:5173",
    logger: false,
    biRepository: repository,
  });
  apps.push(app);
  return app;
}

describe("GET /bi/customers/overview", () => {
  it("1. cliente sem histórico anterior, primeira compra no período => NEW", async () => {
    const repo = createFakeCustomerBiRepository([
      {
        id: "doc-1",
        saleId: "sale-1",
        customerId: "cust-new-1",
        netAmount: "250.00",
        realizedDate: new Date("2026-01-15T10:00:00.000Z"),
      },
    ]);

    const app = await createApp(repo);
    const res = await app.inject({
      method: "GET",
      url: "/bi/customers/overview?from=2026-01-01&to=2026-01-31",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.period).toEqual({
      from: "2026-01-01",
      to: "2026-01-31",
      asOfDate: "2026-01-31",
    });
    expect(body.customers.buyingCustomers).toBe(1);
    expect(body.customers.newCustomers).toBe(1);
    expect(body.customers.returningCustomers).toBe(0);
    expect(body.customers.recurrenceRate).toBe(0);
  });

  it("2. cliente com compra anterior ao período e compra no período => RETURNING", async () => {
    const repo = createFakeCustomerBiRepository([
      {
        id: "doc-old",
        saleId: "sale-old",
        customerId: "cust-ret-1",
        netAmount: "100.00",
        realizedDate: new Date("2025-11-20T10:00:00.000Z"),
      },
      {
        id: "doc-cur",
        saleId: "sale-cur",
        customerId: "cust-ret-1",
        netAmount: "300.00",
        realizedDate: new Date("2026-01-10T14:00:00.000Z"),
      },
    ]);

    const app = await createApp(repo);
    const res = await app.inject({
      method: "GET",
      url: "/bi/customers/overview?from=2026-01-01&to=2026-01-31",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.customers.buyingCustomers).toBe(1);
    expect(body.customers.newCustomers).toBe(0);
    expect(body.customers.returningCustomers).toBe(1);
    expect(body.customers.recurrenceRate).toBe(100);
  });

  it("3. cliente com duas Sales dentro do período mas nenhuma anterior => continua NEW", async () => {
    const repo = createFakeCustomerBiRepository([
      {
        id: "doc-1",
        saleId: "sale-first",
        customerId: "cust-new-multi",
        netAmount: "150.00",
        realizedDate: new Date("2026-01-05T10:00:00.000Z"),
      },
      {
        id: "doc-2",
        saleId: "sale-second",
        customerId: "cust-new-multi",
        netAmount: "200.00",
        realizedDate: new Date("2026-01-20T16:00:00.000Z"),
      },
    ]);

    const app = await createApp(repo);
    const res = await app.inject({
      method: "GET",
      url: "/bi/customers/overview?from=2026-01-01&to=2026-01-31",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.customers.buyingCustomers).toBe(1);
    expect(body.customers.newCustomers).toBe(1);
    expect(body.customers.returningCustomers).toBe(0);
    expect(body.customers.recurrenceRate).toBe(0);
  });

  it("4. uma mesma Sale com múltiplos documentos não duplica purchaseCount comportamental", async () => {
    const repo = createFakeCustomerBiRepository([
      {
        id: "doc-vs",
        saleId: "sale-split",
        docType: SaleAnchorType.VENDA_SIMPLES,
        customerId: "cust-1",
        netAmount: "100.00",
        realizedDate: new Date("2026-01-10T10:00:00.000Z"),
      },
      {
        id: "doc-nfe",
        saleId: "sale-split",
        docType: SaleAnchorType.NFE,
        customerId: "cust-1",
        netAmount: "150.00",
        realizedDate: new Date("2026-01-12T10:00:00.000Z"),
      },
    ]);

    const app = await createApp(repo);
    const res = await app.inject({
      method: "GET",
      url: "/bi/customers/overview?from=2026-01-01&to=2026-01-31",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.customers.buyingCustomers).toBe(1);
    expect(body.customers.newCustomers).toBe(1);
    expect(body.ranking).toHaveLength(1);
    expect(body.ranking[0].purchaseCount).toBe(1);
    expect(body.ranking[0].revenue).toBe(250.0);
    expect(body.ranking[0].averageTicket).toBe(250.0);
  });

  it("5. vendas sem customerId não entram nos KPIs de clientes nem no ranking", async () => {
    const repo = createFakeCustomerBiRepository([
      {
        id: "doc-with-cust",
        saleId: "sale-cust",
        customerId: "cust-valid",
        netAmount: "300.00",
        realizedDate: new Date("2026-01-15T12:00:00.000Z"),
      },
      {
        id: "doc-anon",
        saleId: "sale-anon",
        customerId: null,
        netAmount: "1000.00",
        realizedDate: new Date("2026-01-15T12:00:00.000Z"),
      },
    ]);

    const app = await createApp(repo);
    const res = await app.inject({
      method: "GET",
      url: "/bi/customers/overview?from=2026-01-01&to=2026-01-31",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.customers.buyingCustomers).toBe(1);
    expect(body.customers.newCustomers).toBe(1);
    expect(body.ranking).toHaveLength(1);
    expect(body.ranking[0].customerId).toBe("cust-valid");
    expect(body.ranking[0].revenue).toBe(300.0);
    expect(body.ranking[0].revenueSharePercent).toBe(100);
  });

  it("6. ranking ordena por faturamento decrescente com desempate por customerId ASC", async () => {
    const repo = createFakeCustomerBiRepository([
      {
        id: "d1",
        saleId: "s1",
        customerId: "cust-b",
        netAmount: "500.00",
        realizedDate: new Date("2026-01-10T10:00:00.000Z"),
        customer: { tradeName: "Cliente B" },
      },
      {
        id: "d2",
        saleId: "s2",
        customerId: "cust-a",
        netAmount: "500.00",
        realizedDate: new Date("2026-01-11T10:00:00.000Z"),
        customer: { tradeName: "Cliente A" },
      },
      {
        id: "d3",
        saleId: "s3",
        customerId: "cust-c",
        netAmount: "1200.00",
        realizedDate: new Date("2026-01-12T10:00:00.000Z"),
        customer: { tradeName: "Cliente C" },
      },
    ]);

    const app = await createApp(repo);
    const res = await app.inject({
      method: "GET",
      url: "/bi/customers/overview?from=2026-01-01&to=2026-01-31",
    });

    expect(res.statusCode).toBe(200);
    const ranking = res.json().ranking;
    expect(ranking).toHaveLength(3);
    expect(ranking[0].customerId).toBe("cust-c");
    expect(ranking[0].revenue).toBe(1200.0);
    expect(ranking[1].customerId).toBe("cust-a"); // empate desempata por customerId ASC
    expect(ranking[1].revenue).toBe(500.0);
    expect(ranking[2].customerId).toBe("cust-b");
    expect(ranking[2].revenue).toBe(500.0);
  });

  it("7. revenueShare e cumulativeRevenueShare estão corretos", async () => {
    // Total revenue = 1000:
    // C1: 600 (60%, cum 60%)
    // C2: 300 (30%, cum 90%)
    // C3: 100 (10%, cum 100%)
    const repo = createFakeCustomerBiRepository([
      {
        id: "d1",
        saleId: "s1",
        customerId: "c1",
        netAmount: "600.00",
        realizedDate: new Date("2026-01-10T10:00:00.000Z"),
      },
      {
        id: "d2",
        saleId: "s2",
        customerId: "c2",
        netAmount: "300.00",
        realizedDate: new Date("2026-01-11T10:00:00.000Z"),
      },
      {
        id: "d3",
        saleId: "s3",
        customerId: "c3",
        netAmount: "100.00",
        realizedDate: new Date("2026-01-12T10:00:00.000Z"),
      },
    ]);

    const app = await createApp(repo);
    const res = await app.inject({
      method: "GET",
      url: "/bi/customers/overview?from=2026-01-01&to=2026-01-31",
    });

    expect(res.statusCode).toBe(200);
    const ranking = res.json().ranking;
    expect(ranking[0].revenueSharePercent).toBe(60.0);
    expect(ranking[0].cumulativeRevenueSharePercent).toBe(60.0);

    expect(ranking[1].revenueSharePercent).toBe(30.0);
    expect(ranking[1].cumulativeRevenueSharePercent).toBe(90.0);

    expect(ranking[2].revenueSharePercent).toBe(10.0);
    expect(ranking[2].cumulativeRevenueSharePercent).toBe(100.0);
  });

  it("8. averageTicket usa Sales distintas realizadas", async () => {
    // Customer with 2 distinct Sales:
    // Sale 1: doc1 (100) + doc2 (100) = 200
    // Sale 2: doc3 (400) = 400
    // Total revenue = 600, purchaseCount = 2, averageTicket = 300
    const repo = createFakeCustomerBiRepository([
      {
        id: "d1",
        saleId: "sale-1",
        customerId: "cust-avg",
        netAmount: "100.00",
        realizedDate: new Date("2026-01-05T10:00:00.000Z"),
      },
      {
        id: "d2",
        saleId: "sale-1",
        customerId: "cust-avg",
        netAmount: "100.00",
        realizedDate: new Date("2026-01-06T10:00:00.000Z"),
      },
      {
        id: "d3",
        saleId: "sale-2",
        customerId: "cust-avg",
        netAmount: "400.00",
        realizedDate: new Date("2026-01-15T10:00:00.000Z"),
      },
    ]);

    const app = await createApp(repo);
    const res = await app.inject({
      method: "GET",
      url: "/bi/customers/overview?from=2026-01-01&to=2026-01-31",
    });

    expect(res.statusCode).toBe(200);
    const ranking = res.json().ranking;
    expect(ranking[0].revenue).toBe(600.0);
    expect(ranking[0].purchaseCount).toBe(2);
    expect(ranking[0].averageTicket).toBe(300.0);
  });

  it("9. faixas de recência nos limites 30, 60, 90 e 180 dias com normalização de calendário", async () => {
    // asOfDate = 2026-01-31
    // Limit cases:
    // c1: 2026-01-01 => diff = 30 days => falls in '0-30'
    // c2: 2025-12-31 => diff = 31 days => falls in '31-60'
    // c3: 2025-12-02 => diff = 60 days => falls in '31-60'
    // c4: 2025-12-01 => diff = 61 days => falls in '61-90'
    // c5: 2025-11-02 => diff = 90 days => falls in '61-90'
    // c6: 2025-11-01 => diff = 91 days => falls in '91-180'
    // c7: 2025-08-04 => diff = 180 days => falls in '91-180'
    // c8: 2025-08-03 => diff = 181 days => falls in '181+'
    const repo = createFakeCustomerBiRepository([
      {
        id: "d1",
        saleId: "s1",
        customerId: "c1",
        netAmount: "10.00",
        realizedDate: new Date("2026-01-01T23:59:59.000Z"),
      },
      {
        id: "d2",
        saleId: "s2",
        customerId: "c2",
        netAmount: "10.00",
        realizedDate: new Date("2025-12-31T01:00:00.000Z"),
      },
      {
        id: "d3",
        saleId: "s3",
        customerId: "c3",
        netAmount: "10.00",
        realizedDate: new Date("2025-12-02T12:00:00.000Z"),
      },
      {
        id: "d4",
        saleId: "s4",
        customerId: "c4",
        netAmount: "10.00",
        realizedDate: new Date("2025-12-01T08:00:00.000Z"),
      },
      {
        id: "d5",
        saleId: "s5",
        customerId: "c5",
        netAmount: "10.00",
        realizedDate: new Date("2025-11-02T18:00:00.000Z"),
      },
      {
        id: "d6",
        saleId: "s6",
        customerId: "c6",
        netAmount: "10.00",
        realizedDate: new Date("2025-11-01T15:00:00.000Z"),
      },
      {
        id: "d7",
        saleId: "s7",
        customerId: "c7",
        netAmount: "10.00",
        realizedDate: new Date("2025-08-04T12:00:00.000Z"),
      },
      {
        id: "d8",
        saleId: "s8",
        customerId: "c8",
        netAmount: "10.00",
        realizedDate: new Date("2025-08-03T12:00:00.000Z"),
      },
    ]);

    const app = await createApp(repo);
    const res = await app.inject({
      method: "GET",
      url: "/bi/customers/overview?from=2026-01-01&to=2026-01-31",
    });

    expect(res.statusCode).toBe(200);
    const recency = res.json().recency as CustomerRecencySegment[];

    const findBracket = (key: string) =>
      recency.find((r: CustomerRecencySegment) => r.key === key)!;

    expect(findBracket("0-30").customerCount).toBe(1);
    expect(findBracket("31-60").customerCount).toBe(2);
    expect(findBracket("61-90").customerCount).toBe(2);
    expect(findBracket("91-180").customerCount).toBe(2);
    expect(findBracket("181+").customerCount).toBe(1);

    // Total = 8 customers.
    // 1 / 8 = 12.5%
    // 2 / 8 = 25.0%
    expect(findBracket("0-30").percentage).toBe(12.5);
    expect(findBracket("31-60").percentage).toBe(25.0);
    expect(findBracket("61-90").percentage).toBe(25.0);
    expect(findBracket("91-180").percentage).toBe(25.0);
    expect(findBracket("181+").percentage).toBe(12.5);
  });

  it("10. recência histórica usa 'to'/asOfDate e não a data atual", async () => {
    // If asOfDate is 2025-06-30:
    // A sale on 2025-06-25 is 5 days ago (falls in 0-30), NOT hundreds of days ago from now!
    const repo = createFakeCustomerBiRepository([
      {
        id: "d-past",
        saleId: "s-past",
        customerId: "c-past",
        netAmount: "100.00",
        realizedDate: new Date("2025-06-25T10:00:00.000Z"),
      },
    ]);

    const app = await createApp(repo);
    const res = await app.inject({
      method: "GET",
      url: "/bi/customers/overview?from=2025-06-01&to=2025-06-30",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.period.asOfDate).toBe("2025-06-30");
    const seg0_30 = (body.recency as CustomerRecencySegment[]).find(
      (r: CustomerRecencySegment) => r.key === "0-30",
    )!;
    expect(seg0_30.customerCount).toBe(1);
    expect(seg0_30.percentage).toBe(100.0);
  });

  it("11. documentos fora dos critérios de realização continuam excluídos", async () => {
    const repo = createFakeCustomerBiRepository([
      {
        id: "d-pedido",
        saleId: "s-ped",
        docType: SaleAnchorType.PEDIDO,
        sourcePresent: true,
        customerId: "c-ped",
        netAmount: "500.00",
        realizedDate: new Date("2026-01-10T10:00:00.000Z"),
      },
      {
        id: "d-absent",
        saleId: "s-abs",
        docType: SaleAnchorType.NFE,
        sourcePresent: false,
        customerId: "c-abs",
        netAmount: "500.00",
        realizedDate: new Date("2026-01-10T10:00:00.000Z"),
      },
      {
        id: "d-null-amount",
        saleId: "s-null",
        docType: SaleAnchorType.NFE,
        sourcePresent: true,
        customerId: "c-null",
        netAmount: null,
        realizedDate: new Date("2026-01-10T10:00:00.000Z"),
      },
    ]);

    const app = await createApp(repo);
    const res = await app.inject({
      method: "GET",
      url: "/bi/customers/overview?from=2026-01-01&to=2026-01-31",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.customers.buyingCustomers).toBe(0);
    expect(body.customers.newCustomers).toBe(0);
    expect(body.customers.returningCustomers).toBe(0);
    expect(body.ranking).toEqual([]);
    expect(
      (body.recency as CustomerRecencySegment[]).every(
        (r: CustomerRecencySegment) => r.customerCount === 0,
      ),
    ).toBe(true);
  });

  it("12. displayName fallback preferencial (tradeName -> legalName -> code -> sourceId)", async () => {
    const repo = createFakeCustomerBiRepository([
      {
        id: "d1",
        saleId: "s1",
        customerId: "c1",
        netAmount: "100.00",
        realizedDate: new Date("2026-01-10T10:00:00.000Z"),
        customer: { tradeName: "Fantasia", legalName: "Razao", code: "COD1" },
      },
      {
        id: "d2",
        saleId: "s2",
        customerId: "c2",
        netAmount: "90.00",
        realizedDate: new Date("2026-01-10T10:00:00.000Z"),
        customer: { tradeName: "", legalName: "Razao Sem Fantasia", code: "COD2" },
      },
      {
        id: "d3",
        saleId: "s3",
        customerId: "c3",
        netAmount: "80.00",
        realizedDate: new Date("2026-01-10T10:00:00.000Z"),
        customer: { tradeName: null, legalName: null, code: "COD3", sourceId: "SRC3" },
      },
    ]);

    const app = await createApp(repo);
    const res = await app.inject({
      method: "GET",
      url: "/bi/customers/overview?from=2026-01-01&to=2026-01-31",
    });

    expect(res.statusCode).toBe(200);
    const ranking = res.json().ranking;
    expect(ranking[0].displayName).toBe("Fantasia");
    expect(ranking[1].displayName).toBe("Razao Sem Fantasia");
    expect(ranking[2].displayName).toBe("COD3");
  });

  it("13. mesma Sale com documentos realizados em períodos diferentes", async () => {
    // Sale X:
    // - Venda Simples realizada em 2026-01-28 (netAmount: 1000)
    // - NFe realizada em 2026-02-05 (netAmount: 2000)
    // Cliente: cust-x (novo em janeiro)
    const repo = createFakeCustomerBiRepository([
      {
        id: "doc-vs-jan",
        saleId: "sale-x",
        docType: SaleAnchorType.VENDA_SIMPLES,
        customerId: "cust-x",
        netAmount: "1000.00",
        realizedDate: new Date("2026-01-28T14:00:00.000Z"),
      },
      {
        id: "doc-nfe-feb",
        saleId: "sale-x",
        docType: SaleAnchorType.NFE,
        customerId: "cust-x",
        netAmount: "2000.00",
        realizedDate: new Date("2026-02-05T10:00:00.000Z"),
      },
    ]);

    const app = await createApp(repo);

    // Consulta de JANEIRO/2026:
    const resJan = await app.inject({
      method: "GET",
      url: "/bi/customers/overview?from=2026-01-01&to=2026-01-31",
    });
    expect(resJan.statusCode).toBe(200);
    const bodyJan = resJan.json();

    // Em janeiro:
    // - faturamento realizado no período = 1000
    // - cliente comprou no período, é NEW (primeira compra em 2026-01-28)
    expect(bodyJan.customers.buyingCustomers).toBe(1);
    expect(bodyJan.customers.newCustomers).toBe(1);
    expect(bodyJan.customers.returningCustomers).toBe(0);
    expect(bodyJan.ranking[0].revenue).toBe(1000.0);
    expect(bodyJan.ranking[0].purchaseCount).toBe(1);

    // Consulta de FEVEREIRO/2026:
    const resFeb = await app.inject({
      method: "GET",
      url: "/bi/customers/overview?from=2026-02-01&to=2026-02-28",
    });
    expect(resFeb.statusCode).toBe(200);
    const bodyFeb = resFeb.json();

    // Em fevereiro:
    // - faturamento financeiro do documento realizado em fevereiro = 2000
    // - ranking financeiro possui revenue = 2000 e purchaseCount = 1 (contributingSaleCount)
    expect(bodyFeb.ranking).toHaveLength(1);
    expect(bodyFeb.ranking[0].revenue).toBe(2000.0);
    expect(bodyFeb.ranking[0].purchaseCount).toBe(1);

    // - COMPORTAMENTO:
    // saleRealizedDate da Sale X é 2026-01-28 (MIN).
    // Como 2026-01-28 não está em fevereiro, a Sale X NÃO gera compra comportamental em fevereiro!
    // Logo, o cliente NÃO comprou comportamentalmente em fevereiro (buyingCustomers = 0).
    expect(bodyFeb.customers.buyingCustomers).toBe(0);
    expect(bodyFeb.customers.newCustomers).toBe(0);
    expect(bodyFeb.customers.returningCustomers).toBe(0);
    expect(bodyFeb.customers.recurrenceRate).toBe(0);

    // - RECÊNCIA em 2026-02-28:
    // lastSaleDate usa a data comportamental da Sale (2026-01-28), NÃO a data do doc de fev (2026-02-05)!
    // Diff entre 2026-02-28 e 2026-01-28 = 31 dias!
    // 31 dias entra na faixa '31-60' (e NÃO na faixa '0-30' que seria se usasse 05/fev, pois 28/fev - 05/fev = 23 dias)!
    const recencyList = bodyFeb.recency as CustomerRecencySegment[];
    const seg0_30 = recencyList.find(
      (r: CustomerRecencySegment) => r.key === "0-30",
    )!;
    const seg31_60 = recencyList.find(
      (r: CustomerRecencySegment) => r.key === "31-60",
    )!;
    expect(seg0_30.customerCount).toBe(0);
    expect(seg31_60.customerCount).toBe(1);
  });

  describe("validação de parâmetros de entrada", () => {
    it("rejeita quando 'from' está ausente", async () => {
      const app = await createApp(createFakeCustomerBiRepository([]));
      const res = await app.inject({
        method: "GET",
        url: "/bi/customers/overview?to=2026-01-31",
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().status).toBe("error");
    });

    it("rejeita quando 'to' está ausente", async () => {
      const app = await createApp(createFakeCustomerBiRepository([]));
      const res = await app.inject({
        method: "GET",
        url: "/bi/customers/overview?from=2026-01-01",
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().status).toBe("error");
    });

    it("rejeita formato de data malformado", async () => {
      const app = await createApp(createFakeCustomerBiRepository([]));
      const res = await app.inject({
        method: "GET",
        url: "/bi/customers/overview?from=2026/01/01&to=2026-01-31",
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().status).toBe("error");
    });

    it("rejeita quando 'from' é posterior a 'to'", async () => {
      const app = await createApp(createFakeCustomerBiRepository([]));
      const res = await app.inject({
        method: "GET",
        url: "/bi/customers/overview?from=2026-02-01&to=2026-01-31",
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().status).toBe("error");
    });
  });

  describe("createBiRepository Prisma queries para clientes", () => {
    it("executa consultas findPeriodCustomerDocuments e findSalesRealizationRecordsUntil", async () => {
      const findManyMock = vi
        .fn()
        .mockResolvedValueOnce([
          {
            id: "doc-1",
            saleId: "sale-1",
            netAmount: new Prisma.Decimal("150.00"),
            realizedDate: new Date("2026-01-15T00:00:00.000Z"),
            sale: {
              customerId: "cust-1",
              customer: {
                id: "cust-1",
                sourceId: "src-1",
                code: "C01",
                legalName: "Empresa Real Ltda",
                tradeName: "Empresa Real",
              },
            },
          },
        ])
        .mockResolvedValueOnce([
          {
            saleId: "sale-1",
            realizedDate: new Date("2026-01-15T00:00:00.000Z"),
            sale: {
              customerId: "cust-1",
            },
          },
        ]);

      const mockPrisma = {
        saleSourceDocument: {
          findMany: findManyMock,
        },
      } as unknown as PrismaClient;

      const repository = createBiRepository(mockPrisma);
      const from = new Date("2026-01-01T00:00:00.000Z");
      const toExclusive = new Date("2026-02-01T00:00:00.000Z");

      const periodDocs = await repository.findPeriodCustomerDocuments!(from, toExclusive);
      expect(periodDocs).toHaveLength(1);
      expect(periodDocs[0].customerId).toBe("cust-1");
      expect(periodDocs[0].customer.tradeName).toBe("Empresa Real");

      const histDocs = await repository.findSalesRealizationRecordsUntil!(toExclusive);
      expect(histDocs).toHaveLength(1);
      expect(histDocs[0].saleId).toBe("sale-1");
      expect(histDocs[0].customerId).toBe("cust-1");
    });
  });
});
