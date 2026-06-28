# Finanças — App de Despesas Partilhadas (Tiago & Clara)

App web privada (PWA) para registar e dividir despesas do agregado e manter o
saldo entre dois utilizadores. Substitui o Tricount/Splitwise. Acesso restrito a
dois emails (allow-list), atrás de autenticação SSO.

> Especificação completa em [`REQUISITOS.md`](./REQUISITOS.md). Decisões de
> desenvolvimento em [`DECISOES.md`](./DECISOES.md).

## Estado

**Fase 1 — fundação do MVP.** Inclui:

- 🔐 Autenticação Auth.js (Google + Microsoft) com **allow-list de 2 emails**.
- ➕ **Entrada manual rápida** de despesas (botão a um toque, 50/50 ou %).
- ⚖️ **Saldo** "quem deve a quem", sempre **explicável** até cada despesa/acerto.
- 🤝 **Acertos** com histórico.
- 📋 **Lista** de despesas com filtros e pesquisa.
- 🏷️ **Motor de classificação** por regras (partilhada/pessoal + categoria).
- 📱 **PWA** instalável (Android/iOS), responsiva.
- 🗄️ **Schema Supabase** (Postgres) com **RLS** e modelo de dados completo.
- ✅ **41 testes** à lógica crítica (dedup, saldo, divisão, classificação).

O que falta para fechar o MVP e as fases seguintes está em `DECISOES.md` e
`REQUISITOS.md §10`.

## Stack

Next.js 14 (App Router) · React 18 · TypeScript · Tailwind · Auth.js (NextAuth v5)
· Supabase (Postgres + RLS) · Vitest · Zod.

## Arranque rápido (modo mock — sem Supabase)

A app arranca navegável de ponta a ponta com dados de exemplo, sem precisar de
configurar Supabase nem OAuth.

```bash
npm install
cp .env.example .env.local      # já vem pronto para modo mock + dev login
npm run dev                     # http://localhost:3000
```

Na página de login, usa **"Modo de desenvolvimento"** para entrar como Tiago ou
Clara (sem SSO real). Variáveis relevantes no `.env.local`:

```ini
AUTH_SECRET="<gera com: openssl rand -base64 32>"
ALLOWED_EMAILS="tiago@example.com,clara@example.com"
AUTH_DEV_LOGIN="true"     # entra sem SSO (apenas dev!)
APP_DATA_MODE="mock"      # repositório em memória, com seed
```

## Configurar SSO real + Supabase (produção)

1. **Supabase**: cria um projeto. Em *Project Settings → API* copia o URL, a
   `anon key` e a `service_role key` para o `.env.local`.
2. Aplica o schema e o seed de referência:
   - SQL Editor → cola `supabase/migrations/0001_init.sql` e corre.
   - SQL Editor → cola `supabase/seed.sql` (atualiza os emails para os reais).
   - Ou, com o **Supabase CLI**: `supabase db push`.
3. **OAuth**: cria credenciais Google e/ou Microsoft Entra ID e preenche
   `AUTH_GOOGLE_*` / `AUTH_MICROSOFT_ENTRA_ID_*` no `.env.local`.
4. Define `ALLOWED_EMAILS` com os dois emails reais, `APP_DATA_MODE="supabase"`
   e **remove** `AUTH_DEV_LOGIN`.
5. (Opcional) Semear dados de exemplo no Supabase:
   ```bash
   npm run seed
   ```

## Scripts

```bash
npm run dev         # servidor de desenvolvimento
npm run build       # build de produção
npm run start       # arrancar o build
npm run lint        # ESLint
npm run typecheck   # TypeScript (tsc --noEmit)
npm test            # testes (Vitest)
npm run seed        # semear o Supabase (requer credenciais)
```

## Estrutura

```
src/
  app/                  # rotas (App Router)
    (app)/              # área autenticada: dashboard, despesas, acertos, saldo
    login/              # landing de login (única página "pública")
    api/auth/           # rotas do Auth.js
  components/           # componentes de UI
  lib/
    domain/             # ⭐ lógica de domínio pura + testes (dedup, saldo, divisão, classificação)
    data/               # interface Repository + Mock + Supabase + seed
    auth.ts             # configuração Auth.js + allow-list
    services/           # serviços (ex.: saldo do agregado)
supabase/
  migrations/0001_init.sql   # modelo de dados + RLS
  seed.sql                   # dados de referência
scripts/seed.ts              # seed do Supabase
```

## Invariantes (nunca violar)

- Deduplicação por **UID estável**: a mesma transação nunca entra duas vezes.
- Entradas manuais **nunca** são reclassificadas automaticamente.
- "**Quem pagou**" é independente de "**como se divide**".
- O **saldo** é sempre **explicável** até às despesas que o compõem.
- Nada acessível sem sessão; só os 2 emails autorizados entram.

## Privacidade

Dados acessíveis só aos dois utilizadores, atrás de SSO + allow-list. Sem
indexação pública (`X-Robots-Tag: noindex`). Recibos/ficheiros em armazenamento
privado. Ver `DECISOES.md` para a estratégia de RLS.
