export interface RawTagPlusBankAccount {
  id?: number | string | null;
  descricao?: string | null;
  description?: string | null;
  nome?: string | null;
  [key: string]: unknown;
}

export interface NormalizedBankAccount {
  sourceId: string;
  description: string;
  rawDetails: Record<string, unknown> | null;
}

function sanitizeRawDetails(obj: unknown): unknown {
  if (obj == null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeRawDetails);

  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (
      lower.includes("secret") ||
      lower.includes("token") ||
      lower.includes("password") ||
      lower.includes("senha")
    ) {
      continue;
    }
    clean[key] = sanitizeRawDetails(value);
  }
  return clean;
}

export function normalizeTagPlusBankAccount(
  raw: RawTagPlusBankAccount,
): NormalizedBankAccount {
  if (raw.id === undefined || raw.id === null) {
    throw new Error("BankAccount missing required identifier: id");
  }

  const sourceId = String(raw.id).trim();
  if (!sourceId) {
    throw new Error("BankAccount id cannot be empty");
  }

  const description =
    typeof raw.descricao === "string" && raw.descricao.trim()
      ? raw.descricao.trim()
      : typeof raw.description === "string" && raw.description.trim()
        ? raw.description.trim()
        : typeof raw.nome === "string" && raw.nome.trim()
          ? raw.nome.trim()
          : "";

  // Collect other raw properties into rawDetails without inventing columns
  // Also recursively sanitize any sensitive credentials/tokens/secrets
  const rawDetails: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (
      key !== "id" &&
      key !== "descricao" &&
      key !== "description" &&
      key !== "nome"
    ) {
      const sanitized = sanitizeRawDetails(value);
      if (sanitized !== undefined) {
        rawDetails[key] = sanitized;
      }
    }
  }

  return {
    sourceId,
    description,
    rawDetails: Object.keys(rawDetails).length > 0 ? rawDetails : null,
  };
}
