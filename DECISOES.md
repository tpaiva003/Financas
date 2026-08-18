# Decisões

Registo das decisões autónomas (de baixo risco) tomadas durante o
desenvolvimento, conforme `CLAUDE.md`. Decisões que afetam o modelo de dados de
forma significativa ficam assinaladas para confirmação.

## Fase 1, Fundação do MVP (esta entrega)

### Stack e versões
- **Next.js 14.2 (App Router) + React 18.3 + TypeScript + Tailwind 3.4.** Optou-se
  pela combinação estável e bem conhecida em vez do bleeding-edge (Next 15 / React 19
  / Tailwind 4) para garantir builds previsíveis. A stack pedida (Next/TS/Tailwind/PWA,
  Auth.js, Supabase) mantém-se.
- **Auth.js / NextAuth v5 (beta)**, é a forma padrão de integrar SSO no App Router.
- **Vitest** para testes da lógica de domínio (rápido, bom suporte TS).
- **Zod** para validação de input nas Server Actions.

### Estrutura
- Lógica de domínio pura e isolada em `src/lib/domain/` (sem dependências de
  framework), testada exaustivamente. É o coração do produto e o local onde os
  invariantes são garantidos.
- Camada de dados atrás de uma interface `Repository` (`src/lib/data/`) com duas
  implementações: `MockRepository` (em memória, com seed) e `SupabaseRepository`.

### Modelo monetário (assinalado, afeta dados)
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

### UID de deduplicação (assinalado, fonte de verdade)
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
  eram derivados do email por slug, mudou-se ao ligar os emails reais.)
- **Login de desenvolvimento** (`AUTH_DEV_LOGIN=true`): provider de credenciais que
  permite entrar como um dos emails da allow-list **sem SSO real**, para a app ser
  navegável localmente sem configurar OAuth. **NUNCA ligar em produção.**

### Privacidade e RLS (assinalado, segurança)
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

## Pós-MVP, design, landing e auth interim

### Design
- Redesenho para tema **escuro editorial premium**: tipografia *Space Grotesk*
  (títulos) + *JetBrains Mono* (números) + *Inter* (corpo); hairlines, muito
  espaço, micro-animações. Tokens em `tailwind.config.ts` + `globals.css`.
  > **Atualizado em 13/08:** os *hairlines* deixaram de ser o que separa blocos.
  > O contorno passou para a sombra e as divisórias estáticas foram removidas,
  > na landing e na app. O que fica desta linha é o resto: as três fontes, o
  > muito espaço, as micro-animações, e **os tokens viverem no `globals.css`**.
  > Ver "O ecrã de quem visita não é o ecrã de quem desenha" e as entradas de
  > 12 e 13/08.
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

## Fase 3, Backlog de melhorias (12 itens)

### Divisão "só de um(a)" (#6)
- Representada como `PERCENT` com 100% para o dono e 0% para os restantes.
  Reutiliza o motor de divisão existente sem novo tipo de split. "Quem pagou"
  continua independente de "de quem é" (o pagador pode ser outro). A edição
  deteta este caso (PERCENT 100/0) e pré-seleciona "Só de um(a)".

### Relatórios mês vs mês + média móvel (#2, #3)
- Lógica pura e testada em `src/lib/domain/reports.ts` (`buildMonthComparison`),
  com 9 testes. O "mês atual" é o **mês mais recente com dados** (não o mês
  civil), para o relatório ser útil fora do mês corrente. Média móvel = média
  dos últimos 3 meses **com dados**.

### Mensagens, admin (#9, #10, #11)
- Migração 0004: `archived_at` e `notes` em `contact_messages`.
- Arquivar (separador Ativas | Arquivadas), badge de não lidas no topo (nav
  desktop + atalho mobile, só admin) e notas internas por mensagem.
- `countUnreadContactMessages` é tolerante caso a coluna ainda não exista.

### Categorias por ambiente (#12), assinalado (afeta dados)
- Migração 0005: `space_id text` (FK `spaces`, `on delete cascade`) em
  `categories`. `space_id NULL` = categoria **padrão** (em todos os ambientes);
  não editável. Cada ambiente acrescenta as suas (ex.: Casamento, Férias).
- `listCategories(spaceId)` devolve padrão + as do ambiente. Apagar uma
  categoria deixa as despesas sem categoria (FK `set null`).

### Editar/eliminar participantes (#7)
- `updateMember` / `deleteMember` (só no próprio ambiente). Eliminar é
  bloqueado quando o participante tem conta associada, é o único, ou tem
  despesas/acertos (FK sem cascade), preserva a explicabilidade do saldo.

### Fecho de período: pagar/transitar + colapsar (#1, #4), assinalado (afeta dados)
- Migração 0006: `settled_at` em `expenses`. É **apenas um marcador de UI**: o
  cálculo do saldo continua a considerar todas as despesas confirmadas, pelo que
  o saldo permanece explicável. Reversível (`reopenExpenses`).
- "Pagar e fechar" cria o(s) acerto(s) sugerido(s) e marca as despesas como
  liquidadas; "Transitar" fecha sem pagar (o saldo segue para o mês seguinte).
  As liquidadas ficam recolhidas na lista de despesas.

### Acerto entre ambientes (#8)
- Move o saldo de um ambiente de 2 pessoas para outro com os **mesmos
  participantes** (mapeados por `linked_user_id`): zera aqui (acerto interno +
  colapso) e recria a dívida no destino como despesa "Saldo transferido de X"
  (paga pelo credor, 100% do devedor). Tudo continua explicável.

### Despesas recorrentes (#20, REQ-REC)
- Migração 0007: tabela `recurring_templates` (por ambiente) + coluna
  `recurring_id` em `expenses` com índice único `(recurring_id, transaction_date)`
  para idempotência. A tabela original (0001), vazia e sem uso, foi recriada.
- Lógica pura e testada em `src/lib/domain/recurring.ts` (`nextOccurrence`,
  `enumerateDue`), frequência semanal/mensal/anual, com clamp do dia ao último
  do mês. 10 testes.
- **Geração preguiçosa** (`recurring-service.ts`): como não há cron, as
  ocorrências em atraso são materializadas ao abrir o Dashboard ou os
  Recorrentes. Idempotente (verifica ocorrência + índice único) e tolerante a
  falhas (try/catch, nunca bloqueia a app).
- **Valor fixo** → despesa `confirmed` (entra logo no saldo). **Valor variável**
  → despesa `pending`; só entra no saldo depois de confirmar o valor real
  (REQ-REC-2). `computeBalance` já ignora `pending`, por isso o saldo mantém-se
  correto e explicável.
- Página `/recorrentes`: "por confirmar", lista de templates (pausar, retomar,
  saltar, terminar, eliminar, REQ-REC-4) e formulário de criação.
- **Import de extratos** fica pendente até o utilizador partilhar exemplos de
  export dos bancos (Activo/Bankinter) para mapear colunas.

## Fase 4, UX + role de submissão

### Melhorias de UX (lote de 11)
- Filtro de despesas **ao vivo** (sem botão), lista **agrupada por data**,
  removida a contagem/total do topo, **favicon**, **localização EU** (aceita
  vírgula decimal nos valores), **sugestão de descrição** e **categoria
  pesquisável** (datalist), e no Saldo as **datas da última despesa registada e
  paga** pelo próprio. A divisão por percentagem mostra também o **valor (€)** de
  cada parte.

### Role de submissão com aprovação (#9), assinalado (afeta dados/auth)
- Migração 0008: `members.role` ('full' | 'submitter') e, em `expenses`,
  `approval_status` ('pending'|'rejected'|null), `approver_id`, `submitted_by`.
- **Allow-list passa a vir também da BD**: além dos 2 utilizadores base (env),
  o login por palavra-chave aceita utilizadores de `app_users` criados quando o
  admin dá acesso a um participante. Os utilizadores base resolvem-se sempre
  primeiro, por isso o login do Tiago/Clara não muda.
- Um **submitter** é um participante **não-pleno**: não entra no saldo. Ao criar
  uma despesa escolhe pagador/divisão **entre os membros plenos** e um
  **aprovador**; a despesa fica `pending` e só entra no saldo após aprovação
  (`countsTowardsBalance` exclui pending/rejected, saldo continua explicável).
- `getSpaceContext` expõe `fullMembers` e `viewerRole`. As páginas financeiras
  usam `fullMembers`. Os submitters são redirecionados para /despesas e as ações
  sensíveis (acertos, recorrentes, categorias, membros, edição) recusam-nos.
- Gestão em **Ambiente**: dar/revogar acesso de submissão por email; fila de
  **/aprovacoes** (aprovar/rejeitar) com aviso no Saldo e badge na navegação.

### Notificações push (#10)
- Adiadas a pedido do utilizador (precisam de chaves VAPID e, em iOS, da PWA
  instalada). Ficam como trabalho futuro.

## Fase 5, Importação de extratos (REQ-IMP)

- **Parser em TypeScript**, não Python: o repositório nunca teve a lógica Python
  (ficou do lado do utilizador), por isso foi reimplementada em TS. O UID
  estável (`stableUid`) mantém-se como fonte de verdade do dedup.
- **Deteção de colunas genérica** (`src/lib/import/columns.ts`, puro e testado):
  encontra a linha de cabeçalho, identifica data/descrição/valor (ou
  débito/crédito) e converte para transações normalizadas. Suporta cabeçalhos PT
  e EN. Testado com os cabeçalhos reais dos extratos do utilizador.
  - Cada coluna tem **um só papel, por prioridade**: sem isto, "Data Valor" era
    apanhada como coluna de valor (contém "valor") e o import falhava por
    completo. O **saldo/balance é excluído explicitamente** de candidato a valor.
  - Convenção: **gasto positivo, entrada negativa**. Extratos com sinal (gastos
    negativos) são invertidos; colunas débito/crédito são normalizadas.
- **Excel**: `xlsx@0.18.5` (a última publicada no npm). As folhas são lidas em
  **modo de arrays** (`header: 1`), o que evita a via de prototype pollution
  conhecida nessa versão; só os utilizadores autenticados carregam ficheiros.
  Recomendado atualizar para 0.20.x a partir do CDN da SheetJS quando possível.
- **Proteção contra sobreposição (crítico):** os dados já na app são "live". A
  pré-visualização calcula a data da despesa mais recente e propõe importar só a
  partir do dia seguinte; linhas em período já coberto, duplicados por UID e
  linhas que parecem uma despesa manual existente vêm **desligadas por omissão**.
- **Lotes reversíveis** (migração 0009): cada importação fica registada e pode
  ser anulada. Se a migração ainda não estiver aplicada, a importação **continua
  a funcionar** (dedup intacto), perdendo-se apenas o "anular lote".
- **PDF (Universo, Wizink) fica para a fase seguinte**, Tier 2, precisa de
  extração de texto de PDF.

### Extratos em PDF, cartão Universo (Tier 2)
- `pdf-parse` extrai o texto; o parsing das linhas fica em
  `src/lib/import/pdf-universo.ts`, **puro e testado** (7 testes com linhas
  reais). O PDF é convertido numa grelha [data, descrição, valor], reaproveitando
  todo o pipeline dos ficheiros Excel/CSV (dedup, classificação, sobreposição).
- As linhas do extrato **não têm ano**: é deduzido do período do extrato
  ("Movimentos de: 15/06/2026 a 15/07/2026"), tratando a viragem de ano.
- O espaço entre a data e a descrição é **opcional**: há extratos com
  "16/0616/06 Compra …" e outros com "15/0516/05Compra …". Os dois formatos
  aparecem em extratos reais do mesmo banco e ambos são suportados.
- Importa-se `pdf-parse/lib/pdf-parse.js` (módulo interno) porque o index do
  pacote tem um bloco de debug que tenta ler um ficheiro de teste quando
  empacotado. `pdf-parse` e `xlsx` ficam em `serverComponentsExternalPackages`.
- **Cartão de crédito e dupla contagem:** o extrato do cartão traz o pagamento
  do cartão como entrada e o extrato do banco traz o débito direto como saída;
  importando ambos, anulam-se e ficam só as compras. Explicado na UI.

### Import em períodos já registados: pessoal vs partilhada
- Caso real: as contas partilhadas de um período já estão acertadas, mas falta o
  histórico pessoal. O import passa a permitir **incluir esse período marcando
  as despesas como pessoais**, entram na análise do próprio e **não mexem no
  saldo** (`countsTowardsBalance` exige `kind === "shared"`).
- Aviso **em tempo real** quando a seleção inclui linhas de período já coberto,
  a distinguir o risco: partilhadas alteram o saldo desse período (destaque a
  vermelho); pessoais não (aviso neutro).
- Atalho "Incluir período já registado como despesas só minhas" e ações em massa
  para marcar as selecionadas como pessoais/partilhadas.

### Tabela `import_batches` legada (0001)
Tal como aconteceu com `recurring_templates` em 0007, já existia uma
`import_batches` do schema original: sem `space_id` e com `id` uuid, o que era
incompatível com os ids `imp_…` da app (e fazia o `create table if not exists`
ser um no-op, com o índice a falhar em `space_id`). Estava **vazia e sem
referências** (0 linhas, 0 despesas associadas), por isso foi recriada limpa,
incluindo a coluna `expenses.import_batch_id`, que passou de uuid para text.

### Ambiente de destino na importação
- O import deixou de usar silenciosamente o ambiente **ativo**: passa a haver um
  **seletor de ambiente de destino** no passo 1. Isto importa porque o dedup, o
  guard de sobreposição, as categorias e os participantes são **todos por
  ambiente**, daí a escolha ter de ser feita ANTES da pré-visualização.
- `getTargetSpace(ctx, spaceId)` resolve o ambiente pedido, garantindo que o
  utilizador pertence a ele (e recusa submitters). A pré-visualização transporta
  `spaceId`, `spaceName`, categorias e participantes DESSE ambiente, e o destino
  é mostrado no passo 2 e na confirmação.
- **Dividir um extrato por vários ambientes:** importa-se o mesmo ficheiro uma
  vez por ambiente, escolhendo as linhas de cada um; o dedup por UID marca as já
  importadas como "já existe". Um seletor de ambiente por linha ficaria confuso
  (cada ambiente tem categorias, pagador e divisão próprios) e não foi feito.
- O histórico de importações passa a mostrar os lotes de **todos** os ambientes
  do utilizador, com etiqueta do ambiente, e o "Anular lote" valida o ambiente
  do próprio lote.

### Futuro (pedido do utilizador)
- Visão **agregadora** de vários ambientes no ambiente pessoal.

### Ambiente por linha na importação
Substitui a decisão anterior (um ambiente por importação), a pedido do
utilizador: um extrato pessoal contém despesas de Casa E pessoais, e obrigar a
importar o mesmo ficheiro várias vezes era trabalho a mais.

- Cada linha tem o seu **ambiente de destino**; o do passo 1 é só o valor por
  omissão. Há também uma ação em massa ("Mover selecionadas").
- A pré-visualização traz o estado de **todos** os ambientes do utilizador
  (`ImportSpaceInfo`): categorias, participantes, data da última despesa e os
  UIDs já existentes. Enviamos só a **interseção** dos UIDs com o ficheiro, por
  isso o payload não cresce com o histórico.
- Duplicados e "período já registado" passam a ser avaliados **face ao ambiente
  atual de cada linha**, e recalculados quando se muda o ambiente. Mudar de
  ambiente **repõe a categoria**, porque as categorias são por ambiente.
- Na gravação, as linhas são **agrupadas por ambiente** e cada um recebe o seu
  lote reversível.
- **Pagador:** é uma pessoa, não um id. Fora do ambiente por omissão,
  reencontra-se o participante ligado ao mesmo `linkedUserId`.
- **Divisão:** as percentagens são definidas para participantes concretos e não
  se transferem entre ambientes; linhas enviadas para outro ambiente ficam em
  partes iguais. Documentado no tipo do payload.

## Fase 6, Usabilidade do import e gestão de contas

- **Legibilidade dos dropdowns:** as `option` são desenhadas pelo sistema e, mesmo
  com `color-scheme: dark`, saíam cinzentas e ilegíveis. Passam a ter as cores da
  app (`globals.css`). Corrige todas as listas da app, não só o import.
- **Aplicar categoria a semelhantes:** `similarityKey` (puro, 7 testes) reduz a
  descrição ao comerciante, ignorando o tipo de operação ("Compra", "DD", "Trf"),
  números e referências. Ao classificar uma linha, a app **propõe** aplicar às
  semelhantes, nunca o faz sozinha (invariante REQ-CLF-3).
- **Vários extratos de uma vez:** o import aceita múltiplos ficheiros. Ficheiros
  não reconhecidos são reportados sem bloquear os restantes, e movimentos
  repetidos entre ficheiros que se sobrepõem são marcados "repetida nos
  ficheiros" e ficam desligados.
- **Saldo respeita o fecho de período:** o Dashboard mostrava as despesas mesmo
  depois de fechadas, o que anulava o propósito do fecho (reduzir ruído). Agora
  as liquidadas saem de "Despesas recentes" e é indicado que estão recolhidas.
- **Renomear ambientes** (`renameSpace`).
- **Associar conta a um participante** (`linkMemberAccountAction`): é o que
  identifica a MESMA pessoa em ambientes diferentes e desbloqueia a
  transferência de saldo entre ambientes. Antes, a única forma de ligar uma
  conta era "Dar acesso", que tornava a pessoa um *submitter*, não servia para
  participantes plenos. Impede associar a mesma conta a dois participantes.

## Fase 7, Relatórios, ruído e ordem dos ambientes

- **Relatórios com período** (3/6/12 meses ou tudo, por omissão 12): sem isto os
  totais misturavam anos e não diziam nada. Passam a excluir despesas pendentes
  de aprovação, que ainda não são despesas para efeitos de análise.
- **"A tua parte"**: quota do utilizador nas partilhadas (via `computeShares`)
  mais as pessoais dele. É o primeiro passo da visão pessoal pedida.
- **Partilhadas vs pessoais** e **"Onde gastas mais"** (top comerciantes),
  reaproveitando o `similarityKey` do import para agrupar o mesmo comerciante.
- **Despesas liquidadas fora de vista:** já acertadas, só faziam ruído. Passam a
  estar escondidas por omissão, com um link discreto "N liquidada(s) · mostrar"
  (`?liquidadas=1`) em vez de um bloco sempre presente.
- **Ordem dos ambientes** (migração 0010, `spaces.position`): setas ↑/↓ em
  Ambiente. Escolhidas setas em vez de arrastar por funcionarem bem no telemóvel
  e por teclado. A leitura tolera a coluna não existir (fallback para a ordem de
  criação), e a ação falha em silêncio se a migração não estiver aplicada.

## Fase 8, Comparações nos relatórios e contas independentes

### Relatórios
- **Modo de comparação** (`BaselineMode`): mês anterior, **média dos meses
  anteriores** ou **homólogo** (mesmo mês do ano passado). As categorias passam
  a comparar contra a referência escolhida, não só contra o mês anterior.
- A média **exclui o mês atual**, comparar um mês consigo próprio dilui o
  desvio e engana.
- A comparação usa **todo o histórico**, mesmo quando os totais mostrados são só
  do período escolhido: sem isso o homólogo nunca teria dados.
- **Gráfico mensal** em SVG puro (sem dependências), com a linha da referência,
  limitado aos últimos 12 meses para continuar legível no telemóvel.
- 6 testes novos para os modos de comparação.

### Privacidade, corrigido um problema sério
`getSpaceContext` tinha um fallback: quem não tivesse ambientes caía no "casa".
Combinado com `viewerMemberId = members[0].id`, um utilizador novo aterrava nas
contas de outra pessoa **e** era tratado como o primeiro participante desse
ambiente. Agora quem entra sem ambientes recebe um ambiente "Pessoal" próprio, e
não há fallback para outro participante.

### Convidar alguém para experimentar
- `inviteUserAction` (só admin) cria uma **conta independente**: não fica ligada
  a nenhum ambiente do anfitrião. Os ambientes do convidado não aparecem na app
  do anfitrião nem o contrário, o isolamento é por participação em ambientes.
- O convite está em Mensagens, incluindo um botão por mensagem de contacto que
  pré-preenche nome e email de quem pediu para experimentar.
- **Limite honesto:** isto é isolamento ao nível da aplicação. Quem administra o
  projeto Supabase continua a poder ler a base de dados; para garantias mais
  fortes seria preciso outro projeto/instância por cliente.

## Bancos novos: mapeamento manual + templates partilhados (sem IA)

**Decisão:** a app aprende bancos novos com o utilizador a apontar as colunas,
não com análise automática do documento.

Quando não reconhecemos um ficheiro, em vez de erro mostramos as primeiras 12
linhas com as colunas numeradas e perguntamos onde estão a data, a descrição e o
valor (ou débito/crédito). O utilizador confirma na pré-visualização que os
dados saíram certos e só então guardamos o **template**: uma impressão digital
dos nomes das colunas (hash FNV-1a) + o mapeamento. O ficheiro seguinte com a
mesma estrutura é reconhecido automaticamente, para qualquer utilizador.

**Porquê sem IA:** o problema não é de compreensão de linguagem, é estrutural —
"qual das colunas é a data". Quem tem o extrato à frente responde em 10 segundos
e com 100% de fiabilidade; um modelo custaria dinheiro por ficheiro, exigiria
enviar dados bancários para fora e continuaria a precisar de confirmação humana.
O template guardado tem prioridade sobre a deteção automática, precisamente
porque foi validado por uma pessoa.

**Privacidade:** o template guarda só nomes de colunas e índices. Nunca
movimentos, montantes ou saldos. O mesmo vale para o "reportar banco em falta":
segue o nome do banco e o texto do cabeçalho que o utilizador vê no ecrã e pode
apagar antes de enviar.

## Lembretes de importação

Por ambiente e banco, com periodicidade semanal/mensal/trimestral. O estado sai
de `domain/import-reminders.ts` (puro, testado) a partir da data do último lote:
atrasado / está na hora / em dia / por importar. Cada lote passa a guardar a
`last_transaction_date`, o que dá a resposta a "desde que dia devo importar?" —
o dia seguinte à última transação já registada, que é a mesma regra que protege
contra sobreposição.

## Médias por categoria e metas nos relatórios

Média mensal por categoria e por comerciante, comparada com o mês em análise
("média do supermercado 340 €, este mês 200 €"). Duas decisões que mudam os
números:

1. **O mês em análise nunca entra na sua própria média.** Está quase sempre a
   meio e puxaria a referência para baixo, escondendo justamente o excesso.
2. **A média divide pelos meses da janela, não pelos meses em que aquela
   categoria teve movimento.** Senão uma compra esporádica (uma vez em seis
   meses) aparecia como se fosse um hábito mensal.

A janela é ajustável no relatório (3, 6 ou 12 meses).

**Metas:** tecto mensal por categoria, ou do ambiente inteiro, editável no
próprio relatório (apagar o valor remove a meta). Estado: abaixo, perto (≥80%)
ou acima. Ficam em `spending_goals`, com o total a usar `category_id` nulo e um
índice único sobre `coalesce(category_id, '__total__')`, em Postgres dois NULL
são distintos e sem isto podiam nascer várias metas totais.

## Barras de período com média e homólogo (substitui o foco nas metas)

O relatório por categoria passa a mostrar uma barra do gasto do período com duas
marcas: a **média** dos últimos N meses (tracejado) e o **período homólogo**
(traço cheio). A comparação principal é contra o homólogo.

**Cortar o homólogo no mesmo dia.** A 5 de agosto, comparar com agosto inteiro do
ano passado não diz nada. O homólogo é cortado no dia em que o mês corrente vai
("5 € a 5/8/2026 contra 50 € a 5/8/2025"), e a média continua a mostrar o mês
inteiro, para se ver onde o mês costuma ir dar. Meses passados contam inteiros.

**Escala partilhada por todo o painel** (o total tem a sua): as barras também se
comparam entre si. Com uma escala por linha, cada linha ficava cheia e o painel
não dizia nada.

As **metas** ficam: são úteis, mas eram a leitura errada em primeiro plano.
Passam a ser um extra recolhido em cada linha, e a barra de progresso só aparece
quando existe meta.

## Tema de dia e de noite

As cores passaram de hex fixo no Tailwind para variáveis CSS em canais RGB
(`rgb(var(--c-fg) / <alpha-value>)`), o que mantém os modificadores de opacidade
(`bg-panel/80`, `border-fg/30`) a funcionar. O tema de dia usa papel quente, não
branco clínico, e escurece o verde e o vermelho, os originais não tinham
contraste suficiente sobre fundo claro.

A escolha fica no browser (localStorage), não na conta: é uma preferência do
aparelho, a mesma pessoa pode querer noite no telemóvel e dia no portátil. Um
script inline no `<head>` aplica-a antes de pintar, para não haver flash.

## "Última que pagaste" vs "Último registo teu"

Eram ambíguos. "Pagaste" filtra por pagador, inclui despesas registadas pela
outra pessoa em que tu és o pagador. "Registaste" filtra por quem meteu os dados
e passa a mostrar o **dia do registo**, não a data da despesa: é essa a pergunta
("quando é que atualizei isto pela última vez"). Ambos os cartões explicam agora
o que contam.

## Seed com histórico

Passou de um mês para 14 (jul/2025 a ago/2026, com o último mês a meio, como um
mês a decorrer). Sem histórico não há média nem homólogo e metade dos relatórios
fica vazia. Os valores variam de forma determinística, nada aleatório, para as
capturas e os testes darem sempre o mesmo.

## Multi-inquilino: o ambiente é a unidade de isolamento

Uma pessoa vê um ambiente se, e só se, existir um participante desse ambiente
ligado à conta dela. Daí sai tudo, despesas, saldos, categorias, lembretes,
metas. As regras estão em `domain/tenancy.ts`, puras e testadas.

**Fuga fechada:** `listKnownAccounts()` devolvia TODAS as contas da plataforma e
era mostrada no ecrã de participantes a qualquer utilizador, um cliente externo
via o nome e o email do dono e de quem mais usasse a app. Passa a devolver só
contas com que se partilha pelo menos um ambiente. Numa app multi-inquilino
ninguém pode sequer descobrir que as outras contas existem.

**O dono não entra nos ambientes dos clientes.** Ao convidar alguém, cria-se a
conta E o ambiente dela, com um único participante: a própria. O dono administra
a plataforma, não participa nas contas de quem a usa. Há testes que fixam isto.

**Consola do dono (`/plataforma`), só para o admin.** Mostra contagens e datas —
contas, ambientes, despesas, ambientes ativos nos últimos 30 dias, e os formatos
de banco aprendidos. Nunca descrições, valores ou saldos.

Vale a pena ser claro sobre o limite: como a app fala com o Postgres pela
service-role, quem tem as chaves do projeto consegue tecnicamente ler os dados.
O que a decisão garante é que **o produto não expõe isso**, não há ecrã que
mostre as despesas de um cliente, o dono não aparece dentro do ambiente dele, e
a consola foi desenhada para gerir, não para espreitar. Uma garantia mais forte
exigiria cifra do lado do cliente, com o custo de perder classificação, dedup e
relatórios do lado do servidor.

## Menu: quatro secções, e o topo não cresce

O menu tinha nove entradas e ganhava mais uma por cada funcionalidade nova. Não
escala: mais funcionalidades não podem significar mais escolhas à frente de quem
entra. Passa a haver quatro secções, por intenção:

- **Saldo**, quanto devo ou me devem agora
- **Despesas**, registar e trazer (lista, importar, recorrentes)
- **Análise**, olhar para trás (resumo, categorias, evolução)
- **Património**, o que tenho e para onde vou

O que é ocasional (acertos, ambiente) ou administrativo (mensagens, consola) foi
para um menu "Mais". As páginas de cada secção aparecem por dentro dela, numa
segunda linha, e a barra do telemóvel usa as mesmas quatro secções, para o mapa
mental ser um só. Há um teste que falha se voltarem a pendurar-se páginas no
topo.

Os relatórios eram um rolo interminável. Passam a três vistas, cada uma a
responder a uma pergunta: como estou, em que gasto, como evoluiu.

## Comerciantes: marcas conhecidas antes de adivinhar

O agrupamento por comerciante usava as duas primeiras palavras da descrição, o
que falha no caso mais comum: "CONTINENTE MODELO MATOSINHOS" e "CONT BOM DIA
PORTO" são o mesmo sítio e contavam separados.

A ordem passa a ser: **apelido confirmado pelo utilizador**, depois **marca
conhecida** (lista de cadeias portuguesas com as suas variantes), e só depois as
primeiras palavras. Quanto mais humano o sinal, mais peso tem.

Para o que sobra, `suggestMerges` propõe juntas prováveis (prefixo, quase igual,
primeira palavra específica) que o utilizador confirma. **Nunca junta sozinha**:
um agrupamento errado estraga relatórios de forma difícil de detetar, por isso o
custo de perguntar é muito menor do que o de adivinhar mal. A confirmação vira
apelido e vale daí em diante.

A IA fica como último recurso, depois destes três passos, para o que nenhum
apanhar.

## Domínio rachar.pt

`metadataBase` passa a apontar para o domínio, para os URLs partilhados ficarem
absolutos. O domínio real vive em `NEXT_PUBLIC_SITE_URL` e `AUTH_URL`, para o
ambiente local continuar a funcionar sem tocar em código.

## Quem pode entrar: a regra estava presa ao mundo antigo

A verificação do SSO só olhava para a lista de emails nas variáveis de ambiente,
herança de quando a app era para duas pessoas. Depois de passar a ter contas na
base de dados, isso deixou de bater certo: quem fosse convidado entrava por
palavra-chave mas era **barrado no SSO**, sem explicação. Ninguém tinha dado por
isso porque o SSO ainda não estava ligado.

A regra passa a estar em `domain/access.ts`, pura e testada: palavra-chave passa
(já validada antes), SSO passa se o email estiver nas variáveis, se já houver
conta, ou se o registo aberto estiver ligado.

O **registo aberto está desligado por omissão** e exige
`AUTH_OPEN_REGISTRATION=true`. Abrir o registo é uma decisão de produto, com
custos e obrigações, e não pode acontecer por descuido de configuração. Com ele
ligado, a primeira entrada por SSO cria a conta e o ambiente próprio.

A decisão mudou de sítio: estava em `auth.config.ts`, que corre no edge e não
tem acesso a dados, e passou para `auth.ts`, que corre em Node, que é onde o
início de sessão acontece.

## Páginas de privacidade e termos

Públicas, porque a Google as exige acessíveis sem sessão para aprovar o ecrã de
consentimento, e porque quem está a decidir se cria conta deve poder lê-las
antes. Escritas a partir do que a app faz, não de um modelo: se o comportamento
mudar, estas páginas mudam com ele.

## Rendimento, e porque a secção passou a chamar-se Movimentos

Faltava metade da história: a app sabia para onde o dinheiro ia mas não de onde
vinha. Sem isso não há taxa de poupança, que é o indicador que diz se se está a
ir a algum lado.

Duas decisões que mudam os números:

- **O valor pedido é o líquido recebido**, não o bruto. É o que se pode gastar,
  e é sobre isso que a taxa de poupança faz sentido.
- **A média de vários meses pesa pelo dinheiro, não pelos meses.** É o total
  poupado a dividir pelo total recebido. A média das percentagens daria o mesmo
  peso a um mês de 500 € e a um de 5000 €, e um mês fraco com boa percentagem
  mascararia um mês forte com má.

Separa-se rendimento **ativo** (salário, trabalhos paralelos), que para se a
pessoa parar de trabalhar, de **passivo** (juros, dividendos, rendas), que não
para. A percentagem de despesas já coberta por rendimento passivo é o mesmo
indicador do FIRE, mas com dinheiro que entrou mesmo em vez de uma projeção.

**A secção "Despesas" passou a "Movimentos".** Desde que há rendimentos, trata
do dinheiro nos dois sentidos, e o nome antigo escondia metade. Foi a alternativa
a criar uma quinta secção no topo, que era exatamente o que se tinha combinado
não fazer.

## Email: convite e recuperação de palavra-chave

Até aqui, convidar alguém não avisava ninguém: criava-se a conta e a pessoa não
sabia. O convite passa a enviar email, e a mensagem de resultado **diz se o
email saiu mesmo**, com o motivo quando falha, em vez de fingir sucesso.

O envio fala com a API do Resend por HTTP, sem SDK: é um pedido só. E **nunca
deita a app abaixo**: se a chave faltar ou o envio falhar, regista-se e segue-se.
Um convite que não chega é chato; uma app que rebenta a meio de criar uma conta
é pior.

**Recuperação de palavra-chave.** Guarda-se o hash do token, nunca o token: quem
ler a tabela não entra em conta nenhuma. Validade de uma hora, uso único, e a
marcação de usado acontece antes de devolver o utilizador, para dois pedidos
simultâneos não valerem os dois.

O formulário responde **sempre a mesma coisa**, exista a conta ou não. Dizer
"esse email não está registado" transformava-o numa forma de descobrir quem usa
a app, o que numa app de finanças partilhadas não é inofensivo.

Os emails usam a identidade da marca, em HTML de tabelas com estilos em linha,
porque os clientes de email continuam a ignorar CSS moderno. A marca vai em SVG
embutido, já que imagens externas são bloqueadas por omissão.

## O botão flutuante deixou de mentir

Adiciona sempre uma despesa, mas aparecia no património e nos rendimentos, onde
parecia que ia acrescentar um bem ou um ordenado. Passa a esconder-se nessas
páginas, que já têm o seu formulário à mão. Um atalho que faz outra coisa do que
aparenta é pior do que não existir.

## Juros e amortização

O património sabia quanto vale cada coisa e não sabia o que ela faz. Um depósito
a prazo a 3% e o mesmo dinheiro parado à ordem apareciam iguais; uma dívida de
150 mil não dizia quando acaba. Passa a guardar-se a **taxa anual** em qualquer
bem e, nas dívidas, a **prestação e o prazo**.

**A conta da dívida é feita mês a mês, não pela fórmula fechada.** São algumas
centenas de iterações, tempo nenhum, e é exato: apanha a última prestação (que é
quase sempre mais pequena que as outras) e não acumula erro de arredondamento em
cêntimos, como a fórmula acumula.

**A prestação real ganha ao prazo.** Se estiverem os dois preenchidos, manda a
prestação, porque é o que sai da conta todos os meses; o prazo só serve para a
estimar quando ela não é conhecida. Quem paga acima da prestação acaba antes, e
a app tem de mostrar isso em vez do plano teórico.

**Quando a prestação não cobre os juros, diz-se isso.** Devolver "faltam 1.200
meses" era tecnicamente verdade e praticamente inútil: o que ali se passa é que
a dívida está a crescer.

No resumo mostram-se as duas metades lado a lado, o que os bens rendem por ano e
o que as dívidas custam por ano, porque é essa a conta que responde a **amortizar
ou investir**. Nas dívidas conta-se o juro do próximo ano à taxa atual, não o
juro total até ao fim: é esse que se compara com o que o dinheiro renderia.

## Editar um bem, em vez de apagar e voltar a criar

A ação de gravar já aceitava um `id` desde o início, mas o formulário nunca o
enviava: para corrigir um valor era preciso apagar e escrever tudo de novo. O
mesmo formulário passa a servir os dois casos, e abre-se dentro da própria linha
com um `<details>` nativo, sem JavaScript à mistura.

## Três funções mortas, removidas

`pairwiseStatement`, `testRuleAgainstHistory` e `detectDuplicates` não eram
chamadas por nada além dos próprios testes. A última era a mais perigosa: uma
**segunda implementação da deduplicação**, invariante do domínio, a par da que o
serviço de importação usa de facto (que pergunta à base de dados só pelos UIDs
do ficheiro, em vez de carregar as despesas todas). Duas implementações do mesmo
invariante é como se começa a ter duas respostas diferentes para a mesma
pergunta. Ficou a que corre em produção.

## Movimentos datados dos investimentos

Uma posição escrita à mão ("tenho 100 unidades a 92 EUR") diz o que se tem hoje
e não diz como lá se chegou. Sem as datas das compras não há forma de responder
à pergunta que interessa: **quanto rendeu o meu dinheiro**, sabendo que ele foi
entrando aos poucos. Passa a haver uma tabela de movimentos com data: compras,
vendas, dividendos e custos.

**Os movimentos substituem a posição manual, nunca se somam a ela.** Quem
registou "100 unidades" e depois lança as três compras que fizeram essas 100
unidades não pode acabar com 200. Enquanto houver movimentos, mandam eles; se
forem apagados, volta a valer o que estava escrito, que fica intocado por baixo.
É o invariante das entradas manuais aplicado a isto: nada é reescrito por trás.

**Custo médio ponderado, não FIFO.** É o que as corretoras mostram e o que torna
o custo unitário comparável com a cotação. Para o IRS a regra é FIFO, e este
número não serve para isso.

Com as datas, aparece a **TIR** (taxa interna de rentabilidade): a taxa anual
que o dinheiro rendeu tendo em conta quando entrou. É a diferença entre "ganhei
20%" e "ganhei 20% em dois meses". Faltam ainda a TWR e a comparação com o
índice, que precisam de histórico de cotações.

## Câmbio: o valor guardado é sempre em euros

Uma compra de ETFs sai muitas vezes em dólares. O que fica gravado é o euro que
saiu mesmo da conta, porque é a única base sã para somar património e calcular
rentabilidade. A moeda original e a taxa ficam ao lado, para o registo se poder
conferir sem refazer contas.

**A taxa pode ser a de referência ou a que a corretora aplicou, e quem escolhe é
quem regista.** Não são o mesmo número: a corretora cobra spread, e a fixação
diária do BCE é uma referência que ninguém consegue na prática. Quem tem a nota
de execução à frente sabe a taxa verdadeira, e essa ganha sempre à nossa.

A taxa de referência vem das taxas do BCE (API do Frankfurter, sem chave), por
um endpoint próprio e não escondida dentro da ação de gravar. É de propósito: a
taxa aparece no formulário **antes** de se gravar, junto com o valor em euros
que vai ficar, para se poder conferir. Uma conversão feita por trás é impossível
de verificar depois. Se a chamada falhar, não se inventa taxa nenhuma: pede-se à
mão.

## Importar movimentos, não só posições

O ecrã de importação da corretora só lia **posições**. Um extrato de transações
metido lá aparecia como "147 posições", algumas com quantidades negativas, que
são vendas. São ficheiros diferentes a responder a perguntas diferentes, e as
pessoas não têm de saber a diferença de cor: passa a haver dois separadores, com
os **movimentos primeiro**, porque valem mais. Com as datas dá para saber o que
o dinheiro rendeu; com uma fotografia das posições, não.

**O mapeamento das colunas passa a ser sempre corrigível.** Antes o painel só
aparecia quando a deteção falhava por completo, o que deixava o pior caso sem
saída nenhuma: a deteção acertar EM PARTE. Quem via uma coluna trocada não tinha
como a emendar. Uma deteção errada é mais comum do que uma deteção falhada.

**A coluna da moeda muitas vezes não tem cabeçalho.** É assim na Degiro: aparece
numa coluna sem nome logo a seguir ao valor. Procurar só por um cabeçalho
chamado "moeda" deixava esses ficheiros a perder o câmbio todo, e uma compra em
dólares importada como se fosse em euros ficava com o valor errado sem ninguém
dar por isso. Agora, se não houver cabeçalho, procura-se uma coluna com códigos
de três letras, de preferência à direita do valor.

**As taxas de câmbio não se leem com o leitor de dinheiro.** "1,0912" tem quatro
casas decimais, e o leitor de valores monetários vê ali um separador de milhares
(porque em euros ninguém escreve quatro casas) e devolve 10912.

**A deduplicação conta em vez de comparar chaves.** Duas compras iguais, do mesmo
produto, no mesmo dia, ao mesmo preço, acontecem a sério: as corretoras partem
uma ordem grande em várias execuções. Uma chave única por conteúdo apagava essas
repetições legítimas e deixava a posição errada. Contando, se o ficheiro traz
três linhas iguais e já lá estão duas, importa-se uma. E compara-se pelo valor
**como veio no ficheiro**, não pelo convertido: o que está gravado está em euros
e o que se está a ler está em dólares, e comparar os dois diretamente duplicava
todas as compras em moeda estrangeira a cada reimportação.

## Cotações, e a comparação com o índice

O preço atual de um investimento era escrito à mão. Passa a poder ser buscado, e
o que se busca fica guardado num histórico diário por símbolo. Guardar serve
três coisas: a página desenha-se sem depender de uma chamada externa, a fonte
não leva com um pedido por visita, e sobretudo a **comparação com o índice
precisa do histórico**, não do preço de hoje.

A tabela das cotações não tem `space_id` de propósito: a cotação do S&P 500 no
dia 3 é a mesma para toda a gente. É um cache partilhado de factos públicos.

**Os índices de referência são ETFs UCITS cotados em euros, não o índice em
dólares.** Um português não compra o S&P 500: compra um ETF que o segue, em
euros, e leva com o câmbio pelo caminho. Comparar uma carteira em euros com o
índice em dólares mede duas coisas ao mesmo tempo, o mercado e o dólar, e nos
anos em que o euro se mexe muito a conclusão sai invertida.

Cada índice tem **vários símbolos por ordem de preferência**. Os códigos das
praças mudam e os ETFs deixam de ser seguidos; com uma lista, a comparação
continua a funcionar em vez de desaparecer da página por causa de um símbolo. A
página diz sempre qual foi usado e de que dia é o fecho.

Quando não há cotações, diz-se isso. Um preço velho identificado como velho é
informação; um preço inventado não é.

## PWA: o que faltava para ser mesmo instalável

O manifest e o service worker já existiam, mas os ícones eram só SVG, e com isso
a app **não era instalável em lado nenhum**: o Chrome exige um PNG de 192 e um
de 512 para sequer considerar a instalação, e o iOS ignora os ícones do manifest
por completo, usa o `apple-touch-icon`, também em PNG. Sem ele, "Adicionar ao
ecrã principal" mete uma miniatura da página em vez da marca, que é a diferença
entre parecer uma app e parecer um atalho.

Os PNG são gerados a partir do SVG da marca, **renderizados em cada tamanho** e
não redimensionados a partir de um só, para os cantos e o corte do disco ficarem
nítidos a 192 como a 512.

**O convite a instalar tem de ser diferente nos dois sistemas.** O Android
dispara `beforeinstallprompt` e dá para mostrar um botão a sério. O iOS não
dispara nada: instalar é Partilhar → Adicionar ao ecrã principal, e não há forma
de o pedir por código. A única coisa útil é dizer onde carregar, com as palavras
que aparecem no ecrã. E só se mostra no Safari: no iPhone, o Chrome e o Firefox
não conseguem instalar, e mandar lá a pessoa era mandá-la a lado nenhum.

## Revisão em telemóvel

Duas coisas que só se veem num ecrã de 390 pixels:

**Os primeiros passos tinham o botão ao lado do texto**, o que espremia a
descrição para meia dúzia de palavras por linha. Um passo que se lê mal não
convida a dar passo nenhum. No telemóvel o botão passa para baixo.

**O botão flutuante aparecia por cima do formulário de nova despesa**, e tapava
o campo da descrição. Um botão de "criar" por cima do ecrã de criar não leva a
lado nenhum. A regra de onde ele aparece cresceu duas vezes por causa de
defeitos reais, por isso saiu do componente para um módulo com testes.

## Os preços passam a atualizar-se sozinhos

Ficava meio feito: a série do índice ia buscar dados novos quando estava velha,
mas o preço de cada investimento só mudava quando alguém carregava no botão. Um
valor de há três semanas ficava lá a passar por atual, e todas as contas que
dependem dele (património líquido, ganho, comparação com o índice) ficavam
erradas sem dar sinal.

Agora, ao abrir a página, os preços dos investimentos com símbolo são postos em
dia. Só se vai à fonte quando a cotação guardada está velha, e as cotações são
um cache partilhado, por isso **cada símbolo é buscado uma vez por dia no
serviço inteiro**, não uma vez por visita. E só se escreve na base de dados
quando o preço mudou mesmo.

**A data do fecho passa a estar à vista.** É a parte que faltava: antes não
havia forma de saber se o número era de hoje ou do mês passado. Um valor
desatualizado identificado como tal é informação; o mesmo valor apresentado como
atual é uma mentira silenciosa. Sem símbolo, diz-se que o preço foi escrito à
mão e como fazer para deixar de o ser.

## Um botão que responde "porquê"

"Não encontrei cotações para este símbolo" é honesto e inútil. Pode ser o
símbolo estar errado, a fonte estar em baixo, ou o servidor não conseguir sair
para a internet. São três problemas com três soluções diferentes, e sem os
distinguir não se resolve nenhum.

Na consola da plataforma há agora um botão que testa a fonte com os índices de
referência e com os símbolos que estão mesmo registados, e diz qual dos três é:

- **Não falei com a fonte** (a chamada rebentou): é rede ou bloqueio de saída.
- **A fonte respondeu mas não conhece o símbolo** (200 sem cotações): é o
  símbolo.
- **A fonte respondeu com erro** (503 e afins): é a fonte, e passa sozinho.
- **Funciona**, com quantas cotações e de que dia é a última.

Corre no servidor de propósito: é ele que vai buscar as cotações em produção, e
testar a partir do browser respondia a outra pergunta. Fica atrás do dono da
plataforma, porque é diagnóstico e não conteúdo de ninguém.

## Um ticker escrito à mão não é o símbolo da fonte

Quem regista uma ação escreve "MSFT", não "msft.us". E sem sufixo de praça a
fonte não o encontra, ou pior, pode encontrar um instrumento com o mesmo nome
noutra bolsa. Um preço errado que não se identifica como errado é o pior
resultado possível numa app de finanças.

Passa a tentar-se as formas prováveis por ordem, com as **explícitas à frente** e
a ambígua no fim: `msft.us`, `msft.de`, `msft`. A que funcionar fica gravada, para
não se andar a tentar três de cada vez para sempre. Um símbolo que já traga
sufixo, ou um índice como `^spx`, é usado tal e qual: quem o escreveu sabia o que
queria.

E a linha do investimento passa a dizer **porque é que não há preço**. "Sem preço
atual" sozinho não distingue faltar o símbolo, o símbolo estar errado, ou a fonte
ter falhado, e são três coisas com três soluções.

## Apagar uma conta falhava em silêncio

Carregar em "Apagar dados" não fazia nada, sem uma mensagem. A causa: todas as
chaves estrangeiras para `app_users` eram `NO ACTION` e o código só desligava
uma delas. Bastava a pessoa ter criado um ambiente, uma despesa ou um acerto
para a base de dados recusar o `DELETE`. O erro era apanhado por um
`.catch(() => {})` e deitado fora, e a página recarregava igual.

**`created_by` é proveniência, não propriedade.** Diz quem registou aquilo, e
não deve poder impedir que uma pessoa seja apagada. Numa app partilhada, apagar
as despesas de quem sai desequilibrava contas alheias que já podem ter sido
acertadas, por isso os registos ficam e o que desaparece é a ligação à pessoa. É
também o que um pedido de RGPD pede: apagar a identificação, não reescrever a
contabilidade de terceiros. As chaves passam a `on delete set null`, e uma
despesa sem autor lê-se como "registada por alguém que já cá não está".

A garantia passa a estar **na base de dados** e não no código. O código já
desligava `members.linked_user_id` à mão antes de apagar, mas depender disso é
depender de não haver enganos.

**E as duas ações passam a dizer o que aconteceu.** Era este o defeito de fundo:
uma remoção que falha em silêncio é pior do que uma que recusa, porque quem
carrega fica a achar que correu bem. Foi por causa disto que o erro esteve lá
sem ninguém o ver.

## A Stooq não serve, e o meu diagnóstico enganou-se

O teste em produção deu resposta clara: **HTTP 200, ~445 ms, e a mesma página
HTML para todos os símbolos**, incluindo o `^spx`. Não é símbolo desconhecido: é
a Stooq a recusar pedidos de servidores com uma página anti-robô.

O pior é que o meu diagnóstico chamou-lhe "o símbolo está errado", que é o
oposto do problema, e mandava mexer no que estava certo. Um bloqueio que devolve
200 é fácil de confundir com dados vazios, e por isso `bloqueada` passa a ser um
veredicto próprio, com um teste que fixa o caso.

**A fonte passa a ser o Yahoo Finance, com a Stooq como alternativa.** Duas de
propósito: uma fonte gratuita pode passar a bloquear de um dia para o outro, e
sem alternativa a funcionalidade morre com ela. As convenções de nome diferem
(Londres é `.uk` numa e `.L` na outra, o S&P 500 é `^spx` e `^GSPC`), e a
tradução vive num sítio só.

## Importar da corretora, num sítio só

Havia dois separadores, "Movimentos" e "Posições", e a pessoa tinha de saber
qual dos dois ficheiros tinha na mão. Não tem de saber: **a diferença lê-se no
ficheiro**. Um extrato de transações tem uma coluna de datas com datas a sério;
uma lista de posições não tem. Pede-se "o ficheiro da corretora" e diz-se depois
o que se percebeu que ele é.

**Vários ficheiros de uma vez**, porque é assim que eles vêm: um por ano, ou um
por conta. Cada um é lido por si e um que falhe não estraga os outros. A escolha
de importar é por ficheiro e não por linha: com dez ficheiros e centenas de
linhas, escolher linha a linha era pedir para ninguém escolher nada.

O painel de colunas continua a existir mas só com um ficheiro de cada vez: serve
para ensinar um formato, e ensinar dois ao mesmo tempo não se percebe. Nele, **é
a coluna da data que decide o tipo**, a mesma regra da deteção automática.

## A consola só sabia de despesas

Via-se quantas despesas cada ambiente tinha e mais nada. Se alguém andasse a
usar o património ou os rendimentos, não havia forma de saber. Passa a haver
duas coisas: quantos ambientes usam cada parte da app, e uma etiqueta por
ambiente com o que ele usa.

Continua a valer a regra: **contagens e nomes de funcionalidades, nunca
conteúdo**. Saber que um ambiente usa o património não é o mesmo que ver o que
lá está, e a consola continua sem poder ver.

## O Yahoo funciona, e os símbolos de reserva cotam em dólares

O teste em produção confirmou: o Yahoo responde a todos os símbolos em 130 a 350
ms, com milhares de cotações e a última do próprio dia. A Stooq bloqueia os sete.

Mas o mesmo teste mostrou uma armadilha que estava lá em silêncio: os símbolos
de reserva (`^GSPC`, `IWDA.L`, `URTH`) **cotam todos em dólares**, incluindo o
IWDA apesar de estar em Londres. Se o principal falhasse, a comparação com o
índice passava a medir o mercado e o câmbio à mistura, que é exatamente o erro
que este desenho existe para evitar, e sem ninguém dar por isso.

A moeda passa a estar **declarada em cada símbolo**, e não lida da resposta: é
conhecimento estável, e declará-la permite pôr os que cotam em euros à frente
sem depender de qual responde primeiro. Um teste garante essa ordem. Quando só
houver um em dólares, a página usa-o (mais vale uma comparação imperfeita do que
nenhuma) mas **diz que a diferença inclui câmbio**.

## Uma cotação sem moeda é um número errado

A pergunta era sobre atualização, e ao investigá-la apareceu coisa pior: o
Yahoo devolve o MSFT **em dólares**, e o preço ia direto para o ativo como se
fossem euros. Uma ação a 536,92 USD aparecia como 536,92 EUR e inflacionava o
património quase 10%, sem dar sinal. Numa app de finanças, um número errado que
se apresenta como certo é o pior resultado possível: estraga o património, o
ganho, a TIR e a comparação com o índice, todos ao mesmo tempo.

As cotações passam a guardar a **moeda de origem**, e a conversão é feita **à
taxa do dia da cotação**, não à de hoje. A data importa: uma cotação de há dois
anos vale o que valia nessa altura, e usar a taxa de hoje faria a rentabilidade
histórica mexer-se sozinha sempre que o câmbio mexesse.

**Sem câmbio, não se grava preço nenhum.** Fica sem preço, com o motivo à vista.
Um investimento sem preço conta pelo que custou e diz que é isso que está a
fazer; um com o preço errado mente em silêncio.

## Atualizar sem esperar por ninguém

O preço só se renovava quando alguém abria a página de Ativos, e a primeira
visita do dia pagava a espera. Quem entrasse de manhã via o fecho de anteontem
até a página ir buscar o de ontem.

Passa a haver uma **passagem diária**, depois do fecho americano, que enche a
cache de todos os símbolos conhecidos. Como as cotações são partilhadas por
todos os ambientes, uma passagem serve toda a gente e as páginas passam a
desenhar-se sem esperar por nada.

A rota fica fora do middleware de sessão, porque quem lhe bate é a Vercel e não
um browser. Não é uma porta aberta: exige o `CRON_SECRET`, não lê nem devolve
dados de ninguém, e só mexe em cotações, que são factos públicos. E **não altera
preços de ativos**: quem os escreve continua a ser a visita à página, que é onde
se sabe a que ambiente pertencem e onde se pode dizer o que aconteceu.

## Ler cotações não é ler as mil mais antigas

O MSFT aparecia na página de Ativos a **172,42 €, com "fecho de 28/07/2020"** ao
lado, quando valia 495 dólares. A data estava certa e o preço também: a série
realmente acabava ali.

A API do Supabase corta em **mil linhas por pedido, sem dizer nada**. Dez anos de
fechos diários são mais de dois mil e quinhentos, e a leitura, por ordem
cronológica, trazia os **mil mais antigos**. O "último" era a milésima linha, de
julho de 2020. Um corte silencioso é pior do que um erro, porque o número errado
apresenta-se como certo — com a data ao lado a dar-lhe credibilidade.

A leitura passa a ser paginada. E quem só quer o preço de agora deixa de arrastar
dez anos de histórico pela rede: pede a última linha e mais nada.

Ao corrigir isto apareceu o irmão do problema: o botão "Atualizar" gravava a
cotação **em bruto**, sem converter. A atualização automática convertia; esta
não. Um MSFT a 495 dólares ficava a 495 €. **Dois caminhos que escrevem o mesmo
campo têm de aplicar as mesmas regras**, senão o valor certo depende de que botão
se carregou.

## Uma camada de IA para ler ficheiros de corretora

A deteção de colunas por cabeçalhos conhecidos funciona bem no ficheiro para que
foi afinada e falha no seguinte. Cada corretora escreve o que lhe apetece:
"Produto" numa, "Instrument" noutra, "Valor local" numa terceira, e a moeda numa
coluna sem cabeçalho nenhum. Ir acrescentando sinónimos à lista de cada vez que
aparece um formato novo é uma corrida que se perde sempre — os utilizadores
trazem formatos que ninguém previu.

Quando a deteção falha, pergunta-se a um modelo. Com dois limites que definem a
coisa toda:

**O modelo escolhe colunas. Não lê dados.** A resposta é uma lista de índices.
Quem lê os montantes, deduplica e converte moedas continua a ser o código
determinístico e testado. Um modelo a somar dinheiro é um erro à espera de
acontecer; um modelo a dizer "aquela coluna chama-se Preços mas é o preço
unitário" é exactamente o que ele faz bem. Assim os invariantes do domínio nunca
passam por aqui.

**Nada do que ele diga entra sem ser verificado.** Um índice fora da grelha, uma
linha de cabeçalho que não existe, um decimal onde devia estar um inteiro — a
resposta é descartada inteira e volta-se ao mapeamento à mão. Entre apontar a
coluna errada e não apontar nenhuma, a segunda dá para corrigir.

Sobe o cabeçalho e até catorze linhas de exemplo, truncadas. O ficheiro não sobe.
Sem `ANTHROPIC_API_KEY` a funcionalidade não existe e a importação fica como
estava. E o que a IA mapeou aparece marcado como tal na pré-visualização, com o
que ela percebeu escrito ao lado: um mapeamento que ninguém confirmou tem de se
identificar.

## O corte dos mil não era das cotações, era da API toda

Depois de corrigir as cotações ficou a pergunta certa: se a API do Supabase corta
aos mil, onde é que isso ainda está a acontecer? Foram vinte e sete consultas sem
tecto. Hoje só as cotações passam a barreira (17369 linhas contra 191 despesas),
mas duas das outras são bombas com temporizador:

- **`listExpenses`** — o saldo calcula-se sobre isto, e o saldo **tem de ser
  sempre explicável até às despesas que o compõem**. Um casal com alguns anos de
  registos chega às mil sem dar por isso, e a partir daí o saldo fica errado sem
  nada a assinalá-lo.
- **`listAssetTrades`** — um extrato de corretora traz centenas de linhas de uma
  vez e a posição atual sai da soma de todas. Cortar dava uma carteira imaginária.

O que falha aqui não falha quando alguém mexe no código, falha quando a tabela
cresce. Nenhum teste de desenvolvimento o apanha, porque em desenvolvimento não
há mil linhas de nada.

Por isso a correção não é um `.range()` em cada sítio: é **um leitor paginado
partilhado**, para quem escrever a próxima consulta não ter de se lembrar do
limite. As cotações passaram a usá-lo também, em vez de repetirem a paginação.

Sobre ordenar do mais recente para o mais antigo, que foi a ideia que trouxe aqui:
está certa como **defesa**, e é o que as despesas, os rendimentos e as mensagens
de contacto já fazem. Não resolve — uma leitura cortada continua a mentir — mas
muda a direção da falha, e isso conta. Cortada por cima perde-se o presente, que
é o que quase toda a gente está a olhar; cortada por baixo perde-se o passado,
que ninguém nota que desapareceu. As `contact_messages` ficam assim de propósito:
são uma caixa de entrada, e mostrar as mil mais recentes é o comportamento certo,
não um remendo.

## Um botão para ir buscar as cotações, e outro nome para o que já lá estava

O `fetchAssetQuoteAction` existia no servidor desde que as cotações foram feitas
e **nunca foi ligado a botão nenhum**. O que se via na linha do ativo chamava-se
"Atualizar" e só gravava o número da caixa ao lado — não ia buscar nada. Duas
coisas diferentes com o mesmo nome, e a que a pessoa queria não existia.

Agora: o que grava chama-se **Gravar**, e há um **ícone de recarregar** que vai
mesmo buscar a cotação. Só aparece quando o ativo tem símbolo, porque sem símbolo
não há onde a ir buscar e um botão que nunca funciona é pior do que nenhum.

E um **"Atualizar preços"** no topo dos investimentos, que trata de todos de uma
vez. Com uma posição o botão da linha chega; com dezenas, ninguém carrega dezenas
de vezes. Vai à fonte mesmo que a cotação guardada pareça fresca — quem carrega
quer o valor de agora — e responde com o que aconteceu a cada uma: quantas
mudaram, quantas já estavam em dia, e **quais falharam e porquê**, pelo nome. Um
botão que responde "feito" quando metade falhou deixa a pessoa a olhar para
números velhos convencida de que são novos.

## Uma data só se mostra quando é a data daquele preço

Ao ligar o botão apareceu isto: quando a cotação vem mas o câmbio falha, não se
grava preço nenhum (e ainda bem). Mas a data da cotação continuava a aparecer ao
lado do preço **antigo** — "172,42 € (fecho de 06/08/2026)". O número velho ficava
carimbado com a data de hoje.

É a mentira mais convincente de todas, porque a data é precisamente o que
usávamos para dar confiança ao valor. A data passa a aparecer só quando
corresponde mesmo ao preço mostrado, e o motivo da falha passa a ser visível
mesmo quando existe cotação — antes só se mostrava quando não havia cotação
nenhuma.

## O euro manda na conta, a moeda de origem é a que se confere

Tudo é calculado e guardado em euros, e isso não muda: é a única base sã para
somar património, medir rentabilidade e comparar com um índice.

Mas **ninguém confere uma ação americana em euros**. Quem tem a AAPL abre o
telemóvel, vê 270 dólares, e quer reconhecer esse número aqui. O que via era uma
conversão que já leva o câmbio pelo meio e que não bate com nada do que vê em
mais lado nenhum — e sem forma de saber se estava certa.

Passa a aparecer o fecho na moeda da bolsa ao lado do preço em euros, mais
pequeno e mais apagado. A hierarquia diz o que interessa: o euro é a verdade da
carteira, a moeda de origem é a que se reconhece.

Duas decisões dentro desta:

**Código de três letras, não símbolo.** O `$` é ambíguo entre meia dúzia de
moedas, e num sítio onde se somam valores isso não pode ficar ao critério de quem
lê. "270,10 USD" e "270,10 CAD" são coisas diferentes e têm de parecer diferentes.

**Não aparece quando a conversão falhou.** Se a cotação veio mas não houve câmbio,
não se gravou preço em euros — e mostrar o valor em dólares ao lado de um preço
em euros que não é o dele juntava dois números que não se correspondem. É a mesma
regra da data: só se mostra o que pertence àquele preço.

## Modo demo: self-serve com tectos

Decisão do Tiago, depois de eu assinalar que esta é a hipótese que abre criação de
conta anónima e traz obrigações de RGPD e superfície de abuso. Fica registada a
nota; fica também feita a parte que a torna sustentável.

O registo aberto já existia (`decideAccess`, `AUTH_OPEN_REGISTRATION`). O que
faltava eram os **tectos** — sem eles, abrir o registo transformava a app em
alojamento gratuito de dados financeiros de desconhecidos.

Os números (100 despesas, 10 bens, 2 pessoas, 1 ambiente) não são para irritar
quem experimenta: são para deixar **experimentar tudo** e não deixar viver lá
dentro. Cem despesas chegam para ver um saldo a formar-se e um relatório a fazer
sentido. Duas pessoas não são restrição nenhuma — são o produto.

Três regras que valem mais do que os números:

1. **Nunca se apaga nada por causa de um limite.** Um tecto impede de criar mais,
   não faz desaparecer o que já lá está. Um ambiente que passe o tecto (porque o
   plano mudou, ou porque estes números desceram) fica intacto e só deixa de
   crescer. Há teste para isso.
2. **Diz-se quanto falta antes de acabar.** Nos últimos 20%, com um mínimo de 3.
   Quem bate na parede sem aviso sente-se enganado; quem a vê chegar, decide.
3. **O tecto é do ambiente, não da pessoa.** É o que se mede, e não muda quando
   alguém entra ou sai. A excepção é o número de ambientes, que se conta na
   pessoa porque é ela que os cria — e basta pertencer a um `full` para deixar de
   ter tecto, senão quem foi convidado para um ambiente sem limites ficava preso
   ao seu.

Os seis ambientes que já existiam ficaram `full` na migração: um limite novo nunca
pode aparecer por baixo de dados que já lá estavam.

Editar nunca é travado, só criar. Um bem que já existe tem de se poder corrigir
mesmo com o ambiente cheio — caso contrário o limite passava de tecto a armadilha.

## Crédito à habitação: períodos de taxa em vez de uma taxa

Uma dívida guardava uma taxa e um tipo (fixa/variável). Um crédito à habitação
português típico não tem uma taxa — tem duas ou três, com datas: "3 anos fixa a
3,3%, depois Euribor 6M + 0,9% até 2056". Com uma taxa só, a app mostrava até ao
fim do prazo uma prestação que deixa de ser verdade no dia em que o período fixo
acaba, e uns juros totais que nunca vão ser esses.

**A prestação recalcula-se em cada mudança**, como o banco faz: anuidade sobre o
capital que sobra e os meses que faltam **até à maturidade** — não sobre o
capital inicial nem sobre o prazo original. É isso que cria o degrau. Sem o
degrau, o resto não valia a pena fazer-se: é a única coisa que um crédito misto
sabe e um de taxa única não.

**Fixa / mista / variável é um atalho, não um campo.** O Tiago pediu para poder
"selecionar se é fixo misto ou variável". Os botões montam as linhas típicas de
cada caso, para não se começar de uma folha em branco — mas o que fica gravado
são os períodos, e o tipo é lido a partir deles (`tipoDoCredito`). Um campo à
parte mais tarde ou mais cedo dizia "fixa" num crédito com um período variável lá
dentro, e ninguém repararia.

**O valor do indexante pergunta-se; não se estima.** A app não tem fonte de
Euribor, e a Euribor daqui a três anos ninguém sabe. Quem regista escreve o valor
de hoje, e o plano diz que daí para a frente é um **cenário** feito a esse valor.
Deixar em branco não dá zero — zero é uma taxa perfeitamente válida, e daria um
crédito inteiro sem juros que ninguém questionaria. Dá um plano que se recusa a
existir e diz porquê.

**`jsonb` e não uma tabela.** Os períodos só fazem sentido dentro do crédito a
que pertencem, são dois ou três, e são sempre lidos e escritos inteiros. Uma
tabela dava integridade referencial que aqui não paga o que custa. O preço é o
Postgres devolver o que lá estiver, escrito por outra versão da app ou por
engano: por isso a leitura passa toda pelo `parseCreditTerms`, que valida campo a
campo e deita fora o que não percebe. É a mesma lição dos mapeamentos de
importação — um `as unknown as` daria um plano de amortização com números a sério
e origem duvidosa.

**Sem maturidade recusa-se, em vez de voltar ao cálculo antigo.** A alternativa
cómoda era, faltando a data, cair em silêncio na conta de taxa única. Mas quem
escreveu os períodos disse que este crédito muda de taxa: mostrar-lhe a prestação
de hoje até 2056 seria responder-lhe uma coisa que se sabe falsa.

**A última prestação salda o crédito.** A anuidade é arredondada ao cêntimo, e ao
fim de 360 vezes sobra um resto. O `buildLoan` paga-o num mês 361 que o contrato
não tem — e por isso diz "241 meses" num crédito de 240. Aqui a última prestação
absorve-o, que é o que o banco faz. O `buildLoan` não foi mexido: é um erro de um
mês numa data já mostrada, e corrigi-lo mudava números que as pessoas já viram.

## Ler o contrato do crédito: o modelo copia, a conta é que confirma

Registar um crédito à habitação à mão é ir buscar o montante, a data da
escritura, o prazo e dois ou três períodos de taxa com indexante e spread ao meio
de trinta páginas escritas para um notário. É chato o suficiente para se fazer de
qualquer maneira, e um crédito registado de qualquer maneira dá uma prestação
errada durante trinta anos sem nunca dar erro.

**Ao modelo pede-se que copie, não que calcule.** É-lhe dito explicitamente para
não somar prazos, não deduzir a data do último pagamento e não estimar a
prestação — só copiar o que está escrito. A razão é que a prestação copiada é o
que permite verificar tudo o resto: o `reviewContrato` **recalcula-a** a partir do
capital, da taxa do primeiro período e do prazo, e compara. Uma vírgula fora do
sítio na taxa (0,33% em vez de 3,3%) mantém o formato perfeito e números
plausíveis — e não sobrevive a essa conta. Se o modelo calculasse em vez de
copiar, a comparação passava a confrontar o modelo consigo próprio e não valia
nada.

**Uns euros de diferença não são um erro.** A tolerância é 2% (mínimo 2 €), e é
deliberadamente generosa: arredondamentos e um seguro pequeno na mesma prestação
cabem lá dentro. Gritar por dois euros ensinava quem confirma a ignorar o aviso, e
no dia em que ele fosse a sério já não valia nada.

**O que não passa é deitado fora com aviso, nunca corrigido.** Um período com uma
taxa de 330% desaparece e diz-se que desapareceu. Adivinhar a taxa certa a partir
de uma taxa errada seria escolher por alguém um número que vai valer trinta anos.

**O valor do indexante que está no contrato não se aproveita.** Está lá quase
sempre ("Euribor a 6 meses em vigor: 2,532%") e era fácil usá-lo. Não se usa: é o
valor do dia da escritura, e um plano de amortização construído sobre ele seria um
cenário com ar de facto. O campo fica vazio de propósito e diz-se porquê.

**O ficheiro não é guardado.** Entra, dá o texto, é lido e desaparece com o
pedido. Um contrato de crédito tem morada, número fiscal e assinatura; guardá-lo
para nada era uma responsabilidade que esta app não precisa de ter.

**O montante do contrato não é o que falta pagar.** Vai para o campo do saldo
porque é o melhor ponto de partida que existe, mas com um aviso por baixo: num
crédito com anos, a diferença são dezenas de milhares de euros, e é o erro mais
fácil de deixar passar neste ecrã.

## Preço dos imóveis: INE, e não o idealista

O pedido falava do relatório de preços do idealista, que é o que toda a gente
conhece. Não dá: o idealista não tem API pública, e só se lá chegava a raspar as
páginas — o que viola os termos deles e parte no dia em que mudarem o HTML. O INE
publica o mesmo tipo de indicador (valor mediano das vendas de alojamentos
familiares, em €/m², por concelho) numa API pública e documentada.

**Não são a mesma coisa, e é bom que se saiba.** O idealista mede anúncios, o INE
mede escrituras. Pedidos contra pagos: o INE costuma dar mais baixo, e sai com uns
meses de atraso. Em compensação é o que se pagou mesmo.

**A geografia resolve-se por nome, não por código.** Uma tabela com os códigos dos
308 concelhos era trezentas linhas a manter aqui dentro e a dessincronizar-se em
silêncio. Em vez disso pede-se ao INE a lista toda e compara-se pelo nome que ele
próprio devolve, sem acentos e sem maiúsculas. Um nome ambíguo **não se
desempata**: há duas Lagoas em Portugal, uma nos Açores e outra no Algarve, com o
dobro do preço uma da outra — escolher a primeira era acertar por sorte numa em
duas, e o erro ficava calado.

**A estimativa nunca substitui o valor.** `price_ref_cents` vive ao lado de
`value_cents` e a estimativa aparece por baixo do valor, apagada e identificada. A
mediana do concelho não sabe se a casa é num último andar com vista ou num rés do
chão para as traseiras, e entre uma coisa e outra vão facilmente 30%. Trocar um
valor desatualizado, que se sabe desatualizado, por um número errado com ar de
facto seria uma troca má.

**Escrever o preço à mão troca a proveniência.** Mexer no campo põe a fonte a
"escrito à mão". Um preço com a etiqueta do INE que não veio do INE é pior do que
um preço sem etiqueta nenhuma.

**O código do indicador está numa variável de ambiente.** O INE renumera as séries
quando muda a metodologia, e um número fixo no código obrigava a um deploy para
uma coisa de configuração. Quando o pedido não devolve nada que se perceba, a app
diz isso e aponta para a variável — em vez de mostrar zero concelhos, que se leria
como "o teu concelho não tem dados".

## Evolução do património: guarda-se, porque o passado não se reconstrói

O património da app é uma fotografia — cada bem tem o valor de hoje e mais nada.
O depósito que hoje tem 12 mil não sabe que teve 8 mil no ano passado, e a casa
registada em 2019 não guardou o que valia então. As despesas dão-se a reconstruir
porque são movimentos datados; um saldo não. Logo: ou se grava uma fotografia por
dia, ou não há gráfico nenhum para desenhar. **O histórico começa vazio e enche-se
para a frente**, e o ecrã diz isso em vez de mostrar um gráfico a fingir.

**Grava-se na visita, não num cron.** Um cron diário obrigava a mais um segredo,
mais uma entrada no `vercel.json` e uma lista de ambientes a percorrer. A
gravação na visita é idempotente (uma por dia e por ambiente, por índice único) e
não custa nada. O preço são buracos nos períodos em que ninguém abriu a app.

**Os buracos não se preenchem.** Se faltarem meses, os pontos ficam mais afastados
e vê-se que ficam. Ligá-los com uma recta era afirmar uma coisa sobre meses de que
não se sabe nada.

**Não há percentagem a partir de um património negativo.** Ir de -50 mil para -10
mil é uma melhoria de 40 mil, e a divisão dá -80%: o sinal ao contrário do que
aconteceu. Quem começa com mais dívida do que bens — o normal nos primeiros anos
de um crédito à habitação — vê a variação em euros e não vê percentagem nenhuma.
Pela mesma razão, o gráfico desenha a linha do zero sempre que há valores
negativos: sem ela, uma série toda negativa desenhava-se igual a uma positiva.

**O líquido gravado não se acredita.** `net_cents` está na tabela por
conveniência, mas quem lê recalcula-o a partir das duas parcelas. Uma linha
escrita por uma versão antiga com a soma errada desenhava um degrau que nunca
existiu.

## Conversar sobre os números: o modelo discute, não calcula

O resumo da situação é montado por código com testes (`buildSituacao`) e vai para
o modelo **já em euros**. Ele recebe totais, dívidas com taxa e prestação, médias
por categoria e a evolução; discute-os, compara-os, aponta o que salta à vista.
Não soma, não projeta, não estima rendibilidades — e é-lhe dito que, se para
responder fizer falta uma conta que não está no resumo, diga que não tem esse
número em vez de o produzir.

É a mesma divisão de trabalho da importação (a IA escolhe colunas, não lê valores)
e da leitura do contrato (copia, não calcula). A razão é a de sempre: *"a tua taxa
de poupança é 34%"* é exatamente o tipo de frase em que ninguém desconfia.

**Euros e nunca cêntimos.** Um modelo a ler "18000000" tanto pode dizer dezoito
milhões como cento e oitenta mil, e a frase sai com o mesmo ar de certeza nos dois
casos. Há teste.

**As divisões por zero devolvem `null`, não infinito.** Taxa de poupança sem
rendimento registado, anos de despesa cobertos sem despesa registada: os dois dão
`Infinity`, e "o teu património dá para infinitos anos" lê-se mesmo como boa
notícia. O resumo diz por extenso que não dá para saber.

**O que não sai do servidor:** as despesas uma a uma (vão médias por categoria),
as notas dos bens (texto livre, onde cabe o que alguém escreveu sem pensar que
sairia dali) e os nomes das pessoas, que não acrescentam nada a uma conversa sobre
dinheiro. O ecrã diz isto **antes** da primeira pergunta.

**A conversa não fica guardada.** Vive na página e vai e volta em cada pedido. Uma
tabela de conversas sobre dinheiro é uma responsabilidade que esta app não precisa
de ter, e o valor de a guardar é pequeno. O histórico que volta do cliente é
tratado como território de quem o envia: cortado, com os papéis a alternar e a
começar sempre do lado de quem pergunta.

## O chat vive no layout, e é por isso que sobrevive à navegação

No App Router, o layout **não é remontado** quando se muda de rota — só o
`children` é. Pôr o chat lá é o que faz a conversa aguentar uma ida às despesas e
voltar, sem uma linha de código para isso. Numa página, cada clique no menu
apagava tudo.

O resumo que vai para o modelo passou a incluir o **saldo entre as pessoas do
ambiente, com nomes**. A primeira versão excluía-os por princípio, e estava
errado para o que esta app é: metade dela é despesa partilhada, e "quem me deve o
quê?" não tem resposta possível sem nomes. São pessoas do próprio ambiente de
quem pergunta, que já aparecem em todos os ecrãs. Continua de fora tudo o que não
faz falta: as despesas uma a uma, as notas dos bens.

## O que a revisão dos quatro problemas apanhou

**O preço do INE estava a vir do indicador errado.** O `0012530` era um palpite —
escrito sem se poder fazer a chamada — e devolvia outra coisa qualquer, com
valores entre 1 e 3 que o ecrã mostrava como "1,00 €/m²". O certo é o **0012234**,
confirmado contra uma resposta a sério: 931 linhas, preços entre 280 e 6986 €/m².

**Os períodos do INE vêm por extenso, e ordená-los por texto mente.** As chaves
são "1.º Trimestre de 2026"; ordenadas alfabeticamente, "4.º Trimestre de 2019"
fica à frente e a app mostrava preços de há sete anos como se fossem os de agora.
Lê-se o ano e o trimestre.

**Comparar nomes por sub-cadeia era pior do que não comparar.** "Paranhos, Porto"
trazia **Tó**, a freguesia de Mogadouro, porque "por**to**" contém "to" — e com
oito lugares na lista, os oito "Tó" empurravam o Porto e Paranhos para fora do
ecrã. Agora compara-se por **palavras inteiras**, com uma escada de pontuação, e
a vírgula separa o sítio do contexto: em "Paranhos, Porto" procura-se Paranhos e
"Porto" só desempata. Um nome de duas letras só entra se for escrito como palavra.

**A lista do INE tem vários níveis ao mesmo tempo**, e há nomes repetidos entre
eles — Odivelas é concelho e é freguesia lá dentro. Cada candidato leva agora o
"dentro de", tirado da hierarquia dos próprios códigos (o da freguesia começa
pelo do concelho). Sem isso, o ecrã mostrava dois botões iguais com preços
diferentes e não havia forma de escolher.

**A cotação em falta não era do símbolo — era da fonte, e a app não sabia
dizê-lo.** O `googl.us` chega ao Yahoo como `GOOGL`, que é a forma certa. O que
falhava era o motivo desaparecer: em `refreshStalePrices`, a série só era
atribuída quando vinham cotações, e por isso o `problem` saía **provadamente
sempre nulo**. O botão "Atualizar preços" respondia *"1 já estava em dia"* a um
investimento sem preço nenhum. Agora o motivo de cada fonte é guardado e mostrado
no cartão: "a fonte recusou o pedido" e "este símbolo não existe" são problemas
opostos — um espera-se, o outro corrige-se à mão.

Na mesma passagem: o `force` passou a saltar também a cache do Next (uma resposta
200 sem dados ficava lá uma hora e o botão não a contornava), e uma escrita que
falha deixou de contar como "preço atualizado".

**O gráfico do património não estava partido — o estado vazio é que mentia.** A
gravação da fotografia engolia o erro por inteiro, e o cartão dizia "o histórico
está a começar" tanto no primeiro dia como todos os dias em que a escrita
falhasse. Agora diz qual dos vazios é.

## Reconstruir o passado do património: o que é medido e o que é assumido

O Tiago pediu a evolução a recuar no tempo, depois de eu ter desaconselhado a
parte estimada. É a decisão dele, e fica feita — mas **marcada**.

**O que é medido a sério.** Os investimentos: há movimentos datados e cotações
guardadas, por isso quantas unidades havia em Março e a que preço fechavam
sabe-se. E o crédito: com taxa e prestação, o saldo passado sai da própria
amortização ao contrário — `saldo = (saldo' + prestação) / (1 + i)`.

**O que é assumido.** As contas bancárias e os imóveis não guardam passado
nenhum: entram ao valor de **hoje**. A linha do ano passado mostra o saldo
bancário de hoje. É por isso que a parte reconstruída é desenhada a **tracejado**,
com pontos mais apagados, e com uma legenda a dizer exactamente isto por baixo do
gráfico.

**O câmbio fica congelado.** A cotação guardada está na moeda da bolsa e o preço
em euros só se sabe para hoje. Usa-se a razão entre o fecho da data e o fecho mais
recente, aplicada ao preço em euros de hoje: a moeda desaparece da conta e não é
preciso uma taxa por mês. O preço fica certo, o câmbio não se mexe — num período
em que o euro oscilou muito, a diferença aparece.

**Sem nada reconstruível, não se desenha nada.** Se não houver investimentos com
movimentos nem dívidas com plano, todos os pontos seriam o valor de hoje repetido
para trás — uma linha horizontal a afirmar que o património esteve parado meses a
fio. É a versão mais convincente da mentira que isto já assume ter, e essa não se
faz.

**O medido ganha sempre.** Um mês que tenha fotografia a sério não é substituído
por uma estimativa, nem parcialmente. É o único ponto daquele mês em que se pode
confiar.

## A fotografia grava-se ao movimento, não só à visita

Antes, a fotografia diária só era escrita ao abrir o `/patrimonio` — o gráfico
tinha a resolução das **visitas** e não a dos **movimentos**. Registar uma compra
e não abrir a página deixava o dia de fora, e o salto aparecia todo junto mais
tarde. Agora grava-se também ao gravar um bem, ao apagar um bem e ao registar ou
apagar um movimento. É idempotente (o dia é sempre a mesma linha) e falha calada:
ninguém fica sem registar um movimento porque a fotografia não deu.

## O imóvel pergunta o que se sabe, não o que se adivinha

O formulário pedia "valor atual" e uma "taxa anual de rendimento" — duas
perguntas que não fazem sentido numa casa. De um imóvel sabe-se **o que se pagou
por ele** e **o que se meteu em obras**. O valor de hoje é a única coisa que
ninguém tem, e era precisamente a que estava a ser pedida.

**A conta:** `valor ≈ (compra + obras) × (índice de hoje / índice na data da
escritura)`, com o índice a ser o €/m² que o INE publica para aquele sítio. O
ponto de partida é um facto; só a variação vem da estatística.

**Porquê isto e não "área × preço da zona".** A mediana aplicada à área diz
quanto valeria uma casa *média* daquele tamanho naquela zona — e uma casa
concreta não é a média: entre um T2 sem elevador e um último andar remodelado
vão 30%. As duas contas continuam lado a lado no ecrã, porque **discordarem uma
da outra é informação**.

**As obras não valorizam desde a compra.** Entram no custo pelo que custaram.
Aplicar-lhes o índice desde a escritura era dizer que uma cozinha feita o ano
passado valorizou desde 2019.

**Guarda-se o `geocod`, não só o nome.** Sem o código não há como ir buscar o
índice de 2023: o nome não chega, porque há nomes repetidos entre níveis. E por
isso o parser passou a guardar **todos** os períodos do INE, e não só o último —
vinham no mesmo pedido e eram deitados fora.

**Calcula-se a cada visita e um valor à mão ganha sempre.** Gravar o valor
deixava-o parado até alguém reabrir o formulário, que é o problema que isto veio
resolver. E quem conhece a casa sabe mais do que a mediana do concelho: havendo
valor escrito, é esse que conta.

## O lucro de cada entrada, e porque não é FIFO

Numa ação comprada em sete alturas diferentes, a pergunta natural é *"comprar
naquele dia foi bom negócio?"*. Cada movimento passa a mostrar o que essa entrada
valeu a pena ao preço de agora.

**Não é FIFO e não é mais-valia realizada.** A posição desta app é a **custo
médio** — dizer aqui que uma venda consumiu esta compra e não aquela era pôr duas
contabilidades no mesmo ecrã, com a de baixo a contradizer a de cima. Conta as
unidades desse movimento ao preço de hoje, mesmo que já tenham sido vendidas. O
ecrã diz isto por extenso, incluindo que **não serve para o IRS**, que em Portugal
é FIFO.

Numa venda a conta é ao contrário: o que se recebeu contra o que essas unidades
valeriam hoje. Vender antes de uma descida é ganhar, e o sinal tem de o dizer.

## As posições fechadas ficam arrumadas, não desaparecidas

Uma importação de corretora traz tudo o que alguma vez se comprou, incluindo o
que já foi vendido por inteiro — fichas com zero unidades e zero euros que
ocupam o mesmo espaço que as posições vivas. Ficam escondidas por omissão, com a
contagem à vista e a um clique de aparecerem. Esconder sem dizer que se escondeu
seria fazer desaparecer coisas a quem está a contar dinheiro. Não mexe em número
nenhum: uma posição a zero vale zero, esteja à vista ou não.

## A bolsa vinha no ficheiro e estava a ser deitada fora

O ficheiro da corretora traz uma coluna "Bolsa" ("NDQ", "EAM", "XET") e a
importação ignorava-a. É a pista **mais fiável** que existe para descobrir o
símbolo: diz a praça sem se ter de a adivinhar pelo nome do produto — e adivinhar
mal é acertar no ticker de outra empresa, que devolve um preço plausível todos os
dias, para sempre, sem ninguém desconfiar.

Passa a ser lida, gravada no bem, mostrada no cartão e **enviada ao modelo** na
sugestão de símbolo, com a lista de códigos que as corretoras usam. Serve também
para filtrar a carteira.

## Filtrar a carteira, sem esconder nada em silêncio

Cinquenta produtos importados, muitos já vendidos por inteiro e muitos sem
símbolo. O que se faz numa lista dessas é **procurar um**. Há agora procura por
nome ou ticker, filtro por bolsa, filtro "sem símbolo", e as posições fechadas
ficam arrumadas por omissão.

A contagem está sempre à vista — "Já fechadas (12)", "Sem símbolo (51)" — e há
"Limpar". Fazer fichas desaparecerem a quem está a contar dinheiro, sem dizer
quantas nem como as trazer de volta, seria pior do que a lista comprida. E filtrar
não mexe em número nenhum: uma posição a zero vale zero, esteja à vista ou não.

## Corrigir um movimento passa pelas mesmas regras que criá-lo

Um ficheiro de corretora engana-se: uma data trocada, uma quantidade com um zero
a mais, uma taxa de câmbio que não é a que foi aplicada. Apagar e reescrever perde
a linha e obriga a saber tudo de cor outra vez.

A correção usa a **mesma ação** do servidor, com um `tradeId` a mais. As regras
que impedem gravar dólares como euros, ou um movimento sem valor, valem tanto a
criar como a corrigir — duas validações separadas divergem ao segundo mês. Numa
moeda estrangeira o que se edita é o valor **original**, o que está na nota da
corretora; o euro sai da taxa, como na criação.

O `space_id` filtra a escrita e tem teste de isolamento: um id vindo de um
formulário não é prova de nada, e tudo corre com a chave de serviço, que ignora o
RLS.

## A taxa mista estava escondida

O campo "Tipo de taxa" oferecia fixa e variável. A mista existia — é o bloco "A
taxa muda ao longo do crédito" — mas quem vinha ao campo à procura dela não a
encontrava. Passa a estar na lista, e escolhê-la **abre o editor de períodos** já
com as linhas típicas: fixa no princípio, variável com indexante a partir de uma
data.

Não é um terceiro valor a gravar: um crédito misto são dois períodos, e o tipo
continua a ser lido deles.

## A ordem dos bens é de quem olha para eles

A lista vinha por data de criação — que numa carteira importada é a ordem do
ficheiro da corretora, e não quer dizer nada. Ordenar por valor também não serve:
a ordem por que se olha para as coisas é a de quem olha.

**Setas, não arrastar.** Arrastar precisa de biblioteca, comporta-se mal no
telemóvel e não funciona com teclado. Duas setas com `aria-label` fazem o mesmo e
funcionam em todo o lado.

**A ordem é dentro do tipo.** A página agrupa por tipo; trocar um imóvel com uma
conta não teria efeito visível nenhum.

**Não se arruma o que está filtrado.** Com a lista filtrada, mover mexia em
posições que não se veem, e a ordem final saía diferente do que se viu a fazer.
Os botões desaparecem enquanto houver filtro.

**`sort_order` é NULL em tudo o que já existe**, e nesse caso manda a data de
criação: nenhuma lista já vista muda por causa disto. Só passa a contar depois de
alguém mexer, e a primeira mexida numera o grupo todo — uma escrita por bem, mas
só quando se arruma, e deixa a ordem explícita em vez de dependente de empates.

## Um número sozinho é ambíguo; a coluna inteira não é

`"493.975"` tanto pode ser quatrocentos e noventa e três mil como
quatrocentos e noventa e três vírgula novecentos e setenta e cinco. A regra de
"três dígitos depois de um ponto são milhares" é a certa em português — e é a
errada num ficheiro que escreve os decimais com ponto e às vezes usa três casas.

Aconteceu a sério: uma compra de **493,98 €** entrou como **493 975,00 €**, e as
linhas ao lado do mesmo ficheiro ("500.00", "555.36") foram lidas corretamente.
É o que torna isto difícil de ver — a coluna parece certa.

**A coluna desfaz a ambiguidade que o número não desfaz.** Um único "500.00" na
coluna prova que, neste ficheiro, o ponto é decimal — e portanto "493.975" tem de
ser 493,975. O separador é decidido **uma vez por coluna**, antes de se ler
qualquer linha, e só quando a coluna não diz nada é que vale a regra de sempre.

## Um mock sem colunas não apanha um nome de coluna errado

O `updateAssetTrade` escrevia `date`; a coluna chama-se `trade_date`. O PostgREST
recusava a escrita inteira e o ecrã dizia "Não consegui gravar o movimento" — a
mensagem certa pela razão errada. A edição nunca podia ter funcionado.

Os testes de isolamento não apanharam isto, e não foi descuido: correm contra o
`MockRepository`, que guarda objetos e não tem colunas nenhumas. A diferença é
estrutural e não se resolve tornando o mock mais rigoroso.

Por isso há agora um teste que **lê as migrações**, aprende as colunas de cada
tabela, e confronta com elas os nomes que os `update`s escrevem. Só os `update`s:
um nome errado num `insert` rebenta na primeira utilização, alto e bom som; num
`update` só rebenta naquele caminho — que pode ser um botão que ninguém carrega
durante meses.

## O split que fez a rentabilidade dizer +4969,9%

Uma corretora regista um desdobramento como **uma venda e uma compra no mesmo
dia, pelo mesmo dinheiro**: sai 1 unidade, entram 20, e o dinheiro não se mexe. A
importação leu isso como negócios a sério, porque não tem noção nenhuma de
operações societárias.

Ao mesmo tempo, a série do Yahoo vem **ajustada a splits**. Ou seja: as unidades
gravadas são pré-split e os preços são pós-split. O troço da TWR nesse dia fica
`20p / 1p` = **×20 exactos, independentemente de qualquer preço**.

Reproduzido com o código real e os movimentos reais: investido, já realizado,
ganho e TIR batem ao cêntimo com o que estava no ecrã, e o fator entre o cenário
com e sem split é 20,000000. A TWR honesta é ~+153% total (~+23%/ano), não
+4969,9%. **A TIR não é afetada** — as duas pernas partilham a data e anulam-se.

**Recusar, não corrigir.** Enquanto não houver suporte a splits, a única saída
honesta é não mostrar o número. A guarda compara, em cada movimento, o dinheiro
por unidade com o fecho desse dia: fora de um fator de 1,35 é incoerência.

O limite é largo de propósito — uma execução longe do fecho e as comissões
embutidas andam nos poucos por cento, e recusar a rentabilidade a quem comprou
com um limite mal colocado seria pior do que o problema. Apanha os splits de 3:2
para cima; **um 5:4 passa**, e fica dito.

**O aviso não fica só na TWR.** A "venda" fabricou uma mais-valia realizada de
1923,08 € que nunca existiu — com ar de rendimento tributável — e a "compra" pôs
no investido 2142,56 € que nunca saíram do banco. Recusar só a rentabilidade e
deixar estes dois números sem aviso seria tapar metade do problema.

## Duas recusas que o código prometia e não cumpria

**Um fecho velho era arrastado para sempre.** O `positionValuePoints` diz no
cabeçalho que devolve `null` se faltar o preço de algum dia — "não se estima, não
se interpola e não se salta o ponto". Só que o `priceOn` arrastava o último fecho
anterior sem limite: uma série que acabasse em 2022 avaliava um movimento de 2025
a preços de 2022 e devolvia uma rentabilidade com ar de resposta. A promessa era
impossível de cumprir, porque quem a devia cumprir nunca via um buraco.

Agora há folga de **dez dias** — que chega para qualquer fim de semana ou Natal
com feriados a calhar mal, e é curta para qualquer outra coisa.

**Dois pontos no mesmo dia não são um troço.** Numa venda TOTAL executada 0,1%
abaixo do fecho, o valor final é zero e a base fica esse resto de cêntimos: a TWR
dava **-100%** num investimento que quase duplicou. De que lado do fecho caía a
execução decidia entre +100% e -100% — e a app tem uma prateleira inteira para
estas posições ("Já fechadas").

Sem tempo não há rentabilidade: um troço de duração zero passa a contar como
neutro. É exactamente o que o cabeçalho do `positionValuePoints` já dizia que o
segundo ponto faz — "nunca inventa rentabilidade" — e que não fazia.

---

## Sessão de 2026-08-10/11

### A subunidade das bolsas lê-se antes de qualquer maiúscula

O Yahoo distingue `GBp` (pence) de `GBP` (libras) pela caixa de uma letra, e são
duas moedas com um fator de cem entre elas. Qualquer normalização feita antes da
comparação apaga a distinção — foi o que aconteceu. A conversão vive numa função
própria (`moedaDeSubunidade`) para que uma arrumação inocente noutro sítio não a
volte a apagar, e há um teste que falha se alguém normalizar primeiro.

Cobrem-se `GBp`/`GBX` (Londres), `ZAc` (Joanesburgo) e `ILA` (Telavive).

### Uma cache de cotações pode ser apagada; nada mais nesta app pode

A migração 0033 apaga linhas. É defensável **só** porque as cotações são uma
cache derivada de uma fonte pública: nada ali é dado de ninguém e tudo se vai
buscar outra vez sozinho. É a única tabela de que isso se pode dizer, e o
raciocínio não se estende a mais nenhuma.

### As notas internas separam-se por função, nunca por bandeira

`listTicketMessagesPublicas` e `listTicketMessagesTodas`, em vez de uma leitura
com `incluirInternas`. Uma bandeira é igual a duas funções até ao dia em que
alguém a passa ao contrário — e aí a nota já foi lida e não há como desfazer. A
função que serve o utilizador não sabe ler a coluna.

Pela mesma razão, uma nota interna não mexe no `updated_at`: se mexesse, o fio
do utilizador denunciava a hora exacta em que alguém escreveu o que ele não pode
ler.

### O crescimento mede-se por `created_at`, nunca por `transaction_date`

Quem importa dois anos de extrato numa noite fez **uma noite** de uso. Uma
curva construída sobre a data da transação desenharia dois anos de atividade a
partir dessa noite — o gráfico mais bonito e mais falso desta app.

### Percentagens só acima de cinco na base

"100% de retenção" com um ambiente elegível é verdade e não quer dizer nada.
Abaixo de cinco mostra-se "2 de 3", que ninguém confunde com uma tendência.
(`MINIMO_PARA_PERCENTAGEM`, em `domain/plataforma.ts`.)

### Uma mediana robusta compara-se com todos, incluindo o próprio

Na primeira versão do detetor de movimentos implausíveis, a mediana excluía o
movimento que estava a ser julgado, "para a referência não ser puxada pelo
erro". Esse raciocínio vale para uma média e é ao contrário numa mediana:
excluir o próprio reduzia a amostra para dois, e o ponto médio de dois é a média
deles. O resultado era acusar os dois movimentos certos e ilibar o errado.

### A Euribor vem do BCE, e é a média do mês

O dono da Euribor é o EMMI, que a publica com licença e sem API aberta. O BCE
republica as séries de graça, sem chave, e é oficial. Usa-se a média do período
(`HSTA`) e não o fixing do dia, porque é a média que os contratos portugueses
usam para a revisão — o valor de hoje daria um número parecido o suficiente para
ninguém reparar e diferente o suficiente para a prestação não bater certo.

### Duas contas diferentes não podem ter o mesmo nome

No resumo, "investido" era o custo das posições abertas; em Ativos, todo o
dinheiro que alguma vez entrou. Ambos corretos, nomes iguais, valores muito
diferentes — e quem lê conclui que um dos ecrãs está avariado. Passaram a
chamar-se "custo das posições abertas" e "dinheiro que entrou".

### A margem de segurança aplica-se antes de comparar com o preço

É a diferença entre "vale 492 e custa 410, está barata" e "só compro abaixo de
344, e custa 410, logo não". A margem não é um ajuste cosmético no fim: é o
preço a que se está disposto a comprar, e é esse que entra na média pesada e no
veredicto. Aplicá-la depois transformava-a num número decorativo ao lado de uma
decisão que já tinha sido tomada sem ela.

### As probabilidades dos cenários têm de somar cem, e não se normalizam

Com 25/50/20 a média pesada sai 5% abaixo da verdadeira e nada no ecrã denuncia
que faltavam cinco pontos. Normalizar sozinho resolvia a aritmética e devolvia
um número que ninguém pediu — com o engano de quem escreveu escondido lá dentro.
Recusa-se, e diz-se quanto somam.

### Um DCF projeta em duas fases, não numa

Uma empresa que cresce 15% ao ano não cresce 15% durante dez anos: a
concorrência chega, a base fica grande, o mercado satura. Projetar a taxa dos
primeiros anos até ao fim inflaciona o valor terminal — que já é a maior parte
do resultado — e o exagero entra onde menos se vê. Por omissão a segunda fase
começa a meio da projeção.

### Um estudo de avaliação guarda o resultado, e não só os pressupostos

Recalcular na leitura parecia mais limpo: menos colunas, nenhuma hipótese de o
número guardado divergir da fórmula. Tinha uma consequência séria — no dia em
que a fórmula mudasse, um valor que já serviu de base a uma compra mudava de
opinião retroactivamente. Uma decisão tomada com 344 tem de continuar a poder
ser lida com 344. Guardam-se os dois, e reavaliar cria uma linha nova em vez de
reescrever a antiga: ver "valia 344 em fevereiro e 410 em agosto" é metade do
valor de um funil.

### Sem denominador positivo não há rácio

Uma empresa com capital próprio negativo tem um ROE que, calculado à letra, sai
positivo e enorme — e é exactamente ao contrário do que significa. A empresa
mais endividada da lista apareceria com o melhor retorno. Onde o denominador não
é positivo devolve-se `null`, e o ecrã escreve "—". É o mesmo princípio de "sem
taxa de câmbio não se grava preço nenhum".

### Os cenários partem do historial da empresa, e dizem-no

Nascer em 6/9/15% era a app a ter uma opinião sobre uma empresa que não conhece.
Agora partem do crescimento composto do fluxo livre dos exercícios que a fonte
trouxe, travado nos 20% — acima disso é quase sempre uma base pequena a crescer,
não um regime — com a segunda fase sempre mais lenta do que a primeira, que é a
única coisa de que se tem a certeza. O ecrã diz de onde veio o número e os
campos continuam todos editáveis: um pressuposto sem origem visível é uma
opinião da app com ar de conta.

### Uma página do App Router não exporta mais nada

O `EstadoChip` estava exportado de `ajuda/page.tsx` e a página do detalhe
importava-o de lá. Passava no `tsc`, passava no `lint`, e só rebentava no
`next build` — com "not a valid Page export field", numa página que ninguém
tinha tocado. Componentes partilhados vivem em `components/`.

### Registos repetidos juntam-se pelo símbolo, nunca pelo nome

A importação cria dois investimentos quando a corretora escreve "ADR ON
UNILEVER" num extrato e "ADR ON UNILEVER PLC" no seguinte. Juntá-los por
parecença de nomes apanhava esse caso — e apanhava também "XPHYTO THERAPEUTICS"
e "XPHYTO THERAPEUTICS - NON TRADEABLE", que são coisas diferentes: uma negoceia
e a outra não. Parecença de nomes é um palpite sobre dinheiro de alguém; dois
registos com `ul.us` são um facto.

### Uma arrumação de catálogo não pode destruir ficheiros

`asset_attachments.asset_id` tem `on delete cascade`. Apagar o registo repetido
antes de passar os anexos levava com ele os documentos que alguém carregou — sem
erro nenhum, porque do ponto de vista da base de dados correu tudo bem. A ordem
é: mover movimentos, mover anexos, e só então apagar. E move-se a linha, nunca o
ficheiro: é o `storage_path` gravado que manda na leitura, e o id do bem que lá
aparece é só o sítio onde ele calhou nascer.

### Movimentos iguais depois de uma fusão dizem-se, não se apagam

Um registo repetido é um erro de catalogação, não de dinheiro: as compras
aconteceram todas. Se depois de juntos ficarem dois movimentos com a mesma
assinatura, isso é dito e fica para alguém decidir — apagar um por dedução
própria é apagar uma compra a sério que por acaso se parece com outra.

### Um campo que o `update` não lê é pior do que um nome de coluna errado

O `updateAssetTrade` não mapeava o `assetId`. Um nome de coluna errado faz o
PostgREST recusar a escrita inteira e alguém repara; um campo esquecido corre
sem erro nenhum e não faz nada. A fusão de dois registos anunciava "movi 12
movimentos" com os doze exactamente onde estavam. O `MockRepository` não podia
apanhar isto — faz `{ ...trade, ...patch }` e aceita tudo o que lhe dêem — por
isso o teste é sobre o texto do repositório (`colunas.test.ts`), a confrontar os
campos da interface com os que o método trata.

### O símbolo interno não é o símbolo da fonte

`googl.us` é a convenção desta app e não existe em bolsa nenhuma. As cotações já
traduziam com `forSource`; as contas pediam o símbolo em cru e levavam 404 em
tudo — e um 404 lê-se como "esta empresa não existe", quando o que não existia
era o nome que lhe estávamos a chamar. O construtor do endereço vive no domínio
por causa disso: para haver um teste que confirme que a tradução acontece antes
de o pedido sair.

### Ou o estudo está inteiro, ou não existe

O funil passou a aceitar empresas sem DCF, o que obrigou a relaxar as colunas dos
pressupostos. O que **não** se relaxou foi a relação entre eles: há um `check` a
garantir que ou estão todos preenchidos ou nenhum está. Sem isso ficava-se com
meio estudo — um preço ponderado que sobrevive à remoção do fluxo de caixa que o
produziu, e fica no ecrã como um número que ninguém consegue explicar.

### A idade que conta é a do estudo, não a da entrada no funil

Uma empresa apontada há um ano e ainda por ler não tem pressupostos a envelhecer:
não tem pressupostos nenhuns. Marcá-la de velha mandava rever um estudo que nunca
existiu — e a seguir ninguém acreditaria no aviso quando ele fosse a sério. São
duas datas e duas colunas.

### A IA lê documentos e escreve prosa; não devolve números para o cálculo

É a regra da importação ("a IA escolhe colunas, não lê dados") aplicada onde a
tentação é maior: seria fácil pedir-lhe o fluxo de caixa livre do relatório e
enfiá-lo no DCF, e nesse dia o valor por ação passava a depender de um modelo a
ler um PDF. O resumo tem data e diz de que ficheiros saiu, e tem uma secção
obrigatória do que fica por saber — um resumo que dá tudo por esclarecido é pior
do que nenhum.

### Um gráfico do historial mostra uma métrica de cada vez

Sobrepor ROCE, margens e fluxo livre no mesmo eixo era juntar percentagens com
milhares de milhões e pôr o desenho a mentir sobre a escala. Cada uma tem o seu
eixo e trocar custa um clique. O eixo não começa em zero — uma margem entre 30% e
33% desenhada do zero é uma linha reta que esconde a única coisa que interessa —
e por isso os valores vão escritos, para o corte não exagerar o movimento sem
aviso.

### Um aviso que aparece sempre deixa de ser um aviso

Se a carteira mostrasse a próxima apresentação de resultados de todas as
posições o ano inteiro, ao fim de uma semana ninguém lia aquela zona do ecrã — e
no dia em que uma data interessasse, já estava invisível. Por isso os prazos são
diferentes por tipo e curtos: catorze dias para resultados (o que dá para reler o
estudo antes de a empresa o invalidar), sete para a data-ex, cinco para o
pagamento. E uma data que passou há menos de três dias continua a aparecer,
porque explica o salto na cotação que alguém está a olhar hoje.

### A data-ex é a única destas datas com consequência

Quem quiser o dividendo tem de ter as ações antes desse dia: passou, perdeu-se, e
não há como voltar atrás. Nas outras duas não há nada a decidir — há só a saber.
É por isso que vem destacada e as outras não.

### Não se distingue "não paga dividendo" de "ainda não perguntei" sem um carimbo

Sem a coluna que diz quando é que as datas foram consultadas, o ecrã dizia a
mesma coisa nos dois casos: nada. Com ela, um investimento que nunca foi
consultado aparece como tal, e a app sabe quando voltar a ir. E o carimbo só se
escreve quando a consulta corre — senão uma fonte em baixo adiava a tentativa
seguinte por uma semana.

### Uma falha ao ir buscar datas não apaga as que já se sabiam

Escrever `null` por cima quando a fonte não responde transformava um problema de
rede numa empresa que aparentemente deixou de pagar dividendo. Fica a data
anterior, com a idade que tem.

---

## Foco do património por tipo de bem (2026-08-12)

### O património de quem tem casa é quase todo casa

Uma carteira de investimentos a subir 8% num ano desaparece no desenho ao lado de
um imóvel que vale cinco vezes mais e não se mexe. A pergunta "como está a correr
a parte investida?" ficava sem resposta num ecrã que tem os dados todos para a
dar. As caixas do topo escolhem o que se conta — Tudo, Investimentos, Imóveis,
Liquidez — e o foco vai no endereço (`?foco=investimento`), por isso sobrevive a
um recarregamento e funciona sem JavaScript.

Escolheu-se **ligações e não botões com estado no cliente**: um seletor de
cliente teria de voltar ao servidor à mesma para refazer as contas — ganhava-se
uma animação e perdia-se o endereço.

### O filtro muda o que se desenha e nunca o que se grava

A fotografia diária do património continua a ser a do **património inteiro**,
mesmo quando o ecrã está a mostrar só os investimentos. Gravar o líquido de uma
vista filtrada escrevia no passado que naquele dia a pessoa não tinha casa — e,
ao contrário das despesas, um saldo não se reconstrói depois.

### Um ponto que não sabe repartir-se sai do gráfico

As fotografias guardam o valor por tipo de bem num `jsonb`, mas as antigas — e
todas as reconstruídas — só guardaram o total. Repartir esse total pelas
proporções de hoje desenharia uma linha de investimentos que nunca existiu, com
o ar de facto que uma linha desenhada tem. O ponto desaparece e o ecrã diz
quantos ficaram de fora, para o buraco se explicar em vez de se esconder.

### As dívidas só descontam nos focos que as incluem

Em "Imóveis" o crédito à habitação entra, porque o que interessa a quem escolhe
esse foco é o líquido da casa e não o valor bruto de uma casa hipotecada. Em
"Investimentos" não entra: não há ali nada que ele financie, e subtraí-lo dava um
"líquido" negativo que não corresponde a decisão nenhuma. Os juros do ano seguem
a mesma regra — "Pagas 4 200 € de juros" por baixo de um total de investimentos
lia-se como se os juros saíssem daquele número.

### Cada caixa mostra o seu próprio número

Uma fila de rótulos obrigava a carregar em cada um para descobrir quanto vale.
Com o valor à vista, a comparação que motiva o filtro — quanto disto é casa e
quanto é carteira — faz-se sem carregar em nada. E uma vista parcial anuncia-se:
quem chega por um link já com foco não tem como saber que está a ver uma parte.

---

## Séries temporais no DCF (2026-08-12)

### Uma tabela com dez indicadores não mostra uma direcção

O que se procura no historial de uma empresa não é um número, é uma direcção: a
margem está a abrir ou a fechar, a dívida está a subir ou a descer. Numa tabela
isso lê-se, mas só por quem se lembrar de percorrer a linha com os olhos e
guardar quatro números de cabeça. Por isso cada indicador ganhou o seu desenho ao
lado dos seus números, agrupado por tema (crescimento, rentabilidade, solidez) e
em acordeão para caber num telemóvel.

Os números vão **ao lado** do desenho e não em vez dele: uma linha com o eixo
cortado exagera o movimento, e uma tendência de "+3 pontos" pode ser um degrau ou
um regresso ao que era.

### Os trimestres vieram no mesmo pedido, e não decidem nada

O `quoteSummary` aceita os módulos trimestrais na mesma lista, sem custo extra.
Quatro pontos anuais escondem uma margem que virou há dois trimestres, e essa
resolução faz falta. Mas **as médias, o CAGR e os cenários continuam a sair só
dos exercícios anuais**: um trimestre comparado com o anterior mede sazonalidade
tanto como desempenho, e um trimestre de Natal a seguir a um de janeiro "cresce"
sozinho. Quem escolhe a vista trimestral é avisado disso por palavras.

### Os trimestres são rotulados pelo mês em que acabam, não por "T1…T4"

O ano fiscal da Apple acaba em setembro e o primeiro trimestre dela fecha em
dezembro. Chamar-lhe "T1" quando o calendário diz T4, ou "T4" quando a empresa
lhe chama T1, engana das duas maneiras. O mês de fecho não precisa de convenção
nenhuma para se ler.

### Uma percentagem só quando o ponto de partida é positivo

É a mesma recusa que o histórico do património já faz com um líquido negativo.
Uma margem que vai de −5% para 3% melhorou oito pontos; a divisão dá −160%, com o
sinal ao contrário do que aconteceu, e uma percentagem não se confere contra
nada. Nesses casos mostra-se a variação em pontos percentuais.

### Um leitor de períodos, não dois

O anual e o trimestral passam pela mesma função. Uma segunda cópia significava
que, no dia em que o `capitalExpenditures` mudasse de sinal ou o Yahoo trocasse
um nome de campo, só uma das séries ficava certa — e as duas continuavam a
desenhar-se com o mesmo ar de facto. A única diferença é a chave: o anual indexa
por ano (para juntar um exercício reexpresso), o trimestral por data (senão os
quatro trimestres de 2025 colapsam num ponto só).

---

## A carteira por setor (2026-08-12)

### O setor fica no bem, e não numa tabela de setores

É um texto por investimento que muda de década a década. Uma tabela de referência
com chave estrangeira obrigava a uma junção em todas as leituras da carteira para
devolver uma palavra, e a inventar uma linha nova sempre que a fonte estreasse um
nome. Agrupar por texto é o que esta app já faz com as categorias de despesa.

### A tradução vive no código, não na base de dados

Guarda-se o nome como a fonte lhe chama, em inglês, e traduz-se ao ler. Assim um
nome que o Yahoo estreie **chega ao ecrã como está** em vez de cair numa fatia
"Outros" — que juntaria numa fatia só coisas sem nada a ver umas com as outras,
sem ninguém dar por isso.

### "Por classificar" é um grupo com nome e nunca uma fatia calada

Se metade da carteira não tem setor, a percentagem do maior setor está errada por
metade. Um gráfico que só desenhe os classificados esconde exactamente isso e
apresenta uma conta incompleta como se fosse a conta. Os que faltam contam para o
total, aparecem na lista, e o ecrã diz quantos são e que percentagem do valor
representam.

### Com nada classificado não há maior setor nenhum

O caso de uma carteira acabada de importar. "O maior é *Por classificar*, com
100%" apresentava a ausência de um dado como uma conclusão sobre a carteira. A
ordenação por si só não chegava para isto — foi preciso um teste que falhasse
contra a versão que só ordenava, e a primeira tentativa de o escrever passava dos
dois lados, o que quer dizer que não testava nada.

### Duas leituras de peso, e não uma

O peso no valor de hoje diz onde é que o dinheiro está; o peso no dinheiro que
entrou diz onde é que se decidiu pô-lo. Um setor que subiu muito ocupa mais peso
do que alguma vez se decidiu dar-lhe — é assim que uma concentração aparece sem
ninguém a ter escolhido. A segunda linha só se mostra quando as duas se afastam
três pontos ou mais: iguais, é ruído.

### As empresas ordenam-se pelo dinheiro que entrou, não pelo valor

A pergunta é sobre as decisões que se tomaram, e a maior posição de hoje pode ser
a que menos dinheiro levou.

### Um ETF sem setor na fonte não é uma falha

A fonte não classifica fundos por setor. Chamar-lhe erro mandava alguém procurar
um problema que não existe, por isso a mensagem separa "não deu resposta"
(repete-se à próxima) de "respondeu que não sabe" (não se repete). É o
`profile_at` que permite a distinção — e ele só se escreve quando a consulta
corre, porque carimbá-lo numa falha de rede adiava a tentativa seguinte sem nada
ter sido perguntado.

### Um lote de cada vez

Uma carteira com cinquenta investimentos sem setor dava cinquenta idas à rede em
série dentro de uma função com tempo limitado — que estoirava o prazo e não
gravava nada. Doze por passagem, com o número que falta no próprio botão.


---

## O gráfico que esteve vazio com os dados certos por baixo (2026-08-13)

### O que aconteceu

As barras do "Registos criados por mês" eram um `<span>` com `height` em
percentagem, dentro de um `<li>` que era item de um `flex` com `items-end`. Com
`items-end` o item **encolhe para a altura do conteúdo**, e uma percentagem de
uma altura `auto` resolve para zero. As doze barras tinham zero pixéis. A base de
dados tinha 191 despesas, 51 ativos e 137 movimentos, todos com `created_at`
preenchido — o gráfico estava a desenhar os números certos com altura nenhuma.

### Porque é que nada apanhou isto

O `tsc` compila, o `lint` passa, o `build` compila, e os 1013 testes não tocam em
CSS — não há DOM nos testes desta app. Um gráfico vazio e um gráfico avariado
eram **indistinguíveis** a olho: os dois mostram uma caixa com rótulos de meses e
nada por cima.

### As duas defesas que ficaram

1. **A altura vai ao item que tem altura definida**, nunca a um filho de um item
   encolhido. O `items-end` saiu; o alinhamento ao fundo faz-se com `justify-end`
   dentro de cada coluna, que não mexe na altura do item.
2. **Os valores vão escritos por cima das barras.** Se o desenho voltar a
   colapsar, os números continuam à vista e a avaria denuncia-se sozinha. É a
   defesa que interessa mesmo: a primeira corrige este bug, a segunda torna
   impossível o próximo passar despercebido durante semanas.

O mesmo cuidado está na barra das funcionalidades: é largura no elemento de fora,
e não altura percentual dentro de um item de flex.

---

## A consola da plataforma em acordeão (2026-08-13)

### Oito blocos empilhados obrigam a percorrer sete para chegar a um

Numa consola de administração procura-se quase sempre **uma** coisa. A página
crescia a cada sessão e para chegar aos ambientes passava-se por cima dos
números, das contas, do que é usado e dos bancos aprendidos.

`<details>` e não estado no cliente: abre sem JavaScript, a pesquisa da página
encontra texto lá dentro, e não há nada para hidratar numa página já servida por
inteiro.

### Cada cabeçalho traz o número que se procuraria lá dentro

Um acordeão em que todos os cabeçalhos se parecem obriga a abrir todos para
encontrar um — que é exactamente o problema que ele veio resolver.

### O que fica de fora do acordeão, e porquê

Os **KPIs de topo**, porque uma consola em que o primeiro olhar custa um clique
não serve para o primeiro olhar. E os **avisos** do que não foi possível ler:
um aviso dentro de uma secção fechada não é um aviso — quem olha para os números
de cima não tem como saber que um deles veio a menos. (Este bloco chegou a
perder-se na reorganização, apagado com as secções que substituiu. Foi reposto.)

### "Registos ao todo" ao lado de "Despesas"

A consola dizia "191 despesas" numa app que já tem património, movimentos,
rendimentos e metas. O número mais visível era o de uma parte só e lia-se como o
tamanho do todo. Fica `null` — e não zero — quando a leitura das despesas falha:
um total mais pequeno do que o real com ar de facto é pior do que um traço.

### A adoção mede-se em ambientes, não em registos

Uma funcionalidade com dez mil linhas num único ambiente e outra com dez linhas
em cinco ambientes: a segunda é a que está a pegar. Ordenar por registos punha a
primeira em primeiro lugar e mandava manter o que só uma pessoa usa.

---

## Um lote não se faz como se faz um pedido (2026-08-13)

### O que aconteceu

O botão "Ir buscar setores" foi carregado e **não gravou nada**. Nem meio, nem
um: zero linhas. Na base de dados, quarenta investimentos com símbolo e nenhum
com `profile_at` — ou seja, nem sequer foram perguntados.

A causa: `atualizarSetores` percorria doze investimentos chamando
`buscarFundamentais` exactamente como o botão de **uma** empresa o chama. E essa
função, por chamada, abre uma **sessão anónima nova** no Yahoo (mais dois
pedidos), tenta **todas as formas do ticker** (até quatro) e dá **doze segundos**
de tolerância a cada pedido. Doze investimentos davam mais de cem chamadas e
minutos de espera dentro de uma função que vive segundos. Morria antes da
primeira escrita.

### Uma função de rede não é reutilizável em lote só porque compila

Os parâmetros que fazem sentido para um pedido — tolerância generosa, tentar
todas as variantes, sessão fresca — são exactamente os que rebentam um lote. A
assinatura não muda, o `tsc` não se queixa, e o comportamento passa de bom a
inutilizável. `buscarFundamentais` passou a aceitar sessão, tolerância e número
de variantes; o lote passa os seus, o botão de uma empresa continua a não passar
nada.

### Um trabalho em lote tem de caber no tempo que tem

E quando não cabe, **acaba por decisão própria**: grava o que fez e diz o que
ficou. O relógio verifica-se **antes** de começar mais um — entrar num pedido de
cinco segundos com dois de orçamento é como não ter relógio. O oposto é ser
interrompido a meio e não deixar nem escrita nem explicação, que foi o que
aconteceu.

### O que ficou por fazer vai sempre na mensagem

Um lote que trata oito de quarenta e diz só "8 com setor" lê-se como "está
tratado" — e quem lê fica a olhar para uma tabela meia por classificar sem
perceber que só tem de carregar outra vez.

E `consultados` deixou de ser o comprimento da lista: com o relógio a cortar a
passagem a meio, contava como consultados os que nunca chegaram a ser
perguntados.

### O teste passou dos dois lados à primeira, e não valia nada

O mock do Yahoo devolvia 200 logo à primeira tentativa. Nesse caminho a sessão
nunca é pedida — por isso a versão avariada também abria uma sessão só, e o teste
passava contra ela. Só depois de o mock responder **401 sem `crumb`**, como o
Yahoo a sério responde, é que o teste começou a medir alguma coisa: nove sessões
contra uma. É a regra do `CLAUDE.md` a apanhar-me a mim.

### A mesma correção foi aplicada às datas de mercado

Tinham o mesmo padrão e a mesma bomba-relógio, só que disfarçada: correm uma vez
por semana por símbolo, por isso raramente juntavam uma dúzia de cada vez.

---

## A lentidão do património, a sério desta vez (2026-08-14)

A ronda anterior tirou o que era visível — a espera sem aviso, o tecto de dez
segundos nas cotações, as leituras em fila indiana — e **continuou lento**. O que
faltava não estava no componente: estava na reconstrução do histórico.

### Cinquenta viagens à base de dados, uma por investimento

`reconstruirDoPassado` pedia as cotações **dentro de um ciclo sobre os bens**,
uma chamada por símbolo, cada uma a trazer o histórico inteiro desse símbolo. Com
meia centena de investimentos são cinquenta idas em série — sempre que alguém
abre o resumo do património.

É a **segunda vez que esta app aprende isto na mesma tabela**. O
`refreshStalePrices` já tinha passado de três consultas por símbolo para uma só,
com o comentário a explicar porquê; a reconstrução ficou de fora e ninguém
reparou, porque a página acabava por abrir. Agora há um `listQuotesFor` — uma
consulta para todos os símbolos, paginada — e um teste que **conta viagens**, que
é a única coisa que impede a terceira vez.

### Uma correção com um buraco é uma correção pela metade

O tecto de tempo da visita foi posto nas cotações da carteira e **não** nas
linhas dos índices do gráfico, que chamam a mesma função de outro sítio. Ficaram
com os dez segundos por fonte que são para quem carregou num botão — dentro do
desenho de uma página. Corrigir um caminho e deixar o gémeo aberto é o género de
coisa que só se apanha à segunda queixa.

### O que não era, e vale a pena ter escrito

O INE **não** era o problema, apesar dos vinte segundos de tolerância que tem: a
estimativa desiste antes de ir à rede quando nenhum imóvel tem `price_ref_geocod`
preenchido, que é o caso. Ter ido confirmar isso poupou uma correção inútil num
sítio inocente — e deixa o aviso de pé para quando alguém preencher esse campo,
porque aí os vinte segundos passam a contar.
## Avaliação de empresas (DCF) — 2026-08-11

- **Página nova em `/patrimonio/avaliacao`.** A página do screenshot não existia
  em nenhuma branch do repositório, pelo que foi construída de raiz seguindo o
  desenho mostrado e a folha de Excel fornecida.
- **Motor de cálculo puro em `src/lib/domain/valuation.ts`**, sem I/O, com
  testes que fixam os números **contra a folha original** (FCF 5,564 mM,
  0,283 mM de ações: valor por ação 405,69 / 492,17 / 674,60, ponderado 361,31).
  Se a folha e a app divergirem, o teste falha — é a app que está errada.
- **Fonte de dados: Yahoo Finance via `yahoo-finance2`.** Escolhida por não
  exigir chave nem subscrição, para a app funcionar imediatamente.
  Alternativas consideradas: Financial Modeling Prep (única com estimativas de
  analistas e médias de setor numa só fonte, mas o histórico completo é pago) e
  Alpha Vantage (25 pedidos por dia, insuficiente para navegar entre empresas).
  *Como reverter:* `src/lib/market/index.ts` tem uma única linha a escolher o
  fornecedor; trocar implica escrever um novo ficheiro que cumpra
  `MarketDataProvider` e mudar essa linha.
- **Campo que a fonte não dá fica `null` e é listado ao utilizador**, nunca
  preenchido por estimativa: um número inventado aqui propaga-se para o valor
  por ação e para a decisão de compra.
- **O endpoint `/api/market/[symbol]` fica atrás da sessão**, como o resto da
  app — aberto seria um proxy gratuito para a API externa.
- **A ponderação usa os preços com margem de segurança**, não o valor
  intrínseco, porque é esse o preço a que faz sentido comprar (é também o que a
  folha faz).
- **Probabilidades que não somam 100% são normalizadas** em vez de distorcerem
  o resultado, com aviso visível.
- **Nada é gravado na base de dados.** A página é uma folha de rascunho, como
  diz o próprio texto. Persistir avaliações implicaria decidir modelo de dados e
  RLS — fica para quando o Tiago disser que quer histórico de avaliações.

### Por verificar
- A recolha de dados **não foi testada contra a API real**: o ambiente de
  desenvolvimento bloqueia o acesso à rede externa. O código trata todos os
  campos como opcionais, mas a primeira execução com rede aberta pode revelar
  nomes de campos diferentes do esperado.

## A landing dizia metade do que a app faz — 2026-08-12

A página pública tinha ficado parada na primeira versão do produto: vendia um
substituto do Tricount e mais nada. Entretanto a app passou a ter importação de
extratos e de ficheiros de corretora, rendimentos e taxa de poupança, análise
por categoria e comerciante, património líquido com dívidas amortizadas,
carteira com rentabilidade (TIR e TWR) comparada com um ETF em euros,
calculadora FIRE e avaliação de empresas por DCF. Nada disto estava escrito.

Pior do que omitir: a secção "A caminho" listava como futuro **coisas que já
funcionam**. Relatórios por categoria e por mês, importação de bancos e anexar
recibos estavam todos feitos e prometidos como se não estivessem. Uma landing
que subestima o produto assim custa duas vezes — não convence quem chega e faz
duvidar quem já usa.

Decisões tomadas:

- **A promessa passa a ser o arco todo**, do dividir a conta ao património.
  O título antigo ("as contas da casa, finalmente claras") só cobria o
  princípio; passa a "as contas da casa, e o que vem a seguir".
- **Uma secção nova, "O que faz", com as seis áreas** (dividir, importar,
  rendimentos, análise, património, FIRE), em vez de as esconder atrás de uma
  lista de vantagens.
- **Os investimentos ganham secção própria.** É a parte mais subestimada e a
  mais difícil de explicar: as três perguntas (quanto rendeu o meu dinheiro,
  o investimento foi bom, e se tivesse comprado o índice) fazem mais pelo
  produto do que qualquer lista de funcionalidades.
- **A "A caminho" só tem o que ainda não existe:** mais bancos e corretoras,
  offline, símbolo de bolsa a partir do nome, SSO, lembretes de acerto e
  aprender a divisão pelo histórico. Cada linha foi verificada contra o código
  antes de ficar ou sair.
- **Nada de números inventados.** Sem contagens de utilizadores, sem
  testemunhos, sem "milhares de pessoas". A app é jovem e a página diz o que
  faz, não o que gostava de ser.
- A postura de acesso **mantém-se**: "quero saber mais" e o formulário de
  contacto, não registo aberto. Ligar o registo é decisão por tomar
  (ver `RETOMAR.md`), e a página não a antecipa.

## Seed: património, investimentos e rendimentos — 2026-08-12

O modo mock tinha despesas mas nada mais: `assets`, `asset_trades`, `quotes` e
`income` arrancavam vazios. Metade da app (património, dívidas, rentabilidade,
comparação com o índice, FIRE e taxa de poupança) abria em estado vazio, o que
contraria o entregável "app navegável de ponta a ponta" e não serve para tirar
capturas de ecrã.

Decisões tomadas:

- **As cotações são geradas, não escritas à mão.** Uma tendência anual suave com
  uma ondulação sinusoidal (`SeriesSpec` em `seed-data.ts`) dá centenas de
  fechos diários a partir de cinco números por símbolo. Escrever fechos à mão
  seria impossível de manter e de ler, e a app precisa mesmo do **histórico**,
  não só do preço de hoje, para a comparação com o índice funcionar.
- **Determinismo total**, como já acontecia nas despesas: nenhuma chamada a
  `Math.random` nem a `new Date()`. Os mesmos dados saem sempre iguais, que é o
  que as capturas de ecrã e os testes exigem.
- **As séries dos índices de referência (`sxr8.de`, `eunl.de`) também são
  semeadas.** Sem elas, "e se tivesse ido para o índice?" só funcionaria com
  rede. As séries acabam em 2026-08-11, um dia antes da data em que o exemplo
  foi montado, para `isStale` as considerar frescas e a página não ir à fonte.
- **A ação americana fica em dólares.** É o caso que exercita o câmbio de ponta
  a ponta (movimentos com `currency`/`fxRate`, cotação em USD). Sem rede, a
  conversão do preço atual não é possível e o ecrã diz isso — que é o
  comportamento correto: nunca se grava uma cotação em dólares como se fossem
  euros (ver migração 0019).
- **O ambiente de exemplo passa a ter `plan: "full"`.** É o ambiente dos donos
  da allow-list, e é o que `planForNewSpace` já lhes dá. Sem isto o exemplo
  arrancava com 98 das 100 despesas do plano gratuito gastas: a app abria com
  um aviso de limite e sem espaço para registar seja o que for.
- **Limitação conhecida:** a taxa de poupança sai alta (85–96%) porque o
  histórico de despesas de exemplo só tem as despesas partilhadas (≈365 €/mês)
  e o rendimento semeado são ordenados inteiros. Pela mesma razão, o número
  FIRE sugerido pelas despesas (109 491 €) é baixo e o progresso dá ~49%.
  Corrigir isto obriga a alargar o histórico de despesas (prestação do crédito,
  seguros, comunicações, gastos individuais), que fica por fazer.

## A landing tinha de deixar de parecer um documento — 2026-08-12

Depois de a página passar a contar a app toda, o Tiago apontou quatro coisas:
os travessões longos, a falta de capturas de ecrã, uma citação que dava a
entender que há discussões em casa, e a página estar "estanque", sem vida nem
movimento, com linhas separadoras a mais entre blocos.

### As linhas

A grelha de cartões era `gap-px` sobre `bg-hair`, o que desenha uma
quadrícula completa, e as secções alternavam com `border-y border-hair`. Cinco
grelhas e cinco barras horizontais: a página lia-se como uma folha de cálculo.

Regra que fica: **na landing, uma linha só existe se significar sequência, se
estiver a desenhar-se, ou se for anatomia de um componente** (moldura de
aparelho, campo de formulário, linha de despesa dentro de uma captura).
Divisórias estáticas entre blocos, nenhuma. Dentro da app isto não se aplica:
o `.row` com `border-b` está certo e não se tocou.

Em vez delas:

- **Cartões com contorno na sombra, não na borda** (`.surface`). O fio passa a
  `box-shadow: 0 0 0 1px`, que fica fora da caixa de layout e pode ser bem mais
  fraco do que o `--c-hair`. É o `--c-hair` que dava o aspeto de arame.
- **Lavagens de fundo sem aresta** (`.wash`), com `inset: -6rem 0`: a transição
  de cor acontece fora da secção, por isso não há sítio onde se veja uma linha.
  E só duas na página inteira, senão é uma zebra.
- **Cabeçalho sem borda**, que ganha fundo e sombra ao sair do topo, detetado
  por uma sentinela de 1px observada e não por um ouvinte de `scroll`.

### O movimento

Uma família só: entradas a 620ms com `cubic-bezier(0.16,1,0.3,1)`, percurso de
14px, cascata de 70ms travada ao quarto item, e **uma vez e nunca mais**
(`unobserve` no primeiro disparo). Um observador partilhado por toda a página,
não um por elemento.

O que **não** entrou, e porquê: contadores a subir de zero (numa app de dinheiro
lê-se como slot machine, e o valor é precisamente o que tem de parecer sólido);
parallax; brilho a seguir o rato (não existe no telemóvel, que é o aparelho
principal deste produto); e uma segunda camada de gradiente fixa. Fica só a
deriva de 40s no `body::before` que já existia, e **apenas na landing**
(`body:has([data-landing])`): ninguém quer o fundo a andar por trás de uma
tabela de despesas.

O único momento com JavaScript de propósito é o ecrã do herói, que anda sozinho
uma vez ao fim de 1,8s e depois fica quieto. Demonstra o invariante que mais
custa explicar por palavras: **quem pagou é independente de como se divide**. O
Tiago pagou o jantar inteiro nos dois casos; o que muda é quanto a Clara lhe
deve.

**Armadilha que apanhámos à primeira:** o estado de partida da revelação é
`opacity: 0`, por isso sem JavaScript a página ficava em branco. O `<noscript>`
que a salva tem de ir por `dangerouslySetInnerHTML` e **sem `>` no seletor**: o
React escapa o texto dos filhos, dentro de `<style>` o browser não desfaz o
escape, e um seletor inválido faz cair a regra toda, incluindo a parte boa.
Verificado com o JavaScript desligado, não assumido.

### As capturas de ecrã

- **São a app a sério**, com os dados de exemplo do modo mock. Nunca dados de
  pessoas reais numa página pública.
- **O ecrã é sempre o MESMO tema, a moldura é que muda** (classe `.screen`).
  Poupa metade dos ficheiros e evita o buraco preto de uma captura escura a
  flutuar sobre fundo claro. Sobre qual dos temas, ver a entrada de 13/08.
- **Recorte próprio para telemóvel**: a 390px, um ecrã de 1440px reduzido é um
  borrão cinzento.
- **O herói não é imagem, é HTML.** O maior elemento da primeira vista passa a
  ser texto, fica nítido em qualquer ecrã e permite mexer.
- Orçamento: 90 KB por captura, 500 KB na página. Estamos nos 264 KB.
- `npm run shots` volta a tirá-las todas. Sem isto, a página promete daqui a
  três meses um produto que já não existe.

### O texto

- **Travessões longos, zero.** Vírgula, dois pontos, ponto final ou parênteses.
- A citação do problema passou a ser sobre **o tempo e o trabalho à mão**, não
  sobre discussões: "uma hora ao domingo à noite: abrir o extrato, copiar para a
  folha de cálculo, somar as colunas". O custo destas contas é o serão que
  levam, não a zanga que causam. Pelo mesmo motivo, o cartão "contas partilhadas
  sem discussões" passou a "dividir sem fazer contas".

### Dois bugs apanhados pelo caminho

1. **O middleware barrava as páginas públicas.** `/privacidade`, `/termos` e
   `/recuperar` redirecionavam para o login. As duas primeiras estão no rodapé e
   a Google exige-as acessíveis sem sessão para aprovar o SSO; a terceira é a
   reposição de palavra-chave, que por definição é para quem **não** consegue
   entrar. Também apanhava `/landing/` e o `/icon.svg`, e era isso que deixava a
   landing sem imagens: o otimizador do Next ia buscar o ficheiro e recebia um
   redirecionamento.
2. **O `.env.example` trazia `AUTH_URL="https://rachar.pt"`.** O README manda
   copiá-lo para `.env.local` e arrancar, e com um URL de produção os cookies de
   sessão saem `Secure`, que o browser recusa em `http://localhost`. Ou seja, o
   arranque documentado não dava para entrar na app, e sem erro nenhum: o login
   volta ao login. O `.env.example` passa a trazer o URL local, com os valores
   de produção em comentário ao lado.

## As mesmas regras dentro da app — 2026-08-13

Feita a landing, o Tiago apontou o mesmo problema um nível acima: as linhas
separadoras entre menus, e a app a parecer estanque. Tinha razão, e a app é o
sítio onde isso custa mais, porque é onde se passa o tempo todo.

O que mudou, pela mesma regra da landing (uma linha só existe se for anatomia
de um componente, nunca uma divisória entre blocos):

- **`.card` deixa de ter `border`.** O contorno passa para o `box-shadow`, com
  os mesmos tokens da landing. Um ecrã com oito cartões desenhava oito
  retângulos a cheio. Como a sombra fica fora da caixa de layout, nada se
  desalinhou.
- **Cabeçalho e barra de baixo sem borda.** Ganham fundo e sombra ao sair do
  topo, com a mesma sentinela observada da landing (`[data-sticky]`), que passou
  a ser partilhada pelos dois.
- **Menus suspensos sem fios lá dentro** (`.menu`, `.menu-item`). Separar as
  opções de um menu com linhas era o que mais depressa dava à app o ar de
  formulário antigo. Agora separa-as o ar à volta e o realce ao passar por cima.
- **Pastilhas da secção só com forma quando estão ativas.** Seis pastilhas todas
  contornadas liam-se como uma fila de caixas vazias.
- **A linha da despesa (`.row`) fica.** Numa lista densa de valores é ela que
  diz onde acaba uma linha e começa a outra: isso é anatomia da lista, não uma
  divisória. Ganhou realce ao passar por cima, para a lista responder em vez de
  ser um bloco morto.

E o movimento:

- **Entrada de página a cada navegação.** O App Router mantém o layout e troca
  só os filhos, por isso a animação que lá estava corria uma vez, ao abrir a
  app, e nunca mais. Com uma `key` pelo caminho volta a correr. São 380ms, curto
  de propósito: quem regista despesas passa por aqui dezenas de vezes ao dia.
- **A deriva do fundo passa a valer também dentro da app.** Antes tinha ficado
  só para a landing; com a app a parecer parada, 2,5% em quarenta segundos é o
  suficiente para não parecer uma imagem.
- **A barra de baixo passa a dizer onde se está.** Tinha cinco ícones iguais e
  nenhum estado ativo: a meio de uma navegação não havia forma de saber em que
  secção se estava sem ler o título. Usa a mesma regra do topo (`sectionOf`),
  para os dois menus concordarem, e marca com um ponto, não com um sublinhado.

**As capturas da landing foram refeitas depois disto.** A página mostra a app, a
app mudou de aspeto, e uma landing com capturas de uma versão que já não existe
é exatamente o problema que o `npm run shots` veio resolver. Pelo caminho
percebeu-se que o texto alternativo não pode citar a TIR com decimais: depende
do dia em que a captura é tirada.

### Fora deste trabalho

A consola de administração (`/plataforma`) fica para uma branch do Tiago. O
pedido registado, para quando lá se chegar: mais indicadores em gráfico, secções
em acordeão (indicadores, contas novas, testes de acesso) e tudo dentro da mesma
página. Nota importante que veio da conversa: **um gráfico de registos por mês
tem de sair das datas já gravadas** (`app_users.created_at` e `spaces.created_at`
existem desde a migração inicial), e não de contadores criados de raiz, senão
nasce vazio e esconde tudo o que aconteceu antes de ele existir.

## As capturas passam para o tema de dia — 2026-08-13

A primeira versão fixava o interior das molduras no tema de noite, com o
argumento de que um telemóvel é escuro. O Tiago apontou o que faltava nessa
conta: **a landing é escura por omissão**, e é assim que quase toda a gente lhe
chega. Um ecrã escuro dentro de uma moldura escura sobre uma página escura é uma
mancha que se confunde com o fundo, por muito bem recortada que esteja. Um ecrã
claro salta à vista.

Passa a haver três peças que têm de contar a mesma história, e é fácil
desencontrá-las:

1. `scripts/shots.mjs` tira as capturas com o tema de dia.
2. A classe `.screen` no `globals.css` pinta o interior das molduras com as
   cores do tema de dia. Se ficar no escuro, aparece uma orla preta à volta de
   uma imagem clara.
3. As molduras (`PhoneFrame` e `BrowserFrame`) passam a ser **escuras nos dois
   temas**. Isto não é enfeite: com o ecrã claro lá dentro, na landing clara uma
   moldura clara à volta de um ecrã claro desaparecia, e ficava um retângulo
   branco a flutuar no papel. Com a carcaça escura, o aparelho lê-se como
   aparelho nos dois temas, e é também o que um telemóvel e uma janela de
   browser são de verdade.

**A armadilha, que custou uma volta:** pôr `data-theme="light"` no `<html>` pelo
Playwright não chega. Cada `goto` é um carregamento inteiro, e o script que corre
antes de pintar volta a ler o `localStorage`. A primeira página saía clara e as
seguintes escuras. O tema tem de ser **gravado** (`rachar-tema`), não posto à
mão.

## Tema à escolha, capturas ao contrário, e as frases que se ouvem — 2026-08-13

Três coisas pedidas pelo Tiago, e a terceira mexe com a honestidade da página.

### O visitante escolhe o tema, e as capturas invertem

A landing passa a ter o mesmo botão de tema da app, com a mesma preferência
guardada: quem escolher o tema de dia na página entra na app já com ele.

E as capturas mostram sempre **o contrário** do tema em que o visitante está:
página escura, capturas claras; página clara, capturas escuras. É o que dá
contraste máximo nos dois casos, em vez de escuro sobre escuro (uma mancha que
se confunde com a página) ou branco sobre papel (um retângulo a flutuar).

Isto obriga três peças a contarem a mesma história, e é fácil desencontrá-las:
o `scripts/shots.mjs` tira cada cena nos dois temas (sufixos `-claro` e
`-escuro`, pelo tema **da captura**), a classe `.screen` inverte da mesma
maneira, e o seletor `[data-shot]` esconde a que não serve.

**O peso no disco duplica, o peso de quem visita não.** Uma imagem em
`display: none` com `loading="lazy"` nunca entra na vista e nunca é
transferida. Quem troca de tema paga a outra nesse momento, uma vez. São ~237 KB
por visita, dentro do orçamento de sempre.

### As frases que se ouvem, e o que elas NÃO são

Secção nova, logo a seguir ao problema, com seis frases do género "não sei bem
para onde é que o meu dinheiro está a ir". Duas regras:

1. **Não são testemunhos, e a página diz isso por escrito.** Um testemunho
   inventado é mentira, e numa app que trata do dinheiro das pessoas a mentira
   sai cara. Estas frases não precisam de dono: quem as reconhece, reconhece-as
   por já as ter dito. Assumir isso à frente é mais forte do que fingir
   depoimentos, porque quem lê já desconfia de páginas cheias de caras a sorrir.
2. **Cada frase leva a resposta ao lado.** Identificar-se com um problema sem
   ver a saída deixa a pessoa pior do que estava.

A última é a que interessa: *"Um dia trato disto."* O concorrente desta app não
é o Tricount, é adiar.

### Os nomes dos exemplos passam a André e Maria

Os participantes de exemplo chamavam-se Tiago e Clara, que são os donos da app.
Numa página pública isso dá a entender que se está a ver a casa deles.

**Os ids continuam `tiago`/`clara`** de propósito: são a fonte de verdade na
base de dados de produção (`app_users.id`, `expenses.payer_id`) e renomeá-los
partia as linhas que já lá estão. Só mudam os nomes e os emails dos
participantes de exemplo, que é o que aparece nas capturas.

Fica por resolver, e é irrelevante para a página pública: em modo de exemplo, o
nome da **conta com sessão iniciada** continua a vir do `lib/users.ts` e a dizer
"Tiago". Não aparece em captura nenhuma (o nome vive dentro do menu "Mais", que
está fechado), e mexer nisso era mexer na identidade de produção.

## O ecrã de quem visita não é o ecrã de quem desenha — 2026-08-15

O Tiago abriu a página num Lenovo e o telemóvel do herói ocupava-lhe o ecrã
todo. Não era impressão: era um bug, e mediu-se.

A página foi desenhada e verificada em 1440x900 e 390x844. **Os pontos de corte
do Tailwind só olham para a largura**, e é aí que isto falha: um portátil de
1366x768, ou um 1920 com o escalonamento do Windows a 150% (que dá 1280x720 de
CSS, e é o mais comum nos portáteis Windows), tem largura de desktop e menos 130
a 180 píxeis de altura. Medido antes de mexer:

| Ecrã | Telemóvel do herói | Maior captura |
|---|---|---|
| 1280x720 | **96% da altura** | 79% |
| 1366x768 | 90% | 74% |
| 1440x900 (o que eu tinha testado) | 77% | 63% |

Passa a haver três tamanhos ligados à **altura** disponível, com `min()` e sem
pontos de corte: `.peca-telemovel`, `.peca-telemovel-cena` e `.peca-browser`.
Depois: 62% da altura para o telemóvel e 52% para a maior captura, **em todos
os ecrãs testados**, do 1280x720 ao 1920x1080.

**O ecrã do herói passa a escalar com a moldura.** Com a moldura a encolher e as
letras a ficarem do mesmo tamanho, a 1366x768 o conteúdo saía cortado a meio de
uma frase. Agora é desenhado a 320x692 e escalado por um `ResizeObserver`, como
um telemóvel a sério: muda de tamanho, não de conteúdo.

**A lição, que fica:** verificar uma página em dois tamanhos não é verificar uma
página. A matriz mínima leva alturas curtas com larguras de desktop, porque é o
que a maior parte dos portáteis Windows é depois do escalonamento.

## O que se tira de uma referência que não se pode abrir — 2026-08-15

O Tiago mandou quatro referências do Dribbble. O proxy da rede bloqueia o
Dribbble, por isso **não as consegui abrir**; ele mandou os vídeos, e daí
tiraram-se fotogramas para ver o que era.

Valeu a pena, porque contrariou o que eu teria assumido: **as duas referências
de finanças são páginas CLARAS**, não escuras. E o padrão que se repete nas
quatro é este:

- Um **acento saturado**, usado em pouca coisa (o botão principal, uma ficha).
- **Fichas de interface a flutuar à volta do produto**, de tamanhos diferentes.
- **Números grandes** como âncora visual.
- Muito ar, e tipografia grande e apertada.

O que se adotou, e porquê:

- **O botão principal passa a levar a cor da marca** (`.btn-marca`), em vez do
  branco. A página era a preto e branco com o verde guardado para os números:
  lia-se séria e lia-se apagada. É o mesmo verde de quem recebe dentro da app,
  por isso não se inventou cor nenhuma. Fica só neste botão: uma cor que aparece
  em todo o lado deixa de apontar para alguma coisa.
- **Quatro fichas à volta do telemóvel**, com números do ambiente de exemplo,
  os mesmos das capturas mais abaixo na página. Duas em ecrãs médios, quatro nos
  largos. À primeira tentativa tapavam o ecrã do telemóvel, que é justamente o
  que se quer mostrar: passaram a encostar por fora.
- **Arcos concêntricos** por trás do aparelho, decorativos, para o telemóvel
  deixar de estar sozinho no vazio.
- **Deslocamento ao scroll** nas capturas, por `animation-timeline: view()`:
  corre fora da linha principal e, onde não existe, simplesmente não acontece.
  Sem segundo caminho em JavaScript para manter.

O que **não** se adotou: os números grandes de tração ("2500 utilizadores",
"92%"). São o que dá o ar de página cara, e são exatamente o que esta app ainda
não pode dizer sem mentir. As fichas do herói dão o mesmo ritmo visual com
números que são verdade.

**Por decidir, e é do Tiago:** as duas referências de finanças são claras, e a
landing abre escura. Trocar o tema por omissão é uma decisão de marca, não de
implementação, e o botão de tema já lá está para experimentar as duas.

## A marca, verificada em vez de assumida — 2026-08-15

O Tiago pediu para garantir que o branding se mantém. Auditado contra o que
está escrito neste ficheiro (tema escuro editorial premium, as três fontes,
tokens no `globals.css`, sem travessões, e a landing sem nomes pessoais):

| Regra da marca | Estado |
|---|---|
| Tipografia Space Grotesk + JetBrains Mono + Inter | intacta |
| Tema escuro por omissão | mantido |
| Sem travessões no texto visível | zero na landing |
| A landing não refere nomes pessoais | os exemplos são o André e a Maria |
| O símbolo da marca no cabeçalho e no rodapé | presente |
| Cores e sombras em tokens no `globals.css` | **estava a falhar, corrigido** |

**O que estava a falhar:** as carcaças dos aparelhos das capturas tinham cores
escritas à mão dentro do `Frames.tsx` (`#3a3a40`, `#2a2a30` e afins). Passaram a
tokens `--aparelho-*` no `globals.css`, pela mesma razão que todo o resto da
marca lá vive: uma cor escrita dentro de um ficheiro de React é uma cor que
ninguém encontra no dia em que a marca mudar.

**Uma mudança de marca que é decisão, não descuido:** o verde deixou de estar só
nos números e passa a ser o acento do botão principal da landing. Não é uma cor
nova, é o `--c-credit` que já era o da app, mas é uma promoção de "cor de dado"
a "cor de marca" e fica registada como tal. Fica só nesse botão: uma cor que
aparece em todo o lado deixa de apontar para alguma coisa.

## O azul dos azulejos, o anel de frases, e o modo mock que ficou sem porta — 2026-08-15

Terceira ronda na landing, já com o back end novo integrado (posições fechadas,
comparação por setor). Três mudanças, cada uma com a sua razão.

### A cor da marca deixa de ser o verde e passa a ser o azul de azulejo

O Tiago pediu "aquele azul tradicional dos azulejos do Porto", e tem razão por
uma razão que vai além do gosto: a decisão anterior tinha promovido o
`--c-credit` a cor de botão, e **uma cor que ao mesmo tempo diz "carrega aqui"
e "este número é positivo" acaba por não dizer nenhuma das duas**. Agora:

- `--c-marca` (30 95 168 de noite, 26 82 146 sobre papel) é o azul de FUNDO:
  botão principal, brilho atrás do telemóvel, halo do fundo da página.
- `--c-marca-tinta` é o mesmo azul para ESCREVER: claro no tema escuro
  (122 178 235), escuro no claro. O azulejo é escuro, e escuro sobre o fundo
  de noite dá 3:1 — um acento que só se lê num dos temas é um erro à espera.
- O verde e o vermelho **voltam a ser só dados**: quem recebe, quem deve. A
  ficha "Património líquido" do herói e o traço das respostas às frases
  passaram de verde a azul; o "fica a dever" do telemóvel continua verde,
  porque esse é mesmo um saldo.

### As frases que se ouvem passam a rodar num anel 3D

O Tiago achou a lista "cansativa e monótona", e era: seis frases em coluna são
uma parede — lia-se as duas primeiras e saltava-se o resto. Agora estão num
anel em perspetiva que o scroll faz girar (`view-timeline` + secção alta com
palco `sticky`), com uma paragem em cada frase: a rodar de forma contínua não
havia onde pousar os olhos, que é o defeito de todos os carrosséis.

O que não se negociou: **o HTML continua a ser a lista**. O anel é CSS por
cima, e só existe com as quatro condições ao mesmo tempo — suporte a
`animation-timeline`, ecrã largo, ecrã alto, e ninguém a pedir menos
movimento. Em telemóvel, no Firefox, ou com `prefers-reduced-motion`, lê-se a
lista de sempre. Uma secção onde cinco de seis frases dependem do browser
saber girar um anel seria uma secção que esconde conteúdo.

O Tiago viu a lista no telemóvel e perguntou pelo efeito; a resposta passou a
ser dar-lhe um. Em ecrã estreito o efeito existe **sem anel**: as frases ficam
empilhadas no mesmo sítio e o scroll troca-as com um fundido curto — a mesma
`view-timeline`, a mesma cadência de paragens, e cada frase com a sua janela
(`animation-range` com `calc(var(--i))`). Duas escolhas com razão: a janela da
última estica até 120% para o fim do curso a apanhar a meio do patamar — senão
o cartão desvanecia e saía-se de um palco vazio (visto em screenshot antes de
corrigido); e o palco mede `100svh`, porque `100vh` escondia o fundo do cartão
atrás da barra do browser. O Firefox e o `prefers-reduced-motion` continuam a
ler a lista, como no anel.

Um custo que ficou pago e documentado no CSS: o `overflow-x: hidden` do
`html` fazia do documento um contentor de scroll e **matava o `sticky` em
silêncio** — a secção rolava em branco. Passou a `overflow-x: clip` onde há
suporte, que corta o mesmo e não cria contentor nenhum.

### O modo mock ficou sem forma de entrar, e a landing pagava-o

O PR #39 fechou (e bem) a porta da primeira entrada: um login já não define a
palavra-chave de uma conta que não a tem. Só que em modo mock **ninguém** tinha
palavra-chave, portanto o arranque documentado no README deixou de dar para
entrar — e o `npm run shots` deixou de conseguir tirar capturas. As contas de
exemplo passam a trazer a palavra-chave `demo1234` já definida
(`seedPasswords()` no seed), **só nesse modo**: o caminho de produção não muda
nada.

## O mesmo feitio em todos os ecrãs, desta vez medido — 2026-08-17

Uma revisão da landing contra a regra "uma peça com forma própria tem de ter a
mesma forma no ecrã de toda a gente". A sessão de 2026-08-15 já tinha aprendido
metade disto (as molduras passaram a escalar com a altura); faltava a outra
metade, e estava escondida nos cartões das frases.

**Não se discutiu com capturas de ecrã: mediu-se.** Dezasseis viewports, com
rácios de aspeto diferentes e não só áreas diferentes, e em cada um o
`getBoundingClientRect()` de cada peça. O rácio largura/altura é o defeito num
número só: se ele se mexe entre viewports, há dois eixos a decidir cada um o
seu.

O que a medição disse, antes de mexer:

| Peça | Rácio | Veredicto |
|---|---|---|
| Moldura do telemóvel | 0,4621 em **todos** os 16 | já estava certa |
| Cartão do anel (1024→1080 de largura) | 1,7232 → 1,8214 | muda de feitio |
| Cartão do baralho (360 de largura, 560→740 de altura) | 0,9606 → 0,8125 | muda de feitio |

E o estrago que isso dava: **num telemóvel de 360x560 o cartão acabava 27px por
baixo da borda do ecrã**, cortado — precisamente no tamanho onde a condição
`min-height: 560px` julgava estar a proteger.

A causa é a mesma nas duas linhas: **a altura vinha de um sítio e a largura de
outro.** No baralho, `height: min(24rem, 58svh)` lia a altura da janela
enquanto a largura vinha do texto. No anel, `--anel-raio: min(27rem, 40vw)`
punha a largura a seguir a janela com a altura presa em `14rem`. Ninguém
escreveu "estica isto"; a esticadela nasce da soma dos dois, que é porque
sobrevive a uma revisão.

A correção é estrutural e não um número afinado:

- As frases deixam de ser `position: absolute; inset: 0` e passam a empilhar-se
  na **mesma célula de uma grelha** (`grid-area: 1 / 1`). Continuam no mesmo
  sítio, mas agora a altura da caixa é a **do cartão mais alto** — uma
  propriedade do texto, não da janela. De caminho, isto arrumou um segundo
  problema que a medição apanhou: a 1024 de largura o texto do anel já só tinha
  4px até à borda do cartão, por a caixa ter 14rem escritos à mão.
- O raio do anel passa a ser fixo (`27rem`). Verificado a 1024 de largura: os
  cartões ocupam de 38 a 986, com folga dos dois lados e sem scroll lateral.
- O cartão do baralho ganha `max-width: 34rem`. Num tablet chegava aos 672px e
  ficava uma tarjeta baixa e comprida.

**O anel em 3D passa a exigir `pointer: fine`.** Não é sobre o tamanho: é que o
anel vive de `preserve-3d` com `backface-visibility`, e há browsers de Android
que achatam o primeiro e enganam-se no segundo — as frases de trás apareceriam
escritas ao contrário. Um tablet grande passava o teste da largura e chumbava o
do 3D. O baralho passa a apanhá-los (`(max-width: 1023px) or (pointer: coarse)`)
e faz o mesmo sem depender do GPU. As duas condições são exclusivas uma da
outra, o que se verificou com o ponteiro emulado: iPad, Chromebook de toque e
telemóvel vão todos ao baralho; 1024 com rato vai ao anel.

Depois da correção, os mesmos 16 viewports: rácio constante dentro de cada
largura, nada de texto fora do cartão, nada de cartão fora do ecrã. O pior caso
(360x560) passou de **27px cortados** a **13,8px de folga**.

Fica **`npm run medir`** (`scripts/medir-landing.mjs`), que repete a medição
toda contra a app a servir e sai com código 1 se alguma peça mudar de forma. A
verificação que vale é a das alturas: o mesmo viewport de largura com alturas
diferentes: uma peça honesta não muda de forma quando só a altura da janela
muda, e foi por aí que o baralho foi apanhado. Como precisa de um Chromium, há
também `src/app/landing-proporcoes.test.ts` no `npm run test`, que garante que a
regra continua escrita na folha de estilos — falha com as duas linhas antigas
citadas pelo nome.

## A carteira contra o índice também **num período**, e não só desde o início

A comparação que existia responde a "valeu a pena?": aplica ao índice os mesmos
reforços nas mesmas datas desde o primeiro movimento, e mostra a série mês a
mês. Não responde a "como é que isto está a correr agora" — e as duas coisas
podem ser verdade em sentidos opostos ao mesmo tempo: uma carteira que bateu o
índice desde 2021 pode estar a perder para ele há três meses.

Ficam sete janelas (1 dia, 7, 15, 1 mês, 3, 6, 1 ano), cada uma com a
rentabilidade da carteira, a do índice e a diferença em pontos percentuais.

**A rentabilidade da carteira é ponderada no tempo, e isso não é um detalhe de
implementação.** A conta óbvia — `valor_hoje / valor_no_início` — trata um
reforço como se fosse lucro. Quem meteu 10 000 € a meio do mês vê a carteira
subir 10 000 € e a conta anuncia-lhe uma subida que ninguém ganhou. E o erro é
**maior** nas janelas curtas, não menor: quanto mais curto o período, mais um
reforço pesa contra o que o mercado teve tempo de fazer. No caso do teste — 10%
de subida, reforço a dobrar a carteira, mais 10% — a resposta certa é 21%, a
conta ingénua dá 131% e pôr o reforço na base do troço anterior dá 15,5%.

Daí os **dois pontos no dia do movimento**: o primeiro tira o dinheiro que
entrou e fecha com ele o troço que vinha de trás, o segundo serve de base ao
troço seguinte já com o dinheiro novo lá dentro. É o mesmo padrão que o
`positionValuePoints` já usava, e o `timeWeightedReturn` ignora pares na mesma
data precisamente para isto funcionar.

**Duas recusas, ambas com teste que chumba contra a versão sem elas:**

- **Uma janela mais velha do que a carteira não se desenha.** "1 ano: +4%" numa
  carteira de três meses mede um trimestre e diz um ano, e não há como quem lê
  desconfiar da frase.
- **As duas pontas no mesmo fecho não dão 0,0% — dão nada.** Numa
  segunda-feira, com o último fecho na sexta, tanto o início como o fim de uma
  janela de um dia recuam para sexta. A conta dava +0,0% dos dois lados, que se
  lê como "esteve parado" quando o que se passa é que ainda não há dia nenhum
  para comparar. Acontece **todas as segundas**, e em qualquer feriado. Para o
  detetar foi preciso o `diaDoPreco`, que devolve *qual* é o fecho que o
  `precoNoDia` usaria; o `precoNoDia` passa a assentar nele, sem mudar de
  comportamento.

Também se tirou do `carteiraEm` a reconstrução dos preços de todos os bens, que
corria a cada chamada. Com a série mensal era uma vez por mês; com as janelas
passou a ser em cada ponta de cada período e em cada dia de movimento lá dentro,
vezes dois índices. Agora calcula-se uma vez e o valor de cada dia fica em
cache — os dois índices e as sete janelas perguntam pelos mesmos dias.
