-- 0041 O setor e a indústria de cada investimento.
--
-- O QUE ISTO RESOLVE. A carteira sabe quanto vale cada posição e não sabe a que
-- é que está exposta. Doze empresas diferentes podem ser doze apostas na mesma
-- coisa, e uma carteira que parece diversificada porque tem muitas linhas é o
-- engano mais caro que uma lista de investimentos consegue produzir. Sem o
-- setor gravado, essa pergunta não tinha resposta em lado nenhum.
--
-- FICA NO BEM E NÃO NUMA TABELA DE SETORES. É um texto por investimento que
-- muda de década a década. Uma tabela de referência com chave estrangeira
-- obrigava a uma junção em todas as leituras da carteira para devolver uma
-- palavra, e a inventar uma linha nova sempre que a fonte estreasse um nome.
-- Agrupar por texto é o que esta app já faz com as categorias de despesa.
--
-- `profile_at` NÃO É DECORATIVO. É a mesma razão do `market_dates_at` da 0039:
-- sem ele não se distingue "esta fonte não sabe o setor deste ETF" de "ainda
-- não fui perguntar", e o ecrã dizia a mesma coisa nos dois casos — nada. Com
-- ele, um investimento por consultar aparece como tal e a app sabe a quem
-- voltar. O carimbo só se escreve quando a consulta corre: escrevê-lo numa
-- falha de rede adiava a tentativa seguinte sem nada ter sido perguntado.
--
-- O SETOR QUE ALGUÉM ESCREVEU À MÃO GANHA SEMPRE. Não há aqui coluna nenhuma a
-- distinguir os dois casos porque a app não reclassifica o que já está
-- preenchido — vai à fonte só onde o campo está vazio. É o mesmo invariante das
-- entradas manuais, que nunca são reclassificadas automaticamente.

alter table assets
  add column if not exists sector     text,
  add column if not exists industry   text,
  -- Quando é que se foi perguntar. Ver o comentário lá em cima.
  add column if not exists profile_at timestamptz;

comment on column assets.sector is
  'Setor da empresa, como a fonte lhe chama (em inglês). A tradução para português vive no código, para um nome novo da fonte aparecer como está em vez de desaparecer.';
comment on column assets.industry is
  'Indústria, mais fina do que o setor. Serve para explicar uma concentração que o setor sozinho esconde.';
comment on column assets.profile_at is
  'Quando é que o perfil foi consultado. Distingue "a fonte não sabe" de "ainda não fui perguntar" — sem isto, o ecrã diz o mesmo nos dois casos.';
