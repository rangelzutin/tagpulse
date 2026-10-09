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

export type DocumentExistenceChecker = (
  docType: SaleAnchorType,
  sourceId: string,
) => Promise<"FOUND" | "NOT_FOUND" | "ERROR">;

export interface SalesFullSyncDependencies {
  pedidosFetcher: SalesPageFetcher;
  vendasSimplesFetcher: SalesPageFetcher;
  nfesFetcher: SalesPageFetcher;
  salesRepository: SalesRepository;
  documentChecker?: DocumentExistenceChecker;
  now?: () => Date;
  perPage?: number;
}

export interface SalesSyncOptions {
  mode?: "FULL" | "INCREMENTAL";
  window?: {
    since: string;
    until: string;
  };
  onProgress?: (progress: {
    current: number;
    total?: number;
    substep?: string;
    label?: string;
  }) => void;
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
    options?: SalesSyncOptions,
    afterExhaustion?: (observedSourceIds: Set<string>) => Promise<void>,
  ): Promise<ResourceSyncResult> {
    const labelMap: Record<"pedidos" | "vendas_simples" | "nfes", string> = {
      pedidos: "Atualizando pedidos",
      vendas_simples: "Atualizando vendas simples",
      nfes: "Atualizando NF-e",
    };
    const substepLabel = labelMap[resource];

    options?.onProgress?.({
      current: 0,
      substep: substepLabel,
      label: substepLabel,
    });

    let page = 1;
    let pagesFetched = 0;
    let recordsFetched = 0;
    const seenSourceIds = new Set<string>();

    for (;;) {
      const rawPage = await fetcher({
        page,
        perPage,
        since: options?.window?.since,
        until: options?.window?.until,
        dataFilter: options?.window ? "data_alteracao" : undefined,
      });
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

      options?.onProgress?.({
        current: recordsFetched,
        substep: substepLabel,
        label: substepLabel,
      });

      page += 1;
    }

    // 1. Endpoint exhaustion reached: reconcile missing documents of this docType
    let reconciledAbsent = 0;
    if (options?.mode !== "INCREMENTAL") {
      reconciledAbsent =
        await dependencies.salesRepository.reconcileAbsentSourceDocs(
          connectionId,
          docType,
          seenSourceIds,
        );

      // 2. Safe post-exhaustion hook (e.g. recovering confirmed inbound NFE contamination)
      if (afterExhaustion) {
        await afterExhaustion(seenSourceIds);
      }
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
    options?: SalesSyncOptions,
  ): Promise<SalesFullSyncResult> {
    const startedAt = now();
    const checkedSiblingStatus = new Map<string, "FOUND" | "NOT_FOUND" | "ERROR">();

    async function reconcileSiblingsForChild(
      parentSaleId: string,
      currentDocType: SaleAnchorType,
      currentSourceId: string,
    ): Promise<void> {
      if (!dependencies.documentChecker) {
        return;
      }

      const activeSiblings =
        await dependencies.salesRepository.findActiveSiblingSourceDocs(
          connectionId,
          parentSaleId,
          currentDocType,
          currentSourceId,
        );

      for (const sibling of activeSiblings) {
        const key = `${sibling.docType}:${sibling.sourceId}`;
        let status = checkedSiblingStatus.get(key);

        if (status === undefined) {
          try {
            status = await dependencies.documentChecker(
              sibling.docType,
              sibling.sourceId,
            );
          } catch {
            status = "ERROR";
          }
          checkedSiblingStatus.set(key, status);
        }

        if (status === "NOT_FOUND") {
          await dependencies.salesRepository.markSourceDocAbsent(sibling.id);
        }
      }
    }

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
      options,
    );

    // 2. VENDAS_SIMPLES (mandatory second)
    const vendasSimplesResult = await syncResource(
      connectionId,
      "vendas_simples",
      dependencies.vendasSimplesFetcher,
      async (item, observedAt) => {
        const normalized = normalizeTagPlusVendaSimples(item);
        const persistResult = await dependencies.salesRepository.persistChildSale(
          connectionId,
          normalized,
          observedAt,
        );
        if (persistResult?.parentSaleId) {
          await reconcileSiblingsForChild(
            persistResult.parentSaleId,
            normalized.anchorType,
            normalized.sourceId,
          );
        }
        return normalized.sourceId;
      },
      SaleAnchorType.VENDA_SIMPLES,
      options,
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
        const persistResult = await dependencies.salesRepository.persistChildSale(
          connectionId,
          normalized,
          observedAt,
        );
        if (persistResult?.parentSaleId) {
          await reconcileSiblingsForChild(
            persistResult.parentSaleId,
            normalized.anchorType,
            normalized.sourceId,
          );
        }
        return normalized.sourceId;
      },
      SaleAnchorType.NFE,
      options,
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
