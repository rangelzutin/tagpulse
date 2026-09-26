export interface RawTagPlusDepartment {
  id?: number | string | null;
  descricao?: string | null;
  description?: string | null;
  nome?: string | null;
  [key: string]: unknown;
}

export interface NormalizedDepartment {
  sourceId: string;
  description: string;
}

export function normalizeTagPlusDepartment(
  raw: RawTagPlusDepartment,
): NormalizedDepartment {
  if (raw.id === undefined || raw.id === null) {
    throw new Error("Department missing required identifier: id");
  }

  const sourceId = String(raw.id).trim();
  if (!sourceId) {
    throw new Error("Department id cannot be empty");
  }

  const description =
    typeof raw.descricao === "string" && raw.descricao.trim()
      ? raw.descricao.trim()
      : typeof raw.description === "string" && raw.description.trim()
        ? raw.description.trim()
        : typeof raw.nome === "string" && raw.nome.trim()
          ? raw.nome.trim()
          : "";

  return {
    sourceId,
    description,
  };
}
