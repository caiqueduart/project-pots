import { localMonth } from "@pots/core";
import type { MonthKey, MonthView } from "@pots/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useApp } from "./app-context.ts";

/** O mês pronto para a tela. undefined enquanto carrega; view null = mês antes do primeiro uso. */
export function useMonthView(month: MonthKey, tick: number) {
  const { store } = useApp();
  return useLiveQuery(
    async () => {
      const [view, settings] = await Promise.all([store.monthView(month), store.db.settings.get("settings")]);
      const firstMonth = settings ? localMonth(new Date(settings.created_at)) : month;
      return { view, firstMonth };
    },
    [store, month, tick],
  );
}

export function useUserData() {
  const { store } = useApp();
  return useLiveQuery(() => store.userData(), [store]);
}

export type { MonthView };
