import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.ts";

export type Db = BetterSQLite3Database<typeof schema>;

/** Pasta das migrações geradas pelo drizzle-kit. Pode ser trocada por MIGRATIONS_DIR no build. */
export const defaultMigrationsDir = fileURLToPath(new URL("../../drizzle", import.meta.url));

export function openDb(path: string, migrationsDir = defaultMigrationsDir): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  // WAL é exigido pelo Litestream e permite leituras durante uma gravação
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsDir });
  return db;
}
