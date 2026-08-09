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
