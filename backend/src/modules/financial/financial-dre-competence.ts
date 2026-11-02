/**
 * Retorna a string YYYY-MM para a data fornecida em UTC.
 */
export function getMonthStr(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Retorna a string YYYY-MM do mês imediatamente anterior à data fornecida em UTC.
 * Exemplo: 2026-02-20 -> 2026-01
 */
export function getPreviousMonthStr(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-indexed: 0 = Jan, 1 = Fev...
  if (month === 0) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Determina a competência canônica de um registro do DAS (Simples Nacional).
 * Regra definitiva: parte exclusivamente de dueDate -> previousMonth(dueDate).
 */
export function resolveDasCompetence(record: {
  sourceId: string;
  dueDate?: Date | null | undefined;
  confirmationDate?: Date | null | undefined;
  sourceCompetenceDate?: Date | null | undefined;
}): { referenceMonth: string | null; requiresReview: boolean } {
  if (!record.dueDate || isNaN(record.dueDate.getTime())) {
    return { referenceMonth: null, requiresReview: true };
  }

  return {
    referenceMonth: getPreviousMonthStr(record.dueDate),
    requiresReview: false,
  };
}

/**
 * Determina a competência canônica de um registro de GPS / INSS.
 * Regra definitiva: parte exclusivamente de dueDate -> previousMonth(dueDate).
 */
export function resolveGpsCompetence(record: {
  sourceId: string;
  dueDate?: Date | null | undefined;
  sourceCompetenceDate?: Date | null | undefined;
}): { referenceMonth: string | null; requiresReview: boolean } {
  if (!record.dueDate || isNaN(record.dueDate.getTime())) {
    return { referenceMonth: null, requiresReview: true };
  }

  return {
    referenceMonth: getPreviousMonthStr(record.dueDate),
    requiresReview: false,
  };
}

/**
 * Determina a competência canônica de um registro de ICMS.
 * Regra definitiva: parte exclusivamente de dueDate -> mês(dueDate).
 */
export function resolveIcmsCompetence(record: {
  sourceId: string;
  dueDate?: Date | null | undefined;
  sourceCompetenceDate?: Date | null | undefined;
}): { referenceMonth: string | null; unresolved: boolean } {
  if (!record.dueDate || isNaN(record.dueDate.getTime())) {
    return {
      referenceMonth: null,
      unresolved: true,
    };
  }

  return {
    referenceMonth: getMonthStr(record.dueDate),
    unresolved: false,
  };
}
