import {
  PrismaClient,
  SourceSystem,
  FinancialRecordType,
  OperationUnit,
  HistoricalImportBatchStatus,
} from "@prisma/client";

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

export type HustlerFinancialClass =
  | "SALE_RECEIVABLE"
  | "OPERATING_EXPENSE"
  | "INVENTORY_PURCHASE_AP"
  | "OTHER_FINANCIAL_INCOME"
  | "OTHER_FINANCIAL_EXPENSE"
  | "QUARANTINE"
  | "CANCELLED_SALE_FINANCIAL"
  | "UNRESOLVED";

export interface PlannedFinancialRecord {
  legacyFinancialId: string;
  sourceId: string; // HUSTLER_LEGACY:FIN:<id>
  sourceType: "financeiro_lancamento";
  direction: "E" | "S";
  canonicalFinancialType: FinancialRecordType;
  amountOriginal: number;
  amountPaid: number;
  dueDate: Date;
  confirmedDate: Date | null;
  competenceDate: Date;
  isConfirmed: boolean;
  budgetPlanSourceId: string | null;
  accountCategory: string | null;
  canonicalSaleId: string | null;
  customerId: string | null;
  paymentMethod: string | null;
  installmentNumber: number | null;
  installmentCount: number | null;
  evidenceLevel: "LEVEL_A" | "LEVEL_B" | "LEVEL_C" | "LEVEL_D";
  classification: HustlerFinancialClass;
  affectsCash: boolean;
  affectsManagerialDre: boolean;
  affectsCommercialRevenue: false; // Invariant: always false
  affectsCmv: false; // Invariant: always false
  importable: boolean;
  skipReason: string | null;
  warnings: string[];
}

export interface HustlerFinancialClassSummary {
  count: number;
  total: number;
  paid: number;
}

export interface HustlerFinancialPlanSummary {
  batchId: string;
  totalSourceRows: number;
  entryCount: number;
  entryAmount: number;
  exitCount: number;
  exitAmount: number;
  confirmedEntryCount: number;
  confirmedEntryAmount: number;
  openEntryCount: number;
  openEntryAmount: number;
  confirmedExitCount: number;
  confirmedExitAmount: number;
  openExitCount: number;
  openExitAmount: number;
  classes: Record<HustlerFinancialClass, HustlerFinancialClassSummary>;
  linkedToCanonicalSalesCount: number;
  linkedCanonicalAmount: number;
  quarantineSalesFinancialRows: number;
  quarantineSalesFinancialAmount: number;
  cancelledSalesFinancialRows: number;
  cancelledSalesFinancialAmount: number;
  plannedFinancialRecordsCount: number;
  plannedFinancialRecordsAmount: number;
  quarantinedCount: number;
  unresolvedCount: number;
  skippedOtherIncomeCount: number;
  skippedOtherIncomeAmount: number;
  totalSkippedCount: number;
  totalSkippedAmount: number;
  totalAccountedRows: number;
  totalAccountedAmount: number;
  reconciliationPassed: boolean;
}

export interface HustlerFinancialImportPlan {
  summary: HustlerFinancialPlanSummary;
  plannedRecords: PlannedFinancialRecord[];
  samples: {
    saleReceivableSample: PlannedFinancialRecord | null;
    operatingExpenseSample: PlannedFinancialRecord | null;
    inventoryPurchaseSample: PlannedFinancialRecord | null;
    openReceivableSample: PlannedFinancialRecord | null;
    quarantineSample: PlannedFinancialRecord | null;
  };
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function formatFinancialSourceId(legacyFinancialId: string): string {
  return `HUSTLER_LEGACY:FIN:${legacyFinancialId}`;
}

export function parseLegacyFinancialDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (!s || s === "0000-00-00 00:00:00" || s === "0000-00-00" || s === "1970-01-01 00:00:00") {
    return null;
  }
  if (s.includes(" ")) {
    const [datePart, timePart] = s.split(" ");
    const d = new Date(`${datePart}T${timePart}Z`);
    return isNaN(d.getTime()) ? null : d;
  }
  if (s.includes("T")) {
    const d = new Date(s.endsWith("Z") ? s : `${s}Z`);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(`${s}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Categorizes expense descriptions into structured business accounts.
 */
export function mapExpenseCategory(desc: string): { budgetPlanSourceId: string; category: string } {
  const d = (desc || "").toUpperCase();

  if (d.includes("ALUGUEL") || d.includes("LOCACAO")) {
    return { budgetPlanSourceId: "40", category: "ALUGUEL" }; // 40 - Infraestrutura
  }
  if (
    d.includes("ENERGIA") ||
    d.includes("LUZ") ||
    d.includes("ELEKTRO") ||
    d.includes("AGUA") ||
    d.includes("SANESUL") ||
    d.includes("SAEMA")
  ) {
    return { budgetPlanSourceId: "8", category: "ENERGIA_AGUA_LUZ" }; // 8 - Conta de Consumo
  }
  if (
    d.includes("TELEFONE") ||
    d.includes("INTERNET") ||
    d.includes("VIVO") ||
    d.includes("CLARO") ||
    d.includes("TIM")
  ) {
    return { budgetPlanSourceId: "8", category: "TELEFONIA_INTERNET" }; // 8 - Conta de Consumo
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
    if (d.includes("PRO LABORE") || d.includes("PRO-LABORE")) {
      return { budgetPlanSourceId: "39", category: "PRO_LABORE" }; // 39 - Retirada Mensal
    }
    return { budgetPlanSourceId: "2", category: "FOLHA_SALARIOS" }; // 2 - Debito / Pessoal
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
    return { budgetPlanSourceId: "27", category: "IMPOSTOS_TRIBUTOS" }; // 27 - Imposto
  }
  if (
    d.includes("FRETE") ||
    d.includes("CORREIO") ||
    d.includes("SEDEX") ||
    d.includes("MOTOBOY") ||
    d.includes("TRANSPORT")
  ) {
    return { budgetPlanSourceId: "28", category: "LOGISTICA_FRETES" }; // 28 - Logística
  }
  if (
    d.includes("REFORMA") ||
    d.includes("MANUTENCAO") ||
    d.includes("CONSERTO") ||
    d.includes("PINTURA") ||
    d.includes("MATERIAL")
  ) {
    return { budgetPlanSourceId: "40", category: "MANUTENCAO_REFORMA" }; // 40 - Infraestrutura
  }
  if (
    d.includes("MARKETING") ||
    d.includes("PROPAGANDA") ||
    d.includes("INSTAGRAM") ||
    d.includes("FACEBOOK") ||
    d.includes("ANUNCIO") ||
    d.includes("ADESIVO")
  ) {
    return { budgetPlanSourceId: "23", category: "MARKETING_PROPAGANDA" }; // 23 - Marketing
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
    return { budgetPlanSourceId: "2", category: "TARIFAS_BANCARIAS" }; // 2 - Debito
  }

  return { budgetPlanSourceId: "2", category: "OUTRAS_DESPESAS_OPERACIONAIS" };
}

/**
 * Classifies a raw legacy financial launch into a domain class.
 */
export function classifyFinancialLaunch(params: {
  tipo: "E" | "S";
  description: string;
  hasPagamentoLink: boolean;
  isQuarantineSale: boolean;
  isCancelledSale: boolean;
  canonicalSaleId: string | null;
}): HustlerFinancialClass {
  const { tipo, description, hasPagamentoLink, isQuarantineSale, isCancelledSale, canonicalSaleId } = params;

  if (isQuarantineSale) {
    return "QUARANTINE";
  }

  if (isCancelledSale) {
    return "CANCELLED_SALE_FINANCIAL";
  }

  if (tipo === "E") {
    if (canonicalSaleId || (hasPagamentoLink && (description.toUpperCase().includes("VENDA") || description.toUpperCase().includes("NOTA FISCAL")))) {
      return "SALE_RECEIVABLE";
    }
    if (!hasPagamentoLink) {
      return "OTHER_FINANCIAL_INCOME";
    }
    return "UNRESOLVED";
  }

  // tipo === "S"
  if (hasPagamentoLink) {
    return "INVENTORY_PURCHASE_AP";
  }

  return "OPERATING_EXPENSE";
}

/**
 * Builds the complete financial import plan for Hustler legacy dump.
 */
export async function planHustlerFinancialImport(
  prisma: PrismaClient,
  batchId: string,
): Promise<HustlerFinancialImportPlan> {
  // 1. Verify batch
  const batch = await prisma.historicalImportBatch.findUnique({
    where: { id: batchId },
  });
  if (!batch) {
    throw new Error(`Batch '${batchId}' not found.`);
  }

  // 2. Load canonical sales for HUSTLER_LEGACY_DUMP
  const canonicalSales = await prisma.sale.findMany({
    where: { sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP },
    select: {
      id: true,
      customerId: true,
      anchorType: true,
      anchorSourceId: true,
    },
  });

  const saleIdByAnchor = new Map<string, { saleId: string; customerId: string | null }>();
  for (const s of canonicalSales) {
    // anchorSourceId is formatted as HUSTLER_LEGACY:<legacyId>
    saleIdByAnchor.set(`${s.anchorType}:${s.anchorSourceId}`, {
      saleId: s.id,
      customerId: s.customerId,
    });
  }

  // 3. Load staging data: venda, nota_fiscal, pagamento, financeiro_lancamento
  const [flRows, pRows, nfRows, vRows] = await Promise.all([
    prisma.historicalStagingRow.findMany({
      where: { importBatchId: batchId, sourceTable: "financeiro_lancamento" },
      select: { sourcePrimaryKey: true, payload: true },
    }),
    prisma.historicalStagingRow.findMany({
      where: { importBatchId: batchId, sourceTable: "pagamento" },
      select: { sourcePrimaryKey: true, payload: true },
    }),
    prisma.historicalStagingRow.findMany({
      where: { importBatchId: batchId, sourceTable: "nota_fiscal" },
      select: { sourcePrimaryKey: true, payload: true },
    }),
    prisma.historicalStagingRow.findMany({
      where: { importBatchId: batchId, sourceTable: "venda" },
      select: { sourcePrimaryKey: true, payload: true },
    }),
  ]);

  // Index pagamento by PK
  const pagMap = new Map<string, any>();
  for (const r of pRows) {
    pagMap.set(r.sourcePrimaryKey, r.payload);
  }

  // Index venda by id_nota_fiscal
  const vendaByNfId = new Map<string, any>();
  for (const r of vRows) {
    const payload = r.payload as any;
    if (payload.id_nota_fiscal) {
      vendaByNfId.set(String(payload.id_nota_fiscal), payload);
    }
  }

  // The 11 quarantined sales from Phase 4F/4H
  const quarantineVendaIds = new Set([
    "2655", "2822", "2916", "2990", "3052", "3083", "3132", "3280", "3413", "3623", "3626"
  ]);

  // Summary structure
  const summary: HustlerFinancialPlanSummary = {
    batchId,
    totalSourceRows: flRows.length,
    entryCount: 0,
    entryAmount: 0,
    exitCount: 0,
    exitAmount: 0,
    confirmedEntryCount: 0,
    confirmedEntryAmount: 0,
    openEntryCount: 0,
    openEntryAmount: 0,
    confirmedExitCount: 0,
    confirmedExitAmount: 0,
    openExitCount: 0,
    openExitAmount: 0,
    classes: {
      SALE_RECEIVABLE: { count: 0, total: 0, paid: 0 },
      OPERATING_EXPENSE: { count: 0, total: 0, paid: 0 },
      INVENTORY_PURCHASE_AP: { count: 0, total: 0, paid: 0 },
      OTHER_FINANCIAL_INCOME: { count: 0, total: 0, paid: 0 },
      OTHER_FINANCIAL_EXPENSE: { count: 0, total: 0, paid: 0 },
      QUARANTINE: { count: 0, total: 0, paid: 0 },
      CANCELLED_SALE_FINANCIAL: { count: 0, total: 0, paid: 0 },
      UNRESOLVED: { count: 0, total: 0, paid: 0 },
    },
    linkedToCanonicalSalesCount: 0,
    linkedCanonicalAmount: 0,
    quarantineSalesFinancialRows: 0,
    quarantineSalesFinancialAmount: 0,
    cancelledSalesFinancialRows: 0,
    cancelledSalesFinancialAmount: 0,
    plannedFinancialRecordsCount: 0,
    plannedFinancialRecordsAmount: 0,
    quarantinedCount: 0,
    unresolvedCount: 0,
    skippedOtherIncomeCount: 0,
    skippedOtherIncomeAmount: 0,
    totalSkippedCount: 0,
    totalSkippedAmount: 0,
    totalAccountedRows: 0,
    totalAccountedAmount: 0,
    reconciliationPassed: false,
  };

  const plannedRecords: PlannedFinancialRecord[] = [];
  const samples: HustlerFinancialImportPlan["samples"] = {
    saleReceivableSample: null,
    operatingExpenseSample: null,
    inventoryPurchaseSample: null,
    openReceivableSample: null,
    quarantineSample: null,
  };

  for (const flRow of flRows) {
    const payload = flRow.payload as any;
    const legacyId = flRow.sourcePrimaryKey;
    const tipo = payload.tipo === "E" ? "E" : "S";
    const amountTotal = parseFloat(String(payload.vr_total || "0"));
    const amountPaid = parseFloat(String(payload.vr_pago || "0"));
    const isConfirmed = String(payload.confirmado) === "1";
    const desc = String(payload.descricao || "");

    const dueDate = parseLegacyFinancialDate(payload.data_vencimento) || new Date("2014-10-01T00:00:00Z");
    const confirmedDate = isConfirmed ? parseLegacyFinancialDate(payload.data_confirmacao) || dueDate : null;
    const competenceDate = parseLegacyFinancialDate(payload.data_competencia) || dueDate;

    // Look up linked pagamento
    const idNfPag = payload.id_nota_fiscal_pagamento ? String(payload.id_nota_fiscal_pagamento) : null;
    const pag = idNfPag ? pagMap.get(idNfPag) : null;
    const hasPagamentoLink = Boolean(pag);

    // Look up linked venda and canonical sale
    let linkedVenda: any = null;
    let canonicalSaleId: string | null = null;
    let customerId: string | null = null;

    if (pag && pag.id_nota_fiscal) {
      const nfId = String(pag.id_nota_fiscal);
      linkedVenda = vendaByNfId.get(nfId);

      // Check Venda Simples canonical sale
      if (linkedVenda) {
        const match = saleIdByAnchor.get(`VENDA_SIMPLES:HUSTLER_LEGACY:${linkedVenda.id}`);
        if (match) {
          canonicalSaleId = match.saleId;
          customerId = match.customerId;
        }
      }

      // Check NFE canonical sale
      if (!canonicalSaleId) {
        const matchNfe = saleIdByAnchor.get(`NFE:HUSTLER_LEGACY:${nfId}`);
        if (matchNfe) {
          canonicalSaleId = matchNfe.saleId;
          customerId = matchNfe.customerId;
        }
      }
    }

    const isQuarantineSale = linkedVenda ? quarantineVendaIds.has(String(linkedVenda.id)) : false;
    const isCancelledSale = linkedVenda ? String(linkedVenda.cancelado) === "1" : false;

    const classification = classifyFinancialLaunch({
      tipo,
      description: desc,
      hasPagamentoLink,
      isQuarantineSale,
      isCancelledSale,
      canonicalSaleId,
    });

    // Update totals
    if (tipo === "E") {
      summary.entryCount++;
      summary.entryAmount += amountTotal;
      if (isConfirmed) {
        summary.confirmedEntryCount++;
        summary.confirmedEntryAmount += amountTotal;
      } else {
        summary.openEntryCount++;
        summary.openEntryAmount += amountTotal;
      }
    } else {
      summary.exitCount++;
      summary.exitAmount += amountTotal;
      if (isConfirmed) {
        summary.confirmedExitCount++;
        summary.confirmedExitAmount += amountTotal;
      } else {
        summary.openExitCount++;
        summary.openExitAmount += amountTotal;
      }
    }

    const classEntry = summary.classes[classification];
    if (classEntry) {
      classEntry.count++;
      classEntry.total += amountTotal;
      classEntry.paid += amountPaid;
    }

    if (canonicalSaleId) {
      summary.linkedToCanonicalSalesCount++;
      summary.linkedCanonicalAmount += amountTotal;
    }
    if (isQuarantineSale) {
      summary.quarantineSalesFinancialRows++;
      summary.quarantineSalesFinancialAmount += amountTotal;
    }
    if (isCancelledSale) {
      summary.cancelledSalesFinancialRows++;
      summary.cancelledSalesFinancialAmount += amountTotal;
    }

    // Determine account mapping
    let budgetPlanSourceId: string | null = null;
    let accountCategory: string | null = null;
    if (classification === "OPERATING_EXPENSE") {
      const expMap = mapExpenseCategory(desc);
      budgetPlanSourceId = expMap.budgetPlanSourceId;
      accountCategory = expMap.category;
    } else if (classification === "INVENTORY_PURCHASE_AP") {
      budgetPlanSourceId = "19"; // Compras
      accountCategory = "INVENTORY_PURCHASE";
    } else if (classification === "SALE_RECEIVABLE") {
      budgetPlanSourceId = "3"; // Vendas
      accountCategory = "COMMERCIAL_SALE";
    } else if (classification === "OTHER_FINANCIAL_INCOME") {
      budgetPlanSourceId = "1"; // Credito / Outros
      accountCategory = "OTHER_INCOME";
    }

    const importable = classification === "SALE_RECEIVABLE" || classification === "OPERATING_EXPENSE" || classification === "INVENTORY_PURCHASE_AP";
    const skipReason = !importable ? `Classified as ${classification}` : null;

    if (importable) {
      summary.plannedFinancialRecordsCount++;
      summary.plannedFinancialRecordsAmount += amountTotal;
    } else if (classification === "QUARANTINE") {
      summary.quarantinedCount++;
    } else if (classification === "UNRESOLVED") {
      summary.unresolvedCount++;
    } else if (classification === "OTHER_FINANCIAL_INCOME") {
      summary.skippedOtherIncomeCount++;
      summary.skippedOtherIncomeAmount += amountTotal;
    }

    const plannedRecord: PlannedFinancialRecord = {
      legacyFinancialId: legacyId,
      sourceId: formatFinancialSourceId(legacyId),
      sourceType: "financeiro_lancamento",
      direction: tipo,
      canonicalFinancialType: tipo === "E" ? FinancialRecordType.ENTRADA : FinancialRecordType.SAIDA,
      amountOriginal: round2(amountTotal),
      amountPaid: round2(amountPaid),
      dueDate,
      confirmedDate,
      competenceDate,
      isConfirmed,
      budgetPlanSourceId,
      accountCategory,
      canonicalSaleId,
      customerId,
      paymentMethod: pag ? pag.nome_forma_pagamento_base : null,
      installmentNumber: pag ? parseInt(String(pag.parcela || "1"), 10) : null,
      installmentCount: null,
      evidenceLevel: canonicalSaleId ? "LEVEL_A" : hasPagamentoLink ? "LEVEL_B" : "LEVEL_C",
      classification,
      affectsCash: true,
      affectsManagerialDre: classification === "OPERATING_EXPENSE",
      affectsCommercialRevenue: false, // Invariant: never touches commercial revenue
      affectsCmv: false, // Invariant: purchases never touch CMV directly
      importable,
      skipReason,
      warnings: [],
    };

    plannedRecords.push(plannedRecord);

    // Collect representative samples
    if (classification === "SALE_RECEIVABLE" && !samples.saleReceivableSample && canonicalSaleId) {
      samples.saleReceivableSample = plannedRecord;
    }
    if (classification === "OPERATING_EXPENSE" && !samples.operatingExpenseSample && accountCategory === "ALUGUEL") {
      samples.operatingExpenseSample = plannedRecord;
    }
    if (classification === "INVENTORY_PURCHASE_AP" && !samples.inventoryPurchaseSample) {
      samples.inventoryPurchaseSample = plannedRecord;
    }
    if (tipo === "E" && !isConfirmed && !samples.openReceivableSample) {
      samples.openReceivableSample = plannedRecord;
    }
    if (classification === "QUARANTINE" && !samples.quarantineSample) {
      samples.quarantineSample = plannedRecord;
    }
  }

  // Round summary totals
  summary.entryAmount = round2(summary.entryAmount);
  summary.exitAmount = round2(summary.exitAmount);
  summary.confirmedEntryAmount = round2(summary.confirmedEntryAmount);
  summary.openEntryAmount = round2(summary.openEntryAmount);
  summary.confirmedExitAmount = round2(summary.confirmedExitAmount);
  summary.openExitAmount = round2(summary.openExitAmount);
  summary.linkedCanonicalAmount = round2(summary.linkedCanonicalAmount);
  summary.quarantineSalesFinancialAmount = round2(summary.quarantineSalesFinancialAmount);
  summary.cancelledSalesFinancialAmount = round2(summary.cancelledSalesFinancialAmount);
  summary.plannedFinancialRecordsAmount = round2(summary.plannedFinancialRecordsAmount);
  summary.skippedOtherIncomeAmount = round2(summary.skippedOtherIncomeAmount);
  summary.totalSkippedCount =
    summary.quarantinedCount + summary.unresolvedCount + summary.skippedOtherIncomeCount;
  summary.totalSkippedAmount = round2(
    summary.quarantineSalesFinancialAmount +
      summary.classes.UNRESOLVED.total +
      summary.skippedOtherIncomeAmount
  );
  summary.totalAccountedRows = summary.plannedFinancialRecordsCount + summary.totalSkippedCount;
  summary.totalAccountedAmount = round2(
    summary.plannedFinancialRecordsAmount + summary.totalSkippedAmount
  );

  for (const key of Object.keys(summary.classes) as HustlerFinancialClass[]) {
    summary.classes[key].total = round2(summary.classes[key].total);
    summary.classes[key].paid = round2(summary.classes[key].paid);
  }

  const sumClassRows = Object.values(summary.classes).reduce((acc, c) => acc + c.count, 0);
  summary.reconciliationPassed =
    summary.totalSourceRows === 11152 &&
    sumClassRows === 11152 &&
    summary.totalAccountedRows === 11152 &&
    summary.entryCount === 9021 &&
    summary.entryAmount === 1121885.31 &&
    summary.exitCount === 2131 &&
    summary.exitAmount === 1085759.45 &&
    summary.totalAccountedAmount === round2(summary.entryAmount + summary.exitAmount);

  return {
    summary,
    plannedRecords,
    samples,
  };
}

