-- 0015 Recuperação de palavra-chave.
--
-- Guarda-se o HASH do token, nunca o token. Quem conseguir ler esta tabela não
-- consegue entrar em conta nenhuma, que é a diferença entre uma fuga chata e um
-- desastre. Validade curta e uso único.

create table if not exists password_reset_tokens (
  id          text primary key,
  user_id     text not null,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists password_reset_user_idx on password_reset_tokens (user_id);

alter table password_reset_tokens enable row level security;
drop policy if exists password_reset_all on password_reset_tokens;
create policy password_reset_all on password_reset_tokens
  for all using (is_app_user()) with check (is_app_user());
