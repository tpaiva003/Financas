-- 0027 Histórico do património: uma fotografia por dia.
--
-- PORQUE É QUE ISTO PRECISA DE UMA TABELA. O património da app é uma fotografia:
-- cada bem tem o valor de hoje e mais nada. O passado não se reconstrói — o
-- depósito que hoje tem 12 mil não sabe que teve 8 mil no ano passado, e a casa
-- registada em 2019 não guardou o que valia então. As despesas dão-se a
-- reconstruir porque são movimentos datados; um saldo não.
--
-- Por isso o histórico COMEÇA VAZIO e enche-se para a frente. Não há nada
-- retroativo aqui, e é melhor dizê-lo do que desenhar uma linha inventada até ao
-- princípio do ano.
--
-- UMA POR DIA E POR AMBIENTE. O índice único é o que impede o gráfico de ganhar
-- dois pontos sobrepostos no mesmo dia, com uma variação de zero pelo meio que se
-- lê como um dia parado. Quem escreve faz upsert: a última do dia manda.
--
-- `breakdown` guarda o valor por tipo de bem no momento da fotografia, para se
-- poder ver de onde veio a variação. É `jsonb` e não colunas porque os tipos de
-- bem mudam com o tempo, e uma coluna por tipo obrigava a uma migração de cada
-- vez que aparecesse um. Quem o lê valida-o — o Postgres devolve o que lá
-- estiver, escrito por esta versão da app ou por outra qualquer.

create table if not exists net_worth_snapshots (
  id            text primary key,
  space_id      text not null references spaces(id) on delete cascade,
  on_date       date not null,
  assets_cents  bigint not null,
  debts_cents   bigint not null,
  net_cents     bigint not null,
  breakdown     jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists net_worth_snapshots_space_idx
  on net_worth_snapshots (space_id, on_date);

create unique index if not exists net_worth_snapshots_space_day_idx
  on net_worth_snapshots (space_id, on_date);

comment on table net_worth_snapshots is
  'Uma fotografia do património por dia e por ambiente. Enche-se para a frente: o passado do património não se reconstrói.';
comment on column net_worth_snapshots.net_cents is
  'Derivado de assets_cents - debts_cents. Guardado por conveniência; quem lê recalcula.';
comment on column net_worth_snapshots.breakdown is
  'Valor por tipo de bem no momento da fotografia. jsonb: quem o lê valida-o.';

alter table net_worth_snapshots enable row level security;
drop policy if exists net_worth_snapshots_all on net_worth_snapshots;
create policy net_worth_snapshots_all on net_worth_snapshots
  for all using (is_app_user()) with check (is_app_user());
