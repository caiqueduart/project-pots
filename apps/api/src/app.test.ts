import type { MonthView } from "@pots/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { authPort, createAuth, type AuthPort } from "./auth.ts";
import { openDb, type Db } from "./db/client.ts";
import * as t from "./db/schema.ts";

// Login falso: o usuário vem do cabeçalho x-test-user.
const fakeAuth: AuthPort = {
  handler: async () => new Response(null, { status: 404 }),
  getUserId: async (h) => h.get("x-test-user"),
};

let db: Db;
let clock: Date;
let app: ReturnType<typeof createApp>;

function addUser(id: string, createdAt: Date) {
  db.insert(t.users).values({ id, name: id, email: `${id}@exemplo.com`, createdAt, updatedAt: createdAt }).run();
}

async function call<T = any>(method: string, path: string, body?: unknown, user = "ana") {
  const res = await app.request(path, {
    method,
    headers: { "x-test-user": user, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

beforeEach(() => {
  db = openDb(":memory:");
  // 08/out/2026 às 10h em São Paulo
  clock = new Date("2026-10-08T13:00:00Z");
  app = createApp({ db, auth: fakeAuth, now: () => clock });
  addUser("ana", new Date("2026-10-01T12:00:00Z"));
  addUser("bia", new Date("2026-10-01T12:00:00Z"));
});

async function seedOctober() {
  await call("PATCH", "/api/settings", { personal_limit_cents: 100000, bank_limit_cents: 500000 });
  await call("POST", "/api/incomes", { name: "Bolsa", amount_cents: 350000 });
  const moradia = (await call("POST", "/api/pots", { name: "Moradia", amount_cents: 50000 })).body;
  const pessoal = (await call("POST", "/api/pots", { name: "Pessoal", amount_cents: 150000 })).body;
  const invest = (await call("POST", "/api/pots", { name: "Investimentos", kind: "meta", amount_cents: 100000 })).body;
  const aluguel = (
    await call("POST", "/api/recurring", { description: "Aluguel", amount_cents: 34500, day: 5, pot_id: moradia.id, method: "debito" })
  ).body;
  await call("POST", "/api/recurring", { description: "Netflix", amount_cents: 2090, day: 10, pot_id: pessoal.id, method: "cartao" });
  await call("POST", "/api/recurring", { description: "Reserva", amount_cents: 100000, day: 5, pot_id: invest.id, method: "debito" });
  const monitor = (
    await call("POST", "/api/entries", {
      description: "Monitor",
      total_cents: 52400,
      purchase_date: "2026-02-01",
      pot_id: pessoal.id,
      method: "cartao",
      installments: 10,
    })
  ).body;
  await call("POST", "/api/entries", {
    description: "Corte de cabelo",
    total_cents: 4000,
    purchase_date: "2026-10-01",
    pot_id: pessoal.id,
    method: "debito",
  });
  return { moradia, pessoal, invest, aluguel, monitor };
}

describe("acesso", () => {
  it("exige login", async () => {
    const res = await app.request("/api/mes/2026-10");
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("nao_autenticado");
  });

  it("cada usuário só vê os próprios dados", async () => {
    const { pessoal } = await seedOctober();
    expect((await call("GET", "/api/pots", undefined, "bia")).body).toEqual([]);
    expect((await call("PATCH", `/api/pots/${pessoal.id}`, { amount_cents: 1 }, "bia")).status).toBe(404);
    const entry = await call(
      "POST",
      "/api/entries",
      { description: "X", total_cents: 100, purchase_date: "2026-10-01", pot_id: pessoal.id, method: "debito" },
      "bia",
    );
    expect(entry.body.error.code).toBe("pote_invalido");
  });

  it("devolve o perfil com o mês atual", async () => {
    const me = await call("GET", "/api/me");
    expect(me.body).toMatchObject({ user: { id: "ana", email: "ana@exemplo.com" }, current_month: "2026-10" });
    expect(me.body.settings.warn_pct).toBe(85);
  });
});

describe("mês atual", () => {
  it("entrega o mês calculado", async () => {
    await seedOctober();
    const { status, body } = await call<MonthView>("GET", "/api/mes/2026-10");
    expect(status).toBe(200);
    expect(body).toMatchObject({ kind: "atual", editable: true, current_month: "2026-10" });
    expect(body.totals).toMatchObject({ income_cents: 350000, spent_cents: 34500 + 2090 + 100000 + 5240 + 4000 });
    expect(body.card.invoice_cents).toBe(2090 + 5240);
    expect(body.installments_in_progress[0]).toMatchObject({ description: "Monitor", installment: 9, installments: 10 });
    expect(body.lines.map((l) => l.description)).toEqual(["Aluguel", "Reserva", "Netflix", "Monitor", "Corte de cabelo"]);
  });

  it("recusa compra com data futura e débito parcelado", async () => {
    const { pessoal } = await seedOctober();
    const base = { description: "X", total_cents: 1000, pot_id: pessoal.id };
    const future = await call("POST", "/api/entries", { ...base, purchase_date: "2026-10-09", method: "debito" });
    expect(future.body.error.code).toBe("data_futura");
    const split = await call("POST", "/api/entries", { ...base, purchase_date: "2026-10-01", method: "debito", installments: 3 });
    expect(split.status).toBe(400);
  });

  it("valida o formato do mês", async () => {
    expect((await call("GET", "/api/mes/2026-13")).status).toBe(400);
  });
});

describe("fixos", () => {
  it("ajuste só deste mês não muda o próximo", async () => {
    const { aluguel } = await seedOctober();
    await call("PATCH", `/api/recurring/${aluguel.id}`, { scope: "mes", amount_cents: 30000 });
    const oct = (await call<MonthView>("GET", "/api/mes/2026-10")).body;
    expect(oct.lines.find((l) => l.description === "Aluguel")).toMatchObject({ amount_cents: 30000, edited: true });
    const nov = (await call<MonthView>("GET", "/api/mes/2026-11")).body;
    expect(nov).toMatchObject({ kind: "futuro", editable: false });
    expect(nov.lines.find((l) => l.description === "Aluguel")!.amount_cents).toBe(34500);
  });

  it("recusa ajuste de outro mês", async () => {
    const { aluguel } = await seedOctober();
    const res = await call("PATCH", `/api/recurring/${aluguel.id}`, { scope: "mes", month: "2026-11", skip: true });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("mes_nao_editavel");
  });

  it("deste mês em diante muda o fixo e descarta o ajuste", async () => {
    const { aluguel } = await seedOctober();
    await call("PATCH", `/api/recurring/${aluguel.id}`, { scope: "mes", skip: true });
    const res = await call("PATCH", `/api/recurring/${aluguel.id}`, { scope: "em_diante", amount_cents: 36000 });
    expect(res.body).toMatchObject({ amount_cents: 36000, override: null });
  });

  it("excluir só este mês pula; em diante apaga", async () => {
    const { aluguel } = await seedOctober();
    await call("DELETE", `/api/recurring/${aluguel.id}?scope=mes`);
    let oct = (await call<MonthView>("GET", "/api/mes/2026-10")).body;
    expect(oct.lines.find((l) => l.description === "Aluguel")).toBeUndefined();
    expect((await call<MonthView>("GET", "/api/mes/2026-11")).body.lines.some((l) => l.description === "Aluguel")).toBe(true);

    expect((await call("DELETE", `/api/recurring/${aluguel.id}?scope=em_diante`)).status).toBe(204);
    expect((await call("GET", "/api/recurring")).body).toHaveLength(2);
  });

  it("pote com fixos não pode ser removido", async () => {
    const { moradia } = await seedOctober();
    expect((await call("DELETE", `/api/pots/${moradia.id}`)).body.error.code).toBe("pote_com_fixos");
  });
});

describe("virada do mês", () => {
  it("congela o mês que passou na primeira requisição depois da virada", async () => {
    const { aluguel, pessoal } = await seedOctober();
    await call("PATCH", `/api/recurring/${aluguel.id}`, { scope: "mes", amount_cents: 30000 });
    const before = (await call<MonthView>("GET", "/api/mes/2026-10")).body;

    // 1º de novembro, 00h30 em São Paulo
    clock = new Date("2026-11-01T03:30:00Z");
    // a primeira requisição é uma gravação: a foto de outubro sai antes dela
    await call("PATCH", "/api/incomes/1", { amount_cents: 400000 });
    await call("POST", "/api/entries", {
      description: "Esquecida de outubro",
      total_cents: 9900,
      purchase_date: "2026-10-20",
      pot_id: pessoal.id,
      method: "debito",
    });

    const oct = (await call<MonthView>("GET", "/api/mes/2026-10")).body;
    expect(oct).toMatchObject({ kind: "passado", editable: false, current_month: "2026-11" });
    expect(oct.closed_at).toBe("2026-11-01T03:30:00.000Z");
    expect(oct.totals).toEqual(before.totals);
    expect(oct.lines).toEqual(before.lines);

    const nov = (await call<MonthView>("GET", "/api/mes/2026-11")).body;
    expect(nov).toMatchObject({ kind: "atual", editable: true });
    expect(nov.totals.income_cents).toBe(400000);
    // compra esquecida entra no mês atual; o ajuste de outubro não vale mais
    expect(nov.lines.find((l) => l.description === "Esquecida de outubro")!.amount_cents).toBe(9900);
    expect(nov.lines.find((l) => l.description === "Aluguel")!.amount_cents).toBe(34500);
    expect(nov.installments_in_progress[0]).toMatchObject({ installment: 10, is_last: true });
  });

  it("fecha todos os meses que ficaram sem acesso", async () => {
    await seedOctober();
    clock = new Date("2027-01-15T12:00:00Z");
    for (const m of ["2026-10", "2026-11", "2026-12"]) {
      expect((await call<MonthView>("GET", `/api/mes/${m}`)).body.kind).toBe("passado");
    }
    expect((await call<MonthView>("GET", "/api/mes/2026-12")).body.lines.some((l) => l.description === "Monitor")).toBe(false);
    expect((await call("GET", "/api/mes/2026-09")).body.error.code).toBe("mes_sem_dados");
  });

  it("usa o fuso do usuário para saber o mês atual", async () => {
    clock = new Date("2026-11-01T02:00:00Z"); // ainda 31/out às 23h em São Paulo
    expect((await call("GET", "/api/me")).body.current_month).toBe("2026-10");
    await call("PATCH", "/api/settings", { timezone: "UTC" });
    expect((await call("GET", "/api/me")).body.current_month).toBe("2026-11");
  });
});

describe("prévias", () => {
  it("compra parcelada", async () => {
    const res = await call("POST", "/api/previa/compra", {
      total_cents: 300000,
      installments: 10,
      purchase_date: "2026-10-08",
      method: "cartao",
    });
    expect(res.body).toMatchObject({ installment_cents: 30000, last_month: "2027-07", current_installment: 1 });
  });

  it("falta distribuir", async () => {
    const res = await call("POST", "/api/previa/planejamento", { incomes_cents: [350000], pots_cents: [300000] });
    expect(res.body.unallocated_cents).toBe(50000);
  });
});

describe("Better Auth", () => {
  it("monta o login com Google sobre o mesmo banco", async () => {
    const auth = createAuth(db, {
      baseURL: "http://localhost:3000",
      secret: "x".repeat(32),
      googleClientId: "client-id",
      googleClientSecret: "client-secret",
      trustedOrigins: ["http://localhost:3000"],
    });
    const real = createApp({ db, auth: authPort(auth) });

    expect((await real.request("/api/auth/ok")).status).toBe(200);
    expect((await real.request("/api/mes/2026-10")).status).toBe(401);

    const res = await real.request("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ provider: "google", callbackURL: "/" }),
    });
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    expect(new URL(url).host).toBe("accounts.google.com");
    // o estado do fluxo OAuth foi gravado na tabela verifications
    expect(db.select().from(t.verifications).all().length).toBeGreaterThan(0);
  });
});
