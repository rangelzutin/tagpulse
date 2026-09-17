export interface RawTagPlusCategory {
  id?: number | string | null;
  descricao?: string | null;
  categoria_mae?: {
    id?: number | string | null;
    descricao?: string | null;
  } | null;
  tipo?: string | null;
  localizacao?: string | null;
  atributos?: unknown[] | null;
  [key: string]: unknown;
}

export interface NormalizedCategory {
  sourceId: string;
  description: string;
  parentSourceId: string | null;
  type: string | null;
  location: string | null;
}

export function normalizeTagPlusCategory(
  raw: RawTagPlusCategory,
): NormalizedCategory {
  if (raw.id === undefined || raw.id === null) {
    throw new Error("Category missing required identifier: id");
  }

  const sourceId = String(raw.id).trim();
  if (!sourceId) {
    throw new Error("Category id cannot be empty");
  }

  const description =
    typeof raw.descricao === "string" ? raw.descricao.trim() : "";

  let parentSourceId: string | null = null;
  if (
    raw.categoria_mae &&
    raw.categoria_mae.id !== undefined &&
    raw.categoria_mae.id !== null
  ) {
    const parentIdStr = String(raw.categoria_mae.id).trim();
    if (parentIdStr && parentIdStr !== "0") {
      parentSourceId = parentIdStr;
    }
  }

  const type =
    typeof raw.tipo === "string" && raw.tipo.trim() ? raw.tipo.trim() : null;
  const location =
    typeof raw.localizacao === "string" && raw.localizacao.trim()
      ? raw.localizacao.trim()
      : null;

  return {
    sourceId,
    description,
    parentSourceId,
    type,
    location,
  };
}
