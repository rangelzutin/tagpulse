import type {
  DreBreakdownCategoryDetail,
  DreBreakdownDto,
  DreBreakdownItemDto,
  DreClassificationResult,
  DreEconomicCategory,
  DreMonthlyItemDto,
  DreSummaryDto,
  DreSummaryTotalsDto,
} from "./financial-dre-types.js";
import { DRE_DISCLAIMER } from "./financial-dre-types.js";

export interface MonthlyCommercialTrend {
  month: string; // "YYYY-MM"
  realizedRevenue: number;
  estimatedCOGS: number;
  estimatedGrossProfit: number;
  grossMarginPercent: number | null;
}

export interface DreCalculatorOptions {
  referenceDate?: Date; // Data corrente para avaliar se o mês terminou (default: now)
  period?: { from: string; to: string };
  fromDate?: Date;
  toExclusiveDate?: Date;
}

const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const toCents = (n: number): number => Math.round(n * 100);
const fromCents = (c: number): number => c / 100;

export function calculateDreMonthly(
  commercialTrend: MonthlyCommercialTrend[],
  classifiedRecords: DreClassificationResult[],
  options?: DreCalculatorOptions,
): DreMonthlyItemDto[] {
  const refDate = options?.referenceDate ?? new Date();
  const currentMonthStr = `${refDate.getUTCFullYear()}-${String(refDate.getUTCMonth() + 1).padStart(2, "0")}`;

  const minMonth = options?.period?.from ? options.period.from.slice(0, 7) : null;
  const maxMonth = options?.period?.to ? options.period.to.slice(0, 7) : null;

  const isWithinPeriod = (m: string) => {
    if (minMonth && m < minMonth) return false;
    if (maxMonth && m > maxMonth) return false;
    return true;
  };

  // Conjunto de meses presentes na tendência comercial ou nos registros dentro do período
  const monthSet = new Set<string>();
  commercialTrend.forEach((t) => {
    if (isWithinPeriod(t.month)) monthSet.add(t.month);
  });
  classifiedRecords.forEach((r) => {
    if (r.referenceMonth && isWithinPeriod(r.referenceMonth)) {
      monthSet.add(r.referenceMonth);
    }
    if (r.financialAdjustment?.date) {
      const d = r.financialAdjustment.date;
      const adjM = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      if (isWithinPeriod(adjM)) monthSet.add(adjM);
    }
  });

  const sortedMonths = Array.from(monthSet).sort();
  const trendMap = new Map<string, MonthlyCommercialTrend>();
  commercialTrend.forEach((t) => trendMap.set(t.month, t));

  // Mapa de registros por mês de competência
  const recordsByMonth = new Map<string, DreClassificationResult[]>();
  sortedMonths.forEach((m) => recordsByMonth.set(m, []));

  // Adicionais financeiros avulsos por mês (ex: multas moratórias ICMS ou descontos obtidos)
  const finAdjByMonth = new Map<
    string,
    Array<{ type: "FINANCIAL_EXPENSE" | "FINANCIAL_INCOME"; amount: number }>
  >();
  sortedMonths.forEach((m) => finAdjByMonth.set(m, []));

  for (const r of classifiedRecords) {
    if (r.isDeductibleInDre && r.referenceMonth && recordsByMonth.has(r.referenceMonth)) {
      // Se for o mês final do período parcial, respeitar toExclusiveDate
      if (maxMonth && r.referenceMonth === maxMonth && options?.toExclusiveDate && r.competenceDate) {
        if (r.competenceDate.getTime() >= options.toExclusiveDate.getTime()) {
          continue;
        }
      }
      // Se for o mês inicial do período parcial, respeitar fromDate
      if (minMonth && r.referenceMonth === minMonth && options?.fromDate && r.competenceDate) {
        if (r.competenceDate.getTime() < options.fromDate.getTime()) {
          continue;
        }
      }
      recordsByMonth.get(r.referenceMonth)!.push(r);
    }
    if (r.financialAdjustment) {
      const adjD = r.financialAdjustment.date;
      if (options?.toExclusiveDate && adjD.getTime() >= options.toExclusiveDate.getTime()) {
        continue;
      }
      if (options?.fromDate && adjD.getTime() < options.fromDate.getTime()) {
        continue;
      }
      const adjM = `${adjD.getUTCFullYear()}-${String(adjD.getUTCMonth() + 1).padStart(2, "0")}`;
      if (finAdjByMonth.has(adjM)) {
        finAdjByMonth.get(adjM)!.push({
          type: r.financialAdjustment.type,
          amount: r.financialAdjustment.amount,
        });
      }
    }
  }

  return sortedMonths.map((month) => {
    const trend = trendMap.get(month) ?? {
      month,
      realizedRevenue: 0,
      estimatedCOGS: 0,
      estimatedGrossProfit: 0,
      grossMarginPercent: null,
    };

    const revCents = toCents(trend.realizedRevenue);
    const cogsCents = toCents(trend.estimatedCOGS);
    const grossCents = revCents - cogsCents;
    const grossMarginPercent =
      revCents > 0 ? r2((fromCents(grossCents) / fromCents(revCents)) * 100) : null;

    let payFeesCents = 0;
    let taxesCents = 0;
    let freightCents = 0;
    let salesCommCents = 0;
    let varOtherCents = 0;

    let personnelCents = 0;
    let partnerCompCents = 0;
    let marketingCents = 0;
    let occupancyCents = 0;
    let utilitiesCents = 0;
    let softwareCents = 0;
    let accountingCents = 0;
    let infraCents = 0;
    let adminCents = 0;
    let opOtherCents = 0;

    let finIncCents = 0;
    let finExpCents = 0;

    let unknownCents = 0;
    let hasDas = false;
    let hasGps = false;
    const pendingReviewList: string[] = [];

    const monthRecords = recordsByMonth.get(month) ?? [];

    for (const r of monthRecords) {
      const amtCents = toCents(r.baseAmount);
      if (r.requiresReview) {
        pendingReviewList.push(r.sourceId);
      }

      switch (r.category) {
        case "VARIABLE_PAYMENT_FEE":
          payFeesCents += amtCents;
          break;
        case "VARIABLE_TAX_ON_REVENUE":
          taxesCents += amtCents;
          if (r.notes?.includes("Simples") || r.notes?.includes("DAS")) {
            hasDas = true;
          }
          break;
        case "VARIABLE_FREIGHT_LOGISTICS":
          freightCents += amtCents;
          break;
        case "VARIABLE_SALES_COMMISSION":
          salesCommCents += amtCents;
          break;
        case "VARIABLE_OTHER":
          varOtherCents += amtCents;
          break;
        case "OPERATING_PERSONNEL":
          personnelCents += amtCents;
          if (r.notes?.includes("GPS") || r.notes?.includes("INSS")) {
            hasGps = true;
          }
          break;
        case "OPERATING_PARTNER_COMPENSATION":
          partnerCompCents += amtCents;
          break;
        case "OPERATING_MARKETING":
          marketingCents += amtCents;
          break;
        case "OPERATING_OCCUPANCY":
          occupancyCents += amtCents;
          break;
        case "OPERATING_UTILITIES":
          utilitiesCents += amtCents;
          break;
        case "OPERATING_SOFTWARE":
          softwareCents += amtCents;
          break;
        case "OPERATING_ACCOUNTING":
          accountingCents += amtCents;
          break;
        case "OPERATING_INFRASTRUCTURE":
          infraCents += amtCents;
          break;
        case "OPERATING_ADMINISTRATIVE":
          adminCents += amtCents;
          break;
        case "OPERATING_OTHER":
          opOtherCents += amtCents;
          break;
        case "FINANCIAL_EXPENSE":
          finExpCents += amtCents;
          break;
        case "FINANCIAL_INCOME":
          finIncCents += amtCents;
          break;
        case "UNKNOWN":
          unknownCents += amtCents;
          break;
      }
    }

    // Incorporar ajustes financeiros moratórios ou descontos obtidos
    const adjs = finAdjByMonth.get(month) ?? [];
    for (const adj of adjs) {
      if (adj.type === "FINANCIAL_EXPENSE") {
        finExpCents += toCents(adj.amount);
      } else if (adj.type === "FINANCIAL_INCOME") {
        finIncCents += toCents(adj.amount);
      }
    }

    const varTotalCents =
      payFeesCents + taxesCents + freightCents + salesCommCents + varOtherCents;
    const cmCents = grossCents - varTotalCents;
    const cmPercent =
      revCents > 0 ? r2((fromCents(cmCents) / fromCents(revCents)) * 100) : null;

    const opTotalCents =
      personnelCents +
      partnerCompCents +
      marketingCents +
      occupancyCents +
      utilitiesCents +
      softwareCents +
      accountingCents +
      infraCents +
      adminCents +
      opOtherCents;

    const finTotalCents = finIncCents - finExpCents;
    const otherTotalCents = 0; // Baseline: R$ 0,00

    const netResultCents = cmCents - opTotalCents + finTotalCents + otherTotalCents;
    const netMarginPercent =
      revCents > 0 ? r2((fromCents(netResultCents) / fromCents(revCents)) * 100) : null;

    const status =
      netResultCents > 0 ? "PROFIT" : netResultCents < 0 ? "LOSS" : "BREAK_EVEN";

    // Qualidade Temporal e Fechamento Contábil
    // Avaliar se o mês civil já encerrou (último dia do mês < refDate)
    const parts = month.split("-");
    const yNum = parseInt(parts[0] || "0", 10);
    const mNum = parseInt(parts[1] || "0", 10);
    // Último milissegundo do mês em UTC
    const monthEnd = new Date(Date.UTC(yNum, mNum, 0, 23, 59, 59, 999));
    const isMonthOver = monthEnd.getTime() < refDate.getTime();

    const pendingAccruals: string[] = [];
    if (!hasDas) {
      pendingAccruals.push("VARIABLE_TAX_ON_REVENUE");
    }
    if (!hasGps) {
      pendingAccruals.push("OPERATING_PERSONNEL");
    }

    const isCurrentPartial = month === currentMonthStr;
    const isProvisional = isCurrentPartial || !isMonthOver || pendingAccruals.length > 0;
    const financiallyClosed = isMonthOver && pendingAccruals.length === 0;

    const totalEligibleCents = varTotalCents + opTotalCents + finExpCents;
    const totalAllCents = totalEligibleCents + unknownCents;
    const coveragePercent =
      totalAllCents > 0
        ? r2((fromCents(totalEligibleCents) / fromCents(totalAllCents)) * 100)
        : 100;

    return {
      month,
      realizedRevenue: fromCents(revCents),
      estimatedCOGS: fromCents(cogsCents),
      estimatedGrossProfit: fromCents(grossCents),
      estimatedGrossMarginPercent: grossMarginPercent,
      variableExpenses: {
        paymentFees: fromCents(payFeesCents),
        taxesOnRevenue: fromCents(taxesCents),
        freightLogistics: fromCents(freightCents),
        salesCommissions: fromCents(salesCommCents),
        other: fromCents(varOtherCents),
        total: fromCents(varTotalCents),
      },
      contributionMargin: fromCents(cmCents),
      contributionMarginPercent: cmPercent,
      operatingExpenses: {
        personnel: fromCents(personnelCents),
        partnerCompensation: fromCents(partnerCompCents),
        marketing: fromCents(marketingCents),
        occupancy: fromCents(occupancyCents),
        utilities: fromCents(utilitiesCents),
        software: fromCents(softwareCents),
        accounting: fromCents(accountingCents),
        infrastructure: fromCents(infraCents),
        administrative: fromCents(adminCents),
        other: fromCents(opOtherCents),
        total: fromCents(opTotalCents),
      },
      financialResult: {
        financialIncome: fromCents(finIncCents),
        financialExpenses: fromCents(finExpCents),
        total: fromCents(finTotalCents),
      },
      otherResult: {
        otherIncome: 0,
        otherExpenses: 0,
        total: fromCents(otherTotalCents),
      },
      netManagerialResult: fromCents(netResultCents),
      netManagerialMarginPercent: netMarginPercent,
      status,
      dataQuality: {
        isProvisional,
        financiallyClosed,
        pendingAccruals,
        ...(pendingReviewList.length > 0 ? { pendingReview: pendingReviewList } : {}),
        dreClassificationCoveragePercent: coveragePercent,
        unknownAmount: fromCents(unknownCents),
      },
    };
  });
}

export function calculateDreSummary(
  months: DreMonthlyItemDto[],
  period: { from: string; to: string },
): DreSummaryDto {
  let revCents = 0;
  let cogsCents = 0;
  let grossCents = 0;

  let payFeesCents = 0;
  let taxesCents = 0;
  let freightCents = 0;
  let salesCommCents = 0;
  let varOtherCents = 0;
  let varTotalCents = 0;

  let cmCents = 0;

  let personnelCents = 0;
  let partnerCompCents = 0;
  let marketingCents = 0;
  let occupancyCents = 0;
  let utilitiesCents = 0;
  let softwareCents = 0;
  let accountingCents = 0;
  let infraCents = 0;
  let adminCents = 0;
  let opOtherCents = 0;
  let opTotalCents = 0;

  let finIncCents = 0;
  let finExpCents = 0;
  let finTotalCents = 0;

  let otherIncCents = 0;
  let otherExpCents = 0;
  let otherTotalCents = 0;

  let netResultCents = 0;
  let unknownCents = 0;

  let lastClosedMonth: string | null = null;
  const pendingAccrualsSet = new Set<string>();

  for (const m of months) {
    revCents += toCents(m.realizedRevenue);
    cogsCents += toCents(m.estimatedCOGS);
    grossCents += toCents(m.estimatedGrossProfit);

    payFeesCents += toCents(m.variableExpenses.paymentFees);
    taxesCents += toCents(m.variableExpenses.taxesOnRevenue);
    freightCents += toCents(m.variableExpenses.freightLogistics);
    salesCommCents += toCents(m.variableExpenses.salesCommissions);
    varOtherCents += toCents(m.variableExpenses.other);
    varTotalCents += toCents(m.variableExpenses.total);

    cmCents += toCents(m.contributionMargin);

    personnelCents += toCents(m.operatingExpenses.personnel);
    partnerCompCents += toCents(m.operatingExpenses.partnerCompensation);
    marketingCents += toCents(m.operatingExpenses.marketing);
    occupancyCents += toCents(m.operatingExpenses.occupancy);
    utilitiesCents += toCents(m.operatingExpenses.utilities);
    softwareCents += toCents(m.operatingExpenses.software);
    accountingCents += toCents(m.operatingExpenses.accounting);
    infraCents += toCents(m.operatingExpenses.infrastructure);
    adminCents += toCents(m.operatingExpenses.administrative);
    opOtherCents += toCents(m.operatingExpenses.other);
    opTotalCents += toCents(m.operatingExpenses.total);

    finIncCents += toCents(m.financialResult.financialIncome);
    finExpCents += toCents(m.financialResult.financialExpenses);
    finTotalCents += toCents(m.financialResult.total);

    otherIncCents += toCents(m.otherResult.otherIncome);
    otherExpCents += toCents(m.otherResult.otherExpenses);
    otherTotalCents += toCents(m.otherResult.total);

    netResultCents += toCents(m.netManagerialResult);
    unknownCents += toCents(m.dataQuality.unknownAmount);

    if (m.dataQuality.financiallyClosed) {
      if (!lastClosedMonth || m.month > lastClosedMonth) {
        lastClosedMonth = m.month;
      }
    }

    m.dataQuality.pendingAccruals.forEach((p) => pendingAccrualsSet.add(p));
  }

  const grossMarginPercent =
    revCents > 0 ? r2((fromCents(grossCents) / fromCents(revCents)) * 100) : null;
  const cmPercent =
    revCents > 0 ? r2((fromCents(cmCents) / fromCents(revCents)) * 100) : null;
  const netMarginPercent =
    revCents > 0 ? r2((fromCents(netResultCents) / fromCents(revCents)) * 100) : null;

  const status =
    netResultCents > 0 ? "PROFIT" : netResultCents < 0 ? "LOSS" : "BREAK_EVEN";

  const totalEligibleCents = varTotalCents + opTotalCents + finExpCents;
  const totalAllCents = totalEligibleCents + unknownCents;
  const coveragePercent =
    totalAllCents > 0
      ? r2((fromCents(totalEligibleCents) / fromCents(totalAllCents)) * 100)
      : 100;

  const isProvisional = months.some((m) => m.dataQuality.isProvisional);
  const financiallyClosed = months.length > 0 && months.every((m) => m.dataQuality.financiallyClosed);

  const totals: DreSummaryTotalsDto = {
    realizedRevenue: fromCents(revCents),
    estimatedCOGS: fromCents(cogsCents),
    estimatedGrossProfit: fromCents(grossCents),
    estimatedGrossMarginPercent: grossMarginPercent,
    variableExpenses: {
      paymentFees: fromCents(payFeesCents),
      taxesOnRevenue: fromCents(taxesCents),
      freightLogistics: fromCents(freightCents),
      salesCommissions: fromCents(salesCommCents),
      other: fromCents(varOtherCents),
      total: fromCents(varTotalCents),
    },
    contributionMargin: fromCents(cmCents),
    contributionMarginPercent: cmPercent,
    operatingExpenses: {
      personnel: fromCents(personnelCents),
      partnerCompensation: fromCents(partnerCompCents),
      marketing: fromCents(marketingCents),
      occupancy: fromCents(occupancyCents),
      utilities: fromCents(utilitiesCents),
      software: fromCents(softwareCents),
      accounting: fromCents(accountingCents),
      infrastructure: fromCents(infraCents),
      administrative: fromCents(adminCents),
      other: fromCents(opOtherCents),
      total: fromCents(opTotalCents),
    },
    financialResult: {
      financialIncome: fromCents(finIncCents),
      financialExpenses: fromCents(finExpCents),
      total: fromCents(finTotalCents),
    },
    otherResult: {
      otherIncome: fromCents(otherIncCents),
      otherExpenses: fromCents(otherExpCents),
      total: fromCents(otherTotalCents),
    },
    netManagerialResult: fromCents(netResultCents),
    netManagerialMarginPercent: netMarginPercent,
    status,
  };

  return {
    period,
    totals,
    months,
    lastClosedMonth,
    dataQuality: {
      isProvisional,
      financiallyClosed,
      pendingAccruals: Array.from(pendingAccrualsSet),
      dreClassificationCoveragePercent: coveragePercent,
      unknownAmount: fromCents(unknownCents),
    },
    disclaimer: DRE_DISCLAIMER,
  };
}

export function calculateDreBreakdown(
  classifiedRecords: DreClassificationResult[],
  period: { from: string; to: string },
  realizedRevenue: number,
  options?: DreCalculatorOptions,
): DreBreakdownDto {
  // Mapeamento de categorias e metadados
  const categoryMeta: Record<
    DreEconomicCategory,
    {
      label: string;
      group: "VARIABLE_EXPENSE" | "OPERATING_EXPENSE" | "FINANCIAL_RESULT" | "OTHER_RESULT" | "NON_DRE";
    }
  > = {
    INVENTORY_PURCHASE: { label: "Compras de Estoque para Revenda", group: "NON_DRE" },
    VARIABLE_PAYMENT_FEE: { label: "Taxas de Meio de Pagamento", group: "VARIABLE_EXPENSE" },
    VARIABLE_TAX_ON_REVENUE: { label: "Impostos s/ Vendas (DAS / ICMS)", group: "VARIABLE_EXPENSE" },
    VARIABLE_FREIGHT_LOGISTICS: { label: "Fretes s/ Vendas (Logística)", group: "VARIABLE_EXPENSE" },
    VARIABLE_SALES_COMMISSION: { label: "Comissões s/ Vendas", group: "VARIABLE_EXPENSE" },
    VARIABLE_OTHER: { label: "Outras Despesas Variáveis", group: "VARIABLE_EXPENSE" },
    OPERATING_PERSONNEL: { label: "Encargos s/ Pró-labore (GPS)", group: "OPERATING_EXPENSE" },
    OPERATING_PARTNER_COMPENSATION: { label: "Pró-labore dos Sócios", group: "OPERATING_EXPENSE" },
    OPERATING_MARKETING: { label: "Marketing e Publicidade", group: "OPERATING_EXPENSE" },
    OPERATING_OCCUPANCY: { label: "Ocupação e Aluguel", group: "OPERATING_EXPENSE" },
    OPERATING_UTILITIES: { label: "Utilidades (Energia / Internet)", group: "OPERATING_EXPENSE" },
    OPERATING_SOFTWARE: { label: "Software e Assinaturas", group: "OPERATING_EXPENSE" },
    OPERATING_ACCOUNTING: { label: "Honorários Contábeis", group: "OPERATING_EXPENSE" },
    OPERATING_INFRASTRUCTURE: { label: "Infraestrutura e Manutenção", group: "OPERATING_EXPENSE" },
    OPERATING_ADMINISTRATIVE: { label: "Despesas Administrativas", group: "OPERATING_EXPENSE" },
    OPERATING_OTHER: { label: "Outras Despesas Operacionais", group: "OPERATING_EXPENSE" },
    FINANCIAL_EXPENSE: { label: "Despesas Financeiras (Tarifas / Juros Mora)", group: "FINANCIAL_RESULT" },
    FINANCIAL_INCOME: { label: "Receitas Financeiras (Juros Recebidos / Descontos)", group: "FINANCIAL_RESULT" },
    OTHER_OPERATING_INCOME: { label: "Outras Receitas Operacionais", group: "OTHER_RESULT" },
    OTHER_OPERATING_EXPENSE: { label: "Outras Despesas Operacionais", group: "OTHER_RESULT" },
    CAPITAL_MOVEMENT: { label: "Movimentações de Capital", group: "NON_DRE" },
    TRANSFER: { label: "Transferências Internas", group: "NON_DRE" },
    UNKNOWN: { label: "Não Classificado", group: "NON_DRE" },
  };

  // Filtrar registros do período
  // Um registro pertence ao breakdown se sua data de competência (ou referenceMonth) estiver dentro do período
  const fromM = period.from.slice(0, 7);
  const toM = period.to.slice(0, 7);

  const breakdownMap = new Map<
    DreEconomicCategory,
    {
      cents: number;
      count: number;
      detailMap: Map<string, { cents: number; count: number }>;
    }
  >();

  for (const cat of Object.keys(categoryMeta) as DreEconomicCategory[]) {
    breakdownMap.set(cat, { cents: 0, count: 0, detailMap: new Map() });
  }

  for (const r of classifiedRecords) {
    if (!r.referenceMonth) continue;
    if (r.referenceMonth < fromM || r.referenceMonth > toM) continue;

    if (r.referenceMonth === toM && options?.toExclusiveDate && r.competenceDate) {
      if (r.competenceDate.getTime() >= options.toExclusiveDate.getTime()) continue;
    }
    if (r.referenceMonth === fromM && options?.fromDate && r.competenceDate) {
      if (r.competenceDate.getTime() < options.fromDate.getTime()) continue;
    }

    const entry = breakdownMap.get(r.category)!;
    const amtCents = toCents(r.baseAmount);
    entry.cents += amtCents;
    entry.count += 1;

    const desc = r.notes || "Sem descrição";
    const curDetail = entry.detailMap.get(desc) ?? { cents: 0, count: 0 };
    curDetail.cents += amtCents;
    curDetail.count += 1;
    entry.detailMap.set(desc, curDetail);

    // Ajustes financeiros
    if (r.financialAdjustment) {
      const adj = r.financialAdjustment;
      if (options?.toExclusiveDate && adj.date.getTime() >= options.toExclusiveDate.getTime()) {
        continue;
      }
      if (options?.fromDate && adj.date.getTime() < options.fromDate.getTime()) {
        continue;
      }
      const adjM = `${adj.date.getUTCFullYear()}-${String(adj.date.getUTCMonth() + 1).padStart(2, "0")}`;
      if (adjM >= fromM && adjM <= toM) {
        const adjEntry = breakdownMap.get(adj.type)!;
        const adjCents = toCents(adj.amount);
        adjEntry.cents += adjCents;
        adjEntry.count += 1;
        const adjDetail = adjEntry.detailMap.get(adj.description) ?? { cents: 0, count: 0 };
        adjDetail.cents += adjCents;
        adjDetail.count += 1;
        adjEntry.detailMap.set(adj.description, adjDetail);
      }
    }
  }

  const revCents = toCents(realizedRevenue);

  const categories: DreBreakdownItemDto[] = (
    Object.keys(categoryMeta) as DreEconomicCategory[]
  )
    .filter((cat) => {
      const e = breakdownMap.get(cat)!;
      return e.count > 0;
    })
    .map((cat) => {
      const meta = categoryMeta[cat];
      const entry = breakdownMap.get(cat)!;
      const amt = fromCents(entry.cents);
      const share = revCents > 0 ? r2((amt / fromCents(revCents)) * 100) : null;

      const details: DreBreakdownCategoryDetail[] = Array.from(entry.detailMap.entries()).map(
        ([desc, d]) => ({
          description: desc,
          amount: fromCents(d.cents),
          recordCount: d.count,
        }),
      );

      return {
        economicCategory: cat,
        label: meta.label,
        group: meta.group,
        amount: amt,
        shareOfRevenuePercent: share,
        recordCount: entry.count,
        details,
      };
    });

  return {
    period,
    realizedRevenue,
    categories,
    disclaimer: DRE_DISCLAIMER,
  };
}
