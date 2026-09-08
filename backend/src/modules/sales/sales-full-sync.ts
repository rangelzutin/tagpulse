import { SaleAnchorType } from "@prisma/client";
import {
  isConfirmedInboundTagPlusNfe,
  normalizeTagPlusNfe,
  normalizeTagPlusPedido,
  normalizeTagPlusVendaSimples,
} from "../../integrations/tagplus/sales/sales-normalizers.js";
import type { SalesPageFetcher } from "../../integrations/tagplus/sales/sales-page-fetchers.js";
import type { SalesRepository } from "./sales-repository.js";

const DEFAULT_PER_PAGE = 100;

export interface ResourceSyncResult {
  resource: "pedidos" | "vendas_simples" | "nfes";
  pagesFetched: number;
  recordsFetched: number;
  reconciledAbsent: number;
  status: "COMPLETED" | "FAILED";
}

export interface SalesFullSyncResult {
  status: "COMPLETED" | "FAILED";
  startedAt: Date;
  completedAt: Date;
  pedidos: ResourceSyncResult;
  vendasSimples: ResourceSyncResult;
  nfes: ResourceSyncResult;
}

export interface SalesFullSyncDependencies {
  pedidosFetcher: SalesPageFetcher;
  vendasSimplesFetcher: SalesPageFetcher;
  nfesFetcher: SalesPageFetcher;
  salesRepository: SalesRepository;
  now?: () => Date;
  perPage?: number;
}

export function createSalesFullSync(dependencies: SalesFullSyncDependencies) {
  const now = dependencies.now ?? (() => new Date());
  const perPage = dependencies.perPage ?? DEFAULT_PER_PAGE;

  async function syncResource(
    connectionId: string,
    resource: "pedidos" | "vendas_simples" | "nfes",
    fetcher: SalesPageFetcher,
    processRecord: (item: unknown, observedAt: Date) => Promise<string | null>,
    docType: SaleAnchorType,
    afterExhaustion?: (observedSourceIds: Set<string>) => Promise<void>,
  ): Promise<ResourceSyncResult> {
    let page = 1;
    let pagesFetched = 0;
    let recordsFetched = 0;
    const seenSourceIds = new Set<string>();

    for (;;) {
      const rawPage = await fetcher({ page, perPage });
      if (!Array.isArray(rawPage)) {
        throw new Error(
          `Invalid ${resource} page response: expected array, got ${typeof rawPage}`,
        );
      }

      pagesFetched += 1;

      // Only [] terminates endpoint scan. A short page MUST NOT terminate scan.
      if (rawPage.length === 0) {
        break;
      }

      const observedAt = now();
      for (const item of rawPage) {
        recordsFetched += 1;
        const sourceId = await processRecord(item, observedAt);
        if (sourceId) {
          seenSourceIds.add(sourceId);
        }
      }

      page += 1;
    }

    // 1. Endpoint exhaustion reached: reconcile missing documents of this docType
    const reconciledAbsent =
      await dependencies.salesRepository.reconcileAbsentSourceDocs(
        connectionId,
        docType,
        seenSourceIds,
      );

    // 2. Safe post-exhaustion hook (e.g. recovering confirmed inbound NFE contamination)
    if (afterExhaustion) {
      await afterExhaustion(seenSourceIds);
    }

    return {
      resource,
      pagesFetched,
      recordsFetched,
      reconciledAbsent,
      status: "COMPLETED",
    };
  }

  return async function syncSales(
    connectionId: string,
  ): Promise<SalesFullSyncResult> {
    const startedAt = now();

    // 1. PEDIDOS (mandatory first)
    const pedidosResult = await syncResource(
      connectionId,
      "pedidos",
      dependencies.pedidosFetcher,
      async (item, observedAt) => {
        const normalized = normalizeTagPlusPedido(item);
        await dependencies.salesRepository.persistPedido(
          connectionId,
          normalized,
          observedAt,
        );
        return normalized.sourceId;
      },
      SaleAnchorType.PEDIDO,
    );

    // 2. VENDAS_SIMPLES (mandatory second)
    const vendasSimplesResult = await syncResource(
      connectionId,
      "vendas_simples",
      dependencies.vendasSimplesFetcher,
      async (item, observedAt) => {
        const normalized = normalizeTagPlusVendaSimples(item);
        await dependencies.salesRepository.persistChildSale(
          connectionId,
          normalized,
          observedAt,
        );
        return normalized.sourceId;
      },
      SaleAnchorType.VENDA_SIMPLES,
    );

    // 3. NFES (mandatory third)
    const confirmedInboundSourceIds = new Set<string>();

    const nfesResult = await syncResource(
      connectionId,
      "nfes",
      dependencies.nfesFetcher,
      async (item, observedAt) => {
        const inboundSourceId = isConfirmedInboundTagPlusNfe(item);
        if (inboundSourceId) {
          confirmedInboundSourceIds.add(inboundSourceId);
          return null;
        }

        const normalized = normalizeTagPlusNfe(item);
        if (!normalized) {
          return null;
        }
        await dependencies.salesRepository.persistChildSale(
          connectionId,
          normalized,
          observedAt,
        );
        return normalized.sourceId;
      },
      SaleAnchorType.NFE,
      async () => {
        if (confirmedInboundSourceIds.size > 0) {
          await dependencies.salesRepository.removeConfirmedInboundNfeSales(
            connectionId,
            confirmedInboundSourceIds,
          );
        }
      },
    );

    const completedAt = now();

    return {
      status: "COMPLETED",
      startedAt,
      completedAt,
      pedidos: pedidosResult,
      vendasSimples: vendasSimplesResult,
      nfes: nfesResult,
    };
  };
}
