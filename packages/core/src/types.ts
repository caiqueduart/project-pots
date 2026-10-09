import type { Entry, Income, Pot, Recurring, Settings } from "@pots/shared";

/**
 * Tudo que a pessoa digitou, como está guardado agora. É a única entrada dos cálculos.
 * Linhas excluídas (deleted_at) não entram aqui.
 */
export interface UserData {
  settings: Pick<Settings, "personal_limit_cents" | "bank_limit_cents" | "warn_pct">;
  incomes: Income[];
  pots: Pot[];
  entries: Entry[];
  recurring: Recurring[];
}
