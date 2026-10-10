# Pots

Divida sua renda em potes, controle o limite do cartão e saiba em que parcela está cada compra.

O Pots é um site estático: não tem servidor, banco na nuvem nem login. Tudo fica salvo no navegador de quem usa (IndexedDB), como o Excalidraw. Para levar os dados para outro aparelho, ou guardar uma cópia, baixe o backup em **Configurar → Seus dados**.

## Como funciona

- **Mês atual**: o único que dá para editar.
- **Meses passados**: cada mês guarda o próprio plano (renda, potes, limites do cartão), os fixos e as compras. Na virada, o mês fecha e não muda mais; o mês novo nasce com uma cópia do plano e dos fixos.
- **Meses futuros**: previsão somente leitura, com o plano do mês atual, os fixos e as parcelas já registrados. Nada é guardado.
- **Cartão**: sem dia de fechamento ou vencimento. A compra cai na fatura do mês em que foi feita; parcelas seguem mês a mês. Uma compra antiga lançada agora só conta as parcelas a partir do mês atual.
- **Pagamento**: Cartão ou Débito (débito cobre pix, dinheiro e débito). Só cartão parcela.
- **Potes**: de *gasto* (o valor é um teto; avisa a partir de 85%) ou de *meta* (o valor é um objetivo).
- **Fixos**: editar ou excluir vale "só este mês" ou "deste mês em diante".
- **Compras de meses fechados**: não se editam. Excluir uma delas para as parcelas a partir do mês atual; os meses fechados ficam como estavam.
- **Horário**: sempre o de Brasília, que define quando o dia e o mês viram.

## Dados e backup

O navegador guarda o mesmo formato do backup: um registro por mês (`months`) e um com o que vale para todos os meses (`global`).

```
{
  "format": "pots", "schema": 2, "exported_at": "...",
  "global": { "fixed": [ ...modelo dos fixos para os próximos meses ] },
  "months": [
    {
      "month": "2026-10", "closed_at": null,
      "plan": { "incomes": [...], "pots": [...], "card": { "personal_limit_cents", "bank_limit_cents" } },
      "fixed": [ ...fixos como valeram no mês ],
      "entries": [ ...compras lançadas no mês ],
      "stopped_entries": [ ...compras de meses anteriores cujas parcelas pararam neste mês ]
    }
  ]
}
```

- Guarda só o que foi digitado; os totais são recalculados na tela, inclusive dos meses fechados.
- No mês aberto, apagar tira o item de vez: explorar o app não deixa rastro.
- IDs são UUID gerados no aparelho. Dinheiro em centavos inteiros (`*_cents`); meses no formato `YYYY-MM`.

O backup sai como está no momento, com o mês aberto. Importar um backup substitui tudo o que está no navegador.

## Estrutura

```
apps/web         app React + Vite (PWA), banco do navegador com Dexie
packages/core    cálculos do mês, parcelas, previsão e virada dos meses (sem dependência de tela)
packages/shared  tipos, validação (Zod) e utilitários de mês e dinheiro
```

As telas só mostram o que o `core` calcula. As regras de gravação (mês atual, data não futura, pote do plano, escopo dos fixos, parcelas paradas) ficam em `apps/web/src/db/store.ts`.

## Rodando

Precisa de Node 22 e pnpm 10.

```sh
pnpm install
pnpm dev         # http://localhost:5173
pnpm test        # Vitest em todos os pacotes
pnpm typecheck
pnpm build       # gera apps/web/dist
```

## Publicação

O workflow `.github/workflows/pages.yml` publica no GitHub Pages a cada push na `main`. Na primeira vez, ative em **Settings → Pages → Build and deployment → Source: GitHub Actions**.
