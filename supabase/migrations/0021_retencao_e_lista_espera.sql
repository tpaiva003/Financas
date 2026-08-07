-- Retenção de ambientes gratuitos, e lista de espera para o registo aberto.
--
-- Abrir o registo cria uma obrigação que não existia: passamos a guardar dados
-- financeiros de pessoas que os deixaram lá e nunca mais voltaram. Guardar para
-- sempre é acumular risco sobre informação que ninguém pediu para manter.

-- Quando se avisou que o ambiente ia ser apagado. Sem isto não há forma de
-- garantir a regra que importa: ninguém perde dados sem ter sido avisado antes.
alter table spaces
  add column if not exists retention_warned_at timestamptz;

comment on column spaces.retention_warned_at is
  'Quando se avisou do apagamento por inatividade. Um aviso anterior à última atividade não conta: a pessoa voltou e a contagem recomeçou.';

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
