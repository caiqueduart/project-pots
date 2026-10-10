import { addMonths, type Global, type MonthKey, type MonthPlan, type MonthRecord, type Pot } from "@pots/shared";
import type { CalcEntry, MonthInput, PotsData } from "./types.ts";

/** Potes, cartão e fixos ficam amarelos a partir desta porcentagem. */
export const WARN_PCT = 85;

export function emptyPlan(): MonthPlan {
  return { incomes: [], pots: [], card: { personal_limit_cents: 0, bank_limit_cents: 0 } };
}

export function emptyGlobal(): Global {
  return { id: "global", fixed: [] };
}

/** Mês novo: copia o plano do mês anterior e recebe os fixos do modelo global. Começa sem compras. */
export function newMonth(month: MonthKey, prev: MonthRecord | undefined, global: Global): MonthRecord {
  return {
    month,
    closed_at: null,
    plan: prev ? structuredClone(prev.plan) : emptyPlan(),
    fixed: structuredClone(global.fixed),
    entries: [],
    stopped_entries: [],
  };
}

/**
 * Vira os meses: fecha os meses abertos antes do atual e cria os que faltam até o atual. Se a pessoa
 * ficou meses sem abrir o app, esses meses nascem iguais ao anterior (os fixos caíram) e já fechados.
 * Devolve só os meses que mudaram, para gravar.
 */
export function rollMonths(data: PotsData, current: MonthKey, now: Date): MonthRecord[] {
  const closed_at = now.toISOString();
  const byMonth = new Map(data.months.map((m) => [m.month, m]));
  const changed: MonthRecord[] = [];
  for (const m of data.months) {
    if (m.month < current && !m.closed_at) changed.push({ ...m, closed_at });
  }
  const before = data.months.filter((m) => m.month < current);
  let prev = before.length ? (changed.find((c) => c.month === before.at(-1)!.month) ?? before.at(-1)) : undefined;
  if (!byMonth.has(current)) {
    for (let m = prev ? addMonths(prev.month, 1) : current; m <= current; m = addMonths(m, 1)) {
      const rec = newMonth(m, prev, data.global);
      if (m < current) rec.closed_at = closed_at;
      changed.push(rec);
      prev = rec;
    }
  }
  return changed;
}

/** Todas as compras, com o mês em que foram lançadas e o mês em que as parcelas pararam (se pararam). */
export function allEntries(months: MonthRecord[]): CalcEntry[] {
  const stopped = new Map<string, MonthKey>();
  for (const m of months) for (const id of m.stopped_entries) if (!stopped.has(id)) stopped.set(id, m.month);
  return months.flatMap((m) => m.entries.map((e) => ({ ...e, registered_month: m.month, stopped_month: stopped.get(e.id) ?? null })));
}

/**
 * O que entra no cálculo de um mês. Passado e atual: o que está guardado nele (null se o mês é antes do
 * primeiro uso). Futuro: previsão com o plano do mês atual e os fixos do modelo global.
 */
export function monthInput(data: PotsData, month: MonthKey, current: MonthKey): MonthInput | null {
  const rec = data.months.find((m) => m.month === month);
  const base = month <= current ? rec : (data.months.find((m) => m.month === current) ?? data.months.at(-1));
  if (!base) return null;
  const plan = base.plan;
  const fixed = month <= current ? base.fixed : data.global.fixed;
  const pots = new Map<string, Pot>();
  for (const m of data.months) for (const p of m.plan.pots) pots.set(p.id, p);
  for (const p of plan.pots) pots.set(p.id, p);
  const entries = allEntries(data.months).filter((e) => e.registered_month <= month);
  return { plan, fixed, entries, pots };
}
