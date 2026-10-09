import { useLiveQuery } from "dexie-react-hooks";
import { useApp } from "./app-context.ts";
import { BACKUP_REMINDER_DAYS, daysSince } from "./backup-reminder.ts";
import { downloadBackup, useLastBackup } from "./DataPanel.tsx";

/** Lembra de baixar o backup quando há dados e o último backup é antigo (ou nunca foi feito). */
export function BackupReminder({ onOpen }: { onOpen: () => void }) {
  const { store, run } = useApp();
  const last = useLastBackup();
  const hasData = useLiveQuery(async () => (await store.db.entries.count()) + (await store.db.recurring.count()) > 0, [store]);
  const days = daysSince(last);
  if (!hasData || (days != null && days < BACKUP_REMINDER_DAYS)) return null;
  return (
    <div className="banner warn">
      <span>
        {days == null ? "Você ainda não baixou nenhum backup." : `Seu último backup foi há ${days} dias.`} Os dados ficam só neste navegador.
      </span>
      <div className="btn-row">
        <button className="btn ghost" onClick={onOpen}>
          Saiba mais
        </button>
        <button className="btn" onClick={() => void run(() => downloadBackup(store), "Backup baixado")}>
          Baixar backup
        </button>
      </div>
    </div>
  );
}
