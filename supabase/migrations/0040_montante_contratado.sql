-- 0040 O montante que se contratou, para o capital em dívida deixar de ser um palpite.
--
-- O QUE ISTO RESOLVE. O formulário das dívidas pedia "quanto falta pagar" — um
-- número que ninguém tem de cabeça e que obriga a ir ao mapa de
-- responsabilidades do banco. E é o número de que tudo depende a seguir: o
-- património líquido, o plano de amortização, o líquido do imóvel. Quem o
-- escreve por alto fica com a app inteira por alto.
--
-- O CONTRATO, ESSE, SABE-SE. O montante que se pediu, o dia em que começou, a
-- taxa e o prazo estão na escritura, são fixos e não mudam com o tempo. A partir
-- deles o capital em dívida de hoje é uma conta — a mesma que o banco faz — e
-- não uma estimativa de cabeça. Ver `credito-contrato.ts`.
--
-- O NOME NÃO É `original_amount_cents`, E ISSO É DE PROPÓSITO. Essa coluna já
-- existe em `asset_trades` e quer dizer outra coisa: o montante de um movimento
-- na moeda original. Duas colunas com o mesmo nome e significados diferentes é
-- uma armadilha à espera de quem escrever a consulta seguinte de memória.
--
-- O `value_cents` CONTINUA A MANDAR, e é de propósito. Esta coluna serve para
-- **sugerir** o que falta pagar, não para o substituir: o cálculo não sabe de
-- amortizações antecipadas, de meses de carência nem de comissões, e o valor que
-- o banco dá é sempre melhor do que o que se simula. Escrever por cima do que
-- alguém registou seria a app a corrigir dinheiro por dedução própria.

alter table assets
  add column if not exists contracted_amount_cents bigint;

comment on column assets.contracted_amount_cents is
  'O montante contratado do crédito, em cêntimos. NÃO é o que falta pagar — esse é o value_cents. Serve para calcular o capital em dívida a partir do contrato, quando ninguém o souber de cabeça.';
