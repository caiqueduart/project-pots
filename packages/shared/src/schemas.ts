// Validação das entradas (formulários) e do arquivo de backup.
import { z } from "zod";
import { isDateKey, isMonthKey } from "./month.ts";

const MAX_CENTS = 100_000_000_00; // R$ 100 milhões

export const cents = z.number().int().min(0).max(MAX_CENTS);
export const monthKeySchema = z.string().refine(isMonthKey, "Use o formato YYYY-MM");
export const dateKeySchema = z.string().refine(isDateKey, "Data inválida");
const name = z.string().trim().min(1, "Preencha o nome").max(120);
const id = z.string().min(1);
const timestamp = z.string().min(1);

export const potKindSchema = z.enum(["gasto", "meta"]);
export const paymentMethodSchema = z.enum(["cartao", "debito"]);
const installments = z.number().int().min(1).max(120);
const day = z.number().int().min(1).max(31);

export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ---------- formulários ----------

export const settingsInputSchema = z.object({
  personal_limit_cents: cents,
  bank_limit_cents: cents,
  warn_pct: z.number().int().min(1).max(100),
  timezone: z.string().refine(isTimeZone, "Fuso horário inválido"),
});

export const incomeInputSchema = z.object({ name, amount_cents: cents });
export const potInputSchema = z.object({ name, kind: potKindSchema, amount_cents: cents });

export const entryInputSchema = z
  .object({
    description: name,
    total_cents: cents.min(1, "Informe o valor"),
    purchase_date: dateKeySchema,
    pot_id: id,
    method: paymentMethodSchema,
    installments,
  })
  .refine((e) => e.method === "cartao" || e.installments === 1, {
    message: "Só compras no cartão podem ser parceladas",
    path: ["installments"],
  });

export const recurringInputSchema = z.object({
  description: name,
  amount_cents: cents.min(1, "Informe o valor"),
  day,
  pot_id: id,
  method: paymentMethodSchema,
});

// ---------- backup (as mesmas tabelas, num arquivo só) ----------

const rowMeta = { id, created_at: timestamp, updated_at: timestamp, deleted_at: timestamp.nullable() };

const overrideSchema = z.union([
  z.object({ month: monthKeySchema, skip: z.literal(true) }),
  z.object({
    month: monthKeySchema,
    skip: z.literal(false).optional(),
    description: name.optional(),
    amount_cents: cents.optional(),
    day: day.optional(),
    pot_id: id.optional(),
    method: paymentMethodSchema.optional(),
  }),
]);

export const BACKUP_FORMAT = "pots" as const;
export const BACKUP_SCHEMA = 1 as const;

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  schema: z.literal(BACKUP_SCHEMA),
  exported_at: timestamp,
  settings: z.object({
    id: z.literal("settings"),
    personal_limit_cents: cents,
    bank_limit_cents: cents,
    warn_pct: z.number().int().min(1).max(100),
    timezone: z.string().refine(isTimeZone, "Fuso horário inválido"),
    created_at: timestamp,
    updated_at: timestamp,
  }),
  incomes: z.array(z.object({ ...rowMeta, name, amount_cents: cents })),
  pots: z.array(
    z.object({ ...rowMeta, name, kind: potKindSchema, amount_cents: cents, archived_at: timestamp.nullable() }),
  ),
  entries: z.array(
    z.object({
      ...rowMeta,
      description: name,
      total_cents: cents,
      purchase_date: dateKeySchema,
      registered_month: monthKeySchema,
      pot_id: id,
      method: paymentMethodSchema,
      installments,
    }),
  ),
  recurring: z.array(
    z.object({
      ...rowMeta,
      description: name,
      amount_cents: cents,
      day,
      pot_id: id,
      method: paymentMethodSchema,
      override: overrideSchema.nullable(),
    }),
  ),
  // a foto é o resultado calculado; guardada como veio
  month_snapshots: z.array(z.object({ month: monthKeySchema, data: z.any(), closed_at: timestamp })),
});

export type SettingsInput = z.infer<typeof settingsInputSchema>;
export type IncomeInput = z.infer<typeof incomeInputSchema>;
export type PotInput = z.infer<typeof potInputSchema>;
export type EntryInput = z.infer<typeof entryInputSchema>;
export type RecurringInput = z.infer<typeof recurringInputSchema>;
export type Backup = z.infer<typeof backupSchema>;
