-- 0014 Rendimento, juros dos ativos e amortização das dívidas.
--
-- Faltava metade da história: a app sabia para onde o dinheiro ia mas não de
-- onde vinha. Sem isso não há taxa de poupança, que é o indicador que diz se
-- se está a ir a algum lado.

create table if not exists income (
  id            text primary key,
  space_id      text not null references spaces(id) on delete cascade,
  -- salario | extra | juros | dividendos | renda | outro
  kind          text not null default 'salario',
  description   text not null,
  -- Valor LÍQUIDO recebido. É o que se pode gastar, e é sobre isso que a taxa
  -- de poupança faz sentido.
  amount_cents  bigint not null,
  date          date not null,
  /** Recebido todos os meses (ordenado). Serve para projeções. */
  recurring     boolean not null default false,
  notes         text,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists income_space_date_idx on income (space_id, date desc);

alter table income enable row level security;
drop policy if exists income_all on income;
create policy income_all on income
  for all using (is_app_user()) with check (is_app_user());

-- Ativos que rendem juros, e dívidas com plano de amortização.
alter table assets
  add column if not exists interest_rate_pct numeric,      -- taxa anual, ex. 3.25
  add column if not exists monthly_payment_cents bigint,   -- prestação (dívidas)
  add column if not exists term_months int,                -- prazo que falta
  add column if not exists rate_kind text;                 -- fixa | variavel
