import { localDate, previewPurchase } from "@pots/core";
import { centsToInput, parseCents, type MonthKey, type MonthLine, type PaymentMethod } from "@pots/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useApp } from "./app-context.ts";
import { fmt, METHODS, monthLabel, monthName } from "./format.ts";

export type ModalState = { kind: "new" } | { kind: "entry"; line: MonthLine } | { kind: "fixed"; line: MonthLine };

interface Draft {
  type: "compra" | "fixo";
  description: string;
  amount: string;
  date: string;
  day: string;
  pot_id: string;
  method: PaymentMethod;
  installments: string;
}

export function EntryModal({ state, current, onClose }: { state: ModalState; current: MonthKey; onClose: () => void }) {
  const { store, run, toast } = useApp();
  const pots = useLiveQuery(() => store.userData().then((d) => d.pots.filter((p) => !p.archived_at)), [store]);
  const settings = useLiveQuery(() => store.db.settings.get("settings"), [store]);
  const entry = useLiveQuery(
    async () => (state.kind === "entry" ? await store.db.entries.get(state.line.id) : undefined),
    [store, state],
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const firstInput = useRef<HTMLInputElement>(null);
  const today = settings ? localDate(new Date(), settings.timezone) : "";

  // preenche o formulário uma vez, quando os dados chegam
  useEffect(() => {
    if (draft || !pots || !settings || (state.kind === "entry" && !entry)) return;
    const base: Draft = {
      type: "compra",
      description: "",
      amount: "",
      date: today,
      day: String(Number(today.slice(8, 10))),
      pot_id: pots[0]?.id ?? "",
      method: "cartao",
      installments: "1",
    };
    if (state.kind === "entry" && entry) {
      setDraft({
        ...base,
        description: entry.description,
        amount: centsToInput(entry.total_cents),
        date: entry.purchase_date,
        pot_id: entry.pot_id,
        method: entry.method,
        installments: String(entry.installments),
      });
    } else if (state.kind === "fixed") {
      const l = state.line;
      setDraft({
        ...base,
        type: "fixo",
        description: l.description,
        amount: centsToInput(l.amount_cents),
        day: String(Number(l.date.slice(8, 10))),
        pot_id: l.pot_id,
        method: l.method,
      });
    } else setDraft(base);
  }, [draft, pots, settings, entry, state, today]);

  useEffect(() => {
    if (draft) firstInput.current?.focus();
    // só no primeiro preenchimento
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft === null]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!draft || !pots) return null;

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const isFixed = draft.type === "fixo";
  const editing = state.kind !== "new";
  const mName = monthName(current);
  const cents = parseCents(draft.amount);
  const n = draft.method === "cartao" && !isFixed ? Math.max(1, Math.floor(Number(draft.installments)) || 1) : 1;
  const day = Math.floor(Number(draft.day));

  const title = state.kind === "fixed" ? `Editar fixo de ${mName}` : state.kind === "entry" ? "Editar compra" : "Novo lançamento";

  let preview = "";
  if (state.kind === "fixed") {
    preview = `Escolha se a mudança vale só para ${monthLabel(current)} ou de ${monthLabel(current)} em diante. Os meses fechados não mudam.`;
  } else if (isFixed) {
    if (day >= 1 && day <= 31)
      preview = `Repete todo mês a partir de ${monthLabel(current)}, no dia ${day}${day > 28 ? " (ou no último dia, em meses mais curtos)" : ""}${draft.method === "cartao" ? ", na fatura de cada mês" : ""}. Dá para mudar ou remover um mês sem mexer nos outros.`;
  } else if (cents && draft.date) {
    const p = previewPurchase({ total_cents: cents, installments: n, purchase_date: draft.date, method: draft.method }, current);
    if (draft.method === "debito") preview = `Sai do pote em ${monthLabel(p.first_month)}.`;
    else if (n === 1) preview = `Entra na fatura de ${monthLabel(p.first_month)}.`;
    else {
      const last = p.last_installment_cents !== p.installment_cents ? ` (a última de ${fmt(p.last_installment_cents)})` : "";
      preview = `${n}x de ${fmt(p.installment_cents)}${last}, da fatura de ${monthLabel(p.first_month)} até ${monthLabel(p.last_month)}.`;
      if (p.current_installment && p.first_month < current) preview += ` Em ${mName} cai a parcela ${p.current_installment}/${n}.`;
      if (p.current_installment == null) preview += " Todas as parcelas já passaram.";
    }
  }

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    if (cents == null || cents <= 0) return toast("Informe um valor válido, como 1.250,90");
    const scope = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.dataset.scope as "mes" | "em_diante" | undefined;
    setBusy(true);
    let ok: boolean;
    if (isFixed) {
      const input = { description: draft.description, amount_cents: cents, day, pot_id: draft.pot_id, method: draft.method };
      ok =
        state.kind === "fixed"
          ? await run(
              () => store.editRecurring(state.line.id, input, scope ?? "mes"),
              scope === "em_diante" ? `Fixo atualizado de ${monthLabel(current)} em diante` : `Fixo ajustado só em ${monthLabel(current)}`,
            )
          : await run(() => store.addRecurring(input), `Fixo criado a partir de ${monthLabel(current)}`);
    } else {
      const input = { description: draft.description, total_cents: cents, purchase_date: draft.date, pot_id: draft.pot_id, method: draft.method, installments: n };
      ok =
        state.kind === "entry"
          ? await run(() => store.updateEntry(state.line.id, input), "Compra atualizada")
          : await run(() => store.addEntry(input), "Compra registrada");
    }
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <form className="panel" autoComplete="off" onSubmit={(e) => void submit(e)}>
          <div className="panel-head" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <h2 id="modalTitle">{title}</h2>
              <span className="small muted">{isFixed ? "Contas que se repetem todo mês." : "Compras do dia a dia, grandes ou parceladas."}</span>
            </div>
            <button type="button" className="modal-close" aria-label="Fechar" onClick={onClose}>
              ×
            </button>
          </div>
          {!pots.length ? (
            <div className="empty">Crie um pote em Configurar antes de lançar.</div>
          ) : (
            <div className="form-grid">
              {!editing && (
                <div className="field span-6">
                  <label>Tipo</label>
                  <div className="seg">
                    <button type="button" aria-pressed={!isFixed} onClick={() => set({ type: "compra" })}>
                      Compra
                    </button>
                    <button type="button" aria-pressed={isFixed} onClick={() => set({ type: "fixo" })}>
                      Fixo todo mês
                    </button>
                  </div>
                </div>
              )}
              <div className="field span-3">
                <label htmlFor="f-desc">Nome</label>
                <input
                  ref={firstInput}
                  type="text"
                  id="f-desc"
                  required
                  maxLength={120}
                  value={draft.description}
                  placeholder={isFixed ? "Ex.: Plano de saúde" : "Ex.: Notebook"}
                  onChange={(e) => set({ description: e.target.value })}
                />
              </div>
              <div className="field span-3">
                <label htmlFor="f-pot">Pote</label>
                <select id="f-pot" value={draft.pot_id} onChange={(e) => set({ pot_id: e.target.value })}>
                  {pots.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field span-3 half">
                <label htmlFor="f-total">{isFixed ? "Valor por mês" : "Valor total"}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  id="f-total"
                  required
                  placeholder="0,00"
                  className={draft.amount && cents == null ? "invalid" : ""}
                  value={draft.amount}
                  onChange={(e) => set({ amount: e.target.value })}
                />
              </div>
              {isFixed ? (
                <div className="field span-3 half">
                  <label htmlFor="f-day">Dia do mês</label>
                  <input type="number" id="f-day" min={1} max={31} step={1} required value={draft.day} onChange={(e) => set({ day: e.target.value })} />
                </div>
              ) : (
                <div className="field span-3 half">
                  <label htmlFor="f-date">Data da compra</label>
                  <input type="date" id="f-date" required max={today} value={draft.date} onChange={(e) => set({ date: e.target.value })} />
                </div>
              )}
              <div className="field span-3">
                <label>Pagamento</label>
                <div className="seg">
                  {(Object.keys(METHODS) as PaymentMethod[]).map((m) => (
                    <button key={m} type="button" aria-pressed={draft.method === m} onClick={() => set({ method: m })}>
                      {METHODS[m]}
                    </button>
                  ))}
                </div>
              </div>
              {!isFixed && draft.method === "cartao" && (
                <div className="field span-3">
                  <label htmlFor="f-n">Parcelas</label>
                  <input type="number" id="f-n" min={1} max={120} step={1} value={draft.installments} onChange={(e) => set({ installments: e.target.value })} />
                </div>
              )}
              <div className="span-6 form-note" aria-live="polite">
                {preview}
              </div>
            </div>
          )}
          <div className="form-actions">
            <button className="btn ghost" type="button" onClick={onClose}>
              Cancelar
            </button>
            {state.kind === "fixed" ? (
              <>
                <button className="btn" type="submit" data-scope="mes" disabled={busy}>
                  Salvar só em {mName}
                </button>
                <button className="btn ghost" type="submit" data-scope="em_diante" disabled={busy}>
                  Salvar de {mName} em diante
                </button>
              </>
            ) : (
              <button className="btn" type="submit" disabled={busy || !pots.length}>
                {editing ? "Salvar alterações" : "Registrar"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
