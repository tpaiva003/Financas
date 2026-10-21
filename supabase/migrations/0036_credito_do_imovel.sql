-- 0036 Que bem é que este crédito financia.
--
-- PORQUÊ. Um imóvel de 300 mil com 200 mil por pagar são duas linhas no
-- património que a app não sabia ligar: mostrava o bem de um lado e a dívida do
-- outro, e a pergunta que toda a gente faz — "quanto é que a casa é minha?" —
-- não tinha resposta em ecrã nenhum. O líquido está no total do património,
-- diluído entre tudo o resto.
--
-- O CAMPO VAI NA DÍVIDA e não no imóvel, e a direção importa: um imóvel pode
-- ter mais do que um crédito (o da compra e o das obras), e um crédito financia
-- uma coisa só. Posto no imóvel, obrigava a uma lista; posto na dívida, é um
-- campo e responde às duas situações.
--
-- `on delete set null` E NÃO `cascade`. Apagar o imóvel não pode apagar o
-- crédito: o dinheiro continua a dever-se a alguém depois de a casa mudar de
-- mãos, e uma dívida que desaparece sozinha do património é a pior coisa que
-- esta app podia fazer com um registo.

alter table assets add column if not exists finances_asset_id text
  references assets(id) on delete set null;

create index if not exists assets_finances_idx on assets (finances_asset_id);

comment on column assets.finances_asset_id is
  'Numa dívida: que bem é que ela financia. Serve para mostrar o líquido (bem menos crédito). Fica a nulo se o bem for apagado — a dívida continua a existir.';
