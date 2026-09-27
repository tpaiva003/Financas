-- 0025 Quota do ambiente em cada bem: a casa comprada a meias.
--
-- O PROBLEMA. Um bem contava sempre por inteiro. Quem compra uma casa a meias
-- via 300 mil de imóvel e 200 mil de dívida, quando o que é seu são 150 e 100.
-- O que torna isto perigoso é que os dois erros se disfarçam um ao outro: o
-- património líquido até dava certo (50 mil), e por isso ninguém desconfiava —
-- enquanto o valor bruto, o total das dívidas, a prestação e o plano do crédito
-- mentiam todos ao dobro.
--
-- `ownership_pct` é a fatia que conta para este ambiente. NULL = tudo, que é o
-- que a app fazia até aqui: **nenhum património já mostrado muda** com esta
-- migração.
--
-- A quota faz sempre e só uma coisa: multiplica o valor. Sem exceções
-- escondidas. `co_owner_member_id` é para o registo — diz quem tem o resto,
-- quando é alguém deste ambiente — e **não mexe na conta**. Serve para a app
-- poder avisar que, se as duas metades estão as duas cá dentro, provavelmente a
-- quota devia ser 100%; decidir isso sozinha seria a app a mudar um número de
-- dinheiro por dedução própria.

alter table assets
  add column if not exists ownership_pct numeric,
  add column if not exists co_owner_member_id text references members(id) on delete set null;

comment on column assets.ownership_pct is
  'Que fatia deste bem conta para este ambiente, em percentagem. NULL = tudo. Multiplica o valor, o custo e (nas dívidas) a prestação e o plano.';
comment on column assets.co_owner_member_id is
  'Quem tem o resto, quando é alguém deste ambiente. Só para o registo: não entra em conta nenhuma.';

create index if not exists assets_co_owner_idx on assets (co_owner_member_id);
