// Backup: as mesmas tabelas do navegador num arquivo JSON só. Cada item de cada lista é uma linha,
// pronta para virar um INSERT num banco SQL no futuro.
import { BACKUP_FORMAT, BACKUP_SCHEMA, backupSchema, type Backup, type MonthSnapshot } from "@pots/shared";
import type { PotsDB } from "./db.ts";
import { PotsError } from "./store.ts";

export async function exportBackup(db: PotsDB, now = new Date()): Promise<Backup> {
  const [settings, incomes, pots, entries, recurring, month_snapshots] = await Promise.all([
    db.settings.get("settings"),
    db.incomes.toArray(),
    db.pots.toArray(),
    db.entries.toArray(),
    db.recurring.toArray(),
    db.month_snapshots.orderBy("month").toArray(),
  ]);
  if (!settings) throw new PotsError("Ainda não há dados para salvar");
  // linhas excluídas (deleted_at) vão junto: um banco que receber o arquivo sabe o que foi apagado
  return { format: BACKUP_FORMAT, schema: BACKUP_SCHEMA, exported_at: now.toISOString(), settings, incomes, pots, entries, recurring, month_snapshots };
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
  await db.transaction("rw", [db.settings, db.incomes, db.pots, db.entries, db.recurring, db.month_snapshots], async () => {
    await Promise.all([db.settings.clear(), db.incomes.clear(), db.pots.clear(), db.entries.clear(), db.recurring.clear(), db.month_snapshots.clear()]);
    await db.settings.put(backup.settings);
    await db.incomes.bulkPut(backup.incomes);
    await db.pots.bulkPut(backup.pots);
    await db.entries.bulkPut(backup.entries);
    await db.recurring.bulkPut(backup.recurring);
    await db.month_snapshots.bulkPut(backup.month_snapshots as MonthSnapshot[]);
  });
}

export function backupFileName(now = new Date()): string {
  return `pots-backup-${now.toISOString().slice(0, 10)}.json`;
}
