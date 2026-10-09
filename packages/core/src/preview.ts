import type { DateKey, Entry, MonthKey, PaymentMethod, PlanningPreview, PurchasePreview } from "@pots/shared";

export interface PurchasePreviewInput {
  total_cents: number;
  installments: number;
  purchase_date: DateKey;
  method: PaymentMethod;
}

export interface PlanningPreviewInput {
  incomes_cents: number[];
  pots_cents: number[];
}
import { entryInMonth, entrySchedule, installmentCents, remainingAfter } from "./installments.ts";

/** Prévia do formulário de compra ("10x de R$ 300,00, até jul/27"), como se fosse lançada agora. */
export function previewPurchase(input: PurchasePreviewInput, currentMonth: MonthKey): PurchasePreview {
  const n = input.method === "cartao" ? input.installments : 1;
  const entry: Entry = {
    id: "",
    created_at: "",
    updated_at: "",
    deleted_at: null,
    description: "",
    total_cents: input.total_cents,
    purchase_date: input.purchase_date,
    registered_month: currentMonth,
    pot_id: "",
    method: input.method,
    installments: n,
  };
  const sched = entrySchedule(entry);
  const now = entryInMonth(entry, currentMonth);
  return {
    current_month: currentMonth,
    installments: n,
    installment_cents: installmentCents(input.total_cents, n, 1),
    last_installment_cents: installmentCents(input.total_cents, n, n),
    first_month: sched.first_month,
    last_month: sched.last_month,
    current_installment: now?.installment ?? null,
    current_amount_cents: now?.amount_cents ?? 0,
    remaining_after_current_cents: remainingAfter(entry, currentMonth),
  };
}

/** "Falta distribuir" da aba Configurar: renda − soma dos potes. */
export function previewPlanning(input: PlanningPreviewInput): PlanningPreview {
  const income = input.incomes_cents.reduce((s, v) => s + v, 0);
  const budgeted = input.pots_cents.reduce((s, v) => s + v, 0);
  return { income_cents: income, budgeted_cents: budgeted, unallocated_cents: income - budgeted };
}
