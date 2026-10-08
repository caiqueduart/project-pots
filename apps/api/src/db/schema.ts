import type { MonthView, PaymentMethod, PotKind, RecurringOverride } from "@pots/shared";
import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Regra: o banco guarda só o que o usuário digita, e só o valor atual. Todo o resto é calculado
// em src/core. Dinheiro em centavos inteiros. Mês YYYY-MM, data YYYY-MM-DD.

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;
const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().default(now);
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(now)
    .$onUpdate(() => new Date());

// ---------- login (Better Auth, com usePlural) ----------

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

export const verifications = sqliteTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

// ---------- dados do app ----------

const userId = () =>
  text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

/** Preferências e o cartão (é um só, então não tem tabela própria). Uma linha por usuário. */
export const userSettings = sqliteTable("user_settings", {
  userId: userId().primaryKey(),
  personalLimitCents: integer("personal_limit_cents").notNull().default(0),
  bankLimitCents: integer("bank_limit_cents").notNull().default(0),
  warnPct: integer("warn_pct").notNull().default(85),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  updatedAt: updatedAt(),
});

export const pots = sqliteTable(
  "pots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: userId(),
    name: text("name").notNull(),
    kind: text("kind").$type<PotKind>().notNull().default("gasto"),
    amountCents: integer("amount_cents").notNull(),
    // remover arquiva, porque compras antigas apontam para o pote
    archivedAt: text("archived_at"),
    createdAt: createdAt(),
  },
  (t) => [index("pots_user_idx").on(t.userId)],
);

export const incomes = sqliteTable(
  "incomes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: userId(),
    name: text("name").notNull(),
    amountCents: integer("amount_cents").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("incomes_user_idx").on(t.userId)],
);

/** Compras. Parcelas não são gravadas: saem de purchase_date + installments. */
export const entries = sqliteTable(
  "entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: userId(),
    description: text("description").notNull(),
    totalCents: integer("total_cents").notNull(),
    purchaseDate: text("purchase_date").notNull(),
    // mês em que foi lançada; uma compra à vista com data de mês fechado cai neste mês
    registeredMonth: text("registered_month").notNull(),
    potId: integer("pot_id")
      .notNull()
      .references(() => pots.id),
    method: text("method").$type<PaymentMethod>().notNull(),
    installments: integer("installments").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [index("entries_user_idx").on(t.userId)],
);

/** Fixos: valem em todo mês. O ajuste de um mês só fica em override. */
export const recurring = sqliteTable(
  "recurring",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: userId(),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    day: integer("day").notNull(),
    potId: integer("pot_id")
      .notNull()
      .references(() => pots.id),
    method: text("method").$type<PaymentMethod>().notNull(),
    override: text("override", { mode: "json" }).$type<RecurringOverride>(),
    createdAt: createdAt(),
  },
  (t) => [index("recurring_user_idx").on(t.userId)],
);

/** Foto de cada mês fechado: o mesmo JSON que GET /api/mes/:month devolvia no fechamento. */
export const monthSnapshots = sqliteTable(
  "month_snapshots",
  {
    userId: userId(),
    month: text("month").notNull(),
    data: text("data", { mode: "json" }).$type<MonthView>().notNull(),
    closedAt: integer("closed_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.month] })],
);
