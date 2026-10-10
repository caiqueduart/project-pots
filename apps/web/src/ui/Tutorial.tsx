import { useEffect, useState, type ReactNode } from "react";

// "Já viu o tutorial" fica só neste navegador (localStorage): é uma conveniência, não um dado do Pots.
const KEY = "pots:tutorial-seen";

export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true; // sem localStorage, não abre sozinho toda vez
  }
}

function markSeen() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // sem localStorage: só volta a abrir na próxima visita
  }
}

const STEPS: { title: string; body: ReactNode }[] = [
  {
    title: "Bem-vindo ao Pots",
    body: (
      <>
        <p>Você divide a renda do mês em <strong>potes</strong> (Moradia, Pessoal, Reserva…) e acompanha quanto já saiu de cada um.</p>
        <p>São três abas. Este guia mostra cada uma em menos de um minuto.</p>
      </>
    ),
  },
  {
    title: "Visão do mês",
    body: (
      <>
        <p>O resumo do mês: quanto entrou, quanto já saiu, como está cada pote e a fatura do cartão.</p>
        <p>Use as setas no topo para ver meses que já fecharam ou a previsão dos próximos. Só o mês atual pode ser editado.</p>
      </>
    ),
  },
  {
    title: "Lançamentos",
    body: (
      <>
        <p>A lista do que caiu no mês. Em <strong>Novo lançamento</strong> você registra:</p>
        <ul>
          <li><strong>Compra</strong>: no cartão (pode parcelar) ou no débito (pix, dinheiro, débito).</li>
          <li><strong>Fixo</strong>: conta que se repete todo mês, como aluguel e assinaturas.</li>
        </ul>
      </>
    ),
  },
  {
    title: "Configurar: renda e potes",
    body: (
      <ul>
        <li><strong>Renda</strong>: o que entra no mês. Pode ter mais de uma fonte.</li>
        <li><strong>Potes</strong>: em quanto você divide a renda. O quadro mostra o que falta distribuir.</li>
        <li><strong>Gasto</strong>: o valor é um teto. O pote fica amarelo perto do limite e vermelho quando passa.</li>
        <li><strong>Meta</strong>: o valor é um objetivo, como a reserva. Chegar nele é bom.</li>
      </ul>
    ),
  },
  {
    title: "Configurar: cartão e dados",
    body: (
      <ul>
        <li><strong>Limite pessoal</strong>: quanto você se permite gastar no cartão por mês.</li>
        <li><strong>Limite do banco</strong>: o limite total que o banco te dá, só como referência.</li>
        <li><strong>Seus dados</strong>: tudo fica só neste navegador. Baixe o backup de vez em quando e importe para levar a outro aparelho.</li>
      </ul>
    ),
  },
];

/** Guia rápido em passos. Abre sozinho na primeira visita; o botão "?" do topo abre de novo. */
export function Tutorial({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i]!;
  const last = i === STEPS.length - 1;
  const close = () => {
    markSeen();
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight" && !last) setI(i + 1);
      if (e.key === "ArrowLeft" && i > 0) setI(i - 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  return (
    <div className="modal-backdrop confirm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal tutorial" role="dialog" aria-modal="true" aria-labelledby="tutorialTitle">
        <div className="panel">
          <div className="panel-head" style={{ flexWrap: "nowrap" }}>
            <h2 id="tutorialTitle">{step.title}</h2>
            <span className="small muted">
              {i + 1} de {STEPS.length}
            </span>
          </div>
          <div className="tutorial-body">{step.body}</div>
          <div className="tutorial-dots" aria-hidden="true">
            {STEPS.map((_, k) => (
              <i key={k} className={k === i ? "on" : ""} />
            ))}
          </div>
          <div className="form-actions">
            {!last && (
              <button className="btn ghost tutorial-skip" type="button" onClick={close}>
                Pular
              </button>
            )}
            {i > 0 && (
              <button className="btn ghost" type="button" onClick={() => setI(i - 1)}>
                Anterior
              </button>
            )}
            <button className="btn" type="button" autoFocus onClick={() => (last ? close() : setI(i + 1))}>
              {last ? "Começar" : "Próximo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
