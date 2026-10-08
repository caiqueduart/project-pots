import { addMonths, diffMonths, maxMonth, monthOfDate, type Entry, type MonthKey } from "@pots/shared";

/**
 * Valor da parcela k (1..n). As n-1 primeiras são o total dividido e arredondado para baixo;
 * a última leva a diferença, para a soma bater exatamente com o total.
 */
export function installmentCents(totalCents: number, n: number, k: number): number {
  const base = Math.floor(totalCents / n);
  return k < n ? base : totalCents - base * (n - 1);
}

export interface Schedule {
  first_month: MonthKey;
  last_month: MonthKey;
}

/**
 * Em que meses a compra cai.
 * - Parcelada (só cartão): a parcela 1 cai no mês da compra, uma por mês. Não há fechamento de fatura:
 *   a compra entra na fatura do próprio mês. Uma data antiga serve para cadastrar algo que já está,
 *   por exemplo, na 4/10; as parcelas de meses já fechados ficam de fora.
 * - À vista (cartão ou débito): cai no mês da compra, ou no mês em que foi lançada se a data for de um
 *   mês já fechado. Assim uma compra esquecida entra no mês atual sem mexer no mês fechado.
 */
export function entrySchedule(entry: Entry): Schedule {
  if (entry.installments <= 1) {
    const m = maxMonth(monthOfDate(entry.purchase_date), entry.registered_month);
    return { first_month: m, last_month: m };
  }
  const first = monthOfDate(entry.purchase_date);
  return { first_month: first, last_month: addMonths(first, entry.installments - 1) };
}

/** Parcela da compra que cai no mês, ou null. */
export function entryInMonth(entry: Entry, month: MonthKey): { installment: number; amount_cents: number } | null {
  const { first_month } = entrySchedule(entry);
  const k = diffMonths(first_month, month) + 1;
  if (k < 1 || k > entry.installments) return null;
  // parcelas anteriores ao lançamento já foram pagas fora do app
  if (entry.installments > 1 && month < entry.registered_month) return null;
  return { installment: k, amount_cents: installmentCents(entry.total_cents, entry.installments, k) };
}

/** Soma das parcelas depois do mês informado. */
export function remainingAfter(entry: Entry, month: MonthKey): number {
  const { first_month } = entrySchedule(entry);
  const k = diffMonths(first_month, month) + 1;
  let sum = 0;
  for (let i = Math.max(k + 1, 1); i <= entry.installments; i++) {
    sum += installmentCents(entry.total_cents, entry.installments, i);
  }
  return sum;
}
