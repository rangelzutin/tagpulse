export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDefaultPeriod(): { from: string; to: string } {
  const now = new Date();
  const year = now.getFullYear();
  return {
    from: `${year}-01-01`,
    to: getLocalDateString(now),
  };
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

const MONTH_NAMES = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

export function formatMonthLabel(monthKey: string): string {
  // Format: "YYYY-MM"
  const parts = monthKey.split("-");
  if (parts.length === 2) {
    const monthIndex = parseInt(parts[1], 10) - 1;
    const yearShort = parts[0].slice(-2);
    if (monthIndex >= 0 && monthIndex < 12) {
      return `${MONTH_NAMES[monthIndex]}/${yearShort}`;
    }
  }
  return monthKey;
}

export function formatFullMonthName(monthKey: string): string {
  const parts = monthKey.split("-");
  if (parts.length === 2) {
    const monthIndex = parseInt(parts[1], 10) - 1;
    const year = parts[0];
    const fullNames = [
      "Janeiro",
      "Fevereiro",
      "Março",
      "Abril",
      "Maio",
      "Junho",
      "Julho",
      "Agosto",
      "Setembro",
      "Outubro",
      "Novembro",
      "Dezembro",
    ];
    if (monthIndex >= 0 && monthIndex < 12) {
      return `${fullNames[monthIndex]} de ${year}`;
    }
  }
  return monthKey;
}

export function formatPercent(value: number, decimals = 1): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "0,0%";
  }
  return (
    new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value) + "%"
  );
}

export function formatCompactCurrency(value: number): string {
  if (typeof value !== "number" || Number.isNaN(value) || value === 0) {
    return "R$ 0";
  }
  if (Math.abs(value) >= 1_000_000) {
    const formatted = (value / 1_000_000).toLocaleString("pt-BR", {
      maximumFractionDigits: 1,
    });
    return `R$ ${formatted}M`;
  }
  if (Math.abs(value) >= 1_000) {
    const formatted = (value / 1_000).toLocaleString("pt-BR", {
      maximumFractionDigits: 0,
    });
    return `R$ ${formatted}k`;
  }
  return formatCurrency(value);
}

export function parseIsoDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDisplayDate(isoDate: string): string {
  if (!isoDate) return "";
  const parts = isoDate.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate;
}

export interface ParsedDisplayDateResult {
  isValid: boolean;
  isoDate?: string;
  date?: Date;
  error?: string;
}

export function parseDisplayDate(displayDate: string): ParsedDisplayDateResult {
  if (!displayDate || typeof displayDate !== "string") {
    return { isValid: false, error: "Data vazia ou inválida." };
  }

  const trimmed = displayDate.trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!match) {
    return { isValid: false, error: "Formato de data inválido. Use DD/MM/AAAA." };
  }

  const d = parseInt(match[1]!, 10);
  const m = parseInt(match[2]!, 10);
  const y = parseInt(match[3]!, 10);

  if (d < 1 || d > 31) {
    return { isValid: false, error: "Dia inválido." };
  }
  if (m < 1 || m > 12) {
    return { isValid: false, error: "Mês inválido (use 01 a 12)." };
  }
  if (y < 1900 || y > 2100) {
    return { isValid: false, error: "Ano fora do intervalo permitido." };
  }

  const isLeapYear = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const daysInMonth = [
    31,
    isLeapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  const maxDays = daysInMonth[m - 1]!;

  if (d > maxDays) {
    return {
      isValid: false,
      error: `Dia ${d} não existe no mês ${String(m).padStart(2, "0")}/${y}.`,
    };
  }

  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  const isoDate = `${y}-${mm}-${dd}`;
  const date = new Date(y, m - 1, d);

  return {
    isValid: true,
    isoDate,
    date,
  };
}

export function maskDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export interface ManualPeriodValidation {
  canApply: boolean;
  error: string | null;
  fromIso?: string;
  toIso?: string;
}

export function validateManualPeriodInput(
  draftFrom: string,
  draftTo: string,
  mode: "range" | "allUpTo",
  minDate?: string | null,
): ManualPeriodValidation {
  if (mode === "allUpTo") {
    if (!minDate || !draftTo || draftTo.length < 10) {
      return { canApply: false, error: null };
    }
    const pTo = parseDisplayDate(draftTo);
    if (!pTo.isValid) {
      return { canApply: false, error: `Data final: ${pTo.error}` };
    }
    if (minDate > pTo.isoDate!) {
      return {
        canApply: false,
        error: "A data final deve ser posterior ou igual ao início da base.",
      };
    }
    return {
      canApply: true,
      error: null,
      fromIso: minDate,
      toIso: pTo.isoDate,
    };
  }

  // Normal range mode
  if (!draftFrom || draftFrom.length < 10 || !draftTo || draftTo.length < 10) {
    return { canApply: false, error: null };
  }

  const pFrom = parseDisplayDate(draftFrom);
  if (!pFrom.isValid) {
    return { canApply: false, error: `Data inicial: ${pFrom.error}` };
  }

  const pTo = parseDisplayDate(draftTo);
  if (!pTo.isValid) {
    return { canApply: false, error: `Data final: ${pTo.error}` };
  }

  if (pFrom.isoDate! > pTo.isoDate!) {
    return {
      canApply: false,
      error: "A data inicial deve ser anterior ou igual à data final.",
    };
  }

  return {
    canApply: true,
    error: null,
    fromIso: pFrom.isoDate,
    toIso: pTo.isoDate,
  };
}

const LOWERCASE_WORDS = new Set(["de", "da", "do", "das", "dos", "e"]);

const KNOWN_ACRONYMS = new Set([
  "DGS",
  "LTDA",
  "ME",
  "EPP",
  "MEI",
  "EIRELI",
  "SA",
  "S/A",
  "S.A.",
  "SS",
  "S/S",
  "SPE",
  "CIA",
  "C&A",
  "CNPJ",
  "CPF",
  // Brazilian state codes (UF)
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);

const ROMAN_NUMERALS = new Set([
  "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX",
]);

function formatCoreToken(token: string, index: number, totalWords: number): string {
  if (!token) return "";
  if (!/\p{L}/u.test(token)) return token;

  const upper = token.toUpperCase();
  if (KNOWN_ACRONYMS.has(upper) || ROMAN_NUMERALS.has(upper)) {
    return upper;
  }

  // Preserve short acronyms without vowels (e.g. DGS, XP, KTM)
  const letters = token.replace(/[^\p{L}]/gu, "");
  const hasVowels = /[aeiouyáàâãéêíóôõúü]/i.test(letters);
  if (letters.length >= 2 && letters.length <= 4 && !hasVowels) {
    return upper;
  }

  // Prepositions / conjunctions in Portuguese
  const lower = token.toLowerCase();
  if (LOWERCASE_WORDS.has(lower)) {
    if (index > 0 && !(lower === "e" && index === totalWords - 1)) {
      return lower;
    }
  }

  // Standard Title Case
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function formatCustomerWord(word: string, index: number, totalWords: number): string {
  if (!word) return "";

  let start = 0;
  while (start < word.length && !/\p{L}|\p{N}/u.test(word[start]!)) {
    start++;
  }
  let end = word.length;
  while (end > start && !/\p{L}|\p{N}/u.test(word[end - 1]!)) {
    end--;
  }

  const prefix = word.slice(0, start);
  const core = word.slice(start, end);
  const suffix = word.slice(end);

  if (!core) {
    return word;
  }

  const upperCore = core.toUpperCase();
  if (KNOWN_ACRONYMS.has(upperCore) || ROMAN_NUMERALS.has(upperCore)) {
    return prefix + upperCore + suffix;
  }

  if (core.includes("-")) {
    const parts = core.split("-");
    const formatted = parts
      .map((part) => formatCoreToken(part, index, totalWords))
      .join("-");
    return prefix + formatted + suffix;
  }

  if (core.includes("'")) {
    const parts = core.split("'");
    const formatted = parts
      .map((part) => formatCoreToken(part, index, totalWords))
      .join("'");
    return prefix + formatted + suffix;
  }

  if (core.includes("/")) {
    const parts = core.split("/");
    const formatted = parts
      .map((part) => formatCoreToken(part, index, totalWords))
      .join("/");
    return prefix + formatted + suffix;
  }

  return prefix + formatCoreToken(core, index, totalWords) + suffix;
}

export function formatCustomerName(name?: string | null): string {
  if (!name || typeof name !== "string") {
    return "";
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return "";
  }
  const words = trimmed.split(/\s+/);
  return words
    .map((w, idx) => formatCustomerWord(w, idx, words.length))
    .join(" ");
}

export function formatCpfCnpj(value?: string | null): string {
  if (!value) return "—";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  return value.trim() || "—";
}

export function formatDateBr(isoDate?: string | null): string {
  if (!isoDate) return "—";
  const parts = isoDate.slice(0, 10).split("-");
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
