-- 0005 — Categorias por ambiente.
-- As categorias podem agora pertencer a um ambiente (space_id). As categorias
-- "padrão" (space_id NULL) continuam disponíveis em todos os ambientes; cada
-- ambiente pode acrescentar as suas (ex.: Casamento, Férias na Casa).

alter table categories
  add column if not exists space_id text references spaces(id) on delete cascade;

create index if not exists categories_space_idx on categories (space_id);
