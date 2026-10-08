import { describe, expect, it } from "vitest";
import { installmentCents } from "./installments.ts";
import { limitStatus, potStatus } from "./status.ts";
import { previewPurchase, previewPlanning } from "./preview.ts";

describe("installmentCents", () => {
  it("a soma das parcelas é sempre o total exato", () => {
    for (const [total, n] of [[10000, 3], [99999, 7], [1, 2], [300000, 10]] as const) {
      let sum = 0;
      for (let k = 1; k <= n; k++) sum += installmentCents(total, n, k);
      expect(sum).toBe(total);
    }
    expect(installmentCents(10000, 3, 1)).toBe(3333);
    expect(installmentCents(10000, 3, 3)).toBe(3334);
  });
});

describe("faixas de aviso", () => {
  it("gasto: ok, aviso a partir da faixa, ok no limite exato, estourou acima", () => {
    expect(limitStatus(8499, 10000, 85)).toBe("ok");
    expect(limitStatus(8500, 10000, 85)).toBe("aviso");
    expect(limitStatus(10000, 10000, 85)).toBe("ok");
    expect(limitStatus(10001, 10000, 85)).toBe("estourou");
    expect(limitStatus(1, 0, 85)).toBe("estourou");
  });
  it("a faixa vem da configuração do usuário", () => {
    expect(limitStatus(7000, 10000, 70)).toBe("aviso");
    expect(limitStatus(7000, 10000, 85)).toBe("ok");
  });
  it("meta nunca estoura", () => {
    expect(potStatus("meta", 20000, 10000, 85)).toBe("cumprida");
    expect(potStatus("meta", 5000, 10000, 85)).toBe("pendente");
  });
});

describe("prévias", () => {
  it("compra parcelada lançada hoje", () => {
    expect(previewPurchase({ total_cents: 300000, installments: 10, purchase_date: "2026-10-08", method: "cartao" }, "2026-10")).toEqual({
      current_month: "2026-10",
      installments: 10,
      installment_cents: 30000,
      last_installment_cents: 30000,
      first_month: "2026-10",
      last_month: "2027-07",
      current_installment: 1,
      current_amount_cents: 30000,
      remaining_after_current_cents: 270000,
    });
  });
  it("compra em andamento (4/10)", () => {
    const p = previewPurchase({ total_cents: 100000, installments: 10, purchase_date: "2026-07-15", method: "cartao" }, "2026-10");
    expect(p.current_installment).toBe(4);
    expect(p.remaining_after_current_cents).toBe(60000);
  });
  it("débito nunca é parcelado", () => {
    expect(previewPurchase({ total_cents: 5000, installments: 3, purchase_date: "2026-10-01", method: "debito" }, "2026-10").installments).toBe(1);
  });
  it("falta distribuir", () => {
    expect(previewPlanning({ incomes_cents: [350000], pots_cents: [50000, 150000, 100000] }).unallocated_cents).toBe(50000);
  });
});
