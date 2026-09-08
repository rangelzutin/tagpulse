export interface ParsedDateRange {
  from: string;
  to: string;
  fromDate: Date;
  toExclusiveDate: Date;
}

export function parseOverviewDateRange(
  from: unknown,
  to: unknown,
): { success: true; range: ParsedDateRange } | { success: false; error: string } {
  if (typeof from !== "string" || !from.trim()) {
    return {
      success: false,
      error: "Parâmetro 'from' é obrigatório e deve estar no formato YYYY-MM-DD.",
    };
  }

  if (typeof to !== "string" || !to.trim()) {
    return {
      success: false,
      error: "Parâmetro 'to' é obrigatório e deve estar no formato YYYY-MM-DD.",
    };
  }

  const fromTrimmed = from.trim();
  const toTrimmed = to.trim();

  const fromMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromTrimmed);
  if (!fromMatch) {
    return {
      success: false,
      error: "Data 'from' inválida. Use o formato YYYY-MM-DD.",
    };
  }

  const toMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(toTrimmed);
  if (!toMatch) {
    return {
      success: false,
      error: "Data 'to' inválida. Use o formato YYYY-MM-DD.",
    };
  }

  const fromY = Number(fromMatch[1]);
  const fromM = Number(fromMatch[2]);
  const fromD = Number(fromMatch[3]);

  const toY = Number(toMatch[1]);
  const toM = Number(toMatch[2]);
  const toD = Number(toMatch[3]);

  const fromDate = new Date(Date.UTC(fromY, fromM - 1, fromD, 0, 0, 0, 0));
  if (
    fromDate.getUTCFullYear() !== fromY ||
    fromDate.getUTCMonth() !== fromM - 1 ||
    fromDate.getUTCDate() !== fromD
  ) {
    return {
      success: false,
      error: "Data 'from' não corresponde a uma data válida no calendário.",
    };
  }

  const toDate = new Date(Date.UTC(toY, toM - 1, toD, 0, 0, 0, 0));
  if (
    toDate.getUTCFullYear() !== toY ||
    toDate.getUTCMonth() !== toM - 1 ||
    toDate.getUTCDate() !== toD
  ) {
    return {
      success: false,
      error: "Data 'to' não corresponde a uma data válida no calendário.",
    };
  }

  if (fromDate.getTime() > toDate.getTime()) {
    return {
      success: false,
      error: "A data inicial 'from' deve ser anterior ou igual à data final 'to'.",
    };
  }

  // Cover the entire final day by advancing to the start of the next UTC day
  const toExclusiveDate = new Date(Date.UTC(toY, toM - 1, toD + 1, 0, 0, 0, 0));

  return {
    success: true,
    range: {
      from: fromTrimmed,
      to: toTrimmed,
      fromDate,
      toExclusiveDate,
    },
  };
}
