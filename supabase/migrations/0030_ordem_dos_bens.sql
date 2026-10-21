-- 0030 Ordem escolhida à mão para os bens.
--
-- A lista vinha por data de criação, que é a ordem por que as coisas foram
-- registadas — e essa não é a ordem por que se olha para elas. Numa carteira
-- importada de uma corretora, a ordem de criação é a ordem do ficheiro: não quer
-- dizer nada.
--
-- `sort_order` é NULL em tudo o que já existe, e nesse caso continua a mandar a
-- data de criação: **nenhuma lista já vista muda** com esta migração. Só passa a
-- contar depois de alguém mexer.

alter table assets
  add column if not exists sort_order integer;

create index if not exists assets_space_order_idx on assets (space_id, sort_order);

comment on column assets.sort_order is
  'Ordem escolhida à mão dentro do tipo de bem. NULL = ainda não foi mexida, e manda a data de criação.';
