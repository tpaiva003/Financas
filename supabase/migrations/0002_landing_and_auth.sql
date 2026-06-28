-- =============================================================================
-- Finanças — migração 0002
--  - Palavra-chave por utilizador (login interim enquanto o SSO não está ligado).
--  - Mensagens de contacto vindas da landing pública (REQ-LAND).
-- =============================================================================

-- Palavra-chave (hash) por utilizador. Definida na 1.ª entrada.
alter table app_users add column if not exists password_hash text;

-- Mensagens de contacto da landing. Separadas dos dados financeiros.
create table if not exists contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text,
  email      text not null,
  message    text not null,
  consent    boolean not null default false,
  source     text default 'landing',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists contact_messages_created_idx on contact_messages (created_at desc);

alter table contact_messages enable row level security;

-- Inserção pública (a partir da landing) apenas com consentimento dado.
drop policy if exists contact_insert on contact_messages;
create policy contact_insert on contact_messages
  for insert with check (consent = true);

-- Leitura só por utilizadores autenticados da app (o admin lê no inbox).
drop policy if exists contact_select on contact_messages;
create policy contact_select on contact_messages
  for select using (is_app_user());
