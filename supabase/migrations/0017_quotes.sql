-- 0017 Cotações guardadas.
--
-- Até aqui o preço atual de um investimento era escrito à mão. Passa a poder
-- ser buscado, e o que se busca fica guardado: um histórico diário por símbolo.
--
-- Guardar em vez de perguntar sempre serve três coisas. A página deixa de
-- depender de uma chamada externa para desenhar (se a fonte estiver em baixo,
-- mostra-se a última que se sabe, com a data). A fonte não leva com um pedido
-- por visita. E, sobretudo, a comparação com o índice precisa do **histórico**,
-- não do preço de hoje: sem as cotações das datas dos reforços não há forma de
-- simular o que teria acontecido se o mesmo dinheiro tivesse ido para o índice.
--
-- A tabela não tem space_id de propósito: a cotação do S&P 500 no dia 3 é a
-- mesma para toda a gente. É um cache partilhado de factos públicos, não dados
-- de ninguém. Por isso a leitura é aberta a qualquer utilizador autenticado e
-- não há aqui nada que separar por ambiente.

create table if not exists quotes (
  symbol      text not null,
  quote_date  date not null,
  close_cents bigint not null,
  fetched_at  timestamptz not null default now(),
  primary key (symbol, quote_date)
);

create index if not exists quotes_symbol_idx on quotes (symbol, quote_date desc);

alter table quotes enable row level security;
drop policy if exists quotes_all on quotes;
create policy quotes_all on quotes
  for all using (is_app_user()) with check (is_app_user());

-- Que série de cotações segue este investimento. Sem símbolo, o preço continua
-- a ser escrito à mão, que é o que já acontecia.
alter table assets add column if not exists symbol text;
