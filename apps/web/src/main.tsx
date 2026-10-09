import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App.tsx";
import { PotsDB } from "./db/db.ts";
import { Store } from "./db/store.ts";
import "./styles.css";

const store = new Store(new PotsDB());

// Pede ao navegador para não apagar os dados quando faltar espaço.
void navigator.storage?.persist?.().catch(() => false);
registerSW({ immediate: true });

// Fecha os meses que viraram antes da primeira tela.
void store
  .closePastMonths()
  .catch((err: unknown) => console.error(err))
  .finally(() => {
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <App store={store} />
      </StrictMode>,
    );
  });
