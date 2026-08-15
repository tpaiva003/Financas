# Rachar, Contas à Moda do Porto

App web (PWA) para registar e dividir despesas entre as pessoas de um agregado, e
para acompanhar o património. Substitui o Tricount/Splitwise e cresceu para lá
disso.

> Ponto de situação em [`RETOMAR.md`](./RETOMAR.md) — **é o primeiro ficheiro a
> ler**. Decisões, com o contexto todo, em [`DECISOES.md`](./DECISOES.md). O
> [`REQUISITOS.md`](./REQUISITOS.md) é a especificação original e descreve uma
> app de dois utilizadores que já não é esta; vale como história.

## O que faz

- **Despesas**: entrada rápida, importação de extratos (Excel, CSV, PDF do
  cartão Universo) com deteção de colunas e formatos aprendidos, classificação
  por regras, recorrentes, metas.
- **Saldo** "quem deve a quem", sempre **explicável** até cada despesa e acerto.
  Acrescentar alguém a um ambiente não reescreve o histórico: escolhe-se se
  divide tudo, a partir de uma data, ou só dali para a frente.
- **Ambientes** (multi-inquilino) com participantes, convites e dois papéis:
  `full`, que participa no saldo, e `submitter`, que só submete despesas para
  aprovação.
- **Património**: bens, investimentos, movimentos de corretora, cotações
  automáticas, câmbio, dívidas com amortização, rendimentos, comparação com
  índices e calculadora FIRE.
- **Relatórios** e exportação CSV.
- **PWA** instalável (Android/iOS), responsiva.
- **Landing pública** em [rachar.pt](https://rachar.pt), com capturas de ecrã
  geradas a partir da própria app (`npm run shots`).

## Stack

Next.js 14 (App Router) · React 18 · TypeScript · Tailwind · Auth.js (NextAuth v5)
· Supabase (Postgres + Storage) · Vitest · Zod.

Entra-se com **email e palavra-chave**. Os fornecedores Google e Microsoft estão
configurados no Auth.js mas ainda **não têm botão na interface**.

## Arranque rápido (modo mock, sem Supabase)

A app arranca navegável de ponta a ponta com dados de exemplo, sem Supabase.

```bash
npm install
cp .env.example .env.local
npm run dev                     # http://localhost:3000
```

No `.env.local`, para desenvolvimento local:

```ini
AUTH_SECRET="<gera com: openssl rand -base64 32>"
AUTH_URL="http://localhost:3000"   # senão os redirecionamentos vão para produção
ALLOWED_EMAILS="tiago@example.com,clara@example.com"
APP_DATA_MODE="mock"               # repositório em memória, com seed
```

Entra com um dos emails do `ALLOWED_EMAILS` e a palavra-chave **`demo1234`**,
que vem já definida nos dados de exemplo.

> A primeira entrada **já não** define a palavra-chave: fazia-o enquanto a app
> era de duas pessoas conhecidas, e com contas convidadas passou a ser uma
> janela para quem soubesse o email ficar com a conta alheia. Passa pelo mesmo
> caminho da reposição, que prova que a pessoa recebe o email daquele endereço.
> Em modo mock isso deixaria ninguém entrar, por isso as contas de exemplo
> trazem a palavra-chave já definida (só nesse modo).

> **O `AUTH_URL` local não é um detalhe.** Com um URL `https`, o Auth.js marca
> os cookies de sessão como `Secure` e o browser recusa-os em
> `http://localhost`. O login falha **sem dar erro**: volta à página de login
> como se a palavra-chave estivesse errada.

Os dados de exemplo cobrem a app toda (despesas de um ano, património,
investimentos com movimentos datados, cotações e rendimentos), para nenhum ecrã
abrir vazio.

## Configurar Supabase (produção)

1. **Supabase**: cria um projeto. Em *Project Settings → API* copia o URL, a
   `anon key` e a `service_role key` para o `.env.local`.
2. Aplica **todas** as migrações de `supabase/migrations/`, por ordem — são 23,
   e as despesas dependem de tabelas criadas na `0003`. Com o **Supabase CLI**:
   `supabase db push`.
3. Define `APP_DATA_MODE="supabase"` e `AUTH_URL` com o domínio real.
4. Define `CRON_SECRET` — sem ele a rota de cron responde 503 e as cotações não
   se atualizam sozinhas.
5. (Opcional) Semear dados de exemplo:
   ```bash
   npm run seed
   ```

Para SSO, preenche `AUTH_GOOGLE_*` / `AUTH_MICROSOFT_ENTRA_ID_*` — mas nota que
falta a interface, por isso as credenciais sozinhas não chegam.

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
    (app)/              # área autenticada
    login/  recuperar/  privacidade/  termos/   # públicas, com a landing em /
    api/                # auth, cron, export, fx, recibos
    error.tsx  global-error.tsx  not-found.tsx  # ecrãs de falha
  components/           # componentes de UI
    landing/            # só da página pública (molduras, revelação ao scroll)
  lib/
    domain/             # ⭐ lógica pura + testes (saldo, divisão, dedup, posições, câmbio)
    import/             # leitura de ficheiros e deteção de colunas (+ testes)
    data/               # interface Repository + Mock + Supabase + seed
    services/           # serviços que juntam dados e domínio
    public-routes.ts    # o que se alcança sem sessão (com testes)
supabase/migrations/    # modelo de dados, por ordem
scripts/
  seed.ts               # seed do Supabase
  shots.mjs             # capturas da landing, tiradas da app a correr
public/landing/         # essas capturas, em WebP (clara e escura de cada cena)
```

## Invariantes (nunca violar)

- Deduplicação por **UID estável**: a mesma transação nunca entra duas vezes —
  e duas transações diferentes nunca viram uma.
- Entradas manuais **nunca** são reclassificadas automaticamente.
- "**Quem pagou**" é independente de "**como se divide**".
- O **saldo** é sempre **explicável**, e mexer nos membros não reescreve o
  passado.
- **Sem taxa de câmbio não se grava preço nenhum.**
- A IA escolhe **colunas**, nunca lê valores.
- **Um limite nunca apaga nada:** impede de criar mais, o que lá está fica.
- Uma página pública **verifica-se sem sessão**, não se assume: quem testa está
  quase sempre autenticado, e foi assim que as páginas legais e a recuperação de
  palavra-chave passaram tempo a redirecionar para o login sem ninguém notar.

## Privacidade e segurança

Fora as páginas públicas (landing, login, recuperação e páginas legais), nada é
acessível sem sessão. Recibos em armazenamento privado, servidos por URL
assinado. Sem indexação (`X-Robots-Tag: noindex`).

**O RLS não é a fronteira entre ambientes.** Toda a app fala com o Supabase pela
chave de serviço, que o ignora; as políticas existem mas nenhuma olha para o
`space_id`. O isolamento é o `space_id` que o código passa a cada consulta — uma
consulta por `id` sem filtrar o ambiente é uma falha de segurança. Ver
`src/lib/data/isolation.test.ts`.

As capturas de ecrã da landing são **dados de exemplo do modo mock**, com
participantes chamados André e Maria: são imagens numa página pública e não
levam lá dados de ninguém.
