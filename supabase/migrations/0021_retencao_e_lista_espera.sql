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
-- Cria-se em índice único sobre lower(email) para "A@x.pt" e "a@x.pt" serem o
-- mesmo. Se já houver duplicados, isto falha — e é bom que falhe agora, em vez
-- de deixar a mesma pessoa receber dois convites.
create unique index if not exists waitlist_email_key on waitlist (lower(email));

alter table waitlist enable row level security;
-- Sem políticas: só o service role lhe toca. Uma lista de emails de pessoas
-- interessadas não tem razão nenhuma para ser legível pelo cliente.
