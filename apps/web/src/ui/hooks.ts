import type { MonthKey, MonthView } from "@pots/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useApp } from "./app-context.ts";

/** O mês pronto para a tela. undefined enquanto carrega; view null = mês antes do primeiro uso. */
export function useMonthView(month: MonthKey, tick: number) {
  const { store } = useApp();
  return useLiveQuery(
    async () => {
      const [view, first] = await Promise.all([store.monthView(month), store.firstMonth()]);
      return { view, firstMonth: first ?? month };
    },
    [store, month, tick],
  );
}

/** O mês aberto (plano, fixos e compras dele). */
export function useCurrentRecord() {
  const { store } = useApp();
  return useLiveQuery(() => store.currentRecord(), [store]);
}

export type { MonthView };
