# Retomar — estado e trabalho em falta

> **Lê isto primeiro.** É o ponto de situação da última sessão, verificado contra
> o repositório, a base de dados e o GitHub — não de memória.
>
> Última atualização: 2026-08-07 (sessão de revisão).

---

## 0. O que a revisão de 2026-08-07 mudou nesta lista

Uma sessão inteira a rever o repositório. O que saiu de lá, por ordem de
importância:

1. **Há falhas críticas de isolamento entre ambientes e de autenticação.**
   Passaram a ser a prioridade número um, à frente do bug da venda. Não estão
   descritas aqui em detalhe **de propósito**: este repositório é público e a app
   está em produção com dados reais. O detalhe foi entregue ao Tiago em separado.
   **Nada de registo aberto antes disto estar corrigido** — hoje o `plan` e os
   tectos travam o volume, não o acesso.
2. **O diagnóstico do bug da venda (secção 1) estava errado.** As três hipóteses
   que lá estavam foram testadas e nenhuma se confirma. A secção foi reescrita
   com o que ficou provado e com o que falta mesmo testar.
3. **A app compila, os testes passam.** `npm test` → 443 testes, 33 ficheiros.
   `npm run typecheck` → limpo. `npm run build` → passa. `npm run lint` → limpo.
   Isto foi corrido, não presumido.
4. **O `CLAUDE.md` está desatualizado ao ponto de enganar** quem abrir uma sessão
   nova. Ver secção 6.

---

## 1. Bug por corrigir — venda lida como compra

**Continua a ser o bug funcional mais importante.** Uma venda importada como
compra corrompe a posição e a rentabilidade, em silêncio.

### O que foi DESCARTADO com prova (não repetir)

A hipótese que a sessão anterior deixou como "a que ficou" **está morta**:

- **Não é o espaço não separável (U+00A0) no `parseAmountCents`.** A linha é
  `s.replace(/[€$£\s ]/g, "")` e em JavaScript o `\s` **já** apanha o
  U+00A0. O carácter está lá duas vezes; nenhuma delas falha. Verificado a
  correr, não a ler.
- **Não é o `parseAmountCents` a perder o sinal.** `parseAmountCents("-23")`
  devolve `-2300`. Também trata parênteses e milhares com espaço.
- **Não é a deteção de colunas.** Reconstruí o cabeçalho da Degiro descrito
  abaixo e corri o `detectTradeMapping` + `rowsToTrades` reais: o mapeamento sai
  certo (`quantityCol: 6`, `kindCol: -1`) e a linha da venda **é importada como
  `venda`**, com a quantidade, o preço, a moeda e o câmbio certos.

Ou seja: **pelo caminho da deteção automática, com o ficheiro em CSV, este bug
não acontece.** O que sobra são os outros caminhos.

### As duas hipóteses vivas

**(a) O formato de número do Excel esconde o sinal.** Esta está **provada como
mecanismo**, falta confirmar que é o caso deste ficheiro. O `readXlsx` lê com
`raw: false`, ou seja, recebe o texto **como o Excel o mostra**, não o valor. E
há formatos correntes que mostram um negativo sem sinal:

| Formato da célula | `-23` é lido como |
|---|---|
| `General` | `"-23"` ✅ |
| `#,##0` | `"-23"` ✅ |
| `#,##0;[Red]#,##0` | `"23"` ❌ **sinal perdido** |
| `#,##0;(#,##0)` | `"(23)"` ✅ (os parênteses são tratados) |

O formato "negativo a vermelho sem sinal" é o que o Excel oferece por omissão em
várias localizações. Com ele, **toda a venda vira compra** e nada avisa.
Reproduzido a correr o `xlsx` do projeto, não em teoria.

Contra esta hipótese: o RETOMAR anterior transcreve a célula como `-23`, com
sinal. Se o Tiago viu o sinal no Excel, o formato mostra-o e não é isto. Vale
confirmar qual é o formato da coluna antes de mexer.

**(b) Um formato aprendido antigo a sobrepor-se à deteção.** Em
`broker-import.ts` os templates guardados **ganham à deteção** e são usados
**sem validação nenhuma** (`tpl.mapping as unknown as TradeMapping`). Um template
gravado uma vez com as colunas trocadas fica a estragar todas as importações
seguintes daquele formato, para sempre e em silêncio. Pior: os campos que faltem
num template antigo ficam `undefined`, e `undefined >= 0` é `false` — o que
**desliga a coluna da moeda e a do câmbio** sem dizer nada, e dólares passam a
ser gravados como euros. É exatamente a falha que o invariante 7 proíbe.

Vale a pena verificar se existe um template gravado para o fingerprint deste
ficheiro. É a explicação que melhor encaixa em "acontece-me a mim e não se
reproduz".

### Correção proposta (revista)

1. **Ler a quantidade do valor cru, não do texto formatado.** A causa (a)
   resolve-se lendo a célula com o valor numérico do Excel em vez do texto que
   ele mostra. Um `parseQuantity` próprio continua a fazer sentido — uma
   quantidade não tem moeda nem parênteses contabilísticos — mas **não é isso que
   resolve este bug**, ao contrário do que a versão anterior desta nota dizia.
2. **Validar os templates aprendidos antes de os usar**, e versioná-los. Um
   template sem `currencyCol` não deve ser tratado como "sem moeda"; deve ser
   tratado como "template velho, volta a detetar".
3. **Usar o sinal do valor como verificação cruzada.** Nesta Degiro os dois
   sinais são sempre opostos e coerentes. Se discordarem, **marcar para
   confirmação em vez de adivinhar**.

---

## 2. Correções e números errados encontrados na revisão

Nenhum destes tem teste que os apanhe — os 443 que existem passam todos.

- **Mudar os membros do ambiente re-divide todo o histórico.** O
  `computeBalance` divide cada despesa pela lista de membros **atual**, e a
  despesa não guarda quem participou nela. Acrescentar uma terceira pessoa faz
  com que ela passe a dever a sua parte de jantares de janeiro em que não esteve,
  e inverte o saldo de quem lá estava. Como os acertos são valores fixos, um
  acerto já pago deixa um resíduo permanente. **É o oposto do invariante "o saldo
  tem de ser sempre explicável".** É a correção de domínio mais séria da lista.
- **Duas transações mesmo iguais no mesmo dia colidem no mesmo UID** e uma
  desaparece. Dois cafés iguais, dois bilhetes de metro, dois abastecimentos: o
  `canonicalKey` não tem índice de ocorrência, e o índice único na base de dados
  remata. O invariante está escrito num sentido só ("nunca entra duas vezes"); o
  sentido inverso não está guardado. Note-se o contraste com
  `newTradesOnly`, que **conta** repetições de propósito e acerta.
- **O índice único das despesas é global, não por ambiente**
  (`expenses (uid) where deleted_at is null`) e o `canonicalKey` não inclui o
  `space_id`. Dois ambientes que importem a mesma linha do mesmo banco colidem.
- **Movimentos do mesmo dia são ordenados por `id`.** Uma compra e uma venda no
  mesmo dia são ordenadas por UUID, ou seja, à sorte, e o custo médio e a
  mais-valia realizada mudam conforme o sorteio — **sem `oversold`, sem aviso**.
- **A comparação com o índice ignora as entradas anteriores ao início da série**
  mas mantém o valor da carteira inteiro. Metade dos reforços fora da conta dá
  150% de rentabilidade onde a verdade são 25%.
- **Um empréstimo que nunca amortiza é reportado como um empréstimo a 100 anos**
  em vez de "nunca paga". O `neverPaysOff` só dispara quando a prestação não
  cobre o juro do **primeiro** mês; o tecto de 1200 meses é devolvido como se
  fosse uma resposta.

---

## 3. Coisas partidas que se veem da rua

- **O link "Esqueci-me" não funciona, e as páginas legais também não.** O
  `middleware.ts` só tem `/` e `/login` como públicos. `/recuperar`,
  `/recuperar/[token]`, `/privacidade` e `/termos` exigem sessão. A landing e o
  login **têm links para as três** — quem não tem sessão é atirado de volta para
  o `/login`. Ou seja: a recuperação de palavra-chave está morta para exatamente
  quem precisa dela, e a política de privacidade não é alcançável por um
  visitante, o que também é um problema de RGPD com a landing pública.
- **Não há um único `error.tsx`, `loading.tsx` ou `not-found.tsx` na app.** A
  camada de dados atira `new Error(error.message)` por todo o lado; qualquer
  falha do Supabase dá o ecrã de erro cru do Next, sem caminho de volta. A barra
  de qualidade do `CLAUDE.md` pede explicitamente o contrário.
- **`X-Robots-Tag: noindex, nofollow` está aplicado a `/:path*`**, ou seja,
  também à landing. Se a landing passar a ser a porta de entrada de registo
  aberto, está a ser escondida dos motores de busca.

---

## 4. Modo demo self-serve — canalização em falta

A lógica está feita e testada. Falta ligar tudo. Confirmado na revisão: **8 dos
9 pontos estão mesmo por fazer** (o do RGPD está parcialmente feito, ver abaixo).

- [ ] **Aplicar a migração `0021`.** ⚠️ **Tem um bug, corrigir antes de aplicar** —
      ver a nota a seguir.
- [ ] **Métodos de repositório** — contar contas criadas hoje; listar ambientes
      gratuitos com a última atividade; marcar aviso; congelar/descongelar;
      gravar na lista de espera. Em `Repository`, `SupabaseRepository` e
      `MockRepository`. Existe já um `lastActivity` no `getPlatformStats`, mas o
      `SpaceSummary` não traz o `plan` (não dá para escolher os gratuitos) e o
      `lastActivity` sai só das datas das despesas — **não conta os logins**, que
      é o que a própria regra 3 do `retencao.ts` exige.
- [ ] **Rota de cron da retenção** + entrada no `vercel.json`.
- [ ] **Fazer o congelamento significar alguma coisa** — bloquear escritas nos
      ambientes congelados e explicar na app porque está bloqueado. **Sem isto o
      resto é decorativo.** Hoje são **zero linhas**: não há uma única ocorrência
      de `frozen`/`congelado` em `.ts`/`.tsx`. Toca em ~40 caminhos de escrita.
- [ ] **Ligar o `decideSignup` ao registo.**
- [ ] **Formulário da lista de espera.** Hoje a landing escreve em
      `contact_messages`, não em `waitlist`.
- [ ] **Texto de RGPD na `/privacidade`.** ⚠️ **A nota anterior estava errada:** a
      página **não** fala "do mundo antigo, de dois utilizadores convidados". Já
      está datada de 5/8/2026 e já descreve ambientes isolados, subcontratantes e
      apagamento de conta. O que falta mesmo é só o texto dos 90 dias e do
      congelamento — e a secção de retenção atual ("enquanto tiveres conta")
      passa a contradizê-lo.
- [ ] **Emails** — aviso de congelamento e convite de saída da fila. O Resend
      está mesmo configurado; só existem `sendInvite` e `sendPasswordReset`.
- [ ] **`AUTH_OPEN_REGISTRATION=true`** — só no fim, e é decisão do Tiago.
      **Agora também depende das correções de segurança da secção 0.**

### A migração `0021` tem o bug que ela própria diz ter evitado

O cabeçalho da `0021` explica, com razão, que um `create table if not exists`
sobre uma tabela existente passa em silêncio sem criar nada. E depois, duas
instruções abaixo, faz exatamente o mesmo com um índice:

```sql
create unique index if not exists waitlist_email_key on waitlist (lower(email));
```

A `0001_init.sql` já declara `email text not null unique` na `waitlist`, e o
Postgres chama ao índice dessa restrição **`waitlist_email_key`** — o mesmo nome.
O `if not exists` encontra-o, emite um `NOTICE` e **nunca cria o índice sobre
`lower(email)`**. O comentário promete que "se já houver duplicados, isto falha —
e é bom que falhe agora": não falha, passa calado, e `A@x.pt` e `a@x.pt` ficam
como duas pessoas diferentes. Dar-lhe outro nome resolve.

Na mesma migração, o comentário *"Sem políticas: só o service role lhe toca"* é
falso: a `0001_init.sql` já criou duas políticas na `waitlist` que a `0021` não
remove, uma delas a permitir `insert` a qualquer cliente que ponha
`consent = true`.

E o domínio ainda não está pronto para ser ligado: o `RetentionInput` não tem
`frozenAt`, por isso o `retentionVerdict` não distingue "deve congelar" de "já
está congelado" — um cron diário voltava a decidir `congelar` todos os dias.

---

## 5. Código morto e duplicado

- **`buildTradesPreview` (166 linhas) e `buildHoldingsPreview` (117 linhas) não
  são chamados por ninguém.** Foram substituídos pelo `buildBrokerPreview`, que
  reimplementa a mesma lógica de dedup e de templates. Só o `commitTradesImport`
  do `trades-import.ts` continua vivo. São ~250 linhas de lógica quase idêntica à
  que está em produção, prontas a divergir — e a próxima sessão pode muito bem ir
  corrigir o caminho morto, convencida de que está a corrigir o vivo.
- **`isDevLoginEnabled()` não tem chamadores.** O `AUTH_DEV_LOGIN` no
  `.env.example`, o comentário no topo do `auth.ts` e o README continuam a
  prometer um botão de "Modo de desenvolvimento" que já não existe.
- **`actions.ts` tem 1861 linhas.** É o ficheiro onde estão quase todas as
  escritas da app e é onde as verificações de permissão têm de ser consistentes.
  Vale a pena parti-lo por área.
- **As importações gravam linha a linha, em sequência** (`await` dentro do
  `for`). Um ficheiro da Degiro de 147 linhas são 147 idas ao Supabase à vez,
  numa função serverless com tempo limitado, e sem transação: se estourar a
  meio, fica meio importado. O dedup salva a reimportação, mas o utilizador vê um
  erro sem saber o que ficou lá dentro.

---

## 6. O `CLAUDE.md` e o `README.md` estão a mentir

Isto custa uma sessão inteira a quem chegar de novo. O `CLAUDE.md` afirma, na
secção que diz "stack fixa, não trocar sem perguntar":

| O `CLAUDE.md` diz | O código faz |
|---|---|
| "Só dois utilizadores" | Multi-inquilino desde a `0003`: ambientes, membros, convites, papéis, aprovações |
| "Auth.js com Google e Microsoft + allow-list de 2 emails" | Entra-se com **email e palavra-chave**. Os fornecedores SSO estão configurados mas **não há botão nenhum na UI** — não é só falta de credenciais. E a allow-list já não decide quem entra, só o plano |
| Despesas, divisão e saldo | Também património, ativos, movimentos, cotações, câmbio, FIRE, rendimentos, dívidas, recorrentes, metas, relatórios, exportação, consola de admin, caixa de contacto, recuperação de palavra-chave |
| "Reutilizar a lógica Python existente" | Não há Python nenhum no repositório |
| `REQUISITOS.md`: "sem registo aberto" | O registo aberto está implementado de ponta a ponta; só a bandeira está desligada |

O próprio código já sabe disto — o `login/page.tsx` tem lá escrito *"já não são
'2 emails'"*. **O documento com ar de autoridade é o que está errado.** O
`RETOMAR.md` e o `DECISOES.md` são o registo fiável.

**O `README.md` também:** diz para aplicar a `0001_init.sql` (são 21 migrações),
manda clicar num botão de modo de desenvolvimento que não existe, anuncia "41
testes" (são 443), e o `.env.example` declara `AUTH_URL` duas vezes — a segunda,
que é a que vale, aponta para `https://rachar.pt`, o que parte os redirecionamentos
de autenticação em local.

**O `npm run seed` está partido.** Insere despesas com `payer_id`/`owner_id` a
apontar para `"tiago"`/`"clara"`, mas desde a `0003` essas colunas são chaves
estrangeiras para `members(id)`, e o script nunca insere um único membro. Numa
base de dados nova rebenta na chave estrangeira. É um dos entregáveis por fase do
`CLAUDE.md`.

---

## 7. Dívidas antigas

- [ ] **SSO Google/Microsoft** — falta a UI **e** as credenciais do Tiago.
- [ ] **Ticker a partir do nome** — confirmado: não começado. A regra continua a
      ser "o modelo sugere, os factos confirmam": o candidato só vale depois de a
      fonte de cotações devolver série. Um ticker errado é pior do que nenhum.
- [ ] **Fusão de comerciantes e alcunhas** — mencionado, nunca feito.

---

## Decisões que só o Tiago pode tomar

| Decisão | Estado |
|---|---|
| **Corrigir as falhas de segurança da secção 0** | **Por decidir — bloqueia tudo o resto** |
| Ligar `AUTH_OPEN_REGISTRATION` | Por decidir. Só depois da canalização **e** da segurança. |
| Credenciais de SSO (Google/Microsoft) | Em falta. |
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

---

## Ficheiros do Tiago (importante)

Os ficheiros de teste — `Transactions_1.xlsx` e `Account_2.csv` da Degiro —
**não estão no repositório e não devem estar**: contêm movimentos financeiros
reais e este repositório é **público**. Pedir ao Tiago que os volte a anexar
quando se for corrigir o bug do ponto 1. Desta vez, pedir também **qual é o
formato de número da coluna Quantidade** — é o que decide a hipótese (a).

Ao escrever testes a partir deles, usar só a forma das linhas (sinais, formato
dos números, nomes de colunas) — nunca copiar o ficheiro para dentro do repo.
