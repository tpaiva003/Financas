-- 0007 — Despesas recorrentes (REQ-REC).
-- Templates que geram despesas na data prevista. Valor fixo (renda) ou variável
-- (luz/água/gás): as variáveis são geradas em estado 'pending' e só entram no
-- saldo depois de o utilizador confirmar o valor real (REQ-REC-2).

-- A tabela original (0001) era anterior ao modelo de ambientes (sem space_id,
-- com is_variable/active). Estava vazia e sem uso no código — recriamos limpa.
drop table if exists recurring_templates cascade;

create table if not exists recurring_templates (
  id           text primary key,
  space_id     text not null references spaces(id) on delete cascade,
  description  text not null,
  category_id  text references categories(id) on delete set null,
  payer_id     text not null references members(id),
  kind         text not null default 'shared',
  split        jsonb not null default '{"type":"EQUAL"}'::jsonb,
  amount_cents bigint,                              -- null/0 para variável sem estimativa
  value_type   text not null default 'fixed',       -- 'fixed' | 'variable'
  frequency    text not null default 'monthly',     -- 'weekly' | 'monthly' | 'yearly'
  next_date    date not null,
  end_date     date,
  status       text not null default 'active',       -- 'active' | 'paused'
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists recurring_space_idx
  on recurring_templates (space_id, status, next_date);

-- Liga cada despesa gerada ao seu template (idempotência da geração).
alter table expenses
  add column if not exists recurring_id text references recurring_templates(id) on delete set null;

-- Impede gerar duas vezes a mesma ocorrência (mesmo template + data).
create unique index if not exists expenses_recurring_occurrence_uidx
  on expenses (recurring_id, transaction_date)
  where recurring_id is not null;

alter table recurring_templates enable row level security;
drop policy if exists recurring_all on recurring_templates;
create policy recurring_all on recurring_templates
  for all using (is_app_user()) with check (is_app_user());
