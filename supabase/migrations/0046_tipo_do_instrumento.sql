-- 0046 Ação ou fundo: o que cada investimento é.
--
-- O QUE ISTO RESOLVE. A carteira sabe a que setores está exposta e não sabe uma
-- coisa mais simples do que isso: quanto é escolha de empresas e quanto é
-- mercado inteiro. São duas maneiras de investir com riscos diferentes, e a
-- pergunta "as minhas escolhas estão a bater o que eu teria sem escolher nada?"
-- não tinha resposta em lado nenhum — mesmo com as duas coisas lado a lado na
-- mesma lista.
--
-- O TIPO VEM DA FONTE E JÁ VINHA. O `quoteType` do Yahoo (`EQUITY`, `ETF`,
-- `MUTUALFUND`, `INDEX`) chega no módulo `price`, que a app já pedia para saber
-- o preço e a moeda. Estava a ser deitado fora. Não custa um pedido novo: custa
-- ler o que já lá está.
--
-- POR ISSO É QUE NÃO SE ADIVINHA. As duas adivinhas óbvias erram as duas: pelo
-- nome ("ETF" no título) falha nos fundos que não o dizem, e pela ausência de
-- setor falha nos ETF setoriais, que têm setor. Um investimento mal arrumado
-- num gráfico de exposição é pior do que um investimento por arrumar: o
-- segundo aparece como lacuna, o primeiro passa por conta feita.
--
-- EM BRUTO, COMO O SETOR. A tradução para português vive no código
-- (`tipoPorExtenso`). Um tipo que a fonte estreie chega ao ecrã como está em
-- vez de cair calado numa fatia onde ninguém dá por ele.
--
-- O QUE ALGUÉM ESCREVER À MÃO GANHA. Como no setor, a consulta automática só
-- preenche o que está vazio. É o invariante das entradas manuais.

alter table assets
  add column if not exists instrumento text;

comment on column assets.instrumento is
  'Ação, fundo ou outra coisa, como a fonte lhe chama (EQUITY, ETF, MUTUALFUND...). Vem do quoteType do Yahoo, que já vinha no pedido do preço. A tradução vive no código; o que for escrito à mão nunca é reescrito.';
