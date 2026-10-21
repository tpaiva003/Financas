# Projeto: Rachar — despesas partilhadas e património

> **IMPORTANT: lê o `RETOMAR.md` antes de qualquer outra coisa.** É o primeiro
> ficheiro a abrir numa sessão nova: tem o estado verificado, o trabalho em
> falta, as decisões já tomadas e as que ainda esperam pelo Tiago. Sem ele
> arrisca-se refazer o que está feito ou repetir hipóteses já descartadas.
> Mantém-no atualizado no fim de cada sessão.

App web que substitui o Tricount/Splitwise: regista despesas (por importação de
extratos e à mão), divide-as e mantém o saldo entre as pessoas de um ambiente.
Cresceu para lá disso e hoje também faz património, investimentos e relatórios.

## O que este documento já disse e era mentira

Este ficheiro descreveu durante várias fases uma app que já não existia — "só
dois utilizadores", SSO como forma de entrar, parsing em Python — e uma sessão
inteira chegou a ser gasta a procurar coisas que não estavam lá. O que está
escrito aqui foi verificado contra o código em 2026-08-07. **Se encontrares
outra divergência, corrige este ficheiro na mesma sessão**: um documento com ar
de autoridade que está errado custa mais do que um documento que não existe.

## O que a app é hoje

- **Multi-inquilino.** A unidade de isolamento é o **ambiente** (`spaces`), com
  participantes (`members`), convites e papéis (`full` e `submitter`, este só
  submete e precisa de aprovação). Não são duas pessoas numa casa.
- **Entra-se com email e palavra-chave.** Os fornecedores Google e Microsoft
  estão configurados no Auth.js mas **não há botão nenhum na UI** — falta a
  interface, além das credenciais. A allow-list de emails já não decide quem
  entra; decide o plano.
- **Planos e tectos.** `free` tem limites (`domain/limits.ts`), `full` não tem.
  O registo aberto está implementado de ponta a ponta e desligado por bandeira
  (`AUTH_OPEN_REGISTRATION`).
- **Muito para lá das despesas:** património, ativos, movimentos de corretora,
  cotações, câmbio, calculadora FIRE, rendimentos, dívidas e amortização,
  recorrentes, metas, relatórios, exportação, consola de admin (`/plataforma`),
  caixa de contacto e recuperação de palavra-chave.
- **A landing (`/`), o login, `/recuperar`, `/privacidade` e `/termos` são
  públicos.** Todo o resto exige sessão (`lib/public-routes.ts`, com testes).

## Documentos

- `RETOMAR.md`, o ponto de situação. **Primeiro de todos.**
- `REQUISITOS.md`, a especificação original. Atenção: descreve a app de dois
  utilizadores sem registo aberto e **já não é o que existe**. Serve de
  história, não de contrato.
- `DECISOES.md`, as decisões tomadas com o contexto todo. É fiável.

## Stack (fixa, não trocar sem perguntar)

- **Next.js (App Router) + TypeScript + Tailwind**, como **PWA** instalável.
- **Auth.js (NextAuth)**: credenciais (email + palavra-chave) a funcionar;
  Google e Microsoft configurados mas sem UI.
- **Supabase**: Postgres e Storage (recibos).
- **Deploy**: Vercel (frontend) + Supabase (dados).
- **O parsing de ficheiros é TypeScript**, em `src/lib/import/`. Não há Python
  nenhum neste repositório e nunca houve.

### RLS não é a fronteira entre ambientes

Toda a app fala com o Supabase pela **chave de serviço**, que **ignora o RLS**.
As políticas existem em todas as tabelas mas são todas `is_app_user()` — nenhuma
olha para o `space_id`. Ou seja: **o isolamento entre ambientes é o `space_id`
que o código passa a cada consulta, e mais nada.** Um método de repositório que
procure por `id` sem filtrar pelo ambiente é uma falha de segurança, não um
descuido de estilo. Já aconteceu com seis métodos de despesas.

## Como trabalhar (autonomia)

- Trabalha **por fases**. Completa cada uma por inteiro — código, testes, app a
  correr — antes de avançar.
- **IMPORTANT:** no fim de cada fase corre `npm run test`, `npm run typecheck`,
  `npm run lint` e `npm run build`. Todos têm de passar.
- Escreve **testes** para a lógica crítica: deduplicação, saldo, divisão,
  classificação, leitura de ficheiros e isolamento entre ambientes.
- **Um teste novo tem de falhar contra o código antigo.** Se passa nos dois
  lados, não testa nada — reverte a correção por um momento e confirma.
- **Decide sozinho** as escolhas de baixo risco (nomes, pastas, bibliotecas
  auxiliares, detalhes de UI). Regista o que for relevante em `DECISOES.md`.
- **YOU MUST parar e perguntar** apenas quando: (a) precisas de
  credenciais/segredos reais; (b) uma ação é destrutiva ou irreversível; (c) uma
  ambiguidade altera o **modelo de dados** de forma significativa.
- **Segredos:** nunca inventes chaves reais. Usa variáveis de ambiente e mantém
  o `.env.example` com placeholders.
- **Este repositório é público.** Não escrevas aqui detalhes de falhas de
  segurança por corrigir, nem dados financeiros reais — nem sequer num teste.

## Barra de qualidade

- Responsivo, verificado em **mobile e desktop**.
- Sem ecrãs partidos: carregamento, vazio e erro tratados. Há `error.tsx`,
  `global-error.tsx`, `not-found.tsx` e `loading.tsx` — mantém-nos a funcionar.
- Acessibilidade básica: labels, contraste, navegação por teclado.
- Adicionar uma despesa partilhada no telemóvel = poucos toques.
- Privacidade: nada acessível sem sessão a não ser as páginas públicas listadas
  acima.

## Entregáveis no fim de cada fase

- App a correr localmente, com `README.md` fiel.
- `.env.example` completo.
- Script de **seed** que deixa a app navegável de ponta a ponta.
- Testes a passar.
- `DECISOES.md` e `RETOMAR.md` atualizados.

## Invariantes do domínio (YOU MUST, nunca violar)

- **Deduplicação por UID estável:** a mesma transação nunca entra duas vezes…
- **…e duas transações diferentes nunca viram uma.** O segundo sentido é tão
  importante como o primeiro e foi o que faltou: dois cafés iguais no mesmo dia
  davam a mesma chave e um desaparecia calado.
- **Entradas manuais nunca são reclassificadas automaticamente.**
- **"Quem pagou" é independente de "como se divide".**
- O **saldo tem de ser sempre explicável** até às despesas que o compõem, e
  **mexer nos membros nunca reescreve o passado**.
- **Sem taxa de câmbio não se grava preço nenhum.**
- **A IA escolhe colunas, não lê dados.** Montantes, dedup e câmbio ficam sempre
  em código determinístico e testado.
- **Um limite nunca apaga nada.**
- A **landing page** é pública e nunca expõe dados nem a app.

## Modos de falha que esta app já pagou para aprender

1. **Uma leitura cortada mente em silêncio.** O Supabase devolve 1000 linhas sem
   avisar. Toda a leitura que possa crescer passa por `todasAsLinhas`.
2. **Um `if not exists` pode não fazer nada.** Aconteceu duas vezes na mesma
   tabela, a segunda na migração escrita para evitar a primeira. Se a instrução
   pode ser saltada, confirma que não foi.
3. **O que o Excel desenha não é o que a célula vale.** `raw: false` devolve
   texto formatado, e um formato de número chega para esconder um sinal
   negativo — e transformar todas as vendas em compras.
4. **Um `as unknown as` não valida nada.** Dados guardados por versões antigas
   chegam incompletos, e `undefined >= 0` é `false`, o que se lê como "esta
   coluna não existe".
5. **Um número errado com ar de resposta é pior do que erro nenhum.** "100 anos",
   "150% de retorno", uma mais-valia decidida por um UUID — ninguém desconfia.
6. **Um teste que não falha contra o bug não é um teste.**
