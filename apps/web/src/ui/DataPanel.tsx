import type { Backup } from "@pots/shared";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { backupFileName, exportBackup, importBackup, parseBackup } from "../db/backup.ts";
import { PotsError } from "../db/store.ts";
import { useApp } from "./app-context.ts";
import { lastBackup, markBackup, onBackupChange } from "./backup-reminder.ts";
import { dateTime } from "./format.ts";

export function useLastBackup() {
  return useSyncExternalStore(onBackupChange, lastBackup);
}

/** Baixa o backup (JSON com as tabelas). */
export async function downloadBackup(store: { db: Parameters<typeof exportBackup>[0] }) {
  const now = new Date();
  const backup = await exportBackup(store.db, now);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = backupFileName(now);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  markBackup(now);
}

export function DataPanel() {
  const { store, run, toast, confirm } = useApp();
  const last = useLastBackup();
  const file = useRef<HTMLInputElement>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(null));
  }, []);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    if (file.current) file.current.value = "";
    let b: Backup;
    try {
      b = parseBackup(text);
    } catch (err) {
      toast(err instanceof PotsError ? err.message : "Não deu para ler esse arquivo.");
      return;
    }
    const ok = await confirm({
      title: "Importar backup",
      message: (
        <>
          Importar <strong>{f.name}</strong> apaga tudo o que está neste navegador e coloca no lugar o que está no arquivo ({b.months.length} {b.months.length === 1 ? "mês" : "meses"}, {b.months.reduce((s, m) => s + m.entries.length, 0)} compras,{" "}
          {b.global.fixed.length} fixos).
        </>
      ),
      actions: [{ id: "ok", label: "Substituir" }],
    });
    if (!ok) return;
    await run(async () => {
      await importBackup(store.db, b);
      await store.closePastMonths();
    }, "Backup importado");
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Seus dados</h2>
      </div>
      <p className="small" style={{ margin: 0, color: "var(--fg-2)" }}>
        Tudo fica salvo só neste navegador, sem conta e sem servidor. Baixe um backup de vez em quando e para levar os dados para outro
        aparelho.
      </p>
      <dl className="kv">
        <dt>Você baixou o backup pela última vez em</dt>
        <dd>{last ? dateTime(last) : "nunca baixou"}</dd>
        {persisted != null && (
          <>
            <dt>Armazenamento protegido</dt>
            <dd>{persisted ? "sim" : "não"}</dd>
          </>
        )}
      </dl>
      <div className="btn-row">
        <button className="btn" onClick={() => void run(() => downloadBackup(store), "Backup baixado")}>
          Baixar backup
        </button>
        <button className="btn ghost" onClick={() => file.current?.click()}>
          Importar backup
        </button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => void pick(e.target.files?.[0])} />
      </div>
    </div>
  );
}
