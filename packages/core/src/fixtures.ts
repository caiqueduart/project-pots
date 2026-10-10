import type { Entry, Fixed, MonthRecord } from "@pots/shared";
import type { PotsData } from "./types.ts";

// Outubro/2026 real do Caique (planilha), o mesmo usado no protótipo.
export const MORADIA = "pot-moradia";
export const PESSOAL = "pot-pessoal";
export const INVEST = "pot-invest";

let n = 0;
const fx = (description: string, amount_cents: number, pot_id: string, method: Fixed["method"]): Fixed => ({
  id: `rec-${++n}`,
  description,
  amount_cents,
  day: 1,
  pot_id,
  method,
});
const parc = (description: string, parcela: number, purchase_date: string, installments: number): Entry => ({
  id: `entry-${++n}`,
  description,
  total_cents: parcela * installments,
  purchase_date,
  pot_id: PESSOAL,
  method: "cartao",
  installments,
});

export function octoberRecord(): MonthRecord {
  n = 0;
  return {
    month: "2026-10",
    closed_at: null,
    plan: {
      incomes: [{ id: "inc-1", name: "Bolsa LabTIME", amount_cents: 350000 }],
      pots: [
        { id: MORADIA, name: "Moradia", kind: "gasto", amount_cents: 50000 },
        { id: PESSOAL, name: "Pessoal", kind: "gasto", amount_cents: 150000 },
        { id: INVEST, name: "Investimentos", kind: "meta", amount_cents: 100000 },
      ],
      card: { personal_limit_cents: 100000, bank_limit_cents: 500000 },
    },
    fixed: [
      fx("Aluguel", 34500, MORADIA, "debito"),
      fx("Água, Luz, Internet", 16000, MORADIA, "debito"),
      fx("Internet da família", 10500, PESSOAL, "debito"),
      fx("Dados Móveis", 3000, PESSOAL, "debito"),
      fx("Spotify", 680, PESSOAL, "debito"),
      fx("Plano de Saúde", 22500, PESSOAL, "debito"),
      fx("Reserva", 100000, INVEST, "debito"),
      fx("Netflix", 2090, PESSOAL, "cartao"),
      fx("Google One", 3599, PESSOAL, "cartao"),
      fx("Cinemark Club", 3890, PESSOAL, "cartao"),
      fx("Academia", 11000, PESSOAL, "cartao"),
      fx("Ifood Club", 795, PESSOAL, "cartao"),
      fx("Prime Video", 1990, PESSOAL, "cartao"),
      fx("Claude", 10000, PESSOAL, "cartao"),
    ],
    entries: [
      parc("Monitor", 5240, "2026-02-01", 10),
      parc("Cadeira", 7599, "2026-02-01", 10),
      parc("Creme e Perfume", 9234, "2026-09-01", 2),
      parc("Fone de ouvido", 8278, "2026-06-01", 8),
      {
        id: `entry-${++n}`,
        description: "Corte de Cabelo",
        total_cents: 4000,
        purchase_date: "2026-10-01",
        pot_id: PESSOAL,
        method: "debito",
        installments: 1,
      },
    ],
    stopped_entries: [],
  };
}

/** Só outubro, aberto. Os fixos do mês são também o modelo para os próximos. */
export function octoberData(): PotsData {
  const oct = octoberRecord();
  return { months: [oct], global: { id: "global", fixed: structuredClone(oct.fixed) } };
}
