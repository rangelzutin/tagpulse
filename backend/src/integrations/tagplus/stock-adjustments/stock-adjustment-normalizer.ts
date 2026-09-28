import { Prisma } from "@prisma/client";

const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /key/i,
  /password/i,
  /senha/i,
  /picpay_token/i,
  /authorization/i,
];

export function sanitizePayload<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePayload(item)) as unknown as T;
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
      if (isSensitive) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = sanitizePayload(val);
      }
    }
    return result as T;
  }
  return value;
}

export function parseTagPlusCivilDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    const dateTimeMatch = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/.exec(trimmed);
    if (!dateTimeMatch) return null;
    const year = Number(dateTimeMatch[1]);
    const month = Number(dateTimeMatch[2]);
    const day = Number(dateTimeMatch[3]);
    const hours = Number(dateTimeMatch[4]);
    const minutes = Number(dateTimeMatch[5]);
    const seconds = Number(dateTimeMatch[6]);
    if (year <= 1970 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year <= 1970 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

export function parseDecimal(value: unknown, defaultValue = 0): Prisma.Decimal {
  if (value === null || value === undefined || value === "") {
    return new Prisma.Decimal(defaultValue);
  }
  if (value instanceof Prisma.Decimal) {
    return value;
  }
  if (typeof value === "number") {
    if (Number.isNaN(value) || !Number.isFinite(value)) {
      return new Prisma.Decimal(defaultValue);
    }
    return new Prisma.Decimal(value);
  }
  if (typeof value === "string") {
    let cleaned = value.trim();
    if (cleaned.includes(".") && cleaned.includes(",")) {
      cleaned = cleaned.replace(/\./g, "").replace(/,/g, ".");
    } else if (cleaned.includes(",")) {
      cleaned = cleaned.replace(/,/g, ".");
    }
    try {
      return new Prisma.Decimal(cleaned);
    } catch {
      return new Prisma.Decimal(defaultValue);
    }
  }
  return new Prisma.Decimal(defaultValue);
}

export interface NormalizedStockAdjustmentItem {
  sourceItemId: string;
  itemNumber: number;
  productSourceId: string | null;
  productCode: string | null;
  productDescription: string | null;
  quantity: Prisma.Decimal;
  outputUnit: string | null;
  unitAmount: Prisma.Decimal;
  surchargeAmount: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  subtotalAmount: Prisma.Decimal;
  cfop: string | null;
  details: string | null;
  unitType: string | null;
  remainingUnit: string | null;
  categorySourceId: string | null;
  categoryDescription: string | null;
}

export interface NormalizedStockAdjustmentFinancialLink {
  financialRecordSourceId: string;
  invoiceNumber: string | null;
  installmentNumber: number | null;
}

export interface NormalizedStockAdjustment {
  sourceId: string;
  number: string | null;
  externalCode: string | null;
  type: string;
  status: string | null;
  entitySourceId: string | null;
  entityName: string | null;
  entityCpf: string | null;
  entityCnpj: string | null;
  sourceCreatedAt: Date;
  sourceUpdatedAt: Date | null;
  confirmationDate: Date | null;
  notes: string | null;
  employeeSourceId: string | null;
  employeeName: string | null;
  freightAmount: Prisma.Decimal;
  otherAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  hasInvoice: boolean;
  sourcePayload: unknown;
  items: NormalizedStockAdjustmentItem[];
  financialLinks: NormalizedStockAdjustmentFinancialLink[];
}

export function normalizeTagPlusStockAdjustment(raw: Record<string, unknown>): NormalizedStockAdjustment {
  if (!raw || typeof raw !== "object" || raw.id === undefined || raw.id === null) {
    throw new Error("Invalid TagPlus StockAdjustment payload: missing id");
  }

  const sourceId = String(raw.id);
  const number = raw.numero != null ? String(raw.numero) : null;
  const externalCode = raw.codigo_externo != null ? String(raw.codigo_externo) : null;
  const type = String(raw.tipo || "").trim().toUpperCase();
  const status = raw.status != null ? String(raw.status).trim().toUpperCase() : null;

  const entity = raw.entidade as Record<string, unknown> | null | undefined;
  const entitySourceId = entity?.id != null ? String(entity.id) : null;
  const entityName = typeof entity?.razao_social === "string" ? entity.razao_social : null;
  const entityCpf = typeof entity?.cpf === "string" ? entity.cpf : null;
  const entityCnpj = typeof entity?.cnpj === "string" ? entity.cnpj : null;

  const sourceCreatedAt = parseTagPlusCivilDate(raw.data_criacao) || new Date();
  const sourceUpdatedAt = parseTagPlusCivilDate(raw.data_alteracao);
  const confirmationDate = parseTagPlusCivilDate(raw.data_confirmacao);

  const notes = raw.observacoes != null ? String(raw.observacoes).trim() || null : null;

  const employee = raw.funcionario as Record<string, unknown> | null | undefined;
  const employeeSourceId = employee?.id != null ? String(employee.id) : null;
  const employeeName = typeof employee?.nome === "string" ? employee.nome : null;

  const freightAmount = parseDecimal(raw.valor_frete, 0);
  const otherAmount = parseDecimal(raw.valor_outros, 0);
  const totalAmount = parseDecimal(raw.valor_total, 0);
  const hasInvoice = Boolean(raw.tem_fatura);

  // Normalize items
  const items: NormalizedStockAdjustmentItem[] = [];
  if (Array.isArray(raw.itens)) {
    for (const it of raw.itens) {
      if (!it || it.id == null) continue;
      const sourceItemId = String(it.id);
      const itemNumber = Number(it.item) || items.length + 1;

      const prodServ = it.produto_servico;
      const prod = it.produto;
      const productSourceId = prodServ?.id != null
        ? String(prodServ.id)
        : (prod?.id != null ? String(prod.id) : null);
      const productCode = prodServ?.codigo || prod?.codigo || null;
      const productDescription = prodServ?.descricao || prod?.descricao || null;

      const quantity = parseDecimal(it.qtd, 0);
      const outputUnit = it.unidade_saida || null;
      const unitAmount = parseDecimal(it.valor_unitario, 0);
      const surchargeAmount = parseDecimal(it.valor_acrescimo, 0);
      const discountAmount = parseDecimal(it.valor_desconto, 0);
      const subtotalAmount = parseDecimal(it.valor_subtotal, 0);

      const cfop = it.cfop || null;
      const details = it.detalhes || null;
      const unitType = it.tipo_unidade || null;
      const remainingUnit = it.unidade_restante || null;

      const categorySourceId = prod?.categoria?.id != null ? String(prod.categoria.id) : null;
      const categoryDescription = prod?.categoria?.descricao || null;

      items.push({
        sourceItemId,
        itemNumber,
        productSourceId,
        productCode,
        productDescription,
        quantity,
        outputUnit,
        unitAmount,
        surchargeAmount,
        discountAmount,
        subtotalAmount,
        cfop,
        details,
        unitType,
        remainingUnit,
        categorySourceId,
        categoryDescription,
      });
    }
  }

  // Normalize financial links
  const financialLinksMap = new Map<string, NormalizedStockAdjustmentFinancialLink>();
  if (Array.isArray(raw.faturas)) {
    for (const fatura of raw.faturas) {
      if (!fatura || !Array.isArray(fatura.parcelas)) continue;
      for (const parcela of fatura.parcelas) {
        if (!parcela) continue;
        const lancamento = parcela.lancamento_financeiro_vinculado;
        if (lancamento && lancamento.id != null) {
          const financialRecordSourceId = String(lancamento.id);
          const invoiceNumber = parcela.documento != null ? String(parcela.documento) : null;
          const installmentNumber = parcela.parcela != null ? Number(parcela.parcela) : null;

          financialLinksMap.set(financialRecordSourceId, {
            financialRecordSourceId,
            invoiceNumber,
            installmentNumber,
          });
        }
      }
    }
  }
  const financialLinks = Array.from(financialLinksMap.values());

  const sourcePayload = sanitizePayload(raw);

  return {
    sourceId,
    number,
    externalCode,
    type,
    status,
    entitySourceId,
    entityName,
    entityCpf,
    entityCnpj,
    sourceCreatedAt,
    sourceUpdatedAt,
    confirmationDate,
    notes,
    employeeSourceId,
    employeeName,
    freightAmount,
    otherAmount,
    totalAmount,
    hasInvoice,
    sourcePayload,
    items,
    financialLinks,
  };
}
