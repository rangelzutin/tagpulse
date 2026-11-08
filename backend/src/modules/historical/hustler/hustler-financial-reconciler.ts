import { PrismaClient, SourceSystem, FinancialRecordType, OperationUnit } from "@prisma/client";

export const DEV_PROJECT_REF = "pkjdzlfxsxulfkzksrow";
export const PRODUCTION_PROJECT_REF = "szahricoqxzckjytpnmg";

export function assertSafeDatabaseUrl(url: string, directUrl?: string) {
  if (url.includes(PRODUCTION_PROJECT_REF) || (directUrl && directUrl.includes(PRODUCTION_PROJECT_REF))) {
    throw new Error(
      `FATAL: Production database detected in DATABASE_URL/DIRECT_URL (${PRODUCTION_PROJECT_REF}). Aborting!`,
    );
  }
  if (!url.includes(DEV_PROJECT_REF)) {
    throw new Error(
      `FATAL: DATABASE_URL does not point to tagpulse-historical-dev (${DEV_PROJECT_REF}). Aborting!`,
    );
  }
}

export type HustlerFinancialImportClass =
  | "SALE_RECEIVABLE"
  | "SALE_RECEIPT"
  | "OPERATING_EXPENSE"
  | "SUPPLIER_PURCHASE"
  | "FINANCIAL_INCOME"
  | "TRANSFER_NEUTRAL"
  | "QUARANTINE"
  | "UNRESOLVED";

export interface HustlerFinancialRow {
  id: string;
  sourceTable: "financeiro_lancamento" | "pagamento";
  direction: "E" | "S";
  amount: number;
  dueDate: Date | null;
  confirmationDate: Date | null;
  isConfirmed: boolean;
  description: string;
  paymentMethod: string | null;
  idNotaFiscalPagamento: string | null;
  idNotaFiscal: string | null;
  importClass: HustlerFinancialImportClass;
}

export interface OperatingExpenseCategorySummary {
  category: string;
  count: number;
  total: number;
}

export interface SalesFinancialReconciliationSummary {
  importedSalesCount: number;
  commercialRevenue: number;
  exactMatchCount: number;
  exactMatchRevenue: number;
  toleranceMatchCount: number;
  toleranceMatchRevenue: number;
  mismatchCount: number;
  mismatchSaleRevenue: number;
  mismatchPaymentRevenue: number;
  noPaymentCount: number;
  noPaymentRevenue: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Classifies a raw legacy financial launch into a domain class:
 * - SALE_RECEIPT: Entradas linked to sales payments
 * - OPERATING_EXPENSE: Saídas without invoice (rent, power, payroll, taxes)
 * - SUPPLIER_PURCHASE: Saídas with supplier invoice / stock adjustments
 * - FINANCIAL_INCOME: Avulso entradas without invoice
 */
export function classifyHustlerFinancialRecord(
  tipo: "E" | "S",
  idNotaFiscalPagamento: string | null,
  description: string,
  isQuarantinedSale: boolean = false,
): HustlerFinancialImportClass {
  if (isQuarantinedSale) {
    return "QUARANTINE";
  }

  if (tipo === "E") {
    if (idNotaFiscalPagamento && idNotaFiscalPagamento.trim() !== "") {
      return "SALE_RECEIPT";
    }
    return "FINANCIAL_INCOME";
  }

  // tipo === "S"
  if (idNotaFiscalPagamento && idNotaFiscalPagamento.trim() !== "") {
    return "SUPPLIER_PURCHASE";
  }

  return "OPERATING_EXPENSE";
}

/**
 * Categorizes operating expense descriptions into business groupings.
 */
export function categorizeExpenseDescription(desc: string): string {
  const d = (desc || "").toUpperCase();

  if (d.includes("ALUGUEL") || d.includes("LOCACAO")) {
    return "ALUGUEL";
  }
  if (
    d.includes("ENERGIA") ||
    d.includes("LUZ") ||
    d.includes("ELEKTRO") ||
    d.includes("AGUA") ||
    d.includes("SANESUL") ||
    d.includes("SAEMA")
  ) {
    return "ENERGIA_AGUA_LUZ";
  }
  if (
    d.includes("TELEFONE") ||
    d.includes("INTERNET") ||
    d.includes("VIVO") ||
    d.includes("CLARO") ||
    d.includes("TIM")
  ) {
    return "TELEFONIA_INTERNET";
  }
  if (
    d.includes("SALARIO") ||
    d.includes("FOLHA") ||
    d.includes("PRO LABORE") ||
    d.includes("PRO-LABORE") ||
    d.includes("VALE") ||
    d.includes("COMISSAO") ||
    d.includes("FERIAS") ||
    d.includes("13")
  ) {
    return "FOLHA_PRO_LABORE_PESSOAL";
  }
  if (
    d.includes("SIMPLES") ||
    d.includes("DARF") ||
    d.includes("GPS") ||
    d.includes("FGTS") ||
    d.includes("IMPOSTO") ||
    d.includes("TAXA") ||
    d.includes("TRIBUT")
  ) {
    return "IMPOSTOS_TAXAS";
  }
  if (
    d.includes("FRETE") ||
    d.includes("CORREIO") ||
    d.includes("SEDEX") ||
    d.includes("MOTOBOY") ||
    d.includes("TRANSPORT")
  ) {
    return "FRETE_CORREIOS";
  }
  if (
    d.includes("REFORMA") ||
    d.includes("MANUTENCAO") ||
    d.includes("CONSERTO") ||
    d.includes("PINTURA") ||
    d.includes("MATERIAL")
  ) {
    return "MANUTENCAO_REFORMA";
  }
  if (
    d.includes("MARKETING") ||
    d.includes("PROPAGANDA") ||
    d.includes("INSTAGRAM") ||
    d.includes("FACEBOOK") ||
    d.includes("ANUNCIO") ||
    d.includes("ADESIVO")
  ) {
    return "MARKETING_PROPAGANDA";
  }
  if (
    d.includes("TARIFA") ||
    d.includes("BANCO") ||
    d.includes("MAQUININHA") ||
    d.includes("CIELO") ||
    d.includes("REDE") ||
    d.includes("PAGSEGURO") ||
    d.includes("JUROS")
  ) {
    return "TAXAS_BANCARIAS_CARTAO";
  }
  if (
    d.includes("FORNECEDOR") ||
    d.includes("COMPRA") ||
    d.includes("MERCADORIA") ||
    d.includes("SKATE") ||
    d.includes("SHAPE") ||
    d.includes("TENIS")
  ) {
    return "COMPRAS_MERCADORIAS_DIRETAS";
  }

  return "OUTROS_OPERACIONAIS";
}
