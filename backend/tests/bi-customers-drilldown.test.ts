import { Prisma, SaleAnchorType } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import {
  isEligibleRealizedDoc,
  type BiCustomerMetadata,
  type BiCustomerSaleRawRecord,
  type BiPeriodCustomerDoc,
  type BiRepository,
  type BiSaleRealizationRecord,
  type CustomerDetailOverviewResult,
  type CustomerSalesResult,
  type CustomerSegmentResult,
} from "../src/modules/bi/index.js";

interface RawTestDoc {
  id: string;
  saleId?: string;
  docType?: SaleAnchorType;
  sourcePresent?: boolean;
  netAmount?: string | number | Prisma.Decimal | null;
  realizedDate?: Date | null;
  customerId?: string | null;
  status?: string | null;
  sourceConfirmedAt?: Date | null;
  sourceEmissaoAt?: Date | null;
  customer?: {
    id?: string;
    sourceId?: string;
    code?: string | null;
    legalName?: string | null;
    tradeName?: string | null;
    cpf?: string | null;
    cnpj?: string | null;
    city?: string | null;
    state?: string | null;
  };
}

interface RawTestSale {
  id: string;
  anchorType?: string;
  anchorSourceId?: string;
  customerId?: string | null;
  commercialDate?: Date | null;
  docs: RawTestDoc[];
}

function createFakeDrilldownBiRepository(
  docs: RawTestDoc[],
  customSales?: RawTestSale[],
): BiRepository {
  const isEligible = (doc: RawTestDoc): boolean => {
    return isEligibleRealizedDoc({
      sourcePresent: doc.sourcePresent ?? true,
      docType: doc.docType ?? SaleAnchorType.NFE,
      realizedDate: doc.realizedDate ?? null,
      netAmount: doc.netAmount ?? null,
    }) && !!doc.customerId;
  };

  const customerMap = new Map<string, BiCustomerMetadata>();
  for (const d of docs) {
    if (d.customerId && !customerMap.has(d.customerId)) {
      customerMap.set(d.customerId, {
        id: d.customerId,
        sourceId: d.customer?.sourceId ?? d.customerId,
        code: d.customer?.code ?? null,
        legalName: d.customer?.legalName ?? null,
        tradeName: d.customer?.tradeName ?? null,
        cpf: d.customer?.cpf ?? null,
        cnpj: d.customer?.cnpj ?? null,
        city: d.customer?.city ?? null,
        state: d.customer?.state ?? null,
      });
    }
  }

  // If customSales provided, register their customers too
  if (customSales) {
    for (const s of customSales) {
      if (s.customerId && !customerMap.has(s.customerId)) {
        customerMap.set(s.customerId, {
          id: s.customerId,
          sourceId: s.customerId,
          code: null,
          legalName: null,
          tradeName: null,
          cpf: null,
          cnpj: null,
          city: null,
          state: null,
        });
      }
    }
  }

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
        netAmount: new Prisma.Decimal(d.netAmount!),
      }));
    },

    async findCustomersMetadata(
      customerIds?: string[],
    ): Promise<BiCustomerMetadata[]> {
      const all = Array.from(customerMap.values());
      if (customerIds && customerIds.length > 0) {
        const set = new Set(customerIds);
        return all.filter((c) => set.has(c.id));
      }
      return all;
    },

    async findCustomerDetail(
      customerId: string,
    ): Promise<BiCustomerMetadata | null> {
      return customerMap.get(customerId) ?? null;
    },

    async findCustomerSales(
      customerId: string,
    ): Promise<BiCustomerSaleRawRecord[]> {
      if (customSales) {
        const matching = customSales.filter((s) => s.customerId === customerId);
        return matching.map((s) => ({
          id: s.id,
          anchorType: s.anchorType ?? "PEDIDO",
          anchorSourceId: s.anchorSourceId ?? s.id,
          commercialDate: s.commercialDate ?? null,
          sourceDocs: s.docs.map((d) => ({
            id: d.id,
            docType: d.docType ?? SaleAnchorType.NFE,
            sourceId: d.id,
            status: d.status ?? null,
            netAmount: d.netAmount !== null && d.netAmount !== undefined ? new Prisma.Decimal(d.netAmount) : null,
            realizedDate: d.realizedDate ?? null,
            sourceConfirmedAt: d.sourceConfirmedAt ?? null,
            sourceEmissaoAt: d.sourceEmissaoAt ?? null,
            sourcePresent: d.sourcePresent ?? true,
          })),
        }));
      }

      // Group docs by saleId
      const salesMap = new Map<string, RawTestDoc[]>();
      for (const d of docs) {
        if (d.customerId === customerId) {
          const sId = d.saleId ?? d.id;
          let list = salesMap.get(sId);
          if (!list) {
            list = [];
            salesMap.set(sId, list);
          }
          list.push(d);
        }
      }

      return Array.from(salesMap.entries()).map(([saleId, saleDocs]) => ({
        id: saleId,
        anchorType: "PEDIDO",
        anchorSourceId: saleId,
        commercialDate: saleDocs[0]?.realizedDate ?? null,
        sourceDocs: saleDocs.map((d) => ({
          id: d.id,
          docType: d.docType ?? SaleAnchorType.NFE,
          sourceId: d.id,
          status: d.status ?? null,
          netAmount: d.netAmount !== null && d.netAmount !== undefined ? new Prisma.Decimal(d.netAmount) : null,
          realizedDate: d.realizedDate ?? null,
          sourceConfirmedAt: d.sourceConfirmedAt ?? null,
          sourceEmissaoAt: d.sourceEmissaoAt ?? null,
          sourcePresent: d.sourcePresent ?? true,
        })),
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
    databaseHealth: { check: () => Promise.resolve({ ok: true }) },
    frontendUrl: "http://localhost:5173",
    logger: false,
    biRepository: repository,
  });
  apps.push(app);
  return app;
}

describe("Customer Drilldown Backend Endpoints", () => {
  describe("GET /bi/customers/segment", () => {
    it("valida parâmetros obrigatórios e rejeita segmento inválido com 400", async () => {
      const repo = createFakeDrilldownBiRepository([]);
      const app = await createApp(repo);

      const res = await app.inject({
        method: "GET",
        url: "/bi/customers/segment?from=2026-01-01&to=2026-01-31&segment=invalid_segment",
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.status).toBe("error");
      expect(body.message).toContain("Segmento inválido");
    });

    it("rejeita datas inválidas com 400", async () => {
      const repo = createFakeDrilldownBiRepository([]);
      const app = await createApp(repo);

      const res = await app.inject({
        method: "GET",
        url: "/bi/customers/segment?from=not-a-date&to=2026-01-31&segment=buyers",
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().status).toBe("error");
    });

    it("A & B. Equivalência obrigatória: contagens dos 6 segmentos batem exatamente com /bi/customers/overview", async () => {
      // Setup:
      // cust-1: historical purchase in 2025 + period purchase in 2026 => returning, repeat, historical, buyers
      // cust-2: only period purchase in 2026 (first purchase) => new, single, historical, buyers
      // cust-3: only historical purchase in 2025 => historical, single
      // cust-4: multiple historical purchases in 2025, none in 2026 => historical, repeat
      const testDocs: RawTestDoc[] = [
        // cust-1
        {
          id: "d1",
          saleId: "s1",
          customerId: "cust-1",
          netAmount: 100,
          realizedDate: new Date("2025-06-15T12:00:00Z"),
          customer: { tradeName: "Cliente Um" },
        },
        {
          id: "d2",
          saleId: "s2",
          customerId: "cust-1",
          netAmount: 200,
          realizedDate: new Date("2026-02-10T12:00:00Z"),
          customer: { tradeName: "Cliente Um" },
        },
        // cust-2 (first purchase in period)
        {
          id: "d3",
          saleId: "s3",
          customerId: "cust-2",
          netAmount: 300,
          realizedDate: new Date("2026-02-15T12:00:00Z"),
          customer: { tradeName: "Cliente Dois" },
        },
        // cust-3 (single purchase prior to period)
        {
          id: "d4",
          saleId: "s4",
          customerId: "cust-3",
          netAmount: 400,
          realizedDate: new Date("2025-08-20T12:00:00Z"),
          customer: { tradeName: "Cliente Três" },
        },
        // cust-4 (repeat purchases prior to period)
        {
          id: "d5",
          saleId: "s5",
          customerId: "cust-4",
          netAmount: 50,
          realizedDate: new Date("2025-01-10T12:00:00Z"),
          customer: { tradeName: "Cliente Quatro" },
        },
        {
          id: "d6",
          saleId: "s6",
          customerId: "cust-4",
          netAmount: 60,
          realizedDate: new Date("2025-05-10T12:00:00Z"),
          customer: { tradeName: "Cliente Quatro" },
        },
      ];

      const repo = createFakeDrilldownBiRepository(testDocs);
      const app = await createApp(repo);

      // 1. Fetch overview
      const overviewRes = await app.inject({
        method: "GET",
        url: "/bi/customers/overview?from=2026-01-01&to=2026-09-08",
      });
      expect(overviewRes.statusCode).toBe(200);
      const overview = overviewRes.json();

      // Check overview numbers:
      // buyingCustomers = cust-1, cust-2 = 2
      // newCustomers = cust-2 = 1
      // returningCustomers = cust-1 = 1
      // lifetime.customers = 4 (all 4)
      // lifetime.singlePurchaseCustomers = cust-2 (1 sale), cust-3 (1 sale) = 2
      // lifetime.repeatCustomers = cust-1 (2 sales), cust-4 (2 sales) = 2
      expect(overview.customers.buyingCustomers).toBe(2);
      expect(overview.customers.newCustomers).toBe(1);
      expect(overview.customers.returningCustomers).toBe(1);
      expect(overview.lifetime.customers).toBe(4);
      expect(overview.lifetime.singlePurchaseCustomers).toBe(2);
      expect(overview.lifetime.repeatCustomers).toBe(2);

      // 2. Fetch each segment and verify totalRecords == overview metrics
      const segments: { seg: string; expected: number }[] = [
        { seg: "buyers", expected: overview.customers.buyingCustomers },
        { seg: "new", expected: overview.customers.newCustomers },
        { seg: "returning", expected: overview.customers.returningCustomers },
        { seg: "historical", expected: overview.lifetime.customers },
        { seg: "single", expected: overview.lifetime.singlePurchaseCustomers },
        { seg: "repeat", expected: overview.lifetime.repeatCustomers },
      ];

      for (const { seg, expected } of segments) {
        const segRes = await app.inject({
          method: "GET",
          url: `/bi/customers/segment?from=2026-01-01&to=2026-09-08&segment=${seg}`,
        });
        expect(segRes.statusCode).toBe(200);
        const segBody = segRes.json() as CustomerSegmentResult;
        expect(segBody.segment).toBe(seg);
        expect(segBody.pagination.totalRecords).toBe(expected);
        expect(segBody.summary.segmentCustomerCount).toBe(expected);
        expect(segBody.customers).toHaveLength(expected);
      }
    });

    it("C. Múltiplos SaleSourceDocuments da mesma Sale NÃO geram compra comportamental adicional", async () => {
      const testDocs: RawTestDoc[] = [
        {
          id: "doc-1",
          saleId: "sale-multi",
          customerId: "cust-multi",
          netAmount: 100,
          realizedDate: new Date("2026-03-01T10:00:00Z"),
          docType: SaleAnchorType.VENDA_SIMPLES,
          customer: { tradeName: "Multi Doc Cliente" },
        },
        {
          id: "doc-2",
          saleId: "sale-multi",
          customerId: "cust-multi",
          netAmount: 200,
          realizedDate: new Date("2026-03-02T10:00:00Z"),
          docType: SaleAnchorType.NFE,
          customer: { tradeName: "Multi Doc Cliente" },
        },
      ];

      const repo = createFakeDrilldownBiRepository(testDocs);
      const app = await createApp(repo);

      // Lifetime single segment should have 1 customer (single purchase), repeat should have 0
      const singleRes = await app.inject({
        method: "GET",
        url: "/bi/customers/segment?from=2026-01-01&to=2026-09-08&segment=single",
      });
      const singleBody = singleRes.json() as CustomerSegmentResult;
      expect(singleBody.pagination.totalRecords).toBe(1);
      expect(singleBody.customers[0]!.lifetimePurchaseCount).toBe(1);
      expect(singleBody.customers[0]!.purchasesInPeriod).toBe(1);
      // Revenue should be sum of both documents = 300
      expect(singleBody.customers[0]!.revenueInPeriod).toBe(300);
      expect(singleBody.customers[0]!.lifetimeRevenue).toBe(300);
      expect(singleBody.customers[0]!.averageTicketInPeriod).toBe(300);

      const repeatRes = await app.inject({
        method: "GET",
        url: "/bi/customers/segment?from=2026-01-01&to=2026-09-08&segment=repeat",
      });
      expect((repeatRes.json() as CustomerSegmentResult).pagination.totalRecords).toBe(0);
    });

    it("D. Receita: somente documentos elegíveis homologados somam", async () => {
      const testDocs: RawTestDoc[] = [
        // Eligible doc
        {
          id: "doc-elig",
          saleId: "sale-1",
          customerId: "cust-1",
          netAmount: 500,
          realizedDate: new Date("2026-04-01T10:00:00Z"),
          sourcePresent: true,
          docType: SaleAnchorType.NFE,
          customer: { tradeName: "Cliente Teste" },
        },
        // Ineligible doc: sourcePresent = false
        {
          id: "doc-not-present",
          saleId: "sale-1",
          customerId: "cust-1",
          netAmount: 300,
          realizedDate: new Date("2026-04-01T10:00:00Z"),
          sourcePresent: false,
          docType: SaleAnchorType.NFE,
        },
        // Ineligible doc: PEDIDO docType
        {
          id: "doc-pedido",
          saleId: "sale-1",
          customerId: "cust-1",
          netAmount: 900,
          realizedDate: new Date("2026-04-01T10:00:00Z"),
          sourcePresent: true,
          docType: SaleAnchorType.PEDIDO,
        },
      ];

      const repo = createFakeDrilldownBiRepository(testDocs);
      const app = await createApp(repo);

      const res = await app.inject({
        method: "GET",
        url: "/bi/customers/segment?from=2026-01-01&to=2026-09-08&segment=buyers",
      });

      const body = res.json() as CustomerSegmentResult;
      expect(body.customers[0]!.revenueInPeriod).toBe(500);
      expect(body.summary.segmentTotalRevenueInPeriod).toBe(500);
    });

    it("E. Paginação: primeira página, última página, pageSize, totalPages", async () => {
      // 5 customers
      const testDocs: RawTestDoc[] = Array.from({ length: 5 }, (_, i) => ({
        id: `d-${i}`,
        saleId: `s-${i}`,
        customerId: `cust-${i}`,
        netAmount: (i + 1) * 100,
        realizedDate: new Date("2026-05-01T10:00:00Z"),
        customer: { tradeName: `Cliente ${i}` },
      }));

      const repo = createFakeDrilldownBiRepository(testDocs);
      const app = await createApp(repo);

      // Page 1 with pageSize 2 => totalPages 3, 2 items
      const page1Res = await app.inject({
        method: "GET",
        url: "/bi/customers/segment?from=2026-01-01&to=2026-09-08&segment=buyers&page=1&pageSize=2",
      });
      const p1 = page1Res.json() as CustomerSegmentResult;
      expect(p1.pagination.page).toBe(1);
      expect(p1.pagination.pageSize).toBe(2);
      expect(p1.pagination.totalRecords).toBe(5);
      expect(p1.pagination.totalPages).toBe(3);
      expect(p1.customers).toHaveLength(2);

      // Last page (page 3) => 1 item
      const page3Res = await app.inject({
        method: "GET",
        url: "/bi/customers/segment?from=2026-01-01&to=2026-09-08&segment=buyers&page=3&pageSize=2",
      });
      const p3 = page3Res.json() as CustomerSegmentResult;
      expect(p3.pagination.page).toBe(3);
      expect(p3.customers).toHaveLength(1);
    });

    it("F. Busca por razão social, nome fantasia, código e CPF/CNPJ", async () => {
      const testDocs: RawTestDoc[] = [
        {
          id: "d1",
          saleId: "s1",
          customerId: "c1",
          netAmount: 100,
          realizedDate: new Date("2026-05-01T10:00:00Z"),
          customer: {
            tradeName: "Alpha Comércio",
            legalName: "Beta Indústria LTDA",
            code: "COD-9988",
            cnpj: "12.345.678/0001-90",
          },
        },
        {
          id: "d2",
          saleId: "s2",
          customerId: "c2",
          netAmount: 200,
          realizedDate: new Date("2026-05-01T10:00:00Z"),
          customer: {
            tradeName: "Gama Store",
            legalName: "Delta Variedades",
            code: "COD-1122",
            cpf: "987.654.321-00",
          },
        },
      ];

      const repo = createFakeDrilldownBiRepository(testDocs);
      const app = await createApp(repo);

      // Search by tradeName
      const rTrade = await app.inject({
        method: "GET",
        url: "/bi/customers/segment?from=2026-01-01&to=2026-09-08&segment=buyers&search=alpha",
      });
      expect((rTrade.json() as CustomerSegmentResult).customers).toHaveLength(1);
      expect((rTrade.json() as CustomerSegmentResult).customers[0]!.tradeName).toBe("Alpha Comércio");

      // Search by legalName
      const rLegal = await app.inject({
        method: "GET",
        url: "/bi/customers/segment?from=2026-01-01&to=2026-09-08&segment=buyers&search=indústria",
      });
      expect((rLegal.json() as CustomerSegmentResult).customers).toHaveLength(1);

      // Search by code
      const rCode = await app.inject({
        method: "GET",
        url: "/bi/customers/segment?from=2026-01-01&to=2026-09-08&segment=buyers&search=1122",
      });
      expect((rCode.json() as CustomerSegmentResult).customers).toHaveLength(1);
      expect((rCode.json() as CustomerSegmentResult).customers[0]!.tradeName).toBe("Gama Store");

      // Search by CNPJ digits
      const rCnpj = await app.inject({
        method: "GET",
        url: "/bi/customers/segment?from=2026-01-01&to=2026-09-08&segment=buyers&search=345678",
      });
      expect((rCnpj.json() as CustomerSegmentResult).customers).toHaveLength(1);
      expect((rCnpj.json() as CustomerSegmentResult).customers[0]!.tradeName).toBe("Alpha Comércio");
    });

    it("G. Ordenação: revenue_desc, purchases_desc, last_purchase_desc, name_asc", async () => {
      const testDocs: RawTestDoc[] = [
        {
          id: "d1",
          saleId: "s1",
          customerId: "c-a",
          netAmount: 100,
          realizedDate: new Date("2026-01-10T10:00:00Z"),
          customer: { tradeName: "Zeta" },
        },
        {
          id: "d2",
          saleId: "s2",
          customerId: "c-b",
          netAmount: 500,
          realizedDate: new Date("2026-03-10T10:00:00Z"),
          customer: { tradeName: "Alpha" },
        },
      ];

      const repo = createFakeDrilldownBiRepository(testDocs);
      const app = await createApp(repo);

      // Sort by name_asc: Alpha before Zeta
      const rName = await app.inject({
        method: "GET",
        url: "/bi/customers/segment?from=2026-01-01&to=2026-09-08&segment=buyers&sort=name_asc",
      });
      const nameCusts = (rName.json() as CustomerSegmentResult).customers;
      expect(nameCusts[0]!.displayName).toBe("Alpha");
      expect(nameCusts[1]!.displayName).toBe("Zeta");

      // Sort by revenue_desc: 500 before 100
      const rRev = await app.inject({
        method: "GET",
        url: "/bi/customers/segment?from=2026-01-01&to=2026-09-08&segment=buyers&sort=revenue_desc",
      });
      const revCusts = (rRev.json() as CustomerSegmentResult).customers;
      expect(revCusts[0]!.revenueInPeriod).toBe(500);

      // Sort by last_purchase_desc: 2026-03-10 before 2026-01-10
      const rLast = await app.inject({
        method: "GET",
        url: "/bi/customers/segment?from=2026-01-01&to=2026-09-08&segment=buyers&sort=last_purchase_desc",
      });
      const lastCusts = (rLast.json() as CustomerSegmentResult).customers;
      expect(lastCusts[0]!.lastPurchaseDate).toBe("2026-03-10");
    });
  });

  describe("GET /bi/customers/:customerId/overview", () => {
    it("H. Retorna métricas de período, lifetime e classificação corretas", async () => {
      const testDocs: RawTestDoc[] = [
        // Historical purchase
        {
          id: "d1",
          saleId: "s1",
          customerId: "cust-cb",
          netAmount: 1000,
          realizedDate: new Date("2020-04-10T10:00:00Z"),
          customer: {
            tradeName: "CB BOARDS",
            legalName: "MAO CARDOSO",
            code: "COD-CB",
            cnpj: "14.472.599/0001-70",
            city: "SAO PAULO",
            state: "SP",
          },
        },
        // Period purchase
        {
          id: "d2",
          saleId: "s2",
          customerId: "cust-cb",
          netAmount: 2000,
          realizedDate: new Date("2026-03-15T10:00:00Z"),
          customer: { tradeName: "CB BOARDS" },
        },
        // Other customer in period (for revenue share)
        {
          id: "d3",
          saleId: "s3",
          customerId: "other-cust",
          netAmount: 8000,
          realizedDate: new Date("2026-03-15T10:00:00Z"),
          customer: { tradeName: "Other" },
        },
      ];

      const repo = createFakeDrilldownBiRepository(testDocs);
      const app = await createApp(repo);

      const res = await app.inject({
        method: "GET",
        url: "/bi/customers/cust-cb/overview?from=2026-01-01&to=2026-09-08",
      });

      expect(res.statusCode).toBe(200);
      const data = res.json() as CustomerDetailOverviewResult;

      expect(data.identity.customerId).toBe("cust-cb");
      expect(data.identity.tradeName).toBe("CB BOARDS");
      expect(data.identity.legalName).toBe("MAO CARDOSO");
      expect(data.identity.city).toBe("SAO PAULO");
      expect(data.identity.state).toBe("SP");
      expect(data.identity.cpfCnpj).toBe("14.472.599/0001-70");

      // Classification: has prior sale and period sale => isReturningInPeriod = true, isNewInPeriod = false
      expect(data.classification.hasPeriodActivity).toBe(true);
      expect(data.classification.isNewInPeriod).toBe(false);
      expect(data.classification.isReturningInPeriod).toBe(true);

      // Period metrics: 2000 revenue out of 10000 total identified => 20%
      expect(data.period.revenue).toBe(2000);
      expect(data.period.purchaseCount).toBe(1);
      expect(data.period.averageTicket).toBe(2000);
      expect(data.period.revenueSharePercent).toBe(20);

      // Lifetime metrics: 3000 revenue (1000 + 2000), 2 purchases => avg ticket 1500
      expect(data.lifetime.purchaseCount).toBe(2);
      expect(data.lifetime.revenue).toBe(3000);
      expect(data.lifetime.averageTicket).toBe(1500);
      expect(data.lifetime.firstPurchaseDate).toBe("2020-04-10");
      expect(data.lifetime.lastPurchaseDate).toBe("2026-03-15");
      expect(typeof data.lifetime.daysSinceLastPurchase).toBe("number");
    });

    it("J. Retorna 404 para customerId inexistente", async () => {
      const repo = createFakeDrilldownBiRepository([]);
      const app = await createApp(repo);

      const res = await app.inject({
        method: "GET",
        url: "/bi/customers/non-existent-id/overview?from=2026-01-01&to=2026-09-08",
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().status).toBe("error");
      expect(res.json().message).toContain("não encontrado");
    });
  });

  describe("GET /bi/customers/:customerId/sales", () => {
    it("I & Ajustes 1, 2, 3: escopo period/history, ordenação, totalRealizedAmount correto, doc não realizado não soma, e exclusão de venda sem documento elegível", async () => {
      // Setup customer with 3 sales:
      // Sale 1: Realized in period (Pedido 1340 - multi docs: Venda Simples realizada R$8420.30 + NFE realizada R$4854.60 + NFE cancelada R$4854.60)
      // Sale 2: Realized prior to period (in 2025)
      // Sale 3: Unfulfilled/Not realized sale (only PEDIDO doc, no realized doc) => MUST BE EXCLUDED per Adjustment 2
      const customSales: RawTestSale[] = [
        {
          id: "sale-1340",
          anchorType: "PEDIDO",
          anchorSourceId: "1340",
          customerId: "cust-cb",
          commercialDate: new Date("2026-03-29T10:00:00Z"),
          docs: [
            {
              id: "doc-vs",
              saleId: "sale-1340",
              customerId: "cust-cb",
              docType: SaleAnchorType.VENDA_SIMPLES,
              netAmount: 8420.30,
              realizedDate: new Date("2026-03-30T22:00:00Z"),
              status: "A",
              sourcePresent: true,
            },
            {
              id: "doc-nfe-realized",
              saleId: "sale-1340",
              customerId: "cust-cb",
              docType: SaleAnchorType.NFE,
              netAmount: 4854.60,
              realizedDate: new Date("2026-03-30T00:00:00Z"),
              status: "A",
              sourcePresent: true,
            },
            {
              id: "doc-nfe-canceled",
              saleId: "sale-1340",
              customerId: "cust-cb",
              docType: SaleAnchorType.NFE,
              netAmount: 4854.60,
              realizedDate: null, // NOT realized
              status: "S",
              sourcePresent: true,
            },
            {
              id: "doc-pedido-ctx",
              saleId: "sale-1340",
              customerId: "cust-cb",
              docType: SaleAnchorType.PEDIDO,
              netAmount: 13274.90,
              realizedDate: null, // PEDIDO docType
              status: "A",
              sourcePresent: true,
            },
          ],
        },
        {
          id: "sale-hist-2025",
          anchorType: "VENDA_SIMPLES",
          anchorSourceId: "5001",
          customerId: "cust-cb",
          commercialDate: new Date("2025-06-10T10:00:00Z"),
          docs: [
            {
              id: "doc-hist-1",
              saleId: "sale-hist-2025",
              customerId: "cust-cb",
              docType: SaleAnchorType.VENDA_SIMPLES,
              netAmount: 1000,
              realizedDate: new Date("2025-06-10T10:00:00Z"),
              sourcePresent: true,
            },
          ],
        },
        // Unfulfilled sale: NO eligible realized docs => MUST NOT appear in customer sales
        {
          id: "sale-unfulfilled",
          anchorType: "PEDIDO",
          anchorSourceId: "9999",
          customerId: "cust-cb",
          commercialDate: new Date("2026-01-01T10:00:00Z"),
          docs: [
            {
              id: "doc-unf-pedido",
              saleId: "sale-unfulfilled",
              customerId: "cust-cb",
              docType: SaleAnchorType.PEDIDO,
              netAmount: 500,
              realizedDate: null,
              sourcePresent: true,
            },
          ],
        },
      ];

      // Also provide docs for period overview
      const allDocs: RawTestDoc[] = [];
      for (const s of customSales) {
        allDocs.push(...s.docs);
      }

      const repo = createFakeDrilldownBiRepository(allDocs, customSales);
      const app = await createApp(repo);

      // 1. scope = period => should only return sale-1340 (saleRealizedDate in 2026)
      const resPeriod = await app.inject({
        method: "GET",
        url: "/bi/customers/cust-cb/sales?from=2026-01-01&to=2026-09-08&scope=period",
      });

      expect(resPeriod.statusCode).toBe(200);
      const periodSales = resPeriod.json() as CustomerSalesResult;
      expect(periodSales.pagination.totalRecords).toBe(1);
      expect(periodSales.sales).toHaveLength(1);

      const saleItem = periodSales.sales[0]!;
      expect(saleItem.saleId).toBe("sale-1340");
      expect(saleItem.hasPedido).toBe(true);
      expect(saleItem.pedidoSourceId).toBe("1340");
      // saleRealizedDate = MIN(2026-03-30T00:00:00Z, 2026-03-30T22:00:00Z) = 2026-03-30T00:00:00.000Z
      expect(saleItem.saleRealizedDate).toBe(new Date("2026-03-30T00:00:00Z").toISOString());

      // Adjustment 1 & 3: totalRealizedAmount sums ONLY eligible realized docs (8420.30 + 4854.60 = 13274.90)
      expect(saleItem.totalRealizedAmount).toBe(13274.90);
      expect(saleItem.realizedDocCount).toBe(2);

      // Context documents: all 4 docs present
      expect(saleItem.documents).toHaveLength(4);
      const realizedDocs = saleItem.documents.filter((d) => d.isRealizedDoc);
      const nonRealizedDocs = saleItem.documents.filter((d) => !d.isRealizedDoc);
      expect(realizedDocs).toHaveLength(2);
      expect(nonRealizedDocs).toHaveLength(2);

      // 2. scope = history => should return 2 realized sales (sale-1340 and sale-hist-2025). Unfulfilled sale MUST NOT appear.
      const resHistory = await app.inject({
        method: "GET",
        url: "/bi/customers/cust-cb/sales?from=2026-01-01&to=2026-09-08&scope=history",
      });

      expect(resHistory.statusCode).toBe(200);
      const historySales = resHistory.json() as CustomerSalesResult;
      // Exactly 2 realized sales, NOT 3!
      expect(historySales.pagination.totalRecords).toBe(2);
      expect(historySales.sales).toHaveLength(2);
      // Ordered recent first: sale-1340 (2026) then sale-hist-2025 (2025)
      expect(historySales.sales[0]!.saleId).toBe("sale-1340");
      expect(historySales.sales[1]!.saleId).toBe("sale-hist-2025");
    });

    it("Ajuste 3 Teste Explícito: Sale com documentos realizados em períodos diferentes pertence comportamentalmente ao período da primeira realização e conta como uma única compra", async () => {
      // Sale with Doc 1 realized in Jan 2026 and Doc 2 realized in Feb 2026
      const multiPeriodSale: RawTestSale = {
        id: "sale-multi-period",
        anchorType: "PEDIDO",
        anchorSourceId: "777",
        customerId: "cust-split",
        commercialDate: new Date("2026-01-15T10:00:00Z"),
        docs: [
          {
            id: "doc-jan",
            saleId: "sale-multi-period",
            customerId: "cust-split",
            docType: SaleAnchorType.VENDA_SIMPLES,
            netAmount: 1000,
            realizedDate: new Date("2026-01-20T10:00:00Z"),
            sourcePresent: true,
          },
          {
            id: "doc-feb",
            saleId: "sale-multi-period",
            customerId: "cust-split",
            docType: SaleAnchorType.NFE,
            netAmount: 2000,
            realizedDate: new Date("2026-02-15T10:00:00Z"),
            sourcePresent: true,
          },
        ],
      };

      const repo = createFakeDrilldownBiRepository(multiPeriodSale.docs, [multiPeriodSale]);
      const app = await createApp(repo);

      // In Jan period (2026-01-01 to 2026-01-31):
      // - Belongs to Jan because minRealizedDate = 2026-01-20
      // - Customer overview in Jan: buyingCustomers = 1, revenue = 1000 (only Jan doc realized in Jan!)
      const janOverview = await app.inject({
        method: "GET",
        url: "/bi/customers/overview?from=2026-01-01&to=2026-01-31",
      });
      expect(janOverview.statusCode).toBe(200);
      const janBody = janOverview.json();
      expect(janBody.customers.buyingCustomers).toBe(1);
      expect(janBody.ranking[0].revenue).toBe(1000);
      expect(janBody.ranking[0].purchaseCount).toBe(1);

      // In Feb period (2026-02-01 to 2026-02-28):
      // - Behavioral sale does NOT belong to Feb (minRealizedDate was in Jan!)
      // - Customer overview in Feb: buyingCustomers = 0 (no new behavioral sale in Feb!)
      // - But ranking revenue in Feb includes doc-feb (2000)
      const febOverview = await app.inject({
        method: "GET",
        url: "/bi/customers/overview?from=2026-02-01&to=2026-02-28",
      });
      expect(febOverview.statusCode).toBe(200);
      const febBody = febOverview.json();
      expect(febBody.customers.buyingCustomers).toBe(0);
      expect(febBody.ranking[0].revenue).toBe(2000);

      // Customer Sales in Jan with scope=period:
      // Sale belongs to Jan, totalRealizedAmount of negotiation up to Jan 31 = 1000 (only docs realized up to Jan 31)
      const janSales = await app.inject({
        method: "GET",
        url: "/bi/customers/cust-split/sales?from=2026-01-01&to=2026-01-31&scope=period",
      });
      expect(janSales.statusCode).toBe(200);
      expect((janSales.json() as CustomerSalesResult).sales).toHaveLength(1);

      // Customer Sales in Feb with scope=period:
      // Sale does NOT belong to Feb period (saleRealizedDate was in Jan)
      const febSales = await app.inject({
        method: "GET",
        url: "/bi/customers/cust-split/sales?from=2026-02-01&to=2026-02-28&scope=period",
      });
      expect(febSales.statusCode).toBe(200);
      expect((febSales.json() as CustomerSalesResult).sales).toHaveLength(0);

      // Customer Sales in Full Period (Jan to Feb):
      // Returns exactly ONE negotiation (never duplicated!)
      const fullSales = await app.inject({
        method: "GET",
        url: "/bi/customers/cust-split/sales?from=2026-01-01&to=2026-02-28&scope=period",
      });
      expect(fullSales.statusCode).toBe(200);
      const fullBody = fullSales.json() as CustomerSalesResult;
      expect(fullBody.sales).toHaveLength(1);
      expect(fullBody.sales[0]!.totalRealizedAmount).toBe(3000); // 1000 + 2000
    });
  });
});
