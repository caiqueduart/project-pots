import { addMonths, type MonthKey, type MonthSnapshot } from "@pots/shared";
import { computeMonth } from "./compute-month.ts";
import type { UserData } from "./types.ts";

/**
 * Meses que já viraram e ainda não têm foto: do mês seguinte à última foto (ou do mês do primeiro uso)
 * até o mês anterior ao atual.
 */
export function monthsToClose(firstMonth: MonthKey, lastClosed: MonthKey | null, current: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  for (let m = lastClosed ? addMonths(lastClosed, 1) : firstMonth; m < current; m = addMonths(m, 1)) out.push(m);
  return out;
}

/**
 * Tira a foto de cada mês que fechou. Deve rodar antes de qualquer gravação depois da virada: assim os
 * dados de hoje ainda são os que valiam naquele mês. Se a pessoa ficou meses sem abrir o app, nada mudou
 * nesses meses, então o cálculo com os dados de hoje é o mesmo.
 */
export function closeMonths(data: UserData, months: MonthKey[], current: MonthKey, now: Date): MonthSnapshot[] {
  const closed_at = now.toISOString();
  return months.map((month) => ({
    month,
    closed_at,
    data: computeMonth(data, month, { kind: "passado", currentMonth: current, closedAt: closed_at }),
  }));
}
