import { SaleAnchorType } from "@prisma/client";

export class SalesNormalizationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = "SalesNormalizationError";
  }
}

export interface NormalizedSaleItem {
  sourceItemId: string;
  lineNumber: number | null;
  sourceProductId: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string | null;
  subtotal: string;
}

export interface NormalizedSale {
  anchorType: SaleAnchorType;
  sourceId: string;
  parentPedidoSourceId: string | null;
  netAmount: string;
  customerSourceId: string | null;
  sourceCreatedAt: Date | null;
  sourceConfirmedAt: Date | null;
  sourceEmissaoAt: Date | null;
  items: NormalizedSaleItem[];
}

export function parseTagPlusDate(value: unknown): Date | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // TagPlus local datetime "YYYY-MM-DD HH:mm:ss"
  const localMatch = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(trimmed);
  if (localMatch) {
    const [, y, m, d, h, min, s] = localMatch;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(h), Number(min), Number(s)));
  }

  // Date only "YYYY-MM-DD"
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnlyMatch) {
    const [, y, m, d] = dateOnlyMatch;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 0, 0, 0));
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeItems(rawItems: unknown): NormalizedSaleItem[] {
  if (!Array.isArray(rawItems)) return [];

  const items: NormalizedSaleItem[] = [];
  for (let i = 0; i < rawItems.length; i++) {
    const raw = rawItems[i];
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;

    const itemId = item.id;
    if (itemId === undefined || itemId === null) {
      throw new SalesNormalizationError(`Item at index ${i} is missing 'id'`, `itens[${i}].id`);
    }

    const prodObj = item.produto_servico;
    let prodId: unknown = null;
    if (prodObj && typeof prodObj === "object") {
      prodId = (prodObj as Record<string, unknown>).id;
    }

    if (prodId === undefined || prodId === null) {
      throw new SalesNormalizationError(
        `Item at index ${i} is missing 'produto_servico.id'`,
        `itens[${i}].produto_servico.id`,
      );
    }

    const quantityRaw = item.qtd;
    if (quantityRaw === undefined || quantityRaw === null) {
      throw new SalesNormalizationError(
        `Item at index ${i} is missing 'qtd'`,
        `itens[${i}].qtd`,
      );
    }

    const unitPriceRaw = item.valor_unitario;
    if (unitPriceRaw === undefined || unitPriceRaw === null) {
      throw new SalesNormalizationError(
        `Item at index ${i} is missing 'valor_unitario'`,
        `itens[${i}].valor_unitario`,
      );
    }

    const discountRaw = item.valor_desconto ?? null;

    const subtotalRaw = item.valor_subtotal;
    if (subtotalRaw === undefined || subtotalRaw === null) {
      throw new SalesNormalizationError(
        `Item at index ${i} is missing 'valor_subtotal'`,
        `itens[${i}].valor_subtotal`,
      );
    }

    const lineNumberRaw = i + 1;

    items.push({
      sourceItemId: String(itemId),
      lineNumber: lineNumberRaw,
      sourceProductId: String(prodId),
      quantity: String(quantityRaw),
      unitPrice: String(unitPriceRaw),
      discountAmount: discountRaw != null ? String(discountRaw) : null,
      subtotal: String(subtotalRaw),
    });
  }

  return items;
}

function extractCustomerId(record: Record<string, unknown>): string | null {
  const clientVal = record.cliente;
  if (clientVal && typeof clientVal === "object") {
    const clientObj = clientVal as Record<string, unknown>;
    if (clientObj.id !== undefined && clientObj.id !== null) {
      return String(clientObj.id);
    }
  }
  return null;
}

function extractParentPedidoId(record: Record<string, unknown>): string | null {
  const linked = record.pedido_os_vinculada;
  if (linked && typeof linked === "object") {
    const linkedObj = linked as Record<string, unknown>;
    if (linkedObj.id !== undefined && linkedObj.id !== null) {
      return String(linkedObj.id);
    }
  }
  return null;
}

export function normalizeTagPlusPedido(raw: unknown): NormalizedSale {
  if (!raw || typeof raw !== "object") {
    throw new SalesNormalizationError("Invalid Pedido payload: expected object");
  }
  const record = raw as Record<string, unknown>;

  if (record.id === undefined || record.id === null) {
    throw new SalesNormalizationError("Pedido is missing 'id'", "id");
  }

  if (record.valor_total === undefined || record.valor_total === null) {
    throw new SalesNormalizationError("Pedido is missing 'valor_total'", "valor_total");
  }

  return {
    anchorType: SaleAnchorType.PEDIDO,
    sourceId: String(record.id),
    parentPedidoSourceId: null,
    netAmount: String(record.valor_total),
    customerSourceId: extractCustomerId(record),
    sourceCreatedAt: parseTagPlusDate(record.data_criacao),
    sourceConfirmedAt: parseTagPlusDate(record.data_confirmacao),
    sourceEmissaoAt: null,
    items: normalizeItems(record.itens),
  };
}

export function normalizeTagPlusVendaSimples(raw: unknown): NormalizedSale {
  if (!raw || typeof raw !== "object") {
    throw new SalesNormalizationError("Invalid Venda Simples payload: expected object");
  }
  const record = raw as Record<string, unknown>;

  if (record.id === undefined || record.id === null) {
    throw new SalesNormalizationError("Venda Simples is missing 'id'", "id");
  }

  if (record.valor_total === undefined || record.valor_total === null) {
    throw new SalesNormalizationError("Venda Simples is missing 'valor_total'", "valor_total");
  }

  return {
    anchorType: SaleAnchorType.VENDA_SIMPLES,
    sourceId: String(record.id),
    parentPedidoSourceId: extractParentPedidoId(record),
    netAmount: String(record.valor_total),
    customerSourceId: extractCustomerId(record),
    sourceCreatedAt: parseTagPlusDate(record.data_criacao),
    sourceConfirmedAt: parseTagPlusDate(record.data_confirmacao),
    sourceEmissaoAt: null,
    items: normalizeItems(record.itens),
  };
}

export function isConfirmedInboundTagPlusNfe(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (record.tipo === "E" && record.id !== undefined && record.id !== null) {
    return String(record.id);
  }
  return null;
}

export function normalizeTagPlusNfe(raw: unknown): NormalizedSale | null {
  if (!raw || typeof raw !== "object") {
    throw new SalesNormalizationError("Invalid NFe payload: expected object");
  }
  const record = raw as Record<string, unknown>;

  // Commercial sales filter: only outbound invoices (tipo === "S") belong to the sales domain
  if (record.tipo !== "S") {
    return null;
  }

  if (record.id === undefined || record.id === null) {
    throw new SalesNormalizationError("NFe is missing 'id'", "id");
  }

  if (record.valor_nota === undefined || record.valor_nota === null) {
    throw new SalesNormalizationError("NFe is missing 'valor_nota'", "valor_nota");
  }

  return {
    anchorType: SaleAnchorType.NFE,
    sourceId: String(record.id),
    parentPedidoSourceId: extractParentPedidoId(record),
    netAmount: String(record.valor_nota),
    customerSourceId: extractCustomerId(record),
    sourceCreatedAt: parseTagPlusDate(record.data_criacao),
    sourceConfirmedAt: parseTagPlusDate(record.data_confirmacao),
    sourceEmissaoAt: parseTagPlusDate(record.data_emissao),
    items: normalizeItems(record.itens),
  };
}
