// Todas as leituras e gravações do app. As telas só chamam estas funções e mostram o resultado.
import {
  closeMonths,
  computeMonth,
  localDate,
  localMonth,
  monthsToClose,
  TIME_ZONE,
  type UserData,
} from "@pots/core";
import {
  entryInputSchema,
  incomeInputSchema,
  potInputSchema,
  recurringInputSchema,
  settingsInputSchema,
  type EntryInput,
  type IncomeInput,
  type MonthKey,
  type MonthView,
  type PotInput,
  type Recurring,
  type RecurringInput,
  type RecurringOverride,
  type RowMeta,
  type Settings,
  type SettingsInput,
} from "@pots/shared";
import type { ZodType } from "zod";
import type { Table } from "dexie";
import type { PotsDB } from "./db.ts";

/** Erro mostrado para a pessoa (mensagem já em português). */
export class PotsError extends Error {}

export type Clock = () => Date;

function parse<T>(schema: ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new PotsError(r.error.issues[0]?.message ?? "Dados inválidos");
  return r.data;
}

const alive = <T extends { deleted_at: string | null }>(rows: T[]) => rows.filter((r) => !r.deleted_at);

export class Store {
  constructor(
    readonly db: PotsDB,
    private readonly now: Clock = () => new Date(),
  ) {}

  private lastCreated = 0;

  private meta(): RowMeta {
    // created_at estritamente crescente: a ordem da tela é a ordem de criação, mesmo no mesmo milissegundo
    const ms = Math.max(this.now().getTime(), this.lastCreated + 1);
    this.lastCreated = ms;
    const t = new Date(ms).toISOString();
    return { id: crypto.randomUUID(), created_at: t, updated_at: t, deleted_at: null };
  }

  private stamp() {
    return { updated_at: this.now().toISOString() };
  }

  // ---------- leitura ----------

  async settings(): Promise<Settings> {
    const s = await this.db.settings.get("settings");
    if (s) return s;
    const t = this.now().toISOString();
    const fresh: Settings = {
      id: "settings",
      personal_limit_cents: 0,
      bank_limit_cents: 0,
      warn_pct: 85,
      timezone: TIME_ZONE,
      created_at: t,
      updated_at: t,
    };
    await this.db.settings.put(fresh);
    return fresh;
  }

  /** Mês atual no horário de Brasília. */
  currentMonth(): MonthKey {
    return localMonth(this.now());
  }

  today(): string {
    return localDate(this.now());
  }

  async userData(): Promise<UserData> {
    const [settings, incomes, pots, entries, recurring] = await Promise.all([
      this.settings(),
      this.db.incomes.toArray(),
      this.db.pots.toArray(),
      this.db.entries.toArray(),
      this.db.recurring.toArray(),
    ]);
    const byCreated = <T extends RowMeta>(a: T, b: T) => a.created_at.localeCompare(b.created_at);
    return {
      settings,
      incomes: alive(incomes).sort(byCreated),
      pots: alive(pots).sort(byCreated),
      entries: alive(entries).sort(byCreated),
      recurring: alive(recurring).sort(byCreated),
    };
  }

  /**
   * O mês pronto para a tela. Passado: a foto (null se for antes do primeiro uso).
   * Atual: calculado e editável. Futuro: previsão somente leitura.
   */
  async monthView(month: MonthKey): Promise<MonthView | null> {
    const current = this.currentMonth();
    if (month < current) {
      const snap = await this.db.month_snapshots.get(month);
      return snap ? { ...snap.data, current_month: current } : null;
    }
    const data = await this.userData();
    return computeMonth(data, month, { kind: month === current ? "atual" : "futuro", currentMonth: current });
  }

  // ---------- virada do mês ----------

  /**
   * Fecha os meses que viraram: tira a foto antes de qualquer gravação. Roda ao abrir o app,
   * quando ele volta a ficar visível e antes de cada gravação.
   */
  async closePastMonths(): Promise<number> {
    return this.db.transaction("rw", [this.db.settings, this.db.incomes, this.db.pots, this.db.entries, this.db.recurring, this.db.month_snapshots], async () => {
      const settings = await this.settings();
      const current = this.currentMonth();
      const last = await this.db.month_snapshots.orderBy("month").last();
      const months = monthsToClose(localMonth(new Date(settings.created_at)), last?.month ?? null, current);
      if (!months.length) return 0;
      const snaps = closeMonths(await this.userData(), months, current, this.now());
      await this.db.month_snapshots.bulkPut(snaps);
      return snaps.length;
    });
  }

  /** Toda gravação passa por aqui: fecha os meses que viraram e grava numa transação. */
  private async write<T>(fn: (ctx: { settings: Settings; current: MonthKey; today: string }) => Promise<T>): Promise<T> {
    await this.closePastMonths();
    return this.db.transaction("rw", [this.db.settings, this.db.incomes, this.db.pots, this.db.entries, this.db.recurring], async () => {
      const settings = await this.settings();
      return fn({ settings, current: this.currentMonth(), today: this.today() });
    });
  }

  // ---------- configurações ----------

  updateSettings(input: Partial<SettingsInput>) {
    return this.write(async ({ settings }) => {
      const next = parse(settingsInputSchema, {
        personal_limit_cents: settings.personal_limit_cents,
        bank_limit_cents: settings.bank_limit_cents,
        warn_pct: settings.warn_pct,
        timezone: settings.timezone,
        ...input,
      });
      await this.db.settings.update("settings", { ...next, ...this.stamp() });
    });
  }

  // ---------- renda ----------

  addIncome(input: IncomeInput) {
    return this.write(async () => {
      const row = { ...this.meta(), ...parse(incomeInputSchema, input) };
      await this.db.incomes.add(row);
      return row;
    });
  }

  updateIncome(id: string, input: Partial<IncomeInput>) {
    return this.write(async () => {
      const cur = await this.alive(this.db.incomes, id);
      await this.db.incomes.update(id, { ...parse(incomeInputSchema, { ...cur, ...input }), ...this.stamp() });
    });
  }

  deleteIncome(id: string) {
    return this.write(async () => {
      await this.alive(this.db.incomes, id);
      await this.db.incomes.update(id, { deleted_at: this.now().toISOString(), ...this.stamp() });
    });
  }

  // ---------- potes ----------

  addPot(input: PotInput) {
    return this.write(async () => {
      const row = { ...this.meta(), ...parse(potInputSchema, input), archived_at: null };
      await this.db.pots.add(row);
      return row;
    });
  }

  updatePot(id: string, input: Partial<PotInput>) {
    return this.write(async () => {
      const cur = await this.activePot(id);
      await this.db.pots.update(id, { ...parse(potInputSchema, { ...cur, ...input }), ...this.stamp() });
    });
  }

  /** Remover um pote arquiva: compras antigas e meses fechados continuam apontando para ele. */
  archivePot(id: string) {
    return this.write(async () => {
      await this.activePot(id);
      const fixed = alive(await this.db.recurring.toArray()).filter((r) => r.pot_id === id);
      if (fixed.length) throw new PotsError("Esse pote tem fixos. Mova ou exclua os fixos antes de remover o pote.");
      await this.db.pots.update(id, { archived_at: this.now().toISOString(), ...this.stamp() });
    });
  }

  // ---------- compras ----------

  private checkEntry(input: EntryInput, today: string) {
    const e = parse(entryInputSchema, input);
    if (e.purchase_date > today) throw new PotsError("A data da compra não pode ser futura");
    return e;
  }

  addEntry(input: EntryInput) {
    return this.write(async ({ current, today }) => {
      const e = this.checkEntry(input, today);
      await this.activePot(e.pot_id);
      const row = { ...this.meta(), ...e, registered_month: current };
      await this.db.entries.add(row);
      return row;
    });
  }

  updateEntry(id: string, input: Partial<EntryInput>) {
    return this.write(async ({ today }) => {
      const cur = await this.alive(this.db.entries, id);
      const e = this.checkEntry({ ...cur, ...input }, today);
      if (e.pot_id !== cur.pot_id) await this.activePot(e.pot_id);
      await this.db.entries.update(id, { ...e, ...this.stamp() });
    });
  }

  deleteEntry(id: string) {
    return this.write(async () => {
      await this.alive(this.db.entries, id);
      await this.db.entries.update(id, { deleted_at: this.now().toISOString(), ...this.stamp() });
    });
  }

  // ---------- fixos ----------

  addRecurring(input: RecurringInput) {
    return this.write(async () => {
      const r = parse(recurringInputSchema, input);
      await this.activePot(r.pot_id);
      const row: Recurring = { ...this.meta(), ...r, override: null };
      await this.db.recurring.add(row);
      return row;
    });
  }

  /**
   * Editar um fixo:
   * - "mes": vale só para o mês atual (vira um ajuste do mês);
   * - "em_diante": muda o fixo do mês atual em diante e descarta o ajuste do mês.
   */
  editRecurring(id: string, input: RecurringInput, scope: "mes" | "em_diante") {
    return this.write(async ({ current }) => {
      const cur = await this.alive(this.db.recurring, id);
      const r = parse(recurringInputSchema, input);
      if (r.pot_id !== cur.pot_id) await this.activePot(r.pot_id);
      if (scope === "em_diante") {
        await this.db.recurring.update(id, { ...r, override: null, ...this.stamp() });
        return;
      }
      const changes: Partial<RecurringInput> = {};
      for (const k of ["description", "amount_cents", "day", "pot_id", "method"] as const) {
        if (r[k] !== cur[k]) (changes as Record<string, unknown>)[k] = r[k];
      }
      const override: RecurringOverride | null = Object.keys(changes).length ? { month: current, ...changes } : null;
      await this.db.recurring.update(id, { override, ...this.stamp() });
    });
  }

  /** "mes" pula só o mês atual; "em_diante" exclui o fixo. Os meses fechados não mudam. */
  deleteRecurring(id: string, scope: "mes" | "em_diante") {
    return this.write(async ({ current }) => {
      await this.alive(this.db.recurring, id);
      const patch =
        scope === "mes"
          ? { override: { month: current, skip: true } as RecurringOverride }
          : { deleted_at: this.now().toISOString() };
      await this.db.recurring.update(id, { ...patch, ...this.stamp() });
    });
  }

  // ---------- auxiliares ----------

  private async alive<T extends RowMeta>(table: Table<T, string>, id: string): Promise<T> {
    const row = await table.get(id);
    if (!row || row.deleted_at) throw new PotsError("Registro não encontrado");
    return row;
  }

  private async activePot(id: string) {
    const pot = await this.db.pots.get(id);
    if (!pot || pot.deleted_at || pot.archived_at) throw new PotsError("Pote não encontrado");
    return pot;
  }
}
