// Backup: o que está no navegador num arquivo JSON só, como está no momento (com o mês aberto).
import { BACKUP_FORMAT, BACKUP_SCHEMA, backupSchema, type Backup } from "@pots/shared";
import type { PotsDB } from "./db.ts";
import { PotsError } from "./store.ts";

export async function exportBackup(db: PotsDB, now = new Date()): Promise<Backup> {
  const [months, global] = await Promise.all([db.months.orderBy("month").toArray(), db.global.get("global")]);
  if (!months.length) throw new PotsError("Ainda não há dados para salvar");
  return { format: BACKUP_FORMAT, schema: BACKUP_SCHEMA, exported_at: now.toISOString(), global: { fixed: global?.fixed ?? [] }, months };
}

export function parseBackup(text: string): Backup {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new PotsError("O arquivo não é um backup do Pots");
  }
  const r = backupSchema.safeParse(json);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new PotsError(`Backup inválido${issue?.path.length ? ` (${issue.path.join(".")})` : ""}`);
  }
  return r.data;
}

/** Substitui tudo o que está neste navegador pelo conteúdo do backup. */
export async function importBackup(db: PotsDB, backup: Backup): Promise<void> {
  await db.transaction("rw", [db.months, db.global], async () => {
    await Promise.all([db.months.clear(), db.global.clear()]);
    await db.global.put({ id: "global", fixed: backup.global.fixed });
    await db.months.bulkPut(backup.months);
  });
}

export function backupFileName(now = new Date()): string {
  return `pots-backup-${now.toISOString().slice(0, 10)}.json`;
}
