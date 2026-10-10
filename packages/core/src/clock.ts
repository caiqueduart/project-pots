import type { DateKey, MonthKey } from "@pots/shared";

/** O Pots usa sempre o horário de Brasília: é ele que define quando o dia e o mês viram. */
export const TIME_ZONE = "America/Sao_Paulo";

/** Data (YYYY-MM-DD) de um instante no horário de Brasília. */
export function localDate(now: Date, timeZone = TIME_ZONE): DateKey {
  // en-CA formata como YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function localMonth(now: Date, timeZone = TIME_ZONE): MonthKey {
  return localDate(now, timeZone).slice(0, 7);
}
