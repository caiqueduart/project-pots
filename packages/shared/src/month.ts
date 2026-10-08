// Mês no formato YYYY-MM e data no formato YYYY-MM-DD.
// Strings nesse formato se ordenam corretamente com comparação de texto.

export type MonthKey = string;
export type DateKey = string;

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isMonthKey(value: string): boolean {
  return MONTH_RE.test(value);
}

export function isDateKey(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const day = Number(m[3]);
  return day <= daysInMonth(`${m[1]}-${m[2]}`);
}

export function parseMonth(month: MonthKey): { year: number; month: number } {
  const m = MONTH_RE.exec(month);
  if (!m) throw new Error(`Mês inválido: ${month}`);
  return { year: Number(m[1]), month: Number(m[2]) };
}

export function monthKey(year: number, month: number): MonthKey {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export function addMonths(month: MonthKey, n: number): MonthKey {
  const { year, month: mo } = parseMonth(month);
  const total = year * 12 + (mo - 1) + n;
  return monthKey(Math.floor(total / 12), (total % 12) + 1);
}

/** Quantos meses de `from` até `to` (positivo se `to` vem depois). */
export function diffMonths(from: MonthKey, to: MonthKey): number {
  const a = parseMonth(from);
  const b = parseMonth(to);
  return b.year * 12 + b.month - (a.year * 12 + a.month);
}

export function monthOfDate(date: DateKey): MonthKey {
  return date.slice(0, 7);
}

export function daysInMonth(month: MonthKey): number {
  const { year, month: mo } = parseMonth(month);
  return new Date(Date.UTC(year, mo, 0)).getUTCDate();
}

/** Data do dia `day` no mês, limitada ao último dia (dia 31 em fevereiro vira 28/29). */
export function dateInMonth(month: MonthKey, day: number): DateKey {
  const d = Math.min(Math.max(1, day), daysInMonth(month));
  return `${month}-${String(d).padStart(2, "0")}`;
}

export function maxMonth(a: MonthKey, b: MonthKey): MonthKey {
  return a >= b ? a : b;
}
