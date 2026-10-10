import { useLiveQuery } from "dexie-react-hooks";
import { useApp } from "./app-context.ts";
import { BACKUP_REMINDER_DAYS, daysSince } from "./backup-reminder.ts";
import { useLastBackup } from "./DataPanel.tsx";

/** Lembra de baixar o backup quando há dados e o último backup é antigo (ou nunca foi feito). Fica só no Configurar. */
export function BackupReminder() {
  const { store } = useApp();
  const last = useLastBackup();
  const hasData = useLiveQuery(() => store.hasData(), [store]);
  const days = daysSince(last);
  if (!hasData || (days != null && days < BACKUP_REMINDER_DAYS)) return null;
  return (
    <div className="banner warn">
      {days == null ? "Você ainda não baixou nenhum backup." : `Seu último backup foi há ${days} dias.`} Os dados ficam só neste navegador.
    </div>
  );
}
