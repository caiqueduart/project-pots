// Lembrete de backup. A data do último backup fica só neste navegador (localStorage):
// é uma conveniência de quem usa, não um dado do Pots.
const KEY = "pots:last-backup";
/** Depois de quantos dias sem backup o app lembra. */
export const BACKUP_REMINDER_DAYS = 30;

const listeners = new Set<() => void>();

export function lastBackup(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function markBackup(at = new Date()) {
  try {
    localStorage.setItem(KEY, at.toISOString());
  } catch {
    // sem localStorage: o lembrete só não some
  }
  listeners.forEach((l) => l());
}

export function onBackupChange(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function daysSince(iso: string | null, now = new Date()): number | null {
  if (!iso) return null;
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}
