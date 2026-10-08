import { describe, expect, it } from "vitest";
import { computeMonth } from "./compute-month.ts";
import { octoberData } from "./fixtures.ts";
import type { UserData } from "./types.ts";

const atual = { kind: "atual" as const, currentMonth: "2026-10" };

describe("computeMonth com o outubro real", () => {
  const view = computeMonth(octoberData(), "2026-10", atual);

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
    expect(computeMonth(octoberData(), "2026-12", { kind: "futuro", currentMonth: "2026-10" }).editable).toBe(false);
  });
});

describe("fixos", () => {
  it("o ajuste vale só para o mês dele", () => {
    const data = octoberData();
    data.recurring[0]!.override = { month: "2026-10", amount_cents: 30000 };
    data.recurring[1]!.override = { month: "2026-10", skip: true };
    const oct = computeMonth(data, "2026-10", atual);
    const aluguel = oct.lines.find((l) => l.description === "Aluguel")!;
    expect(aluguel).toMatchObject({ amount_cents: 30000, edited: true });
    expect(oct.lines.find((l) => l.description === "Água, Luz, Internet")).toBeUndefined();

    const nov = computeMonth(data, "2026-11", { kind: "futuro", currentMonth: "2026-10" });
    expect(nov.lines.find((l) => l.description === "Aluguel")!.amount_cents).toBe(34500);
    expect(nov.lines.find((l) => l.description === "Água, Luz, Internet")).toBeDefined();
  });

  it("dia 31 cai no último dia de meses curtos", () => {
    const data = octoberData();
    data.recurring[0]!.day = 31;
    const nov = computeMonth(data, "2026-11", { kind: "futuro", currentMonth: "2026-10" });
    expect(nov.lines.find((l) => l.description === "Aluguel")!.date).toBe("2026-11-30");
  });
});

describe("compras com data passada", () => {
  const withEntry = (e: Partial<UserData["entries"][number]>): UserData => {
    const data = octoberData();
    data.entries = [
      {
        id: 99,
        description: "X",
        total_cents: 10000,
        purchase_date: "2026-09-20",
        registered_month: "2026-10",
        pot_id: 2,
        method: "debito",
        installments: 1,
        ...e,
      },
    ];
    return data;
  };

  it("compra à vista esquecida do mês fechado entra no mês atual", () => {
    for (const method of ["debito", "cartao"] as const) {
      const view = computeMonth(withEntry({ method }), "2026-10", atual);
      expect(view.lines.find((l) => l.id === 99)).toMatchObject({ amount_cents: 10000, installment: 1 });
    }
  });

  it("parcelada antiga só define a parcela; parcelas de meses fechados ficam de fora", () => {
    const data = withEntry({ method: "cartao", installments: 3, total_cents: 10000, purchase_date: "2026-09-10" });
    const sep = computeMonth(data, "2026-09", { kind: "passado", currentMonth: "2026-10" });
    expect(sep.lines.find((l) => l.id === 99)).toBeUndefined();
    const oct = computeMonth(data, "2026-10", atual);
    expect(oct.lines.find((l) => l.id === 99)).toMatchObject({ installment: 2, amount_cents: 3333 });
    const dec = computeMonth(data, "2026-11", { kind: "futuro", currentMonth: "2026-10" });
    expect(dec.lines.find((l) => l.id === 99)).toMatchObject({ installment: 3, amount_cents: 3334 });
  });
});

describe("potes arquivados", () => {
  it("somem do mês, a não ser que ainda tenham algo caindo nele", () => {
    const data = octoberData();
    data.pots[0]!.archived_at = "2026-10-05T00:00:00.000Z";
    data.recurring = data.recurring.filter((r) => r.pot_id !== 1);
    const view = computeMonth(data, "2026-10", atual);
    expect(view.pots.map((p) => p.name)).toEqual(["Pessoal", "Investimentos"]);
    expect(view.totals.budgeted_cents).toBe(250000);

    data.entries[0]!.pot_id = 1;
    const again = computeMonth(data, "2026-10", atual);
    expect(again.pots.find((p) => p.name === "Moradia")).toMatchObject({ archived: true, used_cents: 5240 });
  });
});
