-- 0032 Pedidos de ajuda: o que um utilizador escreve e o que lhe é respondido.
--
-- DUAS TABELAS E NÃO UMA COLUNA DE TEXTO. Um pedido é uma conversa que vai e
-- vem durante dias, e cada resposta tem autor e hora. Um campo `notas` só sabe
-- guardar o último estado do que alguém escreveu, e é o que já acontece nas
-- mensagens da landing — serve lá porque aquilo não é uma conversa.
--
-- `internal` É A COLUNA MAIS PERIGOSA DESTE FICHEIRO. Uma nota interna é o que
-- se escreve para quem trata do assunto e nunca para quem perguntou. Se
-- escorregar para o lado errado não há como desfazer: já foi lida. O código lê
-- as duas camadas por FUNÇÕES DIFERENTES, e a que serve o utilizador não sabe
-- filtrar — não recebe as internas de todo. Uma bandeira `incluirInternas`
-- seria a mesma coisa até ao dia em que alguém a passasse ao contrário.
--
-- O `space_id` FICA, mesmo sendo o pedido de uma pessoa e não de um ambiente.
-- Serve para saber de que conta veio sem ter de perguntar, e para o pedido
-- desaparecer com o ambiente quando alguém apaga a conta.
--
-- QUEM VÊ. O autor e o administrador, e mais ninguém — nem os outros
-- participantes do mesmo ambiente. Um pedido de ajuda leva lá dentro o que a
-- pessoa quiser escrever, incluindo coisas que ela não diria à frente de quem
-- divide as despesas com ela.

create table if not exists tickets (
  id          text primary key,
  space_id    text not null references spaces(id) on delete cascade,
  created_by  text not null references app_users(id),
  subject     text not null,
  -- novo | a-tratar | a-aguardar | resolvido | fechado
  status      text not null default 'novo',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists ticket_messages (
  id          text primary key,
  ticket_id   text not null references tickets(id) on delete cascade,
  author_id   text not null references app_users(id),
  body        text not null,
  -- Ver o cabeçalho. `false` por omissão de propósito: o valor perigoso é o
  -- que tem de ser escrito à mão, nunca o que se ganha por esquecimento.
  internal    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists tickets_space_idx on tickets (space_id);
create index if not exists tickets_author_idx on tickets (created_by);
create index if not exists tickets_status_idx on tickets (status);
create index if not exists ticket_messages_ticket_idx on ticket_messages (ticket_id, created_at);

comment on table tickets is
  'Pedidos de ajuda abertos pelos utilizadores. Visíveis ao autor e ao administrador, e a mais ninguém.';
comment on column ticket_messages.internal is
  'Nota interna: escrita para quem trata do assunto e NUNCA mostrada a quem abriu o pedido. Lida por uma função de leitura própria, separada da que serve o utilizador.';
comment on column tickets.status is
  'novo | a-tratar | a-aguardar | resolvido | fechado. O utilizador vê o estado e a evolução, sem as notas internas.';

alter table tickets enable row level security;
drop policy if exists tickets_all on tickets;
create policy tickets_all on tickets
  for all using (is_app_user()) with check (is_app_user());

alter table ticket_messages enable row level security;
drop policy if exists ticket_messages_all on ticket_messages;
create policy ticket_messages_all on ticket_messages
  for all using (is_app_user()) with check (is_app_user());
