import type {
  AbcClass,
  ProfitabilityMarginTier,
  ShapeCommercialSize,
} from "./bi-types.js";
import type { FlatCategoryInfo } from "./bi-profitability-calculator.js";

export const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Limpa prefixos ordenadores legados do ERP TagPlus (ex: "1 - ", "2- ", "3 - ", "X - ").
 */
export function sanitizeCommercialLine(
  description: string | null | undefined,
): string {
  if (!description) return "SEM LINHA";
  const cleaned = description
    .trim()
    .replace(/^(?:[0-9]+|[A-Za-z])\s*[-–]\s*/, "")
    .trim();
  return cleaned || "SEM LINHA";
}

/**
 * Percorre recursivamente os ancestrais de uma categoria até a raiz e extrai a linha comercial.
 */
export function resolveCommercialLine(
  categorySourceId: string | null | undefined,
  categoryMap: Map<string, FlatCategoryInfo>,
): string {
  if (!categorySourceId || !categoryMap.has(categorySourceId)) {
    return "SEM LINHA";
  }

  let curr = categoryMap.get(categorySourceId)!;
  const visited = new Set<string>([curr.sourceId]);

  while (curr.parentSourceId && categoryMap.has(curr.parentSourceId)) {
    const parent = categoryMap.get(curr.parentSourceId)!;
    if (visited.has(parent.sourceId)) break; // Proteção contra ciclos
    visited.add(parent.sourceId);
    curr = parent;
  }

  return sanitizeCommercialLine(curr.description);
}

/**
 * Identifica deterministicamente se um produto pertence à categoria / universo de Shapes.
 */
export function isShapeProduct(
  description: string | null | undefined,
  categoryDescription: string | null | undefined,
): boolean {
  const text = `${description || ""} ${categoryDescription || ""}`;
  return /\bSHAPES?\b/i.test(text);
}

/**
 * Parser determinístico para tamanhos comerciais de Shape.
 * Mapeamentos homologados:
 * 7.75 / 7 3/4 -> "7.7"
 * 7.875 / 7 7/8 -> "7.8"
 * 8.0 / 8.00 -> "8.0"
 * 8.125 / 8 1/8 -> "8.1"
 * 8.25 / 8 1/4 -> "8.2"
 * 8.5 / 8.50 / 8 1/2 -> "8.5"
 * Outras medidas detectáveis -> "OTHER"
 * Shape sem medida detectável -> "UNCLASSIFIED"
 * Não-shape -> null
 */
export function parseShapeCommercialSize(
  description: string | null | undefined,
  categoryDescription: string | null | undefined,
): ShapeCommercialSize | null {
  if (!isShapeProduct(description, categoryDescription)) {
    return null;
  }

  const desc = description || "";

  // 1. Frações explícitas (ex: 7 3/4, 7 7/8, 8 1/8, 8 1/4, 8 1/2)
  const fractionMatch = desc.match(
    /(?:^|[\s"'])(\b[789])\s*([1357]\/[248])(?:[\s"']|$)/i,
  );
  if (fractionMatch && fractionMatch[1] && fractionMatch[2]) {
    const whole = Number(fractionMatch[1]);
    const fractionParts = fractionMatch[2].split("/");
    const num = Number(fractionParts[0]);
    const den = Number(fractionParts[1]);
    if (!Number.isNaN(whole) && !Number.isNaN(num) && !Number.isNaN(den) && den > 0) {
      const val = whole + num / den;

      if (Math.abs(val - 7.75) < 0.001) return "7.7";
      if (Math.abs(val - 7.875) < 0.001) return "7.8";
      if (Math.abs(val - 8.125) < 0.001) return "8.1";
      if (Math.abs(val - 8.25) < 0.001) return "8.2";
      if (Math.abs(val - 8.5) < 0.001) return "8.5";
      return "OTHER";
    }
  }

  // 2. Decimais comuns com 1 a 3 casas decimais
  const decimalMatch = desc.match(
    /(?:^|[\s"']|[xX-])(\b[789]\.(?:[0-9]{1,3}))(?:[\s"']|[xX-]|$)/i,
  );
  if (decimalMatch && decimalMatch[1]) {
    const val = parseFloat(decimalMatch[1]);
    if (!Number.isNaN(val)) {
      if (Math.abs(val - 7.7) < 0.001 || Math.abs(val - 7.75) < 0.001) return "7.7";
      if (Math.abs(val - 7.8) < 0.001 || Math.abs(val - 7.875) < 0.001) return "7.8";
      if (Math.abs(val - 8.0) < 0.001 || Math.abs(val - 8) < 0.001) return "8.0";
      if (Math.abs(val - 8.1) < 0.001 || Math.abs(val - 8.125) < 0.001) return "8.1";
      if (Math.abs(val - 8.2) < 0.001 || Math.abs(val - 8.25) < 0.001) return "8.2";
      if (Math.abs(val - 8.5) < 0.001) return "8.5";
      return "OTHER";
    }
  }

  // 3. Casos como "8.0", "8.2" com vírgula (ex: 8,0 / 8,25)
  const commaMatch = desc.match(
    /(?:^|[\s"']|[xX-])(\b[789],(?:[0-9]{1,3}))(?:[\s"']|[xX-]|$)/i,
  );
  if (commaMatch && commaMatch[1]) {
    const val = parseFloat(commaMatch[1].replace(",", "."));
    if (!Number.isNaN(val)) {
      if (Math.abs(val - 7.7) < 0.001 || Math.abs(val - 7.75) < 0.001) return "7.7";
      if (Math.abs(val - 7.8) < 0.001 || Math.abs(val - 7.875) < 0.001) return "7.8";
      if (Math.abs(val - 8.0) < 0.001 || Math.abs(val - 8) < 0.001) return "8.0";
      if (Math.abs(val - 8.1) < 0.001 || Math.abs(val - 8.125) < 0.001) return "8.1";
      if (Math.abs(val - 8.2) < 0.001 || Math.abs(val - 8.25) < 0.001) return "8.2";
      if (Math.abs(val - 8.5) < 0.001) return "8.5";
      return "OTHER";
    }
  }

  // 4. Caso inteiro específico " 8 " ou " 8\""
  const integerMatch = desc.match(/(?:^|[\s"'])(\b8\b)(?:["']|[\s]|$)/i);
  if (integerMatch) {
    return "8.0";
  }

  return "UNCLASSIFIED";
}

/**
 * Atribui classes ABC baseadas em percentual acumulado de receita realizada (80% / 15% / 5%).
 * Os itens já devem estar ordenados por realizedRevenue DESC.
 */
export function calculateAbcClasses<
  T extends { realizedRevenue: number; abcClass?: AbcClass | null },
>(items: T[], totalRealizedRevenue: number): void {
  if (totalRealizedRevenue <= 0) {
    for (const item of items) {
      item.abcClass = null;
    }
    return;
  }

  let prevCumulativeRevenue = 0;
  for (const item of items) {
    if (item.realizedRevenue <= 0) {
      item.abcClass = null;
      continue;
    }
    const prevShare = (prevCumulativeRevenue / totalRealizedRevenue) * 100;
    if (prevShare < 80) {
      item.abcClass = "A";
    } else if (prevShare < 95) {
      item.abcClass = "B";
    } else {
      item.abcClass = "C";
    }
    prevCumulativeRevenue += item.realizedRevenue;
  }
}

/**
 * Categoriza uma margem percentual em faixas padronizadas (Margin Tiers).
 */
export function classifyMarginTier(
  margin: number | null | undefined,
): ProfitabilityMarginTier {
  if (margin === null || margin === undefined || Number.isNaN(margin)) {
    return "UNKNOWN";
  }
  if (margin < 0) {
    return "NEGATIVE";
  }
  if (margin < 20) {
    return "ZERO_TO_20";
  }
  if (margin < 40) {
    return "TWENTY_TO_40";
  }
  return "FORTY_PLUS";
}

/**
 * Helper canônico para cálculo dos 7 indicadores de rentabilidade de uma entidade ou resumo.
 */
export function computeProfitabilityItemMetrics(
  rawRealizedRevenue: number,
  rawRevenueWithCurrentCost: number,
  rawEstimatedCOGS: number,
  hasKnownCost: boolean = true,
): {
  realizedRevenue: number;
  revenueWithCurrentCost: number;
  revenueWithoutCurrentCost: number;
  costCoveragePercent: number | null;
  estimatedCOGS: number | null;
  estimatedGrossProfit: number | null;
  estimatedGrossMarginPercent: number | null;
} {
  const realizedRevenue = round2(rawRealizedRevenue);
  const revenueWithCurrentCost = round2(rawRevenueWithCurrentCost);
  const revenueWithoutCurrentCost = round2(realizedRevenue - revenueWithCurrentCost);

  const costCoveragePercent =
    realizedRevenue > 0
      ? round2((revenueWithCurrentCost / realizedRevenue) * 100)
      : null;

  if (hasKnownCost) {
    const estimatedCOGS = round2(rawEstimatedCOGS);
    const estimatedGrossProfit = round2(revenueWithCurrentCost - estimatedCOGS);
    const estimatedGrossMarginPercent =
      revenueWithCurrentCost > 0
        ? round2((estimatedGrossProfit / revenueWithCurrentCost) * 100)
        : null;

    return {
      realizedRevenue,
      revenueWithCurrentCost,
      revenueWithoutCurrentCost,
      costCoveragePercent,
      estimatedCOGS,
      estimatedGrossProfit,
      estimatedGrossMarginPercent,
    };
  }

  return {
    realizedRevenue,
    revenueWithCurrentCost,
    revenueWithoutCurrentCost,
    costCoveragePercent,
    estimatedCOGS: null,
    estimatedGrossProfit: null,
    estimatedGrossMarginPercent: null,
  };
}
