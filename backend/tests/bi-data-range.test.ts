import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import {
  createBiRepository,
  type BiDataRangeResult,
  type BiRepository,
} from "../src/modules/bi/index.js";

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

describe("GET /bi/data-range", () => {
  it("retorna as datas limites quando há documentos elegíveis", async () => {
    const fakeRepo: BiRepository = {
      async findRealizedSales() {
        return [];
      },
      async findDataRange(): Promise<BiDataRangeResult> {
        return {
          firstRealizedDate: "2015-05-05",
          lastRealizedDate: "2026-09-09",
        };
      },
    };

    const app = await createApp(fakeRepo);
    const res = await app.inject({
      method: "GET",
      url: "/bi/data-range",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      firstRealizedDate: "2015-05-05",
      lastRealizedDate: "2026-09-09",
    });
  });

  it("retorna null para ambas as datas com status 200 quando não há documentos elegíveis", async () => {
    const emptyRepo: BiRepository = {
      async findRealizedSales() {
        return [];
      },
      async findDataRange(): Promise<BiDataRangeResult> {
        return {
          firstRealizedDate: null,
          lastRealizedDate: null,
        };
      },
    };

    const app = await createApp(emptyRepo);
    const res = await app.inject({
      method: "GET",
      url: "/bi/data-range",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      firstRealizedDate: null,
      lastRealizedDate: null,
    });
  });

  it("createBiRepository monta a query de agregação com os critérios homologados", async () => {
    const aggregateMock = vi.fn().mockResolvedValue({
      _min: { realizedDate: new Date("2015-05-05T02:00:01.000Z") },
      _max: { realizedDate: new Date("2026-09-09T00:00:00.000Z") },
    });

    const mockPrisma = {
      saleSourceDocument: {
        aggregate: aggregateMock,
      },
    } as unknown as PrismaClient;

    const repository = createBiRepository(mockPrisma);
    const result = await repository.findDataRange!();

    expect(result).toEqual({
      firstRealizedDate: "2015-05-05",
      lastRealizedDate: "2026-09-09",
    });

    expect(aggregateMock).toHaveBeenCalledWith({
      where: {
        sourcePresent: true,
        docType: {
          in: ["NFE", "VENDA_SIMPLES"],
        },
        realizedDate: {
          not: null,
        },
        netAmount: {
          not: null,
        },
      },
      _min: {
        realizedDate: true,
      },
      _max: {
        realizedDate: true,
      },
    });
  });

  it("createBiRepository formata como null quando agregação do Prisma retorna null", async () => {
    const aggregateMock = vi.fn().mockResolvedValue({
      _min: { realizedDate: null },
      _max: { realizedDate: null },
    });

    const mockPrisma = {
      saleSourceDocument: {
        aggregate: aggregateMock,
      },
    } as unknown as PrismaClient;

    const repository = createBiRepository(mockPrisma);
    const result = await repository.findDataRange!();

    expect(result).toEqual({
      firstRealizedDate: null,
      lastRealizedDate: null,
    });
  });
});
