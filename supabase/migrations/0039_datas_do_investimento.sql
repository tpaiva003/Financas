-- 0039 Datas que valem um aviso: resultados, dividendo, data-ex.
--
-- O QUE ISTO RESOLVE. As datas já vinham da fonte e apareciam no ecrã da
-- avaliação — e desapareciam com ele. Para avisar que uma se aproxima é preciso
-- sabê-las **sem ir à fonte**: um aviso que só existe enquanto alguém está a
-- olhar para a empresa não avisa nada, porque quem está a olhar já sabe.
--
-- FICAM NO BEM E NÃO NUMA TABELA À PARTE. São três datas por investimento, uma
-- de cada tipo, e a próxima substitui a anterior — não há historial a guardar.
-- Uma tabela para isto seria uma junção em todas as leituras da carteira para
-- devolver três campos.
--
-- `quotes_dates_at` NÃO É DECORATIVO. Sem ele não se distingue "esta empresa não
-- paga dividendo" de "ainda não fui perguntar", e o ecrã diria a mesma coisa nos
-- dois casos: nada. Com ele, um investimento que nunca foi consultado aparece
-- como tal, e a app sabe quando voltar a ir.
--
-- POR QUE RAZÃO NÃO SE APAGA UMA DATA QUE JÁ PASSOU. Uma apresentação de
-- resultados de há três dias continua a ser informação: explica um salto na
-- cotação que alguém está a olhar hoje. Quem lê decide o que mostrar; a coluna
-- guarda o que a fonte disse.

alter table assets
  add column if not exists next_earnings_date date,
  add column if not exists dividend_date      date,
  add column if not exists ex_dividend_date   date,
  -- Quando é que se foi perguntar. Ver o comentário lá em cima.
  add column if not exists market_dates_at    timestamptz;

comment on column assets.next_earnings_date is
  'Próxima apresentação de resultados, como a fonte a deu. Não se apaga depois de passar: explica um salto na cotação.';
comment on column assets.market_dates_at is
  'Quando é que estas datas foram consultadas. Distingue "não paga dividendo" de "ainda não fui perguntar" — sem isto, o ecrã diz o mesmo nos dois casos.';
