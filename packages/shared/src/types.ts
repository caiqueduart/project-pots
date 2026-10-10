// Modelo de dados do Pots. Todo valor de dinheiro é em centavos inteiros (campos *_cents).
// O navegador (IndexedDB) e o arquivo de backup usam exatamente estes formatos.
import type { DateKey, MonthKey } from "./month.ts";

/** UUID gerado no aparelho (crypto.randomUUID). Nunca colide entre aparelhos ou pessoas. */
export type Id = string;
/** Instante em ISO 8601 (UTC). */
export type Timestamp = string;

export type PotKind = "gasto" | "meta";
export type PaymentMethod = "cartao" | "debito";

/** gasto: ok < aviso (a partir de warn_pct) < estourou (acima do valor). meta: pendente | cumprida. */
export type PotStatus = "ok" | "aviso" | "estourou" | "pendente" | "cumprida";
export type LimitStatus = "ok" | "aviso" | "estourou";

/** passado é um mês fechado; atual é editável; futuro é previsão somente leitura. */
export type MonthKind = "passado" | "atual" | "futuro";

// ---------- o que a pessoa digita ----------
// Cada mês guarda o próprio plano, os fixos e as compras lançadas nele. Um mês fechado não muda mais.
// Não há exclusão "de mentira": no mês aberto, apagar tira o item da lista.

export interface Income {
  id: Id;
  name: string;
  amount_cents: number;
}

export interface Pot {
  id: Id;
  name: string;
  kind: PotKind;
  amount_cents: number;
}

export interface CardPlan {
  personal_limit_cents: number;
  bank_limit_cents: number;
}

/** Renda, potes e limites do cartão que valem no mês. */
export interface MonthPlan {
  incomes: Income[];
  pots: Pot[];
  card: CardPlan;
}

/** Conta que se repete todo mês. */
export interface Fixed {
  id: Id;
  description: string;
  amount_cents: number;
  day: number;
  pot_id: Id;
  method: PaymentMethod;
}

/** Fixo como ficou no mês. edited = ajustado só naquele mês. */
export interface MonthFixed extends Fixed {
  edited?: true;
}

/** Compra lançada no mês. Parcelada, as próximas parcelas caem nos meses seguintes. */
export interface Entry {
  id: Id;
  description: string;
  total_cents: number;
  purchase_date: DateKey;
  pot_id: Id;
  method: PaymentMethod;
  installments: number;
}

export interface MonthRecord {
  month: MonthKey;
  /** Quando o mês fechou. null = mês aberto (o atual). */
  closed_at: Timestamp | null;
  plan: MonthPlan;
  fixed: MonthFixed[];
  entries: Entry[];
  /** Compras de meses anteriores cujas parcelas pararam a partir deste mês (cancelada, quitada). */
  stopped_entries: Id[];
}

/** O que vale para todos os meses: os fixos que cada mês novo recebe. */
export interface Global {
  id: "global";
  fixed: Fixed[];
}

// ---------- mês calculado ----------

export interface MonthLine {
  source: "recurring" | "entry";
  id: Id;
  description: string;
  date: DateKey;
  pot_id: Id;
  pot_name: string;
  method: PaymentMethod;
  amount_cents: number;
  /** Fixo com ajuste neste mês. */
  edited?: boolean;
  /** Só em compras: mês em que foi lançada. Só dá para editar no mês em que foi lançada. */
  registered_month?: MonthKey;
  /** Só em compras: parcela deste mês, total de parcelas, valor total e data. */
  installment?: number;
  installments?: number;
  total_cents?: number;
  purchase_date?: DateKey;
}

export interface MonthPot {
  id: Id;
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
  id: Id;
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
  entry_id: Id;
  description: string;
  pot_id: Id;
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
  month: MonthKey;
  kind: MonthKind;
  editable: boolean;
  current_month: MonthKey;
  closed_at: Timestamp | null;
  settings: { personal_limit_cents: number; bank_limit_cents: number; warn_pct: number };
  incomes: { id: Id; name: string; amount_cents: number }[];
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
