import type { MonthView } from "@pots/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { backupFileName, exportBackup, importBackup, parseBackup } from "./backup.ts";
import { PotsDB } from "./db.ts";
import { PotsError, Store } from "./store.ts";

let db: PotsDB;
let clock: Date;
let store: Store;

beforeEach(async () => {
  db = new PotsDB(`test-${crypto.randomUUID()}`);
  // 08/out/2026 às 10h em Brasília
  clock = new Date("2026-10-08T13:00:00Z");
  store = new Store(db, () => clock);
  await store.closePastMonths(); // abre outubro, como ao abrir o app
  await store.updateCard({ personal_limit_cents: 100000, bank_limit_cents: 500000 });
});

async function seedOctober() {
  const income = await store.addIncome({ name: "Bolsa", amount_cents: 350000 });
  const moradia = await store.addPot({ name: "Moradia", kind: "gasto", amount_cents: 50000 });
  const pessoal = await store.addPot({ name: "Pessoal", kind: "gasto", amount_cents: 150000 });
  const invest = await store.addPot({ name: "Investimentos", kind: "meta", amount_cents: 100000 });
  const aluguel = await store.addRecurring({ description: "Aluguel", amount_cents: 34500, day: 5, pot_id: moradia.id, method: "debito" });
  await store.addRecurring({ description: "Netflix", amount_cents: 2090, day: 10, pot_id: pessoal.id, method: "cartao" });
  await store.addRecurring({ description: "Reserva", amount_cents: 100000, day: 5, pot_id: invest.id, method: "debito" });
  const monitor = await store.addEntry({
    description: "Monitor",
    total_cents: 52400,
    purchase_date: "2026-02-01",
    pot_id: pessoal.id,
    method: "cartao",
    installments: 10,
  });
  await store.addEntry({
    description: "Corte de cabelo",
    total_cents: 4000,
    purchase_date: "2026-10-01",
    pot_id: pessoal.id,
    method: "debito",
    installments: 1,
  });
  return { income, moradia, pessoal, invest, aluguel, monitor };
}

const view = async (m: string) => (await store.monthView(m)) as MonthView;
const october = async () => (await db.months.get("2026-10"))!;

describe("mês atual", () => {
  it("calcula o mês a partir do que está guardado nele", async () => {
    await seedOctober();
    const oct = await view("2026-10");
    expect(oct).toMatchObject({ kind: "atual", editable: true, current_month: "2026-10" });
    expect(oct.totals).toMatchObject({ income_cents: 350000, spent_cents: 34500 + 2090 + 100000 + 5240 + 4000 });
    expect(oct.card.invoice_cents).toBe(2090 + 5240);
    expect(oct.installments_in_progress[0]).toMatchObject({ description: "Monitor", installment: 9, installments: 10 });
  });

  it("guarda só o que foi digitado, com ids UUID", async () => {
    const { pessoal } = await seedOctober();
    expect(pessoal.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(pessoal).toEqual({ id: pessoal.id, name: "Pessoal", kind: "gasto", amount_cents: 150000 });
  });

  it("recusa compra com data futura e débito parcelado", async () => {
    const { pessoal } = await seedOctober();
    const base = { description: "X", total_cents: 1000, pot_id: pessoal.id, installments: 1 };
    await expect(store.addEntry({ ...base, purchase_date: "2026-10-09", method: "debito" })).rejects.toThrow("futura");
    await expect(store.addEntry({ ...base, purchase_date: "2026-10-01", method: "debito", installments: 3 })).rejects.toBeInstanceOf(PotsError);
  });

  it("apagar no mês aberto tira de vez, sem deixar rastro", async () => {
    const { monitor, income } = await seedOctober();
    const extra = await store.addPot({ name: "Explorando", kind: "gasto", amount_cents: 0 });
    await store.removePot(extra.id);
    await store.deleteIncome(income.id);
    expect(await store.deleteEntry(monitor.id)).toBe("excluida");
    const oct = await october();
    expect(oct.plan.pots.map((p) => p.name)).toEqual(["Moradia", "Pessoal", "Investimentos"]);
    expect(oct.plan.incomes).toEqual([]);
    expect(oct.entries.some((e) => e.id === monitor.id)).toBe(false);
    expect(JSON.stringify(oct)).not.toContain("Explorando");
    expect((await view("2026-10")).installments_in_progress).toEqual([]);
  });

  it("o futuro é previsão somente leitura e não é guardado", async () => {
    await seedOctober();
    expect(await view("2026-11")).toMatchObject({ kind: "futuro", editable: false });
    expect(await db.months.count()).toBe(1);
  });
});

describe("fixos", () => {
  it("editar só este mês muda o mês e não o próximo", async () => {
    const { aluguel, pessoal } = await seedOctober();
    await store.editRecurring(aluguel.id, { ...aluguel, amount_cents: 30000, pot_id: pessoal.id }, "mes");
    const oct = await view("2026-10");
    expect(oct.lines.find((l) => l.description === "Aluguel")).toMatchObject({ amount_cents: 30000, pot_id: pessoal.id, edited: true });
    const nov = await view("2026-11");
    expect(nov.lines.find((l) => l.description === "Aluguel")).toMatchObject({ amount_cents: 34500, pot_id: aluguel.pot_id });
  });

  it("editar em diante muda o mês e o modelo", async () => {
    const { aluguel } = await seedOctober();
    await store.editRecurring(aluguel.id, { ...aluguel, amount_cents: 30000 }, "mes");
    await store.editRecurring(aluguel.id, { ...aluguel, amount_cents: 36000 }, "em_diante");
    expect((await october()).fixed.find((f) => f.id === aluguel.id)).toEqual({ ...aluguel, amount_cents: 36000 });
    expect((await db.global.get("global"))!.fixed.find((f) => f.id === aluguel.id)!.amount_cents).toBe(36000);
  });

  it("excluir só este mês pula; em diante exclui", async () => {
    const { aluguel } = await seedOctober();
    await store.deleteRecurring(aluguel.id, "mes");
    expect((await view("2026-10")).lines.some((l) => l.description === "Aluguel")).toBe(false);
    expect((await view("2026-11")).lines.some((l) => l.description === "Aluguel")).toBe(true);
    await expect(store.deleteRecurring(aluguel.id, "em_diante")).rejects.toThrow("não encontrado");
  });

  it("pote com fixos não pode ser removido; sem fixos, sai do plano", async () => {
    const { moradia, aluguel } = await seedOctober();
    await expect(store.removePot(moradia.id)).rejects.toThrow("fixos");
    await store.deleteRecurring(aluguel.id, "em_diante");
    await store.removePot(moradia.id);
    expect((await view("2026-10")).pots.map((p) => p.name)).toEqual(["Pessoal", "Investimentos"]);
  });
});

describe("virada do mês", () => {
  it("fecha o mês que passou e abre o novo com o plano e os fixos", async () => {
    const { aluguel, pessoal, income } = await seedOctober();
    await store.editRecurring(aluguel.id, { ...aluguel, amount_cents: 30000 }, "mes");
    const before = await view("2026-10");

    clock = new Date("2026-11-01T03:30:00Z"); // 1º/nov, 00h30 em Brasília
    await store.updateIncome(income.id, { amount_cents: 400000 });
    await store.addEntry({
      description: "Esquecida de outubro",
      total_cents: 9900,
      purchase_date: "2026-10-20",
      pot_id: pessoal.id,
      method: "debito",
      installments: 1,
    });

    const oct = await view("2026-10");
    expect(oct).toMatchObject({ kind: "passado", editable: false, current_month: "2026-11", closed_at: "2026-11-01T03:30:00.000Z" });
    expect(oct.totals).toEqual(before.totals);
    expect(oct.lines).toEqual(before.lines);

    const nov = await view("2026-11");
    expect(nov).toMatchObject({ kind: "atual", editable: true });
    expect(nov.totals.income_cents).toBe(400000);
    expect(nov.card.personal_limit_cents).toBe(100000);
    expect(nov.lines.find((l) => l.description === "Esquecida de outubro")!.amount_cents).toBe(9900);
    expect(nov.lines.find((l) => l.description === "Aluguel")).toMatchObject({ amount_cents: 34500 });
    expect(nov.lines.find((l) => l.description === "Aluguel")!.edited).toBeUndefined();
  });

  it("compra de mês fechado: não edita; excluir para as parcelas a partir do mês atual", async () => {
    const { monitor } = await seedOctober();
    clock = new Date("2026-11-10T12:00:00Z");
    await expect(store.updateEntry(monitor.id, { description: "Outro" })).rejects.toThrow("Só dá para editar");
    expect(await store.deleteEntry(monitor.id)).toBe("parada");
    expect((await view("2026-10")).lines.some((l) => l.description === "Monitor")).toBe(true);
    expect((await view("2026-11")).lines.some((l) => l.description === "Monitor")).toBe(false);
    expect((await db.months.get("2026-11"))!.stopped_entries).toEqual([monitor.id]);
  });

  it("fecha todos os meses sem acesso; antes do primeiro uso não há mês", async () => {
    await seedOctober();
    clock = new Date("2027-01-15T12:00:00Z");
    expect(await store.closePastMonths()).toBe(3);
    for (const m of ["2026-10", "2026-11", "2026-12"]) expect((await view(m)).kind).toBe("passado");
    expect((await view("2026-12")).lines.some((l) => l.description === "Monitor")).toBe(false);
    expect(await store.monthView("2026-09")).toBeNull();
    expect(await store.closePastMonths()).toBe(0);
    expect(await store.firstMonth()).toBe("2026-10");
  });

  it("usa sempre o horário de Brasília para saber o mês atual", () => {
    clock = new Date("2026-11-01T02:00:00Z"); // ainda 31/out às 23h em Brasília
    expect(store.currentMonth()).toBe("2026-10");
    clock = new Date("2026-11-01T03:00:00Z");
    expect(store.currentMonth()).toBe("2026-11");
  });
});

describe("backup", () => {
  it("exporta como está agora e importa num navegador vazio com o mesmo resultado", async () => {
    await seedOctober();
    const backup = await exportBackup(db, clock);
    expect(backup).toMatchObject({ format: "pots", schema: 2 });
    expect(backup.months.map((m) => m.month)).toEqual(["2026-10"]);
    expect(backup.global.fixed).toHaveLength(3);
    const text = JSON.stringify(backup);

    const other = new PotsDB(`test-${crypto.randomUUID()}`);
    await importBackup(other, parseBackup(text));
    const otherStore = new Store(other, () => clock);
    expect(await otherStore.monthView("2026-10")).toEqual(await view("2026-10"));
  });

  it("recusa arquivo que não é backup", () => {
    expect(() => parseBackup("{}")).toThrow(PotsError);
    expect(() => parseBackup("nada")).toThrow("não é um backup");
  });

  it("nome do arquivo leva a data", () => {
    expect(backupFileName(clock)).toBe("pots-backup-2026-10-08.json");
  });
});
