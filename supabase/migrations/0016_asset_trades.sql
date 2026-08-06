-- 0016 Movimentos datados dos investimentos.
--
-- Até aqui uma posição era escrita à mão ("tenho 100 unidades a 92 EUR"), o que
-- diz o que se tem hoje e não diz como lá se chegou. Sem as datas das compras
-- não há forma de calcular o que o dinheiro rendeu, porque ele foi entrando aos
-- poucos e um euro metido o mês passado não é comparável com um euro metido há
-- cinco anos.
--
-- Com estes movimentos, a posição passa a ser CALCULADA. Regra: enquanto um
-- ativo tiver movimentos, mandam eles; as colunas manuais em `assets` ficam
-- intocadas e voltam a valer se os movimentos forem apagados. Nunca se somam
-- aos movimentos, senão quem registou a posição à mão e depois lançou as
-- compras que lhe deram origem ficava com o dobro.
--
-- Câmbio: `amount_cents` é SEMPRE em euros, que é o dinheiro que saiu mesmo da
-- conta e a única base sã para somar tudo. Quando a compra foi noutra moeda,
-- guarda-se também o valor original e a taxa, para o registo ficar auditável.

create table if not exists asset_trades (
  id                    text primary key,
  space_id              text not null references spaces(id) on delete cascade,
  asset_id              text not null references assets(id) on delete cascade,
  trade_date            date not null,
  -- 'compra', 'venda', 'dividendo', 'custo'.
  kind                  text not null default 'compra',
  quantity              numeric,
  unit_price_cents      bigint,
  -- Em euros, sempre.
  amount_cents          bigint not null default 0,
  -- Moeda original, quando não foi euro (ex.: 'USD').
  currency              text,
  original_amount_cents bigint,
  -- Unidades da moeda original por euro (ex.: 1,09 USD por EUR).
  fx_rate               numeric,
  notes                 text,
  created_by            text,
  created_at            timestamptz not null default now()
);

create index if not exists asset_trades_asset_idx on asset_trades (asset_id, trade_date);
create index if not exists asset_trades_space_idx on asset_trades (space_id);

alter table asset_trades enable row level security;
drop policy if exists asset_trades_all on asset_trades;
create policy asset_trades_all on asset_trades
  for all using (is_app_user()) with check (is_app_user());
