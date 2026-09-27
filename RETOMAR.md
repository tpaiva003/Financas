# Retomar — estado e trabalho em falta

> **Lê isto primeiro.** É o ponto de situação da última sessão, verificado contra
> o repositório, a base de dados e o GitHub — não de memória.
>
> Última atualização: 2026-08-20. **Começa pela secção 0-hoje.**
>
> Antes disso: Os **PRs #45 e #43 estão integrados e
> em produção** (www.rachar.pt): janelas contra os índices, correções de cálculo
> com vendas, mês parcial, revisão da landing, modo demo self-serve e revisão do
> backend. O trabalho em curso vive no branch
> `claude/rachar-landing-page-zdliyf` (**PR #46, rascunho**) — ver a secção
> 0-novo: capturas novas, endurecimento (PBKDF2 600k, tectos de tentativas,
> convites opt-in — migrações **0044 e 0045 já aplicadas** no Supabase), SEO,
> recibo→despesa e streak. Autorizado pelo Tiago com «Avança com todos, exceto
> os SSO par ajá».

---

## 0-hoje. Sessão de 2026-08-20 — corte do anel, privacidade das unidades, ações contra cabaz

**Já em produção** (fundido no PR #52): os travessões fora do texto da app e o
**modo privacidade** (botão ao lado do tema, tapa os montantes com `•••`).

**Por fundir, no PR #53** (branch `claude/rachar-landing-page-zdliyf`), com o
gate verde em cada commit:

- **Faixas que deslizam deixam de cortar** (`3d945f3`). `overflow-x: auto` faz o
  `overflow-y` deixar de ser `visible`, e a barra dos separadores tinha zero de
  folga em cima: o anel de foco perdia 2 px. Classe `.scroll-x` nas doze faixas,
  teste a proibir `overflow-x-auto` à mão.
- **O modo privacidade passa a tapar as unidades** (`f7c35e7`). O preço de uma
  ação é público: "125 un." mais a cotação dizem quanto lá está. Saem as
  unidades, ficam os preços por unidade (`preco-un`).
- **Escolhas ou cabaz** (`f68c5c2`). Ações contra ETF, em peso e em ganho, na
  análise do património. O tipo vem do `quoteType` do Yahoo, que já vinha no
  pedido do preço. Painel para classificar setor e tipo à mão.

> **YOU MUST correr a migração `0046` antes de fundir o PR #53.** Uma coluna
> `assets.instrumento`, aditiva. Sem ela, gravar no painel de classificar dá
> erro. Copiar pela vista **raw** do GitHub (ver o aviso mais abaixo).

**Por decidir pelo Tiago:** o menu do Património tem dois separadores chamados
"Avaliação" (`/patrimonio/dcf` e `/patrimonio/avaliacao`), os dois a avaliar
empresas por fluxos de caixa. Qual fica.

---

## 0-novo. Sessão de 2026-08-18 (noite) — endurecimento, SEO, recibo e streak

Branch `claude/rachar-landing-page-zdliyf`, **PR #46 (rascunho)**. Seis commits,
cada um com o quality gate completo (testes, typecheck, lint, build) verde:

- **Capturas da landing regeneradas** (`npm run shots`) com o seed atualizado
  (mês parcial até ao dia 18, cotações até 17/08).
- **PBKDF2 a 600 mil iterações** (OWASP), com promoção do hash no próprio
  login (rehash-on-login) e o hash fantasma do timing regenerado a 600k;
  tectos do plano e contagem de registos passam a **falhar fechado**.
- **Tectos de tentativas** nos quatro formulários públicos (login, recuperar,
  fila de espera, contacto), por email visado, janela fixa atómica na base de
  dados — **migração 0044 aplicada e validada em produção**. No login o tecto
  corre ANTES de qualquer PBKDF2.
- **Convites de participante opt-in** — dar acesso deixou de criar a conta na
  hora: cria um convite de 7 dias; a conta nasce quando a pessoa aceita em
  `/convite/[token]` (página pública) e escolhe a palavra-chave. **Migração
  0045 aplicada.** Revogar/cancelar/eliminar mata a ligação; o ecrã de
  participantes mostra «convite enviado» com cancelamento.
- **SEO** — o `robots:{index:false}` GLOBAL saiu do layout de raiz (escondia o
  site inteiro do Google); noindex desceu para o grupo `(app)` e páginas de
  token; entram `/robots.txt`, `/sitemap.xml`, Open Graph/Twitter com imagem
  gerada no build, canónicos e schema.org na landing. As três rotas novas
  tiveram de entrar em `lib/public-routes.ts` — o middleware respondia ao
  Google com um redirect para o login.
- **Recibo → despesa** (item 8 do Word) — «Ler o recibo e preencher» na
  despesa nova: o modelo copia o impresso, o `reviewRecibo` determinístico
  valida (recusa moeda estrangeira, datas futuras, totais absurdos), a
  categoria vem das regras da app, e nada grava sem a pessoa confirmar.
  Leitura da invariante registada em `DECISOES.md`.
- **Streak de registos** (item 9 do Word) — derivado do `createdAt` das
  despesas do próprio, sem tabela nova; aparece no dashboard a partir de 2
  dias; um dia ainda sem registo mostra-o em risco em vez de o apagar.

**Por fazer / à espera do Tiago:** SSO (excluído por ele «par ajá»); as
referências estéticas do ponto 2.1 do Word (precisa do gosto dele); registar o
domínio no Google Search Console (só ele pode — passos enviados no chat);
fundir o PR #46 quando ele disser.

---

## 0. Sessão de 2026-08-17/18 — a carteira contra o índice, por período

**Integrado no main pelo PR #45 (2026-08-18) e em produção.** Ao trabalho das
janelas juntaram-se, no mesmo PR: **dois erros de cálculo em carteiras com
vendas** (o "no índice terias" saía negativo em quem realiza ganhos, e a série
mensal punha a carteira a desabar a cada venda contra um índice que nunca
vendia — a *diferença* mostrada estava certa, errados eram os valores de que
saía), o **corte do mês parcial** no "este mês vs o anterior" dos relatórios
(a referência passa a contar até ao mesmo dia, com rótulo), e os seis pontos
do documento de revisão da landing de 17/08. Os itens 8 e 9 desse documento —
recibo→despesa e streak — foram autorizados a 18/08 e estão feitos no PR #46
(ver secção 0-novo).

- **`src/lib/domain/janelas.ts`** — `desempenhoNaJanela`, sete períodos
  (1d, 7d, 15d, 1m, 3m, 6m, 1a) com a rentabilidade **ponderada no tempo** da
  carteira contra a subida do índice no mesmo período.
- **`src/components/JanelasContraIndice.tsx`** — a tabela por índice no
  `/patrimonio`, com a diferença em pontos percentuais.
- **`diaDoPreco`** em `serie-comparacao.ts` — devolve *qual* é o fecho que o
  `precoNoDia` usaria. O `precoNoDia` passa a assentar nele, sem mudar de
  comportamento.
- O `carteiraEm` do `portfolio-service.ts` deixou de reconstruir os preços de
  todos os bens a cada chamada, e guarda o valor de cada dia em cache.

As duas recusas deliberadas (janela mais velha do que a carteira; as duas
pontas no mesmo fecho) estão explicadas no `DECISOES.md`. **Com o seed**, a
janela de 1 ano aparece recusada de propósito: o primeiro movimento é de
2025-09-24 e a janela começaria em 2025-08-17. É o comportamento certo, não uma
falha do exemplo.

Visto a servir, com o seed: a tabela desenha-se nos dois índices, a 1280 e a
390 de largura, sem scroll lateral. Com as cotações do seed a acabarem na
véspera, a janela de 1 dia aparece recusada ("o fecho de X serve as duas
pontas") — é o comportamento certo a uma segunda-feira, não uma falha.

---

## 0.1. Sessão de 2026-08-17 — o mesmo feitio em todos os ecrãs, medido

Branch `claude/rachar-landing-page-zdliyf`, recomeçada de `origin/main`
(`8f828d4`, já com o baralho do telemóvel integrado). Revisão da landing contra
a regra "uma peça com forma própria tem de ter a mesma forma no ecrã de toda a
gente" — e desta vez **medida**, não vista.

| | |
|---|---|
| Cartão das frases cortado 27px fora do ecrã a 360x560 | ✅ corrigido |
| Cartão a mudar de feitio com a altura da janela (`58svh`) | ✅ corrigido |
| Anel a mudar de feitio entre 1024 e 1080 de largura (`40vw`) | ✅ corrigido |
| Anel 3D em tablets de Android, onde o `preserve-3d` falha | ✅ passa ao baralho |
| `npm run medir` + teste da regra no `npm run test` | ✅ novo |

O detalhe está em `DECISOES.md` ("O mesmo feitio em todos os ecrãs, desta vez
medido"). O que importa reter:

- **A altura de um cartão vem do cartão mais alto, não da janela.** As frases
  empilham-se com `grid-area: 1 / 1` numa grelha, e não com `inset: 0`. Se
  alguém voltar a escrever uma altura em `svh`/`vh` na caixa, o teste
  `src/app/landing-proporcoes.test.ts` chumba e diz qual é a linha.
- **O anel exige `pointer: fine`** — é o guarda do 3D, não do tamanho. O
  baralho apanha `(max-width: 1023px) or (pointer: coarse)`. As duas condições
  são exclusivas: nenhum viewport fica sem efeito nem com os dois.
- **`npm run medir`** repete as 16 medições contra a app a servir e sai com
  código 1 se alguma peça mudar de forma. Precisa de um Chromium, tal como o
  `npm run shots`; por isso a rede que corre sempre é o teste da folha de
  estilos.
- A moldura do telemóvel do herói **já estava certa** (rácio 0,4621 nos 16
  viewports) e não se mexeu nela.

Verificação desta sessão: `test`, `typecheck`, `lint` e `build` verdes;
`npm run medir` verde em 16 viewports; ponteiro emulado a confirmar o anel a
1024 com rato e o baralho em iPad, Chromebook de toque e telemóvel.

## 1. Sessão de 2026-08-15 — azul de azulejo, anel 3D, e o mock sem porta

Branch `claude/rachar-landing-page-zdliyf`, recomeçada de `origin/main`
(`42f1226`, já com o back end novo). Três pedidos do Tiago, todos feitos:

| | |
|---|---|
| Cor da marca: do verde para o azul dos azulejos do Porto | ✅ |
| "O que se ouve" deixa de ser texto corrido: anel 3D que roda com o scroll | ✅ |
| Capturas regeneradas contra o back end novo (12, dois temas) | ✅ |

Detalhe das três em `DECISOES.md` ("O azul dos azulejos, o anel de frases…").
O que importa reter para a próxima sessão:

- **`--c-marca` / `--c-marca-tinta`** são a cor da marca (fundo e tinta);
  verde e vermelho voltaram a ser só semântica de dados. Se aparecer verde
  num botão, é regressão.
- **O anel é CSS puro por cima da lista**: o HTML continua a ser a lista, e em
  Firefox/reduced-motion é a lista que se lê. Não acrescentar JavaScript para
  "consertar" o anel onde ele não existe — é de propósito. Em **telemóvel**
  (a pedido do Tiago, 2026-08-16) o efeito passou a existir sem anel: um
  baralho de cartas em que o scroll troca as frases no mesmo sítio, com as
  mesmas condições de suporte e o mesmo fallback (ver `DECISOES.md`).
- **`overflow-x: clip` no `html`** é o que mantém o `sticky` vivo; voltar a
  `hidden` parte a secção do anel em silêncio.
- **Modo mock**: o PR #39 fechou a definição de palavra-chave à primeira
  entrada, e as contas de exemplo passaram a trazer `demo1234` já definida
  (`seedPasswords()`), senão nem `npm run dev` nem `npm run shots` entravam.
- **Modo demo (outro agente, em curso):** quando existir registo de
  visitantes com limitações, a landing pode trocar o "Quero saber mais" por um
  CTA de experimentar. Não se antecipou nada: o formulário de contacto
  continua a ser a porta até o demo estar em produção.

Verificação desta sessão: `test` (1102), `typecheck`, `lint`, `build` verdes;
anel visto a 1440×900, 1366×768, 1024×640, 1920×1080, claro e escuro,
reduced-motion e telemóvel (lista); sem scroll lateral em seis larguras.

---

## 2. Sessão de 2026-08-13 — a landing pública (PR #32, integrado)

Branch `claude/rachar-landing-page-zdliyf`. Deploy verde, ainda em rascunho.

| | |
|---|---|
| Landing reescrita: contava só o dividir contas, agora conta a app toda | ✅ |
| Capturas de ecrã reais na landing, geradas por `npm run shots` | ✅ |
| Menos linhas e mais movimento, na landing **e** dentro da app | ✅ |
| Dados de exemplo para património, investimentos, cotações e rendimentos | ✅ |
| `README.md` atualizado (dizia "Fase 1" e "dois utilizadores") | ✅ |

**Dois bugs corrigidos pelo caminho, ambos anteriores a esta sessão:**

1. **O middleware barrava páginas que têm de ser públicas.** `/privacidade`,
   `/termos` e `/recuperar` redirecionavam para o login. As duas primeiras estão
   no rodapé e **a Google exige-as acessíveis sem sessão para aprovar o ecrã de
   consentimento do SSO** — ou seja, isto bloqueava o ponto 4 desta lista sem que
   se soubesse. A terceira é a reposição de palavra-chave, que por definição é
   para quem não consegue entrar.
2. **O `.env.example` trazia `AUTH_URL="https://rachar.pt"`.** O README manda
   copiá-lo e arrancar, e com um URL `https` os cookies de sessão saem `Secure`,
   que o browser recusa em `http://localhost`. O arranque documentado não dava
   para entrar na app, e falhava em silêncio.

**Pedido do Tiago que fica para outra branch:** a consola `/plataforma` com mais
indicadores em gráfico, secções em acordeão e separação entre indicadores, contas
novas e testes de acesso. Nota que veio da conversa e que vale a pena guardar:
um gráfico de registos por mês **tem de sair das datas já gravadas**
(`app_users.created_at` e `spaces.created_at` existem desde a `0001_init`), e não
de contadores criados de raiz — senão nasce vazio e esconde tudo o que aconteceu
antes de ele existir, que foi exatamente o que o Tiago viu.

---

## 3. Sessão de 2026-08-12 (noite) — foco do património, séries no DCF, setores

**As contas do Yahoo funcionam em produção.** O Tiago confirmou-o com a
Alphabet preenchida de ponta a ponta (fluxo livre, ações, preço, dívida, caixa
e a dívida líquida derivada). O 404 era mesmo só a tradução do símbolo, e o
botão das **datas de mercado** usa o mesmo caminho — se um passa, o outro passa.

### O que se fez

- **Caixas de foco no resumo do património** (`/patrimonio?foco=…`): Tudo,
  Investimentos, Imóveis, Liquidez. Filtram o número grande, o gráfico, a
  repartição "Onde está" e os juros do ano. Cada caixa mostra o seu próprio
  líquido, para a comparação que motiva o filtro — quanto disto é casa e quanto
  é carteira — se fazer sem carregar em nada.
- **Séries temporais no DCF**, em acordeão e por tema (crescimento,
  rentabilidade, solidez). Cada indicador leva o seu desenho ao lado dos seus
  números e a tendência entre a primeira e a última leitura. O mesmo pedido ao
  Yahoo passou a trazer também os **três mapas por trimestre**, sem custo extra.
- **Desalinhamento da dívida líquida** na calculadora: a legenda por baixo da
  caixa era o que ficava encostado ao fundo da coluna, e a caixa subia uma linha
  em relação às outras duas — na única linha do formulário onde os três valores
  se leem em conjunto.

### Quatro decisões que não são óbvias

1. **A fotografia gravada no histórico é sempre a do património inteiro.**
   Gravar o líquido de uma vista filtrada escrevia no passado que naquele dia a
   pessoa não tinha casa — e um saldo não se reconstrói depois.
2. **Os pontos antigos que só guardaram o total saem do gráfico** em vez de
   serem repartidos pelas proporções de hoje. O ecrã diz quantos ficaram de
   fora; uma linha inventada tem ar de facto.
3. **As dívidas só descontam nos focos que as incluem** (Tudo e Imóveis). Num
   foco de investimentos o crédito à habitação não tem nada que subtrair, e
   subtraí-lo dava um líquido negativo que não corresponde a decisão nenhuma.
4. **Nada do que decide o DCF vem dos trimestres.** As médias, o CAGR e os
   cenários continuam a sair dos exercícios anuais, porque um trimestre
   comparado com o anterior mede sazonalidade tanto como desempenho. O ecrã
   di-lo por palavras a quem escolhe a vista trimestral.

### Três armadilhas fechadas com teste

- **Os trimestres indexam-se pela data, não pelo ano.** Indexá-los pelo ano —
  que é o que o anual faz de propósito, para juntar um exercício reexpresso —
  colapsava os quatro trimestres de 2025 num ponto só. E um gráfico com um ponto
  lê-se como "esta empresa só reportou uma vez".
- **A tendência recusa dar percentagem a partir de um ponto de partida
  negativo.** Uma margem que vai de −5% para 3% melhorou oito pontos; a divisão
  dava −160%, com o sinal ao contrário do que aconteceu.
- **O leitor de períodos é um só** para o anual e o trimestral. Uma segunda
  cópia significava que o dia em que o `capitalExpenditures` mudasse de sinal só
  uma das séries ficava certa — e as duas continuavam a desenhar-se com o mesmo
  ar de facto.

### Análise por setor — feito na mesma sessão

Pedida pelo Tiago: "análise dos ativos por setor, por evolução das empresas, por
reforços". Vive em **Análise → Património**, por baixo do mês a mês.

- **Migração 0041** (`sector`, `industry`, `profile_at` no bem). **POR CORRER** à
  data desta escrita — enquanto não correr, a secção aparece com tudo em "Por
  classificar", que é o comportamento correto e não uma avaria.
- O setor vem do módulo `assetProfile`, que passou a ir **no mesmo pedido** das
  contas. A atualização semanal das datas de mercado já o traz de borla; o botão
  "Ir buscar setores" trata os restantes, doze de cada vez.
- **Só preenche o que está vazio.** Um setor corrigido à mão nunca é reescrito —
  é o invariante das entradas manuais.
- `profile_at` distingue "a fonte não sabe" (normal nos ETF) de "ainda não fui
  perguntar", e só se escreve quando a consulta corre.

O que esta leitura se recusa a fazer, e é o que a torna fiável: **"Por
classificar" é um grupo com nome e nunca uma fatia calada**, e **com nada
classificado não há maior setor nenhum** — anunciar "o maior é Por classificar,
com 100%" apresentava a ausência de um dado como uma conclusão sobre a carteira.
Mostram-se **duas** leituras: o peso no valor de hoje e o peso no dinheiro que
entrou. Um setor que subiu muito ocupa mais peso do que alguma vez se decidiu
dar-lhe, e é assim que uma concentração aparece sem ninguém a ter escolhido.

### Por fazer nesta frente

- **Correr a 0041** e carregar em "Ir buscar setores".
- **Comparação com o setor** no DCF — a última coluna da folha do Tiago. Médias
  setoriais a sério não existem numa fonte gratuita, e inventá-las era o modo de
  falha nº 5 desta app. A alternativa honesta é comparar com os **próprios
  investimentos do mesmo setor**, o que só passa a fazer sentido depois de a
  0041 estar corrida e os setores preenchidos.

---

## 3.1. Sessão de 2026-08-11 (tarde) — avaliar empresas

**Migrações todas corridas até à 0039**, confirmado pelo Tiago a 2026-08-12.

**Confirmado em produção a 2026-08-12:** o botão das contas (`quoteSummary`) e,
com ele, o gráfico do historial. **Continua por confirmar** o resumo por IA dos
anexos — nada disto era testável a partir da caixa de desenvolvimento, porque o
proxy bloqueia o Yahoo e a chave da Anthropic não está lá.

**Copiar as migrações do GitHub pela vista "raw"**: a página renderizada pode
colar lixo no início do ficheiro (`#FF00FF`), e o erro que sai daí é um
`syntax error` que não parece ter nada a ver.

### O que se fez a 2026-08-12

- **O 404 das contas.** `googl.us` é a convenção **interna** desta app e não é um
  ticker que exista em lado nenhum. O serviço das cotações já traduzia
  (`forSource`: `googl.us` → `GOOGL`, `edp.pt` → `EDP.LS`); o das contas pedia o
  símbolo em cru e levava 404 em tudo — que se lê como "esta empresa não existe".
  O construtor do endereço passou para o domínio (`urlDosFundamentais`) para
  haver um teste que confirme a tradução.
- **O funil deixa de exigir um DCF.** Aponta-se uma empresa com nome, símbolo,
  data, marca e notas; um botão abre a calculadora já preenchida, e o estudo é
  gravado **naquela linha** em vez de criar um segundo cartão. Os campos do DCF
  passam a poder ser nulos, com um `check` a garantir que ou estão todos ou
  nenhum está — meio estudo é pior do que nenhum.
- **Anexos por avaliação, e um resumo escrito por IA.** Relatórios e
  apresentações vão direto para o Storage; a IA lê o texto e escreve o que
  percebeu, incluindo uma secção obrigatória do que fica por saber. **Não devolve
  número nenhum para o cálculo** — a tentação era pedir-lhe o fluxo de caixa
  livre, e nesse dia o valor por ação passava a depender de um modelo a ler um
  PDF.
- **Logos no funil**, pela mesma rota servida pelo servidor que os investimentos
  usam. A busca (três fontes) passou para um serviço partilhado: duas cópias
  divergiam, e a que ficasse para trás continuava a usar uma fonte em baixo.
- **Gráfico do historial**, com dez métricas a escolher num clique e valores ao
  passar o rato. Uma margem de 32% não diz nada; 22 → 26 → 32 diz que a empresa
  está a ganhar escala, e 40 → 36 → 32 diz o contrário com o mesmo número no fim.
- **Alinhamento dos campos** da calculadora: rótulos de duas linhas ("Fluxo de
  caixa livre (mM)") empurravam a caixa para uma altura diferente da coluna ao
  lado.

### O que passou a existir

- **Calculadora de avaliação** (`/patrimonio/dcf`) com o desenho da folha de
  cálculo do Tiago: dados da empresa, parâmetros, **três cenários com duas fases
  de crescimento** (anos 1-5 e seguintes) e probabilidades, margem de segurança,
  preço ponderado e veredicto. Os números batem ao cêntimo com a folha —
  `dcf-cenarios.test.ts` confere-os contra ela.
- **Botão que vai buscar as contas** ao Yahoo Finance pelo símbolo: fluxo livre,
  ações, dívida, caixa e preço, mais o **historial** (ROCE, margens, ROE,
  dívida/capital, liquidez corrente, fluxo livre e a sua margem, ano a ano e com
  médias), as estimativas dos analistas e as datas dos próximos resultados e
  dividendo.
- Os **três cenários passam a partir do crescimento composto do fluxo livre** da
  própria empresa, com o ecrã a dizer de onde veio o número. Continuam editáveis.
- **Funil** (`/patrimonio/avaliacoes`): cada estudo fica guardado com os
  pressupostos **e** o resultado, numa etapa (em radar, em estudo, à espera de
  preço, comprada, arquivada). Diz quanto o preço tem de descer para o estudo
  fazer sentido, marca como substituído o estudo antigo da mesma empresa e avisa
  quando os pressupostos passam de meio ano.

### Três armadilhas que isto evita, e valem a pena saber

1. **`GBp` outra vez.** A cotação vem em pence e o preço tinha de ser dividido
   por cem — o mesmo cem-vezes das cotações, agora no denominador de um DCF.
2. **O capex vem negativo** na resposta do Yahoo. Subtraí-lo em vez de o somar
   dá quase o dobro do fluxo livre, e o dobro do valor por ação no fim.
3. **Relatar numa moeda e cotar noutra** (qualquer ADR) dá um veredicto errado
   pela diferença cambial, com os dois números do tamanho certo e a conta a
   correr sem erro nenhum. O ecrã avisa.

E uma regra que atravessa o módulo todo: **sem denominador positivo não há
rácio**. Com capital próprio negativo o ROE sai positivo e enorme, e lê-se ao
contrário do que significa. Onde está "—" não há dado — não é zero.

### Notas de implementação

- O `quoteSummary` do Yahoo (contas) **não é** o `chart` (cotações): pede um
  `crumb` de uma sessão anónima. O serviço tenta sem ele primeiro e só faz as
  duas voltas quando leva 401. **Não foi possível verificá-lo daqui** — o proxy
  desta caixa bloqueia o Yahoo — por isso degrada com honestidade: se a fonte
  recusar, diz-se porquê e todos os campos continuam a escrever-se à mão.
- O servidor **refaz a conta** ao guardar: o formulário manda os pressupostos e
  não o resultado. Aceitar o número do browser deixava gravar um preço que não
  sai dos pressupostos ao lado dele.
- O `EstadoChip` estava exportado de `ajuda/page.tsx`. Uma página do App Router
  só pode exportar o que o Next reconhece; passava no `tsc` e no `lint` e só
  rebentava no `build`. Mudou-se para `components/EstadoChip.tsx`.

### Por fazer nesta frente

- **Comparação com o setor** — a última coluna da folha do Tiago que ainda não
  tem equivalente.
- **Confirmar em produção** que o botão das contas (`quoteSummary`) funciona e
  que o resumo por IA dos anexos corre. Nenhum dos dois foi testável daqui.

### Feito a 2026-08-12, à noite

- **Reavaliar parte do estudo anterior.** Só o id viaja no endereço; o servidor
  lê o resto. Um DCF tem onze pressupostos, e enfiá-los no URL deixava fabricar
  um estudo com os números que se quisesse à espera que alguém carregasse em
  guardar sem reparar.
- **Datas de mercado** (migração **0039**): resultados, data-ex e pagamento,
  gravados no bem e mostrados em "A caminho", no património. Prazos diferentes
  por tipo — catorze dias para resultados (dá para reler o estudo), sete para a
  data-ex (é a única com prazo a sério: passou, perdeu-se o dividendo), cinco
  para o pagamento. Uma data que passou há menos de três dias continua a
  aparecer, porque explica o salto na cotação que se está a olhar hoje.

---

## 3.2. O que foi feito na sessão de 2026-08-10/11

**Migrações 0032 e 0033 já corridas** (e as 0034–0036 também). O que está
escrito abaixo como "por correr" ficou resolvido; fica o relato do que era.

### Dois erros de dinheiro, dos graves

1. **Londres cotava em pence e a app lia libras.** O Yahoo devolve `GBp` — com
   o `p` minúsculo — para o que cota em pence, e `GBP` para o que cota em
   libras. O leitor fazia `.toUpperCase()` **antes** de olhar, o que
   transformava uma na outra. Um ETF a 9150 pence (91,50 £) ficou gravado como
   9150 libras; uma posição de 1500 € aparecia com 149 000 €. Era também isto
   que apagava as correções à mão: gravava-se o preço certo e a atualização
   automática reescrevia o errado por cima. A **0033** deita fora a cache de
   `.uk` e põe a nulo os preços que vieram dela.
2. **Uma importação leu `493.975` como 493 975,00 €** quando eram 493,98 €. O
   parser está corrigido há duas sessões; as linhas que já entraram continuam
   lá. Agora há um detetor (`movimentosImplausiveis`) que as encontra pelo preço
   por unidade destoar 20× da mediana do próprio ativo, e a lista aparece por
   nome em cima dos investimentos. **A rentabilidade da carteira recusa-se a
   aparecer enquanto houver alguma**: estava a mostrar 950 432 € investidos,
   270 843 € de valor e uma TIR de +13,3%, três números que se contradizem.

### O que a Euronext Lisboa tinha a ver com isto

Só o `.uk` e o `.us` estavam traduzidos para o Yahoo. Tudo o resto passava em
maiúsculas, o que acerta na Alemanha por acaso e falha em todas as outras
praças: a EDP virava `EDP.PT`, que não existe. Numa app portuguesa era a falha
mais cara da lista. O campo do símbolo passou também a estar na ficha do
investimento — vivia só no formulário completo noutra página.

### Funcionalidades novas

- **Pedidos de ajuda** (`/ajuda`, e o separador "Pedidos" em `/mensagens`).
  Estado, respostas e **notas internas**. A separação não vive num `if` de um
  ecrã: são duas funções de leitura com nomes diferentes, e a que serve o
  utilizador não sabe filtrar. Uma nota interna também não mexe no `updated_at`,
  senão denunciava a hora a que alguém escreveu o que ele não pode ler. Migração
  **0032**.
- **KPIs de crescimento** em `/plataforma`: janelas de 7/30/90 dias, série
  mensal, retenção, ativação. A data que conta é a de **registo** e nunca a da
  transação — quem importa dois anos de extrato numa noite fez uma noite de uso.
  De caminho, as leituras da consola passaram a pedir páginas: contavam até mil
  e calavam-se.
- **Euribor do BCE**, a média do mês (que é a que os contratos portugueses
  usam), a preencher o campo sem gravar.
- **Anexos** ligados aos bens; **ordenar investimentos** por ganho em € e em %.
- O **chat** ganhou ícone de IA, tom da marca, e passou a ver **todos os
  ambientes** — perguntar "tenho dívidas?" com o crédito noutro separador dava
  "não".

### Por fazer

- **Splits a sério.** A app recusa-se a calcular quando deteta um, o que é
  honesto e não resolve. Precisa de uma tabela de desdobramentos e de converter
  as unidades antigas.
- Corrigir os movimentos que a importação estragou. A app diz agora quais são;
  a correção é à mão, de propósito — não se decide sobre dinheiro de alguém a
  partir de um palpite.

---

## 3.3. O que foi feito na sessão de 2026-08-07

Uma sessão de revisão, seguida de correções. **Todas as fases abaixo estão
aplicadas, com testes, e a app compila e passa em tudo** (`test`, `typecheck`,
`lint`, `build`). Os testes passaram de 443 para 496.

### Segurança (feito)

Estavam abertas seis portas entre ambientes. Como tudo corre com a chave de
serviço do Supabase, que **ignora o RLS**, o `space_id` passado à mão era a
única fronteira que existia — e não estava a ser passado.

- O `space_id` passou a ser **obrigatório na assinatura** de `getExpense`,
  `updateExpense`, `setReceiptPath`, `softDeleteExpense`, `confirmExpense` e
  `setExpenseApproval`, para o compilador obrigar quem chama a dar um id já
  validado. O mock aplica a mesma regra: um backend mais permissivo do que a
  produção esconde o engano que os testes procuram.
- O `addMemberAction` tirava o ambiente de um campo escondido do formulário e
  verificava as permissões contra outro. Passa a vir da sessão.
- O `existingAssetId` da importação vinha do payload do cliente e ia direto para
  a escrita. É confrontado com os ativos do ambiente.
- O `/api/cron/quotes` falhava **aberto** quando o `CRON_SECRET` não estava
  definido, que é como o `.env.example` o entrega. Falha fechada, e a comparação
  é em tempo constante.
- Testes novos em `src/lib/data/isolation.test.ts`, corridos contra o código
  antigo para confirmar que falham lá.

**Por fazer, por decisão do Tiago:** a primeira entrada continua a definir a
palavra-chave — quem chegar primeiro a um email conhecido fica com a conta. Ver
"Dívidas conhecidas".

### O bug da venda lida como compra (feito)

O diagnóstico anterior estava errado nos três pontos, e todos foram testados a
correr: o `\s` do JavaScript já apanha o espaço não separável, o
`parseAmountCents("-23")` devolve `-2300`, e a deteção de colunas lê a venda da
Degiro como venda.

A causa é o leitor de ficheiros: pedia as células com `raw: false`, ou seja
recebia o **texto que o Excel desenha**. Com o formato `#,##0;[Red]#,##0` —
negativo a vermelho, que várias localizações oferecem por omissão — o `-23`
chega como `"23"`, e **todas as vendas viram compras**. Passa a ler o valor.

Tratada também a segunda suspeita: os formatos aprendidos ganham à deteção e
eram usados com um `as unknown as`, que não valida nada. Um template gravado por
uma versão antiga não traz os campos novos, e `undefined >= 0` é `false` — o que
se lê como "esta coluna não existe", desligando a moeda e o câmbio em silêncio.
Agora um template só vale inteiro (`import/stored-mapping.ts`).

**Falta confirmar com o ficheiro do Tiago** qual dos dois era o caso real. Ver
"Ficheiros do Tiago" no fim.

### Números errados sem aviso (feito)

- **O saldo redividia o histórico** quando os membros mudavam. Agora, ao
  acrescentar alguém, pergunta-se o que fazer ao passado: dividir tudo, a partir
  de uma data, ou só dali para a frente (migração `0022`). Quem já existe fica a
  "desde sempre", que é o comportamento antigo — **nenhum saldo já mostrado
  muda**. Só afeta divisões em partes iguais; as percentagens já nomeiam quem
  suporta o quê.
- **Dois cafés iguais no mesmo dia** colidiam no mesmo UID e um desaparecia. As
  ocorrências passam a ser numeradas dentro de cada ficheiro e continuam a ser
  deduplicadas entre ficheiros. A primeira ocorrência mantém o UID de sempre.
- **O índice único das despesas era global**, não por ambiente (migração `0023`).
- **Movimentos do mesmo dia eram ordenados por UUID**, à sorte, mudando o custo
  médio e a mais-valia realizada sem levantar o aviso de `oversold`. Entra
  primeiro o que entra.
- **A comparação com o índice** saltava os reforços anteriores ao início da série
  mas mantinha a carteira inteira — 25% apresentados como 150%. Recusa comparar
  e diz porquê.
- **Um empréstimo que amortiza um euro por mês** era apresentado como um
  empréstimo a 100 anos com juros de seis dígitos.

### Coisas partidas que se viam da rua (feito)

- `/recuperar`, `/privacidade` e `/termos` estavam **atrás da sessão**, apesar de
  a landing e o login lhes apontarem. A recuperação de palavra-chave estava morta
  para exatamente quem precisa dela. A lista de rotas públicas passou para
  `lib/public-routes.ts`, com testes — dentro do middleware não era testável, e é
  por isso que o erro sobreviveu.
- Não havia um único `error.tsx` nem `loading.tsx`. Já há, mais `global-error` e
  `not-found`. O de erro mostra o `digest`, nunca a mensagem, que vem da base de
  dados.

### Limpeza e documentação (feito)

- Apagadas ~250 linhas mortas: `buildTradesPreview` e o `holdings-import`
  inteiro, que ninguém chamava e que traziam a sua própria cópia da lógica de
  templates — incluindo o mesmo `as unknown as`.
- Removido o `AUTH_DEV_LOGIN`, que já não tinha chamadores.
- O `.env.example` declarava o `AUTH_URL` duas vezes, ganhando a de produção.
- O `npm run seed` rebentava numa chave estrangeira desde a `0003`.
- O `CLAUDE.md` e o `README.md` reescritos: descreviam uma app de dois
  utilizadores, com SSO como forma de entrar e parsing em Python.

### A migração `0021` (corrigida, por aplicar)

Trazia o bug que o próprio cabeçalho dizia ter evitado: criava o índice único da
`waitlist` com o nome `waitlist_email_key`, que é exatamente o nome que o
Postgres já deu à restrição da `0001`. O `if not exists` encontrava-o, saltava, e
o índice sobre `lower(email)` **nunca era criado** — enquanto o comentário
prometia falhar em voz alta. Renomeado.

O comentário *"sem políticas: só o service role lhe toca"* também era falso: a
`0001` tinha criado duas políticas na `waitlist`, uma delas a deixar qualquer
cliente inserir. Agora são removidas.

---

## 3.4. Sessão de 2026-08-08 — investimentos e crédito à habitação

Pedidos do Tiago, pela ordem que ele escolheu. Tudo com testes; o portão
completo (`test`, `typecheck`, `lint`, `build`) passa. Os testes passaram de 496
para 545.

### Símbolo de bolsa sugerido por IA (feito)

O modelo propõe candidatos a partir do nome, e **cada candidato é confirmado
contra a fonte de cotações** antes de aparecer: só entra na lista o que devolve
mesmo uma série. A sugestão **nunca é aplicada sozinha** — fica um botão para
quem regista aceitar. A IA escolhe o candidato, os factos vêm da fonte, que é o
mesmo princípio da importação ("a IA escolhe colunas, não lê dados").

### Investimentos em cartões, com venda rápida (feito)

- Cartão quadrado com emblema, ticker, unidades, custo médio, preço e ganho.
  O emblema é um monograma com cor tirada do próprio símbolo (`domain/monogram.ts`),
  sempre a mesma para a mesma ação. Logos reais ficam para trás de bandeira.
- **Um cartão por ativo, nunca por compra.** Comprar hoje mais da mesma ação
  acrescenta um movimento ao cartão que já existe.
- Venda rápida no próprio cartão: data, unidades e valor em euros. Vender mais
  do que se tem **avisa mas não impede** — pode faltar uma compra por lançar.
  Câmbio, dividendos e comissões ficam no formulário completo, que é onde se
  pode conferir a taxa.

### Rentabilidade ponderada pelo tempo, ao lado da TIR (feito)

A TIR (ponderada pelo dinheiro) já existia; a TWR estava escrita e nunca era
chamada. São perguntas diferentes — "o que rendeu o meu dinheiro" e "o que
rendeu o ativo, independentemente de quando reforcei" — e agora aparecem as
duas. Recusa-se a responder quando falta cotação num dia de movimento.

### Crédito à habitação com períodos de taxa (feito)

O formulário das dívidas mostrava um formulário de bens. Agora:

- Na vista das Dívidas, o tipo já vem escolhido e a secção passou a "Plano de
  pagamento" em vez de "Rendimento" — numa dívida o dinheiro não rende, custa.
- **Períodos de taxa** (`domain/credito.ts`, migração `0024`): um crédito
  português não tem uma taxa, tem duas ou três com datas ("3 anos fixa a 3,3%,
  depois Euribor 6M + 0,9% até 2056"). Com uma taxa só, a app mostrava até ao
  fim uma prestação que deixa de ser verdade no dia em que o período fixo acaba.
- A prestação é **recalculada em cada mudança**, como o banco faz: anuidade
  sobre o capital que sobra e os meses que faltam **até à maturidade**. É isso
  que cria o degrau, e o degrau é mostrado em destaque.
- Fixa / mista / variável é um **atalho que monta as linhas**, não um campo
  gravado: o tipo é lido a partir dos períodos, senão mais tarde ou mais cedo
  dizia "fixa" num crédito com um período variável lá dentro.
- **O valor do indexante pergunta-se.** A app não tem fonte de Euribor. Em
  branco não dá zero: dá um plano que se recusa a existir e diz porquê. A partir
  do primeiro período variável o plano diz que é um **cenário**, e a que valor.
- O `credit_terms` é `jsonb` e é lido **sempre** pelo `parseCreditTerms`, que
  valida campo a campo. Um `as unknown as` aqui daria um plano de amortização
  com números a sério e origem duvidosa — o erro que os mapeamentos de
  importação já pagaram.
- O total das prestações (`summariseRates`) passa pelo plano quando há períodos.
  Sem isso a maior dívida da casa desaparecia do total sem dizer nada.

**Nota sobre o `buildLoan`:** num crédito de 240 meses ele devolve
`monthsToPayOff: 241`, porque a prestação arredondada deixa um resto de cêntimos
que ele paga num mês a mais. O `buildCreditoPlano` ajusta a última prestação, que
é o que o banco faz. Não foi mexido no `buildLoan` — é um erro de um mês numa
data que já lá estava, e mexer nele mudava números já mostrados.

### Sessão de 2026-08-09 (feito)

Quatro coisas novas, todas com o mesmo desenho: o modelo propõe, o código
verifica, a pessoa confirma.

- **Quota em cada bem** (`0025`). `ownership_pct` multiplica o valor, o custo, a
  prestação e o plano — e mais nada. Em branco ou fora do intervalo vale
  **tudo**, nunca zero: um bem que valesse zero por um campo mal preenchido
  desaparecia do património sem dizer nada. `co_owner_member_id` é só registo e
  não entra em conta nenhuma; quando aponta para alguém do ambiente, a app
  **avisa** que a quota devia provavelmente ser 100%, e não corrige.
- **Ler o contrato do crédito** (`domain/credito-contrato.ts`). Ao modelo é
  pedido que **copie e não calcule** — incluindo a prestação. É essa prestação
  copiada que permite verificar tudo o resto: o `reviewContrato` recalcula-a a
  partir do capital, da taxa e do prazo e compara. Uma taxa lida como 0,33% em
  vez de 3,3% mantém o formato perfeito e não sobrevive a essa conta. O valor do
  indexante que vem no contrato é ignorado de propósito (é o do dia da
  escritura). O ficheiro não fica guardado.
- **Preço dos imóveis pelo INE** (`domain/imovel.ts`, `0026`). O idealista não
  tem API e raspar as páginas é contra os termos deles. O concelho casa pelo
  **nome** que o INE devolve, sem acentos — uma tabela de 308 códigos aqui
  dentro dessincronizava-se em silêncio. Um nome ambíguo não se desempata (há
  duas Lagoas, com o dobro do preço uma da outra). A estimativa aparece **ao
  lado** do valor registado, nunca por cima.
- **Evolução do património** (`domain/networth-history.ts`, `0027`). O passado do
  património não se reconstrói — cada bem só sabe o que vale hoje —, por isso
  grava-se uma fotografia por dia, **na visita** e não num cron. O histórico
  começa vazio. Não há percentagem a partir de um património negativo: de -50
  mil para -10 mil a divisão dá o sinal ao contrário. A leitura é paginada (uma
  por dia passa as mil linhas em três anos).
- **Conversa sobre os números** (`domain/situacao.ts`). O resumo é montado por
  código com testes, em euros, e é isso que o modelo recebe: ele discute, não
  calcula. Não vão despesas uma a uma, notas de bens nem nomes de pessoas. A
  conversa não fica guardada.

**Por confirmar:** a chamada ao INE **nunca foi corrida** — a rede do ambiente
onde isto foi escrito bloqueia o `ine.pt`. O parser tem testes contra o formato
documentado, mas o código do indicador (`INE_PRECO_M2_VARCD`) e a forma exata da
resposta só se confirmam na primeira utilização a sério. Se falhar, a app diz o
que recebeu e aponta para a variável de ambiente; o preço pode sempre ser escrito
à mão.

---

## 4. Modo demo self-serve — LIGADO de ponta a ponta (2026-08-16)

O que durante várias sessões esteve "feito e testado mas sem uma única linha a
usá-lo" está agora ligado. Verificado contra o código nesta data:

- [x] **Migrações `0021` a `0027`** aplicadas (2026-08-09) e **`0043`** criada
      (o Tiago tem o link; acrescenta `spaces.last_activity_at`, preenche o
      passado e cria o índice parcial da retenção). **O cron da retenção
      devolve erro até a `0043` correr** — a app em si não é afetada.
- [x] **Domínio** — `retentionVerdict` ganhou `frozenAt` e os estados
      `congelado` (não se recongela: um cron diário reescrevia a data) e
      `descongelar` (voltou a haver vida, ou passou a `full`).
- [x] **Métodos de repositório** — `touchSpaceActivity`,
      `listSpacesForRetention` (só gratuitos, filtrado no repositório como
      última linha de defesa; `plan is null` conta como gratuito),
      `markRetentionWarned`, `setSpaceFrozen`, `countAppUsersCreatedOn`,
      `addToWaitlist` (repetir não reescreve), `listWaitlist`,
      `markWaitlistInvited`. Nos três: interface, Supabase, mock.
- [x] **Entrar conta como atividade** — o `getSpaceContext` marca
      `last_activity_at` ao abrir o ambiente, no máximo uma vez por dia
      (`precisaDeMarcarAtividade`). Erro engolido: falhar a marca não pode
      deitar abaixo a página.
- [x] **Congelamento com dentes** — guarda única em `lib/congelamento.ts`
      (`congelado()` ignora `frozen_at` velho em ambientes `full`), e um teste
      (`congelamento-actions.test.ts`) que **lê o código-fonte das 87 server
      actions** e obriga cada uma a passar pela guarda ou a estar na lista de
      excepções com motivo. Uma action nova sem guarda parte o `npm run test`
      no dia em que nasce. Excepções: leituras, cookies, fora-de-ambiente, e
      direitos que nunca se bloqueiam (apagar os próprios dados, pedir ajuda,
      reativar).
- [x] **Aviso no layout + «Reativar»** (`AvisoCongelado.tsx`,
      `reativarAmbienteAction`) — um clique, sem aprovação de ninguém; marca
      atividade para o cron da noite não recongelar.
- [x] **Cron** — `/api/cron/retencao` às 06:15 UTC (`vercel.json`), mesmo
      padrão de segredo do de cotações (falha fechada sem `CRON_SECRET`).
      Serviço em `retencao-service.ts`: a marca do aviso fica **antes** do
      envio (um Resend instável não pode virar um aviso por dia à mesma
      pessoa), e a passagem devolve relatório do que fez.
- [x] **Email de aviso** (`sendRetentionWarning`) — sem um único número de
      dentro do ambiente; diz duas vezes que nada se apaga.
- [x] **`decideSignup` ligado** — no `signInCallback`, no único ramo por onde
      uma conta nasce sozinha (SSO + registo aberto). Convites do admin não
      passam por lá. Quem não cabe vai para `/login?cheio=1`.
- [x] **Fila de espera** — `waitlistAction` em `landing-actions.ts` (honeypot,
      consentimento obrigatório, resposta igual para email novo e repetido — o
      formulário não é oráculo de quem está na fila), componente
      `FilaDeEspera` na porta fechada do `/login`, fila visível na
      `/plataforma` com «convidada/à espera», e o `inviteUserAction` marca
      `invited_at` sozinho quando o convite sai para um email da fila.
- [x] **RGPD na `/privacidade`** — os 90 dias, o congelamento (com o "não se
      apaga nada" e o «Reativar") e a secção da lista de espera. Data
      atualizada para 16/8/2026.
- [ ] **A landing ainda escreve em `contact_messages`.** A `waitlistAction`
      está pronta e é pública — falta o agente da landing apontar o formulário
      dele para ela (ou usar o componente `FilaDeEspera` com
      `source="landing"`). Deixado de fora de propósito para não pisar o
      `page.tsx` que ele tem em curso.
- [ ] **Convite de saída da fila em lote** — hoje convida-se um a um pela
      `/plataforma` («Dar acesso a alguém» com o email da fila). Chega para
      1 conta/dia.
- [ ] **`AUTH_OPEN_REGISTRATION=true`** — só no fim, e é decisão do Tiago.
      Continua a depender de fechar a "primeira entrada define a palavra-chave"
      (fechada a 2026-08-14 com o convite por ligação) — **essa parte está
      resolvida**; a decisão de ligar continua por tomar.

(As notas antigas sobre o bug do índice da `0021` e o `frozenAt` em falta
saíram daqui: a `0021` corrigida está aplicada — verificado no Supabase,
`waitlist_email_lower_key` existe e as políticas caíram — e o domínio da
retenção distingue `congelado` de `por congelar` desde 2026-08-16.)

---

## 5. Higiene de código, por fazer

- **`actions.ts` passou das 2400 linhas** (eram ~1900 há duas sessões, e cresce a cada funcionalidade nova). É o ficheiro onde estão quase todas as
  escritas da app e é onde as verificações de permissão têm de ser consistentes.
  Vale a pena parti-lo por área.
- **As importações gravam linha a linha, em sequência** (`await` dentro do
  `for`). Um ficheiro da Degiro de 147 linhas são 147 idas ao Supabase à vez,
  numa função serverless com tempo limitado, e sem transação: se estourar a
  meio, fica meio importado. O dedup salva a reimportação, mas o utilizador vê um
  erro sem saber o que ficou lá dentro.

---

## 6. Dívidas conhecidas

- [ ] **Primeira entrada define a palavra-chave.** Se um email conhecido ainda
      não tem palavra-chave, quem lá chegar primeiro escolhe-a e fica com a
      conta. O Tiago decidiu não mexer nisto agora. A saída natural é o convite
      levar um token, reutilizando o mecanismo do `password_reset_tokens`, que já
      existe e é sólido. **Fechar antes de abrir o registo.**
- [ ] **SSO Google/Microsoft** — falta a UI **e** as credenciais do Tiago. A
      terceira metade do bloqueio, as páginas legais abrirem sem sessão (que a
      Google exige para aprovar o ecrã de consentimento), **está resolvida**:
      vive agora em `lib/public-routes.ts`, com testes.
- [x] **Ticker a partir do nome** — feito na sessão de 2026-08-08 (por ficha) e
      08-09 (todos de uma vez, `suggestMissingSymbolsAction`). A regra é "o
      modelo sugere, os factos confirmam": o candidato só vale depois de a fonte
      de cotações devolver série, e a aplicação é sempre confirmada à mão. Esta
      linha esteve a dizer "não começado" durante duas sessões depois de estar
      feito.
- [ ] **Fusão de comerciantes e alcunhas** — mencionado, nunca feito.

---

## Decisões que só o Tiago pode tomar

| Decisão | Estado |
|---|---|
| Como fechar a "primeira entrada define a palavra-chave" | **Adiado pelo Tiago.** Fica como dívida conhecida. |
| Ligar `AUTH_OPEN_REGISTRATION` | Por decidir. Só depois da canalização **e** de fechar a linha acima. |
| Credenciais de SSO (Google/Microsoft) | Em falta. Falta também a UI. |
| O que fazer ao histórico ao acrescentar alguém | **Decidido: perguntar.** Tudo, desde uma data, ou dali para a frente. Implementado. |
| Limite de contas novas por dia | **Decidido: 1/dia.** Implementado em domínio, não ligado. |
| Retenção de ambientes gratuitos | **Decidido: congelar aos 90 dias, não apagar.** Não ligado. |
| Tectos do plano gratuito | **Decidido: 100 despesas, 10 bens, 2 pessoas, 1 ambiente.** Ligado. |
| Modo demo | **Decidido: self-serve com limites.** |

---

## Invariantes que esta app já pagou caro para aprender

Estão em `DECISOES.md` com o contexto todo. Os que mais se repetem:

1. **Uma leitura cortada mente em silêncio.** Toda a leitura que possa crescer
   passa por `todasAsLinhas`.
2. **Um número errado com uma data ao lado é pior do que nenhum número.**
3. **Dois caminhos que escrevem o mesmo campo aplicam as mesmas regras.**
4. **A IA escolhe colunas, não lê dados.**
5. **Nada do que um modelo responde entra sem ser validado** contra a grelha.
6. **Um limite nunca apaga nada.**
7. **Sem taxa de câmbio não se grava preço nenhum.**

A revisão acrescenta dois, aprendidos ao ver as mesmas falhas repetirem-se:

8. **Um `if not exists` é uma falha silenciosa à espera de acontecer.** Já custou
   a `waitlist` duas vezes: uma na tabela, outra no índice, na migração escrita
   de propósito para evitar a primeira. Se a instrução pode não fazer nada,
   confirma que fez.
9. **O que a app mostra tem de ser lido do valor, não do que o Excel desenha.**
   `raw: false` devolve texto formatado, e um formato de número chega para
   esconder um sinal negativo.
10. **Uma página pública não se assume, verifica-se sem sessão.** As páginas
    legais e a recuperação de palavra-chave estiveram a redirecionar para o
    login sem ninguém dar por isso, porque quem testa está quase sempre
    autenticado. É por isso que a lista vive num módulo com testes.

---

## Ficheiros do Tiago (importante)

Os ficheiros de teste — `Transactions_1.xlsx` e `Account_2.csv` da Degiro —
**não estão no repositório e não devem estar**: contêm movimentos financeiros
reais e este repositório é **público**. Pedir ao Tiago que os volte a anexar
para **confirmar** a correção da leitura do Excel (secção 3.3). Desta vez pedir
também **qual é o formato de número da coluna Quantidade**: é o que diz se o
caso real era o formato a esconder o sinal ou um template antigo gravado.

Ao escrever testes a partir deles, usar só a forma das linhas (sinais, formato
dos números, nomes de colunas) — nunca copiar o ficheiro para dentro do repo.
