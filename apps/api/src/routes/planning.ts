// Renda e potes. Toda mudança vale do mês atual em diante; o passado está nas fotos.
import { incomeCreateSchema, incomeUpdateSchema, potCreateSchema, potUpdateSchema } from "@pots/shared";
import { and, asc, eq, isNull } from "drizzle-orm";
import { toIncome, toPot } from "../db/repo.ts";
import * as t from "../db/schema.ts";
import { apiError, type Deps, notFound, parseId, router, validate } from "./context.ts";

export function planningRoutes({ db }: Deps) {
  return router()
    .get("/incomes", (c) =>
      c.json(
        db.select().from(t.incomes).where(eq(t.incomes.userId, c.get("userId"))).orderBy(asc(t.incomes.id)).all().map(toIncome),
      ),
    )
    .post("/incomes", validate("json", incomeCreateSchema), (c) => {
      const body = c.req.valid("json");
      const row = db
        .insert(t.incomes)
        .values({ userId: c.get("userId"), name: body.name, amountCents: body.amount_cents })
        .returning()
        .get();
      return c.json(toIncome(row), 201);
    })
    .patch("/incomes/:id", validate("json", incomeUpdateSchema), (c) => {
      const body = c.req.valid("json");
      const row = db
        .update(t.incomes)
        .set({ name: body.name, amountCents: body.amount_cents })
        .where(and(eq(t.incomes.id, parseId(c.req.param("id"))), eq(t.incomes.userId, c.get("userId"))))
        .returning()
        .get();
      if (!row) throw notFound();
      return c.json(toIncome(row));
    })
    .delete("/incomes/:id", (c) => {
      const row = db
        .delete(t.incomes)
        .where(and(eq(t.incomes.id, parseId(c.req.param("id"))), eq(t.incomes.userId, c.get("userId"))))
        .returning()
        .get();
      if (!row) throw notFound();
      return c.body(null, 204);
    })

    .get("/pots", (c) => {
      const all = c.req.query("archived") === "1";
      const where = all
        ? eq(t.pots.userId, c.get("userId"))
        : and(eq(t.pots.userId, c.get("userId")), isNull(t.pots.archivedAt));
      return c.json(db.select().from(t.pots).where(where).orderBy(asc(t.pots.id)).all().map(toPot));
    })
    .post("/pots", validate("json", potCreateSchema), (c) => {
      const body = c.req.valid("json");
      const row = db
        .insert(t.pots)
        .values({ userId: c.get("userId"), name: body.name, kind: body.kind, amountCents: body.amount_cents })
        .returning()
        .get();
      return c.json(toPot(row), 201);
    })
    .patch("/pots/:id", validate("json", potUpdateSchema), (c) => {
      const body = c.req.valid("json");
      const row = db
        .update(t.pots)
        .set({ name: body.name, kind: body.kind, amountCents: body.amount_cents })
        .where(
          and(eq(t.pots.id, parseId(c.req.param("id"))), eq(t.pots.userId, c.get("userId")), isNull(t.pots.archivedAt)),
        )
        .returning()
        .get();
      if (!row) throw notFound();
      return c.json(toPot(row));
    })
    // remover arquiva: compras e meses antigos continuam apontando para o pote
    .delete("/pots/:id", (c) => {
      const id = parseId(c.req.param("id"));
      const inUse = db
        .select({ id: t.recurring.id })
        .from(t.recurring)
        .where(and(eq(t.recurring.potId, id), eq(t.recurring.userId, c.get("userId"))))
        .get();
      if (inUse) throw apiError(409, "pote_com_fixos", "Mova ou exclua os fixos deste pote antes de removê-lo");
      const row = db
        .update(t.pots)
        .set({ archivedAt: c.get("now").toISOString() })
        .where(
          and(eq(t.pots.id, id), eq(t.pots.userId, c.get("userId")), isNull(t.pots.archivedAt)),
        )
        .returning()
        .get();
      if (!row) throw notFound();
      return c.body(null, 204);
    });
}
