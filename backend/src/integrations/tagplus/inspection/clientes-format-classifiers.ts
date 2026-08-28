export type DocumentFormatClass =
  | "CPF_STANDARD_PUNCTUATED"
  | "CPF_DIGITS_ONLY"
  | "CNPJ_STANDARD_PUNCTUATED"
  | "CNPJ_DIGITS_ONLY"
  | "EMPTY"
  | "OTHER"
  | "OTHER_TYPE";

export type EmailFormatClass =
  "EMPTY" | "EMAIL_LIKE" | "NON_EMAIL_STRING" | "OTHER_TYPE";

export type PhoneFormatClass =
  | "EMPTY"
  | "PHONE_DIGITS_ONLY"
  | "PHONE_FORMATTED"
  | "PHONE_OTHER"
  | "OTHER_TYPE";

export type DateFormatClass =
  | "DATE_ONLY"
  | "DATETIME_WITH_TIMEZONE"
  | "DATETIME_WITHOUT_TIMEZONE"
  | "EMPTY"
  | "INVALID_OR_UNCLASSIFIED"
  | "OTHER_TYPE";

export function classifyCpf(value: unknown): DocumentFormatClass {
  return classifyDocument(value, "cpf");
}

export function classifyCnpj(value: unknown): DocumentFormatClass {
  return classifyDocument(value, "cnpj");
}

export function classifyEmail(value: unknown): EmailFormatClass {
  if (typeof value !== "string") return "OTHER_TYPE";
  const candidate = value.trim();
  if (candidate.length === 0) return "EMPTY";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)
    ? "EMAIL_LIKE"
    : "NON_EMAIL_STRING";
}

export function classifyPhone(value: unknown): PhoneFormatClass {
  if (typeof value !== "string") return "OTHER_TYPE";
  const candidate = value.trim();
  if (candidate.length === 0) return "EMPTY";
  if (/^\d+$/.test(candidate)) return "PHONE_DIGITS_ONLY";
  if (/^[+()\d.\s-]+$/.test(candidate) && /\d/.test(candidate))
    return "PHONE_FORMATTED";
  return "PHONE_OTHER";
}

export function classifyDate(value: unknown): DateFormatClass {
  if (typeof value !== "string") return "OTHER_TYPE";
  const candidate = value.trim();
  if (candidate.length === 0) return "EMPTY";
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate))
    return validDate(candidate) ? "DATE_ONLY" : "INVALID_OR_UNCLASSIFIED";
  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      candidate,
    )
  )
    return validDate(candidate)
      ? "DATETIME_WITH_TIMEZONE"
      : "INVALID_OR_UNCLASSIFIED";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(candidate))
    return validDate(`${candidate}Z`)
      ? "DATETIME_WITHOUT_TIMEZONE"
      : "INVALID_OR_UNCLASSIFIED";
  return "INVALID_OR_UNCLASSIFIED";
}

function classifyDocument(
  value: unknown,
  kind: "cpf" | "cnpj",
): DocumentFormatClass {
  if (typeof value !== "string") return "OTHER_TYPE";
  const candidate = value.trim();
  if (candidate.length === 0) return "EMPTY";
  if (/^\d+$/.test(candidate))
    return kind === "cpf" ? "CPF_DIGITS_ONLY" : "CNPJ_DIGITS_ONLY";
  const standard =
    kind === "cpf"
      ? /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(candidate)
      : /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(candidate);
  if (standard)
    return kind === "cpf"
      ? "CPF_STANDARD_PUNCTUATED"
      : "CNPJ_STANDARD_PUNCTUATED";
  return "OTHER";
}

function validDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}
