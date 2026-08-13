# Rachar, Contas à Moda do Porto

App web privada (PWA) que começou por dividir as despesas do agregado e hoje
trata do dinheiro nos dois sentidos: o do dia a dia e o de longo prazo. Substitui
o Tricount/Splitwise **e** a folha de cálculo do património. Atrás de
autenticação, com a landing como única parte pública.

> Especificação completa em [`REQUISITOS.md`](./REQUISITOS.md). Decisões de
> desenvolvimento em [`DECISOES.md`](./DECISOES.md). **Estado verificado e
> trabalho em falta em [`RETOMAR.md`](./RETOMAR.md), que é o primeiro ficheiro a
> abrir numa sessão nova.**

## Estado

Em produção, a servir. O que já funciona:

**Contas partilhadas**
- ➕ Entrada manual rápida, e divisão a meias, por percentagem, valor fixo ou quotas.
- ⚖️ Saldo "quem deve a quem", sempre **explicável** até cada despesa e acerto.
- 🤝 Acertos com histórico; 📋 lista com filtros e pesquisa; 🧾 recibos anexados.
- 🔁 Recorrentes, incluindo as de valor variável (confirma-se antes de entrar no saldo).
- ✅ Aprovações, para quem só submete despesas.

**Trazer os dados de fora**
- 📥 Importação de Excel e CSV do banco, PDF do cartão Universo e ficheiros de corretora.
- 🧠 Deteção de colunas por cabeçalho, com um modelo a ajudar nos formatos novos
  (**escolhe colunas, nunca lê valores**).
- 🚫 Deduplicação por UID estável: a mesma transação nunca entra duas vezes.
- ⏰ Lembretes de importação por banco.

**Perceber para onde vai**
- 🏷️ Classificação por regras, categorias próprias e metas mensais.
- 📊 Relatórios por categoria, por comerciante e por mês, com média móvel e
  período homólogo comparado de forma justa a meio do mês.
- 💶 Rendimentos (ativo e passivo) e taxa de poupança.

**Património e investimentos**
- 🏦 Contas, depósitos, imóveis e dívidas; património líquido numa conta só.
- 🏠 Crédito à habitação com data do último pagamento e juros até lá.
- 📈 Posições calculadas a partir de movimentos datados, com custo médio ponderado,
  cotações automáticas, TIR e TWR, e comparação honesta com um ETF em euros.
- 🔥 Calculadora FIRE e 🧮 avaliação de empresas por fluxos de caixa descontados.

**A plataforma**
- 🏘️ Vários **ambientes** por conta, com convites, papéis e isolamento entre inquilinos.
- 📱 PWA instalável (Android/iOS), tema de dia e de noite.
- 🗄️ Schema Supabase (Postgres) com **RLS**.
- 🌐 Landing pública em [rachar.pt](https://rachar.pt), com capturas geradas a
  partir da própria app (`npm run shots`).
- ✅ **461 testes** à lógica crítica (dedup, saldo, divisão, classificação,
  rentabilidade, câmbio, amortização, FIRE, avaliação, limites, isolamento).

O que falta está em [`RETOMAR.md`](./RETOMAR.md).

## Stack

Next.js 14 (App Router) · React 18 · TypeScript · Tailwind · Auth.js (NextAuth v5)
· Supabase (Postgres + RLS) · Vitest · Zod.

## Arranque rápido (modo mock, sem Supabase)

A app arranca navegável de ponta a ponta com dados de exemplo, sem precisar de
configurar Supabase nem OAuth.

```bash
npm install
cp .env.example .env.local      # já vem pronto para modo mock
npm run dev                     # http://localhost:3000
```

Entra com um dos emails da allow-list (`tiago@example.com` ou
`clara@example.com`) e a palavra-chave que quiseres: na primeira entrada de cada
conta, a que escreveres fica a ser a dela. Variáveis relevantes no `.env.local`:

```ini
AUTH_SECRET="<gera com: openssl rand -base64 32>"
ALLOWED_EMAILS="tiago@example.com,clara@example.com"
APP_DATA_MODE="mock"              # repositório em memória, já semeado
AUTH_URL="http://localhost:3000"  # TEM de ser o URL local, ver abaixo
```

> **O `AUTH_URL` local não é um detalhe.** Com um URL `https`, o Auth.js marca os
> cookies de sessão como `Secure` e o browser recusa-os em `http://localhost`. O
> login falha **sem dar erro**: volta à página de login como se a palavra-chave
> estivesse errada.

Os dados de exemplo cobrem a app toda (despesas de um ano, património,
investimentos com movimentos datados, cotações e rendimentos), para nenhum ecrã
abrir vazio.

## Configurar SSO real + Supabase (produção)

1. **Supabase**: cria um projeto. Em *Project Settings → API* copia o URL, a
   `anon key` e a `service_role key` para o `.env.local`.
2. Aplica o schema e o seed de referência:
   - SQL Editor → cola `supabase/migrations/0001_init.sql` e corre.
   - SQL Editor → cola `supabase/seed.sql` (atualiza os emails para os reais).
   - Ou, com o **Supabase CLI**: `supabase db push`.
3. **OAuth**: cria credenciais Google e/ou Microsoft Entra ID e preenche
   `AUTH_GOOGLE_*` / `AUTH_MICROSOFT_ENTRA_ID_*` no `.env.local`.
4. Define `ALLOWED_EMAILS` com os emails reais, `APP_DATA_MODE="supabase"`, e
   `AUTH_URL`/`NEXT_PUBLIC_SITE_URL` com o domínio de produção.
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
npm run shots       # refazer as capturas da landing (ver o cabeçalho do script)
```

As capturas da landing são a app a correr em modo mock. Sempre que um desses
ecrãs mudar de aspeto, vale a pena voltar a correr o `npm run shots`: uma
landing com capturas de uma versão que já não existe promete o que não entrega.

## Estrutura

```
src/
  app/                  # rotas (App Router)
    (app)/              # área autenticada: saldo, movimentos, análise, património
    page.tsx            # landing pública (rachar.pt)
    login/ privacidade/ termos/ recuperar/   # o resto do que abre sem sessão
    api/auth/           # rotas do Auth.js
  components/           # componentes de UI
    landing/            # só da página pública (molduras, revelação ao scroll)
  lib/
    domain/             # ⭐ lógica de domínio pura + testes (dedup, saldo, divisão, classificação)
    data/               # interface Repository + Mock + Supabase + seed
    auth.ts             # configuração Auth.js + allow-list
    services/           # serviços (ex.: saldo do agregado)
supabase/
  migrations/0001_init.sql   # modelo de dados + RLS
  seed.sql                   # dados de referência
scripts/
  seed.ts                    # seed do Supabase
  shots.mjs                  # capturas da landing, tiradas da app a correr
public/landing/              # essas capturas, em WebP
```

## Invariantes (nunca violar)

- Deduplicação por **UID estável**: a mesma transação nunca entra duas vezes.
- Entradas manuais **nunca** são reclassificadas automaticamente.
- "**Quem pagou**" é independente de "**como se divide**".
- O **saldo** é sempre **explicável** até às despesas que o compõem.
- **Sem taxa de câmbio não se grava preço nenhum.**
- **Um limite nunca apaga nada:** impede de criar mais, o que lá está fica.
- Nada dos dados de ninguém é acessível sem sessão. Sem sessão abrem só a
  landing, o login, a privacidade, os termos e a reposição de palavra-chave, e
  nenhuma dessas páginas mostra dados de quem quer que seja.

## Privacidade

Os dados de um ambiente são acessíveis só a quem lá está, atrás de autenticação,
com RLS na base de dados e isolamento entre inquilinos verificado em testes. Uma
pessoa não consegue sequer descobrir que existem outras contas com que não
partilhe um ambiente. Recibos e ficheiros em armazenamento privado, por URL
assinado de curta duração.

As capturas de ecrã da landing são **dados de exemplo do modo mock**, nunca
dados reais: são imagens numa página pública. Ver `DECISOES.md` para a estratégia
de RLS e `RETOMAR.md` para o texto de RGPD que ainda falta escrever na
`/privacidade`.
