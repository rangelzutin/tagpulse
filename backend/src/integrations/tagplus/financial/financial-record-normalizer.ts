import { Prisma, type FinancialRecordType } from "@prisma/client";

export interface RawTagPlusFinancialEntity {
  id?: number | string | null;
  razao_social?: string | null;
  nome_fantasia?: string | null;
  tipo_entidade?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
}

export interface RawTagPlusFinancialRecord {
  id: number | string;
  codigo_externo?: string | null;
  descricao?: string | null;
  numero_documento?: string | null;
  tipo?: string | null;
  confirmado?: boolean | null;
  transferencia?: boolean | null;
  numero_sigla_movimentacao_vinculada?: string | null;
  data_vencimento: string;
  data_alteracao?: string | null;
  data_lancamento?: string | null;
  data_confirmacao?: string | null;
  data_competencia?: string | null;
  valor_original?: number | string | null;
  valor_bruto?: number | string | null;
  valor_pago?: number | string | null;
  valor_total?: number | string | null;
  valor_desconto?: number | string | null;
  valor_acrescimo?: number | string | null;
  valor_juros_atraso?: number | string | null;
  aliquota_juros_ao_dia?: number | string | null;
  parcela?: number | string | null;
  total_parcelas?: number | string | null;
  forma_pagamento?: { id?: number | string | null } | null;
  plano_orcamentario?: { id?: number | string | null } | null;
  conta_bancaria?: { id?: number | string | null } | null;
  departamento?: { id?: number | string | null } | null;
  entidade?: RawTagPlusFinancialEntity | null;
  tipo_entidade?: string | null;
  fatura_parcela_vinculada?: { id?: number | string | null } | null;
  [key: string]: unknown;
}

export interface NormalizedFinancialRecord {
  sourceId: string;
  type: FinancialRecordType;
  isConfirmed: boolean;
  isTransfer: boolean;
  description: string | null;
  documentNumber: string | null;
  linkedMovementNumber: string | null;
  dueDate: Date;
  confirmationDate: Date | null;
  sourceCompetenceDate: Date | null;
  postingDate: Date | null;
  sourceUpdatedAt: Date | null;
  originalAmount: Prisma.Decimal;
  grossAmount: Prisma.Decimal | null;
  paidAmount: Prisma.Decimal | null;
  totalAmount: Prisma.Decimal | null;
  discountAmount: Prisma.Decimal | null;
  surchargeAmount: Prisma.Decimal | null;
  lateInterestAmount: Prisma.Decimal | null;
  dailyInterestRate: Prisma.Decimal | null;
  installmentNumber: number | null;
  installmentCount: number | null;
  budgetPlanSourceId: string | null;
  bankAccountSourceId: string | null;
  paymentMethodSourceId: string | null;
  departmentSourceId: string | null;
  entitySourceId: string | null;
  entityType: string | null;
  entityName: string | null;
  linkedInvoiceInstallmentSourceId: string | null;
  sourcePayload: Record<string, unknown>;
}

const SENSITIVE_KEY_PATTERNS = [
  /^token$/i,
  /^access_token$/i,
  /^refresh_token$/i,
  /^secret$/i,
  /^password$/i,
  /^senha$/i,
  /^picpay_token$/i,
  /^authorization$/i,
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
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})[T ]/.exec(trimmed);
    if (!isoMatch) return null;
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (year <= 1970 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    return new Date(Date.UTC(year, month - 1, day));
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year <= 1970 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

export function parseTagPlusSourceUpdatedAt(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("0000") || trimmed.startsWith("1970")) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/.exec(trimmed);
  if (!match) return null;
  const [, yStr, mStr, dStr, hStr, minStr, sStr] = match;
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  const hour = hStr ? Number(hStr) : 0;
  const minute = minStr ? Number(minStr) : 0;
  const second = sStr ? Number(sStr) : 0;

  if (year <= 1970 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() <= 1970) {
    return null;
  }
  return date;
}

function toDecimal(value: unknown): Prisma.Decimal | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    return new Prisma.Decimal(value as string | number);
  } catch {
    return null;
  }
}

function toRequiredDecimal(value: unknown, fallback = 0): Prisma.Decimal {
  const dec = toDecimal(value);
  if (dec !== null) return dec;
  return new Prisma.Decimal(fallback);
}

export function normalizeTagPlusFinancialRecord(
  raw: unknown,
): NormalizedFinancialRecord {
  if (!raw || typeof raw !== "object") {
    throw new Error("FINANCIAL_RECORD_INVALID_STRUCTURE");
  }
  const item = raw as RawTagPlusFinancialRecord;
  if (item.id === undefined || item.id === null) {
    throw new Error("FINANCIAL_RECORD_MISSING_ID");
  }

  const sourceId = String(item.id).trim();
  const rawType = String(item.tipo ?? "").trim().toUpperCase();
  const type: FinancialRecordType = rawType === "S" ? "SAIDA" : "ENTRADA";
  const isConfirmed = Boolean(item.confirmado);
  const isTransfer = Boolean(item.transferencia);

  const description = item.descricao ? String(item.descricao).trim() : null;
  const documentNumber = item.numero_documento ? String(item.numero_documento).trim() : null;
  const linkedMovementNumber = item.numero_sigla_movimentacao_vinculada
    ? String(item.numero_sigla_movimentacao_vinculada).trim()
    : null;

  const dueDate = parseTagPlusCivilDate(item.data_vencimento);
  if (!dueDate) {
    throw new Error(`FINANCIAL_RECORD_INVALID_DUE_DATE: ${item.data_vencimento}`);
  }

  const confirmationDate = parseTagPlusCivilDate(item.data_confirmacao);
  const sourceCompetenceDate = parseTagPlusCivilDate(item.data_competencia);
  const postingDate = parseTagPlusCivilDate(item.data_lancamento);
  const sourceUpdatedAt = parseTagPlusSourceUpdatedAt(item.data_alteracao);

  const originalAmount = toRequiredDecimal(item.valor_original ?? item.valor_total ?? 0);
  const grossAmount = toDecimal(item.valor_bruto);
  const paidAmount = toDecimal(item.valor_pago);
  const totalAmount = toDecimal(item.valor_total);
  const discountAmount = toDecimal(item.valor_desconto);
  const surchargeAmount = toDecimal(item.valor_acrescimo);
  const lateInterestAmount = toDecimal(item.valor_juros_atraso);
  const dailyInterestRate = toDecimal(item.aliquota_juros_ao_dia);

  const installmentNumber = item.parcela != null ? Number(item.parcela) : null;
  const installmentCount = item.total_parcelas != null ? Number(item.total_parcelas) : null;

  const budgetPlanSourceId = item.plano_orcamentario?.id != null ? String(item.plano_orcamentario.id).trim() : null;
  const bankAccountSourceId = item.conta_bancaria?.id != null ? String(item.conta_bancaria.id).trim() : null;
  const paymentMethodSourceId = item.forma_pagamento?.id != null ? String(item.forma_pagamento.id).trim() : null;
  const departmentSourceId = item.departamento?.id != null ? String(item.departamento.id).trim() : null;

  const entity = item.entidade;
  const entitySourceId = entity?.id != null ? String(entity.id).trim() : null;
  const entityType = entity?.tipo_entidade
    ? String(entity.tipo_entidade).trim()
    : (item.tipo_entidade ? String(item.tipo_entidade).trim() : null);
  const entityName = entity?.razao_social
    ? String(entity.razao_social).trim()
    : (entity?.nome_fantasia ? String(entity.nome_fantasia).trim() : null);

  const linkedInvoiceInstallmentSourceId = item.fatura_parcela_vinculada?.id != null
    ? String(item.fatura_parcela_vinculada.id).trim()
    : null;

  const sourcePayload = sanitizePayload(item);

  return {
    sourceId,
    type,
    isConfirmed,
    isTransfer,
    description,
    documentNumber,
    linkedMovementNumber,
    dueDate,
    confirmationDate,
    sourceCompetenceDate,
    postingDate,
    sourceUpdatedAt,
    originalAmount,
    grossAmount,
    paidAmount,
    totalAmount,
    discountAmount,
    surchargeAmount,
    lateInterestAmount,
    dailyInterestRate,
    installmentNumber,
    installmentCount,
    budgetPlanSourceId,
    bankAccountSourceId,
    paymentMethodSourceId,
    departmentSourceId,
    entitySourceId,
    entityType,
    entityName,
    linkedInvoiceInstallmentSourceId,
    sourcePayload,
  };
}
