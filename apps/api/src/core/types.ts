import type { Entry, Income, Pot, Recurring, Settings } from "@pots/shared";

/** Tudo que o usuário digitou, como está no banco agora. É a única entrada dos cálculos. */
export interface UserData {
  settings: Settings;
  incomes: Income[];
  pots: Pot[];
  entries: Entry[];
  recurring: Recurring[];
}
