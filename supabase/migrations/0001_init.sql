-- =============================================================================
-- Finanças — App de Despesas Partilhadas
-- Migração inicial: modelo de dados + RLS (row-level security).
--
-- Modela as entidades da Secção 3 do REQUISITOS.md. Os valores monetários são
-- guardados em CÊNTIMOS INTEIROS (amount_cents). A divisão (split) é jsonb.
--
-- Nota de arquitetura (ver DECISOES.md): no MVP, o acesso a dados é server-side
-- com a service-role key (que ignora RLS) e a privacidade é aplicada na camada
-- de aplicação. As políticas RLS abaixo são defesa em profundidade e ficam
-- prontas para quando houver acesso direto a partir do cliente via Supabase Auth.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Utilizadores do agregado (exatamente 2). Id estável (slug) usado no domínio.
-- -----------------------------------------------------------------------------
create table if not exists app_users (
  id          text primary key,
  email       text not null unique,
  name        text not null,
  sso_provider text,
  created_at  timestamptz not null default now()
);

-- Mapeia o email do JWT (quando houver Supabase Auth) para o app_user.
create or replace function current_app_user_id()
returns text
language sql
stable
as $$
  select u.id
  from app_users u
  where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;

create or replace function is_app_user()
returns boolean
language sql
stable
as $$
  select current_app_user_id() is not null
$$;

-- -----------------------------------------------------------------------------
-- Categorias (personalizáveis).
-- -----------------------------------------------------------------------------
create table if not exists categories (
  id         text primary key,
  name       text not null,
  color      text not null default '#64748b',
  icon       text,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Regras de classificação: palavra-chave → categoria e/ou partilhada|pessoal.
-- -----------------------------------------------------------------------------
create table if not exists classification_rules (
  id          uuid primary key default gen_random_uuid(),
  keyword     text not null,
  category_id text references categories(id) on delete set null,
  kind        text check (kind in ('shared','personal')),
  priority    int not null default 100,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Despesas.
-- -----------------------------------------------------------------------------
create table if not exists expenses (
  id                 uuid primary key default gen_random_uuid(),
  uid                text not null,                       -- UID estável (dedup)
  description        text not null,
  amount_cents       bigint not null,                     -- pode ser negativo (estornos)
  currency           text not null default 'EUR',
  transaction_date   date not null,
  posted_date        date,
  category_id        text references categories(id) on delete set null,
  payer_id           text not null references app_users(id),
  kind               text not null check (kind in ('shared','personal')),
  split              jsonb not null default '{"type":"EQUAL"}'::jsonb,
  origin             text not null check (origin in ('manual','import','recurring')),
  status             text not null default 'confirmed' check (status in ('confirmed','pending')),
  owner_id           text not null references app_users(id),
  visible_to_partner boolean not null default false,
  receipt_path       text,
  import_batch_id    uuid,
  created_by         text not null references app_users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz                          -- soft-delete (REQ-DAT-4)
);

-- Deduplicação garantida: nunca a mesma transação (UID) duas vezes (REQ-DAT-1).
-- Parcial para permitir recriar após soft-delete.
create unique index if not exists expenses_uid_unique
  on expenses (uid) where deleted_at is null;

create index if not exists expenses_transaction_date_idx on expenses (transaction_date desc);
create index if not exists expenses_kind_idx on expenses (kind);
create index if not exists expenses_owner_idx on expenses (owner_id);

-- -----------------------------------------------------------------------------
-- Linhas de despesa (split ao nível do item) — REQ-SPL-3 (Fase 2).
-- -----------------------------------------------------------------------------
create table if not exists expense_items (
  id           uuid primary key default gen_random_uuid(),
  expense_id   uuid not null references expenses(id) on delete cascade,
  description  text not null,
  amount_cents bigint not null,
  kind         text not null check (kind in ('shared','personal'))
);

-- -----------------------------------------------------------------------------
-- Acertos (settlements).
-- -----------------------------------------------------------------------------
create table if not exists settlements (
  id           uuid primary key default gen_random_uuid(),
  from_user_id text not null references app_users(id),
  to_user_id   text not null references app_users(id),
  amount_cents bigint not null check (amount_cents > 0),
  currency     text not null default 'EUR',
  date         date not null,
  note         text,
  created_by   text not null references app_users(id),
  created_at   timestamptz not null default now(),
  constraint settlements_distinct_users check (from_user_id <> to_user_id)
);

-- -----------------------------------------------------------------------------
-- Templates de despesas recorrentes — REQ-REC.
-- -----------------------------------------------------------------------------
create table if not exists recurring_templates (
  id            uuid primary key default gen_random_uuid(),
  description   text not null,
  category_id   text references categories(id) on delete set null,
  amount_cents  bigint,                                   -- null = valor variável
  is_variable   boolean not null default false,
  frequency     text not null check (frequency in ('weekly','monthly','yearly','custom')),
  interval_days int,                                      -- para 'custom'
  next_date     date not null,
  end_date      date,
  payer_id      text not null references app_users(id),
  split         jsonb not null default '{"type":"EQUAL"}'::jsonb,
  active        boolean not null default true,
  created_by    text not null references app_users(id),
  created_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Lotes de importação — REQ-IMP-7 (reversível).
-- -----------------------------------------------------------------------------
create table if not exists import_batches (
  id                uuid primary key default gen_random_uuid(),
  source            text not null,
  file_name         text,
  transaction_count int not null default 0,
  duplicate_count   int not null default 0,
  status            text not null default 'completed',
  created_by        text not null references app_users(id),
  created_at        timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Registo de auditoria — REQ-DAT-3.
-- -----------------------------------------------------------------------------
create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  entity      text not null,
  entity_id   text not null,
  action      text not null check (action in ('create','update','delete','restore')),
  actor_id    text references app_users(id),
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Waitlist da landing pública — REQ-LAND-2 (Fase 3). Separada das finanças.
-- -----------------------------------------------------------------------------
create table if not exists waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  name        text,
  consent     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- updated_at automático nas despesas.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists expenses_set_updated_at on expenses;
create trigger expenses_set_updated_at
  before update on expenses
  for each row execute function set_updated_at();

-- =============================================================================
-- Row-Level Security
-- =============================================================================
alter table app_users            enable row level security;
alter table categories           enable row level security;
alter table classification_rules enable row level security;
alter table expenses             enable row level security;
alter table expense_items        enable row level security;
alter table settlements          enable row level security;
alter table recurring_templates  enable row level security;
alter table import_batches       enable row level security;
alter table audit_log            enable row level security;
alter table waitlist             enable row level security;

-- Utilizadores autenticados (app users) veem-se uns aos outros (nome/email).
create policy app_users_select on app_users
  for select using (is_app_user());

-- Categorias e regras: leitura/escrita por qualquer app user.
create policy categories_all on categories
  for all using (is_app_user()) with check (is_app_user());
create policy rules_all on classification_rules
  for all using (is_app_user()) with check (is_app_user());

-- Despesas: partilhadas visíveis a ambos; pessoais só ao dono ou se marcadas
-- visíveis ao parceiro (REQ-PRIV-2).
create policy expenses_select on expenses
  for select using (
    is_app_user() and (
      kind = 'shared'
      or owner_id = current_app_user_id()
      or visible_to_partner = true
    )
  );
create policy expenses_insert on expenses
  for insert with check (is_app_user());
create policy expenses_update on expenses
  for update using (is_app_user()) with check (is_app_user());

create policy expense_items_all on expense_items
  for all using (is_app_user()) with check (is_app_user());

-- Acertos, recorrentes, imports, auditoria: app users.
create policy settlements_all on settlements
  for all using (is_app_user()) with check (is_app_user());
create policy recurring_all on recurring_templates
  for all using (is_app_user()) with check (is_app_user());
create policy imports_all on import_batches
  for all using (is_app_user()) with check (is_app_user());
create policy audit_select on audit_log
  for select using (is_app_user());

-- Waitlist: inserção pública (landing) com consentimento; leitura só app users.
create policy waitlist_insert on waitlist
  for insert with check (consent = true);
create policy waitlist_select on waitlist
  for select using (is_app_user());
