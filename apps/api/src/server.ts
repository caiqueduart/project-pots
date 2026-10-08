import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { authPort, createAuth } from "./auth.ts";
import { loadConfig } from "./config.ts";
import { defaultMigrationsDir, openDb } from "./db/client.ts";

const cfg = loadConfig();
const db = openDb(cfg.DATABASE_PATH, cfg.MIGRATIONS_DIR ?? defaultMigrationsDir);
const auth = createAuth(db, {
  baseURL: cfg.APP_URL,
  secret: cfg.BETTER_AUTH_SECRET,
  googleClientId: cfg.GOOGLE_CLIENT_ID,
  googleClientSecret: cfg.GOOGLE_CLIENT_SECRET,
  trustedOrigins: [cfg.APP_URL],
});
const app = createApp({ db, auth: authPort(auth), log: true });

const server = serve({ fetch: app.fetch, port: cfg.PORT }, (info) => {
  console.log(`Pots API ouvindo na porta ${info.port}`);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    server.close();
    process.exit(0);
  });
}
