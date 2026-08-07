-- Congelamento de ambientes gratuitos inativos, e lista de espera.
--
-- Abrir o registo cria uma obrigação que não existia: passamos a guardar dados
-- financeiros de pessoas que os deixaram lá e nunca mais voltaram.

-- Ao fim de 90 dias sem atividade, um ambiente gratuito CONGELA: fica só de
-- leitura. Não se apaga nada. Congelar não cumpre a minimização do RGPD tão bem
-- como apagar, e isso fica dito; em troca ninguém perde dados por ter estado uns
-- meses sem entrar, e um erro nesta lógica é sempre reversível.
alter table spaces
  add column if not exists retention_warned_at timestamptz,
  add column if not exists frozen_at timestamptz;

comment on column spaces.retention_warned_at is
  'Quando se avisou do congelamento por inatividade. Um aviso anterior à última atividade não conta: a pessoa voltou e a contagem recomeçou.';
comment on column spaces.frozen_at is
  'Congelado por inatividade: só de leitura. Qualquer atividade descongela. Nunca implica apagar dados.';

-- Quem chegou depois das vagas do dia. Não é uma conta: é um email e uma data.
create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  -- De onde veio, para se perceber o que traz pessoas. Nunca conteúdo.
  source text,
  created_at timestamptz not null default now(),
  -- Quando foi convidado, se já foi. Null = ainda à espera.
  invited_at timestamptz
);

-- Um email só entra uma vez na fila: insistir não faz subir.
create unique index if not exists waitlist_email_key on waitlist (lower(email));

alter table waitlist enable row level security;

-- Sem políticas: só o service role lhe toca. Uma lista de emails de pessoas
-- interessadas não tem razão nenhuma para ser legível pelo cliente.
