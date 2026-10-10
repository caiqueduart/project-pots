import { createContext, useContext } from "react";
import type { Store } from "../db/store.ts";
import type { ConfirmRequest } from "./ConfirmDialog.tsx";

export interface AppCtx {
  store: Store;
  /** Roda uma gravação e mostra o resultado (ou o erro) num aviso. */
  run: (action: () => Promise<unknown>, done?: string) => Promise<boolean>;
  toast: (msg: string) => void;
  /** Pede confirmação numa janela. Resolve com o id da ação escolhida, ou null se cancelou. */
  confirm: (req: ConfirmRequest) => Promise<string | null>;
}

export const AppContext = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("AppContext ausente");
  return ctx;
}
