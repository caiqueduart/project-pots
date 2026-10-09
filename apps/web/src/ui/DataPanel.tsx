import type { Backup } from "@pots/shared";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { backupFileName, exportBackup, importBackup, parseBackup } from "../db/backup.ts";
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
  const { store, run } = useApp();
  const last = useLastBackup();
  const file = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ name: string; backup: Backup } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(null));
  }, []);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    await run(async () => setPending({ name: f.name, backup: parseBackup(text) }));
    if (file.current) file.current.value = "";
  };

  const confirmImport = async () => {
    if (!pending) return;
    const ok = await run(async () => {
      await importBackup(store.db, pending.backup);
      await store.closePastMonths();
    }, "Backup importado");
    if (ok) setPending(null);
  };

  const alive = <T extends { deleted_at: string | null }>(rows: T[]) => rows.filter((r) => !r.deleted_at).length;

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
        <dt>Último backup</dt>
        <dd>{last ? dateTime(last) : "nunca"}</dd>
        {persisted != null && (
          <>
            <dt>Armazenamento protegido</dt>
            <dd>{persisted ? "sim" : "não"}</dd>
          </>
        )}
      </dl>
      {pending ? (
        <div className="banner warn" style={{ marginTop: 0 }}>
          <span>
            Importar <strong>{pending.name}</strong> substitui tudo o que está neste navegador ({alive(pending.backup.entries)} compras,{" "}
            {alive(pending.backup.recurring)} fixos, {pending.backup.month_snapshots.length} meses fechados).
          </span>
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setPending(null)}>
              Cancelar
            </button>
            <button className="btn" onClick={() => void confirmImport()}>
              Substituir
            </button>
          </div>
        </div>
      ) : (
        <div className="btn-row">
          <button className="btn" onClick={() => void run(() => downloadBackup(store), "Backup baixado")}>
            Baixar backup
          </button>
          <button className="btn ghost" onClick={() => file.current?.click()}>
            Importar backup
          </button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => void pick(e.target.files?.[0])} />
        </div>
      )}
    </div>
  );
}
