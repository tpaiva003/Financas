-- A atividade que conta para a retenção, incluindo entrar.
--
-- A `0021` deu ao `spaces` o `retention_warned_at` e o `frozen_at`, mas não a
-- coisa de que os dois dependem: **quando é que alguém esteve aqui pela última
-- vez**. Até agora a única aproximação era a data da despesa mais recente, que o
-- `getPlatformStats` já calculava — e essa mede outra coisa.
--
-- A diferença não é de detalhe. A regra 3 do `domain/retencao.ts` diz que
-- *entrar já conta*: quem abre a app todas as semanas para ver o saldo, e nunca
-- lança nada, está a usar o ambiente. Contar só despesas dava a esse ambiente
-- exactamente o mesmo perfil de um que ninguém abre há um ano, e congelava-o ao
-- fim de 90 dias com a pessoa lá dentro a olhar para ele. Um ambiente só de
-- consulta é um caso de uso, não um abandono.
--
-- Fica no `spaces` e não no `app_users` de propósito: o que congela é o
-- ambiente, e um ambiente pode ter várias pessoas. A última atividade dele é a
-- última vez que **alguém** lá entrou, não a última vez que uma pessoa em
-- particular entrou na app.
alter table spaces
  add column if not exists last_activity_at timestamptz;

comment on column spaces.last_activity_at is
  'A última vez que alguém abriu este ambiente. Entrar conta como atividade: um ambiente só de consulta é um caso de uso, não um abandono. Escreve-se no máximo uma vez por dia.';

-- Os ambientes que já existem não nascem com o contador a zero.
--
-- Sem isto, todos eles ficariam com `last_activity_at` nulo, a contagem recuava
-- para a data de criação, e o primeiro cron de retenção a correr encontrava
-- ambientes com mais de 90 dias "sem atividade" que na verdade estão em uso
-- diário. Hoje não congelava nenhum, porque são todos `full` e o veredito nem
-- chega a olhar para as datas — mas depender disso é depender de uma coincidência
-- que deixa de valer no dia em que existir o primeiro ambiente gratuito.
--
-- A melhor aproximação disponível para o passado é o que já se usava: a despesa
-- mais recente, com a data de criação como rede.
update spaces s
set last_activity_at = greatest(
  s.created_at,
  coalesce((select max(e.created_at) from expenses e where e.space_id = s.id), s.created_at)
)
where s.last_activity_at is null;

-- Para o cron ir buscar os candidatos sem varrer a tabela toda. Os `full` nunca
-- são candidatos, e é por isso que o índice os deixa de fora.
create index if not exists spaces_retencao_idx
  on spaces (last_activity_at)
  where plan is distinct from 'full';
