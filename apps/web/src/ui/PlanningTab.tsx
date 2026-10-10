import { previewPlanning } from "@pots/core";
import { centsToInput, parseCents, type MonthKey, type PotKind } from "@pots/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useState, type InputHTMLAttributes } from "react";
import { useApp } from "./app-context.ts";
import { DataPanel } from "./DataPanel.tsx";
import { fmt, monthLabel } from "./format.ts";
import { useUserData } from "./hooks.ts";

/** Campo de texto que grava ao sair (blur) ou com Enter. Volta ao valor salvo se a gravação falhar. */
function CommitInput({
  value,
  onCommit,
  money,
  onLive,
  ...rest
}: {
  value: string;
  onCommit: (v: string) => Promise<boolean>;
  money?: boolean;
  onLive?: (v: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? value;
  const invalid = money && text != null && parseCents(text) == null;
  const commit = async () => {
    if (text == null || text === value) return setText(null);
    const ok = await onCommit(text);
    setText(null);
    if (!ok) onLive?.(value);
  };
  return (
    <input
      type="text"
      inputMode={money ? "decimal" : undefined}
      className={invalid ? "invalid" : ""}
      {...rest}
      value={shown}
      onChange={(e) => {
        setText(e.target.value);
        onLive?.(e.target.value);
      }}
      onBlur={() => void commit()}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function PlanningTab({ current }: { current: MonthKey }) {
  const { store, run, toast, confirm } = useApp();
  const data = useUserData();
  const settings = useLiveQuery(() => store.db.settings.get("settings"), [store]);
  // valores digitados e ainda não gravados, para o "Falta distribuir" acompanhar a digitação
  const [live, setLive] = useState<Record<string, number>>({});

  if (!data || !settings) return null;
  const pots = data.pots.filter((p) => !p.archived_at);
  const dist = previewPlanning({
    incomes_cents: data.incomes.map((i) => live[i.id] ?? i.amount_cents),
    pots_cents: pots.map((p) => live[p.id] ?? p.amount_cents),
  });
  const rest = dist.unallocated_cents;
  const [cls, label] = rest > 0 ? ["warn", "Falta distribuir"] : rest < 0 ? ["crit", "Passou da renda"] : ["ok", "Tudo distribuído"];

  const liveMoney = (id: string) => (v: string) => {
    const c = parseCents(v);
    setLive((prev) => {
      const next = { ...prev };
      if (c == null) delete next[id];
      else next[id] = c;
      return next;
    });
  };
  const money = (v: string) => {
    const c = parseCents(v);
    if (c == null) {
      toast("Valor inválido. Use algo como 1.500,00");
      return null;
    }
    return c;
  };
  const saveMoney = async (id: string, v: string, save: (c: number) => Promise<unknown>) => {
    const c = money(v);
    const ok = c != null && (await run(() => save(c)));
    setLive(({ [id]: _, ...restLive }) => restLive);
    return ok;
  };

  return (
    <>
      <p className="small muted" style={{ marginTop: 20, marginBottom: 0 }}>
        O planejamento vale de {monthLabel(current)} em diante. Os meses que já fecharam não mudam.
      </p>
      <div className="grid-2" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
          <div className="panel">
            <div className="panel-head">
              <h2>Renda</h2>
              <button className="linkish small" onClick={() => void run(() => store.addIncome({ name: "Nova fonte", amount_cents: 0 }))}>
                + Adicionar fonte
              </button>
            </div>
            <div className="edit-list">
              {data.incomes.length ? (
                data.incomes.map((i) => (
                  <div className="edit-row inc-row" key={i.id}>
                    <label className="pf pf-name">
                      <span className="pf-l">Fonte</span>
                      <CommitInput aria-label="Nome da fonte" value={i.name} onCommit={(v) => run(() => store.updateIncome(i.id, { name: v }))} />
                    </label>
                    <label className="pf pf-lim">
                      <span className="pf-l">Valor</span>
                      <CommitInput
                        aria-label="Valor"
                        money
                        value={centsToInput(i.amount_cents)}
                        onLive={liveMoney(i.id)}
                        onCommit={(v) => saveMoney(i.id, v, (c) => store.updateIncome(i.id, { amount_cents: c }))}
                      />
                    </label>
                    <button
                      className="linkish small pf-del"
                      style={{ color: "var(--crit)" }}
                      aria-label={`Remover ${i.name}`}
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Remover fonte de renda",
                          message: (
                            <>
                              Remover <strong>{i.name}</strong> da sua renda? Os meses que já fecharam não mudam.
                            </>
                          ),
                          actions: [{ id: "ok", label: "Remover" }],
                        });
                        if (ok) await run(() => store.deleteIncome(i.id), "Fonte removida");
                      }}
                    >
                      Remover
                    </button>
                  </div>
                ))
              ) : (
                <div className="muted small">Nenhuma renda cadastrada.</div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Potes</h2>
              <button className="linkish small" onClick={() => void run(() => store.addPot({ name: "Novo pote", kind: "gasto", amount_cents: 0 }))}>
                + Novo pote
              </button>
            </div>
            <div className={`dist ${cls}`}>
              <div>
                <span>Renda</span>
                <strong className="num">{fmt(dist.income_cents)}</strong>
              </div>
              <div>
                <span>Distribuído</span>
                <strong className="num">{fmt(dist.budgeted_cents)}</strong>
              </div>
              <div className="rest">
                <span>{label}</span>
                <strong className="num">{rest ? fmt(Math.abs(rest)) : "✓"}</strong>
              </div>
            </div>
            <div className="edit-head">
              <span>Pote</span>
              <span>Valor</span>
              <span>Tipo</span>
              <span />
            </div>
            <div className="edit-list">
              {pots.map((p) => (
                <div className="edit-row pot-row" key={p.id}>
                  <label className="pf pf-name">
                    <span className="pf-l">Pote</span>
                    <CommitInput aria-label="Nome do pote" value={p.name} onCommit={(v) => run(() => store.updatePot(p.id, { name: v }))} />
                  </label>
                  <label className="pf pf-lim">
                    <span className="pf-l">Valor</span>
                    <CommitInput
                      aria-label={`Valor de ${p.name}`}
                      money
                      value={centsToInput(p.amount_cents)}
                      onLive={liveMoney(p.id)}
                      onCommit={(v) => saveMoney(p.id, v, (c) => store.updatePot(p.id, { amount_cents: c }))}
                    />
                  </label>
                  <label className="pf pf-kind">
                    <span className="pf-l">Tipo</span>
                    <select
                      aria-label={`Tipo de ${p.name}`}
                      value={p.kind}
                      onChange={(e) =>
                        void run(() => store.updatePot(p.id, { kind: e.target.value as PotKind }), e.target.value === "meta" ? "Pote virou meta" : "Pote virou gasto")
                      }
                    >
                      <option value="gasto">Gasto</option>
                      <option value="meta">Meta</option>
                    </select>
                  </label>
                  <button
                    className="linkish small pf-del"
                    style={{ color: "var(--crit)" }}
                    aria-label={`Remover ${p.name}`}
                    onClick={async () => {
                      const ok = await confirm({
                        title: "Remover pote",
                        message: (
                          <>
                            Remover o pote <strong>{p.name}</strong>? Ele some do planejamento, mas as compras antigas e os meses fechados continuam
                            com ele.
                          </>
                        ),
                        actions: [{ id: "ok", label: "Remover" }],
                      });
                      if (ok) await run(() => store.archivePot(p.id), "Pote removido");
                    }}
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
            <dl className="kind-help">
              <div>
                <dt>Gasto</dt>
                <dd>O valor é um teto. Avisa a partir de {settings.warn_pct}% e quando passa.</dd>
              </div>
              <div>
                <dt>Meta</dt>
                <dd>O valor é um objetivo, como a reserva. Chegar nele é bom.</dd>
              </div>
            </dl>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
          <div className="panel">
            <div className="panel-head">
              <h2>Cartão de crédito</h2>
            </div>
            <div className="form-grid">
              <div className="field span-3">
                <label htmlFor="c-pl">Seu limite pessoal</label>
                <CommitInput
                  id="c-pl"
                  money
                  value={centsToInput(settings.personal_limit_cents)}
                  onCommit={async (v) => {
                    const c = money(v);
                    return c != null && run(() => store.updateSettings({ personal_limit_cents: c }));
                  }}
                />
                <span className="hint">Quanto você realmente pode usar no crédito por mês.</span>
              </div>
              <div className="field span-3">
                <label htmlFor="c-bl">Limite do banco</label>
                <CommitInput
                  id="c-bl"
                  money
                  value={centsToInput(settings.bank_limit_cents)}
                  onCommit={async (v) => {
                    const c = money(v);
                    return c != null && run(() => store.updateSettings({ bank_limit_cents: c }));
                  }}
                />
                <span className="hint">O limite total que o banco te dá.</span>
              </div>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              Compras no cartão entram na fatura do mês em que foram feitas.
            </p>
          </div>

          <DataPanel />
        </div>
      </div>
    </>
  );
}
