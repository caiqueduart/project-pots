// Compras. Só valem do mês atual em diante: meses fechados não mudam.
import { entryCreateSchema, entryUpdateSchema, type Entry } from "@pots/shared";
import { and, asc, eq } from "drizzle-orm";
import { entryInMonth, entrySchedule, localDate } from "../core/index.ts";
import { getSettings, toEntry } from "../db/repo.ts";
import * as t from "../db/schema.ts";
import { apiError, assertActivePot, type Deps, notFound, parseId, router, validate } from "./context.ts";

export function entriesRoutes({ db }: Deps) {
  /** Compra com o cronograma calculado, para a lista de lançamentos. */
  const withSchedule = (e: Entry, month: string) => ({
    ...e,
    ...entrySchedule(e),
    current_installment: entryInMonth(e, month)?.installment ?? null,
  });

  function today(userId: string, now: Date) {
    const date = localDate(now, getSettings(db, userId).timezone);
    return { date, month: date.slice(0, 7) };
  }

  function check(
    userId: string,
    e: Pick<Entry, "purchase_date" | "pot_id" | "method" | "installments">,
    todayDate: string,
    potChanged = true,
  ) {
    if (e.purchase_date > todayDate) throw apiError(400, "data_futura", "A data da compra não pode ser futura");
    if (e.method !== "cartao" && e.installments > 1) {
      throw apiError(400, "dados_invalidos", "Só compras no cartão podem ser parceladas");
    }
    if (potChanged) assertActivePot(db, userId, e.pot_id);
  }

  return router()
    .get("/entries", (c) => {
      const userId = c.get("userId");
      const { month } = today(userId, c.get("now"));
      const rows = db.select().from(t.entries).where(eq(t.entries.userId, userId)).orderBy(asc(t.entries.id)).all();
      return c.json(rows.map((r) => withSchedule(toEntry(r), month)));
    })
    .post("/entries", validate("json", entryCreateSchema), (c) => {
      const userId = c.get("userId");
      const body = c.req.valid("json");
      const now = today(userId, c.get("now"));
      check(userId, body, now.date);
      const row = db
        .insert(t.entries)
        .values({
          userId,
          description: body.description,
          totalCents: body.total_cents,
          purchaseDate: body.purchase_date,
          registeredMonth: now.month,
          potId: body.pot_id,
          method: body.method,
          installments: body.installments,
        })
        .returning()
        .get();
      return c.json(withSchedule(toEntry(row), now.month), 201);
    })
    .patch("/entries/:id", validate("json", entryUpdateSchema), (c) => {
      const userId = c.get("userId");
      const id = parseId(c.req.param("id"));
      const current = db.select().from(t.entries).where(and(eq(t.entries.id, id), eq(t.entries.userId, userId))).get();
      if (!current) throw notFound();
      const body = c.req.valid("json");
      const merged = { ...toEntry(current), ...body };
      const now = today(userId, c.get("now"));
      check(userId, merged, now.date, body.pot_id !== undefined);
      const row = db
        .update(t.entries)
        .set({
          description: merged.description,
          totalCents: merged.total_cents,
          purchaseDate: merged.purchase_date,
          potId: merged.pot_id,
          method: merged.method,
          installments: merged.installments,
        })
        .where(eq(t.entries.id, id))
        .returning()
        .get()!;
      return c.json(withSchedule(toEntry(row), now.month));
    })
    .delete("/entries/:id", (c) => {
      const row = db
        .delete(t.entries)
        .where(and(eq(t.entries.id, parseId(c.req.param("id"))), eq(t.entries.userId, c.get("userId"))))
        .returning()
        .get();
      if (!row) throw notFound();
      return c.body(null, 204);
    });
}
