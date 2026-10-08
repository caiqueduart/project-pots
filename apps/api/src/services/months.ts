import { addMonths, type MonthKey, type MonthView } from "@pots/shared";
import { and, desc, eq } from "drizzle-orm";
import { computeMonth, localMonth } from "../core/index.ts";
import type { Db } from "../db/client.ts";
import { getSettings, loadUserData } from "../db/repo.ts";
import * as t from "../db/schema.ts";

export function currentMonthFor(db: Db, userId: string, now: Date): MonthKey {
  return localMonth(now, getSettings(db, userId).timezone);
}

/**
 * Fecha os meses que já passaram e ainda não têm foto. Roda na primeira requisição depois da virada,
 * antes de qualquer gravação; assim a foto sempre reflete o que valia no mês, sem depender de um
 * agendador. Se a pessoa ficou meses sem abrir o app, fecha todos os meses do intervalo (nada mudou
 * neles, então o cálculo com os dados de hoje é o mesmo).
 */
export function closePastMonths(db: Db, userId: string, now: Date): void {
  const settings = getSettings(db, userId);
  const current = localMonth(now, settings.timezone);
  const last = db
    .select({ month: t.monthSnapshots.month })
    .from(t.monthSnapshots)
    .where(eq(t.monthSnapshots.userId, userId))
    .orderBy(desc(t.monthSnapshots.month))
    .limit(1)
    .get();
  let start: MonthKey;
  if (last) {
    start = addMonths(last.month, 1);
  } else {
    const user = db.select({ createdAt: t.users.createdAt }).from(t.users).where(eq(t.users.id, userId)).get();
    if (!user) return;
    start = localMonth(user.createdAt, settings.timezone);
  }
  if (start >= current) return;

  const data = loadUserData(db, userId);
  db.transaction((tx) => {
    for (let m = start; m < current; m = addMonths(m, 1)) {
      const view = computeMonth(data, m, { kind: "passado", currentMonth: current, closedAt: now.toISOString() });
      tx.insert(t.monthSnapshots).values({ userId, month: m, data: view, closedAt: now }).onConflictDoNothing().run();
    }
  });
}

export type MonthResult = { view: MonthView } | { notFound: true };

/** Passado: a foto. Atual: calculado e editável. Futuro: previsão somente leitura. */
export function getMonth(db: Db, userId: string, month: MonthKey, now: Date): MonthResult {
  const current = currentMonthFor(db, userId, now);
  if (month < current) {
    const snap = db
      .select()
      .from(t.monthSnapshots)
      .where(and(eq(t.monthSnapshots.userId, userId), eq(t.monthSnapshots.month, month)))
      .get();
    if (!snap) return { notFound: true };
    // current_month muda com o tempo; o resto da foto nunca muda
    return { view: { ...snap.data, current_month: current } };
  }
  const data = loadUserData(db, userId);
  return { view: computeMonth(data, month, { kind: month === current ? "atual" : "futuro", currentMonth: current }) };
}
