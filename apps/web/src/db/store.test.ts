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
  // 08/out/2026 às 10h em São Paulo
  clock = new Date("2026-10-08T13:00:00Z");
  store = new Store(db, () => clock);
  await db.settings.put({
    id: "settings",
    personal_limit_cents: 100000,
    bank_limit_cents: 500000,
    warn_pct: 85,
    timezone: "America/Sao_Paulo",
    created_at: "2026-10-01T12:00:00.000Z",
    updated_at: "2026-10-01T12:00:00.000Z",
  });
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

describe("mês atual", () => {
  it("calcula o mês a partir das tabelas", async () => {
    await seedOctober();
    const oct = await view("2026-10");
    expect(oct).toMatchObject({ kind: "atual", editable: true, current_month: "2026-10" });
    expect(oct.totals).toMatchObject({ income_cents: 350000, spent_cents: 34500 + 2090 + 100000 + 5240 + 4000 });
    expect(oct.card.invoice_cents).toBe(2090 + 5240);
    expect(oct.installments_in_progress[0]).toMatchObject({ description: "Monitor", installment: 9, installments: 10 });
  });

  it("gera ids UUID e campos de controle em toda linha", async () => {
    const { pessoal } = await seedOctober();
    expect(pessoal.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(pessoal).toMatchObject({ deleted_at: null });
    expect(pessoal.updated_at).toBe(pessoal.created_at);
    // no mesmo instante, cada linha nova ganha um created_at maior (a ordem de criação se mantém)
    const pots = await db.pots.toArray();
    const stamps = pots.map((p) => p.created_at).sort();
    expect(new Set(stamps).size).toBe(pots.length);
    expect(stamps[0]! >= clock.toISOString()).toBe(true);
  });

  it("recusa compra com data futura e débito parcelado", async () => {
    const { pessoal } = await seedOctober();
    const base = { description: "X", total_cents: 1000, pot_id: pessoal.id, installments: 1 };
    await expect(store.addEntry({ ...base, purchase_date: "2026-10-09", method: "debito" })).rejects.toThrow("futura");
    await expect(store.addEntry({ ...base, purchase_date: "2026-10-01", method: "debito", installments: 3 })).rejects.toBeInstanceOf(PotsError);
  });

  it("excluir marca deleted_at e some dos cálculos", async () => {
    const { monitor } = await seedOctober();
    await store.deleteEntry(monitor.id);
    expect((await db.entries.get(monitor.id))!.deleted_at).toBe(clock.toISOString());
    expect((await view("2026-10")).installments_in_progress).toEqual([]);
  });

  it("o futuro é previsão somente leitura", async () => {
    await seedOctober();
    expect(await view("2026-11")).toMatchObject({ kind: "futuro", editable: false });
  });
});

describe("fixos", () => {
  it("editar só este mês grava um ajuste e não muda o próximo", async () => {
    const { aluguel, pessoal } = await seedOctober();
    await store.editRecurring(aluguel.id, { ...aluguel, amount_cents: 30000, pot_id: pessoal.id }, "mes");
    const oct = await view("2026-10");
    expect(oct.lines.find((l) => l.description === "Aluguel")).toMatchObject({ amount_cents: 30000, pot_id: pessoal.id, edited: true });
    const nov = await view("2026-11");
    expect(nov.lines.find((l) => l.description === "Aluguel")).toMatchObject({ amount_cents: 34500, pot_id: aluguel.pot_id });
  });

  it("editar em diante muda o fixo e descarta o ajuste", async () => {
    const { aluguel } = await seedOctober();
    await store.deleteRecurring(aluguel.id, "mes");
    await store.editRecurring(aluguel.id, { ...aluguel, amount_cents: 36000 }, "em_diante");
    expect(await db.recurring.get(aluguel.id)).toMatchObject({ amount_cents: 36000, override: null });
  });

  it("excluir só este mês pula; em diante exclui", async () => {
    const { aluguel } = await seedOctober();
    await store.deleteRecurring(aluguel.id, "mes");
    expect((await view("2026-10")).lines.some((l) => l.description === "Aluguel")).toBe(false);
    expect((await view("2026-11")).lines.some((l) => l.description === "Aluguel")).toBe(true);
    await store.deleteRecurring(aluguel.id, "em_diante");
    expect((await view("2026-11")).lines.some((l) => l.description === "Aluguel")).toBe(false);
  });

  it("pote com fixos não pode ser removido; sem fixos, arquiva", async () => {
    const { moradia, aluguel } = await seedOctober();
    await expect(store.archivePot(moradia.id)).rejects.toThrow("fixos");
    await store.deleteRecurring(aluguel.id, "em_diante");
    await store.archivePot(moradia.id);
    expect((await view("2026-10")).pots.map((p) => p.name)).toEqual(["Pessoal", "Investimentos"]);
  });
});

describe("virada do mês", () => {
  it("congela o mês que passou antes da primeira gravação", async () => {
    const { aluguel, pessoal, income } = await seedOctober();
    await store.editRecurring(aluguel.id, { ...aluguel, amount_cents: 30000 }, "mes");
    const before = await view("2026-10");

    clock = new Date("2026-11-01T03:30:00Z"); // 1º/nov, 00h30 em São Paulo
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
    expect(nov.lines.find((l) => l.description === "Esquecida de outubro")!.amount_cents).toBe(9900);
    expect(nov.lines.find((l) => l.description === "Aluguel")!.amount_cents).toBe(34500);
  });

  it("fecha todos os meses sem acesso; antes do primeiro uso não há mês", async () => {
    await seedOctober();
    clock = new Date("2027-01-15T12:00:00Z");
    expect(await store.closePastMonths()).toBe(3);
    for (const m of ["2026-10", "2026-11", "2026-12"]) expect((await view(m)).kind).toBe("passado");
    expect((await view("2026-12")).lines.some((l) => l.description === "Monitor")).toBe(false);
    expect(await store.monthView("2026-09")).toBeNull();
    expect(await store.closePastMonths()).toBe(0);
  });

  it("usa sempre o horário de Brasília para saber o mês atual", async () => {
    clock = new Date("2026-11-01T02:00:00Z"); // ainda 31/out às 23h em Brasília
    expect(store.currentMonth()).toBe("2026-10");
    await store.updateSettings({ timezone: "UTC" }); // backups antigos podem trazer outro fuso
    expect(store.currentMonth()).toBe("2026-10");
    clock = new Date("2026-11-01T03:00:00Z");
    expect(store.currentMonth()).toBe("2026-11");
  });
});

describe("backup", () => {
  it("exporta as tabelas e importa num navegador vazio com o mesmo resultado", async () => {
    const { monitor } = await seedOctober();
    await store.deleteEntry(monitor.id);
    const backup = await exportBackup(db, clock);
    expect(backup).toMatchObject({ format: "pots", schema: 1 });
    expect(backup.entries).toHaveLength(2); // a excluída vai junto, marcada
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
