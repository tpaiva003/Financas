-- Congelamento de ambientes gratuitos inativos, e lista de espera do registo.
--
-- Abrir o registo cria uma obrigação que não existia: passamos a guardar dados
-- financeiros de pessoas que os deixaram lá e nunca mais voltaram.

-- ---------------------------------------------------------------------------
-- Congelamento
-- ---------------------------------------------------------------------------
-- Ao fim de 90 dias sem atividade, um ambiente gratuito CONGELA: fica só de
-- leitura. Não se apaga nada. Congelar cumpre pior a minimização do RGPD do que
-- apagar, e isso fica dito; em troca ninguém perde dados por ter estado uns
-- meses sem entrar, e um erro nesta lógica é sempre reversível.
alter table spaces
  add column if not exists retention_warned_at timestamptz,
  add column if not exists frozen_at timestamptz;

comment on column spaces.retention_warned_at is
  'Quando se avisou do congelamento por inatividade. Um aviso anterior à última atividade não conta: a pessoa voltou e a contagem recomeçou.';
comment on column spaces.frozen_at is
  'Congelado por inatividade: só de leitura. Qualquer atividade descongela. Nunca implica apagar dados.';

-- ---------------------------------------------------------------------------
-- Lista de espera
-- ---------------------------------------------------------------------------
-- A tabela JÁ EXISTE desde a 0001_init, com (email, name, consent). Um
-- `create table if not exists` passaria em silêncio sem criar as colunas novas,
-- e o código partia depois contra colunas que não existem — exactamente o tipo
-- de falha silenciosa que este projeto já pagou caro. Por isso: ALTER.
--
-- O `consent` que lá está mantém-se e passa a ser usado: é o registo de que a
-- pessoa aceitou ser contactada, e é a base legal para lhe enviarmos o convite.
alter table waitlist
  -- De onde veio (landing, porta fechada do registo). Para se perceber o que
  -- traz pessoas. Nunca conteúdo.
  add column if not exists source text,
  -- Quando foi convidada, se já foi. Null = ainda à espera.
  add column if not exists invited_at timestamptz;

comment on column waitlist.consent is
  'A pessoa aceitou ser contactada. Sem isto não se envia convite nenhum.';
comment on column waitlist.invited_at is
  'Quando se enviou o convite. Null = ainda na fila.';

-- Um email só entra uma vez na fila: insistir não faz subir.
-- Índice único sobre lower(email), para "A@x.pt" e "a@x.pt" serem o mesmo.
--
-- ATENÇÃO AO NOME. Isto dizia `waitlist_email_key`, que é precisamente o nome
-- que o Postgres já deu ao índice da restrição `email text not null unique` da
-- 0001_init. O `if not exists` encontrava esse, emitia um NOTICE e nunca criava
-- o índice sobre lower(email) — enquanto o comentário aqui prometia que falharia
-- em voz alta se houvesse duplicados. É o mesmo modo de falha silenciosa que
-- esta migração foi reescrita para evitar, reintroduzido duas instruções
-- abaixo. Daí o nome próprio.
create unique index if not exists waitlist_email_lower_key on waitlist (lower(email));

-- A restrição original continua a existir e é sensível a maiúsculas, o que a
-- torna redundante face à de cima. Fica, porque removê-la não acrescenta nada.

alter table waitlist enable row level security;

-- A 0001_init já tinha ligado o RLS nesta tabela e criado DUAS políticas que
-- continuavam de pé: uma a deixar qualquer cliente inserir desde que pusesse
-- `consent = true`, e outra a deixar qualquer utilizador da app ler a lista
-- toda. O comentário que estava aqui — "sem políticas: só o service role lhe
-- toca" — descrevia uma coisa que não era verdade. Agora é: as políticas caem,
-- e a fila passa a ser mesmo só do service role.
drop policy if exists waitlist_insert on waitlist;
drop policy if exists waitlist_select on waitlist;
