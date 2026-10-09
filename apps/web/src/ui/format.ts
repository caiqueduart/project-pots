import { formatCents, parseMonth, type MonthKey } from "@pots/shared";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export const fmt = formatCents;
/** "outubro 2026" */
export const monthLabel = (m: MonthKey) => `${MONTHS[parseMonth(m).month - 1]} ${parseMonth(m).year}`;
/** "outubro" */
export const monthName = (m: MonthKey) => MONTHS[parseMonth(m).month - 1] ?? "";
/** "out/26" */
export const monthShort = (m: MonthKey) => `${SHORT[parseMonth(m).month - 1]}/${String(parseMonth(m).year).slice(2)}`;
/** "2026-10-08" → "08/10/26" */
export const dateShort = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}`;
/** Data e hora local de um instante ISO. */
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const METHODS = { cartao: "Cartão", debito: "Débito" } as const;
