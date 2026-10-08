// Fixos. Editar ou excluir "só este mês" grava um ajuste do mês atual; "deste mês em diante" muda o fixo.
import { recurringCreateSchema, recurringDeleteQuerySchema, recurringUpdateSchema, type RecurringOverride } from "@pots/shared";
import { and, asc, eq } from "drizzle-orm";
import { toRecurring } from "../db/repo.ts";
import * as t from "../db/schema.ts";
import { currentMonthFor } from "../services/months.ts";
import { apiError, assertActivePot, type Deps, notFound, parseId, router, validate } from "./context.ts";

export function recurringRoutes({ db }: Deps) {
  /** O ajuste só existe para o mês atual; um ajuste de mês que já passou é ignorado e não aparece. */
  const present = (r: typeof t.recurring.$inferSelect, month: string) => {
    const rec = toRecurring(r);
    return { ...rec, override: rec.override?.month === month ? rec.override : null };
  };

  const find = (userId: string, id: number) => {
    const row = db.select().from(t.recurring).where(and(eq(t.recurring.id, id), eq(t.recurring.userId, userId))).get();
    if (!row) throw notFound();
    return row;
  };

  return router()
    .get("/recurring", (c) => {
      const userId = c.get("userId");
      const month = currentMonthFor(db, userId, c.get("now"));
      const rows = db.select().from(t.recurring).where(eq(t.recurring.userId, userId)).orderBy(asc(t.recurring.id)).all();
      return c.json(rows.map((r) => present(r, month)));
    })
    .post("/recurring", validate("json", recurringCreateSchema), (c) => {
      const userId = c.get("userId");
      const body = c.req.valid("json");
      assertActivePot(db, userId, body.pot_id);
      const row = db
        .insert(t.recurring)
        .values({
          userId,
          description: body.description,
          amountCents: body.amount_cents,
          day: body.day,
          potId: body.pot_id,
          method: body.method,
        })
        .returning()
        .get();
      return c.json(present(row, currentMonthFor(db, userId, c.get("now"))), 201);
    })
    .patch("/recurring/:id", validate("json", recurringUpdateSchema), (c) => {
      const userId = c.get("userId");
      const id = parseId(c.req.param("id"));
      const month = currentMonthFor(db, userId, c.get("now"));
      find(userId, id);
      const body = c.req.valid("json");

      if (body.scope === "mes") {
        if (body.month && body.month !== month) {
          throw apiError(409, "mes_nao_editavel", "Só o mês atual aceita mudanças");
        }
        const override: RecurringOverride = body.skip
          ? { month, skip: true }
          : { month, amount_cents: body.amount_cents! };
        const row = db.update(t.recurring).set({ override }).where(eq(t.recurring.id, id)).returning().get()!;
        return c.json(present(row, month));
      }

      if (body.pot_id !== undefined) assertActivePot(db, userId, body.pot_id);
      const row = db
        .update(t.recurring)
        .set({
          description: body.description,
          amountCents: body.amount_cents,
          day: body.day,
          potId: body.pot_id,
          method: body.method,
          override: null,
        })
        .where(eq(t.recurring.id, id))
        .returning()
        .get()!;
      return c.json(present(row, month));
    })
    // DELETE ?scope=mes pula só o mês atual; ?scope=em_diante apaga o fixo
    .delete("/recurring/:id", validate("query", recurringDeleteQuerySchema), (c) => {
      const userId = c.get("userId");
      const id = parseId(c.req.param("id"));
      find(userId, id);
      if (c.req.valid("query").scope === "mes") {
        const month = currentMonthFor(db, userId, c.get("now"));
        const row = db
          .update(t.recurring)
          .set({ override: { month, skip: true } })
          .where(eq(t.recurring.id, id))
          .returning()
          .get()!;
        return c.json(present(row, month));
      }
      db.delete(t.recurring).where(eq(t.recurring.id, id)).run();
      return c.body(null, 204);
    });
}
