import {
  TagPlusHttpError,
  type TagPlusClient,
  type TagPlusResponse,
} from "../tagplus-client.js";

export const TARGET_PEDIDO_NUMERO = 1239;
export const TARGET_VENDA_SIMPLES_NUMERO = 626;
export const TARGET_NFE_NUMERO = 2713;
export const DEFAULT_MAX_PAGES_PER_RESOURCE = 5;
export const DEFAULT_PER_PAGE = 100;

export interface RequestRecord {
  method: "GET";
  path: string;
  status: number;
  durationMs: number;
  itemCount: number | null;
}

export type FieldClassification = "OBSERVED" | "INFERRED" | "DOCUMENTED";

export interface StructuralFieldEvidence<T = unknown> {
  classification: FieldClassification;
  fieldPath: string | null;
  observedFieldName: string | null;
  valueSample: T | null;
  present: boolean;
  notes?: string;
}

export interface DocumentStructuralReport {
  resource: "pedidos" | "vendas_simples" | "nfes";
  targetVisibleNumero: number;
  found: boolean;
  actualApiId: number | string | null;
  visibleNumeroFound: number | string | null;
  searchStrategy: string;
  terminationReason:
    | "FOUND"
    | "BOUNDED_PAGE_LIMIT_REACHED"
    | "EMPTY_PAGE"
    | "HTTP_ERROR"
    | "SCOPE_FORBIDDEN"
    | "UNEXPECTED_RESPONSE";
  pagesChecked: number;
  detailFetched: boolean;
  topLevelKeys: string[];
  itemLevelKeys: string[];
  structuralFields: {
    id: StructuralFieldEvidence<number | string>;
    numero: StructuralFieldEvidence<number | string>;
    serie?: StructuralFieldEvidence<number | string>;
    status: StructuralFieldEvidence<string | number>;
    customerReference: StructuralFieldEvidence<unknown>;
    creationDate: StructuralFieldEvidence<string>;
    confirmationDate: StructuralFieldEvidence<string>;
    dataEmissao?: StructuralFieldEvidence<string>;
    totalMerchandise: StructuralFieldEvidence<number | string>;
    headerDiscount: StructuralFieldEvidence<number | string>;
    finalTotal: StructuralFieldEvidence<number | string>;
    itemsArrayPath: StructuralFieldEvidence<string>;
    itemIdentity: StructuralFieldEvidence<string | number>;
    productReference: StructuralFieldEvidence<unknown>;
    quantity: StructuralFieldEvidence<number | string>;
    unitPrice: StructuralFieldEvidence<number | string>;
    itemDiscount: StructuralFieldEvidence<number | string>;
    itemSubtotal: StructuralFieldEvidence<number | string>;
    linkedPedidoReference?: StructuralFieldEvidence<unknown>;
    linkedVendaSimplesReference?: StructuralFieldEvidence<unknown>;
    linkedDocuments?: StructuralFieldEvidence<unknown>;
  };
  sampleItemSnippet: Record<string, unknown> | null;
  rawSampleRedacted: Record<string, unknown> | null;
}

export interface SalesControlCaseInspectionResult {
  inspectionName: "sales_control_case_inspection";
  targetPedidoNumero: typeof TARGET_PEDIDO_NUMERO;
  targetVendaSimplesNumero: typeof TARGET_VENDA_SIMPLES_NUMERO;
  targetNfeNumero: typeof TARGET_NFE_NUMERO;
  timestamp: string;
  totalApiCalls: number;
  requestsAttempted: RequestRecord[];
  scopeEvaluation: {
    readPedidosAccepted: boolean | null;
    readVendasSimplesAccepted: boolean | null;
    readNfesAccepted: boolean | null;
  };
  pedido: DocumentStructuralReport;
  vendaSimples: DocumentStructuralReport;
  nfe: DocumentStructuralReport;
  privacy: {
    tokensExposed: false;
    piiRedacted: true;
    rawPayloadRedacted: true;
  };
}

export interface InspectionOptions {
  maxPagesPerResource?: number;
  perPage?: number;
  now?: () => number;
  timestamp?: () => string;
}

export async function inspectSalesControlCase(
  client: TagPlusClient,
  options: InspectionOptions = {},
): Promise<SalesControlCaseInspectionResult> {
  const now = options.now ?? performance.now.bind(performance);
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  const maxPages = options.maxPagesPerResource ?? DEFAULT_MAX_PAGES_PER_RESOURCE;
  const perPage = options.perPage ?? DEFAULT_PER_PAGE;

  const requestsAttempted: RequestRecord[] = [];
  let totalApiCalls = 0;

  let readPedidosAccepted: boolean | null = null;
  let readVendasSimplesAccepted: boolean | null = null;
  let readNfesAccepted: boolean | null = null;

  async function executeGet<T = unknown>(
    path: string,
  ): Promise<{ response: TagPlusResponse<T> | null; status: number }> {
    totalApiCalls += 1;
    const started = now();
    try {
      const response = await client.get<T>(path);
      const durationMs = Math.round(now() - started);
      const itemCount = Array.isArray(response.data) ? response.data.length : null;
      requestsAttempted.push({
        method: "GET",
        path,
        status: response.status,
        durationMs,
        itemCount,
      });
      return { response, status: response.status };
    } catch (error: unknown) {
      const durationMs = Math.round(now() - started);
      const status = error instanceof TagPlusHttpError ? error.status : 0;
      requestsAttempted.push({
        method: "GET",
        path,
        status,
        durationMs,
        itemCount: null,
      });
      return { response: null, status };
    }
  }

  // --- Inspect Pedidos (target: 1239) ---
  const pedidoReport = await inspectResource({
    resource: "pedidos",
    targetNumero: TARGET_PEDIDO_NUMERO,
    perPage,
    maxPages,
    executeGet,
    onScopeStatus: (status) => {
      readPedidosAccepted = status === 200 ? true : status === 401 || status === 403 ? false : null;
    },
  });

  // --- Inspect Vendas Simples (target: 626) ---
  const vendaSimplesReport = await inspectResource({
    resource: "vendas_simples",
    targetNumero: TARGET_VENDA_SIMPLES_NUMERO,
    perPage,
    maxPages,
    executeGet,
    onScopeStatus: (status) => {
      readVendasSimplesAccepted = status === 200 ? true : status === 401 || status === 403 ? false : null;
    },
  });

  // --- Inspect NF-e (target: 2713) ---
  const nfeReport = await inspectResource({
    resource: "nfes",
    targetNumero: TARGET_NFE_NUMERO,
    perPage,
    maxPages,
    executeGet,
    onScopeStatus: (status) => {
      readNfesAccepted = status === 200 ? true : status === 401 || status === 403 ? false : null;
    },
  });

  return {
    inspectionName: "sales_control_case_inspection",
    targetPedidoNumero: TARGET_PEDIDO_NUMERO,
    targetVendaSimplesNumero: TARGET_VENDA_SIMPLES_NUMERO,
    targetNfeNumero: TARGET_NFE_NUMERO,
    timestamp: timestamp(),
    totalApiCalls,
    requestsAttempted,
    scopeEvaluation: {
      readPedidosAccepted,
      readVendasSimplesAccepted,
      readNfesAccepted,
    },
    pedido: pedidoReport,
    vendaSimples: vendaSimplesReport,
    nfe: nfeReport,
    privacy: {
      tokensExposed: false,
      piiRedacted: true,
      rawPayloadRedacted: true,
    },
  };
}

interface InspectResourceInput {
  resource: "pedidos" | "vendas_simples" | "nfes";
  targetNumero: number;
  perPage: number;
  maxPages: number;
  executeGet: <T = unknown>(
    path: string,
  ) => Promise<{ response: TagPlusResponse<T> | null; status: number }>;
  onScopeStatus: (status: number) => void;
}

async function inspectResource(
  input: InspectResourceInput,
): Promise<DocumentStructuralReport> {
  const { resource, targetNumero, perPage, maxPages, executeGet, onScopeStatus } = input;

  let foundRecord: Record<string, unknown> | null = null;
  let terminationReason: DocumentStructuralReport["terminationReason"] =
    "BOUNDED_PAGE_LIMIT_REACHED";
  let searchStrategy = "BOUNDED_COLLECTION_SCAN";
  let pagesChecked = 0;

  // Step 1: Probe collection query filter (?numero=target)
  const probePath = `/${resource}?numero=${targetNumero}&page=1&per_page=${perPage}`;
  const probeResult = await executeGet<unknown>(probePath);
  onScopeStatus(probeResult.status);

  if (probeResult.status === 401 || probeResult.status === 403) {
    terminationReason = "SCOPE_FORBIDDEN";
    return buildEmptyReport(resource, targetNumero, terminationReason, searchStrategy, 1);
  }

  if (probeResult.status !== 200 || !probeResult.response) {
    terminationReason = "HTTP_ERROR";
    return buildEmptyReport(resource, targetNumero, terminationReason, searchStrategy, 1);
  }

  pagesChecked += 1;
  const probeData = probeResult.response.data;

  if (!Array.isArray(probeData)) {
    terminationReason = "UNEXPECTED_RESPONSE";
    return buildEmptyReport(resource, targetNumero, terminationReason, searchStrategy, pagesChecked);
  }

  // Check if target is inside probe response
  const matchedInProbe = probeData.find((item) =>
    isRecordMatch(item, targetNumero),
  );

  if (matchedInProbe && typeof matchedInProbe === "object" && matchedInProbe !== null) {
    foundRecord = matchedInProbe as Record<string, unknown>;
    terminationReason = "FOUND";
    searchStrategy = "QUERY_FILTER_PROBE";
  } else {
    // If not found in probe, check if probeData was page 1 of unfiltered collection
    let currentPage = 1;
    let keepPaginating = true;

    if (probeData.length > 0 && !matchedInProbe) {
      currentPage = 2;
    }

    while (keepPaginating && currentPage <= maxPages) {
      const pagePath = `/${resource}?page=${currentPage}&per_page=${perPage}`;
      const pageResult = await executeGet<unknown>(pagePath);
      pagesChecked += 1;

      if (pageResult.status !== 200 || !pageResult.response) {
        terminationReason = "HTTP_ERROR";
        keepPaginating = false;
        break;
      }

      const pageData = pageResult.response.data;
      if (!Array.isArray(pageData)) {
        terminationReason = "UNEXPECTED_RESPONSE";
        keepPaginating = false;
        break;
      }

      if (pageData.length === 0) {
        terminationReason = "EMPTY_PAGE";
        keepPaginating = false;
        break;
      }

      const matched = pageData.find((item) => isRecordMatch(item, targetNumero));
      if (matched && typeof matched === "object" && matched !== null) {
        foundRecord = matched as Record<string, unknown>;
        terminationReason = "FOUND";
        searchStrategy = `BOUNDED_COLLECTION_PAGE_${currentPage}`;
        keepPaginating = false;
        break;
      }

      currentPage += 1;
    }
  }

  if (!foundRecord) {
    return buildEmptyReport(
      resource,
      targetNumero,
      terminationReason,
      searchStrategy,
      pagesChecked,
    );
  }

  // Step 2: Target found — fetch detail by actual API id
  const actualApiId = extractId(foundRecord);
  let detailRecord = foundRecord;
  let detailFetched = false;

  if (actualApiId !== null) {
    const detailPath = `/${resource}/${actualApiId}?fields=*`;
    const detailResult = await executeGet<unknown>(detailPath);

    if (
      detailResult.status === 200 &&
      detailResult.response &&
      typeof detailResult.response.data === "object" &&
      detailResult.response.data !== null &&
      !Array.isArray(detailResult.response.data)
    ) {
      detailRecord = detailResult.response.data as Record<string, unknown>;
      detailFetched = true;
    } else {
      const fallbackDetailPath = `/${resource}/${actualApiId}`;
      const fallbackResult = await executeGet<unknown>(fallbackDetailPath);
      if (
        fallbackResult.status === 200 &&
        fallbackResult.response &&
        typeof fallbackResult.response.data === "object" &&
        fallbackResult.response.data !== null &&
        !Array.isArray(fallbackResult.response.data)
      ) {
        detailRecord = fallbackResult.response.data as Record<string, unknown>;
        detailFetched = true;
      }
    }
  }

  // Step 3: Extract exact structural fields and redact PII
  return buildFoundReport({
    resource,
    targetNumero,
    actualApiId,
    record: detailRecord,
    detailFetched,
    searchStrategy,
    pagesChecked,
  });
}

function isRecordMatch(item: unknown, targetNumero: number): boolean {
  if (typeof item !== "object" || item === null) return false;
  const rec = item as Record<string, unknown>;

  const candidateFields = [
    rec.numero,
    rec.codigo,
    rec.num,
    rec.numero_pedido,
    rec.numero_venda,
    rec.id,
  ];

  for (const field of candidateFields) {
    if (field !== undefined && field !== null) {
      if (Number(field) === targetNumero) return true;
      if (String(field).trim() === String(targetNumero)) return true;
    }
  }
  return false;
}

function extractId(record: Record<string, unknown>): number | string | null {
  if (typeof record.id === "number" || typeof record.id === "string") {
    return record.id;
  }
  return null;
}

function buildEmptyReport(
  resource: "pedidos" | "vendas_simples" | "nfes",
  targetNumero: number,
  terminationReason: DocumentStructuralReport["terminationReason"],
  searchStrategy: string,
  pagesChecked: number,
): DocumentStructuralReport {
  return {
    resource,
    targetVisibleNumero: targetNumero,
    found: false,
    actualApiId: null,
    visibleNumeroFound: null,
    searchStrategy,
    terminationReason,
    pagesChecked,
    detailFetched: false,
    topLevelKeys: [],
    itemLevelKeys: [],
    structuralFields: {
      id: notFoundField(),
      numero: notFoundField(),
      ...(resource === "nfes" ? { serie: notFoundField() } : {}),
      status: notFoundField(),
      customerReference: notFoundField(),
      creationDate: notFoundField(),
      confirmationDate: notFoundField(),
      ...(resource === "nfes" ? { dataEmissao: notFoundField() } : {}),
      totalMerchandise: notFoundField(),
      headerDiscount: notFoundField(),
      finalTotal: notFoundField(),
      itemsArrayPath: notFoundField(),
      itemIdentity: notFoundField(),
      productReference: notFoundField(),
      quantity: notFoundField(),
      unitPrice: notFoundField(),
      itemDiscount: notFoundField(),
      itemSubtotal: notFoundField(),
      ...(resource === "vendas_simples" || resource === "nfes"
        ? { linkedPedidoReference: notFoundField() }
        : {}),
      ...(resource === "nfes"
        ? { linkedVendaSimplesReference: notFoundField() }
        : {}),
      linkedDocuments: notFoundField(),
    },
    sampleItemSnippet: null,
    rawSampleRedacted: null,
  };
}

function notFoundField<T>(): StructuralFieldEvidence<T> {
  return {
    classification: "OBSERVED",
    fieldPath: null,
    observedFieldName: null,
    valueSample: null,
    present: false,
  };
}

interface BuildFoundReportInput {
  resource: "pedidos" | "vendas_simples" | "nfes";
  targetNumero: number;
  actualApiId: number | string | null;
  record: Record<string, unknown>;
  detailFetched: boolean;
  searchStrategy: string;
  pagesChecked: number;
}

function buildFoundReport(input: BuildFoundReportInput): DocumentStructuralReport {
  const {
    resource,
    targetNumero,
    actualApiId,
    record,
    detailFetched,
    searchStrategy,
    pagesChecked,
  } = input;

  const topLevelKeys = Object.keys(record);

  // Structural field detectors
  const idEvidence = findField(record, ["id"]);
  const numeroEvidence = findField(record, ["numero", "codigo", "num"]);
  const serieEvidence = resource === "nfes" ? findField(record, ["serie"]) : undefined;
  const statusEvidence = findField(record, ["status", "situacao", "estado"]);
  const customerEvidence = findCustomerReference(record);

  // BUGFIX 1: Added data_criacao as first candidate
  const creationDateEvidence = findField(record, [
    "data_criacao",
    "data_cadastro",
    "data_emissao",
    "data",
    "created_at",
  ]);

  const confirmationDateEvidence = findField(record, [
    "data_confirmacao",
    "data_faturamento",
    "data_fechamento",
    "data_venda",
    "data_conclusao",
  ]);

  const dataEmissaoEvidence =
    resource === "nfes" ? findField(record, ["data_emissao"]) : undefined;

  const totalMerchandiseEvidence = findField(record, [
    "valor_produtos",
    "total_produtos",
    "subtotal",
  ]);
  const headerDiscountEvidence = findField(record, [
    "valor_desconto",
    "desconto",
    "desconto_valor",
  ]);
  const finalTotalEvidence = findField(record, [
    "valor_total",
    "total",
    "valor",
    "valor_liquido",
  ]);

  // Item array detection
  const itemsInfo = findItemsArray(record);
  const itemSample = itemsInfo.firstItem;
  const itemLevelKeys = itemSample ? Object.keys(itemSample) : [];

  const itemIdentityEvidence = itemSample
    ? findField(itemSample, ["id", "id_item", "item_id"], "itens[].")
    : notFoundField<string | number>();

  const productReferenceEvidence = itemSample
    ? findProductReference(itemSample, "itens[].")
    : notFoundField<unknown>();

  const quantityEvidence = itemSample
    ? findField(itemSample, ["qtd", "quantidade", "quant"], "itens[].")
    : notFoundField<number | string>();

  const unitPriceEvidence = itemSample
    ? findField(itemSample, ["valor_unitario", "preco_unitario", "valor", "preco"], "itens[].")
    : notFoundField<number | string>();

  const itemDiscountEvidence = itemSample
    ? findField(itemSample, ["valor_desconto", "desconto"], "itens[].")
    : notFoundField<number | string>();

  // BUGFIX 2: Added valor_subtotal as first candidate
  const itemSubtotalEvidence = itemSample
    ? findField(itemSample, ["valor_subtotal", "subtotal", "valor_total", "total"], "itens[].")
    : notFoundField<number | string>();

  // Links & Relations
  const linkedPedidoEvidence =
    resource === "vendas_simples" || resource === "nfes"
      ? findLinkedPedidoReference(record)
      : undefined;

  const linkedVendaSimplesEvidence =
    resource === "nfes"
      ? findLinkedVendaSimplesReference(record)
      : undefined;

  const linkedDocsEvidence = findLinkedDocuments(record);

  // Redacted raw record (strip sensitive PII values)
  const rawSampleRedacted = redactRecord(record);
  const sampleItemSnippet = itemSample ? redactRecord(itemSample) : null;

  return {
    resource,
    targetVisibleNumero: targetNumero,
    found: true,
    actualApiId,
    visibleNumeroFound: numeroEvidence.valueSample as number | string | null,
    searchStrategy,
    terminationReason: "FOUND",
    pagesChecked,
    detailFetched,
    topLevelKeys,
    itemLevelKeys,
    structuralFields: {
      id: idEvidence as StructuralFieldEvidence<number | string>,
      numero: numeroEvidence as StructuralFieldEvidence<number | string>,
      ...(serieEvidence ? { serie: serieEvidence as StructuralFieldEvidence<number | string> } : {}),
      status: statusEvidence as StructuralFieldEvidence<string | number>,
      customerReference: customerEvidence,
      creationDate: creationDateEvidence as StructuralFieldEvidence<string>,
      confirmationDate: confirmationDateEvidence as StructuralFieldEvidence<string>,
      ...(dataEmissaoEvidence ? { dataEmissao: dataEmissaoEvidence as StructuralFieldEvidence<string> } : {}),
      totalMerchandise: totalMerchandiseEvidence as StructuralFieldEvidence<number | string>,
      headerDiscount: headerDiscountEvidence as StructuralFieldEvidence<number | string>,
      finalTotal: finalTotalEvidence as StructuralFieldEvidence<number | string>,
      itemsArrayPath: itemsInfo.evidence,
      itemIdentity: itemIdentityEvidence as StructuralFieldEvidence<string | number>,
      productReference: productReferenceEvidence,
      quantity: quantityEvidence as StructuralFieldEvidence<number | string>,
      unitPrice: unitPriceEvidence as StructuralFieldEvidence<number | string>,
      itemDiscount: itemDiscountEvidence as StructuralFieldEvidence<number | string>,
      itemSubtotal: itemSubtotalEvidence as StructuralFieldEvidence<number | string>,
      ...(linkedPedidoEvidence ? { linkedPedidoReference: linkedPedidoEvidence } : {}),
      ...(linkedVendaSimplesEvidence ? { linkedVendaSimplesReference: linkedVendaSimplesEvidence } : {}),
      linkedDocuments: linkedDocsEvidence,
    },
    sampleItemSnippet,
    rawSampleRedacted,
  };
}

function findField(
  obj: Record<string, unknown>,
  candidates: string[],
  pathPrefix = "",
): StructuralFieldEvidence<unknown> {
  for (const key of candidates) {
    if (key in obj && obj[key] !== undefined && obj[key] !== null) {
      return {
        classification: "OBSERVED",
        fieldPath: `${pathPrefix}${key}`,
        observedFieldName: key,
        valueSample: sanitizeScalar(obj[key]),
        present: true,
      };
    }
  }
  return notFoundField();
}

function findCustomerReference(
  record: Record<string, unknown>,
): StructuralFieldEvidence<unknown> {
  const candidates = [
    "cliente",
    "destinatario",
    "id_cliente",
    "cliente_id",
    "contato",
    "id_contato",
  ];

  for (const key of candidates) {
    if (key in record && record[key] !== undefined && record[key] !== null) {
      const val = record[key];
      if (typeof val === "object") {
        const clientObj = val as Record<string, unknown>;
        return {
          classification: "OBSERVED",
          fieldPath: key,
          observedFieldName: key,
          valueSample: {
            id: clientObj.id ?? clientObj.id_cliente ?? null,
            tipo: typeof clientObj.tipo === "string" ? clientObj.tipo : undefined,
            keysPresent: Object.keys(clientObj),
          },
          present: true,
          notes: "Customer nested object observed; personal values redacted",
        };
      }
      return {
        classification: "OBSERVED",
        fieldPath: key,
        observedFieldName: key,
        valueSample: sanitizeScalar(val),
        present: true,
      };
    }
  }
  return notFoundField();
}

function findItemsArray(record: Record<string, unknown>): {
  evidence: StructuralFieldEvidence<string>;
  firstItem: Record<string, unknown> | null;
} {
  const candidateKeys = [
    "itens",
    "produtos",
    "itens_pedido",
    "itens_venda",
    "itens_orcamento",
  ];

  for (const key of candidateKeys) {
    if (key in record && Array.isArray(record[key])) {
      const arr = record[key] as unknown[];
      const first =
        arr.length > 0 && typeof arr[0] === "object" && arr[0] !== null
          ? (arr[0] as Record<string, unknown>)
          : null;
      return {
        evidence: {
          classification: "OBSERVED",
          fieldPath: key,
          observedFieldName: key,
          valueSample: `${key}[] (length: ${arr.length})`,
          present: true,
        },
        firstItem: first,
      };
    }
  }
  return {
    evidence: notFoundField<string>(),
    firstItem: null,
  };
}

function findProductReference(
  item: Record<string, unknown>,
  pathPrefix = "",
): StructuralFieldEvidence<unknown> {
  const candidates = [
    "produto_servico",
    "produto",
    "id_produto",
    "produto_id",
    "item_id",
    "codigo_produto",
  ];

  for (const key of candidates) {
    if (key in item && item[key] !== undefined && item[key] !== null) {
      const val = item[key];
      if (typeof val === "object") {
        const prodObj = val as Record<string, unknown>;
        return {
          classification: "OBSERVED",
          fieldPath: `${pathPrefix}${key}`,
          observedFieldName: key,
          valueSample: {
            id: prodObj.id ?? null,
            codigo: prodObj.codigo ?? null,
            keysPresent: Object.keys(prodObj),
          },
          present: true,
        };
      }
      return {
        classification: "OBSERVED",
        fieldPath: `${pathPrefix}${key}`,
        observedFieldName: key,
        valueSample: sanitizeScalar(val),
        present: true,
      };
    }
  }
  return notFoundField();
}

function findLinkedPedidoReference(
  record: Record<string, unknown>,
): StructuralFieldEvidence<unknown> {
  const candidates = [
    "pedido_os_vinculada",
    "pedido_id",
    "id_pedido",
    "pedido",
    "id_origem",
    "origem",
    "numero_pedido",
    "origem_pedido",
  ];

  for (const key of candidates) {
    if (key in record && record[key] !== undefined && record[key] !== null) {
      const val = record[key];
      if (typeof val === "object") {
        const obj = val as Record<string, unknown>;
        return {
          classification: "OBSERVED",
          fieldPath: key,
          observedFieldName: key,
          valueSample: {
            id: obj.id ?? null,
            numero: obj.numero ?? null,
            tipo: obj.tipo ?? null,
            keysPresent: Object.keys(obj),
          },
          present: true,
          notes: `Linked Pedido object observed at field '${key}'`,
        };
      }
      return {
        classification: "OBSERVED",
        fieldPath: key,
        observedFieldName: key,
        valueSample: sanitizeScalar(val),
        present: true,
        notes: `Direct scalar linked Pedido reference observed at field '${key}'`,
      };
    }
  }
  return notFoundField();
}

function findLinkedVendaSimplesReference(
  record: Record<string, unknown>,
): StructuralFieldEvidence<unknown> {
  const candidates = [
    "venda_simples",
    "venda_simples_id",
    "id_venda_simples",
    "venda_id",
    "id_venda",
    "origem_venda",
  ];

  for (const key of candidates) {
    if (key in record && record[key] !== undefined && record[key] !== null) {
      const val = record[key];
      if (typeof val === "object") {
        const obj = val as Record<string, unknown>;
        return {
          classification: "OBSERVED",
          fieldPath: key,
          observedFieldName: key,
          valueSample: {
            id: obj.id ?? null,
            numero: obj.numero ?? null,
            keysPresent: Object.keys(obj),
          },
          present: true,
          notes: `Linked Venda Simples object observed at field '${key}'`,
        };
      }
      return {
        classification: "OBSERVED",
        fieldPath: key,
        observedFieldName: key,
        valueSample: sanitizeScalar(val),
        present: true,
        notes: `Direct scalar linked Venda Simples reference observed at field '${key}'`,
      };
    }
  }
  return notFoundField();
}

function findLinkedDocuments(
  record: Record<string, unknown>,
): StructuralFieldEvidence<unknown> {
  const candidates = [
    "notas_referenciadas",
    "nfe",
    "id_nfe",
    "nfe_id",
    "nota_fiscal",
    "chave_nfe",
    "documento_fiscal",
    "fiscal",
  ];

  for (const key of candidates) {
    if (key in record && record[key] !== undefined && record[key] !== null) {
      const val = record[key];
      return {
        classification: "OBSERVED",
        fieldPath: key,
        observedFieldName: key,
        valueSample: typeof val === "object" ? Object.keys(val as object) : sanitizeScalar(val),
        present: true,
        notes: `Structural link observed at field '${key}'`,
      };
    }
  }
  return notFoundField();
}

const PII_KEYS = new Set([
  "nome",
  "razao_social",
  "nome_fantasia",
  "cpf",
  "cnpj",
  "email",
  "telefone",
  "celular",
  "logradouro",
  "endereco",
  "bairro",
  "cep",
  "complemento",
  "rg",
  "inscricao_estadual",
  "ie",
]);

function redactRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (PII_KEYS.has(key.toLowerCase())) {
      redacted[key] = "[REDACTED_PII]";
    } else if (typeof value === "object" && value !== null) {
      if (Array.isArray(value)) {
        redacted[key] = value.slice(0, 2).map((item) =>
          typeof item === "object" && item !== null
            ? redactRecord(item as Record<string, unknown>)
            : item,
        );
      } else {
        redacted[key] = redactRecord(value as Record<string, unknown>);
      }
    } else {
      redacted[key] = sanitizeScalar(value);
    }
  }

  return redacted;
}

function sanitizeScalar(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.length > 100) return `${value.slice(0, 100)}...[TRUNCATED]`;
    return value;
  }
  return "[NON_SCALAR]";
}
