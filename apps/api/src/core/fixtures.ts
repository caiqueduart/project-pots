import type { Entry, Recurring } from "@pots/shared";
import type { UserData } from "./types.ts";

// Outubro/2026 real do Caique (planilha), o mesmo usado no protótipo.
const MORADIA = 1;
const PESSOAL = 2;
const INVEST = 3;

let nextId = 1;
const fx = (description: string, amount_cents: number, pot_id: number, method: Recurring["method"]): Recurring => ({
  id: nextId++,
  description,
  amount_cents,
  day: 1,
  pot_id,
  method,
  override: null,
});
const parc = (description: string, parcela: number, purchase_date: string, installments: number): Entry => ({
  id: nextId++,
  description,
  total_cents: parcela * installments,
  purchase_date,
  registered_month: "2026-10",
  pot_id: PESSOAL,
  method: "cartao",
  installments,
});

export function octoberData(): UserData {
  nextId = 1;
  return {
    settings: { personal_limit_cents: 100000, bank_limit_cents: 500000, warn_pct: 85, timezone: "America/Sao_Paulo" },
    incomes: [{ id: 1, name: "Bolsa LabTIME", amount_cents: 350000 }],
    pots: [
      { id: MORADIA, name: "Moradia", kind: "gasto", amount_cents: 50000, archived_at: null },
      { id: PESSOAL, name: "Pessoal", kind: "gasto", amount_cents: 150000, archived_at: null },
      { id: INVEST, name: "Investimentos", kind: "meta", amount_cents: 100000, archived_at: null },
    ],
    recurring: [
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
        id: nextId++,
        description: "Corte de Cabelo",
        total_cents: 4000,
        purchase_date: "2026-10-01",
        registered_month: "2026-10",
        pot_id: PESSOAL,
        method: "debito",
        installments: 1,
      },
    ],
  };
}
