-- =============================================================================
-- Finanças — migração 0003: Multi-ambiente ("spaces")
--
-- Um AMBIENTE (space) tem PARTICIPANTES (members), à semelhança do Tricount:
-- nem todos os participantes precisam de conta de login. As contas de login
-- continuam em `app_users`; um participante pode estar ligado a uma conta
-- (linked_user_id) para essa pessoa ver o ambiente.
--
-- Despesas e acertos passam a pertencer a um ambiente. O "Casa" atual torna-se
-- o primeiro ambiente, e os participantes 'tiago'/'clara' mantêm os mesmos ids
-- para não mexer nos dados existentes (payer_id/owner_id).
-- =============================================================================

create table if not exists spaces (
  id         text primary key,
  name       text not null,
  created_by text references app_users(id),
  created_at timestamptz not null default now()
);

insert into spaces (id, name, created_by) values ('casa', 'Casa', 'tiago')
on conflict (id) do nothing;

create table if not exists members (
  id             text primary key,
  space_id       text not null references spaces(id) on delete cascade,
  name           text not null,
  linked_user_id text references app_users(id),
  email          text,
  created_at     timestamptz not null default now()
);

-- Participantes do "Casa" = os dois utilizadores (ids iguais aos existentes).
insert into members (id, space_id, name, linked_user_id, email)
select u.id, 'casa', u.name, u.id, u.email from app_users u
on conflict (id) do nothing;

create index if not exists members_space_idx on members(space_id);
create index if not exists members_user_idx on members(linked_user_id);

-- ---- expenses: pertence a um ambiente; payer/owner passam a referir members.
alter table expenses add column if not exists space_id text references spaces(id) default 'casa';
update expenses set space_id = 'casa' where space_id is null;
alter table expenses alter column space_id set not null;
create index if not exists expenses_space_idx on expenses(space_id);

-- ---- settlements: idem.
alter table settlements add column if not exists space_id text references spaces(id) default 'casa';
update settlements set space_id = 'casa' where space_id is null;
alter table settlements alter column space_id set not null;
create index if not exists settlements_space_idx on settlements(space_id);

-- Repontar FKs de payer_id/owner_id e from/to_user_id de app_users -> members
-- (sem depender dos nomes auto-gerados; created_by continua a referir app_users).
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass::text as tbl
    from pg_constraint c
    where c.contype = 'f' and c.confrelid = 'app_users'::regclass
      and c.conrelid = 'expenses'::regclass
      and (select attname from pg_attribute where attrelid = c.conrelid and attnum = c.conkey[1])
          in ('payer_id', 'owner_id')
  loop execute format('alter table %s drop constraint %I', r.tbl, r.conname); end loop;

  for r in
    select c.conname, c.conrelid::regclass::text as tbl
    from pg_constraint c
    where c.contype = 'f' and c.confrelid = 'app_users'::regclass
      and c.conrelid = 'settlements'::regclass
      and (select attname from pg_attribute where attrelid = c.conrelid and attnum = c.conkey[1])
          in ('from_user_id', 'to_user_id')
  loop execute format('alter table %s drop constraint %I', r.tbl, r.conname); end loop;
end $$;

alter table expenses
  add constraint expenses_payer_member_fk foreign key (payer_id) references members(id),
  add constraint expenses_owner_member_fk foreign key (owner_id) references members(id);

alter table settlements
  add constraint settlements_from_member_fk foreign key (from_user_id) references members(id),
  add constraint settlements_to_member_fk foreign key (to_user_id) references members(id);

-- RLS (por agora, qualquer utilizador autenticado da app; refinar por membership
-- quando o login multi-conta estiver ligado).
alter table spaces enable row level security;
alter table members enable row level security;
drop policy if exists spaces_all on spaces;
create policy spaces_all on spaces for all using (is_app_user()) with check (is_app_user());
drop policy if exists members_all on members;
create policy members_all on members for all using (is_app_user()) with check (is_app_user());
