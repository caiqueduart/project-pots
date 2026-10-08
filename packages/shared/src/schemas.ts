// Validação das entradas da API. O front pode usar os mesmos schemas nos formulários.
import { z } from "zod";
import { isDateKey, isMonthKey } from "./month.ts";

const MAX_CENTS = 100_000_000_00; // R$ 100 milhões

export const cents = z.number().int().min(0).max(MAX_CENTS);
export const monthKeySchema = z.string().refine(isMonthKey, "Use o formato YYYY-MM");
export const dateKeySchema = z.string().refine(isDateKey, "Use uma data válida no formato YYYY-MM-DD");
const name = z.string().trim().min(1).max(120);
const id = z.number().int().positive();

export const potKindSchema = z.enum(["gasto", "meta"]);
export const paymentMethodSchema = z.enum(["cartao", "debito"]);

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const settingsUpdateSchema = z
  .object({
    personal_limit_cents: cents,
    bank_limit_cents: cents,
    warn_pct: z.number().int().min(1).max(100),
    timezone: z.string().refine(isTimeZone, "Fuso horário inválido"),
  })
  .partial()
  .strict();

export const incomeCreateSchema = z.object({ name, amount_cents: cents }).strict();
export const incomeUpdateSchema = incomeCreateSchema.partial().strict();

export const potCreateSchema = z
  .object({ name, kind: potKindSchema.default("gasto"), amount_cents: cents })
  .strict();
export const potUpdateSchema = z
  .object({ name, kind: potKindSchema, amount_cents: cents })
  .partial()
  .strict();

const installments = z.number().int().min(1).max(120);

export const entryCreateSchema = z
  .object({
    description: name,
    total_cents: cents.min(1),
    purchase_date: dateKeySchema,
    pot_id: id,
    method: paymentMethodSchema,
    installments: installments.default(1),
  })
  .strict()
  .refine((e) => e.method === "cartao" || e.installments === 1, {
    message: "Só compras no cartão podem ser parceladas",
    path: ["installments"],
  });
export const entryUpdateSchema = z
  .object({
    description: name,
    total_cents: cents.min(1),
    purchase_date: dateKeySchema,
    pot_id: id,
    method: paymentMethodSchema,
    installments,
  })
  .partial()
  .strict();

const day = z.number().int().min(1).max(31);

export const recurringCreateSchema = z
  .object({ description: name, amount_cents: cents.min(1), day, pot_id: id, method: paymentMethodSchema })
  .strict();

/**
 * Editar um fixo:
 * - escopo "mes": ajusta só o mês atual (valor ou pular). `month`, se enviado, precisa ser o mês atual.
 * - escopo "em_diante": muda o fixo deste mês em diante e descarta o ajuste do mês.
 */
export const recurringUpdateSchema = z.discriminatedUnion("scope", [
  z
    .object({
      scope: z.literal("mes"),
      month: monthKeySchema.optional(),
      amount_cents: cents.min(1).optional(),
      skip: z.literal(true).optional(),
    })
    .strict()
    .refine((o) => (o.amount_cents === undefined) !== (o.skip === undefined), {
      message: "Informe amount_cents ou skip",
    }),
  z
    .object({
      scope: z.literal("em_diante"),
      description: name.optional(),
      amount_cents: cents.min(1).optional(),
      day: day.optional(),
      pot_id: id.optional(),
      method: paymentMethodSchema.optional(),
    })
    .strict(),
]);

export const recurringDeleteQuerySchema = z.object({ scope: z.enum(["mes", "em_diante"]) });

export const purchasePreviewSchema = z
  .object({
    total_cents: cents.min(1),
    installments: installments.default(1),
    purchase_date: dateKeySchema,
    method: paymentMethodSchema,
  })
  .strict();

export const planningPreviewSchema = z
  .object({ incomes_cents: z.array(cents).max(100), pots_cents: z.array(cents).max(100) })
  .strict();

export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;
export type IncomeCreate = z.infer<typeof incomeCreateSchema>;
export type IncomeUpdate = z.infer<typeof incomeUpdateSchema>;
export type PotCreate = z.infer<typeof potCreateSchema>;
export type PotUpdate = z.infer<typeof potUpdateSchema>;
export type EntryCreate = z.infer<typeof entryCreateSchema>;
export type EntryUpdate = z.infer<typeof entryUpdateSchema>;
export type RecurringCreate = z.infer<typeof recurringCreateSchema>;
export type RecurringUpdate = z.infer<typeof recurringUpdateSchema>;
export type PurchasePreviewInput = z.infer<typeof purchasePreviewSchema>;
export type PlanningPreviewInput = z.infer<typeof planningPreviewSchema>;
