import type { Global, MonthRecord } from "@pots/shared";
import Dexie, { type Table } from "dexie";

/**
 * Banco do navegador (IndexedDB), no mesmo formato do backup: um registro por mês e um com o que vale
 * para todos os meses.
 */
export class PotsDB extends Dexie {
  months!: Table<MonthRecord, string>;
  global!: Table<Global, "global">;

  constructor(name = "pots") {
    super(name);
    // Mudou o formato? Crie uma versão nova com .upgrade(); nunca altere as anteriores.
    this.version(1).stores({
      settings: "id",
      incomes: "id, updated_at",
      pots: "id, updated_at",
      entries: "id, purchase_date, updated_at",
      recurring: "id, updated_at",
      month_snapshots: "month",
    });
    // v2: dados por mês. O formato da v1 nunca foi para produção, então as tabelas antigas são descartadas.
    this.version(2).stores({
      settings: null,
      incomes: null,
      pots: null,
      entries: null,
      recurring: null,
      month_snapshots: null,
      months: "month",
      global: "id",
    });
  }
}
