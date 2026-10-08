// Contratos da API. Todo valor de dinheiro é em centavos inteiros (campos *_cents).
import type { DateKey, MonthKey } from "./month.ts";

export type PotKind = "gasto" | "meta";
export type PaymentMethod = "cartao" | "debito";

/** gasto: ok < aviso (a partir de warn_pct) < estourou (acima do valor). meta: pendente | cumprida. */
export type PotStatus = "ok" | "aviso" | "estourou" | "pendente" | "cumprida";
export type LimitStatus = "ok" | "aviso" | "estourou";

/** passado vem da foto do mês; atual é calculado e editável; futuro é previsão somente leitura. */
export type MonthKind = "passado" | "atual" | "futuro";

// ---------- dados brutos (o que a pessoa digita) ----------

export interface Settings {
  personal_limit_cents: number;
  bank_limit_cents: number;
  warn_pct: number;
  timezone: string;
}

export interface Income {
  id: number;
  name: string;
  amount_cents: number;
}

export interface Pot {
  id: number;
  name: string;
  kind: PotKind;
  amount_cents: number;
  archived_at: string | null;
}

export interface Entry {
  id: number;
  description: string;
  total_cents: number;
  purchase_date: DateKey;
  /** Mês em que a compra foi lançada no app. Define onde cai uma compra à vista esquecida. */
  registered_month: MonthKey;
  pot_id: number;
  method: PaymentMethod;
  installments: number;
}

/** Ajuste de um fixo que vale só para o mês indicado (sempre o mês atual quando foi gravado). */
export type RecurringOverride =
  | { month: MonthKey; skip: true }
  | { month: MonthKey; amount_cents: number };

export interface Recurring {
  id: number;
  description: string;
  amount_cents: number;
  day: number;
  pot_id: number;
  method: PaymentMethod;
  override: RecurringOverride | null;
}

// ---------- mês calculado (GET /api/mes/:month) ----------

export interface MonthLine {
  source: "recurring" | "entry";
  id: number;
  description: string;
  date: DateKey;
  pot_id: number;
  pot_name: string;
  method: PaymentMethod;
  amount_cents: number;
  /** Fixo com ajuste neste mês. */
  edited?: boolean;
  /** Só em compras: parcela deste mês, total de parcelas e valor total. */
  installment?: number;
  installments?: number;
  total_cents?: number;
  purchase_date?: DateKey;
}

export interface MonthPot {
  id: number;
  name: string;
  kind: PotKind;
  budget_cents: number;
  used_cents: number;
  /** Quanto falta (positivo) ou passou (negativo) do valor do pote. */
  remaining_cents: number;
  /** used / budget em %, arredondado. null quando o pote não tem valor. */
  pct: number | null;
  status: PotStatus;
  archived: boolean;
}

export interface MonthTotals {
  income_cents: number;
  budgeted_cents: number;
  unallocated_cents: number;
  spent_cents: number;
  available_cents: number;
  fixed_cents: number;
  fixed_pct_of_income: number | null;
  fixed_status: LimitStatus;
  spent_status: LimitStatus;
  by_method: Record<PaymentMethod, number>;
}

export interface CardItem {
  source: "recurring" | "entry";
  id: number;
  description: string;
  amount_cents: number;
  installment?: number;
  installments?: number;
}

export interface MonthCard {
  personal_limit_cents: number;
  bank_limit_cents: number;
  /** Fatura mínima: soma do que foi registrado no cartão neste mês. */
  invoice_cents: number;
  /** Quanto ainda cabe no limite pessoal (negativo se passou). */
  remaining_cents: number;
  personal_limit_used_pct: number | null;
  status: LimitStatus;
  /** Fatura deste mês + parcelas futuras já registradas. */
  committed_cents: number;
  items: CardItem[];
}

export interface InstallmentInProgress {
  entry_id: number;
  description: string;
  pot_id: number;
  installment: number;
  installments: number;
  /** Parcela que cai neste mês. */
  amount_cents: number;
  /** Soma das próximas faturas, depois deste mês. */
  remaining_cents: number;
  first_month: MonthKey;
  last_month: MonthKey;
  is_last: boolean;
}

export interface ForecastMonth {
  month: MonthKey;
  cartao_cents: number;
  debito_cents: number;
  total_cents: number;
  income_cents: number;
  free_cents: number;
  pct_of_income: number | null;
}

export interface MonthView {
  schema: 1;
  month: MonthKey;
  kind: MonthKind;
  editable: boolean;
  current_month: MonthKey;
  closed_at: string | null;
  settings: Omit<Settings, "timezone">;
  incomes: { id: number; name: string; amount_cents: number }[];
  pots: MonthPot[];
  lines: MonthLine[];
  totals: MonthTotals;
  card: MonthCard;
  installments_in_progress: InstallmentInProgress[];
  forecast: ForecastMonth[];
}

// ---------- prévias ----------

export interface PurchasePreview {
  current_month: MonthKey;
  installments: number;
  installment_cents: number;
  last_installment_cents: number;
  first_month: MonthKey;
  last_month: MonthKey;
  /** Parcela que cai no mês atual (null se a compra já terminou). */
  current_installment: number | null;
  current_amount_cents: number;
  /** Soma das parcelas depois do mês atual. */
  remaining_after_current_cents: number;
}

export interface PlanningPreview {
  income_cents: number;
  budgeted_cents: number;
  unallocated_cents: number;
}

export interface ApiError {
  error: { code: string; message: string };
}
