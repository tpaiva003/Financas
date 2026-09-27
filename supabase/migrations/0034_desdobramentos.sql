-- 0034 Desdobramentos (splits): quando uma unidade passa a ser várias.
--
-- O QUE ISTO RESOLVE. Uma corretora regista um desdobramento como uma VENDA e
-- uma COMPRA no mesmo dia, pelo mesmo dinheiro: saem 5 unidades, entram 100, e
-- da conta não sai nem entra um cêntimo. A app lia isso como dois negócios a
-- sério, e daí saía tudo o resto: uma mais-valia realizada que nunca existiu, um
-- "investido" com dinheiro que nunca saiu do banco, uma TWR de +4969% e — quando
-- a corretora só exportou a perna da venda — uma posição a zero, com o ativo a
-- aparecer como fechado e escondido pelo filtro. Foi assim que a NVIDIA e a
-- Google desapareceram de uma carteira que continuava a tê-las.
--
-- UMA TABELA À PARTE, E NÃO UMA CORREÇÃO DOS MOVIMENTOS. Reescrever as linhas
-- que a corretora deu perde o que ela disse, e no dia em que o fator estiver
-- errado já não há como voltar atrás. O movimento fica como foi registado; o que
-- se guarda aqui é a lente por onde se lê.
--
-- O `ratio` É UM NÚMERO SÓ: quantas unidades novas por cada unidade antiga. 20
-- num 20:1; um agrupamento 1:10 é 0,1. Guardar isto como dois campos
-- (antes/depois) parecia mais legível e dava duas formas de escrever a mesma
-- coisa — e a divisão acabava feita à mão em cada sítio que precisasse dela.
--
-- `numeric` E NÃO `double precision`. Um agrupamento de 1:3 é uma dízima
-- infinita, e um erro de vírgula flutuante numa contagem de unidades acaba numa
-- posição de "99,999999 unidades" no ecrã de alguém.
--
-- O `space_id` VAI NA TABELA mesmo havendo o `asset_id`: é o `space_id` que o
-- código passa em cada consulta que faz o isolamento entre ambientes nesta app,
-- porque tudo corre com a chave de serviço, que ignora o RLS. Um método que
-- procure por id sem o filtrar é uma falha de segurança, não um descuido.

create table if not exists asset_splits (
  id          text primary key,
  space_id    text not null references spaces(id) on delete cascade,
  asset_id    text not null references assets(id) on delete cascade,
  -- A partir deste dia (inclusive) já vale a unidade nova: os movimentos do
  -- próprio dia vêm da corretora já na unidade nova.
  split_date  date not null,
  ratio       numeric not null check (ratio > 0),
  notes       text,
  created_by  text,
  created_at  timestamptz not null default now()
);

create index if not exists asset_splits_asset_idx on asset_splits (asset_id, split_date);
create index if not exists asset_splits_space_idx on asset_splits (space_id);

-- O mesmo ativo não desdobra duas vezes no mesmo dia. Sem isto, carregar duas
-- vezes no botão de confirmar dava um fator ao quadrado — e uma posição vinte
-- vezes maior do que devia, com ar de boa notícia.
create unique index if not exists asset_splits_unico
  on asset_splits (asset_id, split_date);

comment on table asset_splits is
  'Desdobramentos e agrupamentos. Não são negócios: são uma mudança de unidade de medida, aplicada às unidades de tudo o que veio antes. O dinheiro nunca muda.';
comment on column asset_splits.ratio is
  'Unidades novas por cada unidade antiga: 20 num 20:1, 0.1 num agrupamento 1:10.';

alter table asset_splits enable row level security;
drop policy if exists asset_splits_all on asset_splits;
create policy asset_splits_all on asset_splits
  for all using (is_app_user()) with check (is_app_user());
