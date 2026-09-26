export interface RawTagPlusBudgetPlan {
  id?: number | string | null;
  descricao?: string | null;
  nome?: string | null;
  tipo?: string | null;
  posicao?: string | number | null;
  protegido?: boolean | null;
  pai?: {
    id?: number | string | null;
    descricao?: string | null;
  } | null;
  pai_id?: number | string | null;
  parent_id?: number | string | null;
  classificacao_dre?: unknown;
  source_dre_classification?: unknown;
  [key: string]: unknown;
}

export interface NormalizedBudgetPlan {
  sourceId: string;
  parentSourceId: string | null;
  type: string | null;
  description: string;
  position: string | null;
  isProtected: boolean;
  sourceDreClassification: unknown | null;
}

export function normalizeTagPlusBudgetPlan(
  raw: RawTagPlusBudgetPlan,
): NormalizedBudgetPlan {
  if (raw.id === undefined || raw.id === null) {
    throw new Error("FinancialBudgetPlan missing required identifier: id");
  }

  const sourceId = String(raw.id).trim();
  if (!sourceId) {
    throw new Error("FinancialBudgetPlan id cannot be empty");
  }

  const description =
    typeof raw.descricao === "string" && raw.descricao.trim()
      ? raw.descricao.trim()
      : typeof raw.nome === "string" && raw.nome.trim()
        ? raw.nome.trim()
        : "";

  let parentSourceId: string | null = null;
  if (raw.pai && typeof raw.pai === "object" && raw.pai.id != null) {
    const pId = String(raw.pai.id).trim();
    if (pId && pId !== "0") {
      parentSourceId = pId;
    }
  } else if (raw.pai_id != null) {
    const pId = String(raw.pai_id).trim();
    if (pId && pId !== "0") {
      parentSourceId = pId;
    }
  } else if (raw.parent_id != null) {
    const pId = String(raw.parent_id).trim();
    if (pId && pId !== "0") {
      parentSourceId = pId;
    }
  }

  const type =
    typeof raw.tipo === "string" && raw.tipo.trim()
      ? raw.tipo.trim().toUpperCase()
      : null;

  // IMPORTANT: position MUST be preserved as String (e.g. "1", "1.1", "2.10")
  let position: string | null = null;
  if (raw.posicao !== undefined && raw.posicao !== null) {
    const posStr = String(raw.posicao).trim();
    if (posStr) {
      position = posStr;
    }
  }

  const isProtected = Boolean(raw.protegido);

  let sourceDreClassification: unknown = null;
  if (raw.classificacao_dre !== undefined && raw.classificacao_dre !== null) {
    sourceDreClassification = raw.classificacao_dre;
  } else if (
    raw.source_dre_classification !== undefined &&
    raw.source_dre_classification !== null
  ) {
    sourceDreClassification = raw.source_dre_classification;
  }

  return {
    sourceId,
    parentSourceId,
    type,
    description,
    position,
    isProtected,
    sourceDreClassification,
  };
}
