import { addMonths, type LimitStatus, type MonthKey, type MonthPot, type MonthView } from '@pots/shared';
import { useState } from 'react';
import { fmt, monthName, monthShort } from './format.ts';
import { useMonthView } from './hooks.ts';
import { MonthBanner, NoMonth } from './MonthBanner.tsx';

const meterClass = (s: string) => (s === 'estourou' ? 'crit' : s === 'aviso' ? 'warn' : '');
const textClass = (s: LimitStatus) => (s === 'estourou' ? 'neg' : s === 'aviso' ? 'warnc' : '');
const hintClass = (s: LimitStatus) => (s === 'estourou' ? 'neg' : s === 'aviso' ? 'warn' : '');

interface Props {
    month: MonthKey;
    current: MonthKey;
    tick: number;
    onNew: () => void;
    onGoCurrent: () => void;
    onPlanning: () => void;
}

export function MonthTab({ month, tick, onNew, onGoCurrent, onPlanning }: Props) {
    const data = useMonthView(month, tick);
    if (!data) return null;
    const { view, firstMonth } = data;
    if (!view) return <NoMonth firstMonth={firstMonth} onGoCurrent={onGoCurrent} />;

    const empty = !view.incomes.length && !view.pots.length && !view.lines.length;
    if (empty && view.kind === 'atual') return <Onboarding onPlanning={onPlanning} />;

    return (
        <>
            <MonthBanner view={view} onGoCurrent={onGoCurrent} />
            <Summary view={view} onNew={onNew} />
            <div className="grid-2">
                <PotsPanel view={view} onPlanning={onPlanning} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
                    <CardPanel view={view} />
                </div>
            </div>
            <div className="section-head">
                <h3>Próximos meses</h3>
            </div>
            <div className="stack">
                <Forecast view={view} />
                <Installments view={view} />
            </div>
        </>
    );
}

function Onboarding({ onPlanning }: { onPlanning: () => void }) {
    return (
        <div className="panel onboarding">
            <h2>Bem-vindo ao Pots</h2>
            <ol>
                <li>Em Configurar, cadastre sua renda e divida em potes (Moradia, Pessoal, Reserva…).</li>
                <li>Coloque o seu limite pessoal do cartão.</li>
                <li>Lance os fixos (aluguel, assinaturas) e as compras do mês.</li>
            </ol>
            <p className="small muted" style={{ margin: 0 }}>
                Tudo fica salvo só neste navegador. Se já usava o Pots em outro aparelho, importe o backup em
                Configurar.
            </p>
            <button className="btn" onClick={onPlanning}>
                Começar por Configurar
            </button>
        </div>
    );
}

function Summary({ view, onNew }: { view: MonthView; onNew: () => void }) {
    const t = view.totals;
    const fixedHint = t.fixed_cents
        ? `${fmt(t.fixed_cents)} em fixos${t.fixed_status !== 'ok' && t.fixed_pct_of_income != null ? ` (${t.fixed_pct_of_income}% da renda)` : ''}`
        : 'parcelas e compras';
    return (
        <>
            <div className="section-head">
                <h3>Resumo de {monthName(view.month)}</h3>
                {view.editable && (
                    <button className="btn hide-sm" onClick={onNew}>
                        Novo lançamento
                    </button>
                )}
            </div>
            <div className="summary">
                <div>
                    <span className="label">Renda do mês</span>
                    <span className="value">{fmt(t.income_cents)}</span>
                    <span className="hint">{view.incomes.map((i) => i.name).join(', ') || 'sem renda cadastrada'}</span>
                </div>
                <div>
                    <span className="label">Distribuído nos potes</span>
                    <span className="value">{fmt(t.budgeted_cents)}</span>
                    <span className={`hint ${t.unallocated_cents < 0 ? 'neg' : t.unallocated_cents > 0 ? 'warn' : ''}`}>
                        {t.unallocated_cents >= 0
                            ? `${fmt(t.unallocated_cents)} sem pote`
                            : `${fmt(-t.unallocated_cents)} além da renda`}
                    </span>
                </div>
                <div>
                    <span className="label">Gasto no mês</span>
                    <span className={`value ${textClass(t.spent_status)}`}>{fmt(t.spent_cents)}</span>
                    <span className={`hint ${hintClass(t.fixed_status)}`}>{fixedHint}</span>
                </div>
                <div>
                    <span className="label">Disponível para uso</span>
                    <span className={`value ${t.available_cents < 0 ? 'neg' : 'pos'}`}>{fmt(t.available_cents)}</span>
                    <span className="hint">renda − gasto</span>
                </div>
            </div>
        </>
    );
}

function PotRow({ p }: { p: MonthPot }) {
    const meta = p.kind === 'meta';
    const width = p.budget_cents ? Math.min(100, (p.used_cents / p.budget_cents) * 100) : p.used_cents ? 100 : 0;
    const chip = meta ? (
        p.status === 'cumprida' ? (
            <span className="chip ok">Meta cumprida</span>
        ) : (
            <span className="chip">Meta</span>
        )
    ) : p.status === 'estourou' ? (
        <span className="chip crit">Estourou</span>
    ) : p.status === 'aviso' ? (
        <span className="chip warn">Quase no limite</span>
    ) : null;
    const rest = p.remaining_cents;
    const foot = meta ? (
        rest > 0 ? (
            <>
                Faltam <span className="num">{fmt(rest)}</span> para a meta
            </>
        ) : rest < 0 ? (
            <>
                Passou <span className="num">{fmt(-rest)}</span> da meta
            </>
        ) : (
            'Meta atingida'
        )
    ) : rest >= 0 ? (
        <>
            Sobram <span className="num">{fmt(rest)}</span>
        </>
    ) : (
        <>
            Passou <span className="num">{fmt(-rest)}</span>
        </>
    );
    return (
        <div className="pot">
            <div className="pot-name">
                {p.name} {chip} {p.archived && <span className="chip arch">Removido</span>}
            </div>
            <div className="pot-nums num">
                {fmt(p.used_cents)}{' '}
                <span className="muted">
                    {meta ? 'de meta' : 'de'} {fmt(p.budget_cents)}
                </span>
            </div>
            <div
                className={`meter ${meta ? '' : meterClass(p.status)}`}
                role="img"
                aria-label={`${p.name}: ${p.pct ?? 0}% ${meta ? 'da meta' : 'usado'}`}
            >
                <span style={{ width: `${width}%` }} />
            </div>
            <div className="pot-foot">
                <span>{foot}</span>
            </div>
        </div>
    );
}

function PotsPanel({ view, onPlanning }: { view: MonthView; onPlanning: () => void }) {
    return (
        <div className="panel">
            <div className="panel-head">
                <h2>Potes</h2>
                {view.editable && (
                    <button className="linkish small" onClick={onPlanning}>
                        Editar potes
                    </button>
                )}
            </div>
            <div>
                {view.pots.length ? (
                    view.pots.map((p) => <PotRow key={p.id} p={p} />)
                ) : (
                    <div className="empty">Nenhum pote.</div>
                )}
            </div>
        </div>
    );
}

function CardPanel({ view }: { view: MonthView }) {
    const c = view.card;
    const [open, setOpen] = useState(false);
    const L = c.personal_limit_cents;
    const w = L ? Math.min(100, (c.invoice_cents / L) * 100) : 0;
    const label =
        c.status === 'estourou' ? 'Acima do limite' : c.status === 'aviso' ? 'Perto do limite' : 'Dentro do limite';
    const chip = c.status === 'estourou' ? 'crit' : c.status === 'aviso' ? 'warn' : 'ok';
    const n = c.items.length;
    const prev = monthName(addMonths(view.month, -1));
    const next = monthName(addMonths(view.month, 1));
    // a compra no cartão já conta no pote do mês em que foi feita; a fatura só lembra o que sai da conta
    const title =
        view.kind === 'atual'
            ? `Fatura de ${monthName(view.month)}, acumulando`
            : view.kind === 'futuro'
              ? `Previsão da fatura de ${monthName(view.month)}`
              : `Fatura de ${monthName(view.month)}`;
    return (
        <div className="panel">
            <div className="panel-head">
                <h2>Cartão de crédito</h2>
                <span className="small muted">
                    limite de {fmt(L)}
                    {c.bank_limit_cents ? ` · banco ${fmt(c.bank_limit_cents)}` : ''}
                </span>
            </div>
            {c.previous_invoice_cents ? (
                <div className="card-due">
                    <div className="card-due-row">
                        <span>
                            Fatura de {prev}, paga em {monthName(view.month)}
                        </span>
                        <strong className="num">{fmt(c.previous_invoice_cents)}</strong>
                    </div>
                    <span className="small muted">
                        Sai da conta, não dos potes: essas compras já contaram em {prev}.
                    </span>
                </div>
            ) : null}
            <div className="card-face">
                <div className="card-top">
                    <span className="small" style={{ color: 'var(--fg-2)' }}>
                        {title}{' '}
                        <span className="muted">
                            ({n} {n === 1 ? 'item' : 'itens'})
                        </span>
                    </span>
                    <span className={`chip ${chip}`}>{label}</span>
                </div>
                <div className="card-big">{fmt(c.invoice_cents)}</div>
                <div className="small muted">
                    {view.kind === 'passado' ? 'Paga' : 'Cobra'} em {next}. Essas compras contam nos potes de{' '}
                    {monthName(view.month)}.
                </div>
                <div className="limit-meter" role="img" aria-label={`Fatura ${fmt(c.invoice_cents)} de ${fmt(L)}`}>
                    <span className="reg" style={{ width: `${w}%` }} />
                </div>
                <div className="small" style={{ color: 'var(--fg-2)' }}>
                    {c.remaining_cents >= 0 ? (
                        <>
                            Ainda restam <strong className="num">{fmt(c.remaining_cents)}</strong> para gastos dentro do
                            limite
                        </>
                    ) : (
                        <>
                            Passou <strong className="num">{fmt(-c.remaining_cents)}</strong> do seu limite
                        </>
                    )}
                </div>
                {c.committed_cents > c.invoice_cents && (
                    <div className="small muted">
                        Com as próximas parcelas, o cartão tem <span className="num">{fmt(c.committed_cents)}</span>{' '}
                        comprometidos.
                    </div>
                )}
            </div>
            {n ? (
                <details className="invoice" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
                    <summary>
                        <span>
                            Ver itens da fatura <span className="muted">({n})</span>
                        </span>
                        <span className="num">{fmt(c.invoice_cents)}</span>
                    </summary>
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th>Parcela</th>
                                    <th className="r">Valor</th>
                                </tr>
                            </thead>
                            <tbody>
                                {c.items.map((it) => (
                                    <tr key={`${it.source}-${it.id}`}>
                                        <td>{it.description}</td>
                                        <td className="installment">
                                            {it.source === 'recurring'
                                                ? 'fixo'
                                                : it.installments && it.installments > 1
                                                  ? `${it.installment}/${it.installments}`
                                                  : 'à vista'}
                                        </td>
                                        <td className="r num">{fmt(it.amount_cents)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </details>
            ) : (
                <div className="small muted">Nada registrado nesta fatura.</div>
            )}
        </div>
    );
}

function Forecast({ view }: { view: MonthView }) {
    const first = view.forecast[0];
    return (
        <div className="panel">
            <div className="panel-head">
                <h2>Previsão</h2>
                <div className="legend-row">
                    <span>
                        <i />
                        Cartão
                    </span>
                    <span>
                        <i className="deb" />
                        Débito
                    </span>
                </div>
            </div>
            {first && (
                <p className="headline">
                    Em {monthName(first.month)} já estão comprometidos{' '}
                    <strong className="num">{fmt(first.total_cents)}</strong>
                    {first.pct_of_income != null ? `, ${first.pct_of_income}% da renda` : ''}.
                </p>
            )}
            <div className="table-wrap">
                <table className="forecast">
                    <thead>
                        <tr>
                            <th>Mês</th>
                            <th className="hide-sm">
                                <span className="sr-only">Barra</span>
                            </th>
                            <th className="r hide-sm">Cartão</th>
                            <th className="r hide-sm">Débito</th>
                            <th className="r">Total</th>
                            <th className="r">Sobra</th>
                        </tr>
                    </thead>
                    <tbody>
                        {view.forecast.map((f) => {
                            const k = Math.max(f.income_cents, f.total_cents, 1);
                            const cw = (f.cartao_cents / k) * 100;
                            const bar = (
                                <div
                                    className="ftrack"
                                    role="img"
                                    aria-label={`${fmt(f.total_cents)} de ${fmt(f.income_cents)}`}
                                >
                                    <span className="c" style={{ left: 0, width: `${cw}%` }} />
                                    <span
                                        className="d"
                                        style={{ left: `${cw}%`, width: `${(f.debito_cents / k) * 100}%` }}
                                    />
                                </div>
                            );
                            return (
                                <tr key={f.month}>
                                    <td>
                                        {monthShort(f.month)}
                                        <div className="show-sm" style={{ marginTop: 6, display: 'block' }}>
                                            {bar}
                                        </div>
                                    </td>
                                    <td className="fbar hide-sm">{bar}</td>
                                    <td className="r num hide-sm">{fmt(f.cartao_cents)}</td>
                                    <td className="r num hide-sm">{fmt(f.debito_cents)}</td>
                                    <td className="r num">{fmt(f.total_cents)}</td>
                                    <td className={`r num ${f.free_cents < 0 ? 'neg' : ''}`}>{fmt(f.free_cents)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
                A barra cheia é a renda do mês. Conta parcelas e fixos já registrados.
            </p>
        </div>
    );
}

function Installments({ view }: { view: MonthView }) {
    const list = view.installments_in_progress;
    return (
        <div className="panel">
            <div className="panel-head">
                <h2>Parcelas em andamento</h2>
                <span className="small muted">
                    {list.length} {list.length === 1 ? 'compra' : 'compras'}
                </span>
            </div>
            {list.length ? (
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Compra</th>
                                <th className="hide-sm">Parcela</th>
                                <th className="r" style={{ whiteSpace: 'normal' }}>
                                    Parcela de {monthShort(view.month).slice(0, 3)}
                                </th>
                                <th className="r hide-sm">Próximas faturas</th>
                                <th className="r hide-sm">Última parcela</th>
                            </tr>
                        </thead>
                        <tbody>
                            {list.map((x) => (
                                <tr key={x.entry_id}>
                                    <td>
                                        {x.description} {x.is_last && <span className="chip ok">última</span>}
                                        <div className="dots" aria-hidden="true">
                                            {Array.from({ length: x.installments }, (_, i) => (
                                                <span
                                                    key={i}
                                                    className={
                                                        i + 1 < x.installment
                                                            ? 'paid'
                                                            : i + 1 === x.installment
                                                              ? 'now'
                                                              : ''
                                                    }
                                                />
                                            ))}
                                        </div>
                                        <div className="small muted show-sm" style={{ whiteSpace: 'nowrap' }}>
                                            {x.installment}/{x.installments} · última em {monthShort(x.last_month)}
                                        </div>
                                    </td>
                                    <td className="installment hide-sm">
                                        {x.installment}/{x.installments}
                                    </td>
                                    <td className="r num">{fmt(x.amount_cents)}</td>
                                    <td className="r num hide-sm">{fmt(x.remaining_cents)}</td>
                                    <td className="r hide-sm">{monthShort(x.last_month)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="empty">Nenhuma compra parcelada neste mês.</div>
            )}
        </div>
    );
}
