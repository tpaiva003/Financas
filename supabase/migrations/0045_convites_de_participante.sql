-- Convites de participante, para o acesso de submissão ser opt-in.
--
-- Dar acesso a um participante criava a conta NO MOMENTO em que o email era
-- escrito — pela mão de quem convidava, não de quem era convidado. A pessoa
-- ganhava uma conta (com o email dela lá dentro) sem saber, sem consentir e
-- sem palavra-chave. Passa a haver um convite: a conta só nasce quando quem
-- recebe o email abre a ligação e escolhe a palavra-chave.
--
-- Guarda-se o HASH do token, nunca o token — como nos tokens de recuperação
-- (0015): quem ler esta tabela não consegue aceitar convite nenhum.
create table if not exists member_invites (
  id            text primary key,
  space_id      text not null,
  member_id     text not null,
  email         text not null,
  token_hash    text not null unique,
  invited_by    text not null,
  expires_at    timestamptz not null,
  accepted_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists member_invites_space_idx on member_invites (space_id);
create index if not exists member_invites_member_idx on member_invites (member_id);

alter table member_invites enable row level security;
drop policy if exists member_invites_all on member_invites;
create policy member_invites_all on member_invites
  for all using (is_app_user()) with check (is_app_user());

comment on table member_invites is
  'Convites pendentes de acesso de submissão. A conta do convidado só é criada quando ele aceita em /convite/[token].';
