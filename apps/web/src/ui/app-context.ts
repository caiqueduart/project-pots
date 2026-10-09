import { createContext, useContext } from "react";
import type { Store } from "../db/store.ts";

export interface AppCtx {
  store: Store;
  /** Roda uma gravação e mostra o resultado (ou o erro) num aviso. */
  run: (action: () => Promise<unknown>, done?: string) => Promise<boolean>;
  toast: (msg: string) => void;
}

export const AppContext = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("AppContext ausente");
  return ctx;
}
