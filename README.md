# Pots

Divida sua renda em potes, controle o limite do cartão e saiba em que parcela está cada compra.

O Pots é um site estático: não tem servidor, banco na nuvem nem login. Tudo fica salvo no navegador de quem usa (IndexedDB), como o Excalidraw. Para levar os dados para outro aparelho, ou guardar uma cópia, baixe o backup em **Planejamento → Seus dados**.

## Como funciona

- **Mês atual**: o único que dá para editar.
- **Meses passados**: quando o app abre depois da virada do mês, ele tira uma foto de cada mês que fechou. A foto não muda mais, mesmo que você mexa nos potes ou nos fixos depois.
- **Meses futuros**: previsão somente leitura, com os fixos e as parcelas já registrados.
- **Cartão**: sem dia de fechamento ou vencimento. A compra cai na fatura do mês em que foi feita; parcelas seguem mês a mês. Uma compra antiga lançada agora só conta as parcelas a partir do mês atual.
- **Pagamento**: Cartão ou Débito (débito cobre pix, dinheiro e débito). Só cartão parcela.
- **Potes**: de *gasto* (o valor é um teto; avisa a partir do percentual configurado) ou de *meta* (o valor é um objetivo).
- **Fixos**: editar ou excluir vale "só este mês" ou "deste mês em diante".
- Nada configurável fica no código: limite pessoal, limite do banco, percentual de aviso e fuso horário ficam nas preferências.

## Dados e backup

O banco do navegador tem uma tabela por entidade, com os mesmos campos de um banco SQL: `settings`, `incomes`, `pots`, `entries`, `recurring` e `month_snapshots`.

- IDs são UUID gerados no aparelho.
- Toda linha tem `created_at`, `updated_at` e `deleted_at` (excluir só marca `deleted_at`).
- Dinheiro em centavos inteiros (`*_cents`); meses no formato `YYYY-MM`.

O backup é um JSON com `format: "pots"`, `schema: 1` e uma lista por tabela. Cada item é uma linha pronta para virar um `INSERT` se um dia o Pots ganhar um banco de verdade. Importar um backup substitui tudo o que está no navegador.

## Estrutura

```
apps/web         app React + Vite (PWA), banco do navegador com Dexie
packages/core    cálculos do mês, parcelas, previsão e fotos dos meses (sem dependência de tela)
packages/shared  tipos, validação (Zod) e utilitários de mês e dinheiro
```

As telas só mostram o que o `core` calcula. As regras de gravação (mês atual, data não futura, pote ativo, escopo dos fixos) ficam em `apps/web/src/db/store.ts`.

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
