import {
  addMonths,
  dateInMonth,
  type ForecastMonth,
  type Id,
  type InstallmentInProgress,
  type MonthKey,
  type MonthLine,
  type MonthPot,
  type MonthView,
  type PaymentMethod,
} from "@pots/shared";
import { entryInMonth, entrySchedule, remainingAfter } from "./installments.ts";
import { monthInput, WARN_PCT } from "./months.ts";
import { limitStatus, pct, potStatus } from "./status.ts";
import type { MonthInput, PotsData } from "./types.ts";

/** Quantos meses a previsão mostra depois do mês visto. */
export const FORECAST_MONTHS = 6;

/** Todas as linhas que caem no mês: fixos primeiro (pelo dia), depois compras (pela data). */
export function linesInMonth(input: MonthInput, month: MonthKey): MonthLine[] {
  const potName = (id: Id) => input.pots.get(id)?.name ?? "";
  const fixed: MonthLine[] = input.fixed.map((f) => ({
    source: "recurring",
    id: f.id,
    description: f.description,
    date: dateInMonth(month, f.day),
    pot_id: f.pot_id,
    pot_name: potName(f.pot_id),
    method: f.method,
    amount_cents: f.amount_cents,
    ...(f.edited ? { edited: true } : {}),
  }));
  const purchases: MonthLine[] = [];
  for (const e of input.entries) {
    const inst = entryInMonth(e, month);
    if (!inst) continue;
    purchases.push({
      source: "entry",
      id: e.id,
      description: e.description,
      date: e.purchase_date,
      pot_id: e.pot_id,
      pot_name: potName(e.pot_id),
      method: e.method,
      amount_cents: inst.amount_cents,
      installment: inst.installment,
      installments: e.installments,
      total_cents: e.total_cents,
      purchase_date: e.purchase_date,
      registered_month: e.registered_month,
    });
  }
  const byDate = (a: MonthLine, b: MonthLine) =>
    a.date.localeCompare(b.date) || a.description.localeCompare(b.description, "pt-BR");
  return [...fixed.sort(byDate), ...purchases.sort(byDate)];
}

function sumBy(lines: MonthLine[], method: PaymentMethod): number {
  return lines.reduce((s, l) => (l.method === method ? s + l.amount_cents : s), 0);
}

function incomeTotal(input: MonthInput): number {
  return input.plan.incomes.reduce((s, i) => s + i.amount_cents, 0);
}

export function forecast(data: PotsData, after: MonthKey, current: MonthKey, months = FORECAST_MONTHS): ForecastMonth[] {
  const out: ForecastMonth[] = [];
  for (let i = 1; i <= months; i++) {
    const month = addMonths(after, i);
    const input = monthInput(data, month, current);
    if (!input) continue;
    const income = incomeTotal(input);
    const lines = linesInMonth(input, month);
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

/**
 * Calcula o mês inteiro a partir do que está guardado. É a mesma função para o mês atual, para os meses
 * fechados (recalculados com o que ficou guardado neles) e para a previsão. As telas só mostram o resultado.
 * null = mês antes do primeiro uso.
 */
export function computeMonth(data: PotsData, month: MonthKey, current: MonthKey): MonthView | null {
  const input = monthInput(data, month, current);
  if (!input) return null;
  const kind: MonthView["kind"] = month < current ? "passado" : month === current ? "atual" : "futuro";
  const record = data.months.find((m) => m.month === month);
  const card = input.plan.card;
  const warn = WARN_PCT;
  const lines = linesInMonth(input, month);

  const used = new Map<Id, number>();
  for (const l of lines) used.set(l.pot_id, (used.get(l.pot_id) ?? 0) + l.amount_cents);

  // potes removidos só aparecem se ainda têm algo caindo no mês (ex.: parcelas em andamento)
  const inPlan = new Set(input.plan.pots.map((p) => p.id));
  const removed = [...used.keys()].filter((id) => !inPlan.has(id)).flatMap((id) => input.pots.get(id) ?? []);
  const pots: MonthPot[] = [...input.plan.pots, ...removed].map((p) => {
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
      archived: !inPlan.has(p.id),
    };
  });

  const income = incomeTotal(input);
  const budgeted = input.plan.pots.reduce((s, p) => s + p.amount_cents, 0);
  const cartao = sumBy(lines, "cartao");
  const debito = sumBy(lines, "debito");
  const spent = cartao + debito;
  const fixed = lines.filter((l) => l.source === "recurring").reduce((s, l) => s + l.amount_cents, 0);

  const cardLines = lines.filter((l) => l.method === "cartao");
  const cardFuture = input.entries
    .filter((e) => e.method === "cartao")
    .reduce((s, e) => {
      // parcelas depois deste mês, sem contar as de meses anteriores ao lançamento
      const sched = entrySchedule(e);
      if (sched.last_month <= month) return s;
      return s + remainingAfter(e, month);
    }, 0);

  const installments: InstallmentInProgress[] = [];
  for (const e of input.entries) {
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
      is_last: sched.last_month === month,
    });
  }
  installments.sort((a, b) => a.last_month.localeCompare(b.last_month) || a.description.localeCompare(b.description, "pt-BR"));

  return {
    month,
    kind,
    editable: kind === "atual",
    current_month: current,
    closed_at: kind === "passado" ? (record?.closed_at ?? null) : null,
    settings: {
      personal_limit_cents: card.personal_limit_cents,
      bank_limit_cents: card.bank_limit_cents,
      warn_pct: warn,
    },
    incomes: input.plan.incomes.map((i) => ({ id: i.id, name: i.name, amount_cents: i.amount_cents })),
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
      personal_limit_cents: card.personal_limit_cents,
      bank_limit_cents: card.bank_limit_cents,
      invoice_cents: cartao,
      remaining_cents: card.personal_limit_cents - cartao,
      personal_limit_used_pct: pct(cartao, card.personal_limit_cents),
      status: limitStatus(cartao, card.personal_limit_cents, warn),
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
    forecast: forecast(data, month, current),
  };
}
