/**
 * Utilitários de manipulação e formatação de datas para a integração com a API TagPlus.
 *
 * Premissas:
 * - A API TagPlus trabalha com precisão de segundos (sem milissegundos).
 * - A API TagPlus interpreta filtros de data no fuso horário local da conta (Nineclouds: America/Sao_Paulo).
 * - O formato exigido pela TagPlus é 'YYYY-MM-DD HH:mm:ss'.
 * - Persistência interna e comparações de data no TagPulse permanecem sempre em UTC.
 */

export const TAGPLUS_TIMEZONE = "America/Sao_Paulo";

/**
 * Trunca uma data para precisão de segundos (zera os milissegundos).
 * Exemplo: 2026-09-12T19:55:22.847Z -> 2026-09-12T19:55:22.000Z
 */
export function truncateToSeconds(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}

/**
 * Converte um Date UTC para uma string formatada em 'YYYY-MM-DD HH:mm:ss'
 * no fuso horário da Nineclouds ('America/Sao_Paulo').
 *
 * Utiliza Intl.DateTimeFormat para garantir conversão nativa precisa sem dependências externas.
 */
export function formatTagPlusDateSaoPaulo(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TAGPLUS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";

  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");
  const hour = getPart("hour");
  const minute = getPart("minute");
  const second = getPart("second");

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}
