-- 0011 — Templates de bancos e lembretes de importação.
--
-- Templates: quando alguém importa um banco que ainda não conhecíamos e confirma
-- que os dados saíram certos, guardamos o MAPEAMENTO das colunas. O próximo
-- ficheiro com a mesma estrutura é reconhecido automaticamente, para toda a
-- gente. Guardamos só nomes de colunas e índices — nunca valores nem montantes.

create table if not exists import_templates (
  id           text primary key,
  -- Hash dos nomes das colunas do cabeçalho: identifica a estrutura do banco.
  fingerprint  text not null unique,
  label        text not null,             -- ex.: "Millennium (conta)"
  header       jsonb not null default '[]'::jsonb,  -- nomes das colunas
  mapping      jsonb not null,            -- ColumnMapping confirmado
  uses         int  not null default 0,   -- quantas vezes já serviu
  created_by   text,
  created_at   timestamptz not null default now()
);

-- Lembretes: por ambiente e banco, com que frequência se deve importar.
create table if not exists import_reminders (
  id          text primary key,
  space_id    text not null references spaces(id) on delete cascade,
  source      text not null,
  label       text,
  frequency   text not null default 'monthly',  -- weekly | monthly | quarterly
  active      boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now(),
  unique (space_id, source)
);

-- Última data de transação de cada lote: é a partir daqui que se sugere
-- "importar desde", sem ter de varrer todas as despesas.
alter table import_batches
  add column if not exists last_transaction_date date;

alter table import_templates enable row level security;
drop policy if exists import_templates_all on import_templates;
create policy import_templates_all on import_templates
  for all using (is_app_user()) with check (is_app_user());

alter table import_reminders enable row level security;
drop policy if exists import_reminders_all on import_reminders;
create policy import_reminders_all on import_reminders
  for all using (is_app_user()) with check (is_app_user());
