export const KNOWN_DAS_COMPETENCE_OVERRIDES: Record<string, string> = {
  // sourceId 11382: Typo operacional em dueDate no TagPlus (digitado 20/08/2026, pago e confirmado em 21/09/2026 ref. Agosto/2026)
  "11382": "2026-08",
};

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
 */
export function resolveDasCompetence(record: {
  sourceId: string;
  dueDate?: Date | null | undefined;
  confirmationDate?: Date | null | undefined;
  sourceCompetenceDate?: Date | null | undefined;
}): { referenceMonth: string | null; requiresReview: boolean } {
  if (record.sourceCompetenceDate && !isNaN(record.sourceCompetenceDate.getTime())) {
    return {
      referenceMonth: getMonthStr(record.sourceCompetenceDate),
      requiresReview: false,
    };
  }

  // Override canônico auditado
  if (record.sourceId in KNOWN_DAS_COMPETENCE_OVERRIDES) {
    return {
      referenceMonth: KNOWN_DAS_COMPETENCE_OVERRIDES[record.sourceId] ?? null,
      requiresReview: false,
    };
  }

  if (!record.dueDate || isNaN(record.dueDate.getTime())) {
    return { referenceMonth: null, requiresReview: true };
  }

  // Se houver discrepância > 25 dias entre vencimento e confirmação e não houver override, sinalizar
  let requiresReview = false;
  if (record.confirmationDate && !isNaN(record.confirmationDate.getTime())) {
    const diffDays = Math.abs(
      (record.confirmationDate.getTime() - record.dueDate.getTime()) /
        (1000 * 60 * 60 * 24),
    );
    if (diffDays > 25) {
      requiresReview = true;
    }
  }

  return {
    referenceMonth: getPreviousMonthStr(record.dueDate),
    requiresReview,
  };
}

/**
 * Determina a competência canônica de um registro de GPS / INSS.
 */
export function resolveGpsCompetence(record: {
  sourceId: string;
  dueDate?: Date | null | undefined;
  sourceCompetenceDate?: Date | null | undefined;
}): { referenceMonth: string | null; requiresReview: boolean } {
  if (record.sourceCompetenceDate && !isNaN(record.sourceCompetenceDate.getTime())) {
    return {
      referenceMonth: getMonthStr(record.sourceCompetenceDate),
      requiresReview: false,
    };
  }

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
 */
export function resolveIcmsCompetence(record: {
  sourceId: string;
  dueDate?: Date | null | undefined;
  sourceCompetenceDate?: Date | null | undefined;
}): { referenceMonth: string | null; unresolved: boolean } {
  if (record.sourceCompetenceDate && !isNaN(record.sourceCompetenceDate.getTime())) {
    return {
      referenceMonth: getMonthStr(record.sourceCompetenceDate),
      unresolved: false,
    };
  }

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
