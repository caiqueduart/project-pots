import { localMonth } from "@pots/core";
import { addMonths, type MonthKey } from "@pots/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PotsError, type Store } from "./db/store.ts";
import { AppContext, type AppCtx } from "./ui/app-context.ts";
import { BackupReminder } from "./ui/BackupReminder.tsx";
import { EntriesTab } from "./ui/EntriesTab.tsx";
import { EntryModal, type ModalState } from "./ui/EntryModal.tsx";
import { monthLabel } from "./ui/format.ts";
import { MonthTab } from "./ui/MonthTab.tsx";
import { PlanningTab } from "./ui/PlanningTab.tsx";

type Tab = "mes" | "lanc" | "plan";
const TABS: [Tab, string][] = [
  ["mes", "Visão do mês"],
  ["lanc", "Lançamentos"],
  ["plan", "Configurar"],
];

export function App({ store }: { store: Store }) {
  const settings = useLiveQuery(() => store.db.settings.get("settings"), [store]);
  // muda quando o app volta a ficar visível: o mês atual pode ter virado
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState<MonthKey | null>(null);
  const [tab, setTab] = useState<Tab>("mes");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void store.closePastMonths().finally(() => setTick((t) => t + 1));
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [store]);

  const current = useMemo(
    () => (settings ? localMonth(new Date(), settings.timezone) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, tick],
  );
  const month = selected ?? current;

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const run = useCallback<AppCtx["run"]>(
    async (action, done) => {
      try {
        await action();
        if (done) toast(done);
        return true;
      } catch (err) {
        if (err instanceof PotsError) toast(err.message);
        else {
          console.error(err);
          toast("Algo deu errado. Tente de novo.");
        }
        return false;
      }
    },
    [toast],
  );

  const ctx = useMemo<AppCtx>(() => ({ store, run, toast }), [store, run, toast]);

  useEffect(() => {
    document.body.style.overflow = modal ? "hidden" : "";
  }, [modal]);

  if (!settings || !current || !month) return null;

  const goMonth = (m: MonthKey) => {
    setSelected(m === current ? null : m);
    setModal(null);
  };
  const canAdd = month === current && tab !== "plan" && !modal;

  return (
    <AppContext.Provider value={ctx}>
      <header className="top">
        <div className="top-inner">
          <div className="brand-row">
            <div className="brand">
              <span className="brand-mark">R$</span>Pots
            </div>
            {tab !== "plan" && (
              <div className="month-nav">
                <button aria-label="Mês anterior" onClick={() => goMonth(addMonths(month, -1))}>
                  ‹
                </button>
                <div className="month-label" aria-live="polite">
                  {monthLabel(month)}
                </div>
                <button aria-label="Próximo mês" onClick={() => goMonth(addMonths(month, 1))}>
                  ›
                </button>
                <button className="today-btn" disabled={month === current} onClick={() => goMonth(current)}>
                  Mês atual
                </button>
              </div>
            )}
          </div>
          <nav className="tabs" role="tablist">
            {TABS.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="wrap">
        <BackupReminder onOpen={() => setTab("plan")} />
        {tab === "mes" && (
          <MonthTab
            month={month}
            current={current}
            tick={tick}
            onNew={() => setModal({ kind: "new" })}
            onGoCurrent={() => goMonth(current)}
            onPlanning={() => setTab("plan")}
          />
        )}
        {tab === "lanc" && (
          <EntriesTab
            month={month}
            current={current}
            tick={tick}
            onNew={() => setModal({ kind: "new" })}
            onEdit={(m) => setModal(m)}
            onGoCurrent={() => goMonth(current)}
          />
        )}
        {tab === "plan" && <PlanningTab current={current} />}
      </main>

      {canAdd && (
        <button className="fab" aria-label="Novo lançamento" onClick={() => setModal({ kind: "new" })}>
          +
        </button>
      )}
      {modal && <EntryModal state={modal} current={current} onClose={() => setModal(null)} />}
      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
    </AppContext.Provider>
  );
}
