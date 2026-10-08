import type { DateKey, MonthKey } from "@pots/shared";

/** Data local (YYYY-MM-DD) de um instante no fuso do usuário. */
export function localDate(now: Date, timeZone: string): DateKey {
  // en-CA formata como YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function localMonth(now: Date, timeZone: string): MonthKey {
  return localDate(now, timeZone).slice(0, 7);
}
