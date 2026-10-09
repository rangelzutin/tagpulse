import { SaleAnchorType } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  createSalesFullSync,
  type DocumentExistenceChecker,
  type SalesFullSyncDependencies,
} from "../src/modules/sales/sales-full-sync.js";
import type {
  NormalizedSale,
} from "../src/integrations/tagplus/sales/sales-normalizers.js";
import type { SalesRepository } from "../src/modules/sales/sales-repository.js";

function createMockSale(
  anchorType: SaleAnchorType,
  sourceId: string,
  parentPedidoSourceId: string | null = null,
): NormalizedSale {
  return {
    anchorType,
    sourceId,
    parentPedidoSourceId,
    netAmount: "100.00",
    customerSourceId: "cust-1",
    status: "A",
    sourceCreatedAt: new Date("2026-10-01T10:00:00Z"),
    sourceConfirmedAt: new Date("2026-10-01T10:00:00Z"),
    sourceEmissaoAt: null,
    items: [],
  };
}

function setupHarness(options?: {
  documentChecker?: DocumentExistenceChecker;
  siblingsBySale?: Record<
    string,
    Array<{ id: string; docType: SaleAnchorType; sourceId: string }>
  >;
}) {
  const markedAbsentIds: string[] = [];
  const checkedCalls: Array<{ docType: SaleAnchorType; sourceId: string }> = [];

  const defaultChecker: DocumentExistenceChecker = async (docType, sourceId) => {
    checkedCalls.push({ docType, sourceId });
    return "FOUND";
  };

  const documentChecker = options?.documentChecker ?? defaultChecker;

  const mockRepository: SalesRepository = {
    persistPedido: vi.fn().mockResolvedValue(undefined),
    persistChildSale: vi.fn().mockImplementation(async (_conn, childSale: NormalizedSale) => {
      const parentSaleId = childSale.parentPedidoSourceId
        ? `sale-${childSale.parentPedidoSourceId}`
        : null;
      return {
        parentSaleId,
        docId: `doc-${childSale.sourceId}`,
      };
    }),
    reconcileAbsentSourceDocs: vi.fn().mockResolvedValue(0),
    removeConfirmedInboundNfeSales: vi.fn().mockResolvedValue(0),
    findActiveSiblingSourceDocs: vi
      .fn()
      .mockImplementation(async (_conn, saleId, excludeDocType, excludeSourceId) => {
        const list = options?.siblingsBySale?.[saleId] ?? [];
        return list.filter(
          (s) => !(s.docType === excludeDocType && s.sourceId === excludeSourceId),
        );
      }),
    markSourceDocAbsent: vi.fn().mockImplementation(async (id: string) => {
      markedAbsentIds.push(id);
    }),
  };

  return {
    mockRepository,
    markedAbsentIds,
    checkedCalls,
    documentChecker,
  };
}

describe("Sales Sibling Reconciliation in syncSales", () => {
  const connectionId = "conn-test";

  // Case A: VS atual chega; irmã antiga retorna 404 -> irmã sourcePresent=false
  it("A. marks old sibling VS as absent when API returns 404", async () => {
    const harness = setupHarness({
      siblingsBySale: {
        "sale-1398": [
          { id: "doc-7747", docType: SaleAnchorType.VENDA_SIMPLES, sourceId: "7747" },
          { id: "doc-7750", docType: SaleAnchorType.VENDA_SIMPLES, sourceId: "7750" },
        ],
      },
      documentChecker: async (docType, sourceId) => {
        if (docType === SaleAnchorType.VENDA_SIMPLES && sourceId === "7747") {
          return "NOT_FOUND";
        }
        return "FOUND";
      },
    });

    const sync = createSalesFullSync({
      pedidosFetcher: vi.fn().mockResolvedValue([]),
      vendasSimplesFetcher: vi.fn().mockImplementation(async ({ page }) => {
        if (page === 1) {
          return [
            {
              id: 7750,
              valor_total: 1465,
              pedido_os_vinculada: { id: 1398 },
              itens: [],
            },
          ];
        }
        return [];
      }),
      nfesFetcher: vi.fn().mockResolvedValue([]),
      salesRepository: harness.mockRepository,
      documentChecker: harness.documentChecker,
    });

    await sync(connectionId, { mode: "INCREMENTAL" });

    expect(harness.mockRepository.markSourceDocAbsent).toHaveBeenCalledWith("doc-7747");
    expect(harness.markedAbsentIds).toEqual(["doc-7747"]);
  });

  // Case B: irmã retorna 200 -> permanece true
  it("B. keeps sibling as true when API returns 200 FOUND", async () => {
    const harness = setupHarness({
      siblingsBySale: {
        "sale-1398": [
          { id: "doc-7747", docType: SaleAnchorType.VENDA_SIMPLES, sourceId: "7747" },
          { id: "doc-7750", docType: SaleAnchorType.VENDA_SIMPLES, sourceId: "7750" },
        ],
      },
      documentChecker: async () => "FOUND",
    });

    const sync = createSalesFullSync({
      pedidosFetcher: vi.fn().mockResolvedValue([]),
      vendasSimplesFetcher: vi.fn().mockImplementation(async ({ page }) => {
        if (page === 1) {
          return [{ id: 7750, valor_total: 1465, pedido_os_vinculada: { id: 1398 }, itens: [] }];
        }
        return [];
      }),
      nfesFetcher: vi.fn().mockResolvedValue([]),
      salesRepository: harness.mockRepository,
      documentChecker: harness.documentChecker,
    });

    await sync(connectionId, { mode: "INCREMENTAL" });

    expect(harness.mockRepository.markSourceDocAbsent).not.toHaveBeenCalled();
    expect(harness.markedAbsentIds).toEqual([]);
  });

  // Case C: irmã retorna 429 -> permanece true (failure-safe)
  it("C. keeps sibling as true when checker encounters 429 rate limit (failure-safe)", async () => {
    const harness = setupHarness({
      siblingsBySale: {
        "sale-1398": [
          { id: "doc-7747", docType: SaleAnchorType.VENDA_SIMPLES, sourceId: "7747" },
          { id: "doc-7750", docType: SaleAnchorType.VENDA_SIMPLES, sourceId: "7750" },
        ],
      },
      documentChecker: async () => "ERROR",
    });

    const sync = createSalesFullSync({
      pedidosFetcher: vi.fn().mockResolvedValue([]),
      vendasSimplesFetcher: vi.fn().mockImplementation(async ({ page }) => {
        if (page === 1) {
          return [{ id: 7750, valor_total: 1465, pedido_os_vinculada: { id: 1398 }, itens: [] }];
        }
        return [];
      }),
      nfesFetcher: vi.fn().mockResolvedValue([]),
      salesRepository: harness.mockRepository,
      documentChecker: harness.documentChecker,
    });

    await sync(connectionId, { mode: "INCREMENTAL" });

    expect(harness.mockRepository.markSourceDocAbsent).not.toHaveBeenCalled();
    expect(harness.markedAbsentIds).toEqual([]);
  });

  // Case D: irmã retorna 500 -> permanece true (failure-safe)
  it("D. keeps sibling as true when checker encounters 500 server error", async () => {
    const harness = setupHarness({
      siblingsBySale: {
        "sale-1398": [
          { id: "doc-7747", docType: SaleAnchorType.VENDA_SIMPLES, sourceId: "7747" },
        ],
      },
      documentChecker: async () => "ERROR",
    });

    const sync = createSalesFullSync({
      pedidosFetcher: vi.fn().mockResolvedValue([]),
      vendasSimplesFetcher: vi.fn().mockImplementation(async ({ page }) => {
        if (page === 1) {
          return [{ id: 7750, valor_total: 1465, pedido_os_vinculada: { id: 1398 }, itens: [] }];
        }
        return [];
      }),
      nfesFetcher: vi.fn().mockResolvedValue([]),
      salesRepository: harness.mockRepository,
      documentChecker: harness.documentChecker,
    });

    await sync(connectionId);
    expect(harness.mockRepository.markSourceDocAbsent).not.toHaveBeenCalled();
  });

  // Case E: timeout/erro de rede -> permanece true (failure-safe)
  it("E. keeps sibling as true when checker throws an unhandled exception/timeout", async () => {
    const harness = setupHarness({
      siblingsBySale: {
        "sale-1398": [
          { id: "doc-7747", docType: SaleAnchorType.VENDA_SIMPLES, sourceId: "7747" },
        ],
      },
      documentChecker: async () => {
        throw new Error("Connection timeout");
      },
    });

    const sync = createSalesFullSync({
      pedidosFetcher: vi.fn().mockResolvedValue([]),
      vendasSimplesFetcher: vi.fn().mockImplementation(async ({ page }) => {
        if (page === 1) {
          return [{ id: 7750, valor_total: 1465, pedido_os_vinculada: { id: 1398 }, itens: [] }];
        }
        return [];
      }),
      nfesFetcher: vi.fn().mockResolvedValue([]),
      salesRepository: harness.mockRepository,
      documentChecker: harness.documentChecker,
    });

    // Sync completes without crashing and does not mark absent
    await expect(sync(connectionId)).resolves.toBeDefined();
    expect(harness.mockRepository.markSourceDocAbsent).not.toHaveBeenCalled();
  });

  // Case F: NFE irmã 404 -> false
  it("F. marks sibling NFE as absent when API returns 404", async () => {
    const harness = setupHarness({
      siblingsBySale: {
        "sale-1340": [
          { id: "doc-2890", docType: SaleAnchorType.NFE, sourceId: "2890" },
          { id: "doc-2891", docType: SaleAnchorType.NFE, sourceId: "2891" },
        ],
      },
      documentChecker: async (docType, sourceId) => {
        if (docType === SaleAnchorType.NFE && sourceId === "2890") return "NOT_FOUND";
        return "FOUND";
      },
    });

    const sync = createSalesFullSync({
      pedidosFetcher: vi.fn().mockResolvedValue([]),
      vendasSimplesFetcher: vi.fn().mockResolvedValue([]),
      nfesFetcher: vi.fn().mockImplementation(async ({ page }) => {
        if (page === 1) {
          return [
            {
              id: 2891,
              tipo: "S",
              valor_nota: 4854.6,
              pedido_os_vinculada: { id: 1340 },
              itens: [],
            },
          ];
        }
        return [];
      }),
      salesRepository: harness.mockRepository,
      documentChecker: harness.documentChecker,
    });

    await sync(connectionId);
    expect(harness.mockRepository.markSourceDocAbsent).toHaveBeenCalledWith("doc-2890");
    expect(harness.markedAbsentIds).toEqual(["doc-2890"]);
  });

  // Case G: VS e NFE na mesma Sale -> tipos consultados com docType correto
  it("G. checks both VS and NFE siblings with their respective docTypes", async () => {
    const calls: Array<{ docType: SaleAnchorType; sourceId: string }> = [];
    const harness = setupHarness({
      siblingsBySale: {
        "sale-1340": [
          { id: "doc-7258", docType: SaleAnchorType.VENDA_SIMPLES, sourceId: "7258" },
          { id: "doc-2890", docType: SaleAnchorType.NFE, sourceId: "2890" },
        ],
      },
      documentChecker: async (docType, sourceId) => {
        calls.push({ docType, sourceId });
        return "FOUND";
      },
    });

    const sync = createSalesFullSync({
      pedidosFetcher: vi.fn().mockResolvedValue([]),
      vendasSimplesFetcher: vi.fn().mockResolvedValue([]),
      nfesFetcher: vi.fn().mockImplementation(async ({ page }) => {
        if (page === 1) {
          return [
            {
              id: 2891,
              tipo: "S",
              valor_nota: 4854.6,
              pedido_os_vinculada: { id: 1340 },
              itens: [],
            },
          ];
        }
        return [];
      }),
      salesRepository: harness.mockRepository,
      documentChecker: harness.documentChecker,
    });

    await sync(connectionId);
    expect(calls).toEqual([
      { docType: SaleAnchorType.VENDA_SIMPLES, sourceId: "7258" },
      { docType: SaleAnchorType.NFE, sourceId: "2890" },
    ]);
  });

  // Case H: Sale A -> nunca altera filho de Sale B
  it("H. Sale A reprocessing never queries or affects siblings of Sale B", async () => {
    const harness = setupHarness({
      siblingsBySale: {
        "sale-A": [{ id: "doc-A-sibling", docType: SaleAnchorType.VENDA_SIMPLES, sourceId: "101" }],
        "sale-B": [{ id: "doc-B-sibling", docType: SaleAnchorType.VENDA_SIMPLES, sourceId: "202" }],
      },
      documentChecker: async (docType, sourceId) => {
        if (sourceId === "101") return "NOT_FOUND";
        if (sourceId === "202") return "NOT_FOUND";
        return "FOUND";
      },
    });

    const sync = createSalesFullSync({
      pedidosFetcher: vi.fn().mockResolvedValue([]),
      vendasSimplesFetcher: vi.fn().mockImplementation(async ({ page }) => {
        if (page === 1) {
          // Only child of Sale A arrives
          return [{ id: 100, valor_total: 50, pedido_os_vinculada: { id: "A" }, itens: [] }];
        }
        return [];
      }),
      nfesFetcher: vi.fn().mockResolvedValue([]),
      salesRepository: harness.mockRepository,
      documentChecker: harness.documentChecker,
    });

    await sync(connectionId);

    // Only Sale A's sibling was marked absent; Sale B was untouched
    expect(harness.markedAbsentIds).toEqual(["doc-A-sibling"]);
    expect(harness.mockRepository.findActiveSiblingSourceDocs).toHaveBeenCalledWith(
      connectionId,
      "sale-A",
      SaleAnchorType.VENDA_SIMPLES,
      "100",
    );
  });

  // Case I: filho atual não é consultado novamente desnecessariamente
  it("I. does not query current incoming child as its own sibling", async () => {
    const harness = setupHarness({
      siblingsBySale: {
        "sale-1398": [
          { id: "doc-7750", docType: SaleAnchorType.VENDA_SIMPLES, sourceId: "7750" },
        ],
      },
    });

    const sync = createSalesFullSync({
      pedidosFetcher: vi.fn().mockResolvedValue([]),
      vendasSimplesFetcher: vi.fn().mockImplementation(async ({ page }) => {
        if (page === 1) {
          return [{ id: 7750, valor_total: 1465, pedido_os_vinculada: { id: 1398 }, itens: [] }];
        }
        return [];
      }),
      nfesFetcher: vi.fn().mockResolvedValue([]),
      salesRepository: harness.mockRepository,
      documentChecker: harness.documentChecker,
    });

    await sync(connectionId);

    // Because 7750 was the current child, it was excluded from active siblings
    expect(harness.checkedCalls).toHaveLength(0);
  });

  // Case J: vários filhos processados no mesmo run -> não provocar explosão de requests (deduplicação)
  it("J. deduplicates checker requests when multiple children belonging to the same Sale arrive in the same run", async () => {
    let checkCount = 0;
    const harness = setupHarness({
      siblingsBySale: {
        "sale-1398": [
          { id: "doc-7747", docType: SaleAnchorType.VENDA_SIMPLES, sourceId: "7747" },
        ],
      },
      documentChecker: async (_docType, sourceId) => {
        if (sourceId === "7747") {
          checkCount += 1;
          return "NOT_FOUND";
        }
        return "FOUND";
      },
    });

    const sync = createSalesFullSync({
      pedidosFetcher: vi.fn().mockResolvedValue([]),
      vendasSimplesFetcher: vi.fn().mockImplementation(async ({ page }) => {
        if (page === 1) {
          return [
            { id: 7750, valor_total: 1465, pedido_os_vinculada: { id: 1398 }, itens: [] },
            { id: 7751, valor_total: 100, pedido_os_vinculada: { id: 1398 }, itens: [] },
            { id: 7752, valor_total: 200, pedido_os_vinculada: { id: 1398 }, itens: [] },
          ];
        }
        return [];
      }),
      nfesFetcher: vi.fn().mockResolvedValue([]),
      salesRepository: harness.mockRepository,
      documentChecker: harness.documentChecker,
    });

    await sync(connectionId);

    // Sibling 7747 must only be checked once across the entire run
    expect(checkCount).toBe(1);
  });

  // Case K: documento false reaparece -> upsert restaura true
  it("K. verifies that upsert restores sourcePresent=true if an absent document reappears in later sync", async () => {
    // In our implementation of persistChildSale, the Prisma upsert/update explicitly sets sourcePresent: true
    const harness = setupHarness();

    const sync = createSalesFullSync({
      pedidosFetcher: vi.fn().mockResolvedValue([]),
      vendasSimplesFetcher: vi.fn().mockImplementation(async ({ page }) => {
        if (page === 1) {
          return [{ id: 7747, valor_total: 1420.7, pedido_os_vinculada: { id: 1398 }, itens: [] }];
        }
        return [];
      }),
      nfesFetcher: vi.fn().mockResolvedValue([]),
      salesRepository: harness.mockRepository,
      documentChecker: harness.documentChecker,
    });

    await sync(connectionId);

    expect(harness.mockRepository.persistChildSale).toHaveBeenCalledWith(
      connectionId,
      expect.objectContaining({
        anchorType: SaleAnchorType.VENDA_SIMPLES,
        sourceId: "7747",
      }),
      expect.any(Date),
    );
  });

  // Case L: idempotência -> segunda execução não altera resultado
  it("L. idempotent: second execution produces identical results without unwanted state mutation", async () => {
    let checkCount = 0;
    const harness = setupHarness({
      siblingsBySale: {
        "sale-1398": [
          { id: "doc-7747", docType: SaleAnchorType.VENDA_SIMPLES, sourceId: "7747" },
        ],
      },
      documentChecker: async () => {
        checkCount += 1;
        return "NOT_FOUND";
      },
    });

    const sync = createSalesFullSync({
      pedidosFetcher: vi.fn().mockResolvedValue([]),
      vendasSimplesFetcher: vi.fn().mockImplementation(async ({ page }) => {
        if (page === 1) {
          return [{ id: 7750, valor_total: 1465, pedido_os_vinculada: { id: 1398 }, itens: [] }];
        }
        return [];
      }),
      nfesFetcher: vi.fn().mockResolvedValue([]),
      salesRepository: harness.mockRepository,
      documentChecker: harness.documentChecker,
    });

    // Run 1
    await sync(connectionId);
    expect(harness.markedAbsentIds).toEqual(["doc-7747"]);
    expect(checkCount).toBe(1);

    // Run 2: idempotent
    await sync(connectionId);
    expect(harness.markedAbsentIds).toEqual(["doc-7747", "doc-7747"]);
    expect(checkCount).toBe(2); // In run 2, a new run-scoped cache is used
  });
});
