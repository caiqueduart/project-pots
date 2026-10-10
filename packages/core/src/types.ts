import type { Entry, Global, Id, MonthFixed, MonthKey, MonthPlan, MonthRecord, Pot } from "@pots/shared";

/** Tudo o que está guardado: os meses (do mais antigo ao mais novo) e o que vale para todos. */
export interface PotsData {
  months: MonthRecord[];
  global: Global;
}

/** Compra pronta para o cálculo: com o mês em que foi lançada e o mês em que as parcelas pararam. */
export interface CalcEntry extends Entry {
  registered_month: MonthKey;
  /** As parcelas deste mês em diante não caem mais. null = segue até o fim. */
  stopped_month: MonthKey | null;
}

/** O que entra no cálculo de um mês. */
export interface MonthInput {
  plan: MonthPlan;
  fixed: MonthFixed[];
  /** Compras lançadas até este mês (de qualquer mês), para as parcelas em andamento. */
  entries: CalcEntry[];
  /** Último formato conhecido de cada pote, inclusive os removidos (nome de parcelas antigas). */
  pots: Map<Id, Pot>;
}
