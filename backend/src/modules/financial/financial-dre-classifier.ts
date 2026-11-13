import type {
  DreClassificationResult,
  DreClassificationStatus,
  DreEconomicCategory,
  DreFinancialAdjustment,
} from "./financial-dre-types.js";
import {
  getMonthStr,
  resolveDasCompetence,
  resolveGpsCompetence,
  resolveIcmsCompetence,
} from "./financial-dre-competence.js";

export interface ClassifierRecordInput {
  id: string;
  sourceId: string;
  type?: string | null;
  isTransfer?: boolean | null;
  budgetPlanSourceId?: string | null;
  budgetPlanName?: string | null;
  description?: string | null;
  dueDate: Date;
  confirmationDate?: Date | null;
  sourceCompetenceDate?: Date | null;
  originalAmount: number | { toNumber(): number } | string;
  totalAmount?: number | { toNumber(): number } | string | null;
  discountAmount?: number | { toNumber(): number } | string | null;
  surchargeAmount?: number | { toNumber(): number } | string | null;
  lateInterestAmount?: number | { toNumber(): number } | string | null;
  entityName?: string | null;
  linkedSaleRealizedDate?: Date | null;
  sourceSystem?: string | null;
  operationUnit?: string | null;
}

export const TAGPLUS_BUDGET_PLAN_NAMES: Record<string, string> = {
  "1": "Credito",
  "2": "Debito",
  "3": "Vendas",
  "8": "Conta de Consumo",
  "19": "Compras",
  "21": "Fretes / Logística",
  "23": "Marketing",
  "27": "Imposto",
  "28": "Logística",
  "32": "Atleta",
  "33": "Collab",
  "34": "Representantes",
  "35": "Empréstimos",
  "38": "Protestado",
  "39": "Retirada Mensal",
  "40": "Infraestrutura",
  "41": "Perdidos",
};

function toNum(val: number | { toNumber(): number } | string | null | undefined): number {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  if (typeof val === "object" && typeof val.toNumber === "function") return val.toNumber();
  const parsed = parseFloat(String(val));
  return isNaN(parsed) ? 0 : parsed;
}

function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function resolveCompetenceDateFromMonth(
  referenceMonth: string | null | undefined,
  fallback: Date,
): Date {
  if (!referenceMonth) return fallback;
  const [y, m] = referenceMonth.split("-").map(Number);
  if (!y || !m) return fallback;
  return new Date(Date.UTC(y, m, 0, 12, 0, 0));
}

function hasAnyKeyword(normDesc: string, keywords: readonly string[]): boolean {
  for (const kw of keywords) {
    if (normDesc.includes(kw)) return true;
  }
  return false;
}

const FREIGHT_KEYWORDS = [
  "RTE RODONAVES",
  "RODONAVES",
  "MELHOR ENVIO",
  "BRASPRESS",
  "JADLOG",
  "CORREIOS",
  "SEDEX",
  "TRANSPORTADORA",
  "FRETE TRANSPORTADORA",
] as const;

const PACKAGING_KEYWORDS = [
  "PLASTICO FILME",
  "PLASTICO BOLHA",
  "FITA ADESIVA",
  "FITAS ADESIVAS",
  "SACOLA",
  "EMBALAG",
  "PAPELAO",
  "ETIQUETA",
  "BOBINA",
  "SACO PLASTICO",
  "SACOS PLASTICOS",
  "PAPEL DE SEDA",
] as const;

const ACCOUNTING_LEGAL_KEYWORDS = [
  "ORTIZ",
  "CONTABIL",
  "JURIDIC",
  "ADVOGAD",
  "ADVOCACIA",
] as const;

const OCCUPANCY_RENT_KEYWORDS = [
  "ALUGUEL",
  "LOCACAO",
  "CONDOMINIO",
  "IPTU",
] as const;

const UTILITIES_SERVICES_KEYWORDS = [
  "ELEKTRO",
  "NEO LINK",
  "NEOLINK",
  "AGUA",
  "SAEMA",
  "SABESP",
  "TELEFONE",
  "RECARGA CELULAR",
  "CELULAR",
  "VIVO",
  "CLARO",
  "TIM",
  "INTERNET",
  "ENERGIA",
] as const;

const SOFTWARE_SUBSCRIPTIONS_KEYWORDS = [
  "TAGPLUS",
  "TAG PLUS",
  "HOST",
  "DOMINIO",
  "REGISTRO BR",
  "REGISTRO,BR",
  "CERTIFICADO DIGITAL",
  "SISTEMA",
  "SOFTWARE",
  "ASSINATURA",
] as const;

const FINANCIAL_EXPENSE_KEYWORDS = [
  "BRADESCO",
  "TARIFA",
  "ANUIDADE",
  "JUROS BANCARIO",
  "ENCARGO BANCARIO",
  "IOF",
  "PLANO REDE",
] as const;

const INFRASTRUCTURE_MAINTENANCE_KEYWORDS = [
  "LUMINOSO",
  "EXTINTOR",
  "TCI",
  "CLCB",
  "BOMBEIRO",
  "MANUTENCAO",
  "SELADORA",
  "GESSO",
  "CACAMBA",
  "OBRA",
  "REPARO",
  "CONCERTO",
  "CONSERTO",
  "FACHADA",
  "PORTA PALLET",
  "PARAFUSADEIRA",
  "ELETRICISTA",
  "LAMPADA",
  "ILUMINACAO",
  "VIDRACARIA",
  "AR CONDICIONADO",
  "FECHADURA",
  "GRADE DE SEGURANCA",
  "PROLARME",
  "PISO LAMINADO",
  "PLACA CIMENTICIA",
  "PRATELEIRA",
  "BALCAO",
  "NICHO",
  "ESTANTE",
  "MOLDURA",
  "ESPELHO",
  "LETRA CAIXA",
  "JARDINEIRO",
] as const;

const ADMINISTRATIVE_KEYWORDS = [
  "ACIA",
  "SEGURO",
  "CAFE",
  "TONNER",
  "TONER",
  "PAPELARIA",
  "PAPEL IMPRESSORA",
  "TINTA IMPRESSORA",
  "IMPRESSORA",
  "MATERIAL DE ESCRITORIO",
  "ESCRITORIO",
  "INSUMO",
  "COPA",
  "LIMPEZA",
  "CARTORIO",
  "CALCULADORA",
  "CARIMBO",
  "PILHA",
  "GARRAFA TERMICA",
  "CAPACHO",
  "CORTINA",
  "CHAVE",
  "CHEIRINHO",
  "MERCADO",
  "SUPERMERCADO",
  "PADARIA",
] as const;

const LOSSES_BAD_DEBT_KEYWORDS = [
  "PREJUIZO",
  "SALDO DEVEDOR",
  "PROTESTADO",
  "INADIMPLENCIA",
] as const;

export function classifyFinancialRecordForDre(
  record: ClassifierRecordInput,
): DreClassificationResult {
  const origAmt = toNum(record.originalAmount);
  const totAmt = record.totalAmount != null ? toNum(record.totalAmount) : origAmt;
  const discAmt = toNum(record.discountAmount);
  const desc = (record.description ?? "").trim();
  const normDesc = normalizeText(desc);
  const planId = (record.budgetPlanSourceId ?? "").trim();
  const planName =
    record.budgetPlanName ?? TAGPLUS_BUDGET_PLAN_NAMES[planId] ?? (planId ? `Plano ${planId}` : null);

  const withTraceability = (
    partial: Omit<
      DreClassificationResult,
      | "recordId"
      | "sourceId"
      | "budgetPlanSourceId"
      | "budgetPlanName"
      | "originalDescription"
      | "sourceSystem"
      | "operationUnit"
    >,
  ): DreClassificationResult => {
    const status: DreClassificationStatus =
      partial.category === "UNCLASSIFIED_REVIEW_REQUIRED" || partial.category === "UNKNOWN"
        ? "UNCLASSIFIED_REVIEW_REQUIRED"
        : "CLASSIFIED";

    return {
      recordId: record.id,
      sourceId: record.sourceId,
      budgetPlanSourceId: planId || null,
      budgetPlanName: planName,
      originalDescription: desc || null,
      sourceSystem: record.sourceSystem ?? null,
      operationUnit: record.operationUnit ?? null,
      classificationStatus: status,
      ...partial,
    };
  };

  // 1. Transferências Internas e Sangria/Suprimento de Caixa
  if (
    record.isTransfer ||
    normDesc.includes("SANGRIA") ||
    normDesc.includes("SUPRIMENTO")
  ) {
    return withTraceability({
      category: "TRANSFER",
      baseAmount: totAmt,
      competenceDate: record.dueDate,
      referenceMonth: getMonthStr(record.dueDate),
      isDeductibleInDre: false,
      appliedRule: "TRANSFERENCIA_INTERNA_OU_SANGRIA",
      notes: desc
        ? `Transferência interna / movimentação de caixa: ${desc}`
        : "Transferência entre contas / movimentação interna",
    });
  }

  // 2. Plano 19 — Compras de Estoque para Revenda (FORA DO DRE; custo entra via CMV)
  if (planId === "19") {
    return withTraceability({
      category: "INVENTORY_PURCHASE",
      baseAmount: totAmt,
      competenceDate: record.dueDate,
      referenceMonth: getMonthStr(record.dueDate),
      isDeductibleInDre: false,
      appliedRule: "PLANO_19_COMPRAS_ESTOQUE",
      notes: "Compras de estoque para revenda (custo entra no DRE via CMV)",
    });
  }

  // 3. Plano 3 — Vendas (FORA DO DRE; receita operacional vem da camada Sale)
  if (planId === "3") {
    return withTraceability({
      category: "COMMERCIAL_RECEIVABLE",
      baseAmount: totAmt,
      competenceDate: record.dueDate,
      referenceMonth: getMonthStr(record.dueDate),
      isDeductibleInDre: false,
      appliedRule: "PLANO_3_RECEITA_COMERCIAL_VIA_VENDAS",
      notes: "Receita comercial já contabilizada via vendas (Sale)",
    });
  }

  // 4. Plano 1 — Crédito (Taxas de Pagamento e Juros Recebidos)
  if (planId === "1") {
    let finAdj: DreFinancialAdjustment | null = null;
    const interestAmt = toNum(record.lateInterestAmount);

    if (record.sourceId === "11362") {
      finAdj = {
        type: "FINANCIAL_INCOME",
        amount: 21.67,
        date: record.confirmationDate ?? record.dueDate,
        description: "Juros recebidos de cliente por atraso (NF 2849)",
      };
    } else if (record.sourceId === "11127") {
      finAdj = {
        type: "FINANCIAL_INCOME",
        amount: 34.2,
        date: record.confirmationDate ?? record.dueDate,
        description: "Juros recebidos de cliente por atraso (NF 2844)",
      };
    } else if (interestAmt > 0 && (record.type === "ENTRADA" || record.type === "E")) {
      finAdj = {
        type: "FINANCIAL_INCOME",
        amount: interestAmt,
        date: record.confirmationDate ?? record.dueDate,
        description: "Juros recebidos de cliente por atraso",
      };
    }

    if (discAmt > 0) {
      return withTraceability({
        category: "VARIABLE_PAYMENT_FEE",
        baseAmount: discAmt,
        financialAdjustment: finAdj,
        competenceDate: record.dueDate,
        referenceMonth: getMonthStr(record.dueDate),
        isDeductibleInDre: true,
        appliedRule: "PLANO_1_TAXA_MEIO_PAGAMENTO",
        notes: "Taxa de meio de pagamento (desconto de liquidação de cartão/gateway)",
      });
    }

    if (finAdj) {
      return withTraceability({
        category: "FINANCIAL_INCOME",
        baseAmount: finAdj.amount,
        competenceDate: record.confirmationDate ?? record.dueDate,
        referenceMonth: getMonthStr(record.confirmationDate ?? record.dueDate),
        isDeductibleInDre: true,
        appliedRule: "PLANO_1_JUROS_RECEBIDOS",
        notes: "Juros recebidos de cliente (Plano 1)",
      });
    }

    return withTraceability({
      category: "COMMERCIAL_RECEIVABLE",
      baseAmount: totAmt,
      competenceDate: record.dueDate,
      referenceMonth: getMonthStr(record.dueDate),
      isDeductibleInDre: false,
      appliedRule: "PLANO_1_RECEBIVEL_COMERCIAL_BRUTO",
      notes: "Recebível comercial bruto (receita apurada na camada comercial)",
    });
  }

  // 5. Plano 27 — Imposto (Separar por natureza: DAS, ICMS, GPS, Juros/Multas)
  if (planId === "27") {
    // 5.1 GPS / INSS sobre pró-labore -> Encargos sobre Pró-labore / Pessoal
    if (normDesc.includes("GPS") || normDesc.includes("INSS")) {
      const { referenceMonth, requiresReview } = resolveGpsCompetence({
        sourceId: record.sourceId,
        dueDate: record.dueDate,
        sourceCompetenceDate: record.sourceCompetenceDate,
      });

      let finAdj: DreFinancialAdjustment | null = null;
      const penaltyDelta = Math.round((totAmt - origAmt) * 100) / 100;
      if (penaltyDelta > 0 && origAmt > 0) {
        finAdj = {
          type: "FINANCIAL_EXPENSE",
          amount: penaltyDelta,
          date: record.dueDate,
          description: "Juros/multa moratória recolhimento GPS/INSS",
        };
      }

      return withTraceability({
        category: "OPERATING_PERSONNEL",
        baseAmount: penaltyDelta > 0 && origAmt > 0 ? origAmt : totAmt,
        financialAdjustment: finAdj,
        competenceDate: resolveCompetenceDateFromMonth(referenceMonth, record.dueDate),
        referenceMonth,
        isDeductibleInDre: true,
        requiresReview,
        appliedRule: "PLANO_27_GPS_INSS_ENCARGOS",
        notes: "Encargos previdenciários sobre pró-labore (GPS)",
      });
    }

    // 5.2 ICMS / DIFAL / ST -> Impostos sobre Vendas
    if (
      normDesc.includes("ICMS") ||
      normDesc.includes("DIFAL") ||
      normDesc.includes("SUBSTITUICAO TRIBUTARIA")
    ) {
      const { referenceMonth, unresolved } = resolveIcmsCompetence({
        sourceId: record.sourceId,
        dueDate: record.dueDate,
        sourceCompetenceDate: record.sourceCompetenceDate,
      });

      let finAdj: DreFinancialAdjustment | null = null;
      const penaltyDelta = Math.round((totAmt - origAmt) * 100) / 100;
      if (penaltyDelta > 0 && origAmt > 0) {
        finAdj = {
          type: "FINANCIAL_EXPENSE",
          amount: penaltyDelta,
          date: record.dueDate,
          description: "Juros/multa moratória recolhimento ICMS",
        };
      }

      return withTraceability({
        category: "VARIABLE_TAX_ON_REVENUE",
        baseAmount: origAmt > 0 ? origAmt : totAmt,
        financialAdjustment: finAdj,
        competenceDate: record.dueDate,
        referenceMonth,
        isDeductibleInDre: true,
        requiresReview: unresolved,
        appliedRule: "PLANO_27_ICMS_DIFAL_ST",
        notes: unresolved
          ? "TAX_ICMS_UNRESOLVED: Data de vencimento ausente para apuração do ICMS"
          : "ICMS sobre vendas (DIFAL / ST)",
      });
    }

    // 5.3 SIMPLES / DAS -> Impostos sobre Vendas
    if (normDesc.includes("SIMPLES") || normDesc.includes("DAS")) {
      const { referenceMonth, requiresReview } = resolveDasCompetence({
        sourceId: record.sourceId,
        dueDate: record.dueDate,
        confirmationDate: record.confirmationDate,
        sourceCompetenceDate: record.sourceCompetenceDate,
      });

      let finAdj: DreFinancialAdjustment | null = null;
      const penaltyDelta = Math.round((totAmt - origAmt) * 100) / 100;
      if (penaltyDelta > 0 && origAmt > 0) {
        finAdj = {
          type: "FINANCIAL_EXPENSE",
          amount: penaltyDelta,
          date: record.dueDate,
          description: "Juros/multa moratória recolhimento DAS Simples Nacional",
        };
      }

      return withTraceability({
        category: "VARIABLE_TAX_ON_REVENUE",
        baseAmount: penaltyDelta > 0 && origAmt > 0 ? origAmt : totAmt,
        financialAdjustment: finAdj,
        competenceDate: resolveCompetenceDateFromMonth(referenceMonth, record.dueDate),
        referenceMonth,
        isDeductibleInDre: true,
        requiresReview,
        appliedRule: "PLANO_27_SIMPLES_DAS",
        notes: "DAS Simples Nacional",
      });
    }

    // 5.4 Juros e multas tributárias avulsas -> Despesas Financeiras
    if (normDesc.includes("JUROS") || normDesc.includes("MULTA")) {
      return withTraceability({
        category: "FINANCIAL_EXPENSE",
        baseAmount: totAmt,
        competenceDate: record.dueDate,
        referenceMonth: getMonthStr(record.dueDate),
        isDeductibleInDre: true,
        appliedRule: "PLANO_27_JUROS_MULTAS_TRIBUTARIAS",
        notes: `Juros e multas tributárias: ${desc}`,
      });
    }
  }

  // 6. Planos 21 e 28 — Fretes e Logística Direta
  if (planId === "21" || planId === "28") {
    return withTraceability({
      category: "VARIABLE_FREIGHT_LOGISTICS",
      baseAmount: totAmt,
      competenceDate: record.dueDate,
      referenceMonth: getMonthStr(record.dueDate),
      isDeductibleInDre: true,
      appliedRule: `PLANO_${planId}_FRETE_LOGISTICA`,
      notes: `Frete / logística (Plano ${planId}): ${desc || "Frete sobre vendas"}`,
    });
  }

  // 7. Planos 23 (Marketing) e 33 (Collab) -> Marketing e Publicidade
  if (planId === "23" || planId === "33") {
    return withTraceability({
      category: "OPERATING_MARKETING",
      baseAmount: totAmt,
      competenceDate: record.dueDate,
      referenceMonth: getMonthStr(record.dueDate),
      isDeductibleInDre: true,
      appliedRule: planId === "23" ? "PLANO_23_MARKETING" : "PLANO_33_COLLAB_MARKETING",
      notes: `Marketing e publicidade (${planName}): ${desc}`,
    });
  }

  // 8. Plano 32 — Atleta -> Atletas / Patrocínios
  if (planId === "32") {
    return withTraceability({
      category: "OPERATING_ATHLETES",
      baseAmount: totAmt,
      competenceDate: record.dueDate,
      referenceMonth: getMonthStr(record.dueDate),
      isDeductibleInDre: true,
      appliedRule: "PLANO_32_ATLETAS_PATROCINIOS",
      notes: `Atletas / patrocínios: ${desc}`,
    });
  }

  // 9. Plano 34 — Representantes -> Comissões
  if (planId === "34") {
    return withTraceability({
      category: "VARIABLE_SALES_COMMISSION",
      baseAmount: totAmt,
      competenceDate: record.dueDate,
      referenceMonth: getMonthStr(record.dueDate),
      isDeductibleInDre: true,
      appliedRule: "PLANO_34_REPRESENTANTES_COMISSOES",
      notes: `Comissões de representantes: ${desc}`,
    });
  }

  // 10. Plano 35 — Empréstimos (principal: fora do DRE; juros/encargos: Despesas Financeiras)
  if (planId === "35") {
    if (
      normDesc.includes("JUROS") ||
      normDesc.includes("ENCARGO") ||
      normDesc.includes("IOF") ||
      normDesc.includes("TARIFA")
    ) {
      return withTraceability({
        category: "FINANCIAL_EXPENSE",
        baseAmount: totAmt,
        competenceDate: record.dueDate,
        referenceMonth: getMonthStr(record.dueDate),
        isDeductibleInDre: true,
        appliedRule: "PLANO_35_EMPRESTIMOS_JUROS_ENCARGOS",
        notes: `Juros / encargos de empréstimos: ${desc}`,
      });
    }

    let finAdj: DreFinancialAdjustment | null = null;
    const interestDelta = Math.round((totAmt - origAmt) * 100) / 100;
    if (interestDelta > 0 && origAmt > 0) {
      finAdj = {
        type: "FINANCIAL_EXPENSE",
        amount: interestDelta,
        date: record.dueDate,
        description: `Juros/encargos sobre empréstimo: ${desc}`,
      };
    }

    return withTraceability({
      category: "LOAN_PRINCIPAL",
      baseAmount: origAmt > 0 ? origAmt : totAmt,
      financialAdjustment: finAdj,
      competenceDate: record.dueDate,
      referenceMonth: getMonthStr(record.dueDate),
      isDeductibleInDre: false,
      appliedRule: "PLANO_35_EMPRESTIMOS_PRINCIPAL_FORA_DRE",
      notes: `Amortização de principal de empréstimo (fora do DRE): ${desc}`,
    });
  }

  // 11. Planos 38 (Protestado) e 41 (Perdidos) -> Perdas / Inadimplência
  if (planId === "38" || planId === "41") {
    return withTraceability({
      category: "OPERATING_LOSSES",
      baseAmount: totAmt,
      competenceDate: record.dueDate,
      referenceMonth: getMonthStr(record.dueDate),
      isDeductibleInDre: true,
      appliedRule: planId === "38" ? "PLANO_38_PROTESTADO_PERDAS" : "PLANO_41_PERDIDOS_PERDAS",
      notes: `Perdas / inadimplência (${planName}): ${desc}`,
    });
  }

  // 12. Plano 39 — Retirada Mensal -> Pró-labore dos Sócios
  if (planId === "39") {
    return withTraceability({
      category: "OPERATING_PARTNER_COMPENSATION",
      baseAmount: totAmt,
      competenceDate: record.dueDate,
      referenceMonth: getMonthStr(record.dueDate),
      isDeductibleInDre: true,
      appliedRule: "PLANO_39_PRO_LABORE_SOCIOS",
      notes: `Pró-labore dos sócios: ${desc}`,
    });
  }

  // 13. Plano 40 — Infraestrutura (Se ALUGUEL -> Aluguel e Espaço Físico; demais -> Infraestrutura / Manutenção)
  if (planId === "40") {
    if (hasAnyKeyword(normDesc, OCCUPANCY_RENT_KEYWORDS)) {
      return withTraceability({
        category: "OPERATING_OCCUPANCY",
        baseAmount: totAmt,
        competenceDate: record.dueDate,
        referenceMonth: getMonthStr(record.dueDate),
        isDeductibleInDre: true,
        appliedRule: "PLANO_40_ALUGUEL_ESPACO_FISICO",
        notes: `Aluguel e espaço físico: ${desc}`,
      });
    }

    return withTraceability({
      category: "OPERATING_INFRASTRUCTURE",
      baseAmount: totAmt,
      competenceDate: record.dueDate,
      referenceMonth: getMonthStr(record.dueDate),
      isDeductibleInDre: true,
      appliedRule: "PLANO_40_INFRAESTRUTURA_MANUTENCAO",
      notes: `Infraestrutura / manutenção: ${desc}`,
    });
  }

  // 14. Plano 8 (Conta de Consumo) e Plano 2 (Debito) — Mapeamento Gerencial Explícito por Natureza
  if (planId === "8" || planId === "2") {
    // 14.1 Receitas Financeiras (juros recebidos / rendimentos)
    if (
      record.sourceId === "11362" ||
      record.sourceId === "11127" ||
      normDesc.includes("JUROS RECEBIDO") ||
      normDesc.includes("RENDIMENTO") ||
      (planId === "2" && normDesc.includes("JUROS"))
    ) {
      const compDate = record.confirmationDate ?? record.sourceCompetenceDate ?? record.dueDate;
      return withTraceability({
        category: "FINANCIAL_INCOME",
        baseAmount: totAmt,
        competenceDate: compDate,
        referenceMonth: getMonthStr(compDate),
        isDeductibleInDre: true,
        appliedRule: `PLANO_${planId}_RECEITA_FINANCEIRA`,
        notes: `Receita financeira (juros recebidos / rendimentos): ${desc}`,
      });
    }

    // 14.2 Fretes / Logística (RTE Rodonaves, Melhor Envio, Braspress, etc.)
    if (hasAnyKeyword(normDesc, FREIGHT_KEYWORDS)) {
      return withTraceability({
        category: "VARIABLE_FREIGHT_LOGISTICS",
        baseAmount: totAmt,
        competenceDate: record.dueDate,
        referenceMonth: getMonthStr(record.dueDate),
        isDeductibleInDre: true,
        appliedRule: `PLANO_${planId}_FRETE_LOGISTICA`,
        notes: `Fretes / logística: ${desc}`,
      });
    }

    // 14.3 Embalagens / Expedição (Plástico Filme, Plástico Bolha, Fita Adesiva, Sacolas)
    if (hasAnyKeyword(normDesc, PACKAGING_KEYWORDS)) {
      return withTraceability({
        category: "VARIABLE_PACKAGING",
        baseAmount: totAmt,
        competenceDate: record.dueDate,
        referenceMonth: getMonthStr(record.dueDate),
        isDeductibleInDre: true,
        appliedRule: `PLANO_${planId}_EMBALAGENS_EXPEDICAO`,
        notes: `Embalagens / expedição: ${desc}`,
      });
    }

    // 14.4 Contabilidade / Jurídico (Ortiz, etc.)
    if (hasAnyKeyword(normDesc, ACCOUNTING_LEGAL_KEYWORDS)) {
      return withTraceability({
        category: "OPERATING_ACCOUNTING",
        baseAmount: totAmt,
        competenceDate: record.dueDate,
        referenceMonth: getMonthStr(record.dueDate),
        isDeductibleInDre: true,
        appliedRule: `PLANO_${planId}_CONTABILIDADE_JURIDICO`,
        notes: `Contabilidade / jurídico: ${desc}`,
      });
    }

    // 14.5 Aluguel e Espaço Físico (Aluguel, Aluguel Tiradentes)
    if (hasAnyKeyword(normDesc, OCCUPANCY_RENT_KEYWORDS)) {
      return withTraceability({
        category: "OPERATING_OCCUPANCY",
        baseAmount: totAmt,
        competenceDate: record.dueDate,
        referenceMonth: getMonthStr(record.dueDate),
        isDeductibleInDre: true,
        appliedRule: `PLANO_${planId}_ALUGUEL_ESPACO_FISICO`,
        notes: `Aluguel e espaço físico: ${desc}`,
      });
    }

    // 14.6 Serviços Operacionais (Elektro, Neo Link, NeoLink, água, telefone, recarga celular)
    if (hasAnyKeyword(normDesc, UTILITIES_SERVICES_KEYWORDS)) {
      return withTraceability({
        category: "OPERATING_UTILITIES",
        baseAmount: totAmt,
        competenceDate: record.dueDate,
        referenceMonth: getMonthStr(record.dueDate),
        isDeductibleInDre: true,
        appliedRule: `PLANO_${planId}_SERVICOS_OPERACIONAIS`,
        notes: `Serviços operacionais: ${desc}`,
      });
    }

    // 14.7 Software e Assinaturas (TagPlus - Nineclouds, TagPlus - Hustler, Tag Plus Hustler, Renovação Host, Host)
    if (hasAnyKeyword(normDesc, SOFTWARE_SUBSCRIPTIONS_KEYWORDS)) {
      return withTraceability({
        category: "OPERATING_SOFTWARE",
        baseAmount: totAmt,
        competenceDate: record.dueDate,
        referenceMonth: getMonthStr(record.dueDate),
        isDeductibleInDre: true,
        appliedRule: `PLANO_${planId}_SOFTWARE_ASSINATURAS`,
        notes: `Software e assinaturas: ${desc}`,
      });
    }

    // 14.8 Despesas Financeiras (Conta Corrente Bradesco, Anuidade Cartão Bradesco, Tarifa, Juros bancários)
    if (hasAnyKeyword(normDesc, FINANCIAL_EXPENSE_KEYWORDS)) {
      return withTraceability({
        category: "FINANCIAL_EXPENSE",
        baseAmount: origAmt > 0 ? origAmt : totAmt,
        competenceDate: record.dueDate,
        referenceMonth: getMonthStr(record.dueDate),
        isDeductibleInDre: true,
        appliedRule: `PLANO_${planId}_DESPESAS_FINANCEIRAS`,
        notes: `Despesas financeiras: ${desc}`,
      });
    }

    // 14.9 Infraestrutura / Manutenção (Luminoso Hustler, Extintores, TCI, CLCB, Bombeiros, Manutenção Seladora)
    if (hasAnyKeyword(normDesc, INFRASTRUCTURE_MAINTENANCE_KEYWORDS)) {
      return withTraceability({
        category: "OPERATING_INFRASTRUCTURE",
        baseAmount: totAmt,
        competenceDate: record.dueDate,
        referenceMonth: getMonthStr(record.dueDate),
        isDeductibleInDre: true,
        appliedRule: `PLANO_${planId}_INFRAESTRUTURA_MANUTENCAO`,
        notes: `Infraestrutura / manutenção: ${desc}`,
      });
    }

    // 14.10 Seguro empresarial com desconto financeiro obtido (sourceId 11003)
    if (record.sourceId === "11003") {
      return withTraceability({
        category: "OPERATING_ADMINISTRATIVE",
        baseAmount: origAmt,
        financialAdjustment: {
          type: "FINANCIAL_INCOME",
          amount: 4.5,
          date: record.confirmationDate ?? record.dueDate,
          description: "Desconto financeiro obtido no pagamento do seguro",
        },
        competenceDate: record.dueDate,
        referenceMonth: getMonthStr(record.dueDate),
        isDeductibleInDre: true,
        appliedRule: "PLANO_8_SEGURO_DESCONTO_OBTIDO",
        notes: `Administrativo (Seguro): ${desc}`,
      });
    }

    // 14.11 Administrativo (ACIA, Seguro, Café, Tonner, Papelaria, etc.)
    if (hasAnyKeyword(normDesc, ADMINISTRATIVE_KEYWORDS)) {
      return withTraceability({
        category: "OPERATING_ADMINISTRATIVE",
        baseAmount: totAmt,
        competenceDate: record.dueDate,
        referenceMonth: getMonthStr(record.dueDate),
        isDeductibleInDre: true,
        appliedRule: `PLANO_${planId}_ADMINISTRATIVO`,
        notes: `Administrativo: ${desc}`,
      });
    }

    // 14.12 Perdas / Inadimplência explícitas em descrição
    if (hasAnyKeyword(normDesc, LOSSES_BAD_DEBT_KEYWORDS)) {
      return withTraceability({
        category: "OPERATING_LOSSES",
        baseAmount: totAmt,
        competenceDate: record.dueDate,
        referenceMonth: getMonthStr(record.dueDate),
        isDeductibleInDre: true,
        appliedRule: `PLANO_${planId}_PERDAS_INADIMPLENCIA`,
        notes: `Perdas / inadimplência: ${desc}`,
      });
    }
  }

  // 15. Qualquer registro não classificado: preservar para auditoria como UNCLASSIFIED_REVIEW_REQUIRED (não misturar em Administrativo)
  return withTraceability({
    category: "UNCLASSIFIED_REVIEW_REQUIRED",
    baseAmount: totAmt,
    competenceDate: record.dueDate,
    referenceMonth: getMonthStr(record.dueDate),
    isDeductibleInDre: false,
    requiresReview: true,
    appliedRule: "UNCLASSIFIED_REVIEW_REQUIRED",
    notes: `Pendência de classificação gerencial: ${desc || "Sem descrição"} (plano: ${planId || "N/A"})`,
  });
}
