import type { MonthView } from '@pots/shared';
import { dateTime, monthLabel } from './format.ts';

/** Aviso de mês fechado (passado) ou de previsão (futuro). O mês atual não tem aviso. */
export function MonthBanner({ view, onGoCurrent }: { view: MonthView; onGoCurrent: () => void }) {
    if (view.kind === 'atual') return null;
    const text =
        view.kind === 'passado' ? (
            <span>
                <strong>Mês fechado</strong> em {view.closed_at ? dateTime(view.closed_at) : '—'}. É uma foto de como o
                mês terminou e não muda mais.
            </span>
        ) : (
            <span>
                <strong>Previsão</strong> com o que já está registrado hoje. Só é possível para lançar no mês atual, em{' '}
                {monthLabel(view.current_month)}.
            </span>
        );
    return (
        <div className={`banner ${view.kind === 'futuro' ? 'future' : ''}`}>
            {text}
            <button className="btn ghost" onClick={onGoCurrent}>
                Ir para o mês atual
            </button>
        </div>
    );
}

/** Mês antes do primeiro uso: não existe foto. */
export function NoMonth({ firstMonth, onGoCurrent }: { firstMonth: string; onGoCurrent: () => void }) {
    return (
        <div className="stack">
            <div className="empty">
                Sem dados deste mês. Você começou a usar o Pots em {monthLabel(firstMonth)}.
                <div style={{ marginTop: 12 }}>
                    <button className="btn ghost" onClick={onGoCurrent}>
                        Ir para o mês atual
                    </button>
                </div>
            </div>
        </div>
    );
}
