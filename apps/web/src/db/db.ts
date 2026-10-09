import type { Entry, Income, MonthSnapshot, Pot, Recurring, Settings } from "@pots/shared";
import Dexie, { type Table } from "dexie";

/**
 * Banco do navegador (IndexedDB). Uma tabela por tabela da modelagem, com os mesmos campos de um
 * banco SQL: um backup exportado daqui alimenta um banco no futuro, linha por linha.
 */
export class PotsDB extends Dexie {
  settings!: Table<Settings, "settings">;
  incomes!: Table<Income, string>;
  pots!: Table<Pot, string>;
  entries!: Table<Entry, string>;
  recurring!: Table<Recurring, string>;
  month_snapshots!: Table<MonthSnapshot, string>;

  constructor(name = "pots") {
    super(name);
    // Mudou o formato? Crie version(2) com .upgrade(); nunca altere a version(1).
    this.version(1).stores({
      settings: "id",
      incomes: "id, updated_at",
      pots: "id, updated_at",
      entries: "id, purchase_date, updated_at",
      recurring: "id, updated_at",
      month_snapshots: "month",
    });
  }
}

export const DATA_TABLES = ["settings", "incomes", "pots", "entries", "recurring", "month_snapshots"] as const;
