import { useEffect, useRef, type ReactNode } from "react";

export interface ConfirmAction {
  id: string;
  label: string;
}

export interface ConfirmRequest {
  title: string;
  message: ReactNode;
  /** Botões da ação perigosa. Sem isso, um único "Excluir". */
  actions?: ConfirmAction[];
}

/** Janela de confirmação para exclusões: nada some com um clique por acidente. */
export function ConfirmDialog({ req, onAnswer }: { req: ConfirmRequest; onAnswer: (id: string | null) => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  const actions = req.actions ?? [{ id: "ok", label: "Excluir" }];

  useEffect(() => {
    // o foco começa no Cancelar: Enter sem querer não apaga nada
    cancel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onAnswer(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onAnswer]);

  return (
    <div className="modal-backdrop confirm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onAnswer(null)}>
      <div className="modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirmTitle" aria-describedby="confirmMsg">
        <div className="panel">
          <h2 id="confirmTitle">{req.title}</h2>
          <p id="confirmMsg" className="confirm-msg">
            {req.message}
          </p>
          <div className="form-actions">
            <button ref={cancel} className="btn ghost" type="button" onClick={() => onAnswer(null)}>
              Cancelar
            </button>
            {actions.map((a) => (
              <button key={a.id} className="btn crit" type="button" onClick={() => onAnswer(a.id)}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
