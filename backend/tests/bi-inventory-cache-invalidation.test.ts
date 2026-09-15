import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createBiRepository } from "../src/modules/bi/bi-repository.js";
import type { RealizedProductMovement } from "../src/modules/bi/bi-types.js";

describe("Estoque & Giro — Invalidação do Cache de Última Saída (findHistoricalLastPhysicalSales)", () => {
  it("A -> F: popula cache, reutiliza cache, ignora nova venda sem invalidação, reconstrói após invalidação", async () => {
    // Lista mutável de movimentações simulando persistência no banco
    let mockMovements: RealizedProductMovement[] = [
      {
        productId: "prod-alpha-1",
        sourceProductId: "sku-alpha",
        realizedDate: new Date("2026-09-01T10:00:00.000Z"),
        quantity: 5,
        grossItemAmount: 500,
        allocationBaseAmount: 500,
        allocatedNetRevenue: 500,
      },
    ];

    let queryCount = 0;

    // Criamos o repositório com mock do Prisma
    const mockPrisma = {} as PrismaClient;
    const repo = createBiRepository(mockPrisma);

    // Substituímos findRealizedProductMovements para monitorar chamadas e refletir mockMovements
    repo.findRealizedProductMovements = vi.fn().mockImplementation(async () => {
      queryCount++;
      return {
        movements: [...mockMovements],
        adjustments: [],
      };
    });

    const toExclusive = new Date("2026-09-15T00:00:00.000Z");

    // ==========================================
    // A. Primeira chamada:
    // - calcula lastPhysicalSaleDate;
    // - popula cache.
    // ==========================================
    const firstCallMap = await repo.findHistoricalLastPhysicalSales!(toExclusive);
    expect(queryCount).toBe(1);
    expect(firstCallMap.get("prod-alpha-1")?.toISOString()).toBe("2026-09-01T10:00:00.000Z");
    expect(firstCallMap.get("sku-alpha")?.toISOString()).toBe("2026-09-01T10:00:00.000Z");

    // ==========================================
    // B. Segunda chamada:
    // - usa cache (queryCount permanece 1).
    // ==========================================
    const secondCallMap = await repo.findHistoricalLastPhysicalSales!(toExclusive);
    expect(queryCount).toBe(1);
    expect(secondCallMap).toBe(firstCallMap); // Mesma instância Map em memória
    expect(secondCallMap.get("prod-alpha-1")?.toISOString()).toBe("2026-09-01T10:00:00.000Z");

    // ==========================================
    // C. Simular nova venda persistida / resultado novo
    // ==========================================
    mockMovements.push({
      productId: "prod-alpha-1",
      sourceProductId: "sku-alpha",
      realizedDate: new Date("2026-09-14T18:30:00.000Z"),
      quantity: 2,
      grossItemAmount: 200,
      allocationBaseAmount: 200,
      allocatedNetRevenue: 200,
    });

    // ==========================================
    // D. Sem invalidação:
    // - demonstra que cache manteria resultado antigo (queryCount permanece 1).
    // ==========================================
    const thirdCallMapWithoutInvalidation = await repo.findHistoricalLastPhysicalSales!(toExclusive);
    expect(queryCount).toBe(1);
    expect(thirdCallMapWithoutInvalidation.get("prod-alpha-1")?.toISOString()).toBe("2026-09-01T10:00:00.000Z");

    // ==========================================
    // E. Executar invalidação explícita
    // ==========================================
    repo.invalidateHistoricalLastPhysicalSalesCache!();

    // ==========================================
    // F. Nova chamada:
    // - não usa valor antigo;
    // - reconstrói (queryCount vai para 2);
    // - retorna nova lastPhysicalSaleDate atualizada.
    // ==========================================
    const fourthCallMapAfterInvalidation = await repo.findHistoricalLastPhysicalSales!(toExclusive);
    expect(queryCount).toBe(2);
    expect(fourthCallMapAfterInvalidation).not.toBe(firstCallMap);
    expect(fourthCallMapAfterInvalidation.get("prod-alpha-1")?.toISOString()).toBe("2026-09-14T18:30:00.000Z");
    expect(fourthCallMapAfterInvalidation.get("sku-alpha")?.toISOString()).toBe("2026-09-14T18:30:00.000Z");
  });

  it("TTL de 5 minutos: cache expira automaticamente após 5 minutos mesmo sem invalidação manual", async () => {
    vi.useFakeTimers();

    try {
      const mockMovements: RealizedProductMovement[] = [
        {
          productId: "prod-beta-1",
          sourceProductId: "sku-beta",
          realizedDate: new Date("2026-09-01T10:00:00.000Z"),
          quantity: 1,
          grossItemAmount: 100,
          allocationBaseAmount: 100,
          allocatedNetRevenue: 100,
        },
      ];

      let queryCount = 0;
      const mockPrisma = {} as PrismaClient;
      const repo = createBiRepository(mockPrisma);

      repo.findRealizedProductMovements = vi.fn().mockImplementation(async () => {
        queryCount++;
        return {
          movements: [...mockMovements],
          adjustments: [],
        };
      });

      const toExclusive = new Date("2026-09-15T00:00:00.000Z");

      // 1. Chamada inicial em T0
      await repo.findHistoricalLastPhysicalSales!(toExclusive);
      expect(queryCount).toBe(1);

      // 2. Avança 4 minutos e 59 segundos (< 5 min TTL)
      vi.advanceTimersByTime(4 * 60 * 1000 + 59 * 1000);
      await repo.findHistoricalLastPhysicalSales!(toExclusive);
      expect(queryCount).toBe(1); // Continua no cache

      // 3. Avança mais 2 segundos (ultrapassa 5 min TTL)
      vi.advanceTimersByTime(2 * 1000);
      await repo.findHistoricalLastPhysicalSales!(toExclusive);
      expect(queryCount).toBe(2); // Expirou TTL -> reconstruiu
    } finally {
      vi.useRealTimers();
    }
  });
});
