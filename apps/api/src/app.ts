import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import type { AuthPort } from "./auth.ts";
import type { Db } from "./db/client.ts";
import { entriesRoutes } from "./routes/entries.ts";
import { type Deps, type Env, apiError } from "./routes/context.ts";
import { monthRoutes } from "./routes/month.ts";
import { planningRoutes } from "./routes/planning.ts";
import { recurringRoutes } from "./routes/recurring.ts";
import { settingsRoutes } from "./routes/settings.ts";
import { closePastMonths } from "./services/months.ts";

export interface AppOptions {
  db: Db;
  auth: AuthPort;
  now?: () => Date;
  log?: boolean;
}

export function createApp({ db, auth, now = () => new Date(), log = false }: AppOptions) {
  const deps: Deps = { db, now };
  const app = new Hono<Env>();
  if (log) app.use(logger());

  app.get("/api/health", (c) => c.json({ ok: true }));
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  const api = new Hono<Env>()
    .use(async (c, next) => {
      const userId = await auth.getUserId(c.req.raw.headers);
      if (!userId) throw apiError(401, "nao_autenticado", "Entre com o Google para continuar");
      const at = now();
      c.set("userId", userId);
      c.set("now", at);
      // fecha os meses que viraram antes de qualquer leitura ou gravação
      closePastMonths(db, userId, at);
      await next();
    })
    .route("/", settingsRoutes(deps))
    .route("/", monthRoutes(deps))
    .route("/", planningRoutes(deps))
    .route("/", entriesRoutes(deps))
    .route("/", recurringRoutes(deps));

  app.route("/api", api);

  app.notFound((c) => c.json({ error: { code: "nao_encontrado", message: "Rota não encontrada" } }, 404));
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    console.error(err);
    return c.json({ error: { code: "erro_interno", message: "Erro inesperado no servidor" } }, 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
