import type { MonthKey, MonthLine } from "@pots/shared";
import { useApp } from "./app-context.ts";
import type { ModalState } from "./EntryModal.tsx";
import { dateShort, fmt, METHODS, monthLabel, monthName } from "./format.ts";
import { useMonthView } from "./hooks.ts";
import { MonthBanner, NoMonth } from "./MonthBanner.tsx";

interface Props {
  month: MonthKey;
  current: MonthKey;
  tick: number;
  onNew: () => void;
  onEdit: (m: ModalState) => void;
  onGoCurrent: () => void;
}

export function EntriesTab({ month, tick, onNew, onEdit, onGoCurrent }: Props) {
  const { store, run, confirm } = useApp();
  const data = useMonthView(month, tick);
  if (!data) return null;
  const { view, firstMonth } = data;
  if (!view) return <NoMonth firstMonth={firstMonth} onGoCurrent={onGoCurrent} />;

  const mName = monthName(month);
  const key = (l: MonthLine) => `${l.source}-${l.id}`;

  const remove = async (l: MonthLine) => {
    if (l.source === "recurring") {
      const choice = await confirm({
        title: "Excluir fixo",
        message: (
          <>
            <strong>{l.description}</strong> sai só de {mName} ou de {mName} em diante? Os meses que já fecharam não mudam.
          </>
        ),
        actions: [
          { id: "mes", label: `Só ${mName}` },
          { id: "em_diante", label: `${mName} em diante` },
        ],
      });
      if (choice === "mes") await run(() => store.deleteRecurring(l.id, "mes"), `Fixo removido só de ${monthLabel(month)}`);
      if (choice === "em_diante") await run(() => store.deleteRecurring(l.id, "em_diante"), `Fixo encerrado a partir de ${monthLabel(month)}`);
      return;
    }
    const parcelas = l.installments && l.installments > 1 ? ` Todas as ${l.installments} parcelas saem junto.` : "";
    const ok = await confirm({
      title: "Excluir compra",
      message: (
        <>
          Excluir <strong>{l.description}</strong>?{parcelas}
        </>
      ),
    });
    if (ok) await run(() => store.deleteEntry(l.id), "Compra excluída");
  };

  const actions = (l: MonthLine, cls: string) => {
    if (!view.editable) return null;
    return (
      <div className={`row-actions ${cls}`}>
        <button className="linkish small" onClick={() => onEdit({ kind: l.source === "recurring" ? "fixed" : "entry", line: l })}>
          Editar
        </button>
        <button className="linkish small" style={{ color: "var(--crit)" }} onClick={() => void remove(l)}>
          Excluir
        </button>
      </div>
    );
  };

  const row = (l: MonthLine) => {
    const parc = l.method === "cartao" && l.installments && l.installments > 1 ? `${l.installment}/${l.installments}` : "";
    const sub =
      l.source === "recurring"
        ? `dia ${Number(l.date.slice(8, 10))}${l.edited ? " · ajustado neste mês" : ""}`
        : `${dateShort(l.purchase_date ?? l.date)}${l.installments && l.installments > 1 ? ` · total ${fmt(l.total_cents ?? 0)}` : ""}`;
    return (
      <tr key={key(l)}>
        <td>
          {l.description}
          <div className="small muted">{sub}</div>
          <div className="small muted show-sm">
            {METHODS[l.method]}
            {parc ? ` ${parc}` : ""} · {l.pot_name || "—"}
          </div>
          {actions(l, "show-sm")}
        </td>
        <td className="hide-sm">{l.pot_name || "—"}</td>
        <td className="hide-sm">
          {METHODS[l.method]} {parc && <span className="installment">{parc}</span>}
        </td>
        <td className="r num">{fmt(l.amount_cents)}</td>
        <td className="hide-sm">{actions(l, "")}</td>
      </tr>
    );
  };

  const groups: [string, MonthLine[]][] = (
    [
      ["Fixos", view.lines.filter((l) => l.source === "recurring").sort((a, b) => a.description.localeCompare(b.description, "pt-BR"))],
      ["Compras e parcelas", view.lines.filter((l) => l.source === "entry").sort((a, b) => b.date.localeCompare(a.date))],
    ] as [string, MonthLine[]][]
  ).filter(([, ls]) => ls.length);

  return (
    <>
      <MonthBanner view={view} onGoCurrent={onGoCurrent} />
      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 24 }}>
        <div className="panel">
          <div className="panel-head">
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <h2>O que caiu em {monthLabel(month)}</h2>
              <span className="small muted">Compras no cartão aparecem pela fatura</span>
            </div>
            {view.editable && (
              <button className="btn hide-sm" onClick={onNew}>
                Novo lançamento
              </button>
            )}
          </div>
          {groups.length ? (
            <div className="table-wrap">
              <table className="lanc">
                <thead>
                  <tr>
                    <th>Compra</th>
                    <th className="hide-sm">Pote</th>
                    <th className="hide-sm">Pagamento</th>
                    <th className="r">No mês</th>
                    <th className="hide-sm" />
                  </tr>
                </thead>
                {groups.map(([name, ls]) => (
                  <tbody key={name}>
                    <tr className="group-row">
                      <th scope="colgroup">
                        {name} <span className="muted">({ls.length})</span>
                      </th>
                      <th className="hide-sm" />
                      <th className="hide-sm" />
                      <th className="r num">{fmt(ls.reduce((s, l) => s + l.amount_cents, 0))}</th>
                      <th className="hide-sm" />
                    </tr>
                    {ls.map(row)}
                  </tbody>
                ))}
              </table>
            </div>
          ) : (
            <div className="empty">
              {view.editable ? 'Nenhum lançamento neste mês. Use "Novo lançamento" para registrar a primeira compra ou um fixo.' : "Nada caiu neste mês."}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
