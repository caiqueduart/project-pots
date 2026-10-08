import { settingsUpdateSchema } from "@pots/shared";
import { eq } from "drizzle-orm";
import { getSettings } from "../db/repo.ts";
import * as t from "../db/schema.ts";
import { currentMonthFor } from "../services/months.ts";
import { type Deps, notFound, router, validate } from "./context.ts";

export function settingsRoutes({ db }: Deps) {
  return router()
    .get("/me", (c) => {
      const userId = c.get("userId");
      const user = db.select().from(t.users).where(eq(t.users.id, userId)).get();
      if (!user) throw notFound();
      return c.json({
        user: { id: user.id, name: user.name, email: user.email, image: user.image, created_at: user.createdAt.toISOString() },
        settings: getSettings(db, userId),
        current_month: currentMonthFor(db, userId, c.get("now")),
      });
    })
    .get("/settings", (c) => c.json(getSettings(db, c.get("userId"))))
    .patch("/settings", validate("json", settingsUpdateSchema), (c) => {
      const userId = c.get("userId");
      const body = c.req.valid("json");
      getSettings(db, userId); // garante a linha
      db.update(t.userSettings)
        .set({
          personalLimitCents: body.personal_limit_cents,
          bankLimitCents: body.bank_limit_cents,
          warnPct: body.warn_pct,
          timezone: body.timezone,
        })
        .where(eq(t.userSettings.userId, userId))
        .run();
      return c.json(getSettings(db, userId));
    });
}
