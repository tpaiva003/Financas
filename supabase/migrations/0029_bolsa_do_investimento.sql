-- 0029 A bolsa onde o investimento negoceia.
--
-- O ficheiro da corretora traz uma coluna "Bolsa" ("NDQ", "EAM", "XET") e ela
-- estava a ser deitada fora na importação. É a pista MAIS FIÁVEL que existe para
-- descobrir o símbolo: diz a praça sem se ter de a adivinhar a partir do nome do
-- produto.
--
-- Porque é que isso importa: duas empresas com nomes parecidos em países
-- diferentes são a forma mais fácil de acertar no ticker errado — e um ticker
-- que existe mas é de outra empresa devolve um preço plausível todos os dias,
-- para sempre, sem ninguém desconfiar. A praça desempata de graça.
--
-- Serve também para filtrar a carteira por bolsa, que numa lista de cinquenta
-- produtos é a diferença entre encontrar um e percorrer tudo.

alter table assets
  add column if not exists exchange text;

comment on column assets.exchange is
  'A bolsa como a corretora a escreve ("NDQ", "EAM"). Vem do ficheiro importado. É a pista mais fiável para o símbolo, e serve para filtrar a carteira.';
