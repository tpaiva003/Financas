-- 0006 — Fecho de período (acerto) com colapso visual.
-- settled_at marca despesas que pertencem a um período já "fechado" (pago ou
-- transitado). É puramente visual/organizativo: o cálculo do saldo continua a
-- considerar TODAS as despesas confirmadas (o saldo permanece explicável).

alter table expenses
  add column if not exists settled_at timestamptz;

create index if not exists expenses_settled_idx on expenses (space_id, settled_at);
