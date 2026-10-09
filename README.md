# Pots

Controle financeiro pessoal: divida a renda em potes, controle o limite pessoal do cartão e saiba em que parcela está cada compra.

Monorepo TypeScript (pnpm workspaces):

| pasta | o que é |
|---|---|
| `apps/api` | API em Node + Hono, login com Google (Better Auth), SQLite + Drizzle |
| `apps/api/src/core` | todos os cálculos (parcelas, potes, cartão, previsão), funções puras com testes |
| `packages/shared` | tipos da API, schemas zod das entradas e utilitários de mês e dinheiro, para o front reaproveitar |
| `deploy/` | proxy Caddy compartilhado da VPS e Litestream |

O front (React + Vite) entra em `apps/web` num próximo passo. Ele só apresenta: o backend entrega o mês pronto.

## Regras do domínio

- **Dinheiro em centavos inteiros** (`*_cents`): `150000` = R$ 1.500,00.
- **Só o mês atual aceita mudanças.** Toda gravação vale do mês atual em diante.
  - **Passado:** congelado. Na primeira requisição depois da virada, antes de qualquer gravação, o backend calcula o mês que fechou e guarda o resultado em `month_snapshots`. Depois disso o mês é lido só da foto.
  - **Futuro:** previsão calculada com os valores de hoje, somente leitura.
- **O banco guarda só o que a pessoa digita, e só o valor atual.** Parcelas, totais, uso dos potes, fatura e previsão são calculados.
- **Cartão sem fechamento nem vencimento:** a compra cai na fatura do próprio mês. A parcela 1 é no mês da compra.
- **Pagamento:** `cartao` ou `debito` (débito cobre pix e dinheiro). Só cartão parcela.
- **Compra com data passada:**
  - parcelada: a data só define em que parcela está (cadastrar algo que já está na 4/10). Parcelas de meses fechados ficam de fora.
  - à vista: se a data é de um mês fechado, ela cai no mês atual (compra esquecida), sem mexer no mês fechado.
  - data futura é recusada.
- **Fixos** valem todo mês. Editar ou excluir "só este mês" grava um ajuste (`override`) do mês atual; "deste mês em diante" altera ou apaga o fixo.
- **Potes** são `gasto` (o valor é um teto: aviso a partir de `warn_pct`, estourou acima) ou `meta` (o valor é um objetivo: pendente ou cumprida). Remover um pote arquiva.
- **Nada configurável fica no código:** limites do cartão, faixa de aviso e fuso horário ficam em `user_settings`.

## API

Tudo em `/api`, autenticado pelo cookie de sessão do Better Auth (exceto `/api/health` e `/api/auth/*`). Erros vêm como `{ "error": { "code", "message" } }`.

| método | rota | |
|---|---|---|
| GET, POST | `/api/auth/*` | login com Google (`POST /api/auth/sign-in/social` com `{ "provider": "google" }`), sessão e `POST /api/auth/sign-out` |
| GET | `/api/me` | usuário, configurações e mês atual |
| GET, PATCH | `/api/settings` | limite pessoal, limite do banco, `warn_pct`, `timezone` |
| GET | `/api/mes/:YYYY-MM` | o mês pronto: linhas, totais, potes, cartão, parcelas em andamento e previsão de 6 meses (`MonthView` em `packages/shared`) |
| GET, POST, PATCH, DELETE | `/api/incomes[/:id]` | renda |
| GET, POST, PATCH, DELETE | `/api/pots[/:id]` | potes (`?archived=1` inclui arquivados; DELETE arquiva) |
| GET, POST, PATCH, DELETE | `/api/entries[/:id]` | compras |
| GET, POST | `/api/recurring` | fixos |
| PATCH | `/api/recurring/:id` | `{ "scope": "mes", "amount_cents" \| "skip" }` ou `{ "scope": "em_diante", ...campos }` |
| DELETE | `/api/recurring/:id?scope=mes\|em_diante` | pular só este mês ou apagar |
| POST | `/api/previa/compra` | prévia do formulário ("10x de R$ 300,00, até jul/27") |
| POST | `/api/previa/planejamento` | "falta distribuir" (renda − potes) |

## Rodando localmente

Requer Node 22 e pnpm (`corepack enable`).

```sh
pnpm install
cp .env.example .env   # preencha APP_URL=http://localhost:3000, o segredo e o OAuth do Google
pnpm dev               # API em http://localhost:3000
pnpm test              # testes do core e da API
pnpm typecheck
```

Mudou `apps/api/src/db/schema.ts`? Gere a migração com `pnpm db:generate`. As migrações rodam sozinhas quando a API sobe.

## Login com Google

1. No [Google Cloud Console](https://console.cloud.google.com), crie um projeto e configure a tela de consentimento (escopos de e-mail e perfil).
2. Em Credenciais, crie um **ID do cliente OAuth** do tipo "Aplicativo da Web".
   - Origem autorizada: `https://SEU_DOMINIO`
   - URI de redirecionamento: `https://SEU_DOMINIO/api/auth/callback/google` (e `http://localhost:3000/api/auth/callback/google` para desenvolvimento)
3. Coloque o Client ID e o Secret no `.env`.

## Deploy na VPS

A VPS tem **um Caddy só** (`deploy/proxy`), que cuida do HTTPS de todos os apps e manda cada subdomínio para o backend certo pela rede Docker `web`. Cada app sobe só os próprios containers.

Uma vez por VPS:
1. Aponte `*.seudominio` (ou cada subdomínio) para a VPS e instale o Docker.
2. `docker network create web`
3. Em `deploy/proxy`: `BASE_DOMAIN=seudominio.com.br docker compose up -d`

O Pots:
1. Copie `.env.example` para `.env` e preencha tudo, inclusive o bucket do backup.
2. `docker compose up -d --build`

O Compose do Pots sobe:
- `restore`: na primeira subida, recupera o banco do backup se o arquivo ainda não existir;
- `pots-api`: a API, com o SQLite no volume `data`, ligada à rede `web`;
- `litestream`: copia o SQLite continuamente para o bucket S3 (Cloudflare R2, Backblaze B2...).

Para outro app, coloque o backend dele na rede `web` e adicione um bloco no `deploy/proxy/Caddyfile`.

Para recuperar numa VPS nova, basta repetir os passos: o `restore` traz o banco de volta antes da API subir.
