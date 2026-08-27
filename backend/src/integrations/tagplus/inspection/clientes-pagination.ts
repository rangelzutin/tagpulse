import {
  TagPlusHttpError,
  type TagPlusClient,
  type TagPlusResponse,
} from "../tagplus-client.js";

export type RootType = "array" | "null" | "object" | "string" | "number" | "boolean";

export interface SafePageEvidence {
  path: string;
  httpStatus: number;
  durationMs: number;
  rootType: RootType | "unavailable";
  itemCount: number | null;
  paginationHeaders: Record<string, string>;
}

interface InternalPageEvidence extends SafePageEvidence {
  technicalIds: string[];
}

export interface ClientesPaginationEvidence {
  resource: "clientes";
  apiVersion: string;
  rootType: RootType | "unavailable";
  defaultItemCount: number | null;
  pageSupported: boolean;
  pageBase: "1" | "not_confirmed";
  pageZeroBehavior: string;
  perPageSupported: boolean;
  testedPerPageValues: number[];
  maximumPerPage: number | "not_confirmed";
  aboveMaximumBehavior: string;
  zeroPerPageBehavior: string;
  invalidPerPageBehavior: string;
  endBehavior: string;
  lastPageEvidence: "short_page" | "not_confirmed";
  explicitTotal: number | "not explicitly provided";
  paginationMetadata: string[];
  ordering: "OBSERVED_NOT_GUARANTEED" | "UNSPECIFIED";
  stabilityProbe: "consistent" | "inconsistent" | "not_confirmed";
  realApiCalls: number;
  probes: SafePageEvidence[];
}

export async function inspectClientesPagination(
  client: TagPlusClient,
  apiVersion: string,
  now: () => number = performance.now.bind(performance),
): Promise<ClientesPaginationEvidence> {
  const probes: InternalPageEvidence[] = [];
  const call = async (path: string): Promise<InternalPageEvidence> => {
    const startedAt = now();
    try {
      const response = await client.get(path);
      const evidence = analyzePage(path, response, Math.round(now() - startedAt));
      probes.push(evidence);
      return evidence;
    } catch (error: unknown) {
      if (!(error instanceof TagPlusHttpError)) throw error;
      const evidence: InternalPageEvidence = {
        path,
        httpStatus: error.status,
        durationMs: Math.round(now() - startedAt),
        rootType: "unavailable",
        itemCount: null,
        paginationHeaders: {},
        technicalIds: [],
      };
      probes.push(evidence);
      return evidence;
    }
  };

  const defaultPage = await call("/clientes");
  const pageOne = await call("/clientes?page=1&per_page=1");
  const pageTwo = await call("/clientes?page=2&per_page=1");
  const pageOneRepeated = await call("/clientes?page=1&per_page=1");
  const pageZero = await call("/clientes?page=0&per_page=1");
  const perPageTwo = await call("/clientes?page=1&per_page=2");
  const perPageTen = await call("/clientes?page=1&per_page=10");
  const perPageFifty = await call("/clientes?page=1&per_page=50");
  const perPageHundred = await call("/clientes?page=1&per_page=100");
  const perPageAbove = await call("/clientes?page=1&per_page=101");
  const perPageZero = await call("/clientes?page=1&per_page=0");
  const perPageInvalid = await call("/clientes?page=1&per_page=invalid");
  const beyondEnd = await call("/clientes?page=2147483647&per_page=1");

  const successfulPerPage = [
    [2, perPageTwo],
    [10, perPageTen],
    [50, perPageFifty],
    [100, perPageHundred],
  ] as const;
  const largestAccepted = [...successfulPerPage]
    .reverse()
    .find(([, probe]) => probe.httpStatus >= 200 && probe.httpStatus < 300);
  const shortPage = largestAccepted && largestAccepted[1].itemCount !== null && largestAccepted[1].itemCount < largestAccepted[0];
  const metadata = collectMetadata(probes);

  return {
    resource: "clientes",
    apiVersion,
    rootType: defaultPage.rootType,
    defaultItemCount: defaultPage.itemCount,
    pageSupported: pageOne.httpStatus === 200 && pageTwo.httpStatus === 200,
    pageBase: pageOne.httpStatus === 200 && pageZero.httpStatus !== 200 ? "1" : "not_confirmed",
    pageZeroBehavior: describeProbe(pageZero),
    perPageSupported: successfulPerPage.every(([, probe]) => probe.httpStatus === 200),
    testedPerPageValues: [1, 2, 10, 50, 100, 101, 0],
    maximumPerPage:
      perPageHundred.httpStatus === 200 && perPageAbove.httpStatus !== 200
        ? 100
        : "not_confirmed",
    aboveMaximumBehavior: describeProbe(perPageAbove),
    zeroPerPageBehavior: describeProbe(perPageZero),
    invalidPerPageBehavior: describeProbe(perPageInvalid),
    endBehavior: describeProbe(beyondEnd),
    lastPageEvidence: shortPage ? "short_page" : "not_confirmed",
    explicitTotal: readExplicitTotal(probes),
    paginationMetadata: metadata,
    ordering: inferOrdering(pageOne, pageTwo),
    stabilityProbe: compareStability(pageOne, pageOneRepeated),
    realApiCalls: probes.length,
    probes: probes.map(stripTechnicalIds),
  };
}

export function analyzePage(
  path: string,
  response: TagPlusResponse<unknown>,
  durationMs: number,
): InternalPageEvidence {
  const rootType = getRootType(response.data);
  const items = Array.isArray(response.data) ? response.data : null;
  return {
    path,
    httpStatus: response.status,
    durationMs,
    rootType,
    itemCount: items?.length ?? null,
    paginationHeaders: response.paginationHeaders,
    technicalIds: items ? items.map(readTechnicalId).filter((id): id is string => id !== null) : [],
  };
}

export function isLastPage(itemCount: number, perPage: number): boolean {
  return itemCount < perPage;
}

function readTechnicalId(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("id" in value)) return null;
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" || typeof id === "number" ? String(id) : null;
}

function compareStability(a: InternalPageEvidence, b: InternalPageEvidence): ClientesPaginationEvidence["stabilityProbe"] {
  if (a.itemCount === null || b.itemCount === null) return "not_confirmed";
  return a.itemCount === b.itemCount && JSON.stringify(a.technicalIds) === JSON.stringify(b.technicalIds)
    ? "consistent"
    : "inconsistent";
}

function inferOrdering(a: InternalPageEvidence, b: InternalPageEvidence): ClientesPaginationEvidence["ordering"] {
  const ids = [...a.technicalIds, ...b.technicalIds].map(Number);
  if (ids.length < 2 || ids.some((id) => !Number.isFinite(id))) return "UNSPECIFIED";
  return ids.every((id, index) => index === 0 || ids[index - 1]! <= id)
    ? "OBSERVED_NOT_GUARANTEED"
    : "UNSPECIFIED";
}

function describeProbe(probe: InternalPageEvidence): string {
  if (probe.httpStatus !== 200) return `http_${probe.httpStatus}`;
  if (probe.rootType === "array" && probe.itemCount === 0) return "empty_array";
  return `array_with_${probe.itemCount ?? "unknown"}_items`;
}

function collectMetadata(probes: InternalPageEvidence[]): string[] {
  return [...new Set(probes.flatMap((probe) => Object.keys(probe.paginationHeaders)))].sort();
}

function readExplicitTotal(probes: InternalPageEvidence[]): number | "not explicitly provided" {
  for (const probe of probes) {
    for (const name of ["x-total", "x-total-count", "x-pagination-total"]) {
      const value = probe.paginationHeaders[name];
      if (value !== undefined && /^\d+$/.test(value)) return Number(value);
    }
  }
  return "not explicitly provided";
}

function stripTechnicalIds(probe: InternalPageEvidence): SafePageEvidence {
  return {
    path: probe.path,
    httpStatus: probe.httpStatus,
    durationMs: probe.durationMs,
    rootType: probe.rootType,
    itemCount: probe.itemCount,
    paginationHeaders: probe.paginationHeaders,
  };
}

function getRootType(value: unknown): RootType {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value as RootType;
}
