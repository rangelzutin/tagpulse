import type { PrismaClient } from "@prisma/client";
import { Prisma, SaleAnchorType } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import {
  createBiRepository,
  type BiRepository,
  type BiSaleRecord,
} from "../src/modules/bi/index.js";

interface RawTestDocument {
  id: string;
  docType?: SaleAnchorType;
  sourcePresent?: boolean;
  netAmount?: string | number | Prisma.Decimal | null;
  realizedDate?: Date | null;
  customerId?: string | null;
  // Backwards compatibility for existing tests using previous shape:
  commercialDate?: Date | null;
  sourceDocs?: Array<{
    docType: SaleAnchorType;
    sourcePresent: boolean;
  }>;
}

function createFakeBiRepository(docs: RawTestDocument[]): BiRepository {
  return {
    async findRealizedSales(from: Date, toExclusive: Date): Promise<BiSaleRecord[]> {
      const matching = docs.filter((doc) => {
        const isPresent =
          doc.sourcePresent ??
          (doc.sourceDocs ? doc.sourceDocs.some((d) => d.sourcePresent) : true);
        if (!isPresent) return false;

        const effectiveDocType =
          doc.docType ??
          (doc.sourceDocs ? doc.sourceDocs.find((d) => d.sourcePresent)?.docType : undefined);
        if (
          effectiveDocType !== SaleAnchorType.NFE &&
          effectiveDocType !== SaleAnchorType.VENDA_SIMPLES
        ) {
          return false;
        }

        const effectiveRealizedDate =
          doc.realizedDate !== undefined ? doc.realizedDate : doc.commercialDate;
        if (!effectiveRealizedDate) return false;

        if (doc.netAmount === null || doc.netAmount === undefined) return false;

        if (effectiveRealizedDate < from || effectiveRealizedDate >= toExclusive) {
          return false;
        }
        return true;
      });

      return matching.map((d) => {
        const effectiveRealizedDate =
          d.realizedDate !== undefined ? d.realizedDate : d.commercialDate;
        return {
          id: d.id,
          netAmount: new Prisma.Decimal(d.netAmount!),
          customerId: d.customerId ?? null,
          commercialDate: effectiveRealizedDate!,
        };
      });
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

describe("GET /bi/sales/overview", () => {
  it("Sale com NFE presente entra", async () => {
    const fakeRepo = createFakeBiRepository([
      {
        id: "sale-nfe-1",
        netAmount: "150.75",
        customerId: "cust-1",
        commercialDate: new Date("2026-05-10T14:00:00.000Z"),
        sourceDocs: [
          { docType: SaleAnchorType.NFE, sourcePresent: true },
        ],
      },
    ]);

    const app = await createApp(fakeRepo);
    const res = await app.inject({
      method: "GET",
      url: "/bi/sales/overview?from=2026-05-01&to=2026-05-31",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.period).toEqual({ from: "2026-05-01", to: "2026-05-31" });
    expect(body.summary.sales).toBe(1);
    expect(body.summary.revenue).toBe(150.75);
    expect(body.summary.avgTicket).toBe(150.75);
    expect(body.summary.customers).toBe(1);
    expect(body.summary.salesWithoutCustomer).toBe(0);
  });

  it("Sale com VENDA_SIMPLES presente entra", async () => {
    const fakeRepo = createFakeBiRepository([
      {
        id: "sale-vs-1",
        netAmount: "89.90",
        customerId: "cust-1",
        commercialDate: new Date("2026-05-15T10:00:00.000Z"),
        sourceDocs: [
          { docType: SaleAnchorType.VENDA_SIMPLES, sourcePresent: true },
        ],
      },
    ]);

    const app = await createApp(fakeRepo);
    const res = await app.inject({
      method: "GET",
      url: "/bi/sales/overview?from=2026-05-01&to=2026-05-31",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.summary.sales).toBe(1);
    expect(body.summary.revenue).toBe(89.9);
  });

  it("Sale somente com PEDIDO presente não entra", async () => {
    const fakeRepo = createFakeBiRepository([
      {
        id: "sale-pedido-only",
        netAmount: "500.00",
        customerId: "cust-1",
        commercialDate: new Date("2026-05-10T12:00:00.000Z"),
        sourceDocs: [
          { docType: SaleAnchorType.PEDIDO, sourcePresent: true },
        ],
      },
    ]);

    const app = await createApp(fakeRepo);
    const res = await app.inject({
      method: "GET",
      url: "/bi/sales/overview?from=2026-05-01&to=2026-05-31",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.summary.sales).toBe(0);
    expect(body.summary.revenue).toBe(0);
    expect(body.summary.avgTicket).toBe(0);
    expect(body.summary.customers).toBe(0);
    expect(body.monthly).toEqual([]);
  });

  it("documento com sourcePresent=false não qualifica a Sale", async () => {
    const fakeRepo = createFakeBiRepository([
      {
        id: "sale-absent-nfe",
        netAmount: "300.00",
        customerId: "cust-1",
        commercialDate: new Date("2026-05-10T12:00:00.000Z"),
        sourceDocs: [
          { docType: SaleAnchorType.NFE, sourcePresent: false },
          { docType: SaleAnchorType.VENDA_SIMPLES, sourcePresent: false },
          { docType: SaleAnchorType.PEDIDO, sourcePresent: true },
        ],
      },
    ]);

    const app = await createApp(fakeRepo);
    const res = await app.inject({
      method: "GET",
      url: "/bi/sales/overview?from=2026-05-01&to=2026-05-31",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.summary.sales).toBe(0);
    expect(body.summary.revenue).toBe(0);
  });

  it("customer distinto é contado uma única vez", async () => {
    const fakeRepo = createFakeBiRepository([
      {
        id: "sale-cust1-a",
        netAmount: "100.00",
        customerId: "cust-alpha",
        commercialDate: new Date("2026-06-01T10:00:00.000Z"),
        sourceDocs: [{ docType: SaleAnchorType.NFE, sourcePresent: true }],
      },
      {
        id: "sale-cust1-b",
        netAmount: "150.00",
        customerId: "cust-alpha",
        commercialDate: new Date("2026-06-02T10:00:00.000Z"),
        sourceDocs: [{ docType: SaleAnchorType.NFE, sourcePresent: true }],
      },
      {
        id: "sale-cust2",
        netAmount: "200.00",
        customerId: "cust-beta",
        commercialDate: new Date("2026-06-03T10:00:00.000Z"),
        sourceDocs: [{ docType: SaleAnchorType.NFE, sourcePresent: true }],
      },
    ]);

    const app = await createApp(fakeRepo);
    const res = await app.inject({
      method: "GET",
      url: "/bi/sales/overview?from=2026-06-01&to=2026-06-30",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.summary.sales).toBe(3);
    expect(body.summary.customers).toBe(2);
    expect(body.summary.revenue).toBe(450.0);
    expect(body.summary.salesWithoutCustomer).toBe(0);
  });

  it("Sale sem customer entra em faturamento/vendas e incrementa salesWithoutCustomer", async () => {
    const fakeRepo = createFakeBiRepository([
      {
        id: "sale-with-cust",
        netAmount: "120.00",
        customerId: "cust-alpha",
        commercialDate: new Date("2026-07-01T10:00:00.000Z"),
        sourceDocs: [{ docType: SaleAnchorType.NFE, sourcePresent: true }],
      },
      {
        id: "sale-without-cust",
        netAmount: "80.00",
        customerId: null,
        commercialDate: new Date("2026-07-02T10:00:00.000Z"),
        sourceDocs: [{ docType: SaleAnchorType.NFE, sourcePresent: true }],
      },
    ]);

    const app = await createApp(fakeRepo);
    const res = await app.inject({
      method: "GET",
      url: "/bi/sales/overview?from=2026-07-01&to=2026-07-31",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.summary.sales).toBe(2);
    expect(body.summary.revenue).toBe(200.0);
    expect(body.summary.customers).toBe(1);
    expect(body.summary.salesWithoutCustomer).toBe(1);
  });

  it("avgTicket correto com precisão decimal sem drift", async () => {
    const fakeRepo = createFakeBiRepository([
      {
        id: "s1",
        netAmount: "100.00",
        customerId: "c1",
        commercialDate: new Date("2026-01-10T10:00:00.000Z"),
        sourceDocs: [{ docType: SaleAnchorType.NFE, sourcePresent: true }],
      },
      {
        id: "s2",
        netAmount: "100.00",
        customerId: "c2",
        commercialDate: new Date("2026-01-11T10:00:00.000Z"),
        sourceDocs: [{ docType: SaleAnchorType.NFE, sourcePresent: true }],
      },
      {
        id: "s3",
        netAmount: "100.00",
        customerId: "c3",
        commercialDate: new Date("2026-01-12T10:00:00.000Z"),
        sourceDocs: [{ docType: SaleAnchorType.NFE, sourcePresent: true }],
      },
    ]);

    const app = await createApp(fakeRepo);
    const res = await app.inject({
      method: "GET",
      url: "/bi/sales/overview?from=2026-01-01&to=2026-01-31",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.summary.sales).toBe(3);
    expect(body.summary.revenue).toBe(300.0);
    expect(body.summary.avgTicket).toBe(100.0);

    // Test non-integer division rounding: 100 / 3 = 33.33
    const fakeRepo2 = createFakeBiRepository([
      {
        id: "d1",
        netAmount: "100.00",
        customerId: "c1",
        commercialDate: new Date("2026-01-10T10:00:00.000Z"),
        sourceDocs: [{ docType: SaleAnchorType.NFE, sourcePresent: true }],
      },
      {
        id: "d2",
        netAmount: "0.00",
        customerId: "c2",
        commercialDate: new Date("2026-01-11T10:00:00.000Z"),
        sourceDocs: [{ docType: SaleAnchorType.NFE, sourcePresent: true }],
      },
      {
        id: "d3",
        netAmount: "0.00",
        customerId: "c3",
        commercialDate: new Date("2026-01-12T10:00:00.000Z"),
        sourceDocs: [{ docType: SaleAnchorType.NFE, sourcePresent: true }],
      },
    ]);

    const app2 = await createApp(fakeRepo2);
    const res2 = await app2.inject({
      method: "GET",
      url: "/bi/sales/overview?from=2026-01-01&to=2026-01-31",
    });
    expect(res2.json().summary.avgTicket).toBe(33.33);
  });

  it("agrupamento mensal correto e ordenado cronologicamente", async () => {
    const fakeRepo = createFakeBiRepository([
      {
        id: "s-feb",
        netAmount: "500.00",
        customerId: "c1",
        commercialDate: new Date("2026-02-15T12:00:00.000Z"),
        sourceDocs: [{ docType: SaleAnchorType.NFE, sourcePresent: true }],
      },
      {
        id: "s-jan-1",
        netAmount: "200.00",
        customerId: "c1",
        commercialDate: new Date("2026-01-10T10:00:00.000Z"),
        sourceDocs: [{ docType: SaleAnchorType.NFE, sourcePresent: true }],
      },
      {
        id: "s-jan-2",
        netAmount: "100.00",
        customerId: "c2",
        commercialDate: new Date("2026-01-20T10:00:00.000Z"),
        sourceDocs: [{ docType: SaleAnchorType.NFE, sourcePresent: true }],
      },
    ]);

    const app = await createApp(fakeRepo);
    const res = await app.inject({
      method: "GET",
      url: "/bi/sales/overview?from=2026-01-01&to=2026-02-28",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.monthly).toHaveLength(2);
    expect(body.monthly[0]).toEqual({
      month: "2026-01",
      sales: 2,
      revenue: 300.0,
      avgTicket: 150.0,
      customers: 2,
    });
    expect(body.monthly[1]).toEqual({
      month: "2026-02",
      sales: 1,
      revenue: 500.0,
      avgTicket: 500.0,
      customers: 1,
    });
  });

  it("intervalo 'to' inclui todo o último dia", async () => {
    const fakeRepo = createFakeBiRepository([
      {
        id: "sale-last-day-late",
        netAmount: "250.00",
        customerId: "c1",
        commercialDate: new Date("2026-09-05T23:59:59.999Z"),
        sourceDocs: [{ docType: SaleAnchorType.NFE, sourcePresent: true }],
      },
      {
        id: "sale-next-day-early",
        netAmount: "350.00",
        customerId: "c2",
        commercialDate: new Date("2026-09-06T00:00:00.000Z"),
        sourceDocs: [{ docType: SaleAnchorType.NFE, sourcePresent: true }],
      },
    ]);

    const app = await createApp(fakeRepo);
    const res = await app.inject({
      method: "GET",
      url: "/bi/sales/overview?from=2026-09-01&to=2026-09-05",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.summary.sales).toBe(1);
    expect(body.summary.revenue).toBe(250.0);
  });

  describe("parâmetros inválidos retornam erro HTTP 400 seguro", () => {
    it("rejeita quando 'from' está ausente", async () => {
      const app = await createApp(createFakeBiRepository([]));
      const res = await app.inject({
        method: "GET",
        url: "/bi/sales/overview?to=2026-09-05",
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({
        status: "error",
        message: "Parâmetro 'from' é obrigatório e deve estar no formato YYYY-MM-DD.",
      });
    });

    it("rejeita quando 'to' está ausente", async () => {
      const app = await createApp(createFakeBiRepository([]));
      const res = await app.inject({
        method: "GET",
        url: "/bi/sales/overview?from=2026-09-01",
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({
        status: "error",
        message: "Parâmetro 'to' é obrigatório e deve estar no formato YYYY-MM-DD.",
      });
    });

    it("rejeita formato de data malformado", async () => {
      const app = await createApp(createFakeBiRepository([]));
      const res = await app.inject({
        method: "GET",
        url: "/bi/sales/overview?from=2026/01/01&to=2026-01-31",
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({
        status: "error",
        message: "Data 'from' inválida. Use o formato YYYY-MM-DD.",
      });
    });

    it("rejeita data inválida no calendário (ex: 30 de fevereiro)", async () => {
      const app = await createApp(createFakeBiRepository([]));
      const res = await app.inject({
        method: "GET",
        url: "/bi/sales/overview?from=2026-02-01&to=2026-02-30",
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({
        status: "error",
        message: "Data 'to' não corresponde a uma data válida no calendário.",
      });
    });

    it("rejeita quando 'from' é posterior a 'to'", async () => {
      const app = await createApp(createFakeBiRepository([]));
      const res = await app.inject({
        method: "GET",
        url: "/bi/sales/overview?from=2026-09-10&to=2026-09-01",
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({
        status: "error",
        message: "A data inicial 'from' deve ser anterior ou igual à data final 'to'.",
      });
    });
  });

  describe("createBiRepository Prisma query implementation", () => {
    it("queries Prisma saleSourceDocument with proper where clause and maps fields", async () => {
      const findManyMock = vi.fn().mockResolvedValue([
        {
          id: "doc-1",
          netAmount: new Prisma.Decimal("100.00"),
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

      const results = await repository.findRealizedSales(from, toExclusive);

      expect(findManyMock).toHaveBeenCalledWith({
        where: {
          sourcePresent: true,
          docType: {
            in: [SaleAnchorType.NFE, SaleAnchorType.VENDA_SIMPLES],
          },
          realizedDate: {
            gte: from,
            lt: toExclusive,
          },
          netAmount: {
            not: null,
          },
        },
        select: {
          id: true,
          netAmount: true,
          realizedDate: true,
          sale: {
            select: {
              customerId: true,
            },
          },
        },
        orderBy: {
          realizedDate: "asc",
        },
      });

      expect(results).toHaveLength(1);
      expect(results[0].commercialDate).toBeInstanceOf(Date);
      expect(results[0].id).toBe("doc-1");
      expect(results[0].customerId).toBe("cust-1");
      expect(results[0].netAmount.toString()).toBe("100");
    });
  });

  describe("Mandatory realization test cases", () => {
    it("1. Pedido sozinho nunca gera receita (realizedDate null)", async () => {
      const fakeRepo = createFakeBiRepository([
        {
          id: "doc-pedido-1",
          docType: SaleAnchorType.PEDIDO,
          sourcePresent: true,
          netAmount: "6786.60",
          realizedDate: null,
          customerId: "cust-1",
        },
      ]);

      const app = await createApp(fakeRepo);
      const res = await app.inject({
        method: "GET",
        url: "/bi/sales/overview?from=2026-01-01&to=2026-01-31",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.summary.sales).toBe(0);
      expect(body.summary.revenue).toBe(0);
      expect(body.monthly).toEqual([]);
    });

    it("4. Caso equivalente NBSKATESHOP: Pedido total 6786.60 split across months", async () => {
      const nbskateShopDocs: RawTestDocument[] = [
        // Parent Pedido (never realized directly)
        {
          id: "doc-pedido-1318",
          docType: SaleAnchorType.PEDIDO,
          sourcePresent: true,
          netAmount: "6786.60",
          realizedDate: null,
          customerId: "cust-nbskate",
        },
        // NFe realized in January
        {
          id: "doc-nfe-2858",
          docType: SaleAnchorType.NFE,
          sourcePresent: true,
          netAmount: "2790.00",
          realizedDate: new Date("2026-01-20T14:30:00.000Z"),
          customerId: "cust-nbskate",
        },
        // Venda Simples confirmed in February
        {
          id: "doc-vs-7091",
          docType: SaleAnchorType.VENDA_SIMPLES,
          sourcePresent: true,
          netAmount: "3996.60",
          realizedDate: new Date("2026-02-05T10:15:00.000Z"),
          customerId: "cust-nbskate",
        },
      ];

      const fakeRepo = createFakeBiRepository(nbskateShopDocs);
      const app = await createApp(fakeRepo);

      // January query: sales = 1, revenue = 2790.00
      const janRes = await app.inject({
        method: "GET",
        url: "/bi/sales/overview?from=2026-01-01&to=2026-01-31",
      });
      expect(janRes.statusCode).toBe(200);
      const janBody = janRes.json();
      expect(janBody.summary.sales).toBe(1);
      expect(janBody.summary.revenue).toBe(2790.0);
      expect(janBody.monthly).toHaveLength(1);
      expect(janBody.monthly[0].month).toBe("2026-01");
      expect(janBody.monthly[0].sales).toBe(1);
      expect(janBody.monthly[0].revenue).toBe(2790.0);

      // February query: sales = 1, revenue = 3996.60
      const febRes = await app.inject({
        method: "GET",
        url: "/bi/sales/overview?from=2026-02-01&to=2026-02-28",
      });
      expect(febRes.statusCode).toBe(200);
      const febBody = febRes.json();
      expect(febBody.summary.sales).toBe(1);
      expect(febBody.summary.revenue).toBe(3996.6);
      expect(febBody.monthly).toHaveLength(1);
      expect(febBody.monthly[0].month).toBe("2026-02");
      expect(febBody.monthly[0].sales).toBe(1);
      expect(febBody.monthly[0].revenue).toBe(3996.6);

      // Jan + Feb query: sales = 2, revenue = 6786.60, Pedido never counted
      const bothRes = await app.inject({
        method: "GET",
        url: "/bi/sales/overview?from=2026-01-01&to=2026-02-28",
      });
      expect(bothRes.statusCode).toBe(200);
      const bothBody = bothRes.json();
      expect(bothBody.summary.sales).toBe(2);
      expect(bothBody.summary.revenue).toBe(6786.6);
      expect(bothBody.summary.customers).toBe(1);
      expect(bothBody.monthly).toHaveLength(2);
    });

    it("5. Caso equivalente Pedido 1282: Venda Simples + NFe ambas no mesmo mês", async () => {
      const pedido1282Docs: RawTestDocument[] = [
        // Parent Pedido (never realized, netAmount = 14242.50)
        {
          id: "doc-pedido-1282",
          docType: SaleAnchorType.PEDIDO,
          sourcePresent: true,
          netAmount: "14242.50",
          realizedDate: null,
          customerId: "cust-empresa-confidencial",
        },
        // Venda Simples realized in October
        {
          id: "doc-vs-7022",
          docType: SaleAnchorType.VENDA_SIMPLES,
          sourcePresent: true,
          netAmount: "7120.97",
          realizedDate: new Date("2025-10-31T23:41:41.000Z"),
          customerId: "cust-empresa-confidencial",
        },
        // NFe realized in October (real API/DB value: 7121.25, emissao at 2025-10-31T00:00:00.000Z)
        {
          id: "doc-nfe-2816",
          docType: SaleAnchorType.NFE,
          sourcePresent: true,
          netAmount: "7121.25",
          realizedDate: new Date("2025-10-31T00:00:00.000Z"),
          customerId: "cust-empresa-confidencial",
        },
      ];

      const fakeRepo = createFakeBiRepository(pedido1282Docs);
      const app = await createApp(fakeRepo);

      const res = await app.inject({
        method: "GET",
        url: "/bi/sales/overview?from=2025-10-01&to=2025-10-31",
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      // Expected: 2 vendas realizadas, revenue = 14242.22 (7120.97 + 7121.25)
      // Pedido is NOT summed, and the 0.28 difference (14242.50 - 14242.22) is preserved, not artificially compensated
      expect(body.summary.sales).toBe(2);
      expect(body.summary.revenue).toBe(14242.22);
      expect(body.summary.customers).toBe(1);
    });

    it("6. Mesmo customer em dois documentos: sales = 2, customers = 1", async () => {
      const fakeRepo = createFakeBiRepository([
        {
          id: "doc-vs-1",
          docType: SaleAnchorType.VENDA_SIMPLES,
          sourcePresent: true,
          netAmount: "500.00",
          realizedDate: new Date("2026-03-10T10:00:00.000Z"),
          customerId: "cust-repeat",
        },
        {
          id: "doc-nfe-2",
          docType: SaleAnchorType.NFE,
          sourcePresent: true,
          netAmount: "500.00",
          realizedDate: new Date("2026-03-20T15:00:00.000Z"),
          customerId: "cust-repeat",
        },
      ]);

      const app = await createApp(fakeRepo);
      const res = await app.inject({
        method: "GET",
        url: "/bi/sales/overview?from=2026-03-01&to=2026-03-31",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.summary.sales).toBe(2);
      expect(body.summary.customers).toBe(1);
      expect(body.summary.revenue).toBe(1000.0);
    });

    it("7. sourcePresent=false não entra no overview", async () => {
      const fakeRepo = createFakeBiRepository([
        {
          id: "doc-absent",
          docType: SaleAnchorType.VENDA_SIMPLES,
          sourcePresent: false,
          netAmount: "500.00",
          realizedDate: new Date("2026-03-10T10:00:00.000Z"),
          customerId: "cust-1",
        },
      ]);

      const app = await createApp(fakeRepo);
      const res = await app.inject({
        method: "GET",
        url: "/bi/sales/overview?from=2026-03-01&to=2026-03-31",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.summary.sales).toBe(0);
      expect(body.summary.revenue).toBe(0);
    });
  });
});
