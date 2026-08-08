# Retomar — estado e trabalho em falta

> **Lê isto primeiro.** É o ponto de situação da última sessão, verificado contra
> o repositório, a base de dados e o GitHub — não de memória.
>
> Última atualização: 2026-08-08 (investimentos e crédito à habitação).

---

## 0. O que foi feito na sessão de 2026-08-07

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

## 0b. Sessão de 2026-08-08 — investimentos e crédito à habitação

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

---

## 1. Modo demo self-serve — canalização em falta

A lógica está feita e testada. Falta ligar tudo. Confirmado na revisão: **8 dos
9 pontos estão mesmo por fazer** (o do RGPD está parcialmente feito, ver abaixo).

- [ ] **Aplicar as migrações `0021`, `0022`, `0023` e `0024`.** A `0021` já foi
      corrigida (ver secção 0) e pode ser aplicada como está. As `0022`
      (participação dos membros), `0023` (uid por ambiente) e `0024` (crédito à
      habitação) são das duas últimas sessões e o código já conta com elas — **a
      app funciona sem elas, mas as correções do saldo e do dedup, e os períodos
      de taxa, só valem depois de aplicadas**.
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

## 2. Higiene de código, por fazer

- **`actions.ts` tem ~1900 linhas.** É o ficheiro onde estão quase todas as
  escritas da app e é onde as verificações de permissão têm de ser consistentes.
  Vale a pena parti-lo por área.
- **As importações gravam linha a linha, em sequência** (`await` dentro do
  `for`). Um ficheiro da Degiro de 147 linhas são 147 idas ao Supabase à vez,
  numa função serverless com tempo limitado, e sem transação: se estourar a
  meio, fica meio importado. O dedup salva a reimportação, mas o utilizador vê um
  erro sem saber o que ficou lá dentro.

---

## 3. Dívidas conhecidas

- [ ] **Primeira entrada define a palavra-chave.** Se um email conhecido ainda
      não tem palavra-chave, quem lá chegar primeiro escolhe-a e fica com a
      conta. O Tiago decidiu não mexer nisto agora. A saída natural é o convite
      levar um token, reutilizando o mecanismo do `password_reset_tokens`, que já
      existe e é sólido. **Fechar antes de abrir o registo.**
- [ ] **SSO Google/Microsoft** — falta a UI **e** as credenciais do Tiago.
- [ ] **Ticker a partir do nome** — confirmado: não começado. A regra continua a
      ser "o modelo sugere, os factos confirmam": o candidato só vale depois de a
      fonte de cotações devolver série. Um ticker errado é pior do que nenhum.
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

---

## Ficheiros do Tiago (importante)

Os ficheiros de teste — `Transactions_1.xlsx` e `Account_2.csv` da Degiro —
**não estão no repositório e não devem estar**: contêm movimentos financeiros
reais e este repositório é **público**. Pedir ao Tiago que os volte a anexar
para **confirmar** a correção da leitura do Excel (secção 0). Desta vez pedir
também **qual é o formato de número da coluna Quantidade**: é o que diz se o
caso real era o formato a esconder o sinal ou um template antigo gravado.

Ao escrever testes a partir deles, usar só a forma das linhas (sinais, formato
dos números, nomes de colunas) — nunca copiar o ficheiro para dentro do repo.
