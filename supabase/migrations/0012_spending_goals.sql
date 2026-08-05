-- 0012 — Metas de despesa por mês.
--
-- Uma meta é um tecto mensal: por categoria (ex.: supermercado 350 €) ou para o
-- ambiente inteiro (category_id nulo). Serve para o relatório dizer "vais em X
-- de Y", em vez de só mostrar quanto se gastou.

create table if not exists spending_goals (
  id           text primary key,
  space_id     text not null references spaces(id) on delete cascade,
  -- Nulo = meta do ambiente inteiro.
  category_id  text references categories(id) on delete cascade,
  amount_cents int not null check (amount_cents > 0),
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Uma meta por categoria (e uma só para o total). Em Postgres dois NULL são
-- distintos, por isso o coalesce é o que garante a meta total única.
create unique index if not exists spending_goals_unique
  on spending_goals (space_id, coalesce(category_id, '__total__'));

alter table spending_goals enable row level security;
drop policy if exists spending_goals_all on spending_goals;
create policy spending_goals_all on spending_goals
  for all using (is_app_user()) with check (is_app_user());
