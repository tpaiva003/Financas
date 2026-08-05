-- 0013 Património: bens, investimentos e dívidas.
--
-- Um registo por bem. Investimentos guardam quantidade e preços por unidade
-- (compra e atual); tudo o resto guarda só o valor. As dívidas vivem na mesma
-- tabela com kind='divida', para o património líquido sair de uma conta só.
--
-- O preço atual é escrito à mão por agora. Quando houver cotações automáticas,
-- é esta coluna que passa a ser atualizada, sem mexer no resto.

create table if not exists assets (
  id                text primary key,
  space_id          text not null references spaces(id) on delete cascade,
  name              text not null,
  kind              text not null default 'outro',
  -- Investimentos.
  quantity          numeric,
  unit_cost_cents   bigint,
  unit_price_cents  bigint,
  -- Restantes tipos.
  value_cents       bigint,
  purchased_at      date,
  notes             text,
  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists assets_space_idx on assets (space_id);

alter table assets enable row level security;
drop policy if exists assets_all on assets;
create policy assets_all on assets
  for all using (is_app_user()) with check (is_app_user());
