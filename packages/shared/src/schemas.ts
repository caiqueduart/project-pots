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

// ---------- formulários ----------

export const cardPlanSchema = z.object({ personal_limit_cents: cents, bank_limit_cents: cents });

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

export const fixedInputSchema = z.object({
  description: name,
  amount_cents: cents.min(1, "Informe o valor"),
  day,
  pot_id: id,
  method: paymentMethodSchema,
});

// ---------- backup (o que está no navegador, num arquivo só) ----------

const fixedSchema = fixedInputSchema.extend({ id });

export const monthRecordSchema = z.object({
  month: monthKeySchema,
  closed_at: timestamp.nullable(),
  plan: z.object({
    incomes: z.array(incomeInputSchema.extend({ id })),
    pots: z.array(potInputSchema.extend({ id })),
    card: cardPlanSchema,
  }),
  fixed: z.array(fixedSchema.extend({ edited: z.literal(true).optional() })),
  entries: z.array(
    z.object({ id, description: name, total_cents: cents, purchase_date: dateKeySchema, pot_id: id, method: paymentMethodSchema, installments }),
  ),
  stopped_entries: z.array(id),
});

export const BACKUP_FORMAT = "pots" as const;
export const BACKUP_SCHEMA = 2 as const;

export const backupSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    schema: z.literal(BACKUP_SCHEMA),
    exported_at: timestamp,
    global: z.object({ fixed: z.array(fixedSchema) }),
    months: z.array(monthRecordSchema).min(1, "O backup não tem nenhum mês"),
  })
  .refine((b) => new Set(b.months.map((m) => m.month)).size === b.months.length, { message: "Mês repetido no backup", path: ["months"] })
  .refine((b) => b.months.filter((m) => !m.closed_at).length <= 1, { message: "Mais de um mês aberto no backup", path: ["months"] });

export type CardPlanInput = z.infer<typeof cardPlanSchema>;
export type IncomeInput = z.infer<typeof incomeInputSchema>;
export type PotInput = z.infer<typeof potInputSchema>;
export type EntryInput = z.infer<typeof entryInputSchema>;
export type FixedInput = z.infer<typeof fixedInputSchema>;
export type Backup = z.infer<typeof backupSchema>;
