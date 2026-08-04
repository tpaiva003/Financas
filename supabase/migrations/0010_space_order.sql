-- 0010 — Ordem dos ambientes escolhida pelo utilizador.
-- Sem isto a ordem era a de criação, que deixa de fazer sentido à medida que se
-- juntam ambientes (o mais usado deve poder ficar à frente).

alter table spaces
  add column if not exists position int not null default 0;

create index if not exists spaces_position_idx on spaces (position, created_at);
