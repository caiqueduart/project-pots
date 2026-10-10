// Todas as leituras e gravações do app. As telas só chamam estas funções e mostram o resultado.
import { allEntries, computeMonth, emptyGlobal, entryInMonth, localDate, localMonth, rollMonths, type PotsData } from "@pots/core";
import {
  cardPlanSchema,
  entryInputSchema,
  fixedInputSchema,
  incomeInputSchema,
  potInputSchema,
  type CardPlanInput,
  type EntryInput,
  type FixedInput,
  type Global,
  type IncomeInput,
  type MonthKey,
  type MonthRecord,
  type MonthView,
  type PotInput,
} from "@pots/shared";
import type { ZodType } from "zod";
import type { PotsDB } from "./db.ts";

/** Erro mostrado para a pessoa (mensagem já em português). */
export class PotsError extends Error {}

export type Clock = () => Date;

function parse<T>(schema: ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new PotsError(r.error.issues[0]?.message ?? "Dados inválidos");
  return r.data;
}

function find<T extends { id: string }>(list: T[], id: string): T {
  const item = list.find((x) => x.id === id);
  if (!item) throw new PotsError("Registro não encontrado");
  return item;
}

interface WriteCtx {
  /** O mês aberto (o atual). As mudanças feitas nele e no global são gravadas no fim. */
  month: MonthRecord;
  global: Global;
  current: MonthKey;
  today: string;
}

export class Store {
  constructor(
    readonly db: PotsDB,
    private readonly now: Clock = () => new Date(),
  ) {}

  // ---------- leitura ----------

  /** Mês atual no horário de Brasília. */
  currentMonth(): MonthKey {
    return localMonth(this.now());
  }

  today(): string {
    return localDate(this.now());
  }

  async data(): Promise<PotsData> {
    const [months, global] = await Promise.all([this.db.months.orderBy("month").toArray(), this.db.global.get("global")]);
    return { months, global: global ?? emptyGlobal() };
  }

  /** O mês aberto. undefined só antes da primeira virada (closePastMonths roda ao abrir o app). */
  currentRecord(): Promise<MonthRecord | undefined> {
    return this.db.months.get(this.currentMonth());
  }

  /** Primeiro mês de uso. Antes dele não há dados. */
  async firstMonth(): Promise<MonthKey | null> {
    return (await this.db.months.orderBy("month").first())?.month ?? null;
  }

  /** Há algo que valha um backup: compras ou fixos. */
  async hasData(): Promise<boolean> {
    const { months, global } = await this.data();
    return global.fixed.length > 0 || months.some((m) => m.entries.length > 0);
  }

  /**
   * O mês pronto para a tela. Passado: recalculado com o que ficou guardado nele (null se for antes do
   * primeiro uso). Atual: editável. Futuro: previsão somente leitura.
   */
  async monthView(month: MonthKey): Promise<MonthView | null> {
    return computeMonth(await this.data(), month, this.currentMonth());
  }

  // ---------- virada do mês ----------

  /**
   * Fecha os meses que viraram e abre o mês atual (copiando o plano e os fixos). Roda ao abrir o app,
   * quando ele volta a ficar visível e antes de cada gravação. Devolve quantos meses fecharam.
   */
  async closePastMonths(): Promise<number> {
    return this.db.transaction("rw", [this.db.months, this.db.global], async () => {
      const changed = rollMonths(await this.data(), this.currentMonth(), this.now());
      if (changed.length) await this.db.months.bulkPut(changed);
      return changed.filter((m) => m.closed_at).length;
    });
  }

  /** Toda gravação passa por aqui: vira o mês se preciso e grava o mês aberto e o global numa transação. */
  private async write<T>(fn: (ctx: WriteCtx) => T | Promise<T>): Promise<T> {
    await this.closePastMonths();
    return this.db.transaction("rw", [this.db.months, this.db.global], async () => {
      const current = this.currentMonth();
      const month = await this.db.months.get(current);
      if (!month) throw new PotsError("O mês atual não está aberto. Recarregue a página.");
      const global = (await this.db.global.get("global")) ?? emptyGlobal();
      const result = await fn({ month, global, current, today: this.today() });
      await this.db.months.put(month);
      await this.db.global.put(global);
      return result;
    });
  }

  // ---------- cartão (plano do mês) ----------

  updateCard(input: Partial<CardPlanInput>) {
    return this.write(({ month }) => {
      month.plan.card = parse(cardPlanSchema, { ...month.plan.card, ...input });
    });
  }

  // ---------- renda ----------

  addIncome(input: IncomeInput) {
    return this.write(({ month }) => {
      const row = { id: crypto.randomUUID(), ...parse(incomeInputSchema, input) };
      month.plan.incomes.push(row);
      return row;
    });
  }

  updateIncome(id: string, input: Partial<IncomeInput>) {
    return this.write(({ month }) => {
      const cur = find(month.plan.incomes, id);
      Object.assign(cur, parse(incomeInputSchema, { ...cur, ...input }));
    });
  }

  deleteIncome(id: string) {
    return this.write(({ month }) => {
      find(month.plan.incomes, id);
      month.plan.incomes = month.plan.incomes.filter((i) => i.id !== id);
    });
  }

  // ---------- potes ----------

  addPot(input: PotInput) {
    return this.write(({ month }) => {
      const row = { id: crypto.randomUUID(), ...parse(potInputSchema, input) };
      month.plan.pots.push(row);
      return row;
    });
  }

  updatePot(id: string, input: Partial<PotInput>) {
    return this.write(({ month }) => {
      const cur = find(month.plan.pots, id);
      Object.assign(cur, parse(potInputSchema, { ...cur, ...input }));
    });
  }

  /** Tira o pote do plano. Meses fechados e parcelas antigas continuam com ele (o nome fica guardado neles). */
  removePot(id: string) {
    return this.write(({ month, global }) => {
      find(month.plan.pots, id);
      if ([...month.fixed, ...global.fixed].some((f) => f.pot_id === id))
        throw new PotsError("Esse pote tem fixos. Mova ou exclua os fixos antes de remover o pote.");
      month.plan.pots = month.plan.pots.filter((p) => p.id !== id);
    });
  }

  private checkPot(month: MonthRecord, id: string) {
    if (!month.plan.pots.some((p) => p.id === id)) throw new PotsError("Pote não encontrado");
  }

  // ---------- compras ----------

  private checkEntry(input: EntryInput, today: string) {
    const e = parse(entryInputSchema, input);
    if (e.purchase_date > today) throw new PotsError("A data da compra não pode ser futura");
    return e;
  }

  addEntry(input: EntryInput) {
    return this.write(({ month, today }) => {
      const e = this.checkEntry(input, today);
      this.checkPot(month, e.pot_id);
      const row = { id: crypto.randomUUID(), ...e };
      month.entries.push(row);
      return row;
    });
  }

  /** Só compras lançadas no mês atual podem ser editadas: as de meses fechados não mudam. */
  updateEntry(id: string, input: Partial<EntryInput>) {
    return this.write(({ month, today }) => {
      const cur = month.entries.find((e) => e.id === id);
      if (!cur) throw new PotsError("Só dá para editar compras lançadas neste mês. Exclua (as parcelas param) e lance de novo.");
      const e = this.checkEntry({ ...cur, ...input }, today);
      if (e.pot_id !== cur.pot_id) this.checkPot(month, e.pot_id);
      Object.assign(cur, e);
    });
  }

  /**
   * Compra lançada neste mês: sai de vez. Compra de um mês fechado: as parcelas param a partir deste mês
   * e os meses fechados ficam como estavam.
   */
  deleteEntry(id: string): Promise<"excluida" | "parada"> {
    return this.write(async ({ month, current }) => {
      if (month.entries.some((e) => e.id === id)) {
        month.entries = month.entries.filter((e) => e.id !== id);
        return "excluida";
      }
      const old = allEntries((await this.data()).months).find((e) => e.id === id && e.registered_month < current);
      if (!old || !entryInMonth(old, current)) throw new PotsError("Registro não encontrado");
      month.stopped_entries.push(id);
      return "parada";
    });
  }

  // ---------- fixos ----------

  /** Fixo novo: entra no mês atual e no modelo dos próximos meses. */
  addRecurring(input: FixedInput) {
    return this.write(({ month, global }) => {
      const f = parse(fixedInputSchema, input);
      this.checkPot(month, f.pot_id);
      const row = { id: crypto.randomUUID(), ...f };
      month.fixed.push({ ...row });
      global.fixed.push(row);
      return row;
    });
  }

  /**
   * Editar um fixo:
   * - "mes": vale só para o mês atual (o fixo do mês fica marcado como ajustado);
   * - "em_diante": muda o fixo do mês atual e o modelo dos próximos meses.
   */
  editRecurring(id: string, input: FixedInput, scope: "mes" | "em_diante") {
    return this.write(({ month, global }) => {
      const cur = find(month.fixed, id);
      const f = parse(fixedInputSchema, input);
      if (f.pot_id !== cur.pot_id) this.checkPot(month, f.pot_id);
      const i = month.fixed.indexOf(cur);
      if (scope === "mes") {
        month.fixed[i] = { id, ...f, edited: true };
        return;
      }
      month.fixed[i] = { id, ...f };
      const g = global.fixed.findIndex((x) => x.id === id);
      if (g >= 0) global.fixed[g] = { id, ...f };
      else global.fixed.push({ id, ...f });
    });
  }

  /** "mes" tira só do mês atual; "em_diante" tira também dos próximos. Os meses fechados não mudam. */
  deleteRecurring(id: string, scope: "mes" | "em_diante") {
    return this.write(({ month, global }) => {
      find(month.fixed, id);
      month.fixed = month.fixed.filter((f) => f.id !== id);
      if (scope === "em_diante") global.fixed = global.fixed.filter((f) => f.id !== id);
    });
  }
}
