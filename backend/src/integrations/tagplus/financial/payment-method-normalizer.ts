export interface RawTagPlusPaymentMethod {
  id?: number | string | null;
  descricao?: string | null;
  description?: string | null;
  ativo?: boolean | null;
  active?: boolean | null;
  picpay_token?: unknown;
  vinculo?: unknown;
  [key: string]: unknown;
}

export interface NormalizedPaymentMethod {
  sourceId: string;
  description: string;
  sourceActive: boolean;
}

export function normalizeTagPlusPaymentMethod(
  raw: RawTagPlusPaymentMethod,
): NormalizedPaymentMethod {
  if (raw.id === undefined || raw.id === null) {
    throw new Error("PaymentMethod missing required identifier: id");
  }

  const sourceId = String(raw.id).trim();
  if (!sourceId) {
    throw new Error("PaymentMethod id cannot be empty");
  }

  const description =
    typeof raw.descricao === "string" && raw.descricao.trim()
      ? raw.descricao.trim()
      : typeof raw.description === "string" && raw.description.trim()
        ? raw.description.trim()
        : "";

  // Guardrail: preserve active/ativo. Default to true unless explicitly false.
  const sourceActive =
    raw.ativo !== undefined && raw.ativo !== null
      ? Boolean(raw.ativo)
      : raw.active !== undefined && raw.active !== null
        ? Boolean(raw.active)
        : true;

  // IMPORTANT: picpay_token and other secrets are intentionally excluded and never stored!

  return {
    sourceId,
    description,
    sourceActive,
  };
}
