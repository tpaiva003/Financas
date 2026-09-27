-- 0033 Deitar fora as cotações de Londres que foram lidas em pence como libras.
--
-- O QUE ACONTECEU. O Yahoo devolve `GBp` — com o `p` minúsculo — para os
-- instrumentos cotados em pence, e `GBP` para os cotados em libras. São duas
-- moedas com um fator de cem entre elas e a única coisa que as distingue é a
-- caixa de uma letra. O leitor fazia `.toUpperCase()` antes de olhar, o que
-- transformava uma na outra: um ETF a 9150 pence (91,50 £) ficou gravado como
-- 9150 libras, e uma posição de mil e quinhentos euros aparecia com cento e
-- quarenta e nove mil.
--
-- PORQUE É QUE CORRIGIR O CÓDIGO NÃO CHEGA. As cotações são uma cache com
-- histórico. As linhas já gravadas continuam cem vezes acima, e a app só vai
-- buscar dados novos quando a série está velha — os fechos antigos ficavam lá
-- para sempre, a estragar a rentabilidade e o histórico de património muito
-- depois de o leitor estar corrigido. E, pior, a atualização automática
-- reescrevia por cima do preço que alguém tinha corrigido à mão, o que se vê
-- como "a app não grava a minha edição".
--
-- PORQUE É QUE APAGAR É SEGURO. Isto é uma cache derivada de uma fonte
-- pública: nada aqui é dado de ninguém, e tudo isto se vai buscar outra vez
-- sozinho no primeiro carregamento da página. É a única tabela desta app de
-- que isso se pode dizer.
--
-- PORQUÊ SÓ `.uk`. É a praça em pence que esta app usa. Apagar o resto seria
-- deitar fora dez anos de fechos corretos para nada.

-- A moeda vive numa coluna da própria tabela (0019), por isso uma limpeza só
-- chega às duas coisas.
delete from quotes where symbol like '%.uk';

-- O preço por unidade gravado nos investimentos de Londres veio da mesma
-- leitura, e por isso está igualmente cem vezes acima. Fica a nulo para a
-- próxima atualização o escrever certo: um preço a nulo diz "não sei", e a app
-- sabe mostrar isso — um preço cem vezes errado diz "sei", e ninguém desconfia.
update assets
   set unit_price_cents = null
 where kind = 'investimento'
   and symbol is not null
   and lower(symbol) like '%.uk';
