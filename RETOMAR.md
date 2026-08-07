# Retomar — estado e trabalho em falta

> **Lê isto primeiro.** É o ponto de situação da última sessão, verificado contra
> o repositório, a base de dados e o GitHub — não de memória.
>
> Última atualização: 2026-08-07.

---

## Estado verificado

**Produção** (`main`) está estável e não depende de nada do que está por fazer.

| Em produção | |
|---|---|
| Correção do preço parado em 2020 (leitura das cotações vinha cortada aos 1000) | ✅ |
| Leitor paginado partilhado (`todasAsLinhas`) em despesas, movimentos e cotações | ✅ |
| Cotação na moeda de origem ao lado do preço em euros | ✅ |
| Botão de cotação por ativo + "Atualizar preços" para todos | ✅ **testado pelo Tiago, funciona** |
| Camada de IA a mapear colunas na importação | ✅ |
| Tectos do plano gratuito (`spaces.plan`) + aviso de quanto falta | ✅ |
| Congelamento a 90 dias e vagas diárias — **domínio puro, código inerte** | ⚠️ ver abaixo |

**Código inerte na `main`:** `retentionVerdict` e `decideSignup` existem e estão
testados, mas **nada os chama**. A migração `0021` está no repositório e **não
está aplicada**. Não há colunas `frozen_at` nem `retention_warned_at` na base de
dados. `AUTH_OPEN_REGISTRATION` continua **desligado**.

Base de dados: 6 ambientes, todos `plan='full'` (sem tectos). Tabela `waitlist`
existe desde a `0001_init` com `(id, email, name, consent, created_at)`.

---

## 1. Bug por corrigir — venda lida como compra

**É o mais importante da lista.** Uma venda importada como compra corrompe a
posição e a rentabilidade, em silêncio.

### O caso real

Ficheiro `Transactions_1.xlsx` da Degiro (o Tiago tem-no; **não está no
repositório** — ver "Ficheiros do Tiago" no fim). A venda da Knot:

```
linha 99:  09-12-2021 | KNOT OFFSHORE PARTNERS | Quantidade -23 | Valor local  321.54
linha 105: 16-08-2021 | KNOT OFFSHORE PARTNERS | Quantidade   7 | Valor local -130.20
```

Convenção da Degiro, coerente: **quantidade negativa + dinheiro a entrar = venda**.
A linha 99 é a venda. A regra actual (`quantity < 0 → venda`) leria isto bem.

### O que descartámos (não repetir)

- **Não é o sinal do valor.** A app só olha para a quantidade, mas neste ficheiro
  a quantidade *tem* sinal. Hipótese minha, errada.
- **Não é falta de coluna compra/venda.** Este ficheiro não tem essa coluna, e o
  cabeçalho é: `Data | Hora | Produto | ISIN | Bolsa de referência | Bolsa |
  Quantidade | Preços | | Valor local | | Valor EUR | Taxa de Câmbio | Taxa
  Autofx | Custos | Total EUR | ID da Ordem`. O Tiago lembrava-se de haver essa
  coluna; não há neste ficheiro. (O `Account_2.csv` tem uma coluna `T.` mas é a
  **moeda**, e a `Descrição` fala de "Levantamento/Crédito de divisa" — é o
  extrato de conta, não o de transações.)
- **Não é o `parseAmountCents` a perder o sinal em geral** — ele trata `-` e
  parênteses correctamente.

### A hipótese que ficou (por confirmar)

A quantidade passa pelo **leitor de valores monetários**:

```ts
// src/lib/import/trades.ts, rowsToTrades
const rawQty = parseAmountCents(row[mapping.quantityCol] ?? "");
const quantity = rawQty === null ? 0 : rawQty / 100;
```

E esse leitor faz `s.replace(/[€$£\s ]/g, "")` — onde o último carácter da classe
**é um espaço não separável (U+00A0)**, o que o Excel usa a separar milhares.
Suspeita: é aqui que o `-23` se perde.

**Isto é hipótese, não facto.** Já me enganei duas vezes neste bug. Confirmar
reproduzindo com a linha 99 antes de mexer.

### Correção proposta

1. **`parseQuantity` próprio**, com teste feito a partir da linha 99. Uma
   quantidade não tem moeda, nem parênteses contabilísticos, nem código de
   divisa colado — não deve passar pelo leitor de dinheiro. Precedente: já
   fizemos `parseRate` pela mesma razão ("1,0912" era lido como 10912).
2. **Usar o sinal do valor como verificação cruzada.** Nesta Degiro os dois
   sinais são sempre opostos e coerentes — é uma confirmação de graça. Se
   discordarem, **marcar para confirmação em vez de adivinhar**.
3. A IA para vocabulário de compra/venda (`V`/`C`, `S`/`B`, `Alienação`…) fica
   para os ficheiros que *tenham* essa coluna. Não resolve este caso.

---

## 2. Modo demo self-serve — canalização em falta

A lógica está feita e testada. Falta ligar tudo. Por ordem de dependência:

- [ ] **Aplicar a migração `0021`** (já reescrita como `ALTER`, ver nota abaixo).
      Tudo o resto depende disto.
- [ ] **Métodos de repositório** — contar contas criadas hoje; listar ambientes
      gratuitos com a última atividade; marcar aviso; congelar/descongelar;
      gravar na lista de espera. Em `Repository`, `SupabaseRepository` e
      `MockRepository`.
- [ ] **Rota de cron da retenção** + entrada no `vercel.json`. Protegida pelo
      `CRON_SECRET` que já existe.
- [ ] **Fazer o congelamento significar alguma coisa** — bloquear escritas nos
      ambientes congelados e explicar na app porque está bloqueado e como
      desbloquear. **Sem isto o resto é decorativo:** uma coluna que ninguém lê
      não protege dados de ninguém. Toca em *todos* os caminhos de escrita;
      falhar um é pior do que não ter congelamento, porque promete uma garantia
      que não cumpre.
- [ ] **Ligar o `decideSignup` ao registo** — contar contas do dia no callback do
      Auth.js, recusar quando não há vaga e encaminhar para a lista de espera.
- [ ] **Formulário da lista de espera** — na landing e no ecrã de "não há vagas".
- [ ] **Texto de RGPD** na `/privacidade` (a página existe e fala do mundo antigo,
      de dois utilizadores convidados). Dizer o que se guarda, quanto tempo, o que
      é o congelamento aos 90 dias, e como pedir os dados ou o apagamento.
- [ ] **Emails** — aviso de congelamento e convite de saída da fila. Resend já
      configurado.
- [ ] **`AUTH_OPEN_REGISTRATION=true`** — só no fim, e é decisão do Tiago.

### Nota sobre a migração `0021`

A primeira versão fazia `create table waitlist if not exists`. A tabela **já
existia** com outro schema, por isso a migração passaria em silêncio sem criar as
colunas novas e o código partia depois contra colunas inexistentes — o mesmo
padrão de falha silenciosa que a leitura cortada das cotações já custou. Foi
reescrita para `ALTER`. O `consent` que já lá estava é reutilizado como base
legal para enviar o convite.

---

## 3. Ticker a partir do nome — não começado

Ficheiros de corretora trazem `Apple Inc.` e a app precisa de `aapl.us`. Sem
isso não há cotação e o investimento vale o que foi escrito à mão.

Abordagem, com a regra que segurou tudo o resto: **o modelo sugere, os factos
confirmam.**

- O modelo propõe um símbolo candidato por nome, com bolsa e moeda esperadas.
- O candidato é **verificado contra a fonte de cotações** antes de valer. Se o
  Yahoo não devolver série, é descartado.
- Aparece como sugestão a confirmar na pré-visualização. **Um ticker errado é
  pior do que nenhum:** dá um preço plausível da empresa errada, e ninguém repara.

---

## 4. Dívidas antigas

- [ ] **SSO Google/Microsoft** — bloqueado à espera de credenciais do Tiago.
- [ ] **Fusão de comerciantes e alcunhas** — mencionado, nunca feito.

---

## Decisões que só o Tiago pode tomar

| Decisão | Estado |
|---|---|
| Ligar `AUTH_OPEN_REGISTRATION` | Por decidir. Só depois da canalização toda. |
| Credenciais de SSO (Google/Microsoft) | Em falta. Bloqueia o ponto 4. |
| Limite de contas novas por dia | **Decidido: 1/dia.** Implementado em domínio. |
| Retenção de ambientes gratuitos | **Decidido: congelar aos 90 dias, não apagar.** |
| Tectos do plano gratuito | **Decidido: 100 despesas, 10 bens, 2 pessoas, 1 ambiente.** |
| Modo demo | **Decidido: self-serve com limites.** |

---

## Invariantes que esta app já pagou caro para aprender

Estão em `DECISOES.md` com o contexto todo. Os que mais se repetem:

1. **Uma leitura cortada mente em silêncio.** A API do Supabase devolve 1000
   linhas sem avisar. Toda a leitura que possa crescer passa por `todasAsLinhas`.
2. **Um número errado com uma data ao lado é pior do que nenhum número.** A data
   só se mostra quando é mesmo a daquele valor.
3. **Dois caminhos que escrevem o mesmo campo aplicam as mesmas regras.** Senão o
   valor certo depende de que botão se carregou.
4. **A IA escolhe colunas, não lê dados.** Montantes, deduplicação e câmbio ficam
   sempre no código determinístico e testado.
5. **Nada do que um modelo responde entra sem ser validado** contra a grelha.
6. **Um limite nunca apaga nada.** Impede de criar mais; o que lá está fica.
7. **Sem taxa de câmbio não se grava preço nenhum.** Dólares gravados como euros
   inflacionam o património sem dar sinal.

---

## Ficheiros do Tiago (importante)

Os ficheiros de teste — `Transactions_1.xlsx` e `Account_2.csv` da Degiro —
**não estão no repositório e não devem estar**: contêm movimentos financeiros
reais e este repositório é **público**. Pedir ao Tiago que os volte a anexar
quando se for corrigir o bug do ponto 1.

Ao escrever testes a partir deles, usar só a forma das linhas (sinais, formato
dos números, nomes de colunas) — nunca copiar o ficheiro para dentro do repo.
