// Leitura dos dados brutos de um usuário no formato que o core espera.
import type { Entry, Income, Pot, Recurring, Settings } from "@pots/shared";
import { asc, eq } from "drizzle-orm";
import type { UserData } from "../core/index.ts";
import type { Db } from "./client.ts";
import * as t from "./schema.ts";

export function getSettings(db: Db, userId: string): Settings {
  let row = db.select().from(t.userSettings).where(eq(t.userSettings.userId, userId)).get();
  if (!row) {
    // valores iniciais vêm dos defaults das colunas; depois são do usuário
    db.insert(t.userSettings).values({ userId }).onConflictDoNothing().run();
    row = db.select().from(t.userSettings).where(eq(t.userSettings.userId, userId)).get()!;
  }
  return {
    personal_limit_cents: row.personalLimitCents,
    bank_limit_cents: row.bankLimitCents,
    warn_pct: row.warnPct,
    timezone: row.timezone,
  };
}

export const toPot = (r: typeof t.pots.$inferSelect): Pot => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  amount_cents: r.amountCents,
  archived_at: r.archivedAt,
});

export const toIncome = (r: typeof t.incomes.$inferSelect): Income => ({
  id: r.id,
  name: r.name,
  amount_cents: r.amountCents,
});

export const toEntry = (r: typeof t.entries.$inferSelect): Entry => ({
  id: r.id,
  description: r.description,
  total_cents: r.totalCents,
  purchase_date: r.purchaseDate,
  registered_month: r.registeredMonth,
  pot_id: r.potId,
  method: r.method,
  installments: r.installments,
});

export const toRecurring = (r: typeof t.recurring.$inferSelect): Recurring => ({
  id: r.id,
  description: r.description,
  amount_cents: r.amountCents,
  day: r.day,
  pot_id: r.potId,
  method: r.method,
  override: r.override ?? null,
});

export function loadUserData(db: Db, userId: string): UserData {
  return {
    settings: getSettings(db, userId),
    incomes: db.select().from(t.incomes).where(eq(t.incomes.userId, userId)).orderBy(asc(t.incomes.id)).all().map(toIncome),
    pots: db.select().from(t.pots).where(eq(t.pots.userId, userId)).orderBy(asc(t.pots.id)).all().map(toPot),
    entries: db.select().from(t.entries).where(eq(t.entries.userId, userId)).orderBy(asc(t.entries.id)).all().map(toEntry),
    recurring: db
      .select()
      .from(t.recurring)
      .where(eq(t.recurring.userId, userId))
      .orderBy(asc(t.recurring.id))
      .all()
      .map(toRecurring),
  };
}
