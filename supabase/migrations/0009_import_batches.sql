-- 0009 — Importação de extratos: lotes registados e reversíveis (REQ-IMP-7).

-- A tabela original (0001) era anterior ao modelo de ambientes: sem space_id e
-- com id uuid (incompatível com os ids "imp_…" da app). Estava vazia e sem
-- referências, por isso é recriada limpa, tal como se fez em 0007.
alter table expenses drop column if exists import_batch_id;
drop table if exists import_batches cascade;

create table if not exists import_batches (
  id              text primary key,
  space_id        text not null references spaces(id) on delete cascade,
  source          text not null,             -- ex.: "activo", "bankinter"
  file_name       text,
  row_count       int  not null default 0,   -- linhas lidas do ficheiro
  imported_count  int  not null default 0,   -- despesas criadas
  duplicate_count int  not null default 0,   -- ignoradas por já existirem
  created_by      text,
  created_at      timestamptz not null default now()
);

create index if not exists import_batches_space_idx
  on import_batches (space_id, created_at desc);

alter table expenses
  add column if not exists import_batch_id text references import_batches(id) on delete set null;

create index if not exists expenses_import_batch_idx
  on expenses (import_batch_id);

alter table import_batches enable row level security;
drop policy if exists import_batches_all on import_batches;
create policy import_batches_all on import_batches
  for all using (is_app_user()) with check (is_app_user());
