import {
  addMonths,
  dateInMonth,
  type ForecastMonth,
  type InstallmentInProgress,
  type MonthKey,
  type MonthLine,
  type MonthPot,
  type MonthView,
  type PaymentMethod,
  type Recurring,
} from "@pots/shared";
import { entryInMonth, entrySchedule, remainingAfter } from "./installments.ts";
import { limitStatus, pct, potStatus } from "./status.ts";
import type { UserData } from "./types.ts";

export const SNAPSHOT_SCHEMA = 1 as const;

/** Quantos meses a previsão mostra depois do mês visto. */
export const FORECAST_MONTHS = 6;

/** Valor do fixo no mês, considerando o ajuste só quando ele é daquele mês. null = não cai (pulado). */
export function recurringInMonth(rec: Recurring, month: MonthKey): { amount_cents: number; edited: boolean } | null {
  const o = rec.override;
  if (o && o.month === month) {
    if ("skip" in o) return null;
    return { amount_cents: o.amount_cents, edited: true };
  }
  return { amount_cents: rec.amount_cents, edited: false };
}

/** Todas as linhas que caem no mês: fixos primeiro (pelo dia), depois compras (pela data). */
export function linesInMonth(data: UserData, month: MonthKey): MonthLine[] {
  const potName = new Map(data.pots.map((p) => [p.id, p.name]));
  const fixed: MonthLine[] = [];
  for (const rec of data.recurring) {
    const inst = recurringInMonth(rec, month);
    if (!inst) continue;
    fixed.push({
      source: "recurring",
      id: rec.id,
      description: rec.description,
      date: dateInMonth(month, rec.day),
      pot_id: rec.pot_id,
      pot_name: potName.get(rec.pot_id) ?? "",
      method: rec.method,
      amount_cents: inst.amount_cents,
      ...(inst.edited ? { edited: true } : {}),
    });
  }
  const purchases: MonthLine[] = [];
  for (const e of data.entries) {
    const inst = entryInMonth(e, month);
    if (!inst) continue;
    purchases.push({
      source: "entry",
      id: e.id,
      description: e.description,
      date: e.purchase_date,
      pot_id: e.pot_id,
      pot_name: potName.get(e.pot_id) ?? "",
      method: e.method,
      amount_cents: inst.amount_cents,
      installment: inst.installment,
      installments: e.installments,
      total_cents: e.total_cents,
      purchase_date: e.purchase_date,
    });
  }
  const byDate = (a: MonthLine, b: MonthLine) => a.date.localeCompare(b.date) || a.id - b.id;
  return [...fixed.sort(byDate), ...purchases.sort(byDate)];
}

function sumBy(lines: MonthLine[], method: PaymentMethod): number {
  return lines.reduce((s, l) => (l.method === method ? s + l.amount_cents : s), 0);
}

function incomeTotal(data: UserData): number {
  return data.incomes.reduce((s, i) => s + i.amount_cents, 0);
}

export function forecast(data: UserData, after: MonthKey, months = FORECAST_MONTHS): ForecastMonth[] {
  const income = incomeTotal(data);
  const out: ForecastMonth[] = [];
  for (let i = 1; i <= months; i++) {
    const month = addMonths(after, i);
    const lines = linesInMonth(data, month);
    const cartao = sumBy(lines, "cartao");
    const debito = sumBy(lines, "debito");
    const total = cartao + debito;
    out.push({
      month,
      cartao_cents: cartao,
      debito_cents: debito,
      total_cents: total,
      income_cents: income,
      free_cents: income - total,
      pct_of_income: pct(total, income),
    });
  }
  return out;
}

export interface ComputeOptions {
  kind: MonthView["kind"];
  currentMonth: MonthKey;
  closedAt?: string | null;
}

/**
 * Calcula o mês inteiro a partir dos dados brutos. É a mesma função para o mês atual, para a
 * previsão de meses futuros e para a foto tirada quando um mês fecha.
 */
export function computeMonth(data: UserData, month: MonthKey, opts: ComputeOptions): MonthView {
  const { settings } = data;
  const warn = settings.warn_pct;
  const lines = linesInMonth(data, month);

  const used = new Map<number, number>();
  for (const l of lines) used.set(l.pot_id, (used.get(l.pot_id) ?? 0) + l.amount_cents);

  // potes arquivados só aparecem se ainda têm algo caindo no mês (ex.: parcelas em andamento)
  const pots: MonthPot[] = data.pots
    .filter((p) => !p.archived_at || (used.get(p.id) ?? 0) > 0)
    .map((p) => {
      const u = used.get(p.id) ?? 0;
      return {
        id: p.id,
        name: p.name,
        kind: p.kind,
        budget_cents: p.amount_cents,
        used_cents: u,
        remaining_cents: p.amount_cents - u,
        pct: pct(u, p.amount_cents),
        status: potStatus(p.kind, u, p.amount_cents, warn),
        archived: !!p.archived_at,
      };
    });

  const income = incomeTotal(data);
  const budgeted = data.pots.filter((p) => !p.archived_at).reduce((s, p) => s + p.amount_cents, 0);
  const cartao = sumBy(lines, "cartao");
  const debito = sumBy(lines, "debito");
  const spent = cartao + debito;
  const fixed = lines.filter((l) => l.source === "recurring").reduce((s, l) => s + l.amount_cents, 0);

  const cardLines = lines.filter((l) => l.method === "cartao");
  const cardFuture = data.entries
    .filter((e) => e.method === "cartao")
    .reduce((s, e) => {
      // parcelas depois deste mês, sem contar as de meses anteriores ao lançamento
      const sched = entrySchedule(e);
      if (sched.last_month <= month) return s;
      return s + remainingAfter(e, month);
    }, 0);

  const installments: InstallmentInProgress[] = [];
  for (const e of data.entries) {
    if (e.method !== "cartao" || e.installments <= 1) continue;
    const inst = entryInMonth(e, month);
    if (!inst) continue;
    const sched = entrySchedule(e);
    installments.push({
      entry_id: e.id,
      description: e.description,
      pot_id: e.pot_id,
      installment: inst.installment,
      installments: e.installments,
      amount_cents: inst.amount_cents,
      remaining_cents: remainingAfter(e, month),
      first_month: sched.first_month,
      last_month: sched.last_month,
      is_last: inst.installment === e.installments,
    });
  }
  installments.sort((a, b) => a.last_month.localeCompare(b.last_month) || a.entry_id - b.entry_id);

  return {
    schema: SNAPSHOT_SCHEMA,
    month,
    kind: opts.kind,
    editable: opts.kind === "atual",
    current_month: opts.currentMonth,
    closed_at: opts.closedAt ?? null,
    settings: {
      personal_limit_cents: settings.personal_limit_cents,
      bank_limit_cents: settings.bank_limit_cents,
      warn_pct: warn,
    },
    incomes: data.incomes.map((i) => ({ id: i.id, name: i.name, amount_cents: i.amount_cents })),
    pots,
    lines,
    totals: {
      income_cents: income,
      budgeted_cents: budgeted,
      unallocated_cents: income - budgeted,
      spent_cents: spent,
      available_cents: income - spent,
      fixed_cents: fixed,
      fixed_pct_of_income: pct(fixed, income),
      fixed_status: limitStatus(fixed, income, warn),
      spent_status: limitStatus(spent, income, warn),
      by_method: { cartao, debito },
    },
    card: {
      personal_limit_cents: settings.personal_limit_cents,
      bank_limit_cents: settings.bank_limit_cents,
      invoice_cents: cartao,
      remaining_cents: settings.personal_limit_cents - cartao,
      personal_limit_used_pct: pct(cartao, settings.personal_limit_cents),
      status: limitStatus(cartao, settings.personal_limit_cents, warn),
      committed_cents: cartao + cardFuture,
      items: cardLines.map((l) => ({
        source: l.source,
        id: l.id,
        description: l.description,
        amount_cents: l.amount_cents,
        ...(l.installments ? { installment: l.installment, installments: l.installments } : {}),
      })),
    },
    installments_in_progress: installments,
    forecast: forecast(data, month),
  };
}
