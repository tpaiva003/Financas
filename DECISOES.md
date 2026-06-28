# Decisões

Registo das decisões autónomas (de baixo risco) tomadas durante o
desenvolvimento, conforme `CLAUDE.md`. Decisões que afetam o modelo de dados de
forma significativa ficam assinaladas para confirmação.

## Fase 1 — Fundação do MVP (esta entrega)

### Stack e versões
- **Next.js 14.2 (App Router) + React 18.3 + TypeScript + Tailwind 3.4.** Optou-se
  pela combinação estável e bem conhecida em vez do bleeding-edge (Next 15 / React 19
  / Tailwind 4) para garantir builds previsíveis. A stack pedida (Next/TS/Tailwind/PWA,
  Auth.js, Supabase) mantém-se.
- **Auth.js / NextAuth v5 (beta)** — é a forma padrão de integrar SSO no App Router.
- **Vitest** para testes da lógica de domínio (rápido, bom suporte TS).
- **Zod** para validação de input nas Server Actions.

### Estrutura
- Lógica de domínio pura e isolada em `src/lib/domain/` (sem dependências de
  framework), testada exaustivamente. É o coração do produto e o local onde os
  invariantes são garantidos.
- Camada de dados atrás de uma interface `Repository` (`src/lib/data/`) com duas
  implementações: `MockRepository` (em memória, com seed) e `SupabaseRepository`.

### Modelo monetário (assinalado — afeta dados)
- **Todos os valores em cêntimos inteiros** (`amount_cents`, `bigint`). Evita erros
  de vírgula flutuante e torna o saldo exatamente reconciliável. Valores negativos
  são válidos (reembolsos/estornos, REQ-SPL-4).

### Divisão e saldo
- A divisão é guardada como `jsonb` (`{ type, weights }`), suportando EQUAL,
  PERCENT, FIXED e SHARES. A distribuição de cêntimos usa o **método do maior
  resto**, garantindo que a soma das parcelas é exatamente o total (inclusive com
  valores negativos).
- O saldo só conta despesas **partilhadas + confirmadas + não eliminadas**.
  Pendentes (recorrentes variáveis por confirmar) e pessoais não entram.
- O saldo é **explicável**: `computeBalance` devolve as contribuições por
  despesa/acerto (página `/saldo`).

### UID de deduplicação (assinalado — fonte de verdade)
- A especificação diz que o UID estável vem da lógica **Python existente**. Essa
  lógica **não está neste repositório**. Implementou-se uma referência em TS
  (`normalize.ts`, FNV-1a 64-bit sobre campos normalizados) usada para entradas
  manuais e testes.
- **A confirmar:** quando os parsers Python forem integrados (Fase 2), o algoritmo
  de normalização/UID tem de ser **idêntico** dos dois lados, ou o UID passa a ser
  produzido só pelo Python e o TS apenas o consome. Não reescrever os parsers.

### Autenticação e allow-list
- Allow-list via `ALLOWED_EMAILS`. O `signIn` callback recusa qualquer email fora
  da lista, mesmo com SSO válido (REQ-AUTH-2).
- Ids de utilizador do domínio são **fixos** (`tiago`, `clara`) e são a fonte de
  verdade usada no domínio e na BD (`app_users.id`, `expenses.payer_id`, …). Os
  **emails** vêm do `ALLOWED_EMAILS` por ordem (1.º = Tiago, 2.º = Clara), por isso
  trocar os emails reais não parte a ligação às linhas existentes. (Antes os ids
  eram derivados do email por slug — mudou-se ao ligar os emails reais.)
- **Login de desenvolvimento** (`AUTH_DEV_LOGIN=true`): provider de credenciais que
  permite entrar como um dos emails da allow-list **sem SSO real**, para a app ser
  navegável localmente sem configurar OAuth. **NUNCA ligar em produção.**

### Privacidade e RLS (assinalado — segurança)
- No MVP, o acesso a dados é **server-side** com a *service-role key* e as regras de
  privacidade das despesas pessoais são aplicadas na **camada de aplicação** (o
  repositório filtra por `owner_id`/`visible_to_partner`).
- As **políticas RLS** estão definidas na migração como **defesa em profundidade** e
  ficam prontas para quando houver acesso direto do cliente via Supabase Auth (a
  função `current_app_user_id()` mapeia o email do JWT para o `app_user`).
- **A confirmar:** estratégia final de integração NextAuth ↔ Supabase Auth (mintar
  um JWT compatível para usar RLS a partir do cliente) quando se avançar para
  realtime/offline.

### PWA
- Manifest + service worker próprios (sem dependência `next-pwa`, para builds
  limpos). SW com network-first para navegação e cache para ativos.
- **Pendente:** ícones em **PNG** (192/512) e `apple-touch-icon`. Por agora usam-se
  ícones **SVG** (suportados no Chrome/Android); para iOS convém gerar PNGs.

## Âmbito desta entrega vs. REQUISITOS §10

Entregue (fundação do MVP): autenticação SSO + allow-list, entrada manual rápida,
saldo e acertos, lista com filtros/pesquisa, classificação por regras (motor +
testes), divisão 50/50 e %, PWA instalável, schema + RLS, seed e testes.

Ainda por fazer no MVP (próximos passos): import de ficheiros Tier 1 (Excel
Activo/Bankinter) com pré-visualização e dedup ligados à UI; editor visual de
regras; anexar recibos; ligar o `SupabaseRepository` a um projeto real
(precisa de credenciais). Fases 2/3 conforme o REQUISITOS.md.

## Pós-MVP — design, landing e auth interim

### Design
- Redesenho para tema **escuro editorial premium**: tipografia *Space Grotesk*
  (títulos) + *JetBrains Mono* (números) + *Inter* (corpo); hairlines, muito
  espaço, micro-animações. Tokens em `tailwind.config.ts` + `globals.css`.
- **Sem travessões (—)** no texto visível (decisão de estilo do produto).

### Login por palavra-chave (interim)
- Enquanto o SSO real não está ligado, há um provider de credenciais
  **`password`**: na 1.ª entrada de cada utilizador, a palavra-chave escrita
  fica definida (hash **PBKDF2** via Web Crypto, em `password.ts`), e nas
  seguintes é validada. Substitui o "Modo de desenvolvimento" quando este for
  desligado (`AUTH_DEV_LOGIN`).
- Config de auth **dividida**: `auth.config.ts` (edge-safe, usada pelo
  middleware) e `auth.ts` (Node, com os providers que tocam DB/crypto). Evita
  partir o bundling do middleware.

### Landing pública (REQ-LAND)
- `/` passou a ser a **landing pública** (a app vive sob auth). A landing **não
  refere nomes pessoais**.
- Inclui: problema, **vantagens vs alternativas**, como funciona,
  **desenvolvimentos futuros** e **formulário de contacto** (RGPD + honeypot).
- O **admin é o Tiago** (1.º email da allow-list): as mensagens de contacto
  caem numa tabela `contact_messages` e aparecem no inbox `/mensagens`, visível
  só ao admin.
