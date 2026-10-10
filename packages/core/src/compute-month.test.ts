import type { Entry, MonthView } from "@pots/shared";
import { describe, expect, it } from "vitest";
import { computeMonth as compute } from "./compute-month.ts";
import { MORADIA, octoberData } from "./fixtures.ts";
import { newMonth, rollMonths } from "./months.ts";
import type { PotsData } from "./types.ts";

const computeMonth = (data: PotsData, month: string, current = "2026-10"): MonthView => compute(data, month, current)!;

describe("computeMonth com o outubro real", () => {
  const view = computeMonth(octoberData(), "2026-10");

  it("bate com a planilha: gasto, disponível e fatura", () => {
    expect(view.totals.income_cents).toBe(350000);
    expect(view.totals.spent_cents).toBe(254895);
    expect(view.totals.available_cents).toBe(95105);
    expect(view.card.invoice_cents).toBe(63715);
    expect(view.card.remaining_cents).toBe(36285);
    expect(view.card.items).toHaveLength(11);
  });

  it("calcula uso e aviso de cada pote", () => {
    const [moradia, pessoal, invest] = view.pots;
    expect(moradia).toMatchObject({ used_cents: 50500, status: "estourou", remaining_cents: -500, pct: 101 });
    expect(pessoal).toMatchObject({ used_cents: 104395, status: "ok" });
    expect(invest).toMatchObject({ used_cents: 100000, status: "cumprida", pct: 100 });
    expect(view.totals.budgeted_cents).toBe(300000);
    expect(view.totals.unallocated_cents).toBe(50000);
  });

  it("mostra em que parcela está cada compra", () => {
    const p = Object.fromEntries(view.installments_in_progress.map((i) => [i.description, i]));
    expect(p["Monitor"]).toMatchObject({ installment: 9, installments: 10, amount_cents: 5240, remaining_cents: 5240, last_month: "2026-11" });
    expect(p["Cadeira"]).toMatchObject({ installment: 9, last_month: "2026-11" });
    expect(p["Creme e Perfume"]).toMatchObject({ installment: 2, installments: 2, remaining_cents: 0, is_last: true });
    expect(p["Fone de ouvido"]).toMatchObject({ installment: 5, installments: 8, remaining_cents: 3 * 8278, last_month: "2027-01" });
  });

  it("separa cartão e débito e soma os fixos", () => {
    expect(view.totals.by_method).toEqual({ cartao: 63715, debito: 191180 });
    expect(view.totals.fixed_cents).toBe(220544);
    expect(view.totals.spent_status).toBe("ok");
  });

  it("prevê os próximos 6 meses com parcelas e fixos", () => {
    expect(view.forecast.map((f) => f.month)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04"]);
    const nov = view.forecast[0]!;
    expect(nov.cartao_cents).toBe(54481);
    expect(nov.debito_cents).toBe(187180);
    expect(nov.total_cents).toBe(241661);
    expect(nov.pct_of_income).toBe(69);
    // depois de janeiro só sobram os fixos do cartão
    expect(view.forecast[3]!.cartao_cents).toBe(33364);
  });

  it("compromisso do cartão inclui as parcelas futuras", () => {
    expect(view.card.committed_cents).toBe(63715 + 5240 + 7599 + 3 * 8278);
  });

  it("marca o mês atual como editável", () => {
    expect(view.editable).toBe(true);
    expect(computeMonth(octoberData(), "2026-12").editable).toBe(false);
  });
});

describe("fixos", () => {
  it("o ajuste do mês fica só no mês; a previsão usa o modelo global", () => {
    const data = octoberData();
    const oct = data.months[0]!;
    oct.fixed[0] = { ...oct.fixed[0]!, amount_cents: 30000, pot_id: "pot-pessoal", method: "cartao", day: 20, edited: true };
    oct.fixed.splice(1, 1); // "Água, Luz, Internet" pulado só em outubro
    const view = computeMonth(data, "2026-10");
    expect(view.lines.find((l) => l.description === "Aluguel")).toMatchObject({
      amount_cents: 30000,
      edited: true,
      pot_id: "pot-pessoal",
      date: "2026-10-20",
    });
    expect(view.lines.find((l) => l.description === "Água, Luz, Internet")).toBeUndefined();
    expect(view.card.invoice_cents).toBe(63715 + 30000);

    const nov = computeMonth(data, "2026-11");
    expect(nov.lines.find((l) => l.description === "Aluguel")!.amount_cents).toBe(34500);
    expect(nov.lines.find((l) => l.description === "Água, Luz, Internet")).toBeDefined();
  });

  it("dia 31 cai no último dia de meses curtos", () => {
    const data = octoberData();
    data.global.fixed[0]!.day = 31;
    expect(computeMonth(data, "2026-11").lines.find((l) => l.description === "Aluguel")!.date).toBe("2026-11-30");
  });
});

describe("compras com data passada", () => {
  const withEntry = (e: Partial<Entry>): PotsData => {
    const data = octoberData();
    data.months[0]!.entries = [
      {
        id: "x",
        description: "X",
        total_cents: 10000,
        purchase_date: "2026-09-20",
        pot_id: "pot-pessoal",
        method: "debito",
        installments: 1,
        ...e,
      },
    ];
    return data;
  };

  it("compra à vista esquecida do mês fechado entra no mês atual", () => {
    for (const method of ["debito", "cartao"] as const) {
      const view = computeMonth(withEntry({ method }), "2026-10");
      expect(view.lines.find((l) => l.id === "x")).toMatchObject({ amount_cents: 10000, installment: 1, registered_month: "2026-10" });
    }
  });

  it("parcelada antiga só define a parcela; parcelas de meses fechados ficam de fora", () => {
    const data = withEntry({ method: "cartao", installments: 3, total_cents: 10000, purchase_date: "2026-09-10" });
    data.months.unshift({ ...newMonth("2026-09", undefined, data.global), closed_at: "2026-10-01T03:00:00.000Z" });
    expect(computeMonth(data, "2026-09").lines.find((l) => l.id === "x")).toBeUndefined();
    expect(computeMonth(data, "2026-10").lines.find((l) => l.id === "x")).toMatchObject({ installment: 2, amount_cents: 3333 });
    expect(computeMonth(data, "2026-11").lines.find((l) => l.id === "x")).toMatchObject({ installment: 3, amount_cents: 3334 });
  });
});

describe("meses", () => {
  /** Outubro fechado e novembro aberto, como depois da virada. */
  const novData = (): PotsData => {
    const data = octoberData();
    const changed = rollMonths(data, "2026-11", new Date("2026-11-01T03:00:00Z"));
    return { ...data, months: changed };
  };

  it("virar o mês fecha o anterior e abre o novo com o plano e os fixos copiados, sem compras", () => {
    const data = octoberData();
    const changed = rollMonths(data, "2027-01", new Date("2027-01-02T12:00:00Z"));
    expect(changed.map((m) => [m.month, !!m.closed_at])).toEqual([
      ["2026-10", true],
      ["2026-11", true],
      ["2026-12", true],
      ["2027-01", false],
    ]);
    const jan = changed.at(-1)!;
    expect(jan.plan).toEqual(data.months[0]!.plan);
    expect(jan.fixed).toEqual(data.global.fixed);
    expect(jan.entries).toEqual([]);
    expect(rollMonths({ ...data, months: changed }, "2027-01", new Date())).toEqual([]);
  });

  it("primeiro uso cria o mês atual vazio", () => {
    const [first] = rollMonths({ months: [], global: { id: "global", fixed: [] } }, "2026-10", new Date());
    expect(first).toMatchObject({ month: "2026-10", closed_at: null, entries: [], plan: { incomes: [], pots: [] } });
  });

  it("mês fechado é recalculado com o que ficou guardado nele", () => {
    const data = novData();
    data.months[1]!.plan.incomes[0]!.amount_cents = 500000; // aumento só em novembro
    const oct = computeMonth(data, "2026-10", "2026-11");
    expect(oct).toMatchObject({ kind: "passado", editable: false, closed_at: "2026-11-01T03:00:00.000Z" });
    expect(oct.totals.income_cents).toBe(350000);
    expect(oct.totals.spent_cents).toBe(254895);
    expect(computeMonth(data, "2026-11", "2026-11").totals.income_cents).toBe(500000);
    expect(compute(data, "2026-09", "2026-11")).toBeNull();
  });

  it("parcelas paradas somem do mês em que pararam em diante, e o passado fica igual", () => {
    const data = novData();
    const monitor = data.months[0]!.entries.find((e) => e.description === "Monitor")!; // 9/10 em outubro
    data.months[1]!.stopped_entries.push(monitor.id);
    const oct = computeMonth(data, "2026-10", "2026-11");
    expect(oct.lines.some((l) => l.description === "Monitor")).toBe(true);
    expect(oct.installments_in_progress.find((i) => i.description === "Monitor")).toMatchObject({ is_last: true, remaining_cents: 0 });
    expect(computeMonth(data, "2026-11", "2026-11").lines.some((l) => l.description === "Monitor")).toBe(false);
  });

  it("pote removido com parcelas caindo aparece como removido, com o nome antigo", () => {
    const data = novData();
    const nov = data.months[1]!;
    nov.plan.pots = nov.plan.pots.filter((p) => p.id !== MORADIA);
    nov.fixed = nov.fixed.filter((f) => f.pot_id !== MORADIA);
    data.months[0]!.entries[0]!.pot_id = MORADIA; // Monitor (10/10 em novembro)
    const view = computeMonth(data, "2026-11", "2026-11");
    expect(view.pots.find((p) => p.name === "Moradia")).toMatchObject({ archived: true, used_cents: 5240 });
    expect(view.totals.budgeted_cents).toBe(250000);
    expect(view.lines.find((l) => l.description === "Monitor")!.pot_name).toBe("Moradia");
  });
});
